import logger from '../../utils/logger';
import { AIError } from '../../utils/errors';
import { aiClient, JobData, PersonaData, ProfileData, ScoreResult } from '../client';
import { JOB_SCORE_PROMPT } from '../prompts';

/**
 * Scoring engine for job matching
 * Implements multi-dimensional scoring with customizable rules
 */

export interface ScoringRules {
  skillWeighting?: number; // 0-100 (default 40)
  experienceWeighting?: number; // 0-100 (default 30)
  cultureWeighting?: number; // 0-100 (default 15)
  salaryWeighting?: number; // 0-100 (default 10)
  otherWeighting?: number; // 0-100 (default 5)
  thresholdStrong?: number; // 0-100 (default 75)
  thresholdGood?: number; // 0-100 (default 60)
  thresholdModerate?: number; // 0-100 (default 40)
  skillGapTolerance?: number; // 0-1 (default 0.7 = 70% required skills)
  experienceGapTolerance?: number; // 0-1 (default 0.6 = 60% required experience)
  manualBoosts?: Array<{ condition: string; boostPoints: number }>;
  manualPenalties?: Array<{ redFlag: string; penaltyPoints: number }>;
  excludeIfMissingSkills?: string[]; // Auto-fail if missing these critical skills
}

export interface JobScore extends ScoreResult {
  detailedBreakdown?: {
    skillAnalysis: any;
    experienceAnalysis: any;
    cultureAnalysis: any;
    salaryAnalysis: any;
  };
  confidence?: number; // 0-100, how confident is the score
}

/**
 * Score a single job against a persona and profile
 */
