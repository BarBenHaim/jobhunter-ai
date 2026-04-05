/**
 * Wellfound (AngelList) Job Scraper
 * Scrapes startup job listings from wellfound.com
 * Focus on early-stage companies and startups
 * Rate limit: 60 jobs/hour
 */

import { Page } from 'playwright';
import logger from '../utils/logger';
import { BaseScraper } from './base-scraper';
import { JobSource, ScraperQuery, RawJob, ScraperConfig } from './types';

export class WellfoundScraper extends BaseScraper {
  name = 'Wellfound';
  source = JobSource.WELLFOUND;

  constructor(config: Partial<ScraperConfig> = {}) {
    const defaultConfig: ScraperConfig = {
      enabled: true,
      rateLimit: 60,
      retryAttempts: 3,
      timeout: 30000,
      headless: true,
      ...config,
    };
    super('Wellfound', JobSource.WELLFOUND, defaultConfig);
  }

  /**
   * Scrape Wellfound job listings
   */
  async scrape(query: ScraperQuery): Promise<RawJob[]> {
    const page = await this.getPage();
    const jobs: RawJob[] = [];

    try {
      logger.info(`Scraping Wellfound listings`, { keywords: query.keywords, location: query.location });

      // Build search URL
      const searchUrl = this.buildSearchUrl(query);
      await this.navigateWithRetry(page, searchUrl);

      // Handle popups and consent
      await this.dismissCookieConsent(page);
      await this.closePopups(page);

      // Wait for job listings
      await this.waitForSelector(page, '.job-card, [data-testid="job-card"], .startup-job-card', 5, 10000);

      // Extract job listings
      const maxResults = query.maxResults || 60;
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

        // Load more jobs
        const hasMore = await this.loadMoreJobs(page);
        if (!hasMore) break;

        await this.delay(1500);
      }

      logger.info(`Wellfound scrape completed`, { jobsFound: jobs.length });
      return jobs;
    } catch (error) {
      logger.error(`Wellfound scraper error: ${error}`);
      throw error;
    } finally {
      await this.releasePage(page);
    }
  }

  /**
   * Build Wellfound search URL
   */
  private buildSearchUrl(query: ScraperQuery): string {
    const keywords = query.keywords.join(' ');
    let url = `https://wellfound.com/jobs?keywords=${encodeURIComponent(keywords)}`;

    if (query.location) {
      url += `&locationString=${encodeURIComponent(query.location)}`;
    }

    if (query.remote) {
      url += '&remote=true';
    }

    // Experience level
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
        url += `&experienceLevel=${level}`;
      }
    }

    // Wellfound focuses on startups
    url += '&stageInvestmentRange=seed,series_a,series_b,series_c,growth';

    return url;
  }

  /**
   * Extract job cards from page
   */
  private async extractJobCards(page: Page): Promise<RawJob[]> {
    const jobs: RawJob[] = [];

    try {
      const jobCards = await page.$$('.job-card, [data-testid="job-card"], .startup-job-card');

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
      const titleElement = await card.$('h2, h3, .job-title, a.job-link');
      if (!titleElement) return null;

      const title = await titleElement.textContent();
      if (!title) return null;

      // Get job URL
      let sourceUrl = '';
      const linkElement = await card.$('a[href*="/jobs/"]');
      if (linkElement) {
        sourceUrl = await linkElement.getAttribute('href') || '';
      }

      if (!sourceUrl) return null;

      // Build full URL if needed
      if (!sourceUrl.startsWith('http')) {
        sourceUrl = 'https://wellfound.com' + (sourceUrl.startsWith('/') ? sourceUrl : '/' + sourceUrl);
      }

      // Get company/startup name
      const companyElement = await card.$('.company-name, .startup-name, [data-testid="company-name"]');
      const company = companyElement ? await companyElement.textContent() : 'Unknown Startup';

      // Get location
      const locationElement = await card.$('.location, [data-testid="location"]');
      const location = locationElement ? await locationElement.textContent() : 'Remote';

      // Determine location type
      let locationType = 'on-site';
      if (location?.toLowerCase().includes('remote')) {
        locationType = 'remote';
      } else if (location?.toLowerCase().includes('hybrid')) {
        locationType = 'hybrid';
      }

      // Get salary range if available
      let salary: Record<string, any> | undefined;
      const salaryElement = await card.$('.salary-range, [data-testid="salary"]');
      if (salaryElement) {
        const salaryText = await salaryElement.textContent();
        if (salaryText) {
          salary = { raw: salaryText, currency: 'USD' };
        }
      }

      // Get company funding stage
      const stageElement = await card.$('.funding-stage, [data-testid="funding-stage"]');
      const fundingStage = stageElement ? await stageElement.textContent() : '';

      // Get posted date
      const dateElement = await card.$('.posted-date, time, [data-testid="posted-date"]');
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
        company: company?.trim() || 'Unknown Startup',
        companyUrl,
        location: location?.trim() || 'Remote',
        locationType,
        description: description || 'See full details on Wellfound',
        requirements,
        salary,
        experienceLevel: this.extractExperienceLevel(description),
        postedAt,
        rawData: {
          platform: 'Wellfound',
          fundingStage: fundingStage?.trim(),
          startup: true,
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
      const loadMoreButton = await page.$('button:has-text("Load More"), button[data-testid="load-more"]');
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
          '.job-description, .description, [data-testid="job-description"], .job-details',
          (el: any) => el.textContent?.trim() || ''
        );
      } catch (error) {
        logger.debug('Could not extract job description');
      }

      // Extract requirements
      let requirements = '';
      try {
        requirements = await detailPage.$eval(
          '.job-requirements, .requirements, [data-testid="requirements"]',
          (el: any) => el.textContent?.trim() || ''
        );
      } catch (error) {
        logger.debug('Could not extract requirements');
      }

      // Extract company URL
      let companyUrl = '';
      try {
        companyUrl = await detailPage.$eval(
          'a[href*="/startup/"], a.company-link, [data-testid="company-link"]',
          (el: any) => el.getAttribute('href')
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
    if (text.includes('entry') || text.includes('junior')) return 'entry';
    if (text.includes('mid') || text.includes('intermediate')) return 'mid';
    if (text.includes('senior')) return 'senior';
    if (text.includes('lead') || text.includes('principal') || text.includes('staff'))
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
