import prisma from '../db/prisma';
import logger from '../utils/logger';
import { NotFoundError, ValidationError } from '../utils/errors';
import { AppStatus } from '@prisma/client';
import { emailQueue, cvGenerationQueue } from '../queue';
import { cvService } from './cv.service';

export class ApplicationService {
  async submitApplication(applicationId: string) {
    try {
      logger.info(`Submitting application: ${applicationId}`);

      const application = await prisma.application.findUnique({
        where: { id: applicationId },
        include: {
          job: true,
          persona: {
            include: {
              user: true,
            },
          },
        },
      });

      if (!application) {
        throw new NotFoundError(`Application with id ${applicationId} not found`);
      }

      if (application.status !== 'APPROVED') {
        throw new ValidationError(
          `Cannot submit application with status ${application.status}. Must be APPROVED.`
        );
      }

      // Determine submission method based on job source
      const submissionChannel = this.getSubmissionChannel(application.job.source);

      // Queue the submission
      await emailQueue.add({
        applicationId,
        channel: submissionChannel,
        jobUrl: application.job.sourceUrl,
        companyEmail: this.getCompanyEmail(application.job.company),
        cvPath: application.cvFilePath,
        userEmail: application.persona.user.email,
      });

      // Update application status
      const updatedApplication = await prisma.application.update({
        where: { id: applicationId },
        data: {
          status: 'APPLIED' as AppStatus,
          appliedAt: new Date(),
          appliedVia: submissionChannel,
        },
      });

      logger.info(`Application submitted: ${applicationId}`, {
        via: submissionChannel,
        jobId: application.jobId,
      });

      return updatedApplication;
    } catch (error) {
      logger.error('Error submitting application:', error);
      throw error;
    }
  }

