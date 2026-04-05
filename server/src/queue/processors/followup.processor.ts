import Queue from 'bull';
import logger from '../../utils/logger';
import { followupService } from '../../services/followup.service';
import { io } from '../../index';
import prisma from '../../db/prisma';

interface FollowupJobData {
  followupId: string;
  userId: string;
}

export const setupFollowupProcessor = (queue: Queue.Queue<FollowupJobData>) => {
  queue.process(3, async (job) => {
    try {
      logger.info(`Processing follow-up job ${job.id}`, {
        followupId: job.data.followupId,
        userId: job.data.userId,
      });

      // Get follow-up details
      const followup = await prisma.followUp.findUnique({
        where: { id: job.data.followupId },
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

      if (!followup) {
        throw new Error(`Follow-up ${job.data.followupId} not found`);
      }

      if (!followup.application) {
        throw new Error(`Application for follow-up ${job.data.followupId} not found`);
      }

      // Use provided message or generate a default one
      const message = followup.message || `Following up on your application for ${followup.application.job.title} at ${followup.application.job.company}. We'd love to hear if you have any updates!`;

      // Send via appropriate channel
      const emailQueue = require('../index').emailQueue;

      if (followup.channel === 'email' || followup.channel === undefined) {
        // Send email
        await emailQueue.add({
          to: followup.application.persona.user.email,
          subject: `Follow-up: ${followup.application.job.title} at ${followup.application.job.company}`,
          body: message,
          userId: job.data.userId,
          applicationId: followup.applicationId,
        });

        logger.info(`Follow-up email queued for ${followup.applicationId}`);
      } else if (followup.channel === 'phone') {
        // TODO: Implement SMS/phone follow-up
        logger.info(`Phone follow-up not yet implemented for ${followup.applicationId}`);
      } else if (followup.channel === 'linkedin') {
        // TODO: Implement LinkedIn follow-up
        logger.info(`LinkedIn follow-up not yet implemented for ${followup.applicationId}`);
      }

      // Update follow-up status
      const updatedFollowup = await prisma.followUp.update({
        where: { id: job.data.followupId },
        data: {
          status: 'EXECUTED' as any,
          executedAt: new Date(),
        },
      });

      // Emit WebSocket event
      io.emit('followup:executed', {
        followupId: job.data.followupId,
        applicationId: followup.applicationId,
        channel: followup.channel,
        timestamp: new Date().toISOString(),
      });

      logger.info(`Follow-up executed for application ${followup.applicationId}`, {
        followupId: job.data.followupId,
        channel: followup.channel,
      });

      return {
        success: true,
        followupId: job.data.followupId,
        applicationId: followup.applicationId,
        channel: followup.channel,
        status: 'EXECUTED',
      };
    } catch (error) {
      logger.error(`Error processing follow-up job ${job.id}:`, error);

      // Update follow-up status to failed
      try {
        await prisma.followUp.update({
          where: { id: job.data.followupId },
          data: {
            status: 'FAILED' as any,
          },
        });
      } catch (updateError) {
        logger.error('Error updating follow-up status:', updateError);
      }

      throw error;
    }
  });
};

export const scheduleFollowupChecks = (queue: Queue.Queue<FollowupJobData>) => {
  // Run every hour to check for due follow-ups
  const repeatOptions = {
    repeat: {
      cron: '0 * * * *', // Every hour at minute 0
    },
  };

  queue.add(
    {
      followupId: 'check-due',
      userId: 'system',
    },
    {
      ...repeatOptions,
      jobId: 'check-due-followups',
    }
  );

  queue.process('check-due', async (job) => {
    try {
      logger.info('Checking for due follow-ups');

      // Get all due follow-ups
      const dueFollowups = await prisma.followUp.findMany({
        where: {
          status: 'SCHEDULED' as any,
          scheduledAt: {
            lte: new Date(),
          },
        },
        select: { id: true, userId: true },
      });

      logger.info(`Found ${dueFollowups.length} due follow-ups`);

      // Queue each for execution
      for (const followup of dueFollowups) {
        await queue.add({
          followupId: followup.id,
          userId: followup.userId,
        });
      }

      return {
        success: true,
        checkedCount: dueFollowups.length,
      };
    } catch (error) {
      logger.error('Error checking due follow-ups:', error);
      throw error;
    }
  });
};

export default setupFollowupProcessor;
