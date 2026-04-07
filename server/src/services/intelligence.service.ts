import prisma from '../db/prisma';
import logger from '../utils/logger';
import { aiClient } from '../ai/client';
import { AppStatus } from '@prisma/client';

/**
 * Application Intelligence Service
 *
 * Tracks application outcomes, analyzes patterns between job descriptions
 * and response rates, and provides a feedback loop to improve future
 * scoring and CV tailoring.
 */

export interface ApplicationInsight {
  totalApplications: number;
  responseRate: number;
  interviewRate: number;
  offerRate: number;
  avgDaysToResponse: number;
  bestPerformingCVVariant: string | null;
  topRespondingCompanies: { company: string; count: number; rate: number }[];
  topRespondingRoles: { role: string; count: number; rate: number }[];
  weakSpots: string[];
  strengths: string[];
  recommendations: string[];
}

export interface ResponsePattern {
  jobId: string;
  jobTitle: string;
  company: string;
  status: string;
  appliedAt: Date | null;
  responseAt: Date | null;
  daysToResponse: number | null;
  responseType: string | null;
  cvVariant: string | null;
  jobDescription: string;
  matchedSkills: string[];
  missingSkills: string[];
  score: number | null;
}

export interface LearnedRule {
  ruleType: string;
  field: string;
  value: string;
  weight: number;
  learnedFrom: string;
}

export class IntelligenceService {
  /**
   * Record a response/status change for an application
   */
  async recordResponse(
    applicationId: string,
    status: AppStatus,
    responseType?: string,
    notes?: string
  ) {
    try {
      logger.info(`Recording response for application ${applicationId}: ${status}`);

      const updateData: any = {
        status,
        updatedAt: new Date(),
      };

      if (status === 'RESPONDED' || status === 'INTERVIEW' || status === 'OFFER') {
        updateData.responseAt = new Date();
      }

      if (responseType) {
        updateData.responseType = responseType;
      }

      if (notes) {
        updateData.notes = notes;
      }

      const application = await prisma.application.update({
        where: { id: applicationId },
        data: updateData,
        include: {
          job: true,
          persona: { include: { user: true } },
        },
      });

      // Log analytics event
      await prisma.analyticsEvent.create({
        data: {
          userId: application.persona.userId,
          eventType: 'APPLICATION_RESPONSE',
          entityType: 'application',
          entityId: applicationId,
          metadata: {
            status,
            responseType,
            jobTitle: application.job.title,
            company: application.job.company,
            daysToResponse: application.appliedAt
              ? Math.floor((Date.now() - application.appliedAt.getTime()) / (1000 * 60 * 60 * 24))
              : null,
          },
        },
      });

      // Trigger learning from this outcome
      await this.learnFromOutcome(application);

      return application;
    } catch (error) {
      logger.error('Error recording response:', error);
      throw error;
    }
  }

