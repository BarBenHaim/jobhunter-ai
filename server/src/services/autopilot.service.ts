import prisma from '../db/prisma';
import logger from '../utils/logger';
import { smartMatchService, analyzeProfileForScoring, scoreJobLocally } from './smart-match.service';
import { lightweightScraperService } from './lightweight-scraper.service';
import { personaService } from './persona.service';
import { profileService } from './profile.service';
import { cvGenerationQueue } from '../queue';
import { cvLibraryService } from './cv-library.service';

// ─── Default AutoPilot config ─────────────────────────────
export interface AutoPilotConfig {
  enabled: boolean;
  mode: 'semi-auto' | 'full-auto';
  schedule: string;           // cron expression
  minScore: number;           // 0-100
  autoApplyThreshold: number; // 0-100, for full-auto
  maxPerDay: number;
  maxPerRun: number;
  sources: string[];          // empty = all
  blacklistedCompanies: string[];
  preferredCompanies: string[];
  location: string;
  generateCoverLetter: boolean;
  notifyEmail: boolean;
  notifyInApp: boolean;
  pausedUntil: string | null;
  maxDailyCost: number;
}

export const DEFAULT_AUTOPILOT_CONFIG: AutoPilotConfig = {
  enabled: false,
  mode: 'semi-auto',
  schedule: '0 */6 * * *',       // Every 6 hours
  minScore: 40,
  autoApplyThreshold: 80,
  maxPerDay: 15,
  maxPerRun: 10,
  sources: [],
  blacklistedCompanies: [],
  preferredCompanies: [],
  location: 'Israel',
  generateCoverLetter: false,
  notifyEmail: true,
  notifyInApp: true,
  pausedUntil: null,
  maxDailyCost: 2.0,
};

// ─── Tech relevance filter (copied from scrape routes) ─────
const IRRELEVANT_TITLE_KEYWORDS = [
  'nurse', 'doctor', 'teacher', 'chef', 'driver', 'accountant',
  'lawyer', 'pharmacist', 'mechanic', 'electrician', 'plumber',
  'אחות', 'רופא', 'מורה', 'שף', 'נהג', 'רואה חשבון', 'עורך דין',
];

function isTechRelevant(title: string): boolean {
  const lower = (title || '').toLowerCase();
  return !IRRELEVANT_TITLE_KEYWORDS.some(kw => lower.includes(kw));
}

// ─── Seniority filter for juniors ─────────────────────────
const SENIOR_TITLE_PATTERNS = [
  /\bsenior\b/i, /\bsr\.?\s/i, /\bסניור\b/i, /\bבכיר/i,
  /\blead\b/i, /\bמוביל/i, /\bhead\b/i, /\bprincipal\b/i,
  /\bstaff\b/i, /\barchitect\b/i, /\bdirector\b/i,
  /\bvp\b/i, /\bcto\b/i, /\bmanager\b/i, /\bמנהל\b/i,
];

// ─── Helper: get user's AutoPilot config ──────────────────
export function getUserAutoPilotConfig(preferences: any): AutoPilotConfig {
  return {
    ...DEFAULT_AUTOPILOT_CONFIG,
    ...(preferences?.autopilot || {}),
  };
}

// ─── Helper: log an autopilot event ───────────────────────
async function logEvent(
  userId: string,
  runId: string | null,
  eventType: string,
  message: string,
  data: any = {},
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS' = 'INFO',
) {
  try {
    await (prisma as any).autoPilotLog.create({
      data: {
        runId,
        userId,
        eventType,
        message,
        data,
        severity,
      },
    });
  } catch (err) {
    logger.error('Failed to write AutoPilot log', err);
  }
}

// ─── Check guardrails ─────────────────────────────────────
async function checkDailyLimit(userId: string, maxPerDay: number): Promise<{ ok: boolean; used: number }> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const count = await prisma.application.count({
    where: {
      persona: { userId },
      createdAt: { gte: todayStart },
    },
  });
  return { ok: count < maxPerDay, used: count };
}

function isCompanyBlacklisted(company: string, blacklist: string[]): boolean {
  if (!blacklist.length) return false;
  const lower = company.toLowerCase();
  return blacklist.some(b => lower.includes(b.toLowerCase()));
}

