import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import logger from '../utils/logger';
import { companyDiscoveryService } from './company-discovery.service';

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
   * Scrape Indeed Israel — tries SerpAPI first (reliable), falls back to RSS
   */
  private async scrapeIndeedIsrael(keywords: string[], location: string): Promise<ScrapedJob[]> {
    // Strategy 1: SerpAPI (most reliable)
    const serpApiKey = process.env.SERPAPI_KEY;
    if (serpApiKey) {
      try {
        logger.info('Scraping Indeed Israel via SerpAPI', { keywords, location });
        const jobs: ScrapedJob[] = [];
        const searchTerm = keywords.join(' ');

        const response = await this.axiosInstance.get('https://serpapi.com/search', {
          params: {
            engine: 'google_jobs',
            q: `${searchTerm} site:indeed.com`,
            location: location || 'Israel',
            api_key: serpApiKey,
          },
        });

        const jobResults = response.data.jobs_results || [];
        for (const job of jobResults) {
          if (job.title && job.company_name) {
            jobs.push({
              title: job.title,
              company: job.company_name,
              location: job.location || location || 'Israel',
              locationType: 'hybrid',
              description: (job.description || '').substring(0, 500),
              sourceUrl: job.related_links?.[0]?.link || job.link || `https://il.indeed.com/viewjob?jk=${job.job_id || ''}`,
              source: 'INDEED',
              postedAt: job.detected_extensions?.posted_at
                ? this.parseRelativeDate(job.detected_extensions.posted_at)
                : new Date(),
              externalId: job.job_id,
            });
          }
        }

        if (jobs.length > 0) {
          logger.info(`Found ${jobs.length} Indeed jobs via SerpAPI`);
          return jobs;
        }
        logger.info('SerpAPI returned 0 Indeed jobs, trying RSS fallback');
      } catch (err) {
        logger.warn('SerpAPI Indeed search failed, trying RSS fallback', { error: err });
      }
    }

    // Strategy 2: RSS feed fallback
    try {
      logger.info('Scraping Indeed Israel via RSS feed', { keywords, location });
      const jobs: ScrapedJob[] = [];
      const searchTerms = keywords.join(' ');

      const url = `https://il.indeed.com/rss?q=${encodeURIComponent(searchTerms)}&l=${encodeURIComponent(location || 'Israel')}&sort=date`;

      const response = await this.axiosInstance.get(url, {
        headers: {
          'User-Agent': this.USER_AGENT,
          'Accept': 'application/rss+xml, application/xml, text/xml',
        },
        timeout: 15000,
      });

      const $ = cheerio.load(response.data, { xmlMode: true });
      const items = $('item');

      logger.info(`Indeed RSS: Found ${items.length} items`);

      items.each((i: number, elem: any) => {
        try {
          const $item = $(elem);
          const title = $item.find('title').text().trim();
          if (!title) return;

          const sourceUrl = $item.find('link').text().trim();
          const descriptionHtml = $item.find('description').text().trim();
          const descParsed = cheerio.load(descriptionHtml);
          const fullText = descParsed.text().trim();

          let company = 'Unknown';
          let jobLocation = location || 'Israel';

          const source = $item.find('source').text().trim();
          if (source) {
            company = source.replace(/ - Indeed$/, '').trim();
          }

          if (company === 'Unknown') {
            const companyMatch = fullText.match(/^(.+?)\s*[-–]\s*(.+?)[-–]/);
            if (companyMatch) {
              company = companyMatch[1].trim();
              jobLocation = companyMatch[2].trim() || jobLocation;
            }
          }

          const pubDate = $item.find('pubDate').text().trim();
          const postedAt = pubDate ? new Date(pubDate) : new Date();
          const externalId = this.extractIndeedJobId(sourceUrl);

          if (title) {
            jobs.push({
              title, company, location: jobLocation, locationType: 'hybrid',
              description: fullText.substring(0, 500), sourceUrl, source: 'INDEED',
              postedAt, externalId,
            });
          }
        } catch (err) {
          logger.warn('Error parsing Indeed RSS item', { error: err });
        }
      });

      logger.info(`Found ${jobs.length} jobs on Indeed Israel via RSS`);
      return jobs;
    } catch (error) {
      logger.error('Error scraping Indeed Israel RSS', { error });
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
   * Scrape career pages via SerpAPI Google search (primary) or raw Google (fallback)
   * Searches for job listings on common ATS platforms (Greenhouse, Lever, Ashby)
   */
  private async scrapeCareerPages(keywords: string[], location: string): Promise<ScrapedJob[]> {
    try {
      logger.info('Scraping career pages', { keywords, location });
      const jobs: ScrapedJob[] = [];
      const searchTerms = keywords.join(' ');

      const searchQueries = [
        `${searchTerms} Israel site:boards.greenhouse.io`,
        `${searchTerms} Israel site:jobs.lever.co`,
        `${searchTerms} Israel site:jobs.ashbyhq.com`,
      ];

      const serpApiKey = process.env.SERPAPI_KEY;

      for (const query of searchQueries) {
        try {
          let results: { title: string; link: string; snippet: string }[] = [];

          if (serpApiKey) {
            // Use SerpAPI (reliable, no CAPTCHA)
            const response = await this.axiosInstance.get('https://serpapi.com/search', {
              params: {
                engine: 'google',
                q: query,
                api_key: serpApiKey,
                num: 15,
              },
            });
            results = (response.data.organic_results || []).map((r: any) => ({
              title: r.title || '',
              link: r.link || '',
              snippet: r.snippet || '',
            }));
          } else {
            // Fallback: raw Google scraping (may get blocked)
            const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=10`;
            const response = await this.axiosInstance.get(url, {
              headers: {
                'User-Agent': this.USER_AGENT,
                'Accept': 'text/html',
                'Accept-Language': 'en-US,en;q=0.9',
              },
            });

            const $ = cheerio.load(response.data);
            $('div.g, div[data-sokoban-container]').each((_: number, elem: any) => {
              const $result = $(elem);
              const link = $result.find('a').first().attr('href') || '';
              const title = $result.find('h3').first().text().trim();
              const snippet = $result.find('.VwiC3b, [data-sncf]').first().text().trim();
              if (title && link) results.push({ title, link, snippet });
            });
          }

          for (const result of results) {
            try {
              const sourceUrl = result.link.startsWith('/url?q=')
                ? decodeURIComponent(result.link.replace('/url?q=', '').split('&')[0])
                : result.link;

              if (!sourceUrl.includes('greenhouse.io') && !sourceUrl.includes('lever.co') && !sourceUrl.includes('ashbyhq.com')) continue;
              if (!result.title) continue;

              let company = 'Unknown';
              const ghMatch = sourceUrl.match(/boards\.greenhouse\.io\/([^\/]+)/);
              const leverMatch = sourceUrl.match(/jobs\.lever\.co\/([^\/]+)/);
              const ashbyMatch = sourceUrl.match(/jobs\.ashbyhq\.com\/([^\/]+)/);

              if (ghMatch) company = ghMatch[1].replace(/[-_]/g, ' ');
              else if (leverMatch) company = leverMatch[1].replace(/[-_]/g, ' ');
              else if (ashbyMatch) company = ashbyMatch[1].replace(/[-_]/g, ' ');

              company = company.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

              jobs.push({
                title: result.title.replace(/ at .*$/, '').replace(/ - .*$/, '').trim(),
                company,
                location: location || 'Israel',
                locationType: 'hybrid',
                description: (result.snippet || '').substring(0, 300),
                sourceUrl,
                source: 'COMPANY_CAREER_PAGE',
              });
            } catch (_err) {
              // skip
            }
          }
        } catch (err) {
          logger.warn('Career page search failed for query', { query, error: err });
        }
      }

      // Deduplicate by URL
      const seen = new Set<string>();
      const uniqueJobs = jobs.filter(j => {
        if (seen.has(j.sourceUrl)) return false;
        seen.add(j.sourceUrl);
        return true;
      });

      logger.info(`Found ${uniqueJobs.length} career page jobs`);
      return uniqueJobs;
    } catch (error) {
      logger.error('Error scraping career pages', { error });
      return [];
    }
  }

  /**
   * Scrape Top Israeli Companies via Greenhouse/Lever/Ashby APIs
   * Delegates to companyDiscoveryService which has the curated company list
   */
  private async scrapeTopCompanies(keywords: string[], _location: string): Promise<ScrapedJob[]> {
    try {
      logger.info('Scraping Top Israeli Companies career pages', { keywords });
      const results = await companyDiscoveryService.scanTopCompanyCareers(keywords);

      // Flatten all jobs from all companies into ScrapedJob format
      const jobs: ScrapedJob[] = [];
      for (const companyResult of results) {
        if (companyResult.jobs && companyResult.jobs.length > 0) {
          for (const job of companyResult.jobs) {
            jobs.push({
              title: job.title,
              company: job.company || companyResult.company,
              location: job.location || 'Israel',
              locationType: job.locationType || 'hybrid',
              description: (job.description || '').substring(0, 500),
              sourceUrl: job.sourceUrl || '',
              source: 'TOP_COMPANIES',
              postedAt: job.postedAt ? new Date(job.postedAt) : undefined,
            });
          }
        }
      }

      logger.info(`Found ${jobs.length} jobs from Top Israeli Companies`);
      return jobs;
    } catch (error) {
      logger.error('Error scraping Top Israeli Companies', { error });
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
    const [indeedJobs, drushimJobs, allJobsJobs, googleJobs, careerPageJobs, topCompanyJobs] = await Promise.all([
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
      this.scrapeCareerPages(searchTerms, searchLocation).catch((err) => {
        logger.error('Career pages scraper failed', err);
        return [];
      }),
      this.scrapeTopCompanies(searchTerms, searchLocation).catch((err) => {
        logger.error('Top Companies scraper failed', err);
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

    results.push({
      source: 'COMPANY_CAREER_PAGE',
      jobs: careerPageJobs,
      count: careerPageJobs.length,
      timestamp: new Date(),
    });

    results.push({
      source: 'TOP_COMPANIES',
      jobs: topCompanyJobs,
      count: topCompanyJobs.length,
      timestamp: new Date(),
    });

    const totalJobs = indeedJobs.length + drushimJobs.length + allJobsJobs.length + googleJobs.length + careerPageJobs.length + topCompanyJobs.length;
    logger.info(`Scraping completed. Total jobs found: ${totalJobs}`, {
      indeed: indeedJobs.length,
      drushim: drushimJobs.length,
      alljobs: allJobsJobs.length,
      googleJobs: googleJobs.length,
      careerPages: careerPageJobs.length,
      topCompanies: topCompanyJobs.length,
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
      case 'COMPANY_CAREER_PAGE':
        jobs = await this.scrapeCareerPages(searchTerms, searchLocation);
        break;
      case 'TOP_COMPANIES':
        jobs = await this.scrapeTopCompanies(searchTerms, searchLocation);
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
