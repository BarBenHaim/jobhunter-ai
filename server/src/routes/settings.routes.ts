import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { settingsService } from '../services/settings.service';
import { getQueueStats } from '../queue';
import { scrapingQueue, scoringQueue, cvGenerationQueue, emailQueue, followUpQueue } from '../queue';
import prisma from '../db/prisma';
import logger from '../utils/logger';

const router = Router();

router.use(authMiddleware);

// GET /api/settings - Get settings
router.get(
  '/',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const settings = await settingsService.getSettings(req.userId!);
    res.status(200).json({
      success: true,
      data: settings,
    });
  })
);

// PUT /api/settings - Update settings
router.put(
  '/',
  [
    body('theme').optional().isIn(['light', 'dark', 'auto']),
    body('emailNotifications').optional().isBoolean(),
    body('pushNotifications').optional().isBoolean(),
    body('autoApplyThreshold').optional().isFloat({ min: 0, max: 100 }),
    body('timezone').optional().isString(),
    body('language').optional().isString(),
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

    const settings = await settingsService.updateSettings(req.userId!, req.body);
    res.status(200).json({
      success: true,
      data: settings,
    });
  })
);

// GET /api/settings/health - System health
router.get(
  '/health',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const [scrapingStats, scoringStats, cvStats, emailStats, followupStats] = await Promise.all([
      getQueueStats(scrapingQueue),
      getQueueStats(scoringQueue),
      getQueueStats(cvGenerationQueue),
      getQueueStats(emailQueue),
      getQueueStats(followUpQueue),
    ]);

    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      queues: {
        scraping: scrapingStats,
        scoring: scoringStats,
        cvGeneration: cvStats,
        email: emailStats,
        followup: followupStats,
      },
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };

    res.status(200).json({
      success: true,
      data: health,
    });
  })
);

// POST /api/settings/export - Export data
router.post(
  '/export',
  [
    body('format').optional().isIn(['json', 'csv']),
    body('includeApplications').optional().isBoolean(),
    body('includeScores').optional().isBoolean(),
    body('includePersonas').optional().isBoolean(),
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

    const exportData = await settingsService.exportData(req.userId!);

    res.status(200).json({
      success: true,
      data: exportData,
      message: 'Data exported successfully',
    });
  })
);

// POST /api/settings/import - Import data
router.post(
  '/import',
  [
    body('data').notEmpty().withMessage('Data is required'),
    body('mergeStrategy').optional().isIn(['overwrite', 'merge', 'skip']),
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

    const importResult = await settingsService.importData(req.userId!, req.body.data);

    res.status(201).json({
      success: true,
      data: importResult,
      message: 'Data imported successfully',
    });
  })
);

export default router;
