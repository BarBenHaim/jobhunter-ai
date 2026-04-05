import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import multer from 'multer';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { profileService } from '../services/profile.service';
import logger from '../utils/logger';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(authMiddleware);

// GET /api/profile - Get user profile
router.get(
  '/',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const profile = await profileService.getProfile(req.userId!);
    res.status(200).json({
      success: true,
      data: profile,
    });
  })
);

// PATCH /api/profile - Update profile
router.patch(
  '/',
  [
    body('fullName').optional().isString().trim(),
    body('email').optional().isEmail(),
    body('phone').optional().isString().trim(),
    body('location').optional().isString().trim(),
    body('linkedinUrl').optional().isURL(),
    body('githubUrl').optional().isURL(),
    body('portfolioUrl').optional().isURL(),
    body('preferences').optional().isObject(),
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

    const updatedProfile = await profileService.updateProfile(req.userId!, req.body);
    res.status(200).json({
      success: true,
      data: updatedProfile,
    });
  })
);

// POST /api/profile/knowledge - Submit free-text knowledge
router.post(
  '/knowledge',
  [
    body('text').isString().notEmpty().withMessage('Knowledge text is required'),
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

    const profile = await profileService.submitKnowledge(req.userId!, req.body.text);

    // Process knowledge asynchronously
    profileService.processKnowledge(req.userId!).catch((error) => {
      logger.error('Error processing knowledge in background:', error);
    });

    res.status(201).json({
      success: true,
      data: profile,
      message: 'Knowledge submitted and queued for processing',
    });
  })
);

// POST /api/profile/upload-cv - Upload CV (multer file upload)
router.post(
  '/upload-cv',
  upload.single('file'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
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

    const allowedMimes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedMimes.includes(req.file.mimetype)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_FILE_TYPE',
          message: 'Only PDF and DOCX files are supported',
        },
      });
      return;
    }

    // Save file temporarily
    const tempPath = `/tmp/${Date.now()}_${req.file.originalname}`;
    const fs = await import('fs/promises');
    await fs.writeFile(tempPath, req.file.buffer);

    try {
      const profile = await profileService.uploadCV(req.userId!, tempPath);
      res.status(201).json({
        success: true,
        data: profile,
        message: 'CV uploaded and processed successfully',
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

// GET /api/profile/gaps - Get AI-identified gaps
router.get(
  '/gaps',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const gapsData = await profileService.getGaps(req.userId!);
    res.status(200).json({
      success: true,
      data: gapsData,
    });
  })
);

export default router;
