import prisma from '../db/prisma';
import logger from '../utils/logger';
import { NotFoundError, ValidationError, AIError } from '../utils/errors';
import { FollowUpType } from '@prisma/client';
import { aiClient } from '../ai/client';
import { emailQueue, followUpQueue } from '../queue';
import { getDaysDifference } from '../utils/helpers';

export class FollowUpService {
  // Follow-up schedule: initial after 3 days, second after 7 days, final after 14 days
  private readonly followUpSchedule = {
    INITIAL: 3,
    SECOND: 7,
    FINAL: 14,
    THANK_YOU: 1,
    NEGOTIATION: 0, // Manual scheduling
  };

  async scheduleFollowUps(applicationId: string) {
    try {
      logger.info(`Scheduling follow-ups for application: ${applicationId}`);

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

      const appliedAt = application.appliedAt || new Date();
      const followUps = [];

      // Schedule initial follow-up (3 days after application)
      const initialScheduledAt = new Date(appliedAt.getTime() + this.followUpSchedule.INITIAL * 24 * 60 * 60 * 1000);
      const initialFollowUp = await prisma.followUp.create({
        data: {
          applicationId,
          type: 'INITIAL',
          scheduledAt: initialScheduledAt,
          status: 'pending',
        },
      });
      followUps.push(initialFollowUp);

      // Schedule second follow-up (7 days after application)
      const secondScheduledAt = new Date(appliedAt.getTime() + this.followUpSchedule.SECOND * 24 * 60 * 60 * 1000);
      const secondFollowUp = await prisma.followUp.create({
        data: {
          applicationId,
          type: 'SECOND',
          scheduledAt: secondScheduledAt,
          status: 'pending',
        },
      });
      followUps.push(secondFollowUp);

      // Schedule final follow-up (14 days after application)
      const finalScheduledAt = new Date(appliedAt.getTime() + this.followUpSchedule.FINAL * 24 * 60 * 60 * 1000);
      const finalFollowUp = await prisma.followUp.create({
        data: {
          applicationId,
          type: 'FINAL',
          scheduledAt: finalScheduledAt,
          status: 'pending',
        },
      });
      followUps.push(finalFollowUp);

      logger.info(`Follow-ups scheduled for application: ${applicationId}`, {
        count: followUps.length,
      });

      return followUps;
    } catch (error) {
      logger.error('Error scheduling follow-ups:', error);
      throw error;
    }
  }

  async getUpcoming(hoursAhead: number = 24) {
    try {
      logger.info(`Getting upcoming follow-ups (next ${hoursAhead} hours)`);

      const now = new Date();
      const deadline = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

      const followUps = await prisma.followUp.findMany({
        where: {
          status: 'pending',
          scheduledAt: {
            gte: now,
            lte: deadline,
          },
        },
        include: {
          application: {
            include: {
              job: true,
              persona: {
                include: {
                  user: true,
                },
              },
            },
          },
        },
        orderBy: { scheduledAt: 'asc' },
      });

      logger.info(`Found ${followUps.length} upcoming follow-ups`);
      return followUps;
    } catch (error) {
      logger.error('Error getting upcoming follow-ups:', error);
      throw error;
    }
  }

  async executeFollowUp(followUpId: string) {
    try {
      logger.info(`Executing follow-up: ${followUpId}`);

      const followUp = await prisma.followUp.findUnique({
        where: { id: followUpId },
        include: {
          application: {
            include: {
              job: true,
              persona: {
                include: {
                  user: true,
                },
              },
            },
          },
        },
      });

      if (!followUp) {
        throw new NotFoundError(`Follow-up with id ${followUpId} not found`);
      }

      if (followUp.status !== 'pending') {
        throw new ValidationError(
          `Cannot execute follow-up with status ${followUp.status}. Must be pending.`
        );
      }

      // Generate follow-up message
      const message = await aiClient.generateFollowUp(
        {
          jobTitle: followUp.application.job.title,
          company: followUp.application.job.company,
          personaName: followUp.application.persona.name,
          daysSinceApplication: getDaysDifference(
            followUp.application.appliedAt || new Date(),
            new Date()
          ),
        },
        followUp.type as any
      );

      if (!message) {
        throw new AIError('Failed to generate follow-up message');
      }

      // Queue the email
      await emailQueue.add({
        followUpId,
        applicationId: followUp.applicationId,
        channel: 'email',
        message,
        recipientEmail: followUp.application.persona.user.email,
        companyName: followUp.application.job.company,
        jobTitle: followUp.application.job.title,
      });

      // Update follow-up
      const updatedFollowUp = await prisma.followUp.update({
        where: { id: followUpId },
        data: {
          message,
          channel: 'email',
          status: 'sent',
        },
      });

      logger.info(`Follow-up executed: ${followUpId}`, {
        type: followUp.type,
        applicationId: followUp.applicationId,
      });

      return updatedFollowUp;
    } catch (error) {
      logger.error('Error executing follow-up:', error);
      throw error;
    }
  }

