// Enums
export enum JobSource {
  LINKEDIN = 'linkedin',
  INDEED = 'indeed',
  GLASSDOOR = 'glassdoor',
  BUILTIN = 'builtin',
  TECHCRUNCH = 'techcrunch',
  ANGELLIST = 'angellist',
  MANUAL = 'manual',
}

export enum LocationType {
  REMOTE = 'remote',
  ONSITE = 'onsite',
  HYBRID = 'hybrid',
}

export enum Recommendation {
  STRONG_PASS = 'strong_pass',
  PASS = 'pass',
  MAYBE = 'maybe',
  REVIEW = 'review',
  WEAK_REJECT = 'weak_reject',
  STRONG_REJECT = 'strong_reject',
}

export enum AppStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  IN_PROGRESS = 'in_progress',
  INTERVIEW = 'interview',
  OFFER = 'offer',
  WITHDRAWN = 'withdrawn',
}

export enum FollowUpType {
  REMINDER = 'reminder',
  EMAIL = 'email',
  CALL = 'call',
  LINKEDIN = 'linkedin',
}

export enum ResponseType {
  POSITIVE = 'positive',
  NEGATIVE = 'negative',
  NEUTRAL = 'neutral',
  NO_RESPONSE = 'no_response',
}

// User & Profile
export interface UserProfile {
  id: string
  name: string
  email: string
  phone?: string
  location?: string
  timezone?: string
  currentRole?: string
  targetRoles: string[]
  yearsOfExperience: number
  skills: string[]
  certifications?: string[]
  linkedinUrl?: string
  githubUrl?: string
  portfolioUrl?: string
  createdAt: Date
  updatedAt: Date
}

// Personas
export interface Persona {
  id: string
  userId: string
  name: string
  description?: string
  targetRoles: string[]
  targetCompanies?: string[]
  targetIndustries?: string[]
  minSalary?: number
  maxSalary?: number
  preferredLocations: LocationType[]
  requiredSkills: string[]
  niceToHaveSkills: string[]
  importance?: Record<string, number>
  isActive: boolean
  cvId?: string
  customScoring?: boolean
  scoringWeights?: ScoringWeights
  createdAt: Date
  updatedAt: Date
}

export interface ScoringWeights {
  roleMatch: number
  skillMatch: number
  companyMatch: number
  compensationMatch: number
  locationMatch: number
}

// Jobs
export interface Job {
  id: string
  title: string
  company: string
  description: string
  source: JobSource
  sourceUrl: string
  location: string
  locationType: LocationType
  salary?: {
    min?: number
    max?: number
    currency: string
  }
  requirements: string[]
  tags: string[]
  postedAt: Date
  expiresAt?: Date
  views: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface JobScore {
  id: string
  jobId: string
  personaId: string
  overallScore: number
  recommendation: Recommendation
  roleMatch: number
  skillMatch: number
  companyMatch: number
  compensationMatch: number
  locationMatch: number
  reasoning: string
  strengths: string[]
  gaps: string[]
  improvementSuggestions: string[]
  scoredAt: Date
}

// Applications
export interface Application {
  id: string
  jobId: string
  personaId: string
  userId: string
  status: AppStatus
  cvId?: string
  coverLetterId?: string
  submittedAt?: Date
  responses?: ApplicationResponse[]
  notes?: string
  rejectionReason?: string
  createdAt: Date
  updatedAt: Date
}

export interface ApplicationResponse {
  type: string
  content: string
  respondedAt: Date
  responseType: ResponseType
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

export interface CVTemplate {
  id: string
  name: string
  description: string
  content: string
  category: string
  isPublic: boolean
}

// Follow-ups
export interface FollowUp {
  id: string
  applicationId: string
  type: FollowUpType
  scheduledFor: Date
  message?: string
  status: 'pending' | 'completed' | 'cancelled'
  completedAt?: Date
  createdAt: Date
  updatedAt: Date
}

// Analytics
export interface AnalyticsEvent {
  id: string
  userId: string
  eventType: string
  jobId?: string
  applicationId?: string
  metadata: Record<string, any>
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

export interface ResponseTimeData {
  company: string
  avgDays: number
  count: number
}

export interface KeywordAnalysis {
  keyword: string
  frequency: number
  success_rate: number
}

export interface TrendData {
  date: string
  applications: number
  interviews: number
  offers: number
}

export interface PersonaROIData {
  personaId: string
  personaName: string
  applicationsSubmitted: number
  interviews: number
  offers: number
  roi: number
}

export interface SourcePerformance {
  source: JobSource
  applicationsSubmitted: number
  interviews: number
  offers: number
  responseRate: number
}

// Scoring Rules
export interface ScoringRule {
  id: string
  personaId: string
  type: 'keyword' | 'salary' | 'location' | 'custom'
  condition: string
  value: number | string
  operator: 'equals' | 'contains' | 'gte' | 'lte' | 'range'
  impact: number
  isActive: boolean
  createdAt: Date
}

// API Response Types
export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  pages: number
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
  source?: JobSource
  locationType?: LocationType
  minSalary?: number
  maxSalary?: number
  keywords?: string
  sortBy?: 'newest' | 'oldest' | 'salary_high' | 'salary_low'
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
  linkedinApiKey?: string
  indeedApiKey?: string
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
