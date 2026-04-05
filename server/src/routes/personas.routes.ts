import { Router, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { personaService } from '../services/persona.service';
import { scoringService } from '../services/scoring.service';
import logger from '../utils/logger';

const router = Router();

router.use(authMiddleware);

// GET /api/personas - List all personas
router.get(
  '/',
  [
    query('includeInactive').optional().isBoolean(),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const includeInactive = req.query.includeInactive === 'true';
    const personas = await personaService.listPersonas(req.userId!, includeInactive);

    res.status(200).json({
      success: true,
      data: personas,
      meta: {
        total: personas.length,
      },
    });
  })
);

// GET /api/personas/:id - Get single persona
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

    const persona = await personaService.getPersona(req.params.id);
    res.status(200).json({
      success: true,
      data: persona,
    });
  })
);

// POST /api/personas - Create persona
router.post(
  '/',
  [
    body('name').isString().notEmpty().withMessage('Name is required'),
    body('title').isString().notEmpty().withMessage('Title is required'),
    body('summary').isString().notEmpty().withMessage('Summary is required'),
    body('slug').optional().isString(),
    body('targetKeywords').optional().isArray(),
    body('excludeKeywords').optional().isArray(),
    body('skillPriority').optional().isObject(),
    body('experienceRules').optional().isObject(),
    body('cvTemplateId').optional().isString(),
    body('searchSchedule').optional().isObject(),
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

    const persona = await personaService.createPersona(req.userId!, req.body);
    res.status(201).json({
      success: true,
      data: persona,
    });
  })
);

// PUT /api/personas/:id - Update persona
router.put(
  '/:id',
  [
    param('id').isString().notEmpty(),
    body('name').optional().isString().notEmpty(),
    body('title').optional().isString().notEmpty(),
    body('summary').optional().isString().notEmpty(),
    body('targetKeywords').optional().isArray(),
    body('excludeKeywords').optional().isArray(),
    body('skillPriority').optional().isObject(),
    body('experienceRules').optional().isObject(),
    body('cvTemplateId').optional().isString(),
    body('searchSchedule').optional().isObject(),
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

    const persona = await personaService.updatePersona(req.params.id, req.body);
    res.status(200).json({
      success: true,
      data: persona,
    });
  })
);

// DELETE /api/personas/:id - Delete (deactivate) persona
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

    await personaService.deletePersona(req.params.id);
    res.status(200).json({
      success: true,
      message: 'Persona deleted successfully',
    });
  })
);

// POST /api/personas/:id/test-score - Test score a sample job
router.post(
  '/:id/test-score',
  [
    param('id').isString().notEmpty(),
    body('jobTitle').isString().notEmpty().withMessage('Job title is required'),
    body('company').isString().notEmpty().withMessage('Company is required'),
    body('description').isString().notEmpty().withMessage('Job description is required'),
    body('requirements').optional().isString(),
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

    const testJob = {
      id: 'test-job-' + Date.now(),
      title: req.body.jobTitle,
      company: req.body.company,
      location: req.body.location || 'Unknown',
      description: req.body.description,
      requirements: req.body.requirements,
      salary: req.body.salary,
      experienceLevel: req.body.experienceLevel || 'Mid-level',
      source: 'test',
      sourceUrl: '',
      locationType: 'Unknown',
    };

    const scoreData = await personaService.testScore(req.params.id, testJob);
    res.status(200).json({
      success: true,
      data: scoreData,
    });
  })
);

// GET /api/personas/:id/stats - Get persona stats
router.get(
  '/:id/stats',
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

    const stats = await personaService.getPersonaStats(req.params.id);
    res.status(200).json({
      success: true,
      data: stats,
    });
  })
);

export default router;
