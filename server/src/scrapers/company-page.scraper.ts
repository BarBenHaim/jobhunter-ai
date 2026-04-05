/**
 * Company Career Page Scraper
 * Generic scraper for company career pages
 * Supports common ATS systems (Greenhouse, Lever, Workable)
 * Auto-detects and adapts to different page structures
 */

import { Page } from 'playwright';
import logger from '../utils/logger';
import { BaseScraper } from './base-scraper';
import { JobSource, ScraperQuery, RawJob, ScraperConfig, CompanyPageConfig, ATS_SELECTORS } from './types';

export class CompanyPageScraper extends BaseScraper {
  name = 'Company Career Page';
  source = JobSource.COMPANY_CAREER_PAGE;
  private companyConfigs: Map<string, CompanyPageConfig> = new Map();

  constructor(config: Partial<ScraperConfig> = {}) {
    const defaultConfig: ScraperConfig = {
      enabled: true,
      rateLimit: 50,
      retryAttempts: 2,
      timeout: 25000,
      headless: true,
      ...config,
    };
    super('Company Career Page', JobSource.COMPANY_CAREER_PAGE, defaultConfig);
  }

  /**
   * Register a company career page for scraping
   */
  registerCompany(config: CompanyPageConfig): void {
    this.companyConfigs.set(config.name, config);
    logger.info(`Registered company career page: ${config.name} (${config.url})`);
  }

  /**
   * Register multiple companies
   */
  registerCompanies(configs: CompanyPageConfig[]): void {
    for (const config of configs) {
      this.registerCompany(config);
    }
  }

  /**
   * Scrape all registered company career pages
   */
  async scrape(query: ScraperQuery): Promise<RawJob[]> {
    const jobs: RawJob[] = [];

    try {
      for (const [companyName, config] of this.companyConfigs) {
        if (!config.enabled) {
          logger.debug(`Skipping disabled company: ${companyName}`);
          continue;
        }

        try {
          logger.info(`Scraping company career page: ${companyName}`);
          const companyJobs = await this.scrapeCompanyPage(config, query);
          jobs.push(...companyJobs);
        } catch (error) {
          logger.error(`Error scraping ${companyName}: ${error}`);
          continue;
        }
      }

      logger.info(`Company pages scrape completed`, { jobsFound: jobs.length });
      return jobs;
    } catch (error) {
      logger.error(`Company pages scraper error: ${error}`);
      throw error;
    }
  }

  /**
   * Scrape a single company career page
   */
  private async scrapeCompanyPage(config: CompanyPageConfig, query: ScraperQuery): Promise<RawJob[]> {
    const page = await this.getPage();
    const jobs: RawJob[] = [];

    try {
      await this.navigateWithRetry(page, config.url);

      // Handle popups and consent
      await this.dismissCookieConsent(page);
      await this.closePopups(page);

      // Detect ATS type if not specified
      let atsType = config.atsType || (await this.detectATSType(page));
      logger.debug(`Detected ATS type: ${atsType}`);

      // Get selectors based on ATS type
      const selectors = this.getSelectors(config, atsType);

      // Wait for job container
      await this.waitForSelector(page, selectors.jobContainer, 3, 10000).catch(() => {
        logger.debug(`Job container not found with selector: ${selectors.jobContainer}`);
      });

      // Handle infinite scroll/lazy loading
      const maxResults = query.maxResults || 50;
      let scrolls = 0;
      const maxScrolls = Math.ceil(maxResults / 10);

      while (scrolls < maxScrolls) {
        // Extract job listings
        const pageJobs = await this.extractJobsFromPage(page, config, selectors, query);
        for (const job of pageJobs) {
          if (!jobs.find((j) => j.sourceUrl === job.sourceUrl)) {
            jobs.push(job);
            if (jobs.length >= maxResults) break;
          }
        }

        if (jobs.length >= maxResults) break;

        // Scroll to load more
        await this.scrollToLoadMore(page, 1, 500);
        scrolls++;
      }

      return jobs;
    } catch (error) {
      logger.error(`Error scraping company page ${config.name}: ${error}`);
      return jobs;
    } finally {
      await this.releasePage(page);
    }
  }

  /**
   * Detect ATS type from page structure
   */
  private async detectATSType(page: Page): Promise<string> {
    // Check for Greenhouse
    const greenhouseIndicators = await page.$$('[data-gh-job-board], .gh-jobs-board, [data-job-id]');
    if (greenhouseIndicators.length > 0) {
      return 'greenhouse';
    }

    // Check for Lever
    const leverIndicators = await page.$$('.posting, [data-lever-id]');
    if (leverIndicators.length > 0) {
      return 'lever';
    }

    // Check for Workable
    const workableIndicators = await page.$$('[data-workable-job], .job-item');
    if (workableIndicators.length > 0) {
      return 'workable';
    }

    // Default to generic
    return 'generic';
  }

