import { Router, Response } from 'express';
import { body, query, validationResult } from 'express-validator';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { analyticsService } from '../services/analytics.service';
import logger from '../utils/logger';
import prisma from '../db/prisma';

const router = Router();

router.use(authMiddleware);

// GET /api/analytics/funnel - Conversion funnel
router.get(
  '/funnel',
  [
    query('dateFrom').optional().isISO8601(),
    query('dateTo').optional().isISO8601(),
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

    const dateRange = req.query.dateFrom && req.query.dateTo ? {
      from: new Date(req.query.dateFrom as string),
      to: new Date(req.query.dateTo as string),
    } : undefined;

    const funnel = await analyticsService.getConversionFunnel(req.userId!, dateRange);
    res.status(200).json({
      success: true,
      data: funnel,
    });
  })
);

// GET /api/analytics/scores - Score distribution
router.get(
  '/scores',
  [
    query('personaId').optional().isString(),
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

    const distribution = await analyticsService.getScoreDistribution();

    res.status(200).json({
      success: true,
      data: distribution,
    });
  })
);

// GET /api/analytics/response-times - Response time analysis
router.get(
  '/response-times',
  [
    query('dateFrom').optional().isISO8601(),
    query('dateTo').optional().isISO8601(),
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

    const dateRange = req.query.dateFrom && req.query.dateTo ? {
      from: new Date(req.query.dateFrom as string),
      to: new Date(req.query.dateTo as string),
    } : undefined;

    const analysis = await analyticsService.getResponseTimeAnalysis(dateRange);
    res.status(200).json({
      success: true,
      data: analysis,
    });
  })
);

// GET /api/analytics/keywords - Keyword effectiveness
router.get(
  '/keywords',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const personaId = req.query.personaId as string | undefined;
    const keywordData = await analyticsService.getKeywordEffectiveness(personaId);
    res.status(200).json({
      success: true,
      data: keywordData,
    });
  })
);

// GET /api/analytics/trends - Market trends
router.get(
  '/trends',
  [
    query('timeframe').optional().isIn(['week', 'month', 'quarter', 'year']),
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

    const dateRange = req.query.timeframe ? {
      from: new Date(Date.now() - (req.query.timeframe === 'week' ? 7 : req.query.timeframe === 'quarter' ? 90 : req.query.timeframe === 'year' ? 365 : 30) * 24 * 60 * 60 * 1000),
      to: new Date(),
    } : undefined;

    const trends = await analyticsService.getMarketTrends(dateRange);

    res.status(200).json({
      success: true,
      data: trends,
    });
  })
);

// GET /api/analytics/persona-roi - Persona ROI
router.get(
  '/persona-roi',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    // Get all personas for user and calculate ROI for each
    const personas = await prisma.persona.findMany({
      where: { userId: req.userId! },
      select: { id: true },
    });

    const roiData = await Promise.all(
      personas.map(p => analyticsService.getPersonaROI(p.id))
    );

    res.status(200).json({
      success: true,
      data: roiData,
    });
  })
);

// GET /api/analytics/sources - Source performance
router.get(
  '/sources',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const sourcePerformance = await analyticsService.getSourcePerformance(req.userId!);
    res.status(200).json({
      success: true,
      data: sourcePerformance,
    });
  })
);

export default router;
