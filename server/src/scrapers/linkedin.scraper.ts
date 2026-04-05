/**
 * LinkedIn Job Scraper
 * Scrapes job listings from LinkedIn using authenticated session
 * Rate limit: 50 jobs/hour
 */

import { Page } from 'playwright';
import logger from '../utils/logger';
import { BaseScraper } from './base-scraper';
import { JobSource, ScraperQuery, RawJob, ScraperConfig } from './types';

export class LinkedInScraper extends BaseScraper {
  name = 'LinkedIn';
  source = JobSource.LINKEDIN;

  constructor(config: Partial<ScraperConfig> = {}) {
    const defaultConfig: ScraperConfig = {
      enabled: true,
      rateLimit: 50,
      retryAttempts: 3,
      timeout: 30000,
      headless: true,
      ...config,
    };
    super('LinkedIn', JobSource.LINKEDIN, defaultConfig);
  }

  /**
   * Scrape LinkedIn job listings
   */
  async scrape(query: ScraperQuery): Promise<RawJob[]> {
    const page = await this.getPage();
    const jobs: RawJob[] = [];

    try {
      logger.info(`Scraping LinkedIn jobs`, { keywords: query.keywords, location: query.location });

      // Navigate to LinkedIn jobs search
      const searchUrl = this.buildSearchUrl(query);
      await this.navigateWithRetry(page, searchUrl);

      // Handle any popups or consent dialogs
      await this.dismissCookieConsent(page);
      await this.closePopups(page);

      // Check if we need to login
      const loginRequired = await this.isLoginRequired(page);
      if (loginRequired) {
        logger.warn('LinkedIn login required, skipping scrape');
        return [];
      }

      // Wait for job cards to load
      await this.waitForSelector(page, '.base-card', 5, 10000);

      // Scroll to load more jobs
      const maxResults = query.maxResults || 50;
      let loadedCount = 0;
      let scrolls = 0;
      const maxScrolls = Math.ceil(maxResults / 10);

      while (loadedCount < maxResults && scrolls < maxScrolls) {
        // Extract visible job cards
        const newJobs = await this.extractJobCards(page, query);
        for (const job of newJobs) {
          if (!jobs.find((j) => j.sourceUrl === job.sourceUrl)) {
            jobs.push(job);
            loadedCount++;
            if (loadedCount >= maxResults) break;
          }
        }

        if (loadedCount >= maxResults) break;

        // Scroll to load more
        await this.scrollToLoadMore(page, 1, 1000);
        scrolls++;
      }

      logger.info(`LinkedIn scrape completed`, { jobsFound: jobs.length });
      return jobs;
    } catch (error) {
      logger.error(`LinkedIn scraper error: ${error}`);
      throw error;
    } finally {
      await this.releasePage(page);
    }
  }