  async getQueue(filters: any = {}) {
    try {
      logger.info(`Getting review queue`, { filters });

      const where: any = { status: 'AWAITING_REVIEW' };

      if (filters.personaId) {
        where.personaId = filters.personaId;
      }

      if (filters.jobTitle) {
        where.job = {
          title: {
            contains: filters.jobTitle,
            mode: 'insensitive',
          },
        };
      }

      const applications = await prisma.application.findMany({
        where,
        include: {
          job: {
            select: { id: true, title: true, company: true, sourceUrl: true },
          },
          persona: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      logger.info(`Queue retrieved: ${applications.length} applications awaiting review`);
      return applications;
    } catch (error) {
      logger.error('Error getting queue:', error);
      throw error;
    }
  }

  async approveApplication(applicationId: string) {
    try {
      logger.info(`Approving application: ${applicationId}`);

      const application = await prisma.application.findUnique({
        where: { id: applicationId },
      });

      if (!application) {
        throw new NotFoundError(`Application with id ${applicationId} not found`);
      }

      const updatedApplication = await prisma.application.update({
        where: { id: applicationId },
        data: {
          status: 'APPROVED' as AppStatus,
          updatedAt: new Date(),
        },
      });

      logger.info(`Application approved: ${applicationId}`);
      return updatedApplication;
    } catch (error) {
      logger.error('Error approving application:', error);
      throw error;
    }
  }

  async rejectApplication(applicationId: string) {
    try {
      logger.info(`Rejecting application: ${applicationId}`);

      const application = await prisma.application.findUnique({
        where: { id: applicationId },
      });

      if (!application) {
        throw new NotFoundError(`Application with id ${applicationId} not found`);
      }

      const updatedApplication = await prisma.application.update({
        where: { id: applicationId },
        data: {
          status: 'REJECTED' as AppStatus,
          updatedAt: new Date(),
        },
      });

      logger.info(`Application rejected: ${applicationId}`);
      return updatedApplication;
    } catch (error) {
      logger.error('Error rejecting application:', error);
      throw error;
    }
  }

  async listApplications(
    userId: string,
    filters: any = {},
    pagination: any = {}
  ) {
    try {
      const limit = Math.min(pagination.limit || 20, 100);
      const offset = pagination.offset || 0;
      const sortBy = pagination.sortBy || 'createdAt';
      const sortOrder = pagination.sortOrder || 'desc';

      logger.info(`Listing applications for user: ${userId}`, { filters, pagination });

      const where: any = {
        persona: {
          userId,
        },
      };

      if (filters.status) {
        where.status = filters.status;
      }

      if (filters.personaId) {
        where.personaId = filters.personaId;
      }

      if (filters.company) {
        where.job = {
          company: {
            contains: filters.company,
            mode: 'insensitive',
          },
        };
      }

      if (filters.jobTitle) {
        where.job = {
          title: {
            contains: filters.jobTitle,
            mode: 'insensitive',
          },
        };
      }

      const [applications, total] = await Promise.all([
        prisma.application.findMany({
          where,
          include: {
            job: {
              select: { id: true, title: true, company: true, location: true },
            },
            persona: {
              select: { id: true, name: true },
            },
          },
          take: limit,
          skip: offset,
          orderBy: { [sortBy]: sortOrder },
        }),
        prisma.application.count({ where }),
      ]);

      logger.info(`Found ${applications.length} applications for user: ${userId}`);

      return {
        data: applications,
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      };
    } catch (error) {
      logger.error('Error listing applications:', error);
      throw error;
    }
  }

  async updateStatus(applicationId: string, status: string, notes?: string) {
    try {
      logger.info(`Updating application status: ${applicationId} to ${status}`, { notes });

      const application = await prisma.application.findUnique({
        where: { id: applicationId },
      });

      if (!application) {
        throw new NotFoundError(`Application with id ${applicationId} not found`);
      }

      const updateData: any = {
        status: status as AppStatus,
        updatedAt: new Date(),
      };

      if (notes) {
        updateData.notes = notes;
      }

      // Handle status-specific updates
      if (status === 'RESPONDED') {
        updateData.responseAt = new Date();
      }

      const updatedApplication = await prisma.application.update({
        where: { id: applicationId },
        data: updateData,
      });

      logger.info(`Application status updated: ${applicationId}`);
      return updatedApplication;
    } catch (error) {
      logger.error('Error updating application status:', error);
      throw error;
    }
  }

  async dryRun(jobId: string, personaId: string) {
    try {
      logger.info(`Performing dry run for job: ${jobId}, persona: ${personaId}`);

      // Check if job and persona exist
      const [job, persona] = await Promise.all([
        prisma.job.findUnique({ where: { id: jobId } }),
        prisma.persona.findUnique({ where: { id: personaId } }),
      ]);

      if (!job) {
        throw new NotFoundError(`Job with id ${jobId} not found`);
      }

      if (!persona) {
        throw new NotFoundError(`Persona with id ${personaId} not found`);
      }

      // Simulate CV generation
      const cvPreview = await cvService.previewCV(jobId, personaId);

      // Get job score
      const jobScore = await prisma.jobScore.findUnique({
        where: {
          jobId_personaId: { jobId, personaId },
        },
      });

      logger.info(`Dry run completed for job: ${jobId}, persona: ${personaId}`);

      return {
        jobId,
        personaId,
        jobTitle: job.title,
        company: job.company,
        personaName: persona.name,
        score: jobScore?.overallScore || null,
        recommendation: jobScore?.recommendation || null,
        cvPreview,
        wouldApply: jobScore?.recommendation === 'AUTO_APPLY',
        dryRanAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error in dry run:', error);
      throw error;
    }
  }

  async getDailyStats(userId: string) {
    try {
      logger.info(`Getting daily stats for user: ${userId}`);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const applications = await prisma.application.findMany({
        where: {
          persona: { userId },
          appliedAt: {
            gte: today,
          },
        },
        include: {
          job: {
            select: { source: true },
          },
        },
      });

      const statsBySource: any = {};

      for (const app of applications) {
        const source = app.appliedVia || 'unknown';
        if (!statsBySource[source]) {
          statsBySource[source] = 0;
        }
        statsBySource[source]++;
      }

      const totalToday = applications.length;

      logger.info(`Daily stats retrieved for user: ${userId}`, { totalToday });

      return {
        userId,
        date: today.toISOString().split('T')[0],
        totalApplications: totalToday,
        bySource: statsBySource,
        retrievedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error getting daily stats:', error);
      throw error;
    }
  }

  private getSubmissionChannel(jobSource: string): string {
    const sourceChannelMap: Record<string, string> = {
      LINKEDIN: 'linkedin',
      INDEED: 'indeed',
      GLASSDOOR: 'glassdoor',
      COMPANY_CAREER_PAGE: 'email',
      WELLFOUND: 'wellfound',
      DRUSHIM: 'drushim',
      ALLJOBS: 'alljobs',
      FACEBOOK_GROUP: 'facebook',
      GOOGLE_JOBS: 'email',
      OTHER: 'email',
    };

    return sourceChannelMap[jobSource] || 'email';
  }

  private getCompanyEmail(company: string): string {
    // This is a placeholder - in production, you'd have a database of company emails
    // or use a service to look up company contact emails
    return `careers@${company.toLowerCase().replace(/\s+/g, '')}.com`;
  }
}

export const applicationService = new ApplicationService();
