import prisma from '../db/prisma';
import logger from '../utils/logger';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors';
import { JobData, SearchFilters, PaginationParams, PaginatedResponse } from '../types';
import { generateJobDedupHash, calculateJobSimilarity } from '../utils/dedup';
import { scrapingQueue } from '../queue';

/**
 * Resolve every personaId that belongs to a given user. Used by the job
 * list / detail / stats queries to express ownership through JobScore ->
 * personaId WITHOUT requiring a Prisma relation on JobScore (which would
 * need a schema change + `prisma generate`). Cached per-call.
 */
const getUserPersonaIds = async (userId: string): Promise<string[]> => {
  const personas = await prisma.persona.findMany({
    where: { userId },
    select: { id: true },
  });
  return personas.map((p) => p.id);
};


export class JobService {
  async listJobs(
    userId: string,
    filters: SearchFilters = {},
    pagination: PaginationParams = {}
  ): Promise<PaginatedResponse<any>> {
    try {
      const limit = Math.min(pagination.limit || 20, 100);
      const offset = pagination.offset || 0;
      const sortBy = pagination.sortBy || 'createdAt';
      const sortOrder = pagination.sortOrder || 'desc';
      const isSmartScoreSort = sortBy === 'smartScore';

      logger.info(`Listing jobs for user: ${userId}`, { filters, pagination });

      const where: any = { isActive: true };

      if (filters.company) {
        where.company = { contains: filters.company, mode: 'insensitive' };
      }

      if (filters.location) {
        where.location = { contains: filters.location, mode: 'insensitive' };
      }

      if (filters.title) {
        where.title = { contains: filters.title, mode: 'insensitive' };
      }

      if (filters.source) {
        where.source = filters.source;
      }

      if (filters.locationType) {
        where.locationType = filters.locationType;
      }

      if (filters.experienceLevel) {
        // Smart experience level matching — scraped data uses freeform strings like
        // "1-2 שנים", "Senior", "Entry Level", "Mid-Senior level", etc.
        // Map the filter value to multiple possible patterns to search in the DB.
        const expPatterns: Record<string, string[]> = {
          ENTRY: ['entry', 'junior', 'intern', 'graduate', 'סטודנט', 'ג׳וניור', 'התחלתי', '0-1', '0-2'],
          JUNIOR: ['junior', 'ג׳וניור', 'entry', '0-2', '1-2', '1-3'],
          MID: ['mid', 'middle', '2-4', '2-5', '3-5', '3-4', 'regular', 'בינוני'],
          SENIOR: ['senior', 'סניור', 'בכיר', '5+', '5-7', '5-8', '4-6', '6+', '7+', 'experienced'],
          LEAD: ['lead', 'principal', 'staff', 'architect', 'מוביל', 'ראש', '8+', '10+', 'director', 'head'],
        };
        const patterns = expPatterns[filters.experienceLevel.toUpperCase()] || [filters.experienceLevel];
        // Also search in title/description for key level keywords (longer patterns only to avoid false positives)
        const descPatterns: Record<string, string[]> = {
          ENTRY: ['entry level', 'entry-level', 'graduate', 'intern'],
          JUNIOR: ['junior'],
          MID: ['mid level', 'mid-level', 'midlevel'],
          SENIOR: ['senior', 'סניור', 'בכיר'],
          LEAD: ['lead', 'principal', 'staff engineer', 'architect', 'head of'],
        };
        const titleDescSearch = descPatterns[filters.experienceLevel.toUpperCase()] || [];

        // Use AND to combine with other filters — experience must match at least one pattern
        if (!where.AND) where.AND = [];
        where.AND.push({
          OR: [
            ...patterns.map(p => ({
              experienceLevel: { contains: p, mode: 'insensitive' as const },
            })),
            ...titleDescSearch.map(p => ({
              title: { contains: p, mode: 'insensitive' as const },
            })),
            ...titleDescSearch.map(p => ({
              description: { contains: p, mode: 'insensitive' as const },
            })),
          ],
        });
      }

      // User-level isolation: a job must have a JobScore for one of the
      // requesting user's personas. This is what makes jobs per-user — a
      // brand-new account starts with zero jobs, and nothing that user A
      // scraped leaks to user B. When a specific personaId is supplied we
      // narrow the filter further to that single persona.
      const hasUser = Boolean(userId && userId !== 'public');
      const personaScopePersonaId = filters.personaId || undefined;

      // Pre-resolve the list of personaIds this user owns. Null means
      // "anonymous or no scoping", empty array means "user has no personas
      // yet → zero results".
      let userPersonaIds: string[] | null = null;
      if (hasUser) {
        userPersonaIds = await getUserPersonaIds(userId);
      }

      // Build the persona-scoped `scores.some` filter. If the caller asked
      // for a specific persona, make sure it belongs to the user.
      let personaScopeFilter: any = null;
      if (hasUser) {
        if (personaScopePersonaId) {
          if (!userPersonaIds!.includes(personaScopePersonaId)) {
            // Requested persona doesn't belong to this user → no results.
            return { data: [], total: 0, limit, offset, hasMore: false };
          }
          personaScopeFilter = { personaId: personaScopePersonaId };
        } else if (userPersonaIds!.length > 0) {
          personaScopeFilter = { personaId: { in: userPersonaIds! } };
        } else {
          // Authenticated user with zero personas → own no jobs yet.
          return { data: [], total: 0, limit, offset, hasMore: false };
        }
      } else if (personaScopePersonaId) {
        personaScopeFilter = { personaId: personaScopePersonaId };
      }

      if (filters.minScore !== undefined || filters.maxScore !== undefined) {
        where.scores = {
          some: {
            ...(personaScopeFilter || {}),
            overallScore: {
              ...(filters.minScore !== undefined && { gte: filters.minScore }),
              ...(filters.maxScore !== undefined && { lte: filters.maxScore }),
            },
          },
        };
      } else if (personaScopeFilter) {
        where.scores = { some: personaScopeFilter };
      }

      if (filters.status) {
        where.applications = {
          some: {
            status: filters.status,
          },
        };
      }

      if (filters.dateFrom || filters.dateTo) {
        where.postedAt = {
          ...(filters.dateFrom && { gte: filters.dateFrom }),
          ...(filters.dateTo && { lte: filters.dateTo }),
        };
      }

      // Filter by search session ID (stored in rawData.searchSessionId)
      if (filters.searchSessionId) {
        where.rawData = {
          ...(where.rawData || {}),
          path: ['searchSessionId'],
          equals: filters.searchSessionId,
        };
      }

      // Note: minSmartScore filtering is handled post-query (JSON field)
      const minSmartScore = filters.minSmartScore as number | undefined;

      // For smartScore sort we need raw SQL because Prisma can't sort by JSON fields easily
      let jobs: any[];
      let total: number;

      if (isSmartScoreSort || minSmartScore) {
        // Fetch all matching jobs to sort by JSON smartScore and/or filter by minSmartScore
        let allJobs = await prisma.job.findMany({
          where,
          include: {
            scores: {
              select: {
                personaId: true,
                overallScore: true,
                recommendation: true,
              },
            },
            applications: {
              select: { id: true, status: true },
            },
          },
        });

        // Filter by minimum smart score if requested
        if (minSmartScore) {
          allJobs = allJobs.filter((j: any) => {
            const score = (j.rawData as any)?.smartScore ?? (j.scores?.[0]?.overallScore ?? 0);
            return score >= minSmartScore;
          });
        }

        // Sort by smartScore from rawData (if smartScore sort requested)
        if (isSmartScoreSort) {
          allJobs.sort((a: any, b: any) => {
            const aScore = (a.rawData as any)?.smartScore ?? (a.scores?.[0]?.overallScore ?? 0);
            const bScore = (b.rawData as any)?.smartScore ?? (b.scores?.[0]?.overallScore ?? 0);
            return sortOrder === 'desc' ? bScore - aScore : aScore - bScore;
          });
        }

        total = allJobs.length;
        // Paginate
        jobs = allJobs.slice(offset, offset + limit);
      } else {
        [jobs, total] = await Promise.all([
          prisma.job.findMany({
            where,
            include: {
              scores: {
                select: {
                  personaId: true,
                  overallScore: true,
                  recommendation: true,
                },
              },
              applications: {
                select: { id: true, status: true },
              },
            },
            take: limit,
            skip: offset,
            orderBy: { [sortBy]: sortOrder },
          }),
          prisma.job.count({ where }),
        ]);
      }

      logger.info(`Found ${jobs.length} jobs for user: ${userId}`);

      return {
        data: jobs,
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      };
    } catch (error) {
      logger.error('Error listing jobs:', error);
      throw error;
    }
  }

