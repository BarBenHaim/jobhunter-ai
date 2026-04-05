import { Router, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { interviewService } from '../services/interview.service';
import { interviewPrepQueue } from '../queue';
import prisma from '../db/prisma';

const router = Router();

router.use(authMiddleware);

// POST /api/interview-prep/:applicationId - Generate prep
router.post(
  '/:applicationId',
  [
    param('applicationId').isString().notEmpty(),
    body('focusAreas').optional().isArray(),
    body('includeCompanyResearch').optional().isBoolean(),
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
      include: { job: true, persona: true },
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

    // Generate interview prep synchronously
    const prep = await interviewService.generatePrepPackage(req.params.applicationId);

    res.status(201).json({
      success: true,
      message: 'Interview prep generated',
      data: prep,
    });
  })
);

// GET /api/interview-prep/:applicationId - Get prep
router.get(
  '/:applicationId',
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

    const prep = await interviewService.getPrepPackage(req.params.applicationId);
    res.status(200).json({
      success: true,
      data: prep,
    });
  })
);

// POST /api/interview-prep/:applicationId/notes - Save notes
router.post(
  '/:applicationId/notes',
  [
    param('applicationId').isString().notEmpty(),
    body('notes').isString().notEmpty().withMessage('Notes are required'),
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

    const prep = await interviewService.saveNotes(
      req.params.applicationId,
      req.body.notes
    );

    res.status(200).json({
      success: true,
      data: prep,
      message: 'Interview notes saved',
    });
  })
);

export default router;
