import prisma from '../db/prisma';
import logger from '../utils/logger';

// ============================================================================
// Interface Definitions
// ============================================================================

export interface CandidateData {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  currentCompany?: string;
  currentTitle?: string;
}

export interface ATSSubmission {
  jobId: string;
  applicationId: string;
  atsProvider: 'greenhouse' | 'lever' | 'ashby' | 'generic';
  atsIdentifier: string;
  jobBoardId?: string;
  candidateData: CandidateData;
  cvFilePath: string;
  coverLetterText?: string;
}

export interface ATSSubmissionResult {
  success: boolean;
  applicationUrl?: string;
  externalApplicationId?: string;
  error?: string;
}

// ============================================================================
// AutoApplyService Class
// ============================================================================

class AutoApplyService {
  private readonly RATE_LIMIT_MS = 5000; // 5 seconds between submissions

  /**
   * Delay utility for rate limiting
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Main entry point: routes submission to correct ATS handler
   */
  async submitApplication(submission: ATSSubmission): Promise<ATSSubmissionResult> {
    logger.info(`[AutoApply] Submitting application ${submission.applicationId} to ${submission.atsProvider}`, {
      jobId: submission.jobId,
      atsProvider: submission.atsProvider,
    });

    try {
      switch (submission.atsProvider) {
        case 'greenhouse':
          return await this.submitToGreenhouse(submission);
        case 'lever':
          return await this.submitToLever(submission);
        case 'ashby':
          return await this.submitToAshby(submission);
        case 'generic':
        default:
          return await this.submitGeneric(submission);
      }
    } catch (error) {
      logger.error(`[AutoApply] Failed to submit application ${submission.applicationId}`, {
        error: error instanceof Error ? error.message : String(error),
        atsProvider: submission.atsProvider,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Submit to Greenhouse Harvest API
   * Uses multipart/form-data with candidate info + resume file
   */
  async submitToGreenhouse(submission: ATSSubmission): Promise<ATSSubmissionResult> {
    const apiKey = process.env.GREENHOUSE_API_KEY;
    const { jobId, atsIdentifier, candidateData, cvFilePath, coverLetterText } = submission;

    if (!jobId || !atsIdentifier) {
      return {
        success: false,
        error: 'Missing jobId or boardToken for Greenhouse',
      };
    }

    try {
      const boardToken = atsIdentifier;
      const url = `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs/${jobId}/candidates`;

      // Read CV file as buffer
      const fs = require('fs').promises;
      let cvBuffer: Buffer;
      try {
        cvBuffer = await fs.readFile(cvFilePath);
      } catch (err) {
        logger.warn(`[AutoApply] Could not read CV file at ${cvFilePath}`, {
          error: err instanceof Error ? err.message : String(err),
        });
        cvBuffer = Buffer.from('Resume content unavailable');
      }

      // Build FormData
      const FormDataModule = await import('form-data');
      const formData = new FormDataModule.default();

      // Add candidate fields
      formData.append('first_name', candidateData.firstName);
      formData.append('last_name', candidateData.lastName);
      formData.append('email', candidateData.email);

      if (candidateData.phone) {
        formData.append('phone_number', candidateData.phone);
      }

      if (candidateData.linkedinUrl) {
        formData.append('linkedin_profile_url', candidateData.linkedinUrl);
      }

      if (candidateData.githubUrl) {
        formData.append('github_profile_url', candidateData.githubUrl);
      }

      if (candidateData.portfolioUrl) {
        formData.append('website_url', candidateData.portfolioUrl);
      }

      if (coverLetterText) {
        formData.append('cover_letter', coverLetterText);
      }

      // Add resume file
      formData.append('resume', cvBuffer, { filename: 'resume.pdf' });

      // Prepare headers
      const headers: Record<string, string> = {
        ...formData.getHeaders(),
      };

      // Add authorization if API key is provided
      if (apiKey) {
        const encoded = Buffer.from(`${apiKey}:`, 'utf-8').toString('base64');
        headers['Authorization'] = `Basic ${encoded}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
      });

      const responseBody: any = await response.json();

      if (!response.ok) {
        logger.error('[AutoApply] Greenhouse submission failed', {
          status: response.status,
          errorMessage: responseBody.message || responseBody.error || 'Unknown error',
        });
        return {
          success: false,
          error: `Greenhouse API error: ${responseBody.message || response.statusText}`,
        };
      }

      logger.info('[AutoApply] Successfully submitted to Greenhouse', {
        candidateId: responseBody.id,
        jobId,
      });

      return {
        success: true,
        externalApplicationId: String(responseBody.id),
        applicationUrl: responseBody.application_url || undefined,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('[AutoApply] Greenhouse submission error', { error: errorMsg });
      return {
        success: false,
        error: `Greenhouse submission failed: ${errorMsg}`,
      };
    }
  }

  /**
   * Submit to Lever Postings API
   * For public postings: submit without API key via form data
   * Otherwise: use API key for private postings
   */
  async submitToLever(submission: ATSSubmission): Promise<ATSSubmissionResult> {
    const apiKey = process.env.LEVER_API_KEY;
    const { atsIdentifier, candidateData, cvFilePath, coverLetterText } = submission;

    if (!atsIdentifier) {
      return {
        success: false,
        error: 'Missing postingId or companySlug for Lever',
      };
    }

    try {
      // Parse atsIdentifier as "companySlug/postingId"
      const parts = atsIdentifier.split('/');
      if (parts.length !== 2) {
        return {
          success: false,
          error: 'Invalid Lever identifier format (expected: companySlug/postingId)',
        };
      }

      const [companySlug, postingId] = parts;

      // Determine URL - with or without API key
      let url = `https://api.lever.co/v0/postings/${companySlug}/${postingId}`;
      if (apiKey) {
        url += `?key=${encodeURIComponent(apiKey)}`;
      }

      // Build request body (JSON)
      const requestBody = {
        name: `${candidateData.firstName} ${candidateData.lastName}`,
        email: candidateData.email,
        phone: candidateData.phone || undefined,
        links: {
          linkedin: candidateData.linkedinUrl || undefined,
          github: candidateData.githubUrl || undefined,
          portfolio: candidateData.portfolioUrl || undefined,
        },
        comments: coverLetterText || undefined,
      };

      // Remove undefined fields
      Object.keys(requestBody).forEach((key) => {
        if (requestBody[key as keyof typeof requestBody] === undefined) {
          delete requestBody[key as keyof typeof requestBody];
        }
      });

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const responseBody: any = await response.json();

      if (!response.ok) {
        logger.error('[AutoApply] Lever submission failed', {
          status: response.status,
          errorMessage: responseBody.message || responseBody.error || 'Unknown error',
        });
        return {
          success: false,
          error: `Lever API error: ${responseBody.message || response.statusText}`,
        };
      }

      logger.info('[AutoApply] Successfully submitted to Lever', {
        opportunityId: responseBody.opportunityId,
        postingId,
      });

      return {
        success: true,
        externalApplicationId: String(responseBody.opportunityId),
        applicationUrl: responseBody.applicationUrl || undefined,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('[AutoApply] Lever submission error', { error: errorMsg });
      return {
        success: false,
        error: `Lever submission failed: ${errorMsg}`,
      };
    }
  }

  /**
   * Submit to Ashby API
   * Sends JSON with form fields and candidate info
   */
  async submitToAshby(submission: ATSSubmission): Promise<ATSSubmissionResult> {
    const apiKey = process.env.ASHBY_API_KEY;
    const { atsIdentifier, candidateData, cvFilePath, coverLetterText } = submission;

    if (!apiKey) {
      logger.warn('[AutoApply] Ashby API key not configured');
      return {
        success: false,
        error: 'Ashby API key not configured',
      };
    }

    if (!atsIdentifier) {
      return {
        success: false,
        error: 'Missing jobId for Ashby',
      };
    }

    try {
      const url = 'https://api.ashbyhq.com/applicationForm.submit';

      // Build form fields
      const formFields = [
        {
          fieldId: 'firstName',
          value: candidateData.firstName,
        },
        {
          fieldId: 'lastName',
          value: candidateData.lastName,
        },
        {
          fieldId: 'email',
          value: candidateData.email,
        },
      ];

      if (candidateData.phone) {
        formFields.push({
          fieldId: 'phoneNumber',
          value: candidateData.phone,
        });
      }

      if (candidateData.linkedinUrl) {
        formFields.push({
          fieldId: 'linkedinUrl',
          value: candidateData.linkedinUrl,
        });
      }

      if (candidateData.githubUrl) {
        formFields.push({
          fieldId: 'githubUrl',
          value: candidateData.githubUrl,
        });
      }

      if (candidateData.portfolioUrl) {
        formFields.push({
          fieldId: 'portfolioUrl',
          value: candidateData.portfolioUrl,
        });
      }

      if (coverLetterText) {
        formFields.push({
          fieldId: 'coverLetter',
          value: coverLetterText,
        });
      }

      const requestBody = {
        apiKey,
        jobId: atsIdentifier,
        formFields,
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const responseBody: any = await response.json();

      if (!response.ok) {
        logger.error('[AutoApply] Ashby submission failed', {
          status: response.status,
          errorMessage: responseBody.message || responseBody.error || 'Unknown error',
        });
        return {
          success: false,
          error: `Ashby API error: ${responseBody.message || response.statusText}`,
        };
      }

      logger.info('[AutoApply] Successfully submitted to Ashby', {
        applicationId: responseBody.applicationId,
        jobId: atsIdentifier,
      });

      return {
        success: true,
        externalApplicationId: String(responseBody.applicationId),
        applicationUrl: responseBody.applicationUrl || undefined,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('[AutoApply] Ashby submission error', { error: errorMsg });
      return {
        success: false,
        error: `Ashby submission failed: ${errorMsg}`,
      };
    }
  }

  /**
   * Fallback for unsupported ATS providers
   * Returns a result indicating manual submission is required
   */
  async submitGeneric(submission: ATSSubmission): Promise<ATSSubmissionResult> {
    logger.info('[AutoApply] Using generic submission (manual required)', {
      applicationId: submission.applicationId,
      atsProvider: submission.atsProvider,
    });

    return {
      success: false,
      applicationUrl: submission.atsIdentifier,
      error: 'Automatic submission not supported for this ATS. Manual submission required.',
    };
  }

  /**
   * Build candidate data from user profile
   */
  async buildCandidateFromUser(userId: string): Promise<CandidateData> {
    try {
      const userProfile = await prisma.userProfile.findUnique({
        where: { id: userId },
      });

      if (!userProfile) {
        throw new Error(`User profile not found for userId: ${userId}`);
      }

      // Parse full name into first and last
      const nameParts = (userProfile.fullName || '').split(' ');
      const firstName = nameParts[0] || 'Applicant';
      const lastName = nameParts.slice(1).join(' ') || '';

      return {
        firstName,
        lastName,
        email: userProfile.email,
        phone: userProfile.phone || undefined,
        linkedinUrl: userProfile.linkedinUrl || undefined,
        githubUrl: userProfile.githubUrl || undefined,
        portfolioUrl: userProfile.portfolioUrl || undefined,
        currentCompany: (userProfile as any).currentCompany || undefined,
        currentTitle: (userProfile as any).currentTitle || undefined,
      };
    } catch (error) {
      logger.error('[AutoApply] Failed to build candidate data', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get ATS information for a job (via company profile)
   */
  async getATSInfoForJob(jobId: string): Promise<{
    atsProvider: string | null;
    atsIdentifier: string | null;
    jobBoardId: string | null;
  }> {
    try {
      // Fetch job to get company name
      const job = await prisma.job.findUnique({
        where: { id: jobId },
      });

      if (!job) {
        logger.warn('[AutoApply] Job not found', { jobId });
        return { atsProvider: null, atsIdentifier: null, jobBoardId: null };
      }

      // Look up company profile by name (fuzzy match)
      const companyProfile = await (prisma as any).companyProfile.findFirst({
        where: {
          OR: [
            { name: { equals: job.company, mode: 'insensitive' } },
            { nameHe: { equals: job.company, mode: 'insensitive' } },
            { slug: { equals: job.company.toLowerCase().replace(/\s+/g, '-'), mode: 'insensitive' } },
          ],
        },
      });

      if (!companyProfile) {
        logger.debug('[AutoApply] No company profile found for', { company: job.company });
        return { atsProvider: null, atsIdentifier: null, jobBoardId: null };
      }

      return {
        atsProvider: companyProfile.atsProvider || null,
        atsIdentifier: companyProfile.atsIdentifier || null,
        jobBoardId: null, // derived from atsIdentifier when needed
      };
    } catch (error) {
      logger.error('[AutoApply] Failed to fetch ATS info for job', {
        jobId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { atsProvider: null, atsIdentifier: null, jobBoardId: null };
    }
  }

  /**
   * Process all approved applications for a user and submit them
   */
  async processApprovedApplications(userId: string): Promise<{
    submitted: number;
    failed: number;
    skipped: number;
  }> {
    logger.info('[AutoApply] Starting batch processing of approved applications', { userId });

    const results = {
      submitted: 0,
      failed: 0,
      skipped: 0,
    };

    try {
      // Find all APPROVED applications for this user (via persona ownership)
      const userPersonas = await prisma.persona.findMany({
        where: { userId },
        select: { id: true },
      });
      const personaIds = userPersonas.map(p => p.id);

      if (personaIds.length === 0) {
        logger.info('[AutoApply] User has no personas, nothing to process');
        return results;
      }

      const approvedApps = await prisma.application.findMany({
        where: {
          personaId: { in: personaIds },
          status: 'APPROVED',
        },
        include: {
          job: true,
          persona: true,
        },
      });

      logger.info('[AutoApply] Found approved applications', {
        count: approvedApps.length,
      });

      // Build candidate data once
      const candidateData = await this.buildCandidateFromUser(userId);

      // Process each application
      for (const application of approvedApps) {
        // Rate limiting
        await this.delay(this.RATE_LIMIT_MS);

        try {
          // Get ATS info for the job
          const { atsProvider, atsIdentifier, jobBoardId } = await this.getATSInfoForJob(
            application.jobId
          );

          if (!atsProvider || !atsIdentifier) {
            logger.warn('[AutoApply] Skipping application - no ATS configured', {
              applicationId: application.id,
              jobId: application.jobId,
            });
            results.skipped++;
            continue;
          }

          // Get CV file path from application or user's default CV
          let cvFilePath = application.cvFilePath || '';
          if (!cvFilePath) {
            try {
              const defaultCV = await (prisma as any).uploadedCV.findFirst({
                where: { userId, isDefault: true },
                select: { filePath: true },
              });
              cvFilePath = defaultCV?.filePath || '';
            } catch {
              // Table might not exist yet
            }
          }
          if (!cvFilePath) {
            logger.warn('[AutoApply] Skipping application - no CV available', {
              applicationId: application.id,
            });
            results.skipped++;
            continue;
          }

          // Prepare submission
          const submission: ATSSubmission = {
            jobId: application.jobId,
            applicationId: application.id,
            atsProvider: (atsProvider as 'greenhouse' | 'lever' | 'ashby' | 'generic') || 'generic',
            atsIdentifier,
            jobBoardId: jobBoardId || undefined,
            candidateData,
            cvFilePath,
            coverLetterText: undefined,
          };

          // Submit application
          const result = await this.submitApplication(submission);

          if (result.success) {
            // Update application status to APPLIED
            await prisma.application.update({
              where: { id: application.id },
              data: {
                status: 'APPLIED',
                appliedAt: new Date(),
                appliedVia: `auto-apply:${atsProvider}`,
                notes: `Auto-applied. External ID: ${result.externalApplicationId || 'N/A'}`,
              },
            });

            logger.info('[AutoApply] Application submitted successfully', {
              applicationId: application.id,
            });
            results.submitted++;
          } else {
            // Keep status — add error note
            await prisma.application.update({
              where: { id: application.id },
              data: {
                notes: `Auto-apply failed: ${result.error || 'Unknown error'}`,
              },
            });

            logger.error('[AutoApply] Application submission failed', {
              applicationId: application.id,
              error: result.error,
            });
            results.failed++;
          }
        } catch (error) {
          logger.error('[AutoApply] Unexpected error processing application', {
            applicationId: application.id,
            error: error instanceof Error ? error.message : String(error),
          });
          results.failed++;
        }
      }

      logger.info('[AutoApply] Batch processing complete', results);
      return results;
    } catch (error) {
      logger.error('[AutoApply] Batch processing failed', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

// ============================================================================
// Export Singleton
// ============================================================================

export const autoApplyService = new AutoApplyService();
