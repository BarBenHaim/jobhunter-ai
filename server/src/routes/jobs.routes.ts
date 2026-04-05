import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { jobService } from '../services/job.service';
import { scrapingQueue } from '../queue';
import logger from '../utils/logger';

const router = Router();

router.use(authMiddleware);

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
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('sort').optional().isString(),
    query('order').optional().isIn(['asc', 'desc']),
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

    const filters = {
      source: req.query.source as string | undefined,
      dateFrom: req.query.dateFrom ? new Date(req.query.dateFrom as string) : undefined,
      dateTo: req.query.dateTo ? new Date(req.query.dateTo as string) : undefined,
      minScore: req.query.minScore ? parseFloat(req.query.minScore as string) : undefined,
      maxScore: req.query.maxScore ? parseFloat(req.query.maxScore as string) : undefined,
      title: req.query.search as string | undefined,
    };

    const pagination = {
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
      offset: req.query.page ? (parseInt(req.query.page as string, 10) - 1) * 20 : 0,
      sortBy: req.query.sort as string | undefined,
      sortOrder: (req.query.order as 'asc' | 'desc') || 'desc',
    };

    const result = await jobService.listJobs(req.userId!, filters, pagination);

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

// GET /api/jobs/:id - Get job detail with scores
router.get(
  '/:id',
  [param('id').isString().notEmpty()],
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

    const job = await jobService.getJob(req.params.id);
    res.status(200).json({
      success: true,
      data: job,
    });
  })
);

// POST /api/jobs/scrape-now - Trigger immediate scrape
router.post(
  '/scrape-now',
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

// GET /api/jobs/stats - Scraping stats
router.get(
  '/stats',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const stats = await jobService.getScrapingStats();
    res.status(200).json({
      success: true,
      data: stats,
    });
  })
);

// DELETE /api/jobs/expired - Clean expired listings
router.delete(
  '/expired',
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
