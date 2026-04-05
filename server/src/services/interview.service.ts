import prisma from '../db/prisma';
import logger from '../utils/logger';
import { NotFoundError, ValidationError, AIError } from '../utils/errors';
import { aiClient } from '../ai/client';
import { interviewPrepQueue } from '../queue';

export class InterviewService {
  async generatePrepPackage(applicationId: string) {
    try {
      logger.info(`Generating interview prep package for application: ${applicationId}`);

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

      const job = application.job;
      const persona = application.persona;
      const userProfile = persona.user;

      // Call AI service to generate interview prep
      const prepPackage = await aiClient.generateInterviewPrep({
        jobTitle: job.title,
        company: job.company,
        jobDescription: job.description,
        jobRequirements: job.requirements,
        personaName: persona.name,
        userProfile: userProfile.structuredProfile as any,
      });

      if (!prepPackage) {
        throw new AIError('Failed to generate interview prep package');
      }

      // Extract and structure the prep package
      const structuredPrep = {
        applicationId,
        company: job.company,
        jobTitle: job.title,
        personaName: persona.name,
        companyResearch: prepPackage.companyResearch || {},
        roleAnalysis: prepPackage.roleAnalysis || {},
        questionBank: prepPackage.questionBank || [],
        technicalTopics: prepPackage.technicalTopics || [],
        questionsForInterviewer: prepPackage.questionsForInterviewer || [],
        salaryResearch: prepPackage.salaryResearch || {},
        generatedAt: new Date().toISOString(),
      };

      // Store in application notes
      const notesData = JSON.stringify(structuredPrep);
      const updatedApplication = await prisma.application.update({
        where: { id: applicationId },
        data: {
          notes: notesData,
        },
      });

      logger.info(`Interview prep package generated for application: ${applicationId}`);
      return structuredPrep;
    } catch (error) {
      logger.error('Error generating interview prep package:', error);
      throw error;
    }
  }

  async getPrepPackage(applicationId: string) {
    try {
      logger.info(`Getting interview prep package for application: ${applicationId}`);

      const application = await prisma.application.findUnique({
        where: { id: applicationId },
        include: {
          job: {
            select: { title: true, company: true },
          },
          persona: {
            select: { name: true },
          },
        },
      });

      if (!application) {
        throw new NotFoundError(`Application with id ${applicationId} not found`);
      }

      if (!application.notes) {
        throw new NotFoundError(`No interview prep found for application ${applicationId}`);
      }

      try {
        const prepPackage = JSON.parse(application.notes);
        logger.info(`Interview prep package retrieved for application: ${applicationId}`);
        return prepPackage;
      } catch (parseError) {
        throw new ValidationError('Invalid interview prep data format');
      }
    } catch (error) {
      logger.error('Error getting interview prep package:', error);
      throw error;
    }
  }

