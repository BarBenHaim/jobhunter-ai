import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import logger from '../utils/logger';

// Type definitions for scraped jobs
interface ScrapedJob {
  title: string;
  company: string;
  location: string;
  locationType?: string;
  description?: string;
  sourceUrl: string;
  source: string;
  salary?: {
    min?: number;
    max?: number;
    currency?: string;
    period?: string;
  };
  experienceLevel?: string;
  postedAt?: Date;
  externalId?: string;
}

interface ScrapeResult {
  source: string;
  jobs: ScrapedJob[];
  count: number;
  timestamp: Date;
  error?: string;
}

class LightweightScraperService {
  private axiosInstance: AxiosInstance;
  private readonly USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  constructor() {
    this.axiosInstance = axios.create({
      headers: {
        'User-Agent': this.USER_AGENT,
      },
      timeout: 30000,
    });
  }

  /**
   * Scrape Indeed Israel for job listings
   */
  private async scrapeIndeedIsrael(keywords: string[], location: string): Promise<ScrapedJob[]> {
    try {
      logger.info('Scraping Indeed Israel', { keywords, location });

      const jobs: ScrapedJob[] = [];
      const searchTerms = keywords.join(' ');

      // Build URL for Indeed Israel
      const url = `https://il.indeed.com/jobs?q=${encodeURIComponent(searchTerms)}&l=${encodeURIComponent(location || 'Israel')}`;

      const response = await this.axiosInstance.get(url);
      const $ = cheerio.load(response.data);

      // Parse job cards from Indeed
      $('.jobsearch-ResultsList li').each((i, elem) => {
        try {
          const $elem = $(elem);

          // Extract job title
          const title = $elem.find('h2 a').text().trim();
          if (!title) return;

          // Extract company
          const company = $elem.find('[data-company-name]').text().trim() ||
                         $elem.find('.company_location span').first().text().trim();

          // Extract location
          const jobLocation = $elem.find('.job_snippet_location').text().trim() ||
                            $elem.find('[data-job-location]').text().trim() ||
                            location;

          // Extract job URL
          const jobUrl = $elem.find('h2 a').attr('href');
          const sourceUrl = jobUrl ? `https://il.indeed.com${jobUrl}` : '';

          // Extract posting date
          const dateStr = $elem.find('.date').text().trim();
          const postedAt = this.parseIndeedDate(dateStr);

          // Extract job snippet/description
          const description = $elem.find('.job_snippet').text().trim();

          // Extract external ID from URL
          const externalId = this.extractIndeedJobId(sourceUrl);

          if (title && company && jobLocation) {
            jobs.push({
              title,
              company,
              location: jobLocation,
              locationType: 'hybrid',
              description,
              sourceUrl: sourceUrl || '',
              source: 'INDEED',
              postedAt,
              externalId,
            });
          }
        } catch (err) {
          logger.warn('Error parsing Indeed job item', { error: err });
        }
      });

      logger.info(`Found ${jobs.length} jobs on Indeed Israel`);
      return jobs;
    } catch (error) {
      logger.error('Error scraping Indeed Israel', { error });
      return [];
    }
  }

  /**
   * Scrape Drushim API
   */
  private async scrapeDrushim(keywords: string[], location: string): Promise<ScrapedJob[]> {
    try {
      logger.info('Scraping Drushim API', { keywords, location });

      const jobs: ScrapedJob[] = [];
      const searchTerm = keywords.join(' ');

      // Drushim API endpoint
      const url = `https://www.drushim.co.il/api/jobs/search?searchterm=${encodeURIComponent(searchTerm)}&area=1`;

      const response = await this.axiosInstance.get(url);
      const apiJobs = response.data?.jobs || response.data || [];

      // Handle if response is array directly
      const jobsList = Array.isArray(apiJobs) ? apiJobs : apiJobs.jobs || [];

      for (const job of jobsList) {
        try {
          const jobLocation = job.area || job.region || location;
          const title = job.position || job.title;
          const company = job.company_name || job.company;

          if (title && company) {
            const postedAt = job.pubDate ? new Date(job.pubDate) : new Date();

            jobs.push({
              title,
              company,
              location: jobLocation,
              locationType: job.employment_type?.toLowerCase() === 'full-time' ? 'fulltime' : 'hybrid',
              description: job.description || job.job_description || '',
              sourceUrl: job.url || `https://www.drushim.co.il/job/${job.id}`,
              source: 'DRUSHIM',
              salary: job.salary_min || job.salary_max ? {
                min: job.salary_min,
                max: job.salary_max,
                currency: 'ILS',
                period: 'monthly',
              } : undefined,
              experienceLevel: job.experience || job.experience_level,
              postedAt,
              externalId: job.id?.toString(),
            });
          }
        } catch (err) {
          logger.warn('Error parsing Drushim job item', { error: err });
        }
      }

      logger.info(`Found ${jobs.length} jobs on Drushim`);
      return jobs;
    } catch (error) {
      logger.error('Error scraping Drushim', { error });
      return [];
    }
  }

