import prisma from '../db/prisma';
import logger from '../utils/logger';
import { NotFoundError, ValidationError, AIError } from '../utils/errors';
import { ScoringRuleData } from '../types';
import { aiClient } from '../ai/client';
import { scoringQueue } from '../queue';

export class ScoringService {
  async scoreJob(jobId: string) {
    try {
      logger.info(`Scoring job: ${jobId}`);

      const job = await prisma.job.findUnique({
        where: { id: jobId },
      });

      if (!job) {
        throw new NotFoundError(`Job with id ${jobId} not found`);
      }

      // Get all active personas to score against
      const personas = await prisma.persona.findMany({
        where: { isActive: true },
        include: {
          user: {
            select: {
              id: true,
              structuredProfile: true,
            },
          },
        },
      });

      if (personas.length === 0) {
        logger.warn(`No active personas found for job scoring`);
        return null;
      }

      const scores = [];

      for (const persona of personas) {
        try {
          // Call AI service to score
          const scoreData = await aiClient.scoreJob(
            {
              id: job.id,
              title: job.title,
              company: job.company,
              location: job.location,
              description: job.description,
              requirements: job.requirements,
              salary: job.salary as any,
              experienceLevel: job.experienceLevel,
            } as any,
            {
              name: persona.name,
              title: persona.title,
              summary: persona.summary,
              targetKeywords: persona.targetKeywords,
              excludeKeywords: persona.excludeKeywords,
            },
            persona.user.structuredProfile as any
          );

          if (!scoreData) {
            logger.warn(`Failed to score job for persona: ${persona.id}`);
            continue;
          }

          // Apply custom scoring rules
          const ruleBoostedScore = await this.applyManualRules(
            persona.id,
            scoreData.overallScore
          );

          // Determine recommendation based on score thresholds
          let recommendation = 'SKIP';
          if (ruleBoostedScore >= 85) {
            recommendation = 'AUTO_APPLY';
          } else if (ruleBoostedScore >= 70) {
            recommendation = 'MANUAL_REVIEW';
          } else if (ruleBoostedScore >= 50) {
            recommendation = 'SKIP';
          } else {
            recommendation = 'ARCHIVE';
          }

          // Upsert score
          const score = await prisma.jobScore.upsert({
            where: {
              jobId_personaId: {
                jobId,
                personaId: persona.id,
              },
            },
            create: {
              jobId,
              personaId: persona.id,
              overallScore: ruleBoostedScore,
              skillMatch: scoreData.skillMatch,
              experienceMatch: scoreData.experienceMatch,
              cultureFit: scoreData.cultureFit,
              salaryMatch: scoreData.salaryMatch,
              acceptanceProb: scoreData.acceptanceProb,
              recommendation: recommendation as any,
              reasoning: scoreData.reasoning,
              matchedSkills: scoreData.matchedSkills || [],
              missingSkills: scoreData.missingSkills || [],
              redFlags: scoreData.redFlags || [],
              bestPersonaId: null,
            },
            update: {
              overallScore: ruleBoostedScore,
              skillMatch: scoreData.skillMatch,
              experienceMatch: scoreData.experienceMatch,
              cultureFit: scoreData.cultureFit,
              salaryMatch: scoreData.salaryMatch,
              acceptanceProb: scoreData.acceptanceProb,
              recommendation: recommendation as any,
              reasoning: scoreData.reasoning,
              matchedSkills: scoreData.matchedSkills || [],
              missingSkills: scoreData.missingSkills || [],
              redFlags: scoreData.redFlags || [],
              updatedAt: new Date(),
            },
          });

          scores.push(score);
          logger.info(`Job scored for persona: ${persona.id}`, {
            jobId,
            overallScore: ruleBoostedScore,
            recommendation,
          });
        } catch (error) {
          logger.error(`Error scoring job for persona: ${persona.id}`, error);
          continue;
        }
      }

      // Determine best persona
      if (scores.length > 0) {
        const bestScore = scores.reduce((prev, current) =>
          current.overallScore > prev.overallScore ? current : prev
        );

        // Update all scores with best persona
        await Promise.all(
          scores.map(score =>
            prisma.jobScore.update({
              where: { id: score.id },
              data: { bestPersonaId: bestScore.personaId },
            })
          )
        );
      }

      logger.info(`Job scoring complete: ${jobId}, scores: ${scores.length}`);
      return scores;
    } catch (error) {
      logger.error('Error scoring job:', error);
      throw error;
    }
  }

