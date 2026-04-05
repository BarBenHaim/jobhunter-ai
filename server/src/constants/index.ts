export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

export const JOB_SOURCES = {
  LINKEDIN: 'LINKEDIN',
  INDEED: 'INDEED',
  ALLJOBS: 'ALLJOBS',
  DRUSHIM: 'DRUSHIM',
  FACEBOOK_GROUP: 'FACEBOOK_GROUP',
  WELLFOUND: 'WELLFOUND',
  COMPANY_CAREER_PAGE: 'COMPANY_CAREER_PAGE',
  GOOGLE_JOBS: 'GOOGLE_JOBS',
  GLASSDOOR: 'GLASSDOOR',
  OTHER: 'OTHER',
} as const;

export const LOCATION_TYPES = {
  REMOTE: 'REMOTE',
  HYBRID: 'HYBRID',
  ONSITE: 'ONSITE',
} as const;

export const APPLICATION_STATUSES = {
  PENDING: 'PENDING',
  CV_GENERATED: 'CV_GENERATED',
  AWAITING_REVIEW: 'AWAITING_REVIEW',
  APPROVED: 'APPROVED',
  APPLIED: 'APPLIED',
  VIEWED: 'VIEWED',
  RESPONDED: 'RESPONDED',
  INTERVIEW: 'INTERVIEW',
  OFFER: 'OFFER',
  REJECTED: 'REJECTED',
  WITHDRAWN: 'WITHDRAWN',
} as const;

export const RECOMMENDATION_TYPES = {
  AUTO_APPLY: 'AUTO_APPLY',
  MANUAL_REVIEW: 'MANUAL_REVIEW',
  SKIP: 'SKIP',
  ARCHIVE: 'ARCHIVE',
} as const;

export const FOLLOW_UP_TYPES = {
  INITIAL: 'INITIAL',
  SECOND: 'SECOND',
  FINAL: 'FINAL',
  THANK_YOU: 'THANK_YOU',
  NEGOTIATION: 'NEGOTIATION',
} as const;

export const RESPONSE_TYPES = {
  POSITIVE: 'POSITIVE',
  NEGATIVE: 'NEGATIVE',
  INFO_REQUEST: 'INFO_REQUEST',
  INTERVIEW_INVITE: 'INTERVIEW_INVITE',
} as const;

export const SCORING_WEIGHTS = {
  SKILL_MATCH: 0.35,
  EXPERIENCE_MATCH: 0.25,
  CULTURE_FIT: 0.15,
  SALARY_MATCH: 0.15,
  ACCEPTANCE_PROBABILITY: 0.10,
} as const;

export const SKILL_LEVELS = {
  BEGINNER: 'beginner',
  INTERMEDIATE: 'intermediate',
  ADVANCED: 'advanced',
  EXPERT: 'expert',
} as const;

export const EXPERIENCE_LEVELS = {
  ENTRY_LEVEL: 'entry_level',
  MID_LEVEL: 'mid_level',
  SENIOR: 'senior',
  LEAD: 'lead',
  C_LEVEL: 'c_level',
} as const;

export const ANALYTICS_EVENTS = {
  USER_SIGNUP: 'user_signup',
  USER_LOGIN: 'user_login',
  PROFILE_CREATED: 'profile_created',
  PROFILE_UPDATED: 'profile_updated',
  PERSONA_CREATED: 'persona_created',
  PERSONA_UPDATED: 'persona_updated',
  JOB_SCORED: 'job_scored',
  APPLICATION_CREATED: 'application_created',
  APPLICATION_UPDATED: 'application_updated',
  CV_GENERATED: 'cv_generated',
  FOLLOW_UP_SENT: 'follow_up_sent',
} as const;

export const PAGINATION_DEFAULTS = {
  LIMIT: 20,
  OFFSET: 0,
  MAX_LIMIT: 100,
} as const;

export const VALIDATION_RULES = {
  MIN_PASSWORD_LENGTH: 8,
  MAX_NAME_LENGTH: 255,
  MAX_TITLE_LENGTH: 100,
  MAX_SUMMARY_LENGTH: 2000,
  MIN_SCORE: 0,
  MAX_SCORE: 1,
} as const;

export const ERROR_MESSAGES = {
  UNAUTHORIZED: 'Unauthorized access',
  FORBIDDEN: 'Access forbidden',
  NOT_FOUND: 'Resource not found',
  INVALID_INPUT: 'Invalid input provided',
  DATABASE_ERROR: 'Database error occurred',
  INTERNAL_ERROR: 'Internal server error',
  RATE_LIMITED: 'Too many requests',
} as const;

export const SOCKET_EVENTS = {
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  ERROR: 'error',
  JOB_SCORED: 'job_scored',
  APPLICATION_CREATED: 'application_created',
  APPLICATION_UPDATED: 'application_updated',
  CV_GENERATED: 'cv_generated',
  SCRAPING_STARTED: 'scraping_started',
  SCRAPING_COMPLETED: 'scraping_completed',
} as const;
