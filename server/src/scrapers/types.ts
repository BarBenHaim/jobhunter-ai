/**
 * Scraper Framework Types
 * Defines the core interfaces for all job scrapers
 */

export enum JobSource {
  LINKEDIN = 'LINKEDIN',
  INDEED = 'INDEED',
  ALLJOBS = 'ALLJOBS',
  DRUSHIM = 'DRUSHIM',
  WELLFOUND = 'WELLFOUND',
  GOOGLE_JOBS = 'GOOGLE_JOBS',
  COMPANY_CAREER_PAGE = 'COMPANY_CAREER_PAGE',
}

/**
 * Query parameters for scraper execution
 */
export interface ScraperQuery {
  keywords: string[];
  location?: string;
  remote?: boolean;
  experienceLevel?: string;
  maxResults?: number;
  customFilters?: Record<string, any>;
}

/**
 * Raw job data extracted from scraper
 * Maps directly to JobData in types/index.ts
 */
export interface RawJob {
  externalId?: string;
  source: string;
  sourceUrl: string;
  title: string;
  company: string;
  companyUrl?: string;
  location?: string;
  locationType?: string;
  description: string;
  requirements?: string;
  salary?: Record<string, any>;
  experienceLevel?: string;
  postedAt?: Date;
  rawData: Record<string, any>;
}

/**
 * Configuration for individual scraper instances
 */
export interface ScraperConfig {
  enabled: boolean;
  rateLimit: number; // jobs per hour
  retryAttempts: number;
  proxy?: string;
  timeout?: number; // milliseconds
  headless?: boolean;
  customHeaders?: Record<string, string>;
}

/**
 * Scraper health check result
 */
export interface HealthCheckResult {
  healthy: boolean;
  lastCheck: Date;
  message?: string;
  failureCount?: number;
  circuitBreakerOpen?: boolean;
}

/**
 * Scraping session data for fingerprinting
 */
export interface ScraperSession {
  sessionId: string;
  userAgent: string;
  viewport: { width: number; height: number };
  timezone: string;
  locale: string;
  acceptLanguage: string;
  createdAt: Date;
  requestCount: number;
}

/**
 * Core Scraper Interface
 * All scrapers must implement this interface
 */
export interface IScraper {
  name: string;
  source: JobSource;
  config: ScraperConfig;

  /**
   * Main scraping method
   */
  scrape(query: ScraperQuery): Promise<RawJob[]>;

  /**
   * Health check to verify scraper can connect
   */
  healthCheck(): Promise<HealthCheckResult>;

  /**
   * Initialize scraper resources
   */
  initialize(): Promise<void>;

  /**
   * Clean up scraper resources
   */
  shutdown(): Promise<void>;

  /**
   * Get scraper stats
   */
  getStats(): ScraperStats;
}

/**
 * Scraper statistics
 */
export interface ScraperStats {
  name: string;
  source: JobSource;
  totalJobsScrapped: number;
  totalRequests: number;
  totalErrors: number;
  successRate: number;
  averageResponseTime: number;
  lastScrapeTime?: Date;
  circuitBreakerOpen: boolean;
  failureCount: number;
}

/**
 * Scraper manager configuration
 */
export interface ScraperManagerConfig {
  maxConcurrentScrapers: number;
  queueBatchSize: number;
  defaultTimeout: number;
  enableMetrics: boolean;
  enableLogging: boolean;
}

/**
 * Scraping job for queue
 */
export interface ScrapingJob {
  id: string;
  source: JobSource;
  query: ScraperQuery;
  priority: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: RawJob[];
  error?: string;
  retryCount: number;
}

/**
 * Company career page scraper config
 */
export interface CompanyPageConfig {
  name: string;
  url: string;
  selectors: {
    jobContainer: string;
    title: string;
    location: string;
    description: string;
    applyButton?: string;
    postedDate?: string;
  };
  atsType?: 'greenhouse' | 'lever' | 'workable' | 'generic';
  enabled: boolean;
}

/**
 * Common ATS (Applicant Tracking System) selectors
 */
export const ATS_SELECTORS = {
  greenhouse: {
    jobContainer: '[data-job-id]',
    title: '.opening__title, h2.position-title',
    location: '.job-location, .meta-information',
    description: '.job-description, .page-content',
    department: '.job-department',
  },
  lever: {
    jobContainer: '.js-postings-list .posting',
    title: '.posting-title, h2',
    location: '.posting-category[data-location]',
    description: '.posting-description, .content',
    department: '.posting-category[data-department]',
  },
  workable: {
    jobContainer: '.jobs-list-item, .job-item',
    title: '.job-title, h2.job__title',
    location: '.job-location, .job-meta',
    description: '.job-description, [data-target="job.description"]',
    department: '.job-department',
  },
  generic: {
    jobContainer: 'article, .job-card, [data-job-id], .job-item',
    title: 'h1, h2, .title, .job-title',
    location: '.location, .job-location, [data-location]',
    description: '.description, .content, main',
    applyButton: 'button[type="submit"], .apply-btn, a.apply',
  },
};

/**
 * User agent rotation list for fingerprinting
 */
export const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2.1 Safari/605.1.15',
];

/**
 * Viewport sizes for rotation
 */
export const VIEWPORT_SIZES = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
];

/**
 * Timezones for rotation
 */
export const TIMEZONES = [
  'America/New_York',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Australia/Sydney',
  'America/Los_Angeles',
  'Europe/Paris',
  'Asia/Singapore',
];
