/**
 * Scraper Manager / Orchestrator
 * Manages all scrapers, handles scheduling, queuing, and aggregation
 * - Register and manage scraper instances
 * - Run scrapers on schedule
 * - Handle scraper queue (Bull)
 * - Aggregate results and deduplicate
 * - Health monitoring
 * - Statistics and metrics
 */

import CronParser from 'cron-parser';
import logger from '../utils/logger';
import { jobService } from '../services/job.service';
import { IScraper, ScraperQuery, RawJob, JobSource, ScraperManagerConfig } from './types';
import { LinkedInScraper } from './linkedin.scraper';
import { IndeedScraper } from './indeed.scraper';
import { AllJobsScraper } from './alljobs.scraper';
import { DrushimScraper } from './drushim.scraper';
import { WellfoundScraper } from './wellfound.scraper';
import { GoogleJobsScraper } from './google-jobs.scraper';
import { CompanyPageScraper } from './company-page.scraper';

interface ScheduledTask {
  source: JobSource;
  cronExpression: string;
  lastRun?: Date;
  nextRun?: Date;
  active: boolean;
}

export class ScraperManager {
  private scrapers: Map<JobSource, IScraper> = new Map();
  private scheduledTasks: Map<JobSource, ScheduledTask> = new Map();
  private config: ScraperManagerConfig;
  private isRunning: boolean = false;
  private schedulerInterval?: NodeJS.Timeout;

  constructor(config: Partial<ScraperManagerConfig> = {}) {
    this.config = {
      maxConcurrentScrapers: 3,
      queueBatchSize: 10,
      defaultTimeout: 30000,
      enableMetrics: true,
      enableLogging: true,
      ...config,
    };

    logger.info('ScraperManager initialized', { config: this.config });
  }

  /**
   * Initialize all scrapers
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing scrapers...');

      // Register default scrapers
      this.registerScraper(JobSource.LINKEDIN, new LinkedInScraper());
      this.registerScraper(JobSource.INDEED, new IndeedScraper());
      this.registerScraper(JobSource.ALLJOBS, new AllJobsScraper());
      this.registerScraper(JobSource.DRUSHIM, new DrushimScraper());
      this.registerScraper(JobSource.WELLFOUND, new WellfoundScraper());
      this.registerScraper(JobSource.GOOGLE_JOBS, new GoogleJobsScraper());
      this.registerScraper(JobSource.COMPANY_CAREER_PAGE, new CompanyPageScraper());

      // Initialize all scrapers
      for (const scraper of this.scrapers.values()) {
        try {
          await scraper.initialize();
        } catch (error) {
          logger.warn(`Failed to initialize ${scraper.name}:`, error);
        }
      }

      logger.info(`Initialized ${this.scrapers.size} scrapers`);
    } catch (error) {
      logger.error('Error initializing scrapers:', error);
      throw error;
    }
  }

  /**
   * Shutdown all scrapers
   */
  async shutdown(): Promise<void> {
    try {
      logger.info('Shutting down scrapers...');

      // Stop scheduler
      if (this.schedulerInterval) {
        clearInterval(this.schedulerInterval);
      }

      // Shutdown all scrapers
      for (const scraper of this.scrapers.values()) {
        try {
          await scraper.shutdown();
        } catch (error) {
          logger.warn(`Error shutting down ${scraper.name}:`, error);
        }
      }

      logger.info('ScraperManager shutdown complete');
    } catch (error) {
      logger.error('Error during shutdown:', error);
      throw error;
    }
  }

  /**
   * Register a scraper
   */
  registerScraper(source: JobSource, scraper: IScraper): void {
    this.scrapers.set(source, scraper);
    logger.info(`Registered scraper: ${scraper.name}`);
  }

  /**
   * Start the scheduler
   */
  startScheduler(): void {
    if (this.isRunning) {
      logger.warn('Scheduler is already running');
      return;
    }

    logger.info('Starting scheduler...');
    this.isRunning = true;

    // Check for scheduled tasks every minute
    this.schedulerInterval = setInterval(() => {
      this.checkAndRunScheduledTasks();
    }, 60000);

    logger.info('Scheduler started');
  }

  /**
   * Stop the scheduler
   */
  stopScheduler(): void {
    if (!this.isRunning) {
      logger.warn('Scheduler is not running');
      return;
    }

    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
    }

