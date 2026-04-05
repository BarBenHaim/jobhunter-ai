/**
 * Google Jobs Scraper
 * Scrapes job listings from Google Jobs widget in search results
 * Aggregates jobs from multiple sources via Google
 * Rate limit: 200 jobs/hour
 */

import { Page } from 'playwright';
import logger from '../utils/logger';
import { BaseScraper } from './base-scraper';
import { JobSource, ScraperQuery, RawJob, ScraperConfig } from './types';

export class GoogleJobsScraper extends BaseScraper {
  name = 'Google Jobs';
  source = JobSource.GOOGLE_JOBS;

  constructor(config: Partial<ScraperConfig> = {}) {
    const defaultConfig: ScraperConfig = {
      enabled: true,
      rateLimit: 200,
      retryAttempts: 3,
      timeout: 30000,
      headless: true,
      ...config,
    };
    super('Google Jobs', JobSource.GOOGLE_JOBS, defaultConfig);
  }

  /**
   * Scrape Google Jobs listings
   */
  async scrape(query: ScraperQuery): Promise<RawJob[]> {
    const page = await this.getPage();
    const jobs: RawJob[] = [];

    try {
      logger.info(`Scraping Google Jobs`, { keywords: query.keywords, location: query.location });

      // Build search URL
      const searchUrl = this.buildSearchUrl(query);
      await this.navigateWithRetry(page, searchUrl);

      // Handle consent
      await this.dismissCookieConsent(page);
      await this.closePopups(page);

      // Wait for Google Jobs widget to load
      await this.waitForSelector(page, '[data-attrid="Jobs"], .EPhI9c, .kCrDJ', 5, 10000);

      // Extract jobs from the Google Jobs widget
      const maxResults = query.maxResults || 200;
      let loadedCount = 0;

      // Google Jobs shows results in a carousel/list format
      const jobElements = await page.$$('[data-attrid="Jobs"] [data-sokoban-container], .eIWnkf');

      for (const jobElement of jobElements) {
        try {
          const job = await this.parseJobElement(page, jobElement);
          if (job && !jobs.find((j) => j.sourceUrl === job.sourceUrl)) {
            jobs.push(job);
            loadedCount++;
            if (loadedCount >= maxResults) break;
          }
        } catch (error) {
          logger.debug(`Error parsing job element: ${error}`);
          continue;
        }
      }

      logger.info(`Google Jobs scrape completed`, { jobsFound: jobs.length });
      return jobs;
    } catch (error) {
      logger.error(`Google Jobs scraper error: ${error}`);
      throw error;
    } finally {
      await this.releasePage(page);
    }
  }

  /**
   * Build Google search URL for jobs
   */
  private buildSearchUrl(query: ScraperQuery): string {
    const keywords = query.keywords.join(' ');
    let searchTerm = `${keywords} jobs`;

    if (query.location) {
      searchTerm += ` in ${query.location}`;
    }

    if (query.remote) {
      searchTerm += ' remote';
    }

    // Use Google search with jobs intent
    let url = `https://www.google.com/search?q=${encodeURIComponent(searchTerm)}`;

    // Add location filter if specified
    if (query.location && query.location.length > 0) {
      // Add location parameter
      const location = query.location.replace(/\s+/g, '+');
      url += `&near=${encodeURIComponent(location)}`;
    }

    return url;
  }