  async getJob(jobId: string, userId?: string | null) {
    try {
      logger.info(`Getting job: ${jobId}`, { userId });

      // When a userId is supplied, require that the job is owned by the user
      // (has a JobScore for one of their personas). This keeps the detail
      // view consistent with the list view.
      const baseWhere: any = { id: jobId };
      if (userId) {
        const personaIds = await getUserPersonaIds(userId);
        if (personaIds.length === 0) {
          throw new NotFoundError(`Job with id ${jobId} not found`);
        }
        baseWhere.scores = { some: { personaId: { in: personaIds } } };
      }

      const job = await prisma.job.findFirst({
        where: baseWhere,
        include: {
          scores: true,
          applications: {
            include: {
              followUps: true,
            },
          },
        },
      });

      if (!job) {
        throw new NotFoundError(`Job with id ${jobId} not found`);
      }

      return job;
    } catch (error) {
      logger.error('Error getting job:', error);
      throw error;
    }
  }

  async createJob(data: JobData) {
    try {
      logger.info(`Creating job`, { company: data.company, title: data.title });

      if (!data.title || !data.company || !data.location) {
        throw new ValidationError('Job title, company, and location are required');
      }

      // Generate dedup hash
      const dedupHash = generateJobDedupHash({
        title: data.title,
        company: data.company,
        location: data.location,
        source: data.source,
      });

      // Check if job already exists
      const existingJob = await prisma.job.findUnique({
        where: { dedupHash },
      });

      if (existingJob) {
        logger.info(`Job already exists: ${existingJob.id}`);
        return existingJob;
      }

      // Normalize enum values to match Prisma schema
      const validSources = ['LINKEDIN', 'INDEED', 'ALLJOBS', 'DRUSHIM', 'FACEBOOK_GROUP', 'WELLFOUND', 'COMPANY_CAREER_PAGE', 'GOOGLE_JOBS', 'GLASSDOOR', 'OTHER'];
      const normalizedSource = validSources.includes(data.source?.toUpperCase())
        ? data.source.toUpperCase()
        : 'OTHER';

      const locationTypeMap: Record<string, string> = {
        remote: 'REMOTE', hybrid: 'HYBRID', onsite: 'ONSITE', 'on-site': 'ONSITE',
        fulltime: 'ONSITE', 'full-time': 'ONSITE',
        REMOTE: 'REMOTE', HYBRID: 'HYBRID', ONSITE: 'ONSITE',
      };
      const normalizedLocationType = locationTypeMap[data.locationType || 'hybrid'] || 'HYBRID';

      const job = await prisma.job.create({
        data: {
          externalId: data.externalId,
          source: normalizedSource as any,
          sourceUrl: data.sourceUrl || '',
          title: data.title,
          company: data.company,
          companyUrl: data.companyUrl,
          location: data.location,
          locationType: normalizedLocationType as any,
          description: data.description || '',
          requirements: data.requirements,
          salary: data.salary || {},
          experienceLevel: data.experienceLevel,
          postedAt: data.postedAt,
          expiresAt: data.expiresAt,
          isActive: data.isActive !== false,
          rawData: data.rawData || {},
          dedupHash,
        },
      });

      logger.info(`Job created: ${job.id}`);
      return job;
    } catch (error) {
      logger.error('Error creating job:', error);
      throw error;
    }
  }