  async completeFollowUp(followUpId: string) {
    try {
      logger.info(`Completing follow-up: ${followUpId}`);

      const followUp = await prisma.followUp.findUnique({
        where: { id: followUpId },
      });

      if (!followUp) {
        throw new NotFoundError(`Follow-up with id ${followUpId} not found`);
      }

      const completedFollowUp = await prisma.followUp.update({
        where: { id: followUpId },
        data: {
          completedAt: new Date(),
          status: 'completed',
        },
      });

      logger.info(`Follow-up completed: ${followUpId}`);
      return completedFollowUp;
    } catch (error) {
      logger.error('Error completing follow-up:', error);
      throw error;
    }
  }

  async listForApplication(applicationId: string) {
    try {
      logger.info(`Listing follow-ups for application: ${applicationId}`);

      const followUps = await prisma.followUp.findMany({
        where: { applicationId },
        orderBy: { scheduledAt: 'asc' },
      });

      logger.info(`Found ${followUps.length} follow-ups for application: ${applicationId}`);
      return followUps;
    } catch (error) {
      logger.error('Error listing follow-ups:', error);
      throw error;
    }
  }

  async cancelFollowUps(applicationId: string) {
    try {
      logger.info(`Cancelling follow-ups for application: ${applicationId}`);

      const result = await prisma.followUp.updateMany({
        where: {
          applicationId,
          status: 'pending',
        },
        data: {
          status: 'cancelled',
        },
      });

      logger.info(`Cancelled ${result.count} follow-ups for application: ${applicationId}`);
      return {
        applicationId,
        cancelledCount: result.count,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error cancelling follow-ups:', error);
      throw error;
    }
  }

  async bulkScheduleFollowUps(applicationIds: string[]) {
    try {
      logger.info(`Bulk scheduling follow-ups for ${applicationIds.length} applications`);

      const scheduled = [];

      for (const applicationId of applicationIds) {
        try {
          const followUps = await this.scheduleFollowUps(applicationId);
          scheduled.push({
            applicationId,
            followUpCount: followUps.length,
            success: true,
          });
        } catch (error) {
          logger.error(`Error scheduling follow-ups for application ${applicationId}`, error);
          scheduled.push({
            applicationId,
            success: false,
            error: (error as Error).message,
          });
        }
      }

      logger.info(`Bulk follow-up scheduling completed`, {
        total: applicationIds.length,
        successful: scheduled.filter(s => s.success).length,
      });

      return {
        results: scheduled,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error in bulk follow-up scheduling:', error);
      throw error;
    }
  }

  async processScheduledFollowUps() {
    try {
      logger.info(`Processing scheduled follow-ups`);

      const upcomingFollowUps = await this.getUpcoming(1); // Check next hour

      const results = [];

      for (const followUp of upcomingFollowUps) {
        try {
          const executed = await this.executeFollowUp(followUp.id);
          results.push({
            followUpId: followUp.id,
            success: true,
            message: 'Follow-up executed',
          });
        } catch (error) {
          logger.error(`Error executing follow-up ${followUp.id}`, error);
          results.push({
            followUpId: followUp.id,
            success: false,
            error: (error as Error).message,
          });
        }
      }

      logger.info(`Processed ${results.length} follow-ups`);
      return {
        processedCount: results.length,
        results,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error processing scheduled follow-ups:', error);
      throw error;
    }
  }
}

export const followUpService = new FollowUpService();