// ─── MAIN ORCHESTRATOR ────────────────────────────────────
export async function runAutoPilot(
  userId: string,
  triggeredBy: 'SCHEDULE' | 'MANUAL' | 'WEBHOOK' = 'SCHEDULE',
): Promise<any> {
  const startTime = Date.now();
  logger.info(`[AutoPilot] Starting run for user ${userId}, trigger: ${triggeredBy}`);

  // 1. Load user profile and config
  const profile = await profileService.getProfile(userId);
  const preferences = (profile as any).preferences || {};
  const config = getUserAutoPilotConfig(preferences);

  if (!config.enabled && triggeredBy === 'SCHEDULE') {
    logger.info(`[AutoPilot] Disabled for user ${userId}, skipping scheduled run`);
    return { skipped: true, reason: 'disabled' };
  }

  // Check pause
  if (config.pausedUntil && new Date(config.pausedUntil) > new Date()) {
    logger.info(`[AutoPilot] Paused until ${config.pausedUntil} for user ${userId}`);
    return { skipped: true, reason: 'paused' };
  }

  // Check daily limit
  const dailyCheck = await checkDailyLimit(userId, config.maxPerDay);
  if (!dailyCheck.ok) {
    logger.info(`[AutoPilot] Daily limit reached for user ${userId}: ${dailyCheck.used}/${config.maxPerDay}`);
    await logEvent(userId, null, 'GUARDRAIL_TRIGGERED', `הגעת למגבלת ההגשות היומית (${dailyCheck.used}/${config.maxPerDay})`, { used: dailyCheck.used, limit: config.maxPerDay }, 'WARNING');
    return { skipped: true, reason: 'daily_limit', used: dailyCheck.used };
  }

  // 2. Create run record
  const run = await (prisma as any).autoPilotRun.create({
    data: {
      userId,
      status: 'RUNNING',
      triggeredBy,
      config,
    },
  });

  await logEvent(userId, run.id, 'RUN_STARTED', `AutoPilot run #${run.id.slice(-6)} started (${triggeredBy === 'MANUAL' ? 'ידני' : 'מתוזמן'})`, { triggeredBy }, 'INFO');

  try {
    // 3. Resolve persona
    const persona = await personaService.getOrCreateDefaultPersona(userId);
    await (prisma as any).autoPilotRun.update({ where: { id: run.id }, data: { personaId: persona.id } });

    const structuredProfile = (profile as any).structuredProfile || {};
    const rawKnowledge = (profile as any).rawKnowledge || {};

    // 4. Generate smart keywords
    let smartKeywords: any;
    try {
      smartKeywords = await smartMatchService.generateSmartKeywords(
        structuredProfile, rawKnowledge, preferences,
        { keywords: config.sources.length ? undefined : undefined }
      );
    } catch (err) {
      logger.error('[AutoPilot] Smart keyword generation failed', err);
      const targetRoles = preferences?.targetRoles || [];
      smartKeywords = {
        combined: targetRoles.length > 0
          ? [...targetRoles, 'מפתח תוכנה', 'Software Engineer']
          : ['React', 'Full Stack', 'Node.js', 'TypeScript', 'Frontend', 'מפתח תוכנה'],
      };
    }

    const allKeywords = (smartKeywords.combined || []).slice(0, 12);
    const location = config.location || preferences?.preferredLocations?.[0] || 'Israel';

    // 5. Scrape jobs
    const allJobs: any[] = [];
    const sourceBreakdown: Record<string, number> = {};
    const BATCH_SIZE = 2;
    const keywordBatches: string[][] = [];
    for (let i = 0; i < allKeywords.length; i += Math.ceil(allKeywords.length / BATCH_SIZE)) {
      keywordBatches.push(allKeywords.slice(i, i + Math.ceil(allKeywords.length / BATCH_SIZE)));
    }

    for (const batch of keywordBatches) {
      try {
        const results = await lightweightScraperService.scrapeAll(
          batch, location, config.sources.length > 0 ? config.sources : undefined
        );
        for (const result of results) {
          if (result.jobs?.length > 0) {
            allJobs.push(...result.jobs);
            sourceBreakdown[result.source] = (sourceBreakdown[result.source] || 0) + result.jobs.length;
          }
        }
      } catch (err) {
        logger.error(`[AutoPilot] Scrape batch error:`, err);
      }
    }

    // 6. Filter
    let relevantJobs = allJobs.filter(j => isTechRelevant(j.title));

    // Profile analysis for scoring
    const profileAnalysis = analyzeProfileForScoring(structuredProfile, rawKnowledge, preferences);
    const isStudentOrJunior = profileAnalysis.seniorityLevel === 'JUNIOR' && profileAnalysis.experienceYears <= 2;

    if (isStudentOrJunior) {
      relevantJobs = relevantJobs.filter(job => {
        const title = (job.title || '').toLowerCase();
        if (/junior|student|intern|סטודנט|ג'וניור|התמחות|entry/i.test(title)) return true;
        return !SENIOR_TITLE_PATTERNS.some(p => p.test(job.title || ''));
      });
    }

    await (prisma as any).autoPilotRun.update({ where: { id: run.id }, data: { jobsDiscovered: relevantJobs.length } });
    await logEvent(userId, run.id, 'JOBS_DISCOVERED', `נמצאו ${relevantJobs.length} משרות חדשות מ-${Object.keys(sourceBreakdown).length} מקורות`, { total: relevantJobs.length, sourceBreakdown }, 'SUCCESS');

    // 7. Save and score jobs
    let saved = 0;
    let duplicates = 0;
    let blacklisted = 0;
    let belowMinScore = 0;
    const allScores: number[] = [];
    const qualifyingJobs: any[] = [];

    for (const jobData of relevantJobs) {
      // Blacklist check
      if (isCompanyBlacklisted(jobData.company || '', config.blacklistedCompanies)) { blacklisted++; continue; }

      const smartScore = scoreJobLocally(jobData, profileAnalysis, config);
      allScores.push(smartScore.score);
      if (smartScore.score < config.minScore) { belowMinScore++; continue; }

      // Try to save job
      try {
        const dedupHash = `${(jobData.title || '').toLowerCase().replace(/\s+/g, '-')}-${(jobData.company || '').toLowerCase().replace(/\s+/g, '-')}-${(jobData.source || 'OTHER').toLowerCase()}`;

        const existing = await prisma.job.findUnique({ where: { dedupHash } });
        if (existing) {
          duplicates++;
          // Still add score for existing job
          const existingScore = await prisma.jobScore.findUnique({
            where: { jobId_personaId: { jobId: existing.id, personaId: persona.id } },
          });
          if (!existingScore) {
            // Attach score to existing job
            let recommendation: 'AUTO_APPLY' | 'MANUAL_REVIEW' | 'SKIP' | 'ARCHIVE' = 'SKIP';
            if (smartScore.score >= 85) recommendation = 'AUTO_APPLY';
            else if (smartScore.score >= 70) recommendation = 'MANUAL_REVIEW';

            await prisma.jobScore.create({
              data: {
                jobId: existing.id,
                personaId: persona.id,
                overallScore: smartScore.score,
                skillMatch: smartScore.skillMatch ?? smartScore.score,
                experienceMatch: smartScore.experienceMatch ?? smartScore.score,
                cultureFit: smartScore.score,
                salaryMatch: smartScore.score,
                acceptanceProb: smartScore.score,
                recommendation,
                matchedSkills: smartScore.matchedSkills || [],
                missingSkills: smartScore.missingSkills || [],
                redFlags: smartScore.redFlags || [],
              },
            });
            if (smartScore.score >= config.minScore) {
              qualifyingJobs.push({ job: existing, score: smartScore });
            }
          }
          continue;
        }

        const job = await prisma.job.create({
          data: {
            externalId: jobData.externalId || null,
            source: jobData.source || 'OTHER',
            sourceUrl: jobData.url || jobData.sourceUrl || '',
            title: jobData.title || 'Untitled',
            company: jobData.company || 'Unknown',
            companyUrl: jobData.companyUrl || null,
            location: jobData.location || location,
            locationType: jobData.locationType || 'ONSITE',
            description: jobData.description || '',
            requirements: jobData.requirements || null,
            salary: jobData.salary || {},
            experienceLevel: jobData.experienceLevel || null,
            postedAt: jobData.postedAt ? new Date(jobData.postedAt) : null,
            rawData: { ...jobData, smartScore: smartScore.score, autopilotRunId: run.id },
            dedupHash,
          },
        });

        // Attach score
        let recommendation: 'AUTO_APPLY' | 'MANUAL_REVIEW' | 'SKIP' | 'ARCHIVE' = 'SKIP';
        if (smartScore.score >= 85) recommendation = 'AUTO_APPLY';
        else if (smartScore.score >= 70) recommendation = 'MANUAL_REVIEW';

        await prisma.jobScore.create({
          data: {
            jobId: job.id,
            personaId: persona.id,
            overallScore: smartScore.score,
            skillMatch: smartScore.skillMatch ?? smartScore.score,
            experienceMatch: smartScore.experienceMatch ?? smartScore.score,
            cultureFit: smartScore.score,
            salaryMatch: smartScore.score,
            acceptanceProb: smartScore.score,
            recommendation,
            matchedSkills: smartScore.matchedSkills || [],
            missingSkills: smartScore.missingSkills || [],
            redFlags: smartScore.redFlags || [],
          },
        });

        saved++;
        qualifyingJobs.push({ job, score: smartScore });
      } catch (err: any) {
        if (err.code === 'P2002') {
          duplicates++;
        } else {
          logger.error('[AutoPilot] Job save error', err);
        }
      }
    }

    // Score diagnostics
    const avgScore = allScores.length > 0 ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : 0;
    const maxScore = allScores.length > 0 ? Math.round(Math.max(...allScores)) : 0;
    const above50 = allScores.filter(s => s >= 50).length;
    const above40 = allScores.filter(s => s >= 40).length;

    await logEvent(userId, run.id, 'JOBS_SCORED',
      `${qualifyingJobs.length} משרות מתאימות (מתוך ${relevantJobs.length}), ${duplicates} כפולות | ציון ממוצע: ${avgScore}, מקסימום: ${maxScore}, מעל 50: ${above50}, מעל 40: ${above40} | מתחת ל-${config.minScore}: ${belowMinScore}, רשימה שחורה: ${blacklisted}`, {
      qualifying: qualifyingJobs.length, total: relevantJobs.length, duplicates, saved,
      scoring: { avg: avgScore, max: maxScore, above50, above40, belowMinScore, blacklisted, minScore: config.minScore },
    }, qualifyingJobs.length > 0 ? 'SUCCESS' : 'WARNING');

    // 8. Load user's CV library for smart matching
    const userCVs = await (prisma as any).uploadedCV.findMany({
      where: { userId },
      select: { id: true, roleType: true, extractedSkills: true, isDefault: true, filePath: true, label: true },
    });

    // 9. Process qualifying jobs — generate CVs and route
    const remainingSlots = Math.min(config.maxPerRun, config.maxPerDay - dailyCheck.used);
    const jobsToProcess = qualifyingJobs
      .sort((a, b) => b.score.score - a.score.score)
      .slice(0, remainingSlots);

    let cvsGenerated = 0;
    let queued = 0;
    let autoSubmitted = 0;

    for (const { job, score } of jobsToProcess) {
      try {
        // Check if application already exists
        const existingApp = await prisma.application.findUnique({
          where: { jobId_personaId: { jobId: job.id, personaId: persona.id } },
        });
        if (existingApp) continue;

        // Determine routing
        const isAutoApply = config.mode === 'full-auto' && score.score >= config.autoApplyThreshold && (score.redFlags || []).length === 0;

        // Create application
        const application = await prisma.application.create({
          data: {
            jobId: job.id,
            personaId: persona.id,
            status: isAutoApply ? 'APPROVED' : 'AWAITING_REVIEW',
            autopilotRunId: run.id,
            score: score.score,
            notes: `AutoPilot ${isAutoApply ? 'auto-approved' : 'queued for review'} (score: ${score.score}%)`,
          },
        });

        // Select best CV from library for this job
        const selectedCV = userCVs.length > 0
          ? cvLibraryService.selectBestCVForJob(userCVs, job.title || '', job.description || '')
          : null;

        // Queue CV generation (with base CV info if available)
        try {
          await cvGenerationQueue.add({
            applicationId: application.id,
            userId,
            personaId: persona.id,
            jobId: job.id,
            ...(selectedCV ? { baseCVId: selectedCV.cvId, baseCVPath: selectedCV.filePath } : {}),
          }, { priority: isAutoApply ? 5 : 8 });
          cvsGenerated++;
        } catch (cvErr) {
          logger.error(`[AutoPilot] CV queue failed for job ${job.id}`, cvErr);
        }

        if (isAutoApply) {
          autoSubmitted++;
          const cvNote = selectedCV ? ` | CV: ${selectedCV.label} (${selectedCV.matchReason})` : '';
          await logEvent(userId, run.id, 'AUTO_SUBMITTED', `הוגש אוטומטית ל-${job.title} ב-${job.company} (${score.score}%)${cvNote}`, {
            applicationId: application.id, jobId: job.id, score: score.score,
            selectedCV: selectedCV ? { id: selectedCV.cvId, reason: selectedCV.matchReason } : null,
          }, 'SUCCESS');
        } else {
          queued++;
        }
      } catch (err: any) {
        if (err.code === 'P2002') continue; // Duplicate application
        logger.error(`[AutoPilot] Application creation failed for job ${job.id}`, err);
        await logEvent(userId, run.id, 'ERROR', `שגיאה ביצירת הגשה ל-${job.title}`, { error: err.message, jobId: job.id }, 'ERROR');
      }
    }

    if (queued > 0) {
      await logEvent(userId, run.id, 'QUEUED_FOR_APPROVAL', `${queued} הגשות ממתינות לאישורך`, { count: queued }, 'INFO');
    }

    // 9. Complete run
    const duration = Math.round((Date.now() - startTime) / 1000);
    const summary = {
      jobsDiscovered: relevantJobs.length,
      jobsQualifying: qualifyingJobs.length,
      cvsGenerated,
      applicationsSubmitted: autoSubmitted,
      applicationsQueued: queued,
      duration,
    };

    await (prisma as any).autoPilotRun.update({
      where: { id: run.id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        ...summary,
      },
    });

    await logEvent(userId, run.id, 'RUN_COMPLETED',
      `סיום: ${relevantJobs.length} נמצאו, ${qualifyingJobs.length} מתאימות, ${cvsGenerated} CVs, ${autoSubmitted} הוגשו, ${queued} ממתינים`,
      summary, 'SUCCESS',
    );

    logger.info(`[AutoPilot] Run completed for user ${userId}`, summary);
    return { runId: run.id, ...summary };

  } catch (err: any) {
    logger.error(`[AutoPilot] Run failed for user ${userId}`, err);
    await (prisma as any).autoPilotRun.update({
      where: { id: run.id },
      data: { status: 'FAILED', error: err.message, completedAt: new Date() },
    });
    await logEvent(userId, run.id, 'ERROR', `שגיאה: ${err.message}`, { error: err.message }, 'ERROR');
    throw err;
  }
}

// ─── Get AutoPilot status for a user ──────────────────────
export async function getAutoPilotStatus(userId: string) {
  const profile = await prisma.userProfile.findUnique({ where: { id: userId } });
  const preferences = (profile as any)?.preferences || {};
  const config = getUserAutoPilotConfig(preferences);

  const lastRun = await (prisma as any).autoPilotRun.findFirst({
    where: { userId },
    orderBy: { startedAt: 'desc' },
  });

  const activeRun = await (prisma as any).autoPilotRun.findFirst({
    where: { userId, status: 'RUNNING' },
  });

  // Pending approvals count
  const personas = await prisma.persona.findMany({ where: { userId }, select: { id: true } });
  const personaIds = personas.map(p => p.id);
  const pendingApprovals = personaIds.length > 0
    ? await prisma.application.count({
        where: { personaId: { in: personaIds }, status: 'AWAITING_REVIEW' },
      })
    : 0;

  // Today's stats
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayRuns = await (prisma as any).autoPilotRun.findMany({
    where: { userId, startedAt: { gte: todayStart } },
  });
  const todayStats = todayRuns.reduce(
    (acc: any, r: any) => ({
      runs: acc.runs + 1,
      discovered: acc.discovered + (r.jobsDiscovered || 0),
      qualifying: acc.qualifying + (r.jobsQualifying || 0),
      cvs: acc.cvs + (r.cvsGenerated || 0),
      submitted: acc.submitted + (r.applicationsSubmitted || 0),
      queued: acc.queued + (r.applicationsQueued || 0),
    }),
    { runs: 0, discovered: 0, qualifying: 0, cvs: 0, submitted: 0, queued: 0 },
  );

  return {
    config,
    isRunning: !!activeRun,
    lastRun: lastRun ? {
      id: lastRun.id,
      status: lastRun.status,
      startedAt: lastRun.startedAt,
      completedAt: lastRun.completedAt,
      jobsDiscovered: lastRun.jobsDiscovered,
      jobsQualifying: lastRun.jobsQualifying,
      cvsGenerated: lastRun.cvsGenerated,
      applicationsSubmitted: lastRun.applicationsSubmitted,
      applicationsQueued: lastRun.applicationsQueued,
      duration: lastRun.duration,
    } : null,
    pendingApprovals,
    todayStats,
  };
}

// ─── Get runs list ────────────────────────────────────────
export async function getAutoPilotRuns(userId: string, limit = 20, offset = 0) {
  const runs = await (prisma as any).autoPilotRun.findMany({
    where: { userId },
    orderBy: { startedAt: 'desc' },
    skip: offset,
    take: limit,
  });
  const total = await (prisma as any).autoPilotRun.count({ where: { userId } });
  return { runs, total };
}

// ─── Get activity log ─────────────────────────────────────
export async function getAutoPilotLog(userId: string, limit = 50, offset = 0, eventType?: string) {
  const where: any = { userId };
  if (eventType) where.eventType = eventType;

  const logs = await (prisma as any).autoPilotLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: offset,
    take: limit,
  });
  const total = await (prisma as any).autoPilotLog.count({ where });
  return { logs, total };
}

