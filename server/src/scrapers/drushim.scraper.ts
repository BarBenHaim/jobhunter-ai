/**
 * Drushim Job Scraper
 * Scrapes job listings from drushim.co.il
 * Focuses on Hebrew job listings
 * Rate limit: 100 jobs/hour
 */

import { Page } from 'playwright';
import logger from '../utils/logger';
import { BaseScraper } from './base-scraper';
import { JobSource, ScraperQuery, RawJob, ScraperConfig } from './types';

export class DrushimScraper extends BaseScraper {
  name = 'Drushim';
  source = JobSource.DRUSHIM;

  constructor(config: Partial<ScraperConfig> = {}) {
    const defaultConfig: ScraperConfig = {
      enabled: true,
      rateLimit: 100,
      retryAttempts: 3,
      timeout: 30000,
      headless: true,
      ...config,
    };
    super('Drushim', JobSource.DRUSHIM, defaultConfig);
  }

  /**
   * Scrape Drushim job listings
   */
  async scrape(query: ScraperQuery): Promise<RawJob[]> {
    const page = await this.getPage();
    const jobs: RawJob[] = [];

    try {
      logger.info(`Scraping Drushim listings`, { keywords: query.keywords, location: query.location });

      // Build search URL
      const searchUrl = this.buildSearchUrl(query);
      await this.navigateWithRetry(page, searchUrl);

      // Handle consent and popups
      await this.dismissCookieConsent(page);
      await this.closePopups(page);

      // Wait for job listings
      await this.waitForSelector(
        page,
        '.jobs-list > div, .job-item, [data-test-id="job-item"]',
        5,
        10000
      );

      // Extract job listings
      const maxResults = query.maxResults || 100;
      let loadedCount = 0;
      let attempts = 0;
      const maxAttempts = Math.ceil(maxResults / 20);

      while (loadedCount < maxResults && attempts < maxAttempts) {
        // Extract visible jobs
        const newJobs = await this.extractJobCards(page);
        for (const job of newJobs) {
          if (!jobs.find((j) => j.sourceUrl === job.sourceUrl)) {
            jobs.push(job);
            loadedCount++;
            if (loadedCount >= maxResults) break;
          }
        }

        if (loadedCount >= maxResults) break;

        // Load more jobs
        const hasMore = await this.loadMoreJobs(page);
        if (!hasMore) break;

        attempts++;
        await this.delay(1000);
      }

      logger.info(`Drushim scrape completed`, { jobsFound: jobs.length });
      return jobs;
    } catch (error) {
      logger.error(`Drushim scraper error: ${error}`);
      throw error;
    } finally {
      await this.releasePage(page);
    }
  }

  /**
   * Build Drushim search URL
   */
  private buildSearchUrl(query: ScraperQuery): string {
    const keywords = query.keywords.join(' ');
    let url = `https://www.drushim.co.il/work?q=${encodeURIComponent(keywords)}`;

    if (query.location) {
      url += `&city=${encodeURIComponent(query.location)}`;
    }

    if (query.remote) {
      url += '&remote=1';
    }

    // Experience level - Drushim uses different parameter names
    if (query.experienceLevel) {
      const levelMap: Record<string, string> = {
        entry: 'entry_level',
        junior: 'entry_level',
        mid: 'mid_level',
        senior: 'senior_level',
        executive: 'executive_level',
      };
      const level = levelMap[query.experienceLevel.toLowerCase()];
      if (level) {
        url += `&exp_level=${level}`;
      }
    }

    return url;
  }

