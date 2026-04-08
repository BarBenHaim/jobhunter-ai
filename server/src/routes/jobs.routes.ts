import { Router, Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { jobService } from '../services/job.service';
import { scrapingQueue } from '../queue';
import logger from '../utils/logger';

const router = Router();

// ============================================================
// PUBLIC endpoints (no auth required for reading jobs)
// ============================================================

// GET /api/jobs - List jobs with query params
router.get(
  '/',
  [
    query('source').optional().isString(),
    query('dateFrom').optional().isISO8601(),
    query('dateTo').optional().isISO8601(),
    query('minScore').optional().isFloat(),
    query('maxScore').optional().isFloat(),
    query('search').optional().isString(),
    query('locationType').optional().isString(),
    query('experienceLevel').optional().isString(),
    query('location').optional().isString(),
    query('datePosted').optional().isString(),
    query('searchSessionId').optional().isString(),
    query('minSmartScore').optional().isFloat({ min: 0, max: 100 }),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('sort').optional().isString(),
    query('order').optional().isIn(['asc', 'desc']),
  ],
  asyncHandler(async (req: Request, res: Response) => {
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

    // Convert datePosted shorthand ('24h', '7d', '30d') to dateFrom
    let dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined;
    const datePosted = req.query.datePosted as string | undefined;
    if (datePosted && !dateFrom) {
      const now = new Date();
      if (datePosted === '24h') {
        dateFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      } else if (datePosted === '7d') {
        dateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (datePosted === '30d') {
        dateFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }
    }

    const filters = {
      source: req.query.source as string | undefined,
      dateFrom,
      dateTo: req.query.dateTo ? new Date(req.query.dateTo as string) : undefined,
      minScore: req.query.minScore ? parseFloat(req.query.minScore as string) : undefined,
      maxScore: req.query.maxScore ? parseFloat(req.query.maxScore as string) : undefined,
      title: req.query.search as string | undefined,
      locationType: req.query.locationType as string | undefined,
      experienceLevel: req.query.experienceLevel as string | undefined,
      location: req.query.location as string | undefined,
      searchSessionId: req.query.searchSessionId as string | undefined,
      minSmartScore: req.query.minSmartScore ? parseFloat(req.query.minSmartScore as string) : undefined,
    } as any;

    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;

    const pagination = {
      limit,
      offset: (page - 1) * limit,
      sortBy: req.query.sort as string | undefined,
      sortOrder: (req.query.order as 'asc' | 'desc') || 'desc',
    };

    // Use a default userId for public access
    const userId = (req as any).userId || 'public';
    const result = await jobService.listJobs(userId, filters, pagination);

    res.status(200).json({
      success: true,
      data: result.data,
      meta: {
        total: result.total,
        page: Math.floor(result.offset / result.limit) + 1,
        limit: result.limit,
        pages: Math.ceil(result.total / result.limit),
        hasMore: result.hasMore,
      },
    });
  })
);

// GET /api/jobs/stats - Scraping stats (public)
router.get(
  '/stats',
  asyncHandler(async (req: Request, res: Response) => {
    const stats = await jobService.getScrapingStats();
    res.status(200).json({
      success: true,
      data: stats,
    });
  })
);

// GET /api/jobs/:id - Get job detail with scores (public)
router.get(
  '/:id',
  [param('id').isString().notEmpty()],
  asyncHandler(async (req: Request, res: Response) => {
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

    const job = await jobService.getJob(req.params.id);
    res.status(200).json({
      success: true,
      data: job,
    });
  })
);

// ============================================================
// PROTECTED endpoints (auth required)
// ============================================================

// POST /api/jobs/scrape-now - Trigger immediate scrape
router.post(
  '/scrape-now',
  authMiddleware,
  [
    body('sources').isArray().notEmpty().withMessage('Sources array is required'),
    body('sources.*').isString(),
    body('query').optional().isString(),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
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

    const jobIds: string[] = [];
    for (const source of req.body.sources) {
      const jobId = await scrapingQueue.add(
        {
          source,
          query: req.body.query,
          userId: req.userId,
          timestamp: new Date(),
        },
        {
          priority: 10,
          removeOnComplete: true,
        }
      );
      jobIds.push(jobId.toString());
    }

    res.status(202).json({
      success: true,
      message: 'Scraping jobs queued',
      data: {
        jobIds,
        jobCount: jobIds.length,
      },
    });
  })
);

// POST /api/jobs/add-source - Add company career page
router.post(
  '/add-source',
  authMiddleware,
  [
    body('company').isString().notEmpty().withMessage('Company is required'),
    body('url').isURL().withMessage('Valid URL is required'),
    body('selectors').optional().isObject(),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
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

    const source = await jobService.addCompanySource(req.body.url, req.body.company);
    res.status(201).json({
      success: true,
      data: source,
      message: 'Job source added successfully',
    });
  })
);

// DELETE /api/jobs/expired - Clean expired listings
router.delete(
  '/expired',
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await jobService.cleanExpired();
    res.status(200).json({
      success: true,
      data: result,
      message: 'Expired jobs cleaned',
    });
  })
);

export default router;
