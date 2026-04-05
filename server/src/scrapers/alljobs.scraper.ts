/**
 * AllJobs Israel Job Scraper
 * Scrapes job listings from alljobs.co.il
 * Handles Hebrew job listings
 * Rate limit: 100 jobs/hour
 */

import { Page } from 'playwright';
import logger from '../utils/logger';
import { BaseScraper } from './base-scraper';
import { JobSource, ScraperQuery, RawJob, ScraperConfig } from './types';

export class AllJobsScraper extends BaseScraper {
  name = 'AllJobs';
  source = JobSource.ALLJOBS;

  constructor(config: Partial<ScraperConfig> = {}) {
    const defaultConfig: ScraperConfig = {
      enabled: true,
      rateLimit: 100,
      retryAttempts: 3,
      timeout: 30000,
      headless: true,
      ...config,
    };
    super('AllJobs', JobSource.ALLJOBS, defaultConfig);
  }

  /**
   * Scrape AllJobs job listings
   */
  async scrape(query: ScraperQuery): Promise<RawJob[]> {
    const page = await this.getPage();
    const jobs: RawJob[] = [];

    try {
      logger.info(`Scraping AllJobs listings`, { keywords: query.keywords, location: query.location });

      // Build search URL
      const searchUrl = this.buildSearchUrl(query);
      await this.navigateWithRetry(page, searchUrl);

      // Handle popups and consent
      await this.dismissCookieConsent(page);
      await this.closePopups(page);

      // Wait for job listings to load
      await this.waitForSelector(page, '.job-list-item, .job-item, [data-test-id="job-card"]', 5, 10000);

      // Extract job listings
      const maxResults = query.maxResults || 100;
      let loadedCount = 0;

      while (loadedCount < maxResults) {
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

        // Try to load more by scrolling or clicking next
        const hasNextPage = await this.loadMoreJobs(page);
        if (!hasNextPage) break;

        await this.delay(1500);
      }

      logger.info(`AllJobs scrape completed`, { jobsFound: jobs.length });
      return jobs;
    } catch (error) {
      logger.error(`AllJobs scraper error: ${error}`);
      throw error;
    } finally {
      await this.releasePage(page);
    }
  }

  /**
   * Build AllJobs search URL
   */
  private buildSearchUrl(query: ScraperQuery): string {
    const keywords = query.keywords.join(' ');
    let url = `https://alljobs.co.il/search/jobs?q=${encodeURIComponent(keywords)}`;

    if (query.location) {
      url += `&city=${encodeURIComponent(query.location)}`;
    }

    if (query.remote) {
      url += '&remote=true';
    }

    // Experience level
    if (query.experienceLevel) {
      const levelMap: Record<string, string> = {
        entry: 'entry',
        junior: 'entry',
        mid: 'mid',
        senior: 'senior',
        executive: 'executive',
      };
      const level = levelMap[query.experienceLevel.toLowerCase()];
      if (level) {
        url += `&experience=${level}`;
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
      // Try multiple selectors for job cards
      const jobCards = await page.$$('.job-list-item, .job-item, [data-test-id="job-card"], .job-card');

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
      // Get job title
      const titleElement = await card.$('h2, h3, .job-title, .title, a.job-link');
      if (!titleElement) return null;

      const title = await titleElement.textContent();
      if (!title) return null;

      // Get job URL
      let jobUrl = '';
      const linkElement = await card.$('a[href]');
      if (linkElement) {
        jobUrl = await linkElement.getAttribute('href') || '';
      }

      if (!jobUrl) return null;

      // Build full URL if needed
      let sourceUrl = jobUrl;
      if (!sourceUrl.startsWith('http')) {
        sourceUrl = 'https://alljobs.co.il' + (sourceUrl.startsWith('/') ? sourceUrl : '/' + sourceUrl);
      }

      // Get company name
      const companyElement = await card.$('.company-name, .company, [data-test-id="company"]');
      const company = companyElement ? await companyElement.textContent() : 'Unknown';

      // Get location
      const locationElement = await card.$('.location, .job-location, [data-location]');
      const location = locationElement ? await locationElement.textContent() : 'Israel';

      // Determine location type
      let locationType = 'on-site';
      if (location?.toLowerCase().includes('remote')) {
        locationType = 'remote';
      } else if (location?.toLowerCase().includes('hybrid')) {
        locationType = 'hybrid';
      }

      // Get salary if available
      let salary: Record<string, any> | undefined;
      const salaryElement = await card.$('.salary, [data-test-id="salary"]');
      if (salaryElement) {
        const salaryText = await salaryElement.textContent();
        if (salaryText) {
          salary = { raw: salaryText, currency: 'ILS' };
        }
      }

      // Get posted date
      const dateElement = await card.$('.posted-date, .date, time, [data-test-id="posted-date"]');
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
        description: description || 'See full details on AllJobs',
        requirements,
        salary,
        experienceLevel: this.extractExperienceLevel(description),
        postedAt,
        rawData: {
          platform: 'AllJobs',
        },
      };

      return job;
    } catch (error) {
      logger.debug(`Error parsing job card: ${error}`);
      return null;
    }
  }

  /**
   * Load more jobs by clicking next or scrolling
   */
  private async loadMoreJobs(page: Page): Promise<boolean> {
    try {
      // Try clicking "Load More" button
      const loadMoreButton = await page.$('.load-more, button:has-text("Load More"), button:has-text("עוד תוצאות")');
      if (loadMoreButton) {
        await loadMoreButton.click();
        await this.delay(1000);
        return true;
      }

      // Try clicking next page button
      const nextButton = await page.$('a[aria-label*="next"], button[aria-label*="next"]');
      if (nextButton) {
        await nextButton.click();
        await this.waitForSelector(page, '.job-list-item, .job-item', 3, 5000);
        return true;
      }

      // Try scrolling to load more
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
          '.job-description, .description, [data-test-id="job-description"], article',
          (el: any) => el.textContent?.trim() || ''
        );
      } catch (error) {
        logger.debug('Could not extract job description');
      }

      // Extract requirements
      let requirements = '';
      try {
        requirements = await detailPage.$eval(
          '.requirements, .job-requirements, [data-test-id="requirements"]',
          (el: any) => el.textContent?.trim() || ''
        );
      } catch (error) {
        logger.debug('Could not extract requirements');
      }

      // Extract company URL if available
      let companyUrl = '';
      try {
        companyUrl = await detailPage.$eval('a[href*="/company/"], a[data-test-id="company-link"]', (el: any) =>
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

    const text = dateText.toLowerCase();

    // Parse relative dates
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
    if (text.includes('entry') || text.includes('junior') || text.includes('התחלה'))
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