  /**
   * Parse individual job element from Google Jobs widget
   */
  private async parseJobElement(page: Page, jobElement: any): Promise<RawJob | null> {
    try {
      // Try to extract job information from Google's structured data
      const jobData = await jobElement.evaluate((el: HTMLElement) => {
        const data: Record<string, any> = {};

        // Get title
        const titleEl = el.querySelector('h3, .vvjwpe, [role="heading"]');
        if (titleEl) data.title = titleEl.textContent?.trim();

        // Get company
        const companyEl = el.querySelector('.hbiS5c, .d5NbRd, [data-sokoban-feature="company_name"]');
        if (companyEl) data.company = companyEl.textContent?.trim();

        // Get location
        const locationEl = el.querySelector('.HfBbqf, [data-sokoban-feature="location"]');
        if (locationEl) data.location = locationEl.textContent?.trim();

        // Get job URL
        const linkEl = el.querySelector('a[href]');
        if (linkEl) data.sourceUrl = linkEl.getAttribute('href');

        // Get salary if available
        const salaryEl = el.querySelector('.XyJTKb, [data-sokoban-feature="salary"]');
        if (salaryEl) data.salary = salaryEl.textContent?.trim();

        // Get posted date
        const dateEl = el.querySelector('.pSaBse, [data-sokoban-feature="posted_date"]');
        if (dateEl) data.postedDate = dateEl.textContent?.trim();

        return data;
      });

      if (!jobData.title || !jobData.company || !jobData.sourceUrl) {
        return null;
      }

      // Click on the job to load full details
      await jobElement.click();
      await this.delay(500);

      // Try to get full description from the details panel
      let description = '';
      try {
        const descElement = await page.$('[data-attrid="Jobs"] [data-sokoban-feature="job_description"], .EPhI9c');
        if (descElement) {
          description = await descElement.textContent() || '';
        }
      } catch (error) {
        logger.debug('Could not extract job description');
      }

      // Determine location type
      let locationType = 'on-site';
      if (jobData.location?.toLowerCase().includes('remote')) {
        locationType = 'remote';
      } else if (jobData.location?.toLowerCase().includes('hybrid')) {
        locationType = 'hybrid';
      }

      // Parse salary
      let salary: Record<string, any> | undefined;
      if (jobData.salary) {
        salary = { raw: jobData.salary, currency: 'USD' };
      }

      // Parse posted date
      const postedAt = this.parsePostedDate(jobData.postedDate);

      const job: RawJob = {
        source: this.source,
        sourceUrl: this.resolveJobUrl(jobData.sourceUrl),
        title: jobData.title.trim(),
        company: jobData.company.trim(),
        location: jobData.location?.trim() || 'Various',
        locationType,
        description: description || 'See full details on original job posting',
        salary,
        experienceLevel: this.extractExperienceLevel(description),
        postedAt,
        rawData: {
          platform: 'Google Jobs',
          originalData: jobData,
        },
      };

      return job;
    } catch (error) {
      logger.debug(`Error parsing job element: ${error}`);
      return null;
    }
  }

  /**
   * Resolve job URL from Google Jobs widget
   */
  private resolveJobUrl(urlOrId: string): string {
    if (!urlOrId) return '';

    // If it's already a full URL, return it
    if (urlOrId.startsWith('http')) {
      return urlOrId;
    }

    // If it's a relative URL, construct it
    if (urlOrId.startsWith('/')) {
      return `https://www.google.com${urlOrId}`;
    }

    // Otherwise assume it's an ID or partial URL
    return urlOrId;
  }

  /**
   * Parse posted date
   */
  private parsePostedDate(dateText: string | undefined): Date {
    const now = new Date();

    if (!dateText) return now;

    const text = dateText.toLowerCase().trim();

    // Parse relative dates like "1 hour ago", "2 days ago"
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

    // Try to parse absolute date
    try {
      const parsed = new Date(dateText);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    } catch (error) {
      logger.debug(`Could not parse date: ${dateText}`);
    }

    return now;
  }

  /**
   * Extract experience level from description
   */
  private extractExperienceLevel(description: string): string | undefined {
    if (!description) return undefined;

    const text = description.toLowerCase();
    if (text.includes('entry') || text.includes('junior') || text.includes('0-2 years'))
      return 'entry';
    if (text.includes('mid') || text.includes('intermediate') || text.includes('3-5 years'))
      return 'mid';
    if (text.includes('senior') || text.includes('6-10 years')) return 'senior';
    if (text.includes('lead') || text.includes('principal') || text.includes('10+ years'))
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
