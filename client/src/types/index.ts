// Enums - aligned with server Prisma schema
export enum JobSource {
  LINKEDIN = 'LINKEDIN',
  INDEED = 'INDEED',
  ALLJOBS = 'ALLJOBS',
  DRUSHIM = 'DRUSHIM',
  FACEBOOK_GROUP = 'FACEBOOK_GROUP',
  WELLFOUND = 'WELLFOUND',
  COMPANY_CAREER_PAGE = 'COMPANY_CAREER_PAGE',
  GOOGLE_JOBS = 'GOOGLE_JOBS',
  GLASSDOOR = 'GLASSDOOR',
  OTHER = 'OTHER',
}

export enum LocationType {
  REMOTE = 'REMOTE',
  ONSITE = 'ONSITE',
  HYBRID = 'HYBRID',
}

export enum Recommendation {
  AUTO_APPLY = 'AUTO_APPLY',
  MANUAL_REVIEW = 'MANUAL_REVIEW',
  SKIP = 'SKIP',
  ARCHIVE = 'ARCHIVE',
}

export enum AppStatus {
  PENDING = 'PENDING',
  CV_GENERATED = 'CV_GENERATED',
  AWAITING_REVIEW = 'AWAITING_REVIEW',
  APPROVED = 'APPROVED',
  APPLIED = 'APPLIED',
  VIEWED = 'VIEWED',
  RESPONDED = 'RESPONDED',
  INTERVIEW = 'INTERVIEW',
  OFFER = 'OFFER',
  REJECTED = 'REJECTED',
  WITHDRAWN = 'WITHDRAWN',
}

export enum FollowUpType {
  INITIAL = 'INITIAL',
  SECOND = 'SECOND',
  FINAL = 'FINAL',
  THANK_YOU = 'THANK_YOU',
  NEGOTIATION = 'NEGOTIATION',
}

export enum ResponseType {
  POSITIVE = 'POSITIVE',
  NEGATIVE = 'NEGATIVE',
  INFO_REQUEST = 'INFO_REQUEST',
  INTERVIEW_INVITE = 'INTERVIEW_INVITE',
}

// User & Profile
export interface UserProfile {
  id: string
  fullName: string
  email: string
  phone?: string
  location?: string
  linkedinUrl?: string
  githubUrl?: string
  portfolioUrl?: string
  rawKnowledge?: Record<string, any>
  structuredProfile?: Record<string, any>
  preferences?: Record<string, any>
  createdAt: Date
  updatedAt: Date
}

// Personas
export interface Persona {
  id: string
  userId: string
  name: string
  slug: string
  title: string
  summary: string
  targetKeywords: string[]
  excludeKeywords: string[]
  skillPriority?: Record<string, any>
  experienceRules?: Record<string, any>
  cvTemplateId?: string
  isActive: boolean
  searchSchedule?: Record<string, any>
  createdAt: Date
  updatedAt: Date
}

// Jobs
export interface Job {
  id: string
  externalId?: string
  title: string
  company: string
  companyUrl?: string
  description: string
  source: JobSource
  sourceUrl: string
  location: string
  locationType: LocationType
  salary?: {
    min?: number
    max?: number
    currency?: string
  }
  requirements?: string
  experienceLevel?: string
  tags?: string[]
  postedAt?: Date
  scrapedAt?: Date
  expiresAt?: Date
  isActive: boolean
  rawData?: Record<string, any>
  dedupHash?: string
  createdAt: Date
  updatedAt: Date
}

export interface JobWithScore extends Job {
  scores?: JobScore[]
  score?: number
  recommendation?: Recommendation
}

export interface JobScore {
  id: string
  jobId: string
  personaId: string
  overallScore: number
  skillMatch: number
  experienceMatch: number
  cultureFit: number
  salaryMatch: number
  acceptanceProb: number
  recommendation: Recommendation
  reasoning?: string
  matchedSkills: string[]
  missingSkills: string[]
  redFlags: string[]
  bestPersonaId?: string
  scoredAt: Date
}

