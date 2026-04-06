import dotenv from 'dotenv';

dotenv.config();

export const config = {
  app: {
    name: 'JobHunter AI',
    version: '1.0.0',
    port: parseInt(process.env.PORT || process.env.APP_PORT || '3001', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  database: {
    url: process.env.DATABASE_URL || 'postgresql://localhost/jobhunter_ai',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'change-me-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  scrapers: {
    linkedin: {
      enabled: process.env.LINKEDIN_SCRAPER_ENABLED === 'true',
    },
    indeed: {
      enabled: process.env.INDEED_SCRAPER_ENABLED === 'true',
    },
    alljobs: {
      enabled: process.env.ALLJOBS_SCRAPER_ENABLED === 'true',
    },
    drushim: {
      enabled: process.env.DRUSHIM_SCRAPER_ENABLED === 'true',
    },
    facebookGroup: {
      enabled: process.env.FACEBOOK_GROUP_SCRAPER_ENABLED === 'true',
    },
    wellfound: {
      enabled: process.env.WELLFOUND_SCRAPER_ENABLED === 'true',
    },
    companyCareers: {
      enabled: process.env.COMPANY_CAREER_PAGE_SCRAPER_ENABLED === 'true',
    },
    googleJobs: {
      enabled: process.env.GOOGLE_JOBS_SCRAPER_ENABLED === 'true',
    },
    glassdoor: {
      enabled: process.env.GLASSDOOR_SCRAPER_ENABLED === 'true',
    },
  },
  ai: {
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    openaiModel: process.env.OPENAI_MODEL || 'gpt-4-turbo',
    scoringEnabled: process.env.AI_SCORING_ENABLED === 'true',
    cvGenerationEnabled: process.env.AI_CV_GENERATION_ENABLED === 'true',
    interviewPrepEnabled: process.env.AI_INTERVIEW_PREP_ENABLED === 'true',
  },
  playwright: {
    headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
    timeout: parseInt(process.env.PLAYWRIGHT_TIMEOUT || '30000', 10),
  },
  email: {
    service: process.env.EMAIL_SERVICE || 'gmail',
    user: process.env.EMAIL_USER || '',
    password: process.env.EMAIL_PASSWORD || '',
    from: process.env.EMAIL_FROM || 'noreply@jobhunter-ai.com',
    smtp: {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
    },
  },
  cron: {
    dailyScraperSchedule: process.env.DAILY_SCRAPER_CRON || '0 2 * * *',
    followUpCheckSchedule: process.env.FOLLOW_UP_CHECK_CRON || '0 9 * * 1-5',
  },
  autoApply: {
    enabled: process.env.AUTO_APPLY_ENABLED === 'true',
    minScore: parseFloat(process.env.AUTO_APPLY_MIN_SCORE || '0.75'),
    batchSize: parseInt(process.env.APPLICATION_BATCH_SIZE || '10', 10),
    maxPerDay: parseInt(process.env.MAX_APPLICATIONS_PER_DAY || '20', 10),
  },
  sentry: {
    dsn: process.env.SENTRY_DSN || '',
    enabled: process.env.SENTRY_ENABLED === 'true',
  },
  defaults: {
    linkedinProfileVisibility: process.env.FALLBACK_LINKEDIN_PROFILE_VISIBILITY || 'everyone',
    cvLanguage: process.env.FALLBACK_CV_LANGUAGE || 'english',
  },
};

export default config;
