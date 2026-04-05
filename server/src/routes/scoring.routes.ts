import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { scoringService } from '../services/scoring.service';
import { scoringQueue } from '../queue';
import prisma from '../db/prisma';
import logger from '../utils/logger';

const router = Router();

router.use(authMiddleware);

// POST /api/scoring/score-job - Score single job
router.post(
  '/score-job',
  [
    body('jobId').isString().notEmpty().withMessage('Job ID is required'),
    body('personaId').optional().isString(),
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

    const job = await prisma.job.findUnique({
      where: { id: req.body.jobId },
    });

    if (!job) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Job not found',
        },
      });
      return;
    }

    // Queue the scoring job
    const queueJobId = await scoringQueue.add(
      {
        jobId: req.body.jobId,
        personaId: req.body.personaId,
        userId: req.userId,
      },
      {
        priority: 5,
        removeOnComplete: true,
      }
    );

    res.status(202).json({
      success: true,
      message: 'Job queued for scoring',
      data: {
        jobId: req.body.jobId,
        queueId: queueJobId.toString(),
      },
    });
  })
);

// POST /api/scoring/batch - Score all unscored
router.post(
  '/batch',
  [
    query('limit').optional().isInt({ min: 1, max: 1000 }),
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

    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;

    // Get unscored jobs
    const unscoredJobs = await prisma.job.findMany({
      where: {
        scores: {
          none: {},
        },
        isActive: true,
      },
      select: { id: true },
      take: limit,
    });

    const jobIds = unscoredJobs.map(j => j.id);

    // Queue all for scoring
    const queueJobIds: string[] = [];
    for (const jobId of jobIds) {
      const queueJob = await scoringQueue.add(
        { jobId, userId: req.userId },
        { removeOnComplete: true }
      );
      queueJobIds.push(queueJob.toString());
    }

    res.status(202).json({
      success: true,
      message: `${jobIds.length} jobs queued for scoring`,
      data: {
        jobCount: jobIds.length,
        queueJobIds,
      },
    });
  })
);

// GET /api/scoring/rules/:personaId - Get rules
router.get(
  '/rules/:personaId',
  [param('personaId').isString().notEmpty()],
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

    const rules = await prisma.scoringRule.findMany({
      where: { personaId: req.params.personaId },
    });

    res.status(200).json({
      success: true,
      data: rules,
      meta: {
        total: rules.length,
      },
    });
  })
);

// POST /api/scoring/rules - Add rule
router.post(
  '/rules',
  [
    body('personaId').isString().notEmpty().withMessage('Persona ID is required'),
    body('ruleType').isString().notEmpty().withMessage('Rule type is required'),
    body('field').isString().notEmpty().withMessage('Field is required'),
    body('value').notEmpty().withMessage('Value is required'),
    body('weight').optional().isFloat({ min: -100, max: 100 }),
    body('learnedFrom').optional().isString(),
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

    const rule = await prisma.scoringRule.create({
      data: {
        personaId: req.body.personaId,
        ruleType: req.body.ruleType,
        field: req.body.field,
        value: req.body.value,
        weight: req.body.weight || 0,
        learnedFrom: req.body.learnedFrom,
      },
    });

    res.status(201).json({
      success: true,
      data: rule,
    });
  })
);

// DELETE /api/scoring/rules/:id - Delete rule
router.delete(
  '/rules/:id',
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

    await prisma.scoringRule.delete({
      where: { id: req.params.id },
    });

    res.status(200).json({
      success: true,
      message: 'Rule deleted successfully',
    });
  })
);

// GET /api/scoring/analytics - Scoring analytics
router.get(
  '/analytics',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const analytics = await scoringService.getScoreAnalytics();
    res.status(200).json({
      success: true,
      data: analytics,
    });
  })
);

export default router;