// Applications
export interface Application {
  id: string
  jobId: string
  personaId: string
  status: AppStatus
  cvFilePath?: string
  coverLetterPath?: string
  cvContent?: Record<string, any>
  appliedAt?: Date
  appliedVia?: string
  responseAt?: Date
  responseType?: ResponseType
  interviewDates: Date[]
  notes?: string
  score?: number
  createdAt: Date
  updatedAt: Date
}

// CV Management
export interface CV {
  id: string
  userId: string
  personaId?: string
  name: string
  content: string
  format: 'pdf' | 'docx' | 'markdown'
  isTemplate: boolean
  atsScore?: number
  createdAt: Date
  updatedAt: Date
}

// Follow-ups
export interface FollowUp {
  id: string
  applicationId: string
  type: FollowUpType
  scheduledAt: Date
  completedAt?: Date
  message?: string
  channel?: string
  status: 'pending' | 'completed' | 'cancelled'
  createdAt: Date
  updatedAt: Date
}

// Analytics
export interface AnalyticsEvent {
  id: string
  userId: string
  eventType: string
  entityType?: string
  entityId?: string
  metadata?: Record<string, any>
  createdAt: Date
}

export interface FunnelData {
  stage: string
  count: number
  percentage: number
}

export interface ScoreDistribution {
  range: string
  count: number
}

export interface TrendData {
  date: string
  applications: number
  interviews: number
  offers: number
}

// Scoring Rules
export interface ScoringRule {
  id: string
  personaId: string
  ruleType: string
  field: string
  value: string
  weight: number
  learnedFrom?: string
  createdAt: Date
  updatedAt: Date
}

// API Response Types
export interface PaginatedResponse<T> {
  success: boolean
  data: T[]
  meta: {
    total: number
    page: number
    limit: number
    pages: number
    hasMore: boolean
  }
}

export interface ApiError {
  message: string
  code: string
  details?: Record<string, any>
}

// Filter Types
export interface JobFilters {
  page?: number
  limit?: number
  source?: JobSource | string
  locationType?: LocationType | string
  search?: string
  sort?: string
  order?: 'asc' | 'desc'
}

export interface ApplicationFilters {
  page?: number
  limit?: number
  status?: AppStatus
  personaId?: string
  sortBy?: 'newest' | 'oldest' | 'status'
}

export interface FollowUpFilters {
  page?: number
  limit?: number
  status?: 'pending' | 'completed' | 'cancelled'
  sortBy?: 'scheduled' | 'oldest'
}

// Settings
export interface Settings {
  userId: string
  theme: 'light' | 'dark' | 'auto'
  emailNotifications: boolean
  pushNotifications: boolean
  scrapeFrequency: 'daily' | 'weekly' | 'monthly'
  autoScoreNewJobs: boolean
  customScrapers?: CustomScraper[]
}

export interface CustomScraper {
  id: string
  name: string
  url: string
  selector: string
  fields: Record<string, string>
  isActive: boolean
}

// System
export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'down'
  scraper: boolean
  database: boolean
  mail: boolean
  externalApis: Record<string, boolean>
  uptime: number
  lastCheck: Date
}

// Scrape types
export interface ScrapeSource {
  id: string
  name: string
  url: string
  description: string
  available: boolean
  requiresApiKey?: string
}

export interface ScrapeStatus {
  currentStats: {
    lastScrapeTime: Date | null
    lastJobCount: number
    totalScrapesRun: number
    sourceStats: Record<string, { count: number; timestamp: Date }>
  }
  databaseStats: Record<string, any>
  availableSources: string[]
  lastScraped: Date | null
  totalScrapesRun: number
  totalJobsInDB: number
}

export interface ScrapeTriggerResult {
  totalJobsCreated: number
  jobsCreated: Array<{ id: string; title: string; company: string; source: string }>
  sourceBreakdown: Array<{ source: string; scrapedCount: number; timestamp: Date }>
  keywords: string[]
  location: string
}