  async scoreBatch() {
    try {
      logger.info(`Starting batch scoring`);

      // Get all unscored jobs
      const unscoredJobs = await prisma.job.findMany({
        where: {
          isActive: true,
          scores: {
            none: {},
          },
        },
        select: { id: true },
        take: 100, // Limit batch size
      });

      logger.info(`Found ${unscoredJobs.length} unscored jobs`);

      // Queue each job for scoring
      const queuedJobs = await Promise.all(
        unscoredJobs.map(job =>
          scoringQueue.add({
            jobId: job.id,
            type: 'score_job',
          })
        )
      );

      logger.info(`Queued ${queuedJobs.length} jobs for scoring`);
      return {
        unscoredCount: unscoredJobs.length,
        queuedCount: queuedJobs.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error in batch scoring:', error);
      throw error;
    }
  }

  async getScoringRules(personaId: string) {
    try {
      logger.info(`Getting scoring rules for persona: ${personaId}`);

      const rules = await prisma.scoringRule.findMany({
        where: { personaId },
      });

      logger.info(`Found ${rules.length} rules for persona: ${personaId}`);
      return rules;
    } catch (error) {
      logger.error('Error getting scoring rules:', error);
      throw error;
    }
  }

  async addScoringRule(personaId: string, data: ScoringRuleData) {
    try {
      logger.info(`Adding scoring rule for persona: ${personaId}`, { data });

      if (!data.ruleType || !data.field || !data.value) {
        throw new ValidationError('ruleType, field, and value are required');
      }

      const rule = await prisma.scoringRule.create({
        data: {
          personaId,
          ruleType: data.ruleType,
          field: data.field,
          value: data.value,
          weight: data.weight || 1.0,
          learnedFrom: data.learnedFrom,
        },
      });

      logger.info(`Scoring rule created: ${rule.id}`);
      return rule;
    } catch (error) {
      logger.error('Error adding scoring rule:', error);
      throw error;
    }
  }

  async deleteScoringRule(ruleId: string) {
    try {
      logger.info(`Deleting scoring rule: ${ruleId}`);

      const rule = await prisma.scoringRule.findUnique({
        where: { id: ruleId },
      });

      if (!rule) {
        throw new NotFoundError(`Scoring rule with id ${ruleId} not found`);
      }

      const deletedRule = await prisma.scoringRule.delete({
        where: { id: ruleId },
      });

      logger.info(`Scoring rule deleted: ${ruleId}`);
      return deletedRule;
    } catch (error) {
      logger.error('Error deleting scoring rule:', error);
      throw error;
    }
  }

  async getScoreAnalytics() {
    try {
      logger.info(`Getting score analytics`);

      const totalScores = await prisma.jobScore.count();
      const recommendationCounts = await prisma.jobScore.groupBy({
        by: ['recommendation'],
        _count: true,
      });

      const scoreDistribution = await prisma.$queryRaw`
        SELECT
          FLOOR(overall_score / 10) * 10 as score_range,
          COUNT(*) as count
        FROM job_scores
        GROUP BY FLOOR(overall_score / 10) * 10
        ORDER BY score_range DESC
      `;

      const averageScore = await prisma.jobScore.aggregate({
        _avg: { overallScore: true },
      });

      const accuracyByRecommendation = await Promise.all(
        recommendationCounts.map(async rc => {
          const accepted = await prisma.application.count({
            where: {
              job: {
                scores: {
                  some: {
                    recommendation: rc.recommendation as any,
                  },
                },
              },
              status: 'RESPONDED',
            },
          });

          return {
            recommendation: rc.recommendation,
            count: rc._count,
            acceptanceCount: accepted,
            accuracy: rc._count > 0 ? Math.round((accepted / rc._count) * 100) : 0,
          };
        })
      );

      logger.info(`Score analytics retrieved`);
      return {
        totalScores,
        recommendationCounts,
        scoreDistribution,
        averageScore: averageScore._avg.overallScore || 0,
        accuracyByRecommendation,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error getting score analytics:', error);
      throw error;
    }
  }

  private async applyManualRules(personaId: string, baseScore: number): Promise<number> {
    try {
      const rules = await this.getScoringRules(personaId);

      let adjustedScore = baseScore;

      for (const rule of rules) {
        if (rule.ruleType === 'boost') {
          adjustedScore += (rule.weight || 1.0) * 5;
        } else if (rule.ruleType === 'penalize') {
          adjustedScore -= (rule.weight || 1.0) * 5;
        }
      }

      // Clamp score between 0 and 100
      return Math.max(0, Math.min(100, adjustedScore));
    } catch (error) {
      logger.error(`Error applying manual rules for persona: ${personaId}`, error);
      return baseScore;
    }
  }
}

export const scoringService = new ScoringService();
