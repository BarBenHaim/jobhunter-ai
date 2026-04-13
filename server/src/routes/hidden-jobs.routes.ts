import { Router, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import prisma from '../db/prisma';
import logger from '../utils/logger';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * POST /api/hidden-jobs/:jobId - Hide a job
 * Body: { reason?: string }
 * Upsert to avoid duplicates
 */
router.post(
  '/:jobId',
  [
    param('jobId').isString().notEmpty(),
    body('reason').optional().isIn(['not_interested', 'already_applied', 'wrong_fit']),
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

    const { jobId } = req.params;
    const { reason } = req.body;
    const userId = req.userId!;

    logger.info(`Hiding job for user`, { userId, jobId, reason });

    const hiddenJob = await (prisma as any).hiddenJob.upsert({
      where: {
        userId_jobId: {
          userId,
          jobId,
        },
      },
      update: {
        reason: reason || null,
        updatedAt: new Date(),
      },
      create: {
        userId,
        jobId,
        reason: reason || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    res.status(200).json({
      success: true,
      data: hiddenJob,
      message: 'Job hidden successfully',
    });
  })
);

/**
 * DELETE /api/hidden-jobs/:jobId - Unhide a job
 * Delete the record
 */
router.delete(
  '/:jobId',
  [param('jobId').isString().notEmpty()],
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

    const { jobId } = req.params;
    const userId = req.userId!;

    logger.info(`Unhiding job for user`, { userId, jobId });

    await (prisma as any).hiddenJob.deleteMany({
      where: {
        userId,
        jobId,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Job unhidden successfully',
    });
  })
);

/**
 * GET /api/hidden-jobs - List hidden jobs for this user
 * Returns array of { jobId, reason, createdAt }
 */
router.get(
  '/',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.userId!;

    logger.info(`Listing hidden jobs for user`, { userId });

    const hiddenJobs = await (prisma as any).hiddenJob.findMany({
      where: { userId },
      select: {
        jobId: true,
        reason: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.status(200).json({
      success: true,
      data: hiddenJobs,
    });
  })
);

/**
 * GET /api/hidden-jobs/ids - Get just the array of hidden job IDs
 * Used by frontend to filter jobs
 */
router.get(
  '/ids',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.userId!;

    logger.info(`Fetching hidden job IDs for user`, { userId });

    const hiddenJobs = await (prisma as any).hiddenJob.findMany({
      where: { userId },
      select: { jobId: true },
    });

    const jobIds = hiddenJobs.map((hj: any) => hj.jobId);

    res.status(200).json({
      success: true,
      data: jobIds,
    });
  })
);

export default router;
