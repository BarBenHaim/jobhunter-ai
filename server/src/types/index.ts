export interface PaginationParams {
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    statusCode: number;
    message: string;
  };
}

export interface UserProfileData {
  fullName: string;
  email: string;
  phone?: string;
  location?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  rawKnowledge?: Record<string, any>;
  structuredProfile?: Record<string, any>;
  preferences?: Record<string, any>;
}

export interface PersonaData {
  name: string;
  slug: string;
  title: string;
  summary: string;
  targetKeywords: string[];
  excludeKeywords: string[];
  skillPriority?: Record<string, any>;
  experienceRules?: Record<string, any>;
  cvTemplateId?: string;
  isActive?: boolean;
  searchSchedule?: Record<string, any>;
}

export interface JobData {
  externalId?: string;
  source: string;
  sourceUrl: string;
  title: string;
  company: string;
  companyUrl?: string;
  location: string;
  locationType: string;
  description: string;
  requirements?: string;
  salary?: Record<string, any>;
  experienceLevel?: string;
  postedAt?: Date;
  expiresAt?: Date;
  isActive?: boolean;
  rawData?: Record<string, any>;
}

export interface JobScoreData {
  jobId: string;
  personaId: string;
  overallScore: number;
  skillMatch: number;
  experienceMatch: number;
  cultureFit: number;
  salaryMatch: number;
  acceptanceProb: number;
  recommendation: string;
  reasoning?: string;
  matchedSkills: string[];
  missingSkills: string[];
  redFlags: string[];
}

export interface ApplicationData {
  jobId: string;
  personaId: string;
  status?: string;
  cvFilePath?: string;
  coverLetterPath?: string;
  cvContent?: Record<string, any>;
  appliedAt?: Date;
  appliedVia?: string;
  responseAt?: Date;
  responseType?: string;
  interviewDates?: Date[];
  notes?: string;
  score?: number;
}

export interface FollowUpData {
  applicationId: string;
  type: string;
  scheduledAt: Date;
  completedAt?: Date;
  message?: string;
  channel?: string;
  status?: string;
}

export interface ScoringRuleData {
  personaId: string;
  ruleType: string;
  field: string;
  value: string;
  weight?: number;
  learnedFrom?: string;
}

export interface ScoringContext {
  job: JobData;
  persona: PersonaData;
  userProfile?: UserProfileData;
}

export interface SkillMatch {
  skill: string;
  required: boolean;
  proficiency: string;
  match: number;
}

export interface CVGenerationRequest {
  personaId: string;
  jobId: string;
  templateId?: string;
  format?: 'pdf' | 'docx';
}

export interface InterviewPrepData {
  jobId: string;
  personaId: string;
  company: string;
  jobTitle: string;
  keyResponsibilities: string[];
  requiredSkills: string[];
  companyInfo?: Record<string, any>;
}

export interface AnalyticsEventData {
  userId: string;
  eventType: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, any>;
}

export interface EmailData {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    path: string;
  }>;
}

export interface ScraperResult {
  source: string;
  jobsFound: number;
  jobsCreated: number;
  jobsUpdated: number;
  errors: string[];
  duration: number;
  timestamp: Date;
}

export interface SearchFilters {
  company?: string;
  location?: string;
  locationType?: string;
  title?: string;
  source?: string;
  minScore?: number;
  maxScore?: number;
  status?: string;
  dateFrom?: Date;
  dateTo?: Date;
  experienceLevel?: string;
  searchSessionId?: string;
  minSmartScore?: number;
  /** When present, only return jobs that have a JobScore for this persona. */
  personaId?: string;
}