  /**
   * Build LinkedIn search URL
   */
  private buildSearchUrl(query: ScraperQuery): string {
    const keywords = query.keywords.join(' ');
    let url = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(keywords)}`;

    if (query.location) {
      url += `&location=${encodeURIComponent(query.location)}`;
    }

    if (query.remote) {
      url += '&f_WT=1'; // Remote jobs filter
    }

    if (query.experienceLevel) {
      const levelMap: Record<string, string> = {
        entry: '1',
        'entry-level': '1',
        junior: '1',
        mid: '2',
        'mid-level': '2',
        senior: '3',
        executive: '4',
      };
      const level = levelMap[query.experienceLevel.toLowerCase()];
      if (level) {
        url += `&f_E=${level}`;
      }
    }

    url += '&sortBy=DD'; // Sort by date
    return url;
  }

  /**
   * Extract job cards from page
   */
  private async extractJobCards(page: Page, query: ScraperQuery): Promise<RawJob[]> {
    const jobs: RawJob[] = [];

    try {
      const jobCards = await page.$$('.base-card');

      for (const card of jobCards) {
        try {
          const job = await this.parseJobCard(page, card);
          if (job) {
            jobs.push(job);
          }
        } catch (error) {
          logger.debug(`Error parsing job card: ${error}`);
          continue;
        }
      }
    } catch (error) {
      logger.warn(`Error extracting job cards: ${error}`);
    }

    return jobs;
  }

  /**
   * Parse individual job card
   */
  private async parseJobCard(page: Page, card: any): Promise<RawJob | null> {
    try {
      // Get job ID from card
      const jobId = await card.getAttribute('data-job-id');
      if (!jobId) return null;

      // Extract basic info from card
      const title = await card.$eval('.base-search-card__title', (el: any) => el.textContent?.trim() || '');
      const company = await card.$eval('.base-search-card__company-name', (el: any) => el.textContent?.trim() || '');
      const locationElement = await card.$('.job-search-card__location');
      const location = locationElement
        ? await locationElement.evaluate((el: any) => el.textContent?.trim() || '')
        : '';

      // Get job URL
      const jobLink = await card.$('a.base-card__full-link');
      const sourceUrl = jobLink ? await jobLink.getAttribute('href') : '';

      if (!title || !company || !sourceUrl) {
        return null;
      }

      // Check for Easy Apply badge
      const easyApplyElement = await card.$('[data-test-icon-duet="easy-apply"]');
      const hasEasyApply = easyApplyElement !== null;

      // Get posted date
      const postedElement = await card.$('span[aria-label*="ago"]');
      const postedText = postedElement ? await postedElement.getAttribute('aria-label') : '';
      const postedAt = this.parseLinkedInDate(postedText);

      // Determine location type
      let locationType = 'on-site';
      if (location.toLowerCase().includes('remote')) {
        locationType = 'remote';
      } else if (location.toLowerCase().includes('hybrid')) {
        locationType = 'hybrid';
      }

      // Get full job details by navigating to job page
      let description = '';
      let requirements = '';
      let companyUrl = '';

      try {
        if (sourceUrl) {
          const { description: desc, requirements: reqs, companyUrl: url } =
            await this.getFullJobDetails(page, sourceUrl, jobId);
          description = desc;
          requirements = reqs;
          companyUrl = url;
        }
      } catch (error) {
        logger.debug(`Could not fetch full job details: ${error}`);
      }

      const job: RawJob = {
        externalId: jobId,
        source: this.source,
        sourceUrl: sourceUrl.split('?')[0], // Remove query params
        title: title.trim(),
        company: company.trim(),
        companyUrl: companyUrl,
        location: location.trim(),
        locationType,
        description: description || 'See full details on LinkedIn',
        requirements,
        experienceLevel: this.extractExperienceLevel(description),
        postedAt,
        rawData: {
          easyApply: hasEasyApply,
          platform: 'LinkedIn',
          jobId,
        },
      };

      return job;
    } catch (error) {
      logger.debug(`Error parsing job card: ${error}`);
      return null;
    }
  }

  /**
   * Get full job details from job page
   */
  private async getFullJobDetails(
    page: Page,
    jobUrl: string,
    jobId: string
  ): Promise<{ description: string; requirements: string; companyUrl: string }> {
    const popup = await page.context().newPage();

    try {
      // Use job ID to load job details via sidebar
      await popup.goto(`https://www.linkedin.com/jobs/view/${jobId}/`, {
        waitUntil: 'networkidle',
        timeout: 15000,
      });

      await this.delay(1000);

      // Extract job description
      let description = '';
      try {
        description = await popup.$eval(
          '.description__text, [data-test-job-description]',
          (el: any) => el.textContent?.trim() || ''
        );
      } catch (error) {
        logger.debug('Could not extract job description');
      }

      // Extract company URL
      let companyUrl = '';
      try {
        companyUrl = await popup.$eval('a[data-test-app-aware-link][href*="/company/"]', (el: any) =>
          el.getAttribute('href')
        );
      } catch (error) {
        logger.debug('Could not extract company URL');
      }

      return {
        description,
        requirements: '', // LinkedIn doesn't have separate requirements section
        companyUrl,
      };
    } catch (error) {
      logger.debug(`Error getting full job details: ${error}`);
      return { description: '', requirements: '', companyUrl: '' };
    } finally {
      await popup.close();
    }
  }

  /**
   * Check if login is required
   */
  private async isLoginRequired(page: Page): Promise<boolean> {
    try {
      const loginButton = await page.$('a[href="/login"]');
      return loginButton !== null;
    } catch {
      return false;
    }
  }

  /**
   * Parse LinkedIn date format
   */
  private parseLinkedInDate(dateText: string): Date {
    if (!dateText) return new Date();

    const now = new Date();
    const text = dateText.toLowerCase();

    // Parse relative dates like "1 day ago", "2 weeks ago"
    if (text.includes('hour')) {
      const hours = parseInt(text.match(/\d+/)?.[0] || '0');
      return new Date(now.getTime() - hours * 60 * 60 * 1000);
    }
    if (text.includes('day')) {
      const days = parseInt(text.match(/\d+/)?.[0] || '0');
      return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    }
    if (text.includes('week')) {
      const weeks = parseInt(text.match(/\d+/)?.[0] || '0');
      return new Date(now.getTime() - weeks * 7 * 24 * 60 * 60 * 1000);
    }
    if (text.includes('month')) {
      const months = parseInt(text.match(/\d+/)?.[0] || '0');
      return new Date(now.getTime() - months * 30 * 24 * 60 * 60 * 1000);
    }

    return now;
  }

  /**
   * Extract experience level from description
   */
  private extractExperienceLevel(description: string): string | undefined {
    if (!description) return undefined;

    const text = description.toLowerCase();
    if (text.includes('entry level') || text.includes('junior')) return 'entry';
    if (text.includes('mid level') || text.includes('intermediate')) return 'mid';
    if (text.includes('senior')) return 'senior';
    if (text.includes('lead') || text.includes('principal') || text.includes('director'))
      return 'executive';

    return undefined;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
