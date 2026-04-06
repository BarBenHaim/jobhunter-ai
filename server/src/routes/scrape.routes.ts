import { Router, Response } from 'express';
import { body, query, validationResult } from 'express-validator';
import { asyncHandler } from '../middleware/errorHandler';
import { lightweightScraperService } from '../services/lightweight-scraper.service';
import { jobService } from '../services/job.service';
import logger from '../utils/logger';

const router = Router();

// In-memory cache for scraping stats
const scrapingStats = {
  lastScrapeTime: null as Date | null,
  lastJobCount: 0,
  totalScrapesRun: 0,
  sourceStats: {} as Record<string, { count: number; timestamp: Date }>,
};

/**
 * POST /api/scrape/trigger
 * Trigger immediate scraping with given keywords and location
 * Scrapes all sources in parallel and stores results in database
 */
router.post(
  '/trigger',
  [
    body('keywords')
      .optional()
      .isArray()
      .withMessage('Keywords must be an array')
      .custom((val) => {
        if (Array.isArray(val) && val.every((item) => typeof item === 'string')) {
          return true;
        }
        throw new Error('All keywords must be strings');
      }),
    body('location')
      .optional()
      .isString()
      .trim()
      .withMessage('Location must be a string'),
  ],
  asyncHandler(async (req: any, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          details: errors.array(),
        },
      });
      return;
    }

    const keywords = req.body.keywords || ['software engineer', 'developer', 'fullstack'];
    const location = req.body.location || 'Israel';

    logger.info('Scraping triggered', { keywords, location });

    try {
      // Run scrapers
      const results = await lightweightScraperService.scrapeAll(keywords, location);

      // Store results in database
      let totalJobsCreated = 0;
      const createdJobs = [];

      for (const result of results) {
        for (const job of result.jobs) {
          try {
            const createdJob = await jobService.createJob({
              ...job,
              source: result.source,
            });
            createdJobs.push({
              id: createdJob.id,
              title: createdJob.title,
              company: createdJob.company,
              source: result.source,
            });
            totalJobsCreated++;
          } catch (err) {
            // Log error but continue with next job
            logger.warn(`Failed to create job: ${job.title}`, { error: err });
          }
        }
      }

      // Update stats
      scrapingStats.lastScrapeTime = new Date();
      scrapingStats.lastJobCount = totalJobsCreated;
      scrapingStats.totalScrapesRun++;

      for (const result of results) {
        scrapingStats.sourceStats[result.source] = {
          count: result.count,
          timestamp: result.timestamp,
        };
      }

      res.status(200).json({
        success: true,
        message: `Scraping completed. ${totalJobsCreated} new jobs added.`,
        data: {
          totalJobsCreated,
          jobsCreated: createdJobs,
          sourceBreakdown: results.map((r) => ({
            source: r.source,
            scrapedCount: r.count,
            timestamp: r.timestamp,
          })),
          keywords,
          location,
        },
      });
    } catch (error) {
      logger.error('Error during scraping', { error });
      res.status(500).json({
        success: false,
        error: {
          code: 'SCRAPING_ERROR',
          message: 'An error occurred during scraping',
        },
      });
    }
  })
);

/**
 * POST /api/scrape/single
 * Scrape a single source
 */
router.post(
  '/single',
  [
    body('source')
      .isString()
      .notEmpty()
      .withMessage('Source is required')
      .isIn(['INDEED', 'DRUSHIM', 'ALLJOBS', 'GOOGLE_JOBS'])
      .withMessage('Invalid source'),
    body('keywords')
      .optional()
      .isArray()
      .withMessag¢tKeywords must be an array'),
    body('location')
      .optional()
      .isString()
      .trim()
      .withMessage('Location must be a string'),
  ],
  asyncHandler(async (req: any, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          details: errors.array(),
        },
      });
      return;
    }

    const source = req.body.source;
    const keywords = req.body.keywords || ['software engineer', 'developer'];
    const location = req.body.location || 'Israel';

    logger.info('Single source scraping triggered', { source, keywords, location });

    try {
      // Run single scraper
      const result = await lightweightScraperService.scrapeSource(source, keywords, location);

      // Store results in database
      let totalJobsCreated = 0;
      const createdJobs = [];

      for (const job of result.jobs) {
        try {
          const createdJob = await jobService.createJob({
            ...job,
            source: result.source,
          });
          createdJobs.push({
            id: createdJob.id,
            title: createdJob.title,
            company: createdJob.company,
          });
          totalJobsCreated++;
        } catch (err) {
          logger.warn(`Failed to create job from ${source}`, { error: err });
        }
      }

      res.status(200).json({
        success: true,
        message: `Scraping ${source} completed. ${totalJobsCreated} new jobs added.`,
        data: {
          source,
          scrapedCount: result.count,
          createdCount: totalJobsCreated,
          jobsCreated: createdJobs,
          timestamp: result.timestamp,
        },
      });
    } catch (error) {
      logger.error(`Error scraping ${source}`, { error });
      res.status(500).json({
        success: false,
        error: {
          code: 'SCRAPING_ERROR',
          message: `An error occurred while scraping ${source}`,
        },
      });
    }
  })
);