    this.isRunning = false;
    logger.info('Scheduler stopped');
  }

  /**
   * Schedule a scraper
   */
  scheduleScraper(source: JobSource, cronExpression: string): void {
    try {
      // Validate cron expression
      const parser = new CronParser(cronExpression);
      const nextRun = parser.next().toDate();

      this.scheduledTasks.set(source, {
        source,
        cronExpression,
        nextRun,
        active: true,
      });

      logger.info(`Scheduled scraper ${source} with cron: ${cronExpression}, next run: ${nextRun}`);
    } catch (error) {
      logger.error(`Invalid cron expression for ${source}: ${cronExpression}`, error);
      throw error;
    }
  }

  /**
   * Schedule multiple scrapers
   */
  scheduleScrapers(schedules: Array<{ source: JobSource; cronExpression: string }>): void {
    for (const schedule of schedules) {
      this.scheduleScraper(schedule.source, schedule.cronExpression);
    }
  }

  /**
   * Unschedule a scraper
   */
  unscheduleScraper(source: JobSource): void {
    this.scheduledTasks.delete(source);
    logger.info(`Unscheduled scraper ${source}`);
  }

  /**
   * Check and run scheduled tasks
   */
  private async checkAndRunScheduledTasks(): Promise<void> {
    const now = new Date();

    for (const task of this.scheduledTasks.values()) {
      if (!task.active || !task.nextRun || task.nextRun > now) {
        continue;
      }

      logger.info(`Running scheduled scraper: ${task.source}`);

      // Run in background, don't wait
      this.runScraper(task.source, { keywords: ['jobs'] }).catch((error) => {
        logger.error(`Error running scheduled scraper ${task.source}:`, error);
      });

      // Update next run time
      try {
        const parser = new CronParser(task.cronExpression);
        task.nextRun = parser.next().toDate();
        task.lastRun = now;
      } catch (error) {
        logger.error(`Error calculating next run for ${task.source}:`, error);
      }
    }
  }

  /**
   * Run a single scraper
   */
  async runScraper(source: JobSource, query: ScraperQuery): Promise<RawJob[]> {
    const scraper = this.scrapers.get(source);

    if (!scraper) {
      logger.error(`Scraper not found: ${source}`);
      throw new Error(`Scraper not found: ${source}`);
    }

    try {
      logger.info(`Running scraper: ${scraper.name}`, { query });

      const startTime = Date.now();
      const jobs = await scraper.scrape(query);
      const duration = Date.now() - startTime;

      logger.info(`Scraper completed: ${scraper.name}`, {
        jobsFound: jobs.length,
        duration: `${duration}ms`,
      });

      // Store jobs in database
      await this.storeJobs(jobs);

      return jobs;
    } catch (error) {
      logger.error(`Error running scraper ${scraper.name}:`, error);
      throw error;
    }
  }

  /**
   * Run multiple scrapers in parallel
   */
  async runScrapers(sources: JobSource[], query: ScraperQuery): Promise<RawJob[]> {
    const allJobs: RawJob[] = [];

    try {
      logger.info(`Running ${sources.length} scrapers in parallel`);

      // Split into batches to respect max concurrent limit
      const batches = this.createBatches(sources, this.config.maxConcurrentScrapers);

      for (const batch of batches) {
        const promises = batch.map((source) => this.runScraper(source, query).catch((error) => {
          logger.warn(`Scraper ${source} failed: ${error}`);
          return [];
        }));

        const results = await Promise.all(promises);
        for (const jobs of results) {
          allJobs.push(...jobs);
        }
      }

      logger.info(`All scrapers completed`, { totalJobs: allJobs.length });
      return allJobs;
    } catch (error) {
      logger.error('Error running multiple scrapers:', error);
      throw error;
    }
  }

  /**
   * Run all enabled scrapers
   */
  async runAllScrapers(query: ScraperQuery): Promise<RawJob[]> {
    const sources = Array.from(this.scrapers.keys());
    return this.runScrapers(sources, query);
  }

  /**
   * Get health status of all scrapers
   */
  async getHealthStatus(): Promise<Record<string, any>> {
    const status: Record<string, any> = {
      timestamp: new Date(),
      scrapers: {},
    };

    for (const [source, scraper] of this.scrapers) {
      try {
        const healthCheck = await scraper.healthCheck();
        status.scrapers[source] = healthCheck;
      } catch (error) {
        status.scrapers[source] = {
          healthy: false,
          message: `Health check failed: ${error}`,
          lastCheck: new Date(),
        };
      }
    }

    return status;
  }

  /**
   * Get statistics for all scrapers
   */
  getStatistics(): Record<string, any> {
    const stats: Record<string, any> = {
      timestamp: new Date(),
      scrapers: {},
    };

    for (const [source, scraper] of this.scrapers) {
      stats.scrapers[source] = scraper.getStats();
    }

    return stats;
  }

  /**
   * Get scheduled tasks
   */
  getScheduledTasks(): ScheduledTask[] {
    return Array.from(this.scheduledTasks.values());
  }

  /**
   * Store scraped jobs in database
   */
  private async storeJobs(jobs: RawJob[]): Promise<void> {
    let created = 0;
    let updated = 0;
    let duplicates = 0;

    for (const job of jobs) {
      try {
        // Check if job is duplicate
        const isDuplicate = await jobService.deduplicateJob({
          externalId: job.externalId,
          source: job.source,
          sourceUrl: job.sourceUrl,
          title: job.title,
          company: job.company,
          companyUrl: job.companyUrl,
          location: job.location || '',
          locationType: job.locationType || 'on-site',
          description: job.description,
          requirements: job.requirements,
          salary: job.salary,
          experienceLevel: job.experienceLevel,
          postedAt: job.postedAt,
          rawData: job.rawData,
        });

        if (isDuplicate) {
          duplicates++;
          continue;
        }

        // Create job in database
        await jobService.createJob({
          externalId: job.externalId,
          source: job.source,
          sourceUrl: job.sourceUrl,
          title: job.title,
          company: job.company,
          companyUrl: job.companyUrl,
          location: job.location || '',
          locationType: job.locationType || 'on-site',
          description: job.description,
          requirements: job.requirements,
          salary: job.salary,
          experienceLevel: job.experienceLevel,
          postedAt: job.postedAt,
          rawData: job.rawData,
        });

        created++;
      } catch (error) {
        logger.warn(`Error storing job: ${error}`);
        continue;
      }
    }

    logger.info(`Jobs stored`, { created, duplicates, total: jobs.length });
  }

  /**
   * Split array into batches
   */
  private createBatches<T>(array: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }
}

/**
 * Singleton instance
 */
let scraperManager: ScraperManager;

export async function getScraperManager(): Promise<ScraperManager> {
  if (!scraperManager) {
    scraperManager = new ScraperManager();
    await scraperManager.initialize();
  }
  return scraperManager;
}

export { ScraperManager };
