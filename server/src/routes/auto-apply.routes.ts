import { Router, Response } from 'express';
import { param, validationResult } from 'express-validator';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { autoApplyService } from '../services/auto-apply.service';
import prisma from '../db/prisma';
import logger from '../utils/logger';

const router = Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

/**
 * POST /api/auto-apply/submit/:applicationId
 * Submit a single approved application via ATS
 */
router.post(
  '/submit/:applicationId',
  param('applicationId').isString().withMessage('Invalid application ID'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, error: 'Validation error', details: errors.array() });
      return;
    }

    const { applicationId } = req.params;
    const userId = req.userId!;

    // Fetch application with job and persona
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        job: true,
        persona: true,
      },
    });

    if (!application) {
      res.status(404).json({ success: false, error: 'Application not found' });
      return;
    }

    // Verify ownership via persona
    if (application.persona.userId !== userId) {
      res.status(403).json({ success: false, error: 'Application does not belong to this user' });
      return;
    }

    // Verify status is APPROVED
    if (application.status !== 'APPROVED') {
      res.status(400).json({
        success: false,
        error: `Cannot submit application with status: ${application.status}. Must be APPROVED.`,
      });
      return;
    }

    // Build candidate data from user profile
    const candidateData = await autoApplyService.buildCandidateFromUser(userId);

    // Get ATS info for this job's company
    const atsInfo = await autoApplyService.getATSInfoForJob(application.jobId);

    if (!atsInfo.atsProvider) {
      // No ATS found — mark as manual submission required
      res.status(200).json({
        success: false,
        data: {
          applicationUrl: application.job.sourceUrl,
          error: 'No ATS integration available for this company. Manual submission required.',
        },
      });
      return;
    }

    // Get the CV file path for the user
    let cvFilePath = application.cvFilePath || '';
    if (!cvFilePath) {
      try {
        const defaultCV = await (prisma as any).uploadedCV.findFirst({
          where: { userId, isDefault: true },
          select: { filePath: true },
        });
        cvFilePath = defaultCV?.filePath || '';
      } catch {
        // uploadedCV table might not exist yet
      }
    }

    // Submit
    const result = await autoApplyService.submitApplication({
      jobId: application.jobId,
      applicationId: application.id,
      atsProvider: atsInfo.atsProvider as any,
      atsIdentifier: atsInfo.atsIdentifier || '',
      jobBoardId: atsInfo.jobBoardId || undefined,
      candidateData,
      cvFilePath,
      coverLetterText: undefined,
    });

    // Update application status
    if (result.success) {
      await prisma.application.update({
        where: { id: applicationId },
        data: {
          status: 'APPLIED',
          appliedAt: new Date(),
          appliedVia: `auto-apply:${atsInfo.atsProvider}`,
          notes: `Auto-applied via ${atsInfo.atsProvider}. External ID: ${result.externalApplicationId || 'N/A'}`,
        },
      });
    }

    logger.info(`[AutoApply] Submission result for ${applicationId}: ${result.success ? 'SUCCESS' : 'FAILED'}`, {
      userId,
      jobId: application.jobId,
      atsProvider: atsInfo.atsProvider,
    });

    res.status(200).json({ success: true, data: result });
  })
);

/**
 * POST /api/auto-apply/process
 * Process all approved applications for the user
 */
router.post(
  '/process',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.userId!;

    const result = await autoApplyService.processApprovedApplications(userId);

    logger.info('[AutoApply] Processed approved applications', {
      userId,
      submitted: result.submitted,
      failed: result.failed,
      skipped: result.skipped,
    });

    res.status(200).json({
      success: true,
      data: result,
      message: `Processed: ${result.submitted} submitted, ${result.failed} failed, ${result.skipped} skipped`,
    });
  })
);

/**
 * GET /api/auto-apply/status/:applicationId
 * Get ATS submission status for an application
 */
router.get(
  '/status/:applicationId',
  param('applicationId').isString().withMessage('Invalid application ID'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, error: 'Validation error' });
      return;
    }

    const { applicationId } = req.params;
    const userId = req.userId!;

    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        job: true,
        persona: true,
      },
    });

    if (!application) {
      res.status(404).json({ success: false, error: 'Application not found' });
      return;
    }

    if (application.persona.userId !== userId) {
      res.status(403).json({ success: false, error: 'Application does not belong to this user' });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        applicationId: application.id,
        status: application.status,
        jobTitle: application.job.title,
        company: application.job.company,
        appliedAt: application.appliedAt,
        appliedVia: application.appliedVia,
        notes: application.notes,
      },
    });
  })
);

/**
 * GET /api/auto-apply/ats-info/:jobId
 * Get ATS info for a job's company
 */
router.get(
  '/ats-info/:jobId',
  param('jobId').isString().withMessage('Invalid job ID'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, error: 'Validation error' });
      return;
    }

    const { jobId } = req.params;

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      res.status(404).json({ success: false, error: 'Job not found' });
      return;
    }

    const atsInfo = await autoApplyService.getATSInfoForJob(jobId);

    res.status(200).json({
      success: true,
      data: {
        jobId,
        company: job.company,
        atsProvider: atsInfo.atsProvider,
        atsIdentifier: atsInfo.atsIdentifier,
        canAutoApply: !!(atsInfo.atsProvider && atsInfo.atsIdentifier),
      },
    });
  })
);

/**
 * POST /api/auto-apply/test/:jobId
 * Dry-run test of auto-apply for a job (does NOT submit)
 */
router.post(
  '/test/:jobId',
  param('jobId').isString().withMessage('Invalid job ID'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, error: 'Validation error' });
      return;
    }

    const { jobId } = req.params;
    const userId = req.userId!;

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      res.status(404).json({ success: false, error: 'Job not found' });
      return;
    }

    // Get ATS info
    const atsInfo = await autoApplyService.getATSInfoForJob(jobId);
    const canAutoApply = !!(atsInfo.atsProvider && atsInfo.atsIdentifier);

    // Build candidate data (redact for preview)
    const candidateData = await autoApplyService.buildCandidateFromUser(userId);
    const redacted = {
      firstName: candidateData.firstName,
      lastName: candidateData.lastName?.[0] + '***',
      email: candidateData.email.replace(/(.{2}).+@/, '$1***@'),
      phone: candidateData.phone ? '***' : null,
      linkedinUrl: candidateData.linkedinUrl ? '[provided]' : null,
      githubUrl: candidateData.githubUrl ? '[provided]' : null,
      portfolioUrl: candidateData.portfolioUrl ? '[provided]' : null,
    };

    // Warnings
    const warnings: string[] = [];
    if (!candidateData.email) warnings.push('No email in profile');
    if (!candidateData.phone) warnings.push('No phone in profile');
    if (!candidateData.linkedinUrl) warnings.push('No LinkedIn URL — some ATS require it');
    if (!canAutoApply) warnings.push('No ATS integration found for this company');

    res.status(200).json({
      success: true,
      data: {
        canAutoApply,
        atsProvider: atsInfo.atsProvider,
        candidatePreview: redacted,
        warnings,
        jobTitle: job.title,
        company: job.company,
      },
    });
  })
);

export default router;