/**
 * GET /api/scrape/status
 * Returns scraping statistics and last scrape info
 */
router.get(
  '/status',
  asyncHandler(async (req: any, res: Response) => {
    try {
      logger.info('Scraping status requested');

      // Get DB stats
      const dbStats = await jobService.getScrapingStats();

      res.status(200).json({
        success: true,
        data: {
          currentStats: scrapingStats,
          databaseStats: dbStats,
          availableSources: ['INDEED', 'DRUSHIM', 'ALLJOBS', 'GOOGLE_JOBS'],
          lastScraped: scrapingStats.lastScrapeTime,
          totalScrapesRun: scrapingStats.totalScrapesRun,
          totalJobsInDB: Object.values(dbStats).reduce(
            (sum: number, stat: any) => sum + stat.totalJobs,
            0
          ),
        },
      });
    } catch (error) {
      logger.error('Error getting scraping status', { error });
      res.status(500).json({
        success: false,
        error: {
          code: 'STATUS_ERROR',
          message: 'An error occurred while retrieving scraping status',
        },
      });
    }
  })
);

/**
 * GET /api/scrape/sources
 * Get list of available scraping sources
 */
router.get(
  '/sources',
  asyncHandler(async (req: any, res: Response) => {
    res.status(200).json({
      success: true,
      data: {
        sources: [
          {
            id: 'INDEED',
            name: 'Indeed Israel',
            url: 'https://il.indeed.com',
            description: 'Scrapes job listings from Indeed Israel',
            available: true,
          },
          {
            id: 'DRUSHIM',
            name: 'Drushim',
            url: 'https://www.drushim.co.il',
            description: 'Uses Drushim public API for job listings',
            available: true,
          },
          {
            id: 'ALLJOBS',
            name: 'AllJobs',
            url: 'https://www.alljobs.co.il',
            description: 'Scrapes job listings from AllJobs',
            available: true,
          },
          {
            id: 'GOOGLE_JOBS',
            name: 'Google Jobs',
            url: 'https://www.google.com/jobs',
            description: 'Uses SerpAPI to fetch Google Jobs results',
            available: !!process.env.SERPAPI_KEY,
            requiresApiKey: 'SERPAPI_KEY',
          },
        ],
      },
    });
  })
);

/**
 * GET /api/scrape/test/:source
 * Test a single scraper without storing results
 */
router.get(
  '/test/:source',
  [
    query('keywords')
      .optional()
      .isString()
      .withMessage('Keywords must be a string (comma-separated)'),
    query('location')
      .optional()
      .isString()
      .withMessage('Location must be a string'),
  ],
  asyncHandler(async (req: any, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          details: errors.array(),
        },
      });
      return;
    }

    const source = req.params.source?.toUpperCase();
    const keywordsStr = req.query.keywords || 'software engineer';
    const location = req.query.location || 'Israel';

    const keywords = typeof keywordsStr === 'string'
      ? keywordsStr.split(',').map((k) => k.trim())
      : ['software engineer'];

    logger.info(`Testing scraper: ${source}`, { keywords, location });

    try {
      const result = await lightweightScraperService.scrapeSource(source, keywords, location);

      // Only return first 5 jobs for testing
      const sampleJobs = result.jobs.slice(0, 5);

      res.status(200).json({
        success: true,
        message: `Test scrape for ${source} completed`,
        data: {
          source: result.source,
          totalFound: result.count,
          sampleSize: sampleJobs.length,
          sampleJobs,
          timestamp: result.timestamp,
          error: result.error,
        },
      });
    } catch (error) {
      logger.error(`Error testing scraper ${source}`, { error });
      res.status(500).json({
        success: false,
        error: {
          code: 'SCRAPING_ERROR',
          message: `Test scrape for ${source} failed`,
        },
      });
    }
  })
);

export default router;
