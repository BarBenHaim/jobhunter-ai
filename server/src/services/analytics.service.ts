import prisma from '../db/prisma';
import logger from '../utils/logger';
import { NotFoundError } from '../utils/errors';
import { calculatePercentage } from '../utils/helpers';

export class AnalyticsService {
  async getConversionFunnel(userId: string, dateRange?: { from: Date; to: Date }) {
    try {
      logger.info(`Getting conversion funnel for user: ${userId}`);

      const where: any = {
        job: {
          isActive: true,
        },
      };

      if (dateRange) {
        where.createdAt = {
          gte: dateRange.from,
          lte: dateRange.to,
        };
      }

      // Jobs found (total unscored jobs)
      const jobsFound = await prisma.job.count({
        where: {
          isActive: true,
          ...(dateRange && {
            scrapedAt: {
              gte: dateRange.from,
              lte: dateRange.to,
            },
          }),
        },
      });

      // Jobs scored
      const jobsScored = await prisma.jobScore.count();

      // Applications created
      const applicationCount = await prisma.application.count({
        where,
      });

      // Applications responded to
      const respondedCount = await prisma.application.count({
        where: {
          ...where,
          responseAt: { not: null },
        },
      });

      // Interviews
      const interviewCount = await prisma.application.count({
        where: {
          ...where,
          status: 'INTERVIEW',
        },
      });

      // Offers
      const offerCount = await prisma.application.count({
        where: {
          ...where,
          status: 'OFFER',
        },
      });

      const conversionRates = {
        scoredToApplied: calculatePercentage(applicationCount, jobsScored),
        appliedToResponded: calculatePercentage(respondedCount, applicationCount),
        respondedToInterview: calculatePercentage(interviewCount, respondedCount),
        interviewToOffer: calculatePercentage(offerCount, interviewCount),
      };

      logger.info(`Conversion funnel retrieved for user: ${userId}`);

      return {
        userId,
        funnel: {
          jobsFound,
          jobsScored,
          applicationsCreated: applicationCount,
          responsesReceived: respondedCount,
          interviewsScheduled: interviewCount,
          offersReceived: offerCount,
        },
        conversionRates,
        dateRange: dateRange || { from: null, to: null },
        retrievedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error getting conversion funnel:', error);
      throw error;
    }
  }

  async getScoreDistribution() {
    try {
      logger.info(`Getting score distribution`);

      const result = await prisma.$queryRaw<
        Array<{ score_bucket: number; count: bigint }>
      >`
        SELECT
          FLOOR(overall_score / 10) * 10 as score_bucket,
          COUNT(*) as count
        FROM job_scores
        GROUP BY FLOOR(overall_score / 10) * 10
        ORDER BY score_bucket ASC
      `;

      const distribution = result.map(row => ({
        scoreBucket: `${row.score_bucket}-${(row.score_bucket as number) + 9}`,
        count: Number(row.count),
      }));

      logger.info(`Score distribution retrieved`);
      return {
        distribution,
        retrievedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error getting score distribution:', error);
      throw error;
    }
  }

  async getResponseTimeAnalysis(dateRange?: { from: Date; to: Date }) {
    try {
      logger.info(`Getting response time analysis`);

      const where: any = {
        responseAt: { not: null },
        appliedAt: { not: null },
      };

      if (dateRange) {
        where.responseAt = {
          gte: dateRange.from,
          lte: dateRange.to,
        };
      }

      const applications = await prisma.application.findMany({
        where,
        include: {
          job: {
            select: { company: true },
          },
        },
      });

      // Calculate response times
      const responseTimes = applications.map(app => {
        const responseTime =
          (app.responseAt!.getTime() - (app.appliedAt!.getTime())) / (1000 * 60 * 60 * 24);
        return {
          company: app.job.company,
          days: Math.round(responseTime),
        };
      });

      // Group by company
      const byCompany: Record<string, number[]> = {};
      responseTimes.forEach(rt => {
        if (!byCompany[rt.company]) {
          byCompany[rt.company] = [];
        }
        byCompany[rt.company].push(rt.days);
      });

      // Calculate stats per company
      const stats = Object.entries(byCompany).map(([company, times]) => ({
        company,
        averageDays: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
        minDays: Math.min(...times),
        maxDays: Math.max(...times),
        responseCount: times.length,
      }));

      const overallAverage = Math.round(
        responseTimes.reduce((sum, rt) => sum + rt.days, 0) / responseTimes.length
      );

      logger.info(`Response time analysis retrieved`);
      return {
        overall: {
          averageDays: overallAverage,
          totalResponses: responseTimes.length,
        },
        byCompany: stats.sort((a, b) => a.averageDays - b.averageDays),
        retrievedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error getting response time analysis:', error);
      throw error;
    }
  }

  async getKeywordEffectiveness(personaId?: string) {
    try {
      logger.info(`Getting keyword effectiveness`);

      // Get all matched and responded applications
      const applications = await prisma.application.findMany({
        where: {
          ...(personaId && { personaId }),
          status: 'RESPONDED',
        },
        include: {
          job: {
            include: {
              scores: {
                select: {
                  matchedSkills: true,
                },
              },
            },
          },
        },
      });

      // Aggregate keyword frequency
      const keywordFrequency: Record<string, { matched: number; responded: number }> = {};

      for (const app of applications) {
        const scores = app.job.scores[0];
        if (scores) {
          for (const skill of scores.matchedSkills) {
            if (!keywordFrequency[skill]) {
              keywordFrequency[skill] = { matched: 0, responded: 0 };
            }
            keywordFrequency[skill].matched++;
            keywordFrequency[skill].responded++;
          }
        }
      }

      // Calculate effectiveness rates
      const effectiveness = Object.entries(keywordFrequency)
        .map(([keyword, data]) => ({
          keyword,
          effectiveness: Math.round((data.responded / data.matched) * 100),
          respondedCount: data.responded,
          totalMatches: data.matched,
        }))
        .sort((a, b) => b.effectiveness - a.effectiveness);

      logger.info(`Keyword effectiveness retrieved`);
      return {
        keywords: effectiveness.slice(0, 50), // Top 50 keywords
        totalKeywords: effectiveness.length,
        retrievedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error getting keyword effectiveness:', error);
      throw error;
    }
  }

  async getMarketTrends(dateRange?: { from: Date; to: Date }) {
    try {
      logger.info(`Getting market trends`);

      const where: any = {
        isActive: true,
      };

      if (dateRange) {
        where.scrapedAt = {
          gte: dateRange.from,
          lte: dateRange.to,
        };
      }

      // Most in-demand skills (from job requirements)
      const jobs = await prisma.job.findMany({
        where,
        select: { requirements: true },
        take: 1000,
      });

      const skillFrequency: Record<string, number> = {};
      const commonSkills = [
        'python',
        'javascript',
        'typescript',
        'react',
        'nodejs',
        'sql',
        'aws',
        'docker',
        'kubernetes',
        'java',
        'c++',
        'cloud',
        'machine learning',
        'data science',
        'devops',
        'agile',
      ];

      for (const job of jobs) {
        if (job.requirements) {
          const reqsLower = job.requirements.toLowerCase();
          for (const skill of commonSkills) {
            if (reqsLower.includes(skill)) {
              skillFrequency[skill] = (skillFrequency[skill] || 0) + 1;
            }
          }
        }
      }

      const demandedSkills = Object.entries(skillFrequency)
        .map(([skill, count]) => ({
          skill,
          demand: count,
          demandPercentage: calculatePercentage(count, jobs.length),
        }))
        .sort((a, b) => b.demand - a.demand);

      // Salary trends by location
      const salaryData = await prisma.$queryRaw<
        Array<{ location: string; avg_salary: number; job_count: bigint }>
      >`
        SELECT
          location,
          AVG(CAST(salary->>'min' AS FLOAT)) as avg_salary,
          COUNT(*) as job_count
        FROM jobs
        WHERE salary IS NOT NULL
        GROUP BY location
        ORDER BY avg_salary DESC
        LIMIT 20
      `;

      const salaryTrends = salaryData.map(row => ({
        location: row.location,
        averageSalary: Math.round(row.avg_salary || 0),
        jobCount: Number(row.job_count),
      }));

      logger.info(`Market trends retrieved`);
      return {
        mostDemandedSkills: demandedSkills.slice(0, 20),
        salaryTrendsByLocation: salaryTrends,
        dateRange: dateRange || { from: null, to: null },
        retrievedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error getting market trends:', error);
      throw error;
    }
  }

  async getPersonaROI(personaId: string) {
    try {
      logger.info(`Getting ROI for persona: ${personaId}`);

      const applications = await prisma.application.findMany({
        where: { personaId },
        select: {
          id: true,
          status: true,
          appliedAt: true,
        },
      });

      const totalApplications = applications.length;
      const respondedApplications = applications.filter(
        a => a.status === 'RESPONDED' || a.status === 'INTERVIEW' || a.status === 'OFFER'
      ).length;
      const interviewApplications = applications.filter(
        a => a.status === 'INTERVIEW' || a.status === 'OFFER'
      ).length;
      const offerApplications = applications.filter(a => a.status === 'OFFER').length;

      const responseRate = totalApplications > 0 ?
        calculatePercentage(respondedApplications, totalApplications) : 0;
      const interviewRate = totalApplications > 0 ?
        calculatePercentage(interviewApplications, totalApplications) : 0;
      const offerRate = totalApplications > 0 ?
        calculatePercentage(offerApplications, totalApplications) : 0;

      // Applications needed for 1 interview
      const applicationsPerInterview = interviewApplications > 0 ?
        Math.round(totalApplications / interviewApplications) : 0;

      // Applications needed for 1 offer
      const applicationsPerOffer = offerApplications > 0 ?
        Math.round(totalApplications / offerApplications) : 0;

      logger.info(`ROI calculated for persona: ${personaId}`);

      return {
        personaId,
        metrics: {
          totalApplications,
          respondedApplications,
          interviewApplications,
          offerApplications,
        },
        rates: {
          responseRate,
          interviewRate,
          offerRate,
        },
        efficiency: {
          applicationsPerInterview,
          applicationsPerOffer,
        },
        calculatedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error getting persona ROI:', error);
      throw error;
    }
  }

  async getSourcePerformance(userId: string, dateRange?: { from: Date; to: Date }) {
    try {
      logger.info(`Getting source performance for user: ${userId}`);

      const where: any = {
        persona: { userId },
      };

      if (dateRange) {
        where.appliedAt = {
          gte: dateRange.from,
          lte: dateRange.to,
        };
      }

      const applications = await prisma.application.findMany({
        where,
        include: {
          job: {
            select: { source: true },
          },
        },
      });

      // Group by source
      const sourceStats: Record<string, any> = {};

      for (const app of applications) {
        const source = app.job.source;
        if (!sourceStats[source]) {
          sourceStats[source] = {
            totalApplications: 0,
            responses: 0,
            interviews: 0,
            offers: 0,
          };
        }

        sourceStats[source].totalApplications++;

        if (app.responseAt) {
          sourceStats[source].responses++;
        }

        if (app.status === 'INTERVIEW') {
          sourceStats[source].interviews++;
        }

        if (app.status === 'OFFER') {
          sourceStats[source].offers++;
        }
      }

      // Calculate rates
      const performance = Object.entries(sourceStats).map(([source, stats]) => ({
        source,
        totalApplications: stats.totalApplications,
        responseCount: stats.responses,
        responseRate: calculatePercentage(stats.responses, stats.totalApplications),
        interviewCount: stats.interviews,
        interviewRate: calculatePercentage(stats.interviews, stats.totalApplications),
        offerCount: stats.offers,
        offerRate: calculatePercentage(stats.offers, stats.totalApplications),
      }));

      logger.info(`Source performance retrieved for user: ${userId}`);

      return {
        userId,
        performance: performance.sort((a, b) => b.interviewRate - a.interviewRate),
        totalApplications: applications.length,
        dateRange: dateRange || { from: null, to: null },
        retrievedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error getting source performance:', error);
      throw error;
    }
  }

  async trackEvent(userId: string, eventType: string, metadata?: Record<string, any>) {
    try {
      logger.info(`Tracking analytics event for user: ${userId}`, {
        eventType,
        metadata,
      });

      const event = await prisma.analyticsEvent.create({
        data: {
          userId,
          eventType,
          metadata: metadata || {},
        },
      });

      return event;
    } catch (error) {
      logger.error('Error tracking event:', error);
      throw error;
    }
  }

  async getDashboardStats(userId: string) {
    try {
      logger.info(`Getting dashboard stats for user: ${userId}`);

      const [funnel, sourcePerf, personas] = await Promise.all([
        this.getConversionFunnel(userId),
        this.getSourcePerformance(userId),
        prisma.persona.findMany({
          where: { userId },
          include: {
            applications: {
              select: { status: true, responseAt: true },
            },
          },
        }),
      ]);

      const personaStats = personas.map(p => {
        const apps = p.applications;
        return {
          id: p.id,
          name: p.name,
          totalApplications: apps.length,
          responses: apps.filter(a => a.responseAt).length,
          interviews: 0, // Would need to check status
        };
      });

      logger.info(`Dashboard stats retrieved for user: ${userId}`);

      return {
        userId,
        funnel: funnel.funnel,
        conversionRates: funnel.conversionRates,
        topSources: sourcePerf.performance.slice(0, 5),
        personas: personaStats,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error getting dashboard stats:', error);
      throw error;
    }
  }
}

export const analyticsService = new AnalyticsService();
