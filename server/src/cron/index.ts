import cron from 'node-cron';
import logger from '../utils/logger';
import config from '../config';

export interface CronJob {
  name: string;
  schedule: string;
  task: () => Promise<void>;
  enabled: boolean;
}

const cronJobs: Map<string, cron.ScheduledTask> = new Map();

export const registerCronJob = (job: CronJob): void => {
  if (!job.enabled) {
    logger.info(`Cron job "${job.name}" is disabled`);
    return;
  }

  try {
    const task = cron.schedule(job.schedule, async () => {
      logger.info(`Running cron job: ${job.name}`);
      const startTime = Date.now();

      try {
        await job.task();
        const duration = Date.now() - startTime;
        logger.info(`Cron job "${job.name}" completed in ${duration}ms`);
      } catch (error) {
        logger.error(`Error in cron job "${job.name}":`, error);
      }
    });

    cronJobs.set(job.name, task);
    logger.info(`Cron job "${job.name}" registered with schedule: ${job.schedule}`);
  } catch (error) {
    logger.error(`Failed to register cron job "${job.name}":`, error);
  }
};

export const startCronJobs = (): void => {
  logger.info('Starting all cron jobs...');

  registerCronJob({
    name: 'daily-scraper',
    schedule: config.cron.dailyScraperSchedule,
    task: async () => {
      logger.info('Daily scraper job would run here');
    },
    enabled: true,
  });

  registerCronJob({
    name: 'follow-up-checker',
    schedule: config.cron.followUpCheckSchedule,
    task: async () => {
      logger.info('Follow-up checker job would run here');
    },
    enabled: true,
  });

  logger.info(`${cronJobs.size} cron jobs started`);
};

export const stopCronJobs = (): void => {
  cronJobs.forEach((task, name) => {
    task.stop();
    logger.info(`Stopped cron job: ${name}`);
  });
  cronJobs.clear();
  logger.info('All cron jobs stopped');
};

export const getCronJobStatus = (): Record<string, string> => {
  const status: Record<string, string> = {};
  cronJobs.forEach((task, name) => {
    status[name] = task.status;
  });
  return status;
};