  /**
   * Update job rawData with smart score metadata
   */
  async updateJobMetadata(jobId: string, metadata: Record<string, any>) {
    try {
      const job = await prisma.job.findUnique({ where: { id: jobId } });
      if (!job) return;

      const existingRawData = typeof job.rawData === 'object' && job.rawData !== null
        ? job.rawData as Record<string, any>
        : {};

      await prisma.job.update({
        where: { id: jobId },
        data: {
          rawData: {
            ...existingRawData,
            ...metadata,
          },
        },
      });
    } catch (error) {
      logger.error('Error updating job metadata:', error);
      // Non-critical — don't throw
    }
  }

  async deduplicateJob(jobData: JobData): Promise<boolean> {
    try {
      logger.info(`Checking job duplication`, { company: jobData.company });

      if (!jobData.title || !jobData.company || !jobData.location) {
        return false;
      }

      // Check exact hash match
      const dedupHash = generateJobDedupHash({
        title: jobData.title,
        company: jobData.company,
        location: jobData.location,
        source: jobData.source,
      });

      const exactMatch = await prisma.job.findUnique({
        where: { dedupHash },
      });

      if (exactMatch) {
        logger.info(`Exact job match found: ${exactMatch.id}`);
        return true;
      }

      // Check fuzzy match with similar jobs
      const similarJobs = await prisma.job.findMany({
        where: {
          company: jobData.company,
          title: jobData.title,
          isActive: true,
        },
        select: { id: true, location: true, title: true, company: true },
      });

      for (const job of similarJobs) {
        const similarity = calculateJobSimilarity(
          { title: jobData.title, company: jobData.company, location: jobData.location },
          { title: job.title, company: job.company, location: job.location }
        );

        if (similarity > 0.8) {
          logger.info(`Fuzzy match found for job: ${job.id}, similarity: ${similarity}`);
          return true;
        }
      }

      return false;
    } catch (error) {
      logger.error('Error checking job duplication:', error);
      throw error;
    }
  }

