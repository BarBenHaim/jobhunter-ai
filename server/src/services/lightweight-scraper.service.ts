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
   * NOTE: Indeed is heavily JS-rendered and blocks server-side requests.
   * This scraper is kept for compatibility but will likely return 0 results
   * without a headless browser. Consider using Google Jobs via SerpAPI instead.
   */
  private async scrapeIndeedIsrael(keywords: string[], location: string): Promise<ScrapedJob[]> {
    try {
      logger.info('Scraping Indeed Israel (limited - JS-rendered site)', { keywords, location });

      const jobs: ScrapedJob[] = [];
      const searchTerms = keywords.join(' ');

      // Build URL for Indeed Israel
      const url = `https://il.indeed.com/jobs?q=${encodeURIComponent(searchTerms)}&l=${encodeURIComponent(location || 'Israel')}`;

      const response = await this.axiosInstance.get(url);
      const $ = cheerio.load(response.data);

      // Try multiple selector patterns (Indeed changes their HTML frequently)
      const selectors = [
        '.jobsearch-ResultsList .job_seen_beacon',
        '.jobsearch-ResultsList li',
        '.resultContent',
        '[data-jk]',
      ];

      let jobElements: cheerio.Cheerio<any> | null = null;
      for (const sel of selectors) {
        const found = $(sel);
        if (found.length > 0) {
          jobElements = found;
          logger.info(`Indeed: Using selector "${sel}", found ${found.length} elements`);
          break;
        }
      }

      if (!jobElements || jobElements.length === 0) {
        logger.warn('Indeed: No job elements found. Site likely requires JavaScript rendering.');
        return [];
      }

      jobElements.each((i: number, elem: any) => {
        try {
          const $elem = $(elem);

          const title = $elem.find('h2 a, .jobTitle a, [data-jk] a').first().text().trim();
          if (!title) return;

          const company = $elem.find('[data-testid="company-name"], .companyName, .company_location span').first().text().trim();
          const jobLocation = $elem.find('[data-testid="text-location"], .companyLocation, .job_snippet_location').first().text().trim() || location;
          const jobUrl = $elem.find('h2 a, .jobTitle a').first().attr('href');
          const sourceUrl = jobUrl ? (jobUrl.startsWith('http') ? jobUrl : `https://il.indeed.com${jobUrl}`) : '';
          const description = $elem.find('.job-snippet, .job_snippet').text().trim();
          const externalId = this.extractIndeedJobId(sourceUrl);

          if (title && company) {
            jobs.push({
              title,
              company,
              location: jobLocation,
              locationType: 'hybrid',
              description,
              sourceUrl,
              source: 'INDEED',
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
   * Scrape Drushim via server-side rendered HTML
   * The /api/jobs/search endpoint only returns filter metadata, NOT job listings.
   * Actual jobs are rendered in the SSR HTML at /jobs/search/{keyword}/
   *
   * HTML structure (verified April 2026):
   * - Container: .job-item
   * - Title: .job-url (span)
   * - Job URL: a[href^="/job/"] → prepend https://www.drushim.co.il
   * - Company: first anchor with href containing "דרושים-" in .job-details-top
   * - Details: second .flex in .job-details-top → "Location | Experience | Type | Posted"
   * - Description: .job-intro
   */
  private async scrapeDrushim(keywords: string[], location: string): Promise<ScrapedJob[]> {
    try {
      logger.info('Scraping Drushim (HTML)', { keywords, location });

      const jobs: ScrapedJob[] = [];
      const searchTerm = keywords.join(' ');

      // Drushim SSR search page
      const url = `https://www.drushim.co.il/jobs/search/${encodeURIComponent(searchTerm)}/`;

      const response = await this.axiosInstance.get(url, {
        headers: {
          'User-Agent': this.USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
        },
      });

      const $ = cheerio.load(response.data);
      const jobItems = $('.job-item');

      logger.info(`Drushim: Found ${jobItems.length} job-item elements`);

      jobItems.each((i: number, elem: any) => {
        try {
          const $elem = $(elem);

          // Title from .job-url span
          const title = $elem.find('.job-url').text().trim();
          if (!title) return;

          // Job URL from a[href^="/job/"]
          const jobLink = $elem.find('a[href^="/job/"]').first().attr('href');
          const sourceUrl = jobLink ? `https://www.drushim.co.il${jobLink}` : '';

          // External ID from job URL (e.g., /job/36603142/561e4de2/ → 36603142)
          const externalId = jobLink ? jobLink.split('/')[2] : undefined;

          // Company name from company link in .job-details-top
          const detailsTop = $elem.find('.job-details-top');
          const companyLink = detailsTop.find('a').first();
          const company = companyLink.text().trim() || 'Unknown';

          // Details text: "Location | Experience | Type | Posted"
          // The second .flex div in .job-details-top contains "Location | Exp | Type | Posted"
          const flexDivs = detailsTop.children('.flex');
          const detailsText = flexDivs.length > 1
            ? $(flexDivs[1]).text().replace(/\s+/g, ' ').trim()
            : detailsTop.text().replace(/\s+/g, ' ').trim();

          // Parse details: split by | separator
          const detailParts = detailsText.split('|').map((p: string) => p.trim());
          const jobLocation = detailParts[0] || location;

          // Experience level (e.g., "1-2 שנים")
          const expMatch = detailsText.match(/(\d+-?\d*\s*שנ[הים]+)/);
          const experienceLevel = expMatch ? expMatch[1] : undefined;

          // Posted time (e.g., "לפני 1 שעות")
          const postedMatch = detailsText.match(/לפני\s+(\d+)\s+(דקות|שעות|ימים|שבועות|חודשים)/);
          const postedAt = postedMatch ? this.parseDrushimDate(postedMatch[1], postedMatch[2]) : undefined;

          // Description from .job-intro
          const description = $elem.find('.job-intro').text().trim();

          if (title && company && company !== 'Unknown') {
            jobs.push({
              title,
              company,
              location: jobLocation,
              locationType: 'hybrid',
              description,
              sourceUrl,
              source: 'DRUSHIM',
              experienceLevel,
              postedAt,
              externalId,
            });
          }
        } catch (err) {
          logger.warn('Error parsing Drushim job item', { error: err });
        }
      });

      logger.info(`Found ${jobs.length} jobs on Drushim`);
      return jobs;
    } catch (error) {
      logger.error('Error scraping Drushim', { error });
      return [];
    }
  }

  /**
   * Helper: Parse Drushim Hebrew relative dates
   */
  private parseDrushimDate(amount: string, unit: string): Date {
    const today = new Date();
    const num = parseInt(amount, 10);

    switch (unit) {
      case 'דקות':
        today.setMinutes(today.getMinutes() - num);
        break;
      case 'שעות':
        today.setHours(today.getHours() - num);
        break;
      case 'ימים':
        today.setDate(today.getDate() - num);
        break;
      case 'שבועות':
        today.setDate(today.getDate() - num * 7);
        break;
      case 'חודשים':
        today.setMonth(today.getMonth() - num);
        break;
    }

    return today;
  }

  /**
   * Scrape AllJobs Israel
   *
   * HTML structure (verified April 2026):
   * - Container: .job-box
   * - Title: .job-content-top-title-highlight (may contain "Alljobs Match" suffix)
   * - Company: anchor links inside .job-box (second link usually has company name)
   * - Location: .job-content-top-location (text like "מיקום המשרה: ...")
   * - Description: .job-content-top-desc
   * - Type: .job-content-top-type
   * - Date: .job-content-top-date
   * - Search URL: /SearchResultsGuest.aspx?page=1&poession={keyword}
   */
  private async scrapeAllJobs(keywords: string[], location: string): Promise<ScrapedJob[]> {
    try {
      logger.info('Scraping AllJobs', { keywords, location });

      const jobs: ScrapedJob[] = [];
      const searchTerm = keywords.join(' ');

      // AllJobs guest search page (no login required)
      const url = `https://www.alljobs.co.il/SearchResultsGuest.aspx?page=1&position=&type=&rid=&city=&poession=${encodeURIComponent(searchTerm)}`;

      const response = await this.axiosInstance.get(url, {
        headers: {
          'User-Agent': this.USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
        },
      });

      const $ = cheerio.load(response.data);
      const jobBoxes = $('.job-box');

      logger.info(`AllJobs: Found ${jobBoxes.length} job-box elements`);

      jobBoxes.each((i: number, elem: any) => {
        try {
          const $elem = $(elem);

          // Title and Company are inside .job-content-top-title-highlight
          // Structure: <div class="job-content-top-title-highlight">
          //   <div>Job Title Text</div>        ← title (first child div)
          //   <div class="T14">Company Name</div>  ← company (second child div with class T14)
          // </div>
          const titleHighlight = $elem.find('.job-content-top-title-highlight');
          if (!titleHighlight.length) return;

          // First child div = title, child with class T14 = company
          const titleDiv = titleHighlight.children('div').first();
          const companyDiv = titleHighlight.find('.T14');

          let title = titleDiv.text().trim();
          // Remove "Alljobs Match" suffix if it somehow appears
          title = title.replace(/Alljobs\s*Match/i, '').trim();
          if (!title) return;

          const company = companyDiv.text().trim();
          if (!company) return;

          // Location from .job-content-top-location
          let jobLocation = $elem.find('.job-content-top-location').text().trim();
          // Clean up "מיקום המשרה:" prefix and "מספר מקומות" prefix
          jobLocation = jobLocation
            .replace(/מיקום המשרה:\s*/i, '')
            .replace(/מספר מקומות\s*/i, '')
            .trim() || location;
          // Take just the first city if multiple are listed (no separators between them)
          // Cities are concatenated without separators, take reasonable length
          if (jobLocation.length > 30) {
            jobLocation = jobLocation.substring(0, 30).trim();
          }

          // Description from .job-content-top-desc
          const description = $elem.find('.job-content-top-desc').text().trim();

          // Date from .job-content-top-date
          const dateStr = $elem.find('.job-content-top-date').text().trim();
          const postedAt = this.parseAllJobsDate(dateStr);

          // Job link: the anchor with class "N" that contains the title text is the job link
          // But many AllJobs links use javascript:void(0) — use the "more info" link at bottom instead
          let sourceUrl = '';
          const moreInfoLink = $elem.find('a[href*="/Info/"]').first().attr('href') ||
                               $elem.find('a[href*="/Job/"]').first().attr('href');
          if (moreInfoLink && !moreInfoLink.includes('javascript')) {
            sourceUrl = moreInfoLink.startsWith('http') ? moreInfoLink : `https://www.alljobs.co.il${moreInfoLink}`;
          }

          jobs.push({
            title,
            company,
            location: jobLocation,
            locationType: 'hybrid',
            description,
            sourceUrl,
            source: 'ALLJOBS',
            postedAt,
          });
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
   * Helper: Parse AllJobs Hebrew relative dates (e.g., "לפני 3 דקות", "לפני יום")
   */
  private parseAllJobsDate(dateStr: string): Date | undefined {
    if (!dateStr) return undefined;

    const today = new Date();

    // "לפני X דקות/שעות/ימים"
    const match = dateStr.match(/לפני\s+(\d+)\s+(דקות|שעות|ימים|שבועות|חודשים)/);
    if (match) {
      return this.parseDrushimDate(match[1], match[2]);
    }

    // "לפני דקה/שעה/יום"
    if (dateStr.includes('דקה')) {
      today.setMinutes(today.getMinutes() - 1);
      return today;
    }
    if (dateStr.includes('שעה')) {
      today.setHours(today.getHours() - 1);
      return today;
    }
    if (dateStr.includes('יום')) {
      today.setDate(today.getDate() - 1);
      return today;
    }

    return undefined;
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

    // Use default keywords if none provided (include Hebrew for Israeli sites)
    const searchTerms = keywords.length > 0 ? keywords : ['מפתח תוכנה', 'software engineer'];
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
    const searchTerms = keywords.length > 0 ? keywords : ['מפתח תוכנה', 'software engineer'];
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