  /**
   * Get comprehensive application intelligence/analytics
   */
  async getIntelligence(userId: string): Promise<ApplicationInsight> {
    try {
      logger.info(`Generating intelligence report for user ${userId}`);

      // Get all applications for this user
      const applications = await prisma.application.findMany({
        where: {
          persona: { userId },
        },
        include: {
          job: {
            include: {
              scores: true,
            },
          },
          persona: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      const totalApplications = applications.length;
      const appliedApps = applications.filter(a => a.appliedAt != null);
      const respondedApps = applications.filter(a =>
        ['RESPONDED', 'INTERVIEW', 'OFFER'].includes(a.status)
      );
      const interviewApps = applications.filter(a =>
        ['INTERVIEW', 'OFFER'].includes(a.status)
      );
      const offerApps = applications.filter(a => a.status === 'OFFER');

      const responseRate = appliedApps.length > 0
        ? (respondedApps.length / appliedApps.length) * 100
        : 0;
      const interviewRate = appliedApps.length > 0
        ? (interviewApps.length / appliedApps.length) * 100
        : 0;
      const offerRate = appliedApps.length > 0
        ? (offerApps.length / appliedApps.length) * 100
        : 0;

      // Average days to response
      const responseTimes = respondedApps
        .filter(a => a.appliedAt && a.responseAt)
        .map(a => Math.floor((a.responseAt!.getTime() - a.appliedAt!.getTime()) / (1000 * 60 * 60 * 24)));
      const avgDaysToResponse = responseTimes.length > 0
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
        : 0;

      // Best performing CV variant (from cvContent metadata)
      const variantStats: Record<string, { applied: number; responded: number }> = {};
      for (const app of applications) {
        const variant = (app.cvContent as any)?.variant || 'general';
        if (!variantStats[variant]) {
          variantStats[variant] = { applied: 0, responded: 0 };
        }
        if (app.appliedAt) {
          variantStats[variant].applied++;
          if (['RESPONDED', 'INTERVIEW', 'OFFER'].includes(app.status)) {
            variantStats[variant].responded++;
          }
        }
      }

      let bestVariant: string | null = null;
      let bestRate = 0;
      for (const [variant, stats] of Object.entries(variantStats)) {
        if (stats.applied > 0) {
          const rate = stats.responded / stats.applied;
          if (rate > bestRate) {
            bestRate = rate;
            bestVariant = variant;
          }
        }
      }

      // Top responding companies
      const companyStats: Record<string, { applied: number; responded: number }> = {};
      for (const app of appliedApps) {
        const company = app.job.company;
        if (!companyStats[company]) {
          companyStats[company] = { applied: 0, responded: 0 };
        }
        companyStats[company].applied++;
        if (['RESPONDED', 'INTERVIEW', 'OFFER'].includes(app.status)) {
          companyStats[company].responded++;
        }
      }

      const topRespondingCompanies = Object.entries(companyStats)
        .map(([company, stats]) => ({
          company,
          count: stats.responded,
          rate: stats.applied > 0 ? (stats.responded / stats.applied) * 100 : 0,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      // Top responding roles
      const roleStats: Record<string, { applied: number; responded: number }> = {};
      for (const app of appliedApps) {
        const role = app.job.title;
        if (!roleStats[role]) {
          roleStats[role] = { applied: 0, responded: 0 };
        }
        roleStats[role].applied++;
        if (['RESPONDED', 'INTERVIEW', 'OFFER'].includes(app.status)) {
          roleStats[role].responded++;
        }
      }

      const topRespondingRoles = Object.entries(roleStats)
        .map(([role, stats]) => ({
          role,
          count: stats.responded,
          rate: stats.applied > 0 ? (stats.responded / stats.applied) * 100 : 0,
        }))
        .sort((a, b) => b.rate - a.rate)
        .slice(0, 10);

      // Analyze weak spots and strengths via AI (if enough data)
      let weakSpots: string[] = [];
      let strengths: string[] = [];
      let recommendations: string[] = [];

      if (appliedApps.length >= 3) {
        try {
          const aiAnalysis = await this.getAIAnalysis(applications, {
            responseRate,
            interviewRate,
            offerRate,
            avgDaysToResponse,
            topRespondingCompanies,
            topRespondingRoles,
            variantStats,
          });
          weakSpots = aiAnalysis.weakSpots || [];
          strengths = aiAnalysis.strengths || [];
          recommendations = aiAnalysis.recommendations || [];
        } catch (err) {
          logger.warn('AI analysis failed, using basic analysis', { error: err });
          // Fallback basic analysis
          if (responseRate < 10) weakSpots.push('Low response rate — consider tailoring CVs more aggressively');
          if (responseRate > 20) strengths.push('Good response rate — your applications are getting noticed');
          if (avgDaysToResponse > 14) weakSpots.push('Long wait times — consider following up after 7 days');
          recommendations.push('Keep tracking outcomes to improve recommendations over time');
        }
      } else {
        recommendations.push('Apply to more jobs to build enough data for intelligent analysis');
        recommendations.push('Mark application statuses as they change (responded, interview, offer, rejected) to enable learning');
      }

      return {
        totalApplications,
        responseRate: Math.round(responseRate * 10) / 10,
        interviewRate: Math.round(interviewRate * 10) / 10,
        offerRate: Math.round(offerRate * 10) / 10,
        avgDaysToResponse: Math.round(avgDaysToResponse * 10) / 10,
        bestPerformingCVVariant: bestVariant,
        topRespondingCompanies,
        topRespondingRoles,
        weakSpots,
        strengths,
        recommendations,
      };
    } catch (error) {
      logger.error('Error generating intelligence:', error);
      throw error;
    }
  }

  /**
   * Get response patterns — detailed view of each application outcome
   */
  async getResponsePatterns(userId: string): Promise<ResponsePattern[]> {
    try {
      const applications = await prisma.application.findMany({
        where: {
          persona: { userId },
          appliedAt: { not: null },
        },
        include: {
          job: {
            include: {
              scores: true,
            },
          },
        },
        orderBy: { appliedAt: 'desc' },
      });

      return applications.map(app => {
        const score = app.job.scores?.[0];
        return {
          jobId: app.jobId,
          jobTitle: app.job.title,
          company: app.job.company,
          status: app.status,
          appliedAt: app.appliedAt,
          responseAt: app.responseAt,
          daysToResponse: app.appliedAt && app.responseAt
            ? Math.floor((app.responseAt.getTime() - app.appliedAt.getTime()) / (1000 * 60 * 60 * 24))
            : null,
          responseType: app.responseType,
          cvVariant: (app.cvContent as any)?.variant || null,
          jobDescription: app.job.description.substring(0, 200),
          matchedSkills: score?.matchedSkills || [],
          missingSkills: score?.missingSkills || [],
          score: score?.overallScore || app.score,
        };
      });
    } catch (error) {
      logger.error('Error getting response patterns:', error);
      throw error;
    }
  }

  /**
   * Get timeline of application events
   */
  async getTimeline(userId: string, limit: number = 50) {
    try {
      const events = await prisma.analyticsEvent.findMany({
        where: {
          userId,
          eventType: {
            in: ['APPLICATION_RESPONSE', 'APPLICATION_SUBMITTED', 'CV_GENERATED', 'JOB_SCORED'],
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      return events.map(e => ({
        id: e.id,
        type: e.eventType,
        entityType: e.entityType,
        entityId: e.entityId,
        metadata: e.metadata,
        timestamp: e.createdAt,
      }));
    } catch (error) {
      logger.error('Error getting timeline:', error);
      throw error;
    }
  }

  /**
   * Learn from application outcomes to improve scoring rules
   */
  private async learnFromOutcome(application: any) {
    try {
      const job = application.job;
      const persona = application.persona;

      if (!job || !persona) return;

      // Get existing score for this job
      const jobScore = await prisma.jobScore.findFirst({
        where: {
          jobId: job.id,
          personaId: persona.id,
        },
      });

      // Determine if the outcome was positive
      const isPositive = ['RESPONDED', 'INTERVIEW', 'OFFER'].includes(application.status);
      const isNegative = application.status === 'REJECTED';

      if (!isPositive && !isNegative) return;

      // Extract keywords from job description for learning
      const descriptionWords = job.description
        .toLowerCase()
        .split(/\s+/)
        .filter((w: string) => w.length > 3);

      // Find frequently appearing keywords in job descriptions that get positive responses
      const significantKeywords = descriptionWords
        .filter((w: string) => !['that', 'this', 'with', 'from', 'will', 'have', 'been', 'they', 'their', 'about', 'what', 'some', 'more'].includes(w))
        .slice(0, 20);

      // Create or update scoring rules based on outcome
      for (const keyword of significantKeywords.slice(0, 5)) {
        const weight = isPositive ? 0.1 : -0.05;

        const existingRule = await prisma.scoringRule.findFirst({
          where: {
            personaId: persona.id,
            ruleType: 'keyword_learned',
            field: 'description',
            value: keyword,
          },
        });

        if (existingRule) {
          // Adjust weight based on new outcome
          await prisma.scoringRule.update({
            where: { id: existingRule.id },
            data: {
              weight: Math.max(-1, Math.min(2, existingRule.weight + weight)),
              learnedFrom: `${existingRule.learnedFrom || ''},${application.id}`.slice(-200),
            },
          });
        } else {
          await prisma.scoringRule.create({
            data: {
              personaId: persona.id,
              ruleType: 'keyword_learned',
              field: 'description',
              value: keyword,
              weight: isPositive ? 1.1 : 0.9,
              learnedFrom: application.id,
            },
          });
        }
      }

      // Learn from company patterns
      const companyRule = await prisma.scoringRule.findFirst({
        where: {
          personaId: persona.id,
          ruleType: 'company_learned',
          field: 'company',
          value: job.company.toLowerCase(),
        },
      });

      if (companyRule) {
        await prisma.scoringRule.update({
          where: { id: companyRule.id },
          data: {
            weight: Math.max(0, Math.min(3, companyRule.weight + (isPositive ? 0.3 : -0.2))),
            learnedFrom: `${companyRule.learnedFrom || ''},${application.id}`.slice(-200),
          },
        });
      } else {
        await prisma.scoringRule.create({
          data: {
            personaId: persona.id,
            ruleType: 'company_learned',
            field: 'company',
            value: job.company.toLowerCase(),
            weight: isPositive ? 1.3 : 0.8,
            learnedFrom: application.id,
          },
        });
      }

      logger.info(`Learned from outcome: ${application.status} for ${job.title} at ${job.company}`, {
        isPositive,
        keywordsLearned: significantKeywords.length,
      });
    } catch (error) {
      logger.warn('Error learning from outcome (non-fatal):', error);
    }
  }

  /**
   * Use AI to analyze application patterns and provide insights
   */
  private async getAIAnalysis(applications: any[], stats: any) {
    const appliedApps = applications.filter(a => a.appliedAt);
    const respondedApps = appliedApps.filter(a => ['RESPONDED', 'INTERVIEW', 'OFFER'].includes(a.status));
    const rejectedApps = appliedApps.filter(a => a.status === 'REJECTED');

    // Build summary of responded vs not responded job characteristics
    const respondedSummary = respondedApps.slice(0, 10).map(a => ({
      title: a.job.title,
      company: a.job.company,
      descriptionSnippet: a.job.description.substring(0, 150),
      score: a.score,
    }));

    const noResponseSummary = appliedApps
      .filter(a => !['RESPONDED', 'INTERVIEW', 'OFFER', 'REJECTED'].includes(a.status))
      .slice(0, 10)
      .map(a => ({
        title: a.job.title,
        company: a.job.company,
        descriptionSnippet: a.job.description.substring(0, 150),
        score: a.score,
      }));

    const systemPrompt = `You are an expert career analytics AI. Analyze job application patterns and provide actionable insights.
Return a JSON object with:
{
  "weakSpots": ["weakness 1", "weakness 2", ...],
  "strengths": ["strength 1", "strength 2", ...],
  "recommendations": ["recommendation 1", "recommendation 2", ...]
}
Each array should have 2-5 items. Be specific and data-driven.`;

    const userPrompt = `Analyze these application patterns for a Full Stack Developer in Israel:

Stats:
- Total applied: ${appliedApps.length}
- Response rate: ${stats.responseRate.toFixed(1)}%
- Interview rate: ${stats.interviewRate.toFixed(1)}%
- Offer rate: ${stats.offerRate.toFixed(1)}%
- Avg days to response: ${stats.avgDaysToResponse.toFixed(1)}

Jobs that got responses (${respondedSummary.length}):
${JSON.stringify(respondedSummary, null, 2)}

Jobs with no response yet (${noResponseSummary.length}):
${JSON.stringify(noResponseSummary, null, 2)}

Top responding companies: ${JSON.stringify(stats.topRespondingCompanies.slice(0, 5))}
Top responding roles: ${JSON.stringify(stats.topRespondingRoles.slice(0, 5))}
CV variant performance: ${JSON.stringify(stats.variantStats)}

Provide specific, actionable insights about:
1. What types of jobs are getting responses vs not
2. Which CV variants work best
3. Pattern differences between responded and non-responded jobs
4. Concrete recommendations to improve response rate`;

    const response = await (aiClient as any).callAPI(systemPrompt, userPrompt);
    return (aiClient as any).parseJSON(response);
  }

  /**
   * Get learned scoring adjustments for a persona
   */
  async getLearnedRules(personaId: string): Promise<LearnedRule[]> {
    try {
      const rules = await prisma.scoringRule.findMany({
        where: {
          personaId,
          ruleType: { in: ['keyword_learned', 'company_learned'] },
        },
        orderBy: { weight: 'desc' },
      });

      return rules.map(r => ({
        ruleType: r.ruleType,
        field: r.field,
        value: r.value,
        weight: r.weight,
        learnedFrom: r.learnedFrom || '',
      }));
    } catch (error) {
      logger.error('Error getting learned rules:', error);
      throw error;
    }
  }

  /**
   * Get a summary of application funnel stats
   */
  async getFunnelStats(userId: string) {
    try {
      const statusCounts = await prisma.application.groupBy({
        by: ['status'],
        where: {
          persona: { userId },
        },
        _count: { id: true },
      });

      const funnel: Record<string, number> = {};
      for (const item of statusCounts) {
        funnel[item.status] = item._count.id;
      }

      // Weekly application trend
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentApps = await prisma.application.findMany({
        where: {
          persona: { userId },
          createdAt: { gte: thirtyDaysAgo },
        },
        select: {
          createdAt: true,
          status: true,
          appliedAt: true,
          responseAt: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      // Group by week
      const weeklyData: Record<string, { applied: number; responded: number; total: number }> = {};
      for (const app of recentApps) {
        const weekStart = new Date(app.createdAt);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        const weekKey = weekStart.toISOString().split('T')[0];

        if (!weeklyData[weekKey]) {
          weeklyData[weekKey] = { applied: 0, responded: 0, total: 0 };
        }
        weeklyData[weekKey].total++;
        if (app.appliedAt) weeklyData[weekKey].applied++;
        if (app.responseAt) weeklyData[weekKey].responded++;
      }

      return {
        funnel,
        weeklyTrend: Object.entries(weeklyData).map(([week, data]) => ({
          week,
          ...data,
        })),
        total: statusCounts.reduce((sum, item) => sum + item._count.id, 0),
      };
    } catch (error) {
      logger.error('Error getting funnel stats:', error);
      throw error;
    }
  }
}

export const intelligenceService = new IntelligenceService();
