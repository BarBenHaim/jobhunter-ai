import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { followupService } from '../services/followup.service';
import { followUpQueue } from '../queue';
import prisma from '../db/prisma';
import logger from '../utils/logger';

const router = Router();

router.use(authMiddleware);

// POST /api/followups/schedule/:applicationId - Schedule follow-ups
router.post(
  '/schedule/:applicationId',
  [
    param('applicationId').isString().notEmpty(),
    body('scheduledAt').isISO8601().withMessage('Scheduled date is required'),
    body('type').isString().notEmpty().withMessage('Follow-up type is required'),
    body('message').optional().isString(),
    body('channel').optional().isIn(['email', 'phone', 'linkedin']),
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

    const application = await prisma.application.findUnique({
      where: { id: req.params.applicationId },
    });

    if (!application) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Application not found',
        },
      });
      return;
    }

    // Create follow-up directly since scheduleFollowup creates automated ones
    const followup = await prisma.followUp.create({
      data: {
        applicationId: req.params.applicationId,
        userId: req.userId!,
        type: req.body.type,
        scheduledAt: new Date(req.body.scheduledAt),
        message: req.body.message,
        channel: req.body.channel || 'email',
        status: 'SCHEDULED' as any,
      },
    });

    res.status(201).json({
      success: true,
      data: followup,
      message: 'Follow-up scheduled',
    });
  })
);

// GET /api/followups/upcoming - Get upcoming
router.get(
  '/upcoming',
  [
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('daysAhead').optional().isInt({ min: 1 }),
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

    const hoursAhead = (parseInt(req.query.daysAhead as string) || 7) * 24;
    const upcoming = await followupService.getUpcoming(hoursAhead);

    res.status(200).json({
      success: true,
      data: upcoming.slice(0, parseInt(req.query.limit as string) || 50),
      meta: {
        total: upcoming.length,
      },
    });
  })
);

// POST /api/followups/:id/execute - Execute follow-up
router.post(
  '/:id/execute',
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

    const followup = await followupService.executeFollowUp(req.params.id);
    res.status(200).json({
      success: true,
      data: followup,
      message: 'Follow-up executed',
    });
  })
);

// POST /api/followups/:id/complete - Mark complete
router.post(
  '/:id/complete',
  [
    param('id').isString().notEmpty(),
    body('notes').optional().isString(),
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

    const followup = await followupService.completeFollowUp(req.params.id);

    // Update notes if provided
    if (req.body.notes) {
      await prisma.followUp.update({
        where: { id: req.params.id },
        data: { notes: req.body.notes },
      });
    }

    const updated = await prisma.followUp.findUnique({
      where: { id: req.params.id },
    });

    res.status(200).json({
      success: true,
      data: updated,
      message: 'Follow-up marked as complete',
    });
  })
);

// GET /api/followups/application/:applicationId - List for application
router.get(
  '/application/:applicationId',
  [param('applicationId').isString().notEmpty()],
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

    const followups = await followupService.listForApplication(req.params.applicationId);
    res.status(200).json({
      success: true,
      data: followups,
      meta: {
        total: followups.length,
      },
    });
  })
);

// DELETE /api/followups/application/:applicationId - Cancel all
router.delete(
  '/application/:applicationId',
  [param('applicationId').isString().notEmpty()],
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

    const result = await followupService.cancelFollowUps(req.params.applicationId);
    res.status(200).json({
      success: true,
      message: 'Follow-ups cancelled',
      data: result,
    });
  })
);

export default router;