export async function scoreJobForPersona(
  job: JobData,
  persona: PersonaData,
  profile: ProfileData,
  rules?: ScoringRules
): Promise<JobScore> {
  try {
    logger.info(`Scoring job ${job.id} for persona ${persona.name}`, {
      jobTitle: job.title,
      company: job.company,
    });

    // Check for critical skill exclusions
    if (rules?.excludeIfMissingSkills) {
      const candidateSkills = (profile.skills || []).map((s) =>
        typeof s === 'string' ? s : s.name
      );

      for (const criticalSkill of rules.excludeIfMissingSkills) {
        const hasSkill = candidateSkills.some(
          (s) =>
            s.toLowerCase().includes(criticalSkill.toLowerCase()) ||
            criticalSkill.toLowerCase().includes(s.toLowerCase())
        );

        if (!hasSkill) {
          logger.info(
            `Job ${job.id} excluded: missing critical skill ${criticalSkill}`
          );
          return {
            overallScore: 0,
            skillMatch: 0,
            experienceMatch: 0,
            cultureFit: 0,
            salaryMatch: 0,
            acceptanceProb: 0,
            recommendation: 'AVOID',
            reasoning: `Missing critical skill: ${criticalSkill}`,
            matchedSkills: [],
            missingSkills: [criticalSkill],
            redFlags: [`Missing required skill: ${criticalSkill}`],
            confidence: 100,
          };
        }
      }
    }

    // Get base score from Claude
    const baseScore = await aiClient.scoreJob(job, persona, profile);

    // Apply rules-based adjustments
    let adjustedScore = { ...baseScore };
    let scoreAdjustments = 0;
    let confidence = 85;

    // Apply manual boosts
    if (rules?.manualBoosts) {
      for (const boost of rules.manualBoosts) {
        // Simple condition matching - in production, use more sophisticated matching
        if (
          job.description?.toLowerCase().includes(boost.condition.toLowerCase())
        ) {
          scoreAdjustments += boost.boostPoints;
          logger.debug(`Applied boost for ${boost.condition}: +${boost.boostPoints}`);
        }
      }
    }

    // Apply manual penalties
    if (rules?.manualPenalties) {
      for (const penalty of rules.manualPenalties) {
        if (adjustedScore.redFlags?.includes(penalty.redFlag)) {
          scoreAdjustments -= penalty.penaltyPoints;
          logger.debug(`Applied penalty for ${penalty.redFlag}: -${penalty.penaltyPoints}`);
        }
      }
    }

    // Apply overall adjustment
    if (scoreAdjustments !== 0) {
      adjustedScore.overallScore = Math.max(
        0,
        Math.min(100, adjustedScore.overallScore + scoreAdjustments)
      );
    }

    // Determine recommendation based on thresholds
    const thresholds = {
      strong: rules?.thresholdStrong ?? 75,
      good: rules?.thresholdGood ?? 60,
      moderate: rules?.thresholdModerate ?? 40,
    };

    if (adjustedScore.overallScore >= thresholds.strong) {
      adjustedScore.recommendation = 'STRONG_FIT';
    } else if (adjustedScore.overallScore >= thresholds.good) {
      adjustedScore.recommendation = 'GOOD_FIT';
    } else if (adjustedScore.overallScore >= thresholds.moderate) {
      adjustedScore.recommendation = 'MODERATE';
    } else {
      adjustedScore.recommendation = 'POOR_FIT';
    }

    // Calculate confidence score
    confidence = 75 + (Math.min(baseScore.acceptanceProb, 1) * 20);

    const result: JobScore = {
      ...adjustedScore,
      confidence: Math.round(confidence),
      detailedBreakdown: {
        skillAnalysis: {
          matched: adjustedScore.matchedSkills,
          missing: adjustedScore.missingSkills,
          matchPercentage: (adjustedScore.matchedSkills.length /
            (adjustedScore.matchedSkills.length +
              adjustedScore.missingSkills.length || 1)) * 100,
        },
        experienceAnalysis: {
          score: adjustedScore.experienceMatch,
          levels: ['junior', 'mid', 'senior', 'lead'].find(
            (l) =>
              job.experienceLevel?.toLowerCase().includes(l) ||
              job.description?.toLowerCase().includes(l)
          ),
        },
        cultureAnalysis: {
          score: adjustedScore.cultureFit,
          factors: ['growth', 'innovation', 'collaboration', 'autonomy'].filter(
            (f) =>
              job.description?.toLowerCase().includes(f) ||
              job.company?.toLowerCase().includes(f)
          ),
        },
        salaryAnalysis: {
          score: adjustedScore.salaryMatch,
          provided: !!job.salary,
        },
      },
    };

    logger.info(`Score result for job ${job.id}`, {
      overallScore: result.overallScore,
      recommendation: result.recommendation,
      confidence: result.confidence,
    });

    return result;
  } catch (error) {
    logger.error('Error scoring job:', error);
    throw error instanceof AIError
      ? error
      : new AIError('Failed to score job');
  }
}

/**
 * Batch score multiple jobs efficiently
 */
export async function batchScoreJobs(
  jobs: JobData[],
  personas: PersonaData[],
  profile: ProfileData,
  rules?: ScoringRules
): Promise<Map<string, JobScore[]>> {
  try {
    logger.info(
      `Batch scoring ${jobs.length} jobs against ${personas.length} personas`
    );

    const results = new Map<string, JobScore[]>();

    // Process in parallel chunks to avoid rate limiting
    const chunkSize = 5;
    for (let i = 0; i < jobs.length; i += chunkSize) {
      const chunk = jobs.slice(i, Math.min(i + chunkSize, jobs.length));

      const chunkResults = await Promise.allSettled(
        chunk.flatMap((job) =>
          personas.map((persona) =>
            scoreJobForPersona(job, persona, profile, rules)
          )
        )
      );

      // Map results back to jobs and personas
      let resultIndex = 0;
      for (const job of chunk) {
        const jobScores: JobScore[] = [];

        for (const persona of personas) {
          const result = chunkResults[resultIndex];
          resultIndex++;

          if (result.status === 'fulfilled') {
            jobScores.push(result.value);
          } else {
            logger.warn(
              `Failed to score job ${job.id} for persona ${persona.name}`,
              { error: result.reason }
            );
            jobScores.push({
              overallScore: 0,
              skillMatch: 0,
              experienceMatch: 0,
              cultureFit: 0,
              salaryMatch: 0,
              acceptanceProb: 0,
              matchedSkills: [],
              missingSkills: [],
              redFlags: ['Scoring error - please retry'],
              recommendation: 'POOR_FIT',
            });
          }
        }

        results.set(job.id, jobScores);
      }
    }

    logger.info(`Batch scoring complete: ${results.size} jobs scored`);
    return results;
  } catch (error) {
    logger.error('Error batch scoring jobs:', error);
    throw error instanceof AIError
      ? error
      : new AIError('Failed to batch score jobs');
  }
}

