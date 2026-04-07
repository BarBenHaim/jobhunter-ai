import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { intelligenceService } from '../services/intelligence.service';
import logger from '../utils/logger';

const router = Router();

router.use(authMiddleware);

// GET /api/intelligence/overview - Get intelligence dashboard data
router.get(
  '/overview',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const intelligence = await intelligenceService.getIntelligence(req.userId);
    res.status(200).json({
      success: true,
      data: intelligence,
    });
  })
);

// GET /api/intelligence/patterns - Get response patterns
router.get(
  '/patterns',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const patterns = await intelligenceService.getResponsePatterns(req.userId);
    res.status(200).json({
      success: true,
      data: patterns,
      meta: { total: patterns.length },
    });
  })
);

// GET /api/intelligence/funnel - Get application funnel stats
router.get(
  '/funnel',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const funnel = await intelligenceService.getFunnelStats(req.userId);
    res.status(200).json({
      success: true,
      data: funnel,
    });
  })
);

// GET /api/intelligence/timeline - Get event timeline
router.get(
  '/timeline',
  [query('limit').optional().isInt({ min: 1, max: 200 })],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const timeline = await intelligenceService.getTimeline(req.userId, limit);
    res.status(200).json({
      success: true,
      data: timeline,
      meta: { total: timeline.length },
    });
  })
);

// GET /api/intelligence/learned-rules/:personaId - Get learned scoring rules
router.get(
  '/learned-rules/:personaId',
  [param('personaId').isString().notEmpty()],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: errors.array() },
      });
      return;
    }
    const rules = await intelligenceService.getLearnedRules(req.params.personaId);
    res.status(200).json({
      success: true,
      data: rules,
      meta: { total: rules.length },
    });
  })
);

// POST /api/intelligence/record-response - Record an employer response
router.post(
  '/record-response',
  [
    body('applicationId').isString().notEmpty().withMessage('Application ID is required'),
    body('status').isString().notEmpty().withMessage('Status is required'),
    body('responseType').optional().isString(),
    body('notes').optional().isString(),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: errors.array() },
      });
      return;
    }

    const application = await intelligenceService.recordResponse(
      req.body.applicationId,
      req.body.status,
      req.body.responseType,
      req.body.notes
    );

    res.status(200).json({
      success: true,
      data: application,
      message: 'Response recorded and learning updated',
    });
  })
);

export default router;