  async saveNotes(applicationId: string, notes: string) {
    try {
      logger.info(`Saving interview notes for application: ${applicationId}`);

      if (!notes || notes.trim().length === 0) {
        throw new ValidationError('Notes cannot be empty');
      }

      const application = await prisma.application.findUnique({
        where: { id: applicationId },
      });

      if (!application) {
        throw new NotFoundError(`Application with id ${applicationId} not found`);
      }

      // Parse existing notes if they are JSON
      let existingData: any = {};
      if (application.notes) {
        try {
          existingData = JSON.parse(application.notes);
        } catch (e) {
          // If not JSON, treat as plain text notes
          existingData = { previousNotes: application.notes };
        }
      }

      // Add new notes with timestamp
      const updatedData = {
        ...existingData,
        interviewNotes: notes,
        notesUpdatedAt: new Date().toISOString(),
      };

      const updatedApplication = await prisma.application.update({
        where: { id: applicationId },
        data: {
          notes: JSON.stringify(updatedData),
        },
      });

      logger.info(`Interview notes saved for application: ${applicationId}`);
      return {
        applicationId,
        notes,
        savedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error saving interview notes:', error);
      throw error;
    }
  }

  async updateInterviewDate(applicationId: string, interviewDate: Date) {
    try {
      logger.info(`Updating interview date for application: ${applicationId}`, {
        date: interviewDate,
      });

      const application = await prisma.application.findUnique({
        where: { id: applicationId },
      });

      if (!application) {
        throw new NotFoundError(`Application with id ${applicationId} not found`);
      }

      const interviewDates = application.interviewDates || [];
      if (!interviewDates.includes(interviewDate)) {
        interviewDates.push(interviewDate);
      }

      const updatedApplication = await prisma.application.update({
        where: { id: applicationId },
        data: {
          status: 'INTERVIEW',
          interviewDates,
        },
      });

      logger.info(`Interview date updated for application: ${applicationId}`);
      return updatedApplication;
    } catch (error) {
      logger.error('Error updating interview date:', error);
      throw error;
    }
  }

  async generateQuestionBank(applicationId: string, topicFocus?: string) {
    try {
      logger.info(`Generating question bank for application: ${applicationId}`);

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

      // Generate focused question bank via AI
      const questions = await aiClient.generateQuestionBank({
        jobTitle: application.job.title,
        company: application.job.company,
        description: application.job.description,
        requirements: application.job.requirements,
        personaBackground: application.persona.user.structuredProfile as any,
        topicFocus,
      });

      if (!questions || questions.length === 0) {
        throw new AIError('Failed to generate question bank');
      }

      logger.info(`Question bank generated for application: ${applicationId}`, {
        count: questions.length,
      });

      return {
        applicationId,
        questions,
        topicFocus,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error generating question bank:', error);
      throw error;
    }
  }

  async generateCompanyResearch(applicationId: string) {
    try {
      logger.info(`Generating company research for application: ${applicationId}`);

      const application = await prisma.application.findUnique({
        where: { id: applicationId },
        include: {
          job: true,
        },
      });

      if (!application) {
        throw new NotFoundError(`Application with id ${applicationId} not found`);
      }

      // Call AI to generate company research
      const research = await aiClient.generateCompanyResearch({
        company: application.job.company,
        jobTitle: application.job.title,
        jobDescription: application.job.description,
      });

      if (!research) {
        throw new AIError('Failed to generate company research');
      }

      logger.info(`Company research generated for application: ${applicationId}`);

      return {
        applicationId,
        company: application.job.company,
        research,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error generating company research:', error);
      throw error;
    }
  }

  async generateSalaryResearch(applicationId: string) {
    try {
      logger.info(`Generating salary research for application: ${applicationId}`);

      const application = await prisma.application.findUnique({
        where: { id: applicationId },
        include: {
          job: true,
        },
      });

      if (!application) {
        throw new NotFoundError(`Application with id ${applicationId} not found`);
      }

      // Call AI to generate salary research
      const salaryData = await aiClient.generateSalaryResearch({
        jobTitle: application.job.title,
        company: application.job.company,
        location: application.job.location,
        salary: application.job.salary as any,
      });

      if (!salaryData) {
        throw new AIError('Failed to generate salary research');
      }

      logger.info(`Salary research generated for application: ${applicationId}`);

      return {
        applicationId,
        jobTitle: application.job.title,
        company: application.job.company,
        salary: salaryData,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error generating salary research:', error);
      throw error;
    }
  }

  async getInterviewSchedule(userId: string, dateRange?: { from: Date; to: Date }) {
    try {
      logger.info(`Getting interview schedule for user: ${userId}`);

      const where: any = {
        persona: {
          userId,
        },
        status: 'INTERVIEW',
      };

      if (dateRange) {
        where.interviewDates = {
          some: {
            gte: dateRange.from,
            lte: dateRange.to,
          },
        };
      }

      const interviews = await prisma.application.findMany({
        where,
        include: {
          job: {
            select: { title: true, company: true, location: true },
          },
          persona: {
            select: { name: true },
          },
        },
        orderBy: { interviewDates: 'asc' },
      });

      logger.info(`Found ${interviews.length} interviews for user: ${userId}`);

      return {
        userId,
        interviews,
        count: interviews.length,
        retrievedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error getting interview schedule:', error);
      throw error;
    }
  }

  async bulkGeneratePrepPackages(applicationIds: string[]) {
    try {
      logger.info(`Bulk generating prep packages for ${applicationIds.length} applications`);

      const results = [];

      for (const applicationId of applicationIds) {
        try {
          await interviewPrepQueue.add({
            applicationId,
            type: 'generate_prep',
          });

          results.push({
            applicationId,
            queued: true,
          });
        } catch (error) {
          logger.error(`Error queuing prep generation for application ${applicationId}`, error);
          results.push({
            applicationId,
            queued: false,
            error: (error as Error).message,
          });
        }
      }

      logger.info(`Queued prep generation for ${results.filter(r => r.queued).length} applications`);

      return {
        total: applicationIds.length,
        queued: results.filter(r => r.queued).length,
        results,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error in bulk prep generation:', error);
      throw error;
    }
  }
}

export const interviewService = new InterviewService();
