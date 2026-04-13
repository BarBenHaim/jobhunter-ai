import { Router, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { lightweightScraperService } from '../services/lightweight-scraper.service';
import { scoreJobLocally } from '../services/smart-match.service';
import { savedSearchRunnerService } from '../services/saved-search-runner.service';
import prisma from '../db/prisma';
import logger from '../utils/logger';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// ============================================================
// POST /api/saved-searches - Create a saved search
// ============================================================
router.post(
  '/',
  [
    body('name').trim().notEmpty().isString().withMessage('Name is required'),
    body('freeTextQuery').optional().isString(),
    body('keywords').optional().isArray(),
    body('sources').optional().isArray(),
    body('location').optional().isString(),
    body('minScore').optional().isInt({ min: 0, max: 100 }),
    body('experienceLevel').optional().isString(),
    body('notifyEmail').optional().isBoolean(),
    body('notifyFrequency').optional().isIn(['realtime', 'hourly', 'daily', 'weekly']),
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

    const userId = req.userId!;
    const {
      name,
      freeTextQuery,
      keywords,
      sources,
      location,
      minScore = 0,
      experienceLevel,
      notifyEmail = true,
      notifyFrequency = 'daily',
    } = req.body;

    try {
      const savedSearch = await (prisma as any).savedSearch.create({
        data: {
          userId,
          name,
          freeTextQuery,
          keywords: keywords || [],
          sources: sources || [],
          location,
          minScore,
          experienceLevel,
          notifyEmail,
          notifyFrequency,
          isActive: true,
        },
      });

      logger.info(`Saved search created`, {
        userId,
        savedSearchId: savedSearch.id,
        name,
      });

      res.status(201).json({
        success: true,
        data: savedSearch,
      });
    } catch (error) {
      logger.error('Error creating saved search', { error, userId });
      throw error;
    }
  })
);

// ============================================================
// GET /api/saved-searches - List user's saved searches
// ============================================================
router.get(
  '/',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.userId!;

    try {
      const savedSearches = await (prisma as any).savedSearch.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
      });

      res.json({
        success: true,
        data: savedSearches,
      });
    } catch (error) {
      logger.error('Error fetching saved searches', { error, userId });
      throw error;
    }
  })
);

// ============================================================
// GET /api/saved-searches/:id - Get a single saved search
// ============================================================
router.get(
  '/:id',
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

    const userId = req.userId!;
    const { id } = req.params;

    try {
      const savedSearch = await (prisma as any).savedSearch.findUnique({
        where: { id },
      });

      if (!savedSearch) {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Saved search not found',
          },
        });
        return;
      }

      // Verify ownership
      if (savedSearch.userId !== userId) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You do not have permission to access this saved search',
          },
        });
        return;
      }

      res.json({
        success: true,
        data: savedSearch,
      });
    } catch (error) {
      logger.error('Error fetching saved search', { error, userId, id });
      throw error;
    }
  })
);

// ============================================================
// PUT /api/saved-searches/:id - Update a saved search
// ============================================================
router.put(
  '/:id',
  [
    param('id').isString().notEmpty(),
    body('name').optional().trim().isString(),
    body('freeTextQuery').optional().isString(),
    body('keywords').optional().isArray(),
    body('sources').optional().isArray(),
    body('location').optional().isString(),
    body('minScore').optional().isInt({ min: 0, max: 100 }),
    body('experienceLevel').optional().isString(),
    body('notifyEmail').optional().isBoolean(),
    body('notifyFrequency').optional().isIn(['realtime', 'hourly', 'daily', 'weekly']),
    body('isActive').optional().isBoolean(),
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

    const userId = req.userId!;
    const { id } = req.params;
    const updateData = req.body;

    try {
      // Verify ownership first
      const existingSearch = await (prisma as any).savedSearch.findUnique({
        where: { id },
      });

      if (!existingSearch) {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Saved search not found',
          },
        });
        return;
      }

      if (existingSearch.userId !== userId) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You do not have permission to update this saved search',
          },
        });
        return;
      }

      const updatedSearch = await (prisma as any).savedSearch.update({
        where: { id },
        data: updateData,
      });

      logger.info(`Saved search updated`, {
        userId,
        savedSearchId: id,
      });

      res.json({
        success: true,
        data: updatedSearch,
      });
    } catch (error) {
      logger.error('Error updating saved search', { error, userId, id });
      throw error;
    }
  })
);

