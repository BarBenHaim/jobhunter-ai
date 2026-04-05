import Queue from 'bull';
import logger from '../../utils/logger';
import { cvService } from '../../services/cv.service';
import { io } from '../../index';
import prisma from '../../db/prisma';

interface CVGenerationJobData {
  applicationId: string;
  templateId?: string;
  format?: 'pdf' | 'docx';
  userId: string;
}

export const setupCVGenerationProcessor = (queue: Queue.Queue<CVGenerationJobData>) => {
  queue.process(3, async (job) => {
    try {
      logger.info(`Processing CV generation job ${job.id}`, {
        applicationId: job.data.applicationId,
        format: job.data.format || 'pdf',
        userId: job.data.userId,
      });

      // Get application details
      const application = await prisma.application.findUnique({
        where: { id: job.data.applicationId },
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
        throw new Error(`Application ${job.data.applicationId} not found`);
      }

      // Generate CV
      const cvData = await cvService.generateCV({
        applicationId: job.data.applicationId,
        personaId: application.personaId,
        jobId: application.jobId,
        templateId: job.data.templateId,
        format: job.data.format || 'pdf',
      });

      // Save CV file path to application
      const updatedApplication = await prisma.application.update({
        where: { id: job.data.applicationId },
        data: {
          cvFilePath: cvData.filePath,
          cvContent: cvData.content,
          status: 'CV_READY' as any,
        },
      });

      // Emit WebSocket event
      io.emit('cv:generated', {
        applicationId: job.data.applicationId,
        filePath: cvData.filePath,
        format: job.data.format || 'pdf',
        timestamp: new Date().toISOString(),
      });

      logger.info(`CV generated for application ${job.data.applicationId}`, {
        filePath: cvData.filePath,
        format: job.data.format || 'pdf',
      });

      return {
        success: true,
        applicationId: job.data.applicationId,
        filePath: cvData.filePath,
        format: job.data.format || 'pdf',
      };
    } catch (error) {
      logger.error(`Error processing CV generation job ${job.id}:`, error);

      // Update application status to error
      try {
        await prisma.application.update({
          where: { id: job.data.applicationId },
          data: {
            status: 'CV_GENERATION_FAILED' as any,
          },
        });
      } catch (updateError) {
        logger.error('Error updating application status:', updateError);
      }

      throw error;
    }
  });
};

export default setupCVGenerationProcessor;
