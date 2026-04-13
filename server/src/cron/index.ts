import cron from 'node-cron';
import logger from '../utils/logger';
import config from '../config';
import prisma from '../db/prisma';
import { runAutoPilot, getUserAutoPilotConfig } from '../services/autopilot.service';
import { savedSearchRunnerService } from '../services/saved-search-runner.service';

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

  // AutoPilot scheduler — checks all users every hour, runs for those whose schedule matches
  registerCronJob({
    name: 'autopilot-scheduler',
    schedule: '0 * * * *', // Every hour, check if any user's autopilot should run
    task: async () => {
      try {
        const users = await prisma.userProfile.findMany({
          select: { id: true, preferences: true },
        });

        for (const user of users) {
          const prefs = (user as any).preferences || {};
          const apConfig = getUserAutoPilotConfig(prefs);

          if (!apConfig.enabled) continue;
          if (apConfig.pausedUntil && new Date(apConfig.pausedUntil) > new Date()) continue;

          // Check if a run is already in progress
          const activeRun = await (prisma as any).autoPilotRun.findFirst({
            where: { userId: user.id, status: 'RUNNING' },
          });
          if (activeRun) continue;

          // Check schedule — simple hour-based matching
          // Supported schedules: every 1h, 3h, 6h, 12h, 24h
          const hour = new Date().getHours();
          const schedule = apConfig.schedule || '0 */6 * * *';
          let shouldRun = false;

          if (schedule.includes('*/1') || schedule === '0 * * * *') shouldRun = true;
          else if (schedule.includes('*/3')) shouldRun = hour % 3 === 0;
          else if (schedule.includes('*/6')) shouldRun = hour % 6 === 0;
          else if (schedule.includes('*/12')) shouldRun = hour % 12 === 0;
          else if (schedule === '0 2 * * *') shouldRun = hour === 2;
          else shouldRun = hour % 6 === 0; // Default: every 6 hours

          if (!shouldRun) continue;

          logger.info(`[AutoPilot-Cron] Triggering scheduled run for user ${user.id}`);
          runAutoPilot(user.id, 'SCHEDULE').catch(err => {
            logger.error(`[AutoPilot-Cron] Run failed for user ${user.id}`, err);
          });
        }
      } catch (err) {
        logger.error('[AutoPilot-Cron] Scheduler error', err);
      }
    },
    enabled: true,
  });

  // Saved Search runner — checks every hour for saved searches that need execution
  registerCronJob({
    name: 'saved-search-runner',
    schedule: '30 * * * *', // Every hour at :30 (offset from autopilot at :00)
    task: async () => {
      try {
        logger.info('[SavedSearch-Cron] Running saved search checks...');
        await savedSearchRunnerService.runSavedSearches();
        logger.info('[SavedSearch-Cron] Completed');
      } catch (err) {
        logger.error('[SavedSearch-Cron] Error running saved searches', err);
      }
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