  /**
   * Scrape AllJobs Israel
   */
  private async scrapeAllJobs(keywords: string[], location: string): Promise<ScrapedJob[]> {
    try {
      logger.info('Scraping AllJobs', { keywords, location });

      const jobs: ScrapedJob[] = [];
      const searchTerm = keywords.join(' ');

      // AllJobs main search page
      const url = `https://www.alljobs.co.il/SearchJobs/?what=${encodeURIComponent(searchTerm)}&where=${encodeURIComponent(location || 'Israel')}`;

      const response = await this.axiosInstance.get(url);
      const $ = cheerio.load(response.data);

      // Parse job listings from AllJobs
      $('.job_card, .job-item, [data-job-item], article.job').each((i, elem) => {
        try {
          const $elem = $(elem);

          const title = $elem.find('h2, h3, .job-title, [data-job-title]').text().trim();
          if (!title) return;

          const company = $elem.find('.company, [data-company], .employer').text().trim();
          const jobLocation = $elem.find('.location, [data-location], .job-location').text().trim() || location;
          const jobUrl = $elem.find('a.job-link, a[href*="job"], .job-title a').attr('href');
          const sourceUrl = jobUrl?.startsWith('http')
            ? jobUrl
            : `https://www.alljobs.co.il${jobUrl}`;

          const description = $elem.find('.description, .summary, [data-description]').text().trim();

          if (title && company) {
            jobs.push({
              title,
              company,
              location: jobLocation,
              locationType: 'hybrid',
              description,
              sourceUrl: sourceUrl || '',
              source: 'ALLJOBS',
            });
          }
        } catch (err) {
          logger.warn('Error parsing AllJobs item', { error: err });
        }
      });

      logger.info(`Found ${jobs.length} jobs on AllJobs`);
      return jobs;
    } catch (error) {
      logger.error('Error scraping AllJobs', { error });
      return [];
    }
  }

  /**
   * Scrape Google Jobs via SerpAPI (if API key is available)
   */
  private async scrapeGoogleJobs(keywords: string[], location: string): Promise<ScrapedJob[]> {
    try {
      const serpApiKey = process.env.SERPAPI_KEY;

      if (!serpApiKey) {
        logger.info('SerpAPI key not configured, skipping Google Jobs');
        return [];
      }

      logger.info('Scraping Google Jobs via SerpAPI', { keywords, location });

      const jobs: ScrapedJob[] = [];
      const searchTerm = keywords.join(' ');

      // Use SerpAPI to get Google Jobs results
      const url = 'https://serpapi.com/search';
      const params = {
        engine: 'google_jobs',
        q: searchTerm,
        location: location || 'Israel',
        api_key: serpApiKey,
        type: 'search',
      };

      const response = await this.axiosInstance.get(url, { params });
      const jobResults = response.data.jobs_results || [];

      for (const job of jobResults) {
        try {
          const title = job.title;
          const company = job.company_name;
          const jobLocation = job.location || location;

          if (title && company) {
            const postedAt = job.detected_extensions?.posted_at
              ? this.parseRelativeDate(job.detected_extensions.posted_at)
              : new Date();

            jobs.push({
              title,
              company,
              location: jobLocation,
              locationType: 'hybrid',
              description: job.description || '',
              sourceUrl: job.link || '',
              source: 'GOOGLE_JOBS',
              salary: job.salary_min && job.salary_max ? {
                min: job.salary_min,
                max: job.salary_max,
                currency: 'ILS',
              } : undefined,
              experienceLevel: job.seniority_level,
              postedAt,
              externalId: job.job_id,
            });
          }
        } catch (err) {
          logger.warn('Error parsing Google Jobs item', { error: err });
        }
      }

      logger.info(`Found ${jobs.length} jobs on Google Jobs`);
      return jobs;
    } catch (error) {
      logger.error('Error scraping Google Jobs', { error });
      return [];
    }
  }