  /**
   * Extract job cards from page
   */
  private async extractJobCards(page: Page): Promise<RawJob[]> {
    const jobs: RawJob[] = [];

    try {
      // Try multiple selectors for job items
      const jobCards = await page.$$('.jobs-list > div, .job-item, [data-test-id="job-item"], .job-card');

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
      // Get job ID for building URL
      const jobId = await card.getAttribute('data-job-id');

      // Get job title
      const titleElement = await card.$('h2, h3, .job-title, .title, a');
      if (!titleElement) return null;

      const title = await titleElement.textContent();
      if (!title) return null;

      // Get job URL
      let jobUrl = '';
      const linkElement = await card.$('a[href*="/job/"], a[href*="/offer/"]');
      if (linkElement) {
        jobUrl = await linkElement.getAttribute('href') || '';
      }

      if (!jobUrl && jobId) {
        jobUrl = `/offer/${jobId}`;
      }

      if (!jobUrl) return null;

      // Build full URL
      let sourceUrl = jobUrl;
      if (!sourceUrl.startsWith('http')) {
        sourceUrl = 'https://www.drushim.co.il' + (sourceUrl.startsWith('/') ? sourceUrl : '/' + sourceUrl);
      }

      // Get company name
      const companyElement = await card.$('.company-name, .company, strong');
      const company = companyElement ? await companyElement.textContent() : 'Unknown';

      // Get location
      const locationElement = await card.$('.location, .job-location, [data-location]');
      const location = locationElement ? await locationElement.textContent() : 'Israel';

      // Determine location type
      let locationType = 'on-site';
      if (location?.toLowerCase().includes('remote') || location?.includes('עבודה מהבית')) {
        locationType = 'remote';
      } else if (location?.toLowerCase().includes('hybrid') || location?.includes('היברידי')) {
        locationType = 'hybrid';
      }

      // Get salary if available
      let salary: Record<string, any> | undefined;
      const salaryElement = await card.$('.salary, [data-salary]');
      if (salaryElement) {
        const salaryText = await salaryElement.textContent();
        if (salaryText) {
          salary = { raw: salaryText, currency: 'ILS' };
        }
      }

      // Get posted date
      const dateElement = await card.$('.posted-date, .date, time');
      const postedAt = dateElement ? this.parsePostedDate(await dateElement.textContent()) : new Date();

      // Get full job details
      let description = '';
      let requirements = '';
      let companyUrl = '';

      try {
        const jobDetails = await this.getFullJobDetails(page, sourceUrl);
        description = jobDetails.description;
        requirements = jobDetails.requirements;
        companyUrl = jobDetails.companyUrl;
      } catch (error) {
        logger.debug(`Could not fetch full job details: ${error}`);
      }

      const job: RawJob = {
        source: this.source,
        sourceUrl,
        title: title.trim(),
        company: company?.trim() || 'Unknown',
        companyUrl,
        location: location?.trim() || 'Israel',
        locationType,
        description: description || 'See full details on Drushim',
        requirements,
        salary,
        experienceLevel: this.extractExperienceLevel(description),
        postedAt,
        rawData: {
          platform: 'Drushim',
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
   * Load more jobs
   */
  private async loadMoreJobs(page: Page): Promise<boolean> {
    try {
      // Try clicking "Load More" button
      const loadMoreButton = await page.$(
        'button:has-text("עוד משרות"), button:has-text("Load More"), .load-more'
      );
      if (loadMoreButton) {
        await loadMoreButton.click();
        await this.delay(1000);
        return true;
      }

      // Try scrolling
      await this.scrollToLoadMore(page, 1, 500);
      return true;
    } catch (error) {
      logger.debug(`Could not load more jobs: ${error}`);
      return false;
    }
  }

  /**
   * Get full job details from job page
   */
  private async getFullJobDetails(
    page: Page,
    jobUrl: string
  ): Promise<{ description: string; requirements: string; companyUrl: string }> {
    const detailPage = await page.context().newPage();

    try {
      await detailPage.goto(jobUrl, {
        waitUntil: 'networkidle',
        timeout: 15000,
      });

      await this.delay(500);

      // Extract job description
      let description = '';
      try {
        description = await detailPage.$eval(
          '.job-description, .description, [data-test-id="job-description"], .offer-content',
          (el: any) => el.textContent?.trim() || ''
        );
      } catch (error) {
        logger.debug('Could not extract job description');
      }

      // Extract requirements
      let requirements = '';
      try {
        requirements = await detailPage.$eval(
          '.job-requirements, .requirements, [data-test-id="requirements"], .requirements-section',
          (el: any) => el.textContent?.trim() || ''
        );
      } catch (error) {
        logger.debug('Could not extract requirements');
      }

      // Extract company URL
      let companyUrl = '';
      try {
        companyUrl = await detailPage.$eval('a[href*="/company/"], a.company-link', (el: any) =>
          el.getAttribute('href')
        );
      } catch (error) {
        logger.debug('Could not extract company URL');
      }

      return {
        description,
        requirements,
        companyUrl,
      };
    } catch (error) {
      logger.debug(`Error getting full job details: ${error}`);
      return { description: '', requirements: '', companyUrl: '' };
    } finally {
      await detailPage.close();
    }
  }

  /**
   * Parse posted date
   */
  private parsePostedDate(dateText: string | null): Date {
    const now = new Date();

    if (!dateText) return now;

    const text = dateText.toLowerCase().trim();

    // Parse Hebrew relative dates
    if (text.includes('שעה') || text.includes('hour')) {
      const hours = parseInt(text.match(/\d+/)?.[0] || '0');
      return new Date(now.getTime() - hours * 60 * 60 * 1000);
    }
    if (text.includes('יום') || text.includes('day')) {
      const days = parseInt(text.match(/\d+/)?.[0] || '0');
      return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    }
    if (text.includes('שבוע') || text.includes('week')) {
      const weeks = parseInt(text.match(/\d+/)?.[0] || '0');
      return new Date(now.getTime() - weeks * 7 * 24 * 60 * 60 * 1000);
    }
    if (text.includes('חודש') || text.includes('month')) {
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
    if (
      text.includes('entry') ||
      text.includes('junior') ||
      text.includes('התחלה') ||
      text.includes('בתחילת דרך')
    )
      return 'entry';
    if (text.includes('mid') || text.includes('intermediate') || text.includes('בינוני'))
      return 'mid';
    if (text.includes('senior') || text.includes('בכיר')) return 'senior';
    if (text.includes('lead') || text.includes('principal') || text.includes('מנהל'))
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