  /**
   * Count total active jobs in the database. If `userId` is supplied, only
   * jobs owned by that user are counted (via persona → JobScore).
   */
  async countJobs(userId?: string | null): Promise<number> {
    try {
      const where: any = { isActive: true };
      if (userId) {
        const personaIds = await getUserPersonaIds(userId);
        if (personaIds.length === 0) return 0;
        where.scores = { some: { personaId: { in: personaIds } } };
      }
      return prisma.job.count({ where });
    } catch (error) {
      logger.error('Error counting jobs:', error);
      throw error;
    }
  }

  /**
   * Get job counts grouped by source. Scoped per user when `userId` is
   * supplied so each user only sees their own totals.
   */
  async getSourceCounts(userId?: string | null): Promise<Record<string, number>> {
    try {
      const where: any = { isActive: true };
      if (userId) {
        const personaIds = await getUserPersonaIds(userId);
        if (personaIds.length === 0) return {};
        where.scores = { some: { personaId: { in: personaIds } } };
      }

      const sources = await prisma.job.groupBy({
        by: ['source'],
        _count: { source: true },
        where,
      });

      const counts: Record<string, number> = {};
      for (const s of sources) {
        counts[s.source] = s._count.source;
      }
      return counts;
    } catch (error) {
      logger.error('Error getting source counts:', error);
      throw error;
    }
  }

  async triggerScrape(source: string) {
    try {
      logger.info(`Triggering scrape for source: ${source}`);

      const validSources = [
        'LINKEDIN',
        'INDEED',
        'ALLJOBS',
        'DRUSHIM',
        'FACEBOOK_GROUP',
        'WELLFOUND',
        'COMPANY_CAREER_PAGE',
        'GOOGLE_JOBS',
        'GLASSDOOR',
      ];

      if (!validSources.includes(source.toUpperCase())) {
        throw new ValidationError(`Invalid job source: ${source}`);
      }

      const job = await scrapingQueue.add(
        {
          source: source.toUpperCase(),
          triggeredAt: new Date().toISOString(),
        },
        {
          jobId: `scrape-${source}-${Date.now()}`,
          priority: 1,
        }
      );

      logger.info(`Scrape job queued: ${job.id} for source: ${source}`);
      return {
        queueId: job.id,
        source,
        status: 'queued',
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error triggering scrape:', error);
      throw error;
    }
  }

  async getScrapingStats() {
    try {
      logger.info(`Getting scraping stats`);

      const sources = [
        'LINKEDIN',
        'INDEED',
        'ALLJOBS',
        'DRUSHIM',
        'FACEBOOK_GROUP',
        'WELLFOUND',
        'COMPANY_CAREER_PAGE',
        'GOOGLE_JOBS',
        'GLASSDOOR',
      ];

      const stats: any = {};

      for (const source of sources) {
        const jobCount = await prisma.job.count({
          where: { source: source as any },
        });

        const recentCount = await prisma.job.count({
          where: {
            source: source as any,
            scrapedAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
            },
          },
        });

        stats[source] = {
          totalJobs: jobCount,
          jobsIn24h: recentCount,
          lastUpdated: new Date().toISOString(),
        };
      }

      logger.info(`Scraping stats retrieved`);
      return stats;
    } catch (error) {
      logger.error('Error getting scraping stats:', error);
      throw error;
    }
  }

  async cleanExpired() {
    try {
      logger.info(`Cleaning expired job listings`);

      const now = new Date();

      const result = await prisma.job.updateMany({
        where: {
          expiresAt: {
            lt: now,
          },
          isActive: true,
        },
        data: {
          isActive: false,
        },
      });

      logger.info(`Expired jobs cleaned: ${result.count} jobs deactivated`);
      return {
        deactivatedCount: result.count,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error cleaning expired jobs:', error);
      throw error;
    }
  }

  async addCompanySource(url: string, companyName: string) {
    try {
      logger.info(`Adding company source`, { url, companyName });

      if (!url || !companyName) {
        throw new ValidationError('URL and company name are required');
      }

      // Queue the company career page for scraping
      const job = await scrapingQueue.add(
        {
          source: 'COMPANY_CAREER_PAGE',
          url,
          companyName,
          triggeredAt: new Date().toISOString(),
        },
        {
          jobId: `company-${companyName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
          priority: 2,
        }
      );

      logger.info(`Company source queued: ${job.id}`);
      return {
        queueId: job.id,
        source: 'COMPANY_CAREER_PAGE',
        url,
        companyName,
        status: 'queued',
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error adding company source:', error);
      throw error;
    }
  }
}

export const jobService = new JobService();