  /**
   * Main scraper function that runs all scrapers
   */
  async scrapeAll(keywords: string[] = [], location: string = 'Israel'): Promise<ScrapeResult[]> {
    logger.info('Starting scraping of all sources', { keywords, location });

    const results: ScrapeResult[] = [];

    // Use default keywords if none provided
    const searchTerms = keywords.length > 0 ? keywords : ['software engineer', 'developer'];
    const searchLocation = location || 'Israel';

    // Run all scrapers in parallel
    const [indeedJobs, drushimJobs, allJobsJobs, googleJobs] = await Promise.all([
      this.scrapeIndeedIsrael(searchTerms, searchLocation).catch((err) => {
        logger.error('Indeed scraper failed', err);
        return [];
      }),
      this.scrapeDrushim(searchTerms, searchLocation).catch((err) => {
        logger.error('Drushim scraper failed', err);
        return [];
      }),
      this.scrapeAllJobs(searchTerms, searchLocation).catch((err) => {
        logger.error('AllJobs scraper failed', err);
        return [];
      }),
      this.scrapeGoogleJobs(searchTerms, searchLocation).catch((err) => {
        logger.error('Google Jobs scraper failed', err);
        return [];
      }),
    ]);

    // Push results
    results.push({
      source: 'INDEED',
      jobs: indeedJobs,
      count: indeedJobs.length,
      timestamp: new Date(),
    });

    results.push({
      source: 'DRUSHIM',
      jobs: drushimJobs,
      count: drushimJobs.length,
      timestamp: new Date(),
    });

    results.push({
      source: 'ALLJOBS',
      jobs: allJobsJobs,
      count: allJobsJobs.length,
      timestamp: new Date(),
    });

    results.push({
      source: 'GOOGLE_JOBS',
      jobs: googleJobs,
      count: googleJobs.length,
      timestamp: new Date(),
    });

    const totalJobs = indeedJobs.length + drushimJobs.length + allJobsJobs.length + googleJobs.length;
    logger.info(`Scraping completed. Total jobs found: ${totalJobs}`, {
      indeed: indeedJobs.length,
      drushim: drushimJobs.length,
      alljobs: allJobsJobs.length,
      googleJobs: googleJobs.length,
    });

    return results;
  }

  /**
   * Scrape a single source
   */
  async scrapeSource(
    source: string,
    keywords: string[] = [],
    location: string = 'Israel'
  ): Promise<ScrapeResult> {
    const searchTerms = keywords.length > 0 ? keywords : ['software engineer', 'developer'];
    const searchLocation = location || 'Israel';

    logger.info(`Scraping source: ${source}`, { searchTerms, searchLocation });

    let jobs: ScrapedJob[] = [];

    switch (source.toUpperCase()) {
      case 'INDEED':
        jobs = await this.scrapeIndeedIsrael(searchTerms, searchLocation);
        break;
      case 'DRUSHIM':
        jobs = await this.scrapeDrushim(searchTerms, searchLocation);
        break;
      case 'ALLJOBS':
        jobs = await this.scrapeAllJobs(searchTerms, searchLocation);
        break;
      case 'GOOGLE_JOBS':
        jobs = await this.scrapeGoogleJobs(searchTerms, searchLocation);
        break;
      default:
        logger.warn(`Unknown source: ${source}`);
        return {
          source,
          jobs: [],
          count: 0,
          timestamp: new Date(),
          error: `Unknown source: ${source}`,
        };
    }

    return {
      source,
      jobs,
      count: jobs.length,
      timestamp: new Date(),
    };
  }

  /**
   * Helper: Parse relative dates from Indeed (e.g., "30 days ago")
   */
  private parseIndeedDate(dateStr: string): Date | undefined {
    if (!dateStr) return undefined;

    const today = new Date();

    if (dateStr.includes('Today')) {
      return today;
    }

    if (dateStr.includes('Yesterday')) {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return yesterday;
    }

    const match = dateStr.match(/(\d+)\s+(day|week|month)/i);
    if (match) {
      const amount = parseInt(match[1], 10);
      const unit = match[2].toLowerCase();
      const date = new Date(today);

      if (unit === 'day') {
        date.setDate(date.getDate() - amount);
      } else if (unit === 'week') {
        date.setDate(date.getDate() - amount * 7);
      } else if (unit === 'month') {
        date.setMonth(date.getMonth() - amount);
      }

      return date;
    }

    return undefined;
  }

  /**
   * Helper: Parse relative dates from various sources
   */
  private parseRelativeDate(dateStr: string): Date {
    const today = new Date();

    if (dateStr.includes('hour') || dateStr.includes('hour ago')) {
      return today;
    }

    if (dateStr.includes('day') || dateStr.includes('day ago')) {
      const match = dateStr.match(/(\d+)\s+day/);
      if (match) {
        const days = parseInt(match[1], 10);
        const date = new Date(today);
        date.setDate(date.getDate() - days);
        return date;
      }
      return today;
    }

    if (dateStr.includes('week') || dateStr.includes('week ago')) {
      const match = dateStr.match(/(\d+)\s+week/);
      if (match) {
        const weeks = parseInt(match[1], 10);
        const date = new Date(today);
        date.setDate(date.getDate() - weeks * 7);
        return date;
      }
      return today;
    }

    if (dateStr.includes('month') || dateStr.includes('month ago')) {
      const match = dateStr.match(/(\d+)\s+month/);
      if (match) {
        const months = parseInt(match[1], 10);
        const date = new Date(today);
        date.setMonth(date.getMonth() - months);
        return date;
      }
      return today;
    }

    return today;
  }

  /**
   * Helper: Extract job ID from Indeed URL
   */
  private extractIndeedJobId(url: string): string | undefined {
    const match = url.match(/jk=([a-f0-9]+)/);
    return match ? match[1] : undefined;
  }
}

export const lightweightScraperService = new LightweightScraperService();
