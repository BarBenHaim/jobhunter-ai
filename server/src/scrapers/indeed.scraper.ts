/**
 * Indeed Israel Job Scraper
 * Scrapes job listings from il.indeed.com
 * Handles Hebrew and English listings
 * Rate limit: 100 jobs/hour
 */

import { Page } from 'playwright';
import logger from '../utils/logger';
import { BaseScraper } from './base-scraper';
import { JobSource, ScraperQuery, RawJob, ScraperConfig } from './types';

export class IndeedScraper extends BaseScraper {
  name = 'Indeed Israel';
  source = JobSource.INDEED;

  constructor(config: Partial<ScraperConfig> = {}) {
    const defaultConfig: ScraperConfig = {
      enabled: true,
      rateLimit: 100,
      retryAttempts: 3,
      timeout: 30000,
      headless: true,
      ...config,
    };
    super('Indeed Israel', JobSource.INDEED, defaultConfig);
  }

  /**
   * Scrape Indeed job listings
   */
  async scrape(query: ScraperQuery): Promise<RawJob[]> {
    const page = await this.getPage();
    const jobs: RawJob[] = [];

    try {
      logger.info(`Scraping Indeed jobs`, { keywords: query.keywords, location: query.location });

      // Build search URL
      const searchUrl = this.buildSearchUrl(query);
      await this.navigateWithRetry(page, searchUrl);

      // Handle cookie consent
      await this.dismissCookieConsent(page);
      await this.closePopups(page);

      // Wait for job cards
      await this.waitForSelector(page, 'div.job_seen_beacon', 5, 10000);

      // Extract job listings
      const maxResults = query.maxResults || 100;
      let loadedCount = 0;
      let page_num = 0;

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

        // Go to next page
        page_num += 1;
        const nextUrl = this.buildSearchUrl(query, page_num);

        try {
          await this.navigateWithRetry(page, nextUrl);
          await this.waitForSelector(page, 'div.job_seen_beacon', 3, 10000);
        } catch (error) {
          logger.debug('Could not load next page, stopping scrape');
          break;
        }
      }

      logger.info(`Indeed scrape completed`, { jobsFound: jobs.length });
      return jobs;
    } catch (error) {
      logger.error(`Indeed scraper error: ${error}`);
      throw error;
    } finally {
      await this.releasePage(page);
    }
  }

  /**
   * Build Indeed search URL
   */
  private buildSearchUrl(query: ScraperQuery, pageNum: number = 0): string {
    const keywords = query.keywords.join(' ');
    let url = `https://il.indeed.com/jobs?q=${encodeURIComponent(keywords)}`;

    if (query.location) {
      url += `&l=${encodeURIComponent(query.location)}`;
    }

    // Add pagination
    if (pageNum > 0) {
      url += `&start=${pageNum * 10}`;
    }

    // Add remote filter if needed
    if (query.remote) {
      url += '&remotejob=true';
    }

    // Add experience level filter
    if (query.experienceLevel) {
      const levelMap: Record<string, string> = {
        entry: '&explvl=entry_level',
        'entry-level': '&explvl=entry_level',
        junior: '&explvl=entry_level',
        mid: '&explvl=mid_level',
        'mid-level': '&explvl=mid_level',
        senior: '&explvl=senior_level',
        executive: '&explvl=executive_level',
      };
      const filter = levelMap[query.experienceLevel.toLowerCase()];
      if (filter) {
        url += filter;
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
      const jobCards = await page.$$('div.job_seen_beacon');

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
      const titleElement = await card.$('.jobTitle a, .jcs-JobTitle a');
      if (!titleElement) return null;

      const title = await titleElement.textContent();
      const jobUrl = await titleElement.getAttribute('href');

      if (!title || !jobUrl) return null;

      // Get company name
      const companyElement = await card.$('.company_location .company a, .companyName a');
      const company = companyElement ? await companyElement.textContent() : 'Unknown';

      // Get location
      const locationElement = await card.$('.company_location .location, .companyLocation');
      let location = locationElement ? await locationElement.textContent() : '';

      // Clean up location text
      location = location?.replace(/\s*\(.*?\)\s*/g, '') || 'Israel';

      // Build full URL
      const baseUrl = 'https://il.indeed.com';
      let sourceUrl = jobUrl;
      if (!sourceUrl.startsWith('http')) {
        sourceUrl = baseUrl + (sourceUrl.startsWith('/') ? sourceUrl : '/' + sourceUrl);
      }

      // Get job metadata
      const metadataElement = await card.$('.date, .jobMetadataHeader');
      const metadata = metadataElement ? await metadataElement.textContent() : '';

      // Determine location type
      let locationType = 'on-site';
      if (location.toLowerCase().includes('remote')) {
        locationType = 'remote';
      } else if (location.toLowerCase().includes('hybrid')) {
        locationType = 'hybrid';
      }

      // Extract salary if available
      let salary: Record<string, any> | undefined;
      const salaryElement = await card.$('.salary-snippet-container, .salary');
      if (salaryElement) {
        const salaryText = await salaryElement.textContent();
        salary = { raw: salaryText, currency: 'ILS' };
      }

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

      const postedAt = this.parsePostedDate(metadata);

      const job: RawJob = {
        source: this.source,
        sourceUrl,
        title: title.trim(),
        company: company?.trim() || 'Unknown',
        companyUrl,
        location: location.trim() || 'Israel',
        locationType,
        description: description || 'See full details on Indeed',
        requirements,
        salary,
        experienceLevel: this.extractExperienceLevel(description),
        postedAt,
        rawData: {
          platform: 'Indeed Israel',
          metadata,
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
          '#jobDescriptionText, .jobsearch-jobDescriptionText, [data-testid="jobDescription"]',
          (el: any) => el.textContent?.trim() || ''
        );
      } catch (error) {
        logger.debug('Could not extract job description');
      }

      // Extract company URL
      let companyUrl = '';
      try {
        companyUrl = await detailPage.$eval('a[data-tn-component-context="companyNameWithoutLogoLink"]', (el: any) =>
          el.getAttribute('href')
        );
      } catch (error) {
        logger.debug('Could not extract company URL');
      }

      return {
        description,
        requirements: '', // Indeed doesn't have separate requirements section
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
   * Parse posted date from metadata
   */
  private parsePostedDate(metadata: string): Date {
    const now = new Date();

    if (!metadata) return now;

    const text = metadata.toLowerCase();

    // Parse relative dates like "1 day ago", "2 hours ago"
    if (text.includes('hour')) {
      const hours = parseInt(text.match(/\d+/)?.[0] || '0');
      return new Date(now.getTime() - hours * 60 * 60 * 1000);
    }
    if (text.includes('day')) {
      const days = parseInt(text.match(/\d+/)?.[0] || '0');
      return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    }
    if (text.includes('month')) {
      const months = parseInt(text.match(/\d+/)?.[0] || '0');
      return new Date(now.getTime() - months * 30 * 24 * 60 * 60 * 1000);
    }
    if (text.includes('week')) {
      const weeks = parseInt(text.match(/\d+/)?.[0] || '0');
      return new Date(now.getTime() - weeks * 7 * 24 * 60 * 60 * 1000);
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
    if (text.includes('lead') || text.includes('principal')) return 'executive';

    return undefined;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