// ============================================================
// DELETE /api/saved-searches/:id - Delete a saved search
// ============================================================
router.delete(
  '/:id',
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

    const userId = req.userId!;
    const { id } = req.params;

    try {
      // Verify ownership before deleting
      const existingSearch = await (prisma as any).savedSearch.findUnique({
        where: { id },
      });

      if (!existingSearch) {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Saved search not found',
          },
        });
        return;
      }

      if (existingSearch.userId !== userId) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You do not have permission to delete this saved search',
          },
        });
        return;
      }

      await (prisma as any).savedSearch.delete({
        where: { id },
      });

      logger.info(`Saved search deleted`, {
        userId,
        savedSearchId: id,
      });

      res.json({
        success: true,
        message: 'Saved search deleted successfully',
      });
    } catch (error) {
      logger.error('Error deleting saved search', { error, userId, id });
      throw error;
    }
  })
);

// ============================================================
// POST /api/saved-searches/:id/toggle - Toggle active/inactive
// ============================================================
router.post(
  '/:id/toggle',
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

    const userId = req.userId!;
    const { id } = req.params;

    try {
      // Verify ownership
      const existingSearch = await (prisma as any).savedSearch.findUnique({
        where: { id },
      });

      if (!existingSearch) {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Saved search not found',
          },
        });
        return;
      }

      if (existingSearch.userId !== userId) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You do not have permission to modify this saved search',
          },
        });
        return;
      }

      const updatedSearch = await (prisma as any).savedSearch.update({
        where: { id },
        data: {
          isActive: !existingSearch.isActive,
        },
      });

      logger.info(`Saved search toggled`, {
        userId,
        savedSearchId: id,
        isActive: updatedSearch.isActive,
      });

      res.json({
        success: true,
        data: updatedSearch,
      });
    } catch (error) {
      logger.error('Error toggling saved search', { error, userId, id });
      throw error;
    }
  })
);

// ============================================================
// POST /api/saved-searches/:id/run - Manually trigger a saved search
// ============================================================
router.post(
  '/:id/run',
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

    const userId = req.userId!;
    const { id } = req.params;

    try {
      // Get the saved search
      const savedSearch = await (prisma as any).savedSearch.findUnique({
        where: { id },
      });

      if (!savedSearch) {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Saved search not found',
          },
        });
        return;
      }

      if (savedSearch.userId !== userId) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You do not have permission to run this saved search',
          },
        });
        return;
      }

      // Prepare search parameters
      const keywords = savedSearch.keywords && savedSearch.keywords.length > 0
        ? savedSearch.keywords
        : ['software developer'];
      const location = savedSearch.location || 'Israel';
      const enabledSources = savedSearch.sources && savedSearch.sources.length > 0
        ? savedSearch.sources
        : undefined;

      // Scrape jobs with the saved search configuration
      const scrapeResults = await lightweightScraperService.scrapeAll(keywords, location, enabledSources);

      // Flatten and score all jobs
      const allJobs = scrapeResults.flatMap(result => result.jobs);

      // Build a minimal profile analysis for scoring — saved searches don't
      // have a full user profile context, so we use an empty analysis and
      // rely on keyword/title matching in the scoring engine.
      const minimalProfileAnalysis = {
        skills: savedSearch.keywords || [],
        experience: [],
        education: [],
        titles: [],
        seniority: savedSearch.experienceLevel || 'MID',
        industries: [],
        techStack: savedSearch.keywords || [],
        languages: [],
        softSkills: [],
        certifications: [],
        summary: '',
      } as any;

      const searchPreferences = {
        minScore: savedSearch.minScore || 0,
        experienceLevel: savedSearch.experienceLevel,
        location: savedSearch.location,
      };

      const scoredJobs = allJobs.map(job => ({
        job,
        score: scoreJobLocally(job, minimalProfileAnalysis, searchPreferences).score,
      }));

      // Count jobs that meet the minimum score
      const matchingJobs = scoredJobs.filter(item => item.score >= (savedSearch.minScore || 0));
      const newJobCount = matchingJobs.length;
      const totalFound = allJobs.length;

      // Update saved search metadata
      await (prisma as any).savedSearch.update({
        where: { id },
        data: {
          lastRunAt: new Date(),
          totalJobsFound: totalFound,
          newJobsSinceNotify: newJobCount,
        },
      });

      logger.info(`Saved search executed`, {
        userId,
        savedSearchId: id,
        newJobs: newJobCount,
        totalFound,
      });

      res.json({
        success: true,
        data: {
          newJobs: newJobCount,
          totalFound,
          searchId: id,
          executedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Error running saved search', { error, userId, id });
      throw error;
    }
  })
);

export default router;
