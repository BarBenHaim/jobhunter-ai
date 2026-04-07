import prisma from '../db/prisma';
import logger from '../utils/logger';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors';
import { JobData, SearchFilters, PaginationParams, PaginatedResponse } from '../types';
import { generateJobDedupHash, calculateJobSimilarity } from '../utils/dedup';
import { scrapingQueue } from '../queue';

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

      if (filters.minScore !== undefined || filters.maxScore !== undefined) {
        where.scores = {
          some: {
            overallScore: {
              ...(filters.minScore !== undefined && { gte: filters.minScore }),
              ...(filters.maxScore !== undefined && { lte: filters.maxScore }),
            },
          },
        };
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

      const [jobs, total] = await Promise.all([
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

  async getJob(jobId: string) {
    try {
      logger.info(`Getting job: ${jobId}`);

      const job = await prisma.job.findUnique({
        where: { id: jobId },
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

      const job = await prisma.job.create({
        data: {
          externalId: data.externalId,
          source: data.source as any,
          sourceUrl: data.sourceUrl,
          title: data.title,
          company: data.company,
          companyUrl: data.companyUrl,
          location: data.location,
          locationType: data.locationType as any,
          description: data.description,
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
   * Count total active jobs in the database
   */
  async countJobs(): Promise<number> {
    try {
      const count = await prisma.job.count({
        where: { isActive: true },
      });
      return count;
    } catch (error) {
      logger.error('Error counting jobs:', error);
      throw error;
    }
  }

  /**
   * Get job counts grouped by source
   */
  async getSourceCounts(): Promise<Record<string, number>> {
    try {
      const sources = await prisma.job.groupBy({
        by: ['source'],
        _count: { source: true },
        where: { isActive: true },
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
