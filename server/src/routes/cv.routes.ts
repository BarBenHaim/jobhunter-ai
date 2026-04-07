import { Router, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import multer from 'multer';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { cvService } from '../services/cv.service';
import { cvGenerationQueue } from '../queue';
import prisma from '../db/prisma';
import logger from '../utils/logger';
import * as fs from 'fs/promises';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(authMiddleware);

// POST /api/cv/generate - Generate CV for job+persona
router.post(
  '/generate',
  [
    body('applicationId').isString().notEmpty().withMessage('Application ID is required'),
    body('templateId').optional().isString(),
    body('format').optional().isIn(['pdf', 'docx']),
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

    // Queue CV generation
    const queueJobId = await cvGenerationQueue.add(
      {
        applicationId: req.body.applicationId,
        templateId: req.body.templateId,
        format: req.body.format || 'pdf',
        userId: req.userId,
      },
      {
        priority: 8,
        removeOnComplete: true,
      }
    );

    res.status(202).json({
      success: true,
      message: 'CV generation queued',
      data: {
        applicationId: req.body.applicationId,
        queueId: queueJobId.toString(),
      },
    });
  })
);

// GET /api/cv/:applicationId - Get generated CV file
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

    const cv = await cvService.getCV(req.params.applicationId);
    res.status(200).json({
      success: true,
      data: cv,
    });
  })
);

// POST /api/cv/preview - Preview without saving
router.post(
  '/preview',
  [
    body('applicationId').isString().notEmpty().withMessage('Application ID is required'),
    body('content').optional().isObject(),
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

    const preview = await cvService.previewCV(
      req.body.applicationId,
      req.body.content
    );

    res.status(200).json({
      success: true,
      data: preview,
    });
  })
);

// PUT /api/cv/:applicationId/edit - Edit CV
router.put(
  '/:applicationId/edit',
  [
    param('applicationId').isString().notEmpty(),
    body('content').isObject().notEmpty().withMessage('CV content is required'),
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

    const updated = await cvService.editCV(req.params.applicationId, req.body.content);
    res.status(200).json({
      success: true,
      data: updated,
    });
  })
);

// POST /api/cv/ats-check - Run ATS check
router.post(
  '/ats-check',
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

    if (!application || !application.cvContent) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'CV content not found',
        },
      });
      return;
    }

    const atsResults = await cvService.atsCheck(application.cvContent);
    res.status(200).json({
      success: true,
      data: atsResults,
    });
  })
);

// GET /api/cv/templates - List templates
router.get(
  '/templates',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const templates = await cvService.listTemplates();
    res.status(200).json({
      success: true,
      data: templates,
      meta: {
        total: templates.length,
      },
    });
  })
);

// POST /api/cv/templates - Upload template
router.post(
  '/templates',
  upload.single('file'),
  [
    body('name').isString().notEmpty().withMessage('Template name is required'),
    body('description').optional().isString(),
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

    if (!req.file) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'No file provided',
        },
      });
      return;
    }

    // Save file temporarily
    const tempPath = `/tmp/${Date.now()}_${req.file.originalname}`;
    await fs.writeFile(tempPath, req.file.buffer);

    try {
      const template = await cvService.uploadTemplate(tempPath, req.body.name);

      res.status(201).json({
        success: true,
        data: template,
      });
    } finally {
      // Clean up temp file
      try {
        await fs.unlink(tempPath);
      } catch (error) {
        logger.warn('Error deleting temp file:', error);
      }
    }
  })
);

// POST /api/cv/generate-standalone - Generate a standalone ATS-optimized CV
router.post(
  '/generate-standalone',
  [
    body('format').optional().isIn(['pdf', 'docx']).withMessage('Format must be pdf or docx'),
    body('variant')
      .optional()
      .isIn(['general', 'frontend', 'backend', 'fullstack', 'data', 'ai'])
      .withMessage('Invalid CV variant'),
    body('targetRole').optional().isString(),
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

    const format = req.body.format || 'pdf';
    const variant = req.body.variant || 'general';
    const targetRole = req.body.targetRole;

    const cvData = await cvService.generateStandaloneCV(req.userId, format, variant, targetRole);

    res.status(200).json({
      success: true,
      data: cvData,
    });
  })
);

// POST /api/cv/generate-ats-versions - Generate multiple ATS variants
router.post(
  '/generate-ats-versions',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const versions = await cvService.generateATSVersions(req.userId);

    res.status(200).json({
      success: true,
      data: versions,
    });
  })
);

export default router;
