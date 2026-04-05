import Queue from 'bull';
import Redis from 'ioredis';
import logger from '../utils/logger';
import config from '../config';
import setupScrapingProcessor from './processors/scraping.processor';
import setupScoringProcessor from './processors/scoring.processor';
import setupCVGenerationProcessor from './processors/cv-generation.processor';
import setupEmailProcessor from './processors/email.processor';
import setupFollowupProcessor, { scheduleFollowupChecks } from './processors/followup.processor';

const redisConnection = new Redis(config.redis.url);

export const createQueue = <T = any>(name: string) => {
  const queue = new Queue<T>(name, {
    redis: config.redis.url,
    defaultJobOptions: {
      removeOnComplete: {
        age: 3600,
        isPattern: false,
      },
      removeOnFail: {
        age: 86400,
      },
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    },
  });

  queue.on('error', (error) => {
    logger.error(`Queue ${name} error:`, error);
  });

  queue.on('completed', (job) => {
    logger.info(`Job ${job.id} completed in queue ${name}`);
  });

  queue.on('failed', (job, error) => {
    logger.error(`Job ${job.id} failed in queue ${name}:`, error);
  });

  return queue;
};

export const scrapingQueue = createQueue('scraping');
export const scoringQueue = createQueue('scoring');
export const cvGenerationQueue = createQueue('cv-generation');
export const emailQueue = createQueue('email');
export const followUpQueue = createQueue('follow-up');
export const interviewPrepQueue = createQueue('interview-prep');

// Initialize all processors
export const initializeQueueProcessors = () => {
  try {
    logger.info('Initializing queue processors...');

    // Setup scraping processor
    setupScrapingProcessor(scrapingQueue);
    logger.info('Scraping processor initialized');

    // Setup scoring processor
    setupScoringProcessor(scoringQueue);
    logger.info('Scoring processor initialized');

    // Setup CV generation processor
    setupCVGenerationProcessor(cvGenerationQueue);
    logger.info('CV generation processor initialized');

    // Setup email processor
    setupEmailProcessor(emailQueue);
    logger.info('Email processor initialized');

    // Setup follow-up processor and scheduled checks
    setupFollowupProcessor(followUpQueue);
    scheduleFollowupChecks(followUpQueue);
    logger.info('Follow-up processor initialized with scheduled checks');

    logger.info('All queue processors initialized successfully');
  } catch (error) {
    logger.error('Error initializing queue processors:', error);
    throw error;
  }
};

export const getQueueStats = async (queue: Queue.Queue) => {
  const [waiting, active, delayed, failed, completed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getDelayedCount(),
    queue.getFailedCount(),
    queue.getCompletedCount(),
  ]);

  return {
    waiting,
    active,
    delayed,
    failed,
    completed,
  };
};

export const getAllQueueStats = async () => {
  const [scraping, scoring, cvGeneration, email, followUp, interviewPrep] = await Promise.all([
    getQueueStats(scrapingQueue),
    getQueueStats(scoringQueue),
    getQueueStats(cvGenerationQueue),
    getQueueStats(emailQueue),
    getQueueStats(followUpQueue),
    getQueueStats(interviewPrepQueue),
  ]);

  return {
    scraping,
    scoring,
    cvGeneration,
    email,
    followUp,
    interviewPrep,
    timestamp: new Date().toISOString(),
  };
};

export const closeQueues = async () => {
  try {
    logger.info('Closing all queues...');
    await Promise.all([
      scrapingQueue.close(),
      scoringQueue.close(),
      cvGenerationQueue.close(),
      emailQueue.close(),
      followUpQueue.close(),
      interviewPrepQueue.close(),
      redisConnection.quit(),
    ]);
    logger.info('All queues closed successfully');
  } catch (error) {
    logger.error('Error closing queues:', error);
    throw error;
  }
};