  /**
   * Get CSS selectors based on ATS type
   */
  private getSelectors(
    config: CompanyPageConfig,
    atsType: string
  ): Record<string, string> {
    // Use custom selectors if provided, otherwise use ATS defaults
    if (config.selectors && Object.keys(config.selectors).length > 0) {
      return config.selectors as Record<string, string>;
    }

    const atsSelectors = ATS_SELECTORS[atsType as keyof typeof ATS_SELECTORS];
    if (atsSelectors) {
      return atsSelectors;
    }

    // Fallback to generic selectors
    return ATS_SELECTORS.generic;
  }

  /**
   * Extract jobs from page using provided selectors
   */
  private async extractJobsFromPage(
    page: Page,
    config: CompanyPageConfig,
    selectors: Record<string, string>,
    query: ScraperQuery
  ): Promise<RawJob[]> {
    const jobs: RawJob[] = [];

    try {
      const jobElements = await page.$$(selectors.jobContainer);
      logger.debug(`Found ${jobElements.length} job elements`);

      for (const element of jobElements) {
        try {
          const job = await this.parseJobFromElement(element, config, selectors);
          if (job && this.matchesQuery(job, query)) {
            jobs.push(job);
          }
        } catch (error) {
          logger.debug(`Error parsing job element: ${error}`);
          continue;
        }
      }
    } catch (error) {
      logger.warn(`Error extracting jobs from page: ${error}`);
    }

    return jobs;
  }

  /**
   * Parse a single job element
   */
  private async parseJobFromElement(
    element: any,
    config: CompanyPageConfig,
    selectors: Record<string, string>
  ): Promise<RawJob | null> {
    try {
      // Extract title
      let title = '';
      try {
        title = await element.$eval(selectors.title, (el: any) => el.textContent?.trim() || '');
      } catch (error) {
        logger.debug('Could not extract title');
        return null;
      }

      if (!title) return null;

      // Extract location
      let location = 'Remote';
      try {
        location = await element.$eval(selectors.location, (el: any) => el.textContent?.trim() || 'Remote');
      } catch (error) {
        logger.debug('Could not extract location');
      }

      // Build job URL
      let sourceUrl = config.url;
      try {
        sourceUrl = await element.$eval('a[href]', (el: any) => el.getAttribute('href') || config.url);
        if (!sourceUrl.startsWith('http')) {
          sourceUrl = config.url + (sourceUrl.startsWith('/') ? sourceUrl : '/' + sourceUrl);
        }
      } catch (error) {
        logger.debug('Could not extract job URL');
      }

      // Extract description (truncated for list view)
      let description = 'See full details on company website';
      try {
        description = await element.$eval(selectors.description, (el: any) =>
          el.textContent?.trim().substring(0, 500) || ''
        );
      } catch (error) {
        logger.debug('Could not extract description');
      }

      // Determine location type
      let locationType = 'on-site';
      if (location.toLowerCase().includes('remote')) {
        locationType = 'remote';
      } else if (location.toLowerCase().includes('hybrid')) {
        locationType = 'hybrid';
      }

      const job: RawJob = {
        source: this.source,
        sourceUrl,
        title: title.trim(),
        company: config.name,
        location: location.trim(),
        locationType,
        description,
        experienceLevel: this.extractExperienceLevel(description),
        postedAt: new Date(),
        rawData: {
          platform: 'Company Career Page',
          atsType: config.atsType || 'unknown',
          companyName: config.name,
        },
      };

      return job;
    } catch (error) {
      logger.debug(`Error parsing job element: ${error}`);
      return null;
    }
  }

  /**
   * Check if job matches query filters
   */
  private matchesQuery(job: RawJob, query: ScraperQuery): boolean {
    // Check keywords
    if (query.keywords && query.keywords.length > 0) {
      const jobText = `${job.title} ${job.description}`.toLowerCase();
      const matchesKeyword = query.keywords.some((keyword) =>
        jobText.includes(keyword.toLowerCase())
      );
      if (!matchesKeyword) return false;
    }

    // Check location
    if (query.location) {
      const jobLocation = job.location?.toLowerCase() || '';
      const queryLocation = query.location.toLowerCase();
      if (!jobLocation.includes(queryLocation)) {
        // Only fail if explicitly filtering for location and not remote
        if (!(query.remote && job.locationType === 'remote')) {
          return false;
        }
      }
    }

    // Check remote
    if (query.remote && job.locationType !== 'remote') {
      return false;
    }

    // Check experience level
    if (query.experienceLevel && job.experienceLevel) {
      if (job.experienceLevel !== query.experienceLevel) {
        return false;
      }
    }

    return true;
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