// ─── Get approval queue ───────────────────────────────────
export async function getApprovalQueue(userId: string) {
  const personas = await prisma.persona.findMany({ where: { userId }, select: { id: true } });
  const personaIds = personas.map(p => p.id);
  if (!personaIds.length) return [];

  const applications = await prisma.application.findMany({
    where: {
      personaId: { in: personaIds },
      status: 'AWAITING_REVIEW',
    },
    include: {
      job: {
        include: {
          scores: {
            where: { personaId: { in: personaIds } },
            take: 1,
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return applications.map(app => ({
    id: app.id,
    jobId: app.jobId,
    title: app.job.title,
    company: app.job.company,
    location: app.job.location,
    source: app.job.source,
    score: app.score || app.job.scores?.[0]?.overallScore || 0,
    skillMatch: app.job.scores?.[0]?.skillMatch || 0,
    experienceMatch: app.job.scores?.[0]?.experienceMatch || 0,
    matchedSkills: app.job.scores?.[0]?.matchedSkills || [],
    missingSkills: app.job.scores?.[0]?.missingSkills || [],
    redFlags: app.job.scores?.[0]?.redFlags || [],
    recommendation: app.job.scores?.[0]?.recommendation || 'MANUAL_REVIEW',
    cvFilePath: app.cvFilePath,
    status: app.status,
    createdAt: app.createdAt,
    autopilotRunId: (app as any).autopilotRunId,
  }));
}

// ─── Approve / Reject from queue ──────────────────────────
export async function approveApplication(applicationId: string, userId: string) {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { persona: true },
  });
  if (!app || app.persona.userId !== userId) throw new Error('Application not found');
  if (app.status !== 'AWAITING_REVIEW') throw new Error('Application is not awaiting review');

  await prisma.application.update({
    where: { id: applicationId },
    data: { status: 'APPROVED', appliedAt: new Date() },
  });

  await logEvent(userId, (app as any).autopilotRunId, 'USER_APPROVED', `אישרת הגשה ל-${app.jobId}`, { applicationId }, 'SUCCESS');
  return { success: true };
}

export async function rejectApplication(applicationId: string, userId: string, reason?: string) {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { persona: true },
  });
  if (!app || app.persona.userId !== userId) throw new Error('Application not found');

  await prisma.application.update({
    where: { id: applicationId },
    data: { status: 'REJECTED', notes: reason || 'Rejected from AutoPilot queue' },
  });

  await logEvent(userId, (app as any).autopilotRunId, 'USER_REJECTED', `דחית הגשה ל-${app.jobId}`, { applicationId, reason }, 'INFO');
  return { success: true };
}

export async function approveAll(userId: string, minScore = 0) {
  const queue = await getApprovalQueue(userId);
  const toApprove = queue.filter(item => item.score >= minScore);
  let approved = 0;

  for (const item of toApprove) {
    try {
      await approveApplication(item.id, userId);
      approved++;
    } catch {
      // Skip already processed
    }
  }

  return { approved, total: toApprove.length };
}

// ─── Update config ────────────────────────────────────────
export async function updateAutoPilotConfig(userId: string, updates: Partial<AutoPilotConfig>) {
  const profile = await prisma.userProfile.findUnique({ where: { id: userId } });
  const preferences = (profile as any)?.preferences || {};
  const current = getUserAutoPilotConfig(preferences);
  const newConfig = { ...current, ...updates };

  await prisma.userProfile.update({
    where: { id: userId },
    data: {
      preferences: {
        ...preferences,
        autopilot: newConfig,
      },
    },
  });

  await logEvent(userId, null, 'CONFIG_UPDATED', `הגדרות AutoPilot עודכנו`, { changes: updates }, 'INFO');
  return newConfig;
}
