import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { applicationService } from '../services/application.service';
import { intelligenceService } from '../services/intelligence.service';
import { cvGenerationQueue, emailQueue } from '../queue';
import prisma from '../db/prisma';
import logger from '../utils/logger';

const router = Router();

router.use(authMiddleware);

// GET /api/applications - List applications
router.get(
  '/',
  [
    query('status').optional().isString(),
    query('personaId').optional().isString(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('sortBy').optional().isString(),
    query('sortOrder').optional().isIn(['asc', 'desc']),
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

    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const offset = (page - 1) * limit;

    const where: any = {
      persona: {
        userId: req.userId,
      },
    };

    if (req.query.status) {
      where.status = req.query.status;
    }

    if (req.query.personaId) {
      where.personaId = req.query.personaId;
    }

    const [applications, total] = await Promise.all([
      prisma.application.findMany({
        where,
        include: {
          job: {
            select: { id: true, title: true, company: true, sourceUrl: true },
          },
          persona: {
            select: { id: true, name: true },
          },
        },
        take: limit,
        skip: offset,
        orderBy: {
          [req.query.sortBy as string || 'createdAt']: req.query.sortOrder || 'desc',
        },
      }),
      prisma.application.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      data: applications,
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    });
  })
);

// GET /api/applications/queue - Get review queue
router.get(
  '/queue',
  [
    query('personaId').optional().isString(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
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
      personaId: req.query.personaId as string | undefined,
    };

    const queueData = await applicationService.getQueue(filters);
    res.status(200).json({
      success: true,
      data: queueData.data,
      meta: {
        total: queueData.total,
      },
    });
  })
);

// POST /api/applications/submit - Submit application
router.post(
  '/submit',
  [
    body('applicationId').isString().notEmpty().withMessage('Application ID is required'),
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

    const application = await applicationService.submitApplication(req.body.applicationId);
    res.status(200).json({
      success: true,
      data: application,
      message: 'Application submitted',
    });
  })
);

// POST /api/applications/:id/approve - Approve
router.post(
  '/:id/approve',
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

    const application = await prisma.application.update({
      where: { id: req.params.id },
      data: {
        status: 'APPROVED' as any,
        reviewedAt: new Date(),
      },
    });

    res.status(200).json({
      success: true,
      data: application,
      message: 'Application approved',
    });
  })
);

// POST /api/applications/:id/reject - Reject
router.post(
  '/:id/reject',
  [
    param('id').isString().notEmpty(),
    body('reason').optional().isString(),
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

    const existingApp = await prisma.application.findUnique({
      where: { id: req.params.id },
    });

    if (!existingApp) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Application not found',
        },
      });
      return;
    }

    const application = await prisma.application.update({
      where: { id: req.params.id },
      data: {
        status: 'REJECTED' as any,
        notes: req.body.reason || existingApp.notes,
        reviewedAt: new Date(),
      },
    });

    res.status(200).json({
      success: true,
      data: application,
      message: 'Application rejected',
    });
  })
);

// PATCH /api/applications/:id/status - Update status
router.patch(
  '/:id/status',
  [
    param('id').isString().notEmpty(),
    body('status').isString().notEmpty().withMessage('Status is required'),
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

    // Use intelligence service to record response and trigger learning
    const responseStatuses = ['RESPONDED', 'INTERVIEW', 'OFFER', 'REJECTED'];
    if (responseStatuses.includes(req.body.status)) {
      const application = await intelligenceService.recordResponse(
        req.params.id,
        req.body.status,
        undefined,
        req.body.notes
      );
      res.status(200).json({
        success: true,
        data: application,
      });
    } else {
      const application = await prisma.application.update({
        where: { id: req.params.id },
        data: {
          status: req.body.status as any,
          notes: req.body.notes,
        },
      });
      res.status(200).json({
        success: true,
        data: application,
      });
    }
  })
);

// POST /api/applications/dry-run - Dry run
router.post(
  '/dry-run',
  [
    body('applicationId').isString().notEmpty().withMessage('Application ID is required'),
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
      where: { id: req.body.applicationId },
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

    const dryRunResult = await applicationService.dryRun(
      application.jobId,
      application.personaId
    );

    res.status(200).json({
      success: true,
      data: dryRunResult,
      message: 'Dry run completed',
    });
  })
);

export default router;