/**
 * Recalibrate scoring weights based on feedback data
 * Used to improve scoring over time based on actual outcomes
 */
export interface ScoringFeedback {
  jobId: string;
  personaName: string;
  prediction: JobScore;
  actualOutcome: {
    applied: boolean;
    interviewed: boolean;
    offered: boolean;
    accepted: boolean;
    succeeded: boolean; // Did they succeed in the role?
  };
  feedback?: string;
}

export async function recalibrateWeights(
  feedbackData: ScoringFeedback[]
): Promise<Partial<ScoringRules>> {
  try {
    logger.info(
      `Recalibrating scoring weights based on ${feedbackData.length} feedback items`
    );

    // Calculate accuracy metrics
    let totalPredictions = 0;
    let correctPredictions = 0;
    let overestimated = 0;
    let underestimated = 0;

    const componentAccuracy = {
      skillMatch: { count: 0, error: 0 },
      experienceMatch: { count: 0, error: 0 },
      cultureFit: { count: 0, error: 0 },
      salaryMatch: { count: 0, error: 0 },
    };

    for (const feedback of feedbackData) {
      totalPredictions++;

      // Actual outcome score: 1 if they accepted and succeeded, 0 otherwise
      const actualScore = feedback.actualOutcome.accepted &&
        feedback.actualOutcome.succeeded ? 100 : 0;
      const predictedScore = feedback.prediction.overallScore;

      if (Math.abs(actualScore - predictedScore) < 20) {
        correctPredictions++;
      } else if (predictedScore > actualScore) {
        overestimated++;
      } else {
        underestimated++;
      }

      // Track component-level accuracy
      if (feedback.actualOutcome.interviewed) {
        componentAccuracy.skillMatch.count++;
        componentAccuracy.skillMatch.error += Math.abs(
          (feedback.actualOutcome.offered ? 80 : 20) -
            feedback.prediction.skillMatch
        );
      }
    }

    const accuracy = (correctPredictions / totalPredictions) * 100;
    logger.info(
      `Scoring accuracy: ${accuracy.toFixed(1)}% (overestimated: ${overestimated}, underestimated: ${underestimated})`
    );

    // Generate calibration recommendations
    const recommendations: Partial<ScoringRules> = {};

    if (overestimated > underestimated) {
      logger.info('Recommendations: Lower scoring thresholds');
      recommendations.thresholdStrong = 70;
      recommendations.thresholdGood = 55;
      recommendations.thresholdModerate = 35;
    } else if (underestimated > overestimated) {
      logger.info('Recommendations: Raise scoring thresholds');
      recommendations.thresholdStrong = 80;
      recommendations.thresholdGood = 65;
      recommendations.thresholdModerate = 45;
    }

    return recommendations;
  } catch (error) {
    logger.error('Error recalibrating weights:', error);
    throw error instanceof AIError
      ? error
      : new AIError('Failed to recalibrate weights');
  }
}

/**
 * Get top N jobs for a persona
 */
export function getTopJobs(
  scoredJobs: Map<string, JobScore[]>,
  personaIndex: number,
  topN: number = 10,
  minScore: number = 40
): Array<{ jobId: string; score: JobScore }> {
  try {
    const jobs: Array<{ jobId: string; score: JobScore }> = [];

    for (const [jobId, scores] of scoredJobs) {
      if (scores[personaIndex] && scores[personaIndex].overallScore >= minScore) {
        jobs.push({
          jobId,
          score: scores[personaIndex],
        });
      }
    }

    return jobs
      .sort((a, b) => b.score.overallScore - a.score.overallScore)
      .slice(0, topN);
  } catch (error) {
    logger.error('Error getting top jobs:', error);
    return [];
  }
}
