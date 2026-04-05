import Queue from 'bull';
import logger from '../../utils/logger';
import { scoringService } from '../../services/scoring.service';
import { applicationService } from '../../services/application.service';
import { io } from '../../index';
import prisma from '../../db/prisma';

interface ScoringJobData {
  jobId: string;
  personaId?: string;
  userId: string;
}

export const setupScoringProcessor = (queue: Queue.Queue<ScoringJobData>) => {
  queue.process(10, async (job) => {
    try {
      logger.info(`Processing scoring job ${job.id}`, {
        jobId: job.data.jobId,
        personaId: job.data.personaId,
        userId: job.data.userId,
      });

      // Score the job
      const scores = await scoringService.scoreJob(job.data.jobId);

      if (!scores || scores.length === 0) {
        logger.warn(`No scores generated for job ${job.data.jobId}`);
        return {
          success: true,
          scoresCreated: 0,
          autoApplied: 0,
        };
      }

      // Emit WebSocket events for scores
      io.emit('job:scored', {
        jobId: job.data.jobId,
        scoresCount: scores.length,
        timestamp: new Date().toISOString(),
      });

      // Check if any score triggers auto-apply
      let autoAppliedCount = 0;
      const autoApplyThreshold = 85;

      for (const score of scores) {
        if (score.overallScore >= autoApplyThreshold && score.recommendation === 'AUTO_APPLY') {
          try {
            // Create application
            const application = await prisma.application.create({
              data: {
                jobId: job.data.jobId,
                personaId: score.personaId,
                status: 'AUTO_QUEUED' as any,
                score: score.overallScore,
              },
            });

            autoAppliedCount++;

            // Queue CV generation
            const cvQueue = require('../index').cvGenerationQueue;
            await cvQueue.add({
              applicationId: application.id,
              userId: job.data.userId,
            });

            logger.info(`Auto-apply triggered for job ${job.data.jobId} and persona ${score.personaId}`);
          } catch (error) {
            logger.error(`Error triggering auto-apply for persona ${score.personaId}:`, error);
          }
        }
      }

      logger.info(`Scoring completed for job ${job.data.jobId}`, {
        scoresCreated: scores.length,
        autoApplied: autoAppliedCount,
      });

      return {
        success: true,
        scoresCreated: scores.length,
        autoApplied: autoAppliedCount,
      };
    } catch (error) {
      logger.error(`Error processing scoring job ${job.id}:`, error);
      throw error;
    }
  });
};

export default setupScoringProcessor;
