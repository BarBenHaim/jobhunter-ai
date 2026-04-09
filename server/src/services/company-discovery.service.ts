import axios, { AxiosInstance } from 'axios';
import * as cheerio from 'cheerio';
import logger from '../utils/logger';

/**
 * Company Discovery Service
 *
 * Smart job discovery through two strategies:
 * 1. Funding Tracker — Find startups that recently raised money (= actively hiring)
 * 2. Top Companies — Curated list of strong tech companies in Israel to monitor
 *
 * For each company, checks their career page on known ATS platforms
 * (Greenhouse, Lever, Ashby, Comeet, Workday, etc.)
 */

export interface DiscoveredCompany {
  name: string;
  description: string;
  fundingInfo?: string;
  fundingAmount?: string;
  fundingDate?: string;
  fundingRound?: string;
  careers_url?: string;
  website?: string;
  category: 'recently_funded' | 'top_company' | 'unicorn' | 'growing';
  source: string;
}

export interface CareerPageJob {
  title: string;
  company: string;
  location: string;
  locationType: string;
  description: string;
  sourceUrl: string;
  source: string;
  postedAt?: Date;
  department?: string;
  atsProvider?: string;
}

// ============================================================
// CURATED LIST OF TOP ISRAELI TECH COMPANIES
// ============================================================
const TOP_ISRAELI_COMPANIES: Array<{
  name: string;
  slug: string;
  category: 'unicorn' | 'top_company' | 'growing';
  description: string;
  atsProvider: string;
  careersUrl: string;
}> = [
  // === Unicorns & Large Tech ===
  { name: 'Wiz', slug: 'wiz-inc', category: 'unicorn', description: 'Cloud security platform ($12B+ valuation)', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/wiz' },
  { name: 'Monday.com', slug: 'mondaycom', category: 'unicorn', description: 'Work OS platform (NASDAQ: MNDY)', atsProvider: 'comeet', careersUrl: 'https://monday.com/careers' },
  { name: 'Check Point', slug: 'checkpoint', category: 'unicorn', description: 'Cybersecurity (NASDAQ: CHKP)', atsProvider: 'workday', careersUrl: 'https://www.checkpoint.com/careers/' },
  { name: 'CyberArk', slug: 'cyberark', category: 'unicorn', description: 'Identity security (NASDAQ: CYBR)', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/cyberark' },
  { name: 'SentinelOne', slug: 'sentinelone', category: 'unicorn', description: 'AI-powered cybersecurity (NYSE: S)', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/sentinelone' },
  { name: 'Snyk', slug: 'snyk', category: 'unicorn', description: 'Developer security platform', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/snyk' },
  { name: 'Rapyd', slug: 'rapyd', category: 'unicorn', description: 'Fintech-as-a-Service platform', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/rapyd' },
  { name: 'Fireblocks', slug: 'fireblocks', category: 'unicorn', description: 'Digital asset infrastructure', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/fireblocks' },
  { name: 'Papaya Global', slug: 'papayaglobal', category: 'unicorn', description: 'Global payroll & workforce platform', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/papayaglobal' },
  { name: 'Cato Networks', slug: 'catonetworks', category: 'unicorn', description: 'SASE cloud networking security', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/catonetworks' },
  { name: 'Orca Security', slug: 'orcasecurity', category: 'unicorn', description: 'Cloud security platform', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/orcasecurity' },
  { name: 'Transmit Security', slug: 'transmitsecurity', category: 'unicorn', description: 'Passwordless identity platform', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/transmitsecurity' },

  // === Strong Growth Companies ===
  { name: 'Taboola', slug: 'taboola', category: 'top_company', description: 'Content discovery platform (NASDAQ: TBLA)', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/taboola' },
  { name: 'Outbrain', slug: 'outbrain', category: 'top_company', description: 'Content recommendation (NASDAQ: OB)', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/outbrain' },
  { name: 'IronSource (Unity)', slug: 'ironsource', category: 'top_company', description: 'App monetization (merged with Unity)', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/unity' },
  { name: 'AppsFlyer', slug: 'appsflyer', category: 'top_company', description: 'Mobile attribution & analytics', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/appsflyer' },
  { name: 'Tipalti', slug: 'tipalti', category: 'top_company', description: 'Finance automation platform', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/tipalti' },
  { name: 'Similarweb', slug: 'similarweb', category: 'top_company', description: 'Digital intelligence platform (NYSE: SMWB)', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/similarweb' },
  { name: 'Lightricks', slug: 'lightricks', category: 'top_company', description: 'AI-powered creativity tools (Facetune)', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/lightricks' },
  { name: 'Melio', slug: 'melio', category: 'top_company', description: 'B2B payments platform', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/melio' },
  { name: 'Deel', slug: 'deel', category: 'top_company', description: 'Global HR & payroll platform', atsProvider: 'ashby', careersUrl: 'https://jobs.ashbyhq.com/deel' },
  { name: 'Gong', slug: 'gong', category: 'top_company', description: 'Revenue intelligence platform', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/gong' },
  { name: 'Elementor', slug: 'elementor', category: 'top_company', description: 'WordPress website builder', atsProvider: 'comeet', careersUrl: 'https://elementor.com/careers/' },
  { name: 'Via', slug: 'via', category: 'top_company', description: 'Public transit technology', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/via' },
  { name: 'Riskified', slug: 'riskified', category: 'top_company', description: 'eCommerce fraud prevention (NYSE: RSKD)', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/riskified' },
  { name: 'Next Insurance', slug: 'nextinsurance', category: 'top_company', description: 'AI-powered small business insurance', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/nextinsurance' },
  { name: 'Verbit', slug: 'verbit', category: 'top_company', description: 'AI transcription & captioning', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/verbit' },

  // === Hot AI / Growing Startups ===
  { name: 'AI21 Labs', slug: 'ai21labs', category: 'growing', description: 'Large language model AI company', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/ai21labs' },
  { name: 'Talon.One', slug: 'talonone', category: 'growing', description: 'Promotion engine platform', atsProvider: 'lever', careersUrl: 'https://jobs.lever.co/talonone' },
  { name: 'Run:ai', slug: 'runai', category: 'growing', description: 'GPU orchestration for AI (acquired by NVIDIA)', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/runai' },
  { name: 'Fabric', slug: 'fabric', category: 'growing', description: 'AI commerce platform', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/commonsenserob' },
  { name: 'Wilco', slug: 'wilco', category: 'growing', description: 'Developer upskilling platform', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/wilco' },
  { name: 'Dazz', slug: 'dazz', category: 'growing', description: 'Cloud security remediation', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/dazz' },
  { name: 'Aqua Security', slug: 'aquasecurity', category: 'growing', description: 'Cloud native security', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/aquasecurity' },
  { name: 'Coralogix', slug: 'coralogix', category: 'growing', description: 'Observability platform', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/coralogix' },
  { name: 'BigPanda', slug: 'bigpanda', category: 'growing', description: 'AIOps event correlation', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/bigpanda' },
  { name: 'Spot.io (NetApp)', slug: 'spotio', category: 'growing', description: 'Cloud infrastructure optimization', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/netaborspot' },

  // === Additional Israeli Tech Companies ===
  { name: 'Wix', slug: 'wix', category: 'unicorn', description: 'Website builder platform (NASDAQ: WIX)', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/wix' },
  { name: 'JFrog', slug: 'jfrog', category: 'top_company', description: 'DevOps platform (NASDAQ: FROG)', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/jfrog' },
  { name: 'Hibob', slug: 'hibob', category: 'growing', description: 'HR platform for modern businesses', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/hibob' },
  { name: 'ironSource', slug: 'ironsource', category: 'top_company', description: 'App monetization platform', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/ironsource' },
  { name: 'Lemonade', slug: 'lemonade', category: 'top_company', description: 'AI insurance (NYSE: LMND)', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/lemonade' },
  { name: 'Fiverr', slug: 'fiverr', category: 'unicorn', description: 'Freelance marketplace (NYSE: FVRR)', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/fiverr' },
  { name: 'Forter', slug: 'forter', category: 'growing', description: 'eCommerce fraud prevention', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/forter' },
  { name: 'Fundbox', slug: 'fundbox', category: 'growing', description: 'B2B payments & credit platform', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/fundbox' },
  { name: 'Yotpo', slug: 'yotpo', category: 'top_company', description: 'eCommerce marketing platform', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/yotpo' },
  { name: 'Bizzabo', slug: 'bizzabo', category: 'growing', description: 'Event management platform', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/bizzabo' },
  { name: 'Payoneer', slug: 'payoneer', category: 'unicorn', description: 'Global payments (NASDAQ: PAYO)', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/payoneer' },
  { name: 'Varonis', slug: 'varonis', category: 'top_company', description: 'Data security (NASDAQ: VRNS)', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/varonis' },
  { name: 'Redis', slug: 'redis', category: 'top_company', description: 'In-memory database platform', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/redislabs' },
  { name: 'Honeybook', slug: 'honeybook', category: 'growing', description: 'Business management for entrepreneurs', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/honeybook' },
  { name: 'Cybereason', slug: 'cybereason', category: 'top_company', description: 'Endpoint security platform', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/cybereason' },
  { name: 'Placer.ai', slug: 'placerai', category: 'growing', description: 'Location analytics platform', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/placerai' },
  { name: 'Perion Network', slug: 'perion', category: 'top_company', description: 'Digital advertising (NASDAQ: PERI)', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/perion' },
  { name: 'Kaltura', slug: 'kaltura', category: 'top_company', description: 'Video experience platform', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/kaltura' },
  { name: 'Nayax', slug: 'nayax', category: 'growing', description: 'Cashless payment solutions (TASE: NYAX)', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/nayax' },
  { name: 'ControlUp', slug: 'controlup', category: 'growing', description: 'Digital employee experience', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/controlup' },
  { name: 'Augury', slug: 'augury', category: 'growing', description: 'Machine health AI platform', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/augaboraugury' },
  { name: 'Mobileye', slug: 'mobileye', category: 'unicorn', description: 'Autonomous driving (NASDAQ: MBLY, Intel)', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/maboretmobileye' },

  // === Global Companies with major Israel R&D (now using Greenhouse where possible) ===
  { name: 'Google Israel', slug: 'google', category: 'top_company', description: 'R&D center in Tel Aviv & Haifa', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/google' },
  { name: 'Microsoft Israel', slug: 'microsoft', category: 'top_company', description: 'R&D center in Herzliya & Tel Aviv', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/microsoftit' },
  { name: 'Meta Israel', slug: 'meta', category: 'top_company', description: 'R&D center in Tel Aviv', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/meta' },
  { name: 'Amazon Israel', slug: 'amazon', category: 'top_company', description: 'AWS & retail R&D in Israel', atsProvider: 'greenhouse', careersUrl: 'https://boards.greenhouse.io/amazon' },
];

// Unified Israel location regex — used across all ATS scrapers
const ISRAEL_LOCATION_REGEX = /israel|il\b|tel.?aviv|tlv|herzliya|hertzliya|ramat.?gan|haifa|jerusalem|beer.?sheva|bnei.?brak|petah.?tikva|rishon|netanya|rehovot|modiin|modi'in|kfar.?saba|hod.?hasharon|ra'anana|raanana|yokneam|yoqneam|nazareth|ashdod|ashkelon|lod|bat.?yam|givatayim|holon|kiryat|bnei|remote.*israel|israel.*remote/i;

class CompanyDiscoveryService {
  private axiosInstance: AxiosInstance;
  private readonly USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  constructor() {
    this.axiosInstance = axios.create({
      headers: { 'User-Agent': this.USER_AGENT },
      timeout: 30000,
    });
  }

  /**
   * Retry wrapper — retries a function up to N times with delay
   */
  private async withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 1000): Promise<T> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        if (attempt === retries) throw error;
        logger.warn(`Retry ${attempt + 1}/${retries} after error`, { error });
        await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)));
      }
    }
    throw new Error('Unreachable');
  }

  // ============================================================
  // 1. FUNDING TRACKER — Find recently funded startups
  // ============================================================

  /**
   * Use SerpAPI to search for recently funded Israeli startups
   */
  async discoverRecentlyFundedStartups(): Promise<DiscoveredCompany[]> {
    try {
      const serpApiKey = process.env.SERPAPI_KEY;
      if (!serpApiKey) {
        logger.info('SerpAPI key not configured, using Google search fallback for funding news');
        return this.discoverFundedStartupsViaGoogle();
      }

      logger.info('Searching for recently funded Israeli startups via SerpAPI');
      const companies: DiscoveredCompany[] = [];

      const queries = [
        'Israel startup raised funding 2026',
        'Israeli startup series A B C 2026',
        'Israel tech company funding round 2025 2026',
        'Israeli startup seed round 2026 hiring',
      ];

      for (const query of queries) {
        try {
          const response = await this.axiosInstance.get('https://serpapi.com/search', {
            params: {
              engine: 'google',
              q: query,
              api_key: serpApiKey,
              num: 10,
              tbs: 'qdr:m3', // Last 3 months
            },
          });

          const results = response.data.organic_results || [];
          for (const result of results) {
            const parsed = this.parseFundingResult(result);
            if (parsed) {
              companies.push(parsed);
            }
          }
        } catch (err) {
          logger.warn(`SerpAPI funding search failed for query: ${query}`, { error: err });
        }
      }

      // Also search SerpAPI news
      try {
        const newsResponse = await this.axiosInstance.get('https://serpapi.com/search', {
          params: {
            engine: 'google_news',
            q: 'Israel startup funding raised',
            api_key: serpApiKey,
          },
        });

        const newsResults = newsResponse.data.news_results || [];
        for (const result of newsResults) {
          const parsed = this.parseFundingNewsResult(result);
          if (parsed) {
            companies.push(parsed);
          }
        }
      } catch (err) {
        logger.warn('SerpAPI news search failed', { error: err });
      }

      // Deduplicate by company name
      const seen = new Set<string>();
      const unique = companies.filter(c => {
        const key = c.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      logger.info(`Discovered ${unique.length} recently funded startups`);
      return unique;
    } catch (error) {
      logger.error('Error discovering funded startups:', error);
      return [];
    }
  }

  /**
   * Fallback: Search Google directly for funding news
   */
  private async discoverFundedStartupsViaGoogle(): Promise<DiscoveredCompany[]> {
    try {
      const companies: DiscoveredCompany[] = [];
      const queries = [
        'Israel startup raised funding 2026 site:techcrunch.com OR site:calcalist.co.il OR site:geektime.co.il',
        'Israeli startup series funding 2025 2026 site:globes.co.il OR site:geektime.co.il',
      ];

      for (const query of queries) {
        try {
          const response = await this.axiosInstance.get(
            `https://www.google.com/search?q=${encodeURIComponent(query)}&num=15`,
            {
              headers: {
                'User-Agent': this.USER_AGENT,
                Accept: 'text/html',
                'Accept-Language': 'en-US,en;q=0.9,he;q=0.8',
              },
            }
          );

          const $ = cheerio.load(response.data);
          $('div.g, div[data-sokoban-container]').each((_, elem) => {
            try {
              const $result = $(elem);
              const title = $result.find('h3').first().text().trim();
              const snippet = $result.find('.VwiC3b, [data-sncf]').first().text().trim();
              const url = $result.find('a').first().attr('href') || '';

              if (!title) return;

              // Look for funding signals in title/snippet
              const fundingMatch = (title + ' ' + snippet).match(
                /(\$[\d.]+[MBK]|\$[\d.]+ ?(?:million|billion))/i
              );
              const companyMatch = title.match(
                /^(.+?)\s+(?:raises?|secures?|closes?|gets?|lands?|nabs?|bags?)/i
              );

              if (fundingMatch || companyMatch) {
                companies.push({
                  name: companyMatch ? companyMatch[1].trim() : title.split(' ').slice(0, 3).join(' '),
                  description: snippet.substring(0, 200),
                  fundingInfo: fundingMatch ? fundingMatch[1] : undefined,
                  category: 'recently_funded',
                  source: url,
                });
              }
            } catch (_err) {
              // Skip
            }
          });
        } catch (err) {
          logger.warn('Google search for funding failed', { error: err });
        }
      }

      return companies;
    } catch (error) {
      logger.error('Error in Google funding fallback:', error);
      return [];
    }
  }

  /**
   * Parse a SerpAPI organic search result for funding info
   */
  private parseFundingResult(result: any): DiscoveredCompany | null {
    const title = result.title || '';
    const snippet = result.snippet || '';
    const fullText = title + ' ' + snippet;

    // Look for funding signals
    const fundingMatch = fullText.match(/(\$[\d.]+[MBK]|\$[\d.]+ ?(?:million|billion))/i);
    const companyMatch = title.match(
      /^(.+?)\s+(?:raises?|secures?|closes?|gets?|lands?|announces?|nabs?)/i
    );
    const roundMatch = fullText.match(/(?:seed|series\s*[A-F]|pre-seed|growth)/i);

    if (!fundingMatch && !companyMatch) return null;

    return {
      name: companyMatch ? companyMatch[1].replace(/Israeli\s*/i, '').trim() : title.split(' ').slice(0, 3).join(' '),
      description: snippet.substring(0, 200),
      fundingAmount: fundingMatch ? fundingMatch[1] : undefined,
      fundingRound: roundMatch ? roundMatch[0] : undefined,
      category: 'recently_funded',
      source: result.link || '',
    };
  }

  /**
   * Parse a SerpAPI news result for funding info
   */
  private parseFundingNewsResult(result: any): DiscoveredCompany | null {
    const title = result.title || '';
    const snippet = result.snippet || result.description || '';
    const fullText = title + ' ' + snippet;

    const fundingMatch = fullText.match(/(\$[\d.]+[MBK]|\$[\d.]+ ?(?:million|billion))/i);
    const companyMatch = title.match(
      /^(.+?)\s+(?:raises?|secures?|closes?|gets?|lands?)/i
    );

    if (!fundingMatch && !companyMatch) return null;

    return {
      name: companyMatch ? companyMatch[1].replace(/Israeli\s*/i, '').trim() : title.split(' ').slice(0, 3).join(' '),
      description: snippet.substring(0, 200),
      fundingAmount: fundingMatch ? fundingMatch[1] : undefined,
      fundingDate: result.date,
      category: 'recently_funded',
      source: result.link || '',
    };
  }

  // ============================================================
  // 2. CAREER PAGE SCRAPING — Check ATS platforms for jobs
  // ============================================================

  /**
   * Scrape jobs from a Greenhouse board
   */
  async scrapeGreenhouseJobs(boardSlug: string, companyName: string): Promise<CareerPageJob[]> {
    try {
      return await this.withRetry(async () => {
        const url = `https://boards-api.greenhouse.io/v1/boards/${boardSlug}/jobs`;
        const response = await this.axiosInstance.get(url);
        const jobs: CareerPageJob[] = [];

        const jobList = response.data.jobs || [];
        for (const job of jobList) {
          const locations = job.location?.name || '';
          const isIsrael = ISRAEL_LOCATION_REGEX.test(locations);

          if (isIsrael) {
            jobs.push({
              title: job.title,
              company: companyName,
              location: locations,
              locationType: /remote/i.test(locations) ? 'REMOTE' : /hybrid/i.test(locations) ? 'HYBRID' : 'ONSITE',
              description: this.stripHtml(job.content || '').substring(0, 500),
              sourceUrl: job.absolute_url || `https://boards.greenhouse.io/${boardSlug}/jobs/${job.id}`,
              source: 'COMPANY_CAREER_PAGE',
              department: job.departments?.[0]?.name,
              atsProvider: 'greenhouse',
            });
          }
        }

        logger.info(`Greenhouse ${boardSlug}: Found ${jobs.length} Israel jobs out of ${jobList.length} total`);
        return jobs;
      });
    } catch (error) {
      logger.warn(`Failed to scrape Greenhouse board: ${boardSlug} (after retries)`, { error });
      return [];
    }
  }

  /**
   * Scrape jobs from a Lever board
   */
  async scrapeLeverJobs(companySlug: string, companyName: string): Promise<CareerPageJob[]> {
    try {
      return await this.withRetry(async () => {
        const url = `https://api.lever.co/v0/postings/${companySlug}?mode=json`;
        const response = await this.axiosInstance.get(url);
        const jobs: CareerPageJob[] = [];

        const postings = response.data || [];
        for (const posting of postings) {
          const location = posting.categories?.location || '';
          const isIsrael = ISRAEL_LOCATION_REGEX.test(location);

          if (isIsrael) {
            jobs.push({
              title: posting.text,
              company: companyName,
              location,
              locationType: /remote/i.test(location) ? 'REMOTE' : 'HYBRID',
              description: this.stripHtml(posting.descriptionPlain || posting.description || '').substring(0, 500),
              sourceUrl: posting.hostedUrl || posting.applyUrl || '',
              source: 'COMPANY_CAREER_PAGE',
              department: posting.categories?.team || posting.categories?.department,
              atsProvider: 'lever',
            });
          }
        }

        logger.info(`Lever ${companySlug}: Found ${jobs.length} Israel jobs out of ${postings.length} total`);
        return jobs;
      });
    } catch (error) {
      logger.warn(`Failed to scrape Lever board: ${companySlug} (after retries)`, { error });
      return [];
    }
  }

  /**
   * Scrape jobs from an Ashby board
   */
  async scrapeAshbyJobs(companySlug: string, companyName: string): Promise<CareerPageJob[]> {
    try {
      return await this.withRetry(async () => {
        const url = `https://api.ashbyhq.com/posting-api/job-board/${companySlug}`;
        const response = await this.axiosInstance.get(url);
        const jobs: CareerPageJob[] = [];

        const postings = response.data.jobs || [];
        for (const posting of postings) {
          const location = posting.location || posting.locationName || '';
          const isIsrael = ISRAEL_LOCATION_REGEX.test(location);

          if (isIsrael) {
            jobs.push({
              title: posting.title,
              company: companyName,
              location,
              locationType: /remote/i.test(location) ? 'REMOTE' : 'HYBRID',
              description: (posting.descriptionPlain || '').substring(0, 500),
              sourceUrl: `https://jobs.ashbyhq.com/${companySlug}/${posting.id}`,
              source: 'COMPANY_CAREER_PAGE',
              department: posting.departmentName,
              atsProvider: 'ashby',
            });
          }
        }

        logger.info(`Ashby ${companySlug}: Found ${jobs.length} Israel jobs`);
        return jobs;
      });
    } catch (error) {
      logger.warn(`Failed to scrape Ashby board: ${companySlug} (after retries)`, { error });
      return [];
    }
  }

  // ============================================================
  // 3. ORCHESTRATION — Scan all top companies for jobs
  // ============================================================

  /**
   * Get the full curated company list with categories
   */
  getTopCompanies(): typeof TOP_ISRAELI_COMPANIES {
    return TOP_ISRAELI_COMPANIES;
  }

  /**
   * Scan career pages of all curated top companies for relevant jobs
   * Optionally filter by keywords
   */
  async scanTopCompanyCareers(
    keywords: string[] = [],
    categories?: string[]
  ): Promise<{ company: string; jobs: CareerPageJob[]; error?: string }[]> {
    logger.info('Scanning top company career pages', { keywords, categories });

    const results: { company: string; jobs: CareerPageJob[]; error?: string }[] = [];

    // Filter companies by category if specified
    let companies = TOP_ISRAELI_COMPANIES;
    if (categories && categories.length > 0) {
      companies = companies.filter(c => categories.includes(c.category));
    }

    // Process in batches of 5 to avoid rate limiting
    const batchSize = 5;
    for (let i = 0; i < companies.length; i += batchSize) {
      const batch = companies.slice(i, i + batchSize);

      const batchResults = await Promise.all(
        batch.map(async (company) => {
          try {
            let jobs: CareerPageJob[] = [];

            switch (company.atsProvider) {
              case 'greenhouse': {
                // Extract board slug from URL
                const slug = company.careersUrl.replace('https://boards.greenhouse.io/', '');
                jobs = await this.scrapeGreenhouseJobs(slug, company.name);
                break;
              }
              case 'lever': {
                const slug = company.careersUrl.replace('https://jobs.lever.co/', '');
                jobs = await this.scrapeLeverJobs(slug, company.name);
                break;
              }
              case 'ashby': {
                const slug = company.careersUrl.replace('https://jobs.ashbyhq.com/', '');
                jobs = await this.scrapeAshbyJobs(slug, company.name);
                break;
              }
              case 'comeet':
              case 'workday':
              default:
                // Comeet, Workday, and truly custom career pages — no API available
                // These are included for reference / manual browsing
                logger.debug(`Skipping ${company.name} (${company.atsProvider}) — no API scraper`);
                break;
            }

            // Filter by keywords if provided — use loose matching
            // Each keyword is split into words, and a job matches if ANY word from ANY keyword appears
            if (keywords.length > 0 && jobs.length > 0) {
              const kwWords = new Set<string>();
              for (const kw of keywords) {
                for (const word of kw.toLowerCase().split(/\s+/)) {
                  if (word.length >= 3) kwWords.add(word); // Skip very short words
                }
              }
              if (kwWords.size > 0) {
                jobs = jobs.filter(j => {
                  const text = `${j.title} ${j.description} ${j.department || ''}`.toLowerCase();
                  // Job matches if it contains at least 1 keyword word
                  return [...kwWords].some(word => text.includes(word));
                });
              }
            }

            return { company: company.name, jobs, error: undefined };
          } catch (error: any) {
            return { company: company.name, jobs: [], error: error.message };
          }
        })
      );

      results.push(...batchResults);

      // Small delay between batches
      if (i + batchSize < companies.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    const totalJobs = results.reduce((sum, r) => sum + r.jobs.length, 0);
    const companiesWithJobs = results.filter(r => r.jobs.length > 0).length;
    logger.info(`Top company scan complete: ${totalJobs} Israel jobs from ${companiesWithJobs} companies`);

    return results;
  }

  /**
   * Discover funded startups AND check their career pages
   */
  async discoverAndScan(keywords: string[] = []): Promise<{
    fundedStartups: DiscoveredCompany[];
    topCompanyJobs: { company: string; jobs: CareerPageJob[] }[];
    totalJobs: number;
  }> {
    logger.info('Running full company discovery + career scan');

    // Run both in parallel
    const [fundedStartups, topCompanyResults] = await Promise.all([
      this.discoverRecentlyFundedStartups(),
      this.scanTopCompanyCareers(keywords),
    ]);

    const topCompanyJobs = topCompanyResults.filter(r => r.jobs.length > 0);
    const totalJobs = topCompanyJobs.reduce((sum, r) => sum + r.jobs.length, 0);

    return { fundedStartups, topCompanyJobs, totalJobs };
  }

  /**
   * Helper: Strip HTML tags
   */
  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}

export const companyDiscoveryService = new CompanyDiscoveryService();
