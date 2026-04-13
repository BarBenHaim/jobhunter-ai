import { Router, Request, Response } from 'express'
import { lightweightScraperService } from '../services/lightweight-scraper.service'
import { companyDiscoveryService } from '../services/company-discovery.service'
import { jobService } from '../services/job.service'
import { profileService } from '../services/profile.service'
import { personaService } from '../services/persona.service'
import { smartMatchService, analyzeProfileForScoring, scoreJobLocally, buildSkillDepthProfile, aiReRankJobs, generateStackSearchQueries, interpretFreeTextSearch, applyFreeTextBoosts } from '../services/smart-match.service'
import type { SkillDepth, FreeTextSearchIntent } from '../services/smart-match.service'
import { authMiddleware, optionalAuthMiddleware, AuthRequest } from '../middleware/auth'
import prisma from '../db/prisma'
import logger from '../utils/logger'

const router = Router()

// ─── Search History (in-memory) ───────────────────────────
interface SearchHistoryEntry {
  id: string
  timestamp: string
  config: {
    sources?: string[]
    minScore?: number
    location?: string
    keywords?: string[]
    experienceLevel?: string
  }
  results: {
    totalScraped: number
    totalSaved: number
    totalFiltered: number
    duplicates: number
    avgScore: number
    jobIds: string[]
  }
}

// Store last 20 searches per user
const searchHistory: Map<string, SearchHistoryEntry[]> = new Map()

function addSearchHistory(userId: string, entry: SearchHistoryEntry) {
  const history = searchHistory.get(userId) || []
  history.unshift(entry)
  if (history.length > 20) history.pop()
  searchHistory.set(userId, history)
}

function getSearchHistory(userId: string): SearchHistoryEntry[] {
  return searchHistory.get(userId) || []
}

function generateSearchId(): string {
  return `search_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
}

// Default keywords including Hebrew terms for Israeli job sites
const DEFAULT_KEYWORDS = [
  'React',
  'Full Stack',
  'Node.js',
  'TypeScript',
  'Frontend',
  'Backend',
  'Software Engineer',
  'Developer',
  'מפתח תוכנה',
  'פיתוח',
]

// Words that indicate a job is NOT tech-related — used to filter out irrelevant results
const IRRELEVANT_TITLE_KEYWORDS = [
  // Sales & Marketing
  'מכירות', 'sales', 'נציג שירות', 'customer service', 'call center', 'מוקד',
  'שיווק', 'marketing', 'סושיאל', 'social media', 'תוכן', 'content writer',
  'territory manager', 'account executive', 'business development rep',
  // Finance & Accounting
  'מנהל חשבונות', 'accounting', 'הנהלת חשבונות', 'bookkeep', 'accountant',
  'חשבונאי', 'פיננסי', 'financial', 'finance manager', 'cfo', 'controller',
  'רואה חשבון', 'auditor', 'מבקר', 'tax', 'מיסים',
  // Admin & Office
  'מזכיר', 'secretary', 'אדמיניסטרציה', 'admin assistant', 'receptionist', 'קבלה',
  'office manager',
  // Manual/Trade
  'נהג', 'driver', 'שליח', 'courier', 'משלוח',
  'טכנאי מזגנים', 'אינסטלטור', 'plumber', 'חשמלאי', 'electrician',
  'מכונאי', 'mechanical designer', 'mechanical engineer', 'הנדסה מכנית',
  'civil engineer', 'מהנדס אזרחי', 'structural engineer', 'construction',
  'עוזר בית', 'מטפל', 'caregiver', 'סיעוד',
  'קופאי', 'cashier', 'מלצר', 'waiter', 'ברמן', 'bartender',
  'אבטחה', 'security guard', 'שומר', 'guard',
  'מנקה', 'cleaning', 'ניקיון',
  // Legal
  'עורך דין', 'lawyer', 'attorney', 'legal counsel', 'יועץ משפטי',
  // Insurance
  'ביטוח', 'insurance',
  // HR & Recruiting (unless tech recruiting)
  'talent acquisition', 'recruiter', 'מגייס', 'גיוס', 'hr manager', 'משאבי אנוש',
  // Healthcare & Science
  'רופא', 'doctor', 'nurse', 'אחות', 'pharmacist', 'רוקח',
  'veterinary', 'וטרינר', 'diagnostics',
  // Supply Chain & Logistics
  'supply chain', 'שרשרת אספקה', 'procurement', 'רכש', 'logistics', 'לוגיסטיקה',
  'warehouse', 'מחסנאי',
  // Safety & Environment
  'hse ', 'health safety', 'בטיחות', 'safety manager', 'environmental',
]

/** Check if a job title looks tech-relevant. Returns false for obvious non-tech jobs. */
function isTechRelevant(title: string): boolean {
  if (!title) return false
  // Normalize: remove slashes, extra spaces, and gender markers common in Hebrew job posts
  const lower = title.toLowerCase()
    .replace(/\s*\/\s*[תה]\s*/g, ' ')   // "מנהל /ת" → "מנהל "
    .replace(/\s*\/\s*(ית|ה)\s*/g, ' ')  // "דרוש/ה" → "דרוש "
    .replace(/\s+/g, ' ')                 // normalize multiple spaces
    .trim()
  // If title contains any irrelevant keyword, reject it
  for (const kw of IRRELEVANT_TITLE_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) return false
  }
  return true
}

// POST /api/scrape/smart-trigger - AI-powered smart scrape with profile analysis
// Thinks like a recruiter: expands keywords, scrapes, scores locally
router.post('/smart-trigger', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' })
    }

    // Accept optional search configuration from the client
    const searchConfig = {
      sources: req.body.sources as string[] | undefined,       // e.g. ['INDEED','GOOGLE_JOBS','DRUSHIM']
      minScore: req.body.minScore as number | undefined,       // e.g. 60
      location: req.body.location as string | undefined,       // e.g. 'Tel Aviv'
      keywords: req.body.keywords as string[] | undefined,     // e.g. ['React','Node.js']
      experienceLevel: req.body.experienceLevel as string | undefined,
      freeTextQuery: req.body.freeTextQuery as string | undefined, // e.g. 'משרת פיתוח מוצר בסטרטאפים'
    }

    const searchSessionId = generateSearchId()
    logger.info('Smart scrape triggered', { userId, searchConfig, searchSessionId })

    // Step 1: Fetch user profile
    let profile: any
    try {
      profile = await profileService.getProfile(userId)
    } catch (err) {
      logger.warn('Could not fetch profile for smart scrape, falling back to basic', { userId })
      return res.status(400).json({
        success: false,
        error: 'Profile not found. Please complete your profile first.',
      })
    }

    const structuredProfile = profile.structuredProfile || {}
    const rawKnowledge = profile.rawKnowledge || {}
    const preferences = profile.preferences || {}

    // Step 1.5: Interpret free-text search query (if provided)
    let freeTextIntent: FreeTextSearchIntent | null = null
    if (searchConfig.freeTextQuery && searchConfig.freeTextQuery.trim().length > 0) {
      try {
        freeTextIntent = await interpretFreeTextSearch(
          searchConfig.freeTextQuery.trim(),
          structuredProfile,
          rawKnowledge,
          preferences,
        )
        logger.info('Free-text search interpreted', {
          query: searchConfig.freeTextQuery,
          keywords: freeTextIntent.keywords.length,
          hebrewKeywords: freeTextIntent.hebrewKeywords.length,
          titlePatterns: freeTextIntent.scoringBoosts.titlePatterns.length,
          companyTypes: freeTextIntent.scoringBoosts.companyTypes,
          domains: freeTextIntent.scoringBoosts.domains,
          intentSummary: freeTextIntent.intentSummary,
        })
      } catch (err) {
        logger.warn('Free-text interpretation failed, continuing with standard search', err)
      }
    }

    // Step 2: Generate smart keywords using AI
    let smartKeywords: any
    try {
      smartKeywords = await smartMatchService.generateSmartKeywords(
        structuredProfile,
        rawKnowledge,
        preferences,
        { experienceLevel: searchConfig.experienceLevel, keywords: searchConfig.keywords }
      )
      logger.info('Smart keywords generated', {
        combined: smartKeywords.combined?.length,
        primary: smartKeywords.primary?.length,
        adjacent: smartKeywords.adjacent?.length,
      })
    } catch (err) {
      logger.error('Smart keyword generation failed, using fallback', err)
      const targetRoles = preferences?.targetRoles || []
      smartKeywords = {
        combined: targetRoles.length > 0
          ? [...targetRoles, 'מפתח תוכנה', 'Software Engineer']
          : DEFAULT_KEYWORDS,
      }
    }

    // Step 2.5: Skill depth profiling + tech-stack search queries
    let skillDepth: SkillDepth[] = []
    let stackQueries: string[] = []
    try {
      skillDepth = buildSkillDepthProfile(structuredProfile, rawKnowledge)
      if (skillDepth.length > 0) {
        logger.info('Skill depth profile built', { count: skillDepth.length, top3: skillDepth.slice(0, 3).map(s => `${s.name}(${s.level})`) })
      }
    } catch (err) {
      logger.warn('Skill depth profiling failed, continuing without it', err)
    }

    // Generate stack-based search queries using skill depth analysis
    const earlyProfileAnalysis = analyzeProfileForScoring(structuredProfile, rawKnowledge, preferences)
    try {
      stackQueries = generateStackSearchQueries(earlyProfileAnalysis, skillDepth, preferences)
      if (stackQueries.length > 0) {
        logger.info('Stack-based search queries generated', { count: stackQueries.length, queries: stackQueries })
      }
    } catch (err) {
      logger.warn('Stack search query generation failed, continuing without it', err)
    }

    // Step 3: Merge combined + discovery + stack keywords for maximum coverage
    const combinedKws = smartKeywords.combined?.length > 0
      ? [...smartKeywords.combined]
      : [...DEFAULT_KEYWORDS]

    // Merge discovery keywords (modern/emerging roles the candidate may not know about)
    const discoveryKws = smartKeywords.discovery || []
    const combinedSet = new Set(combinedKws.map(k => k.toLowerCase()))
    for (const dk of discoveryKws) {
      if (!combinedSet.has(dk.toLowerCase())) {
        combinedKws.push(dk)
      }
    }

    // Merge tech-stack queries (skill-combo searches the candidate wouldn't think of)
    for (const sq of stackQueries) {
      if (!combinedSet.has(sq.toLowerCase())) {
        combinedKws.push(sq)
        combinedSet.add(sq.toLowerCase())
      }
    }

    // Merge free-text keywords (if available)
    if (freeTextIntent) {
      for (const fk of [...freeTextIntent.keywords, ...freeTextIntent.hebrewKeywords]) {
        if (!combinedSet.has(fk.toLowerCase())) {
          combinedKws.push(fk)
          combinedSet.add(fk.toLowerCase())
        }
      }
    }

    // If user supplied custom keywords, prefer those; otherwise use smart + discovery + stack + free-text keywords
    const finalKeywords = searchConfig.keywords?.length
      ? searchConfig.keywords
      : combinedKws

    // Deduplicate keywords before batching
    const rawKeywords = finalKeywords.slice(0, 20)
    const seenLower = new Set<string>()
    const allKeywords = rawKeywords.filter(kw => {
      const lower = kw.toLowerCase().trim()
      if (!lower || seenLower.has(lower)) return false
      seenLower.add(lower)
      return true
    })

    const location = searchConfig.location || preferences?.preferredLocations?.[0] || 'Israel'

    // Search each keyword individually for better job board results
    // Joining 6+ keywords into one query produces nonsensical searches that job boards can't handle
    const keywordBatches: string[][] = []
    for (const kw of allKeywords) {
      keywordBatches.push([kw])
    }

    logger.info('Smart scraping with individual keywords', {
      totalKeywords: allKeywords.length,
      discoveryKeywords: discoveryKws.length,
      deduplicated: rawKeywords.length - allKeywords.length,
      location,
    })

    // Step 4: Scrape with batched keywords (each batch is ONE scrapeAll call)
    const allJobs: any[] = []
    const sourceBreakdown: Record<string, number> = {}

    for (const batch of keywordBatches) {
      try {
        // scrapeAll joins the keywords array into a single search query
        // Pass enabled sources filter if configured
        const results = await lightweightScraperService.scrapeAll(batch, location, searchConfig.sources)
        for (const result of results) {
          if (result.jobs?.length > 0) {
            allJobs.push(...result.jobs)
            sourceBreakdown[result.source] = (sourceBreakdown[result.source] || 0) + result.jobs.length
          }
        }
      } catch (err) {
        logger.error(`Error scraping batch [${batch.join(', ')}]:`, err)
      }
    }

    // Step 5: Filter irrelevant jobs
    let relevantJobs = allJobs.filter(job => isTechRelevant(job.title))
    const filtered = allJobs.length - relevantJobs.length
    if (filtered > 0) {
      logger.info(`Filtered out ${filtered} irrelevant jobs`)
    }

    // Step 6: Analyze profile for local scoring (one-time)
    const profileAnalysis = analyzeProfileForScoring(structuredProfile, rawKnowledge, preferences)

    // Step 6.5: SENIORITY PRE-FILTER — reject obviously wrong seniority levels
    // This prevents saving 200+ senior jobs when the user is a student
    const candidateLevel = profileAnalysis.seniorityLevel
    const isStudentOrJunior = candidateLevel === 'JUNIOR' && profileAnalysis.experienceYears <= 2

    if (isStudentOrJunior) {
      const SENIOR_TITLE_PATTERNS = [
        /\bsenior\b/i, /\bsr\.?\s/i, /\bסניור\b/i, /\bבכיר/i,
        /\blead\b/i, /\bמוביל/i, /\bhead\b/i, /\bhead of\b/i,
        /\bprincipal\b/i, /\bstaff\b/i, /\barchitect\b/i, /\bארכיטקט/i,
        /\bdirector\b/i, /\bvp\b/i, /\bcto\b/i, /\bcio\b/i,
        /\bmanager\b/i, /\bמנהל\b/i,
        /\bteam lead/i, /\btech lead/i, /\beng(?:ineering)?\s*lead/i,
        /\bראש\s*(?:צוות|קבוצ)/i,
      ]

      const beforeCount = relevantJobs.length
      relevantJobs = relevantJobs.filter(job => {
        const title = (job.title || '').toLowerCase()
        // Allow jobs that explicitly say junior/student/intern
        if (/junior|student|intern|סטודנט|ג'וניור|התמחות|entry/i.test(title)) return true
        // Reject jobs with senior-level patterns in title
        return !SENIOR_TITLE_PATTERNS.some(p => p.test(job.title || ''))
      })

      const seniorFiltered = beforeCount - relevantJobs.length
      if (seniorFiltered > 0) {
        logger.info(`Seniority pre-filter: removed ${seniorFiltered} senior/lead jobs for student/junior candidate`)
      }
    }

    // Step 7: Save jobs and score them locally.
    //
    // Jobs are per-user, so every saved job needs a JobScore attached to one
    // of this user's personas. That JobScore row is what ties the global Job
    // table back to the user — `listJobs` filters on
    // `scores.some.personaId IN (user's personaIds)`. Resolve the owning
    // persona up front so we don't hit the DB once per job.
    let ownerPersona: { id: string }
    try {
      ownerPersona = await personaService.getOrCreateDefaultPersona(userId)
      logger.info('Smart scrape owner persona', { userId, personaId: ownerPersona.id })
    } catch (err) {
      logger.error('Failed to resolve owner persona for smart scrape', err)
      return res.status(500).json({
        success: false,
        error: 'Could not resolve a persona for your account. Please try again.',
      })
    }

    let saved = 0
    let duplicates = 0
    let ownershipFailures = 0
    const jobsCreated: any[] = []
    const scoredJobs: any[] = []

    const minScoreThreshold = searchConfig.minScore || 0

    // Helper: attach a JobScore row to the owner persona for this job.
    // Required so downstream `listJobs` picks up the job under this user.
    // Returns true on success, false on failure — callers skip persisting
    // jobs whose ownership couldn't be attached so we never end up with
    // orphan (invisible) jobs.
    const attachOwnership = async (
      jobId: string,
      smartScore: { score: number; skillMatch?: number; experienceMatch?: number; matchedSkills?: string[]; missingSkills?: string[]; redFlags?: string[]; reasoning?: string }
    ): Promise<boolean> => {
      try {
        // Map smartScore 0..100 to Recommendation buckets.
        let recommendation: 'AUTO_APPLY' | 'MANUAL_REVIEW' | 'SKIP' | 'ARCHIVE' = 'SKIP'
        if (smartScore.score >= 85) recommendation = 'AUTO_APPLY'
        else if (smartScore.score >= 70) recommendation = 'MANUAL_REVIEW'
        else if (smartScore.score >= 50) recommendation = 'SKIP'
        else recommendation = 'ARCHIVE'

        await prisma.jobScore.upsert({
          where: { jobId_personaId: { jobId, personaId: ownerPersona.id } },
          create: {
            jobId,
            personaId: ownerPersona.id,
            overallScore: smartScore.score,
            skillMatch: smartScore.skillMatch ?? smartScore.score,
            experienceMatch: smartScore.experienceMatch ?? smartScore.score,
            cultureFit: smartScore.score,
            salaryMatch: smartScore.score,
            acceptanceProb: smartScore.score,
            recommendation,
            reasoning: smartScore.reasoning,
            matchedSkills: smartScore.matchedSkills || [],
            missingSkills: smartScore.missingSkills || [],
            redFlags: smartScore.redFlags || [],
          },
          update: {
            overallScore: smartScore.score,
            skillMatch: smartScore.skillMatch ?? smartScore.score,
            experienceMatch: smartScore.experienceMatch ?? smartScore.score,
            cultureFit: smartScore.score,
            salaryMatch: smartScore.score,
            acceptanceProb: smartScore.score,
            recommendation,
            reasoning: smartScore.reasoning,
            matchedSkills: smartScore.matchedSkills || [],
            missingSkills: smartScore.missingSkills || [],
            redFlags: smartScore.redFlags || [],
            updatedAt: new Date(),
          },
        })
        return true
      } catch (err: any) {
        ownershipFailures += 1
        logger.error('attachOwnership upsert failed', {
          jobId,
          personaId: ownerPersona.id,
          code: err?.code,
          message: err?.message,
        })
        return false
      }
    }

    for (const job of relevantJobs) {
      try {
        const created = await jobService.createJob(job)
        if (created) {
          // Score locally — instant, no API call
          let smartScore = scoreJobLocally(
            {
              title: created.title,
              company: created.company,
              description: created.description || '',
              requirements: (created as any).requirements || '',
              location: created.location || '',
              experienceLevel: (created as any).experienceLevel || '',
            },
            profileAnalysis,
            preferences
          )

          // Apply free-text scoring boosts if user provided a natural language query
          if (freeTextIntent) {
            smartScore = applyFreeTextBoosts(smartScore, {
              title: created.title,
              company: created.company,
              description: created.description || '',
              location: created.location || '',
              locationType: (created as any).locationType || '',
            }, freeTextIntent)
          }

          // Attach the JobScore FIRST, before any early-return paths, so even
          // jobs skipped by the min-score filter still belong to this user.
          // If ownership attachment fails, skip the job entirely — an
          // orphaned Job row without a JobScore for this user is invisible
          // (which is exactly the bug we're trying to avoid).
          const ownershipOk = await attachOwnership(created.id, smartScore as any)
          if (!ownershipOk) {
            continue
          }

          // If minimum score is configured, skip jobs below the threshold
          if (minScoreThreshold > 0 && smartScore.score < minScoreThreshold) {
            // Still save the score metadata so we have it if they change the filter later
            try {
              await jobService.updateJobMetadata(created.id, {
                smartScore: smartScore.score,
                smartCategory: smartScore.category,
                smartReasoning: smartScore.reasoning,
                matchedSkills: smartScore.matchedSkills,
                missingSkills: smartScore.missingSkills,
                scoredAt: new Date().toISOString(),
                searchSessionId,
              })
            } catch (_) { /* non-critical */ }
            saved++
            continue
          }

          saved++

          const jobWithScore = {
            id: created.id,
            title: created.title,
            company: created.company,
            source: created.source,
            smartScore: smartScore.score,
            category: smartScore.category,
            reasoning: smartScore.reasoning,
          }

          jobsCreated.push(jobWithScore)

          // Store smart score in job metadata (+ search session ID)
          try {
            await jobService.updateJobMetadata(created.id, {
              smartScore: smartScore.score,
              smartCategory: smartScore.category,
              smartReasoning: smartScore.reasoning,
              matchedSkills: smartScore.matchedSkills,
              missingSkills: smartScore.missingSkills,
              greenFlags: smartScore.greenFlags,
              redFlags: smartScore.redFlags,
              skillMatch: smartScore.skillMatch,
              experienceMatch: smartScore.experienceMatch,
              roleRelevance: smartScore.roleRelevance,
              scoredAt: new Date().toISOString(),
              searchSessionId,
            })
          } catch (metaErr) {
            logger.warn('Could not save smart score metadata', { jobId: created.id })
          }
        }
      } catch (err: any) {
        if (err?.code === 'P2002' || err?.message?.includes('already exists')) {
          duplicates++
        } else {
          logger.error('Error saving job:', err)
        }
      }
    }

    // ── AI Re-Ranking (optional, for top jobs) ──
    // Sends top qualifying jobs to AI for deep analysis — blends 60% AI + 40% local score
    let aiReRankingApplied = false
    if (jobsCreated.length >= 3 && profileAnalysis) {
      try {
        const topForAI = jobsCreated
          .sort((a, b) => (b.smartScore || 0) - (a.smartScore || 0))
          .slice(0, 20)
          .map(j => ({
            id: j.id,
            title: j.title || '',
            company: j.company || '',
            description: '', // We don't keep full description in jobsCreated — use title/company
            requirements: '',
            localScore: j.smartScore || 0,
            localCategory: j.category || '',
          }))

        const reRanked = await aiReRankJobs(topForAI, profileAnalysis, skillDepth, preferences, 20)
        if (reRanked.length > 0) {
          const reRankedMap = new Map(reRanked.map(r => [r.id, r]))
          for (const jc of jobsCreated) {
            const aiResult = reRankedMap.get(jc.id)
            if (aiResult) {
              jc.smartScore = aiResult.finalScore
              jc.category = aiResult.aiCategory || jc.category
              jc.aiReasoning = aiResult.aiReasoning
            }
          }
          aiReRankingApplied = true
          logger.info('AI Re-Ranking applied', { reRankedCount: reRanked.length })
        }
      } catch (err) {
        logger.warn('AI Re-Ranking failed in smart-trigger, using local scores only', err)
      }
    }

    // Sort created jobs by smart score (potentially AI-enhanced)
    jobsCreated.sort((a, b) => (b.smartScore || 0) - (a.smartScore || 0))

    const avgScore = jobsCreated.length > 0
      ? Math.round(jobsCreated.reduce((sum, j) => sum + (j.smartScore || 0), 0) / jobsCreated.length)
      : 0

    // Post-scrape verification: count how many JobScore rows actually exist
    // for this user's owning persona, and how many would show up under the
    // "new jobs (24h)" filter. If `visibleToUser` is 0 after a supposedly
    // successful scrape, something went wrong with ownership attachment or
    // the list-query filter — surfacing it in the response makes debugging
    // obvious instead of silently showing "no jobs".
    let verification = {
      personaJobScoreTotal: 0,
      personaJobScoreRecent: 0,
    }
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const [personaJobScoreTotal, personaJobScoreRecent] = await Promise.all([
        prisma.jobScore.count({ where: { personaId: ownerPersona.id } }),
        prisma.jobScore.count({
          where: {
            personaId: ownerPersona.id,
            scoredAt: { gte: twentyFourHoursAgo },
          },
        }),
      ])
      verification = { personaJobScoreTotal, personaJobScoreRecent }
    } catch (err) {
      logger.warn('Post-scrape verification query failed', err)
    }

    logger.info('Smart scrape completed', {
      total: allJobs.length,
      relevant: relevantJobs.length,
      saved,
      duplicates,
      ownershipFailures,
      avgScore,
      personaId: ownerPersona.id,
      personaJobScoreTotal: verification.personaJobScoreTotal,
      personaJobScoreRecent: verification.personaJobScoreRecent,
      searchSessionId,
    })

    // Save to search history
    addSearchHistory(userId, {
      id: searchSessionId,
      timestamp: new Date().toISOString(),
      config: {
        sources: searchConfig.sources,
        minScore: searchConfig.minScore,
        location,
        keywords: allKeywords,
        experienceLevel: searchConfig.experienceLevel,
      },
      results: {
        totalScraped: allJobs.length,
        totalSaved: saved,
        totalFiltered: filtered,
        duplicates,
        avgScore,
        jobIds: jobsCreated.map(j => j.id),
      },
    })

    res.json({
      success: true,
      message: `חיפוש חכם הושלם: ${saved} משרות רלוונטיות נמצאו`,
      data: {
        searchSessionId,
        totalJobsCreated: saved,
        totalScraped: allJobs.length,
        totalFiltered: filtered,
        duplicates,
        ownershipFailures,
        personaId: ownerPersona.id,
        verification,
        jobsCreated: jobsCreated.slice(0, 30),
        sourceBreakdown: Object.entries(sourceBreakdown).map(([source, count]) => ({
          source,
          scrapedCount: count,
          timestamp: new Date(),
        })),
        // Surface warnings about sources that returned 0 results so the user
        // knows WHY a source is empty (API key missing, blocked, etc.)
        sourceWarnings: [
          ...(!process.env.SERPAPI_KEY ? ['GOOGLE_JOBS: חסר SERPAPI_KEY — מקור זה מושבת. הגדר את המשתנה כדי לאפשר חיפוש ב-Google Jobs.'] : []),
          ...(!(sourceBreakdown['INDEED'] > 0)
            ? ['INDEED: לא התקבלו תוצאות — ייתכן ש-Indeed חוסם בקשות RSS מהשרת.'] : []),
          ...(!(sourceBreakdown['TOP_COMPANIES'] > 0)
            ? ['TOP_COMPANIES: לא נמצאו משרות מחברות מובילות — ייתכן שה-API של Greenhouse/Lever לא הגיב.'] : []),
        ],
        keywords: allKeywords,
        smartKeywords: {
          primary: smartKeywords.primary?.slice(0, 5),
          adjacent: smartKeywords.adjacent?.slice(0, 5),
          hebrew: smartKeywords.hebrew?.slice(0, 5),
        },
        location,
        profileAnalysis: {
          seniorityLevel: profileAnalysis.seniorityLevel,
          experienceYears: profileAnalysis.experienceYears,
          coreSkillsCount: profileAnalysis.coreSkills.length,
          domainsDetected: profileAnalysis.domains,
          skillDepthCount: skillDepth.length,
          stackQueriesUsed: stackQueries.length,
          aiReRankingApplied,
        },
        freeTextSearch: freeTextIntent ? {
          originalQuery: freeTextIntent.originalQuery,
          intentSummary: freeTextIntent.intentSummary,
          keywordsGenerated: freeTextIntent.keywords.length + freeTextIntent.hebrewKeywords.length,
          boosts: freeTextIntent.scoringBoosts,
        } : null,
      },
    })
  } catch (error) {
    logger.error('Smart scrape trigger error:', error)
    res.status(500).json({ success: false, error: 'Smart scrape failed' })
  }
})

// POST /api/scrape/interpret-search - Preview how a free-text query will be interpreted
// Returns the search intent without actually searching (fast, useful for UI preview)
router.post('/interpret-search', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' })
    }

    const { query } = req.body
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'query is required' })
    }

    // Load profile for context-aware interpretation
    let structuredProfile: any = {}
    let rawKnowledge: any = {}
    let preferences: any = {}
    try {
      const profile = await profileService.getProfile(userId)
      structuredProfile = (profile as any).structuredProfile || {}
      rawKnowledge = (profile as any).rawKnowledge || {}
      preferences = (profile as any).preferences || {}
    } catch (err) {
      logger.warn('Could not load profile for search interpretation', err)
    }

    const intent = await interpretFreeTextSearch(query.trim(), structuredProfile, rawKnowledge, preferences)

    res.json({
      success: true,
      data: {
        originalQuery: intent.originalQuery,
        intentSummary: intent.intentSummary,
        keywords: intent.keywords,
        hebrewKeywords: intent.hebrewKeywords,
        scoringBoosts: intent.scoringBoosts,
      },
    })
  } catch (error) {
    logger.error('Search interpretation error:', error)
    res.status(500).json({ success: false, error: 'Failed to interpret search query' })
  }
})

// POST /api/scrape/trigger - Trigger a full scrape across all sources
router.post('/trigger', async (req: Request, res: Response) => {
  try {
    const { keywords = DEFAULT_KEYWORDS, location = 'Israel' } = req.body

    const keywordList = Array.isArray(keywords) ? keywords : [keywords]

    logger.info('Scrape triggered', { keywords: keywordList, location })

    // Search each keyword individually for better job board results
    const allJobs: any[] = []
    const sourceBreakdown: Record<string, number> = {}

    for (const kw of keywordList) {
      try {
        const results = await lightweightScraperService.scrapeAll([kw], location)
        for (const result of results) {
          if (result.jobs && result.jobs.length > 0) {
            allJobs.push(...result.jobs)
            sourceBreakdown[result.source] = (sourceBreakdown[result.source] || 0) + result.jobs.length
          }
        }
      } catch (err) {
        logger.error(`Error scraping keyword "${kw}":`, err)
      }
    }

    // Filter out obviously irrelevant jobs (sales, marketing, etc.)
    const relevantJobs = allJobs.filter(job => isTechRelevant(job.title))
    const filtered = allJobs.length - relevantJobs.length
    if (filtered > 0) {
      logger.info(`Filtered out ${filtered} irrelevant jobs (non-tech titles)`)
    }

    // Try to score jobs if user is authenticated
    const authReq = req as AuthRequest
    let profileAnalysis: any = null
    let preferences: any = {}
    if (authReq.userId) {
      try {
        const profile = await profileService.getProfile(authReq.userId)
        preferences = (profile as any)?.preferences || {}
        const structuredProfile = (profile as any)?.structuredProfile || {}
        const rawKnowledge = (profile as any)?.rawKnowledge || {}
        profileAnalysis = analyzeProfileForScoring(structuredProfile, rawKnowledge, preferences)
      } catch (err) {
        logger.warn('Could not load profile for scoring in trigger route', err)
      }
    }

    // Save jobs to database (with scoring if profile available)
    let saved = 0
    let duplicates = 0
    const jobsCreated: any[] = []

    for (const job of relevantJobs) {
      try {
        // Score if we have a profile
        let score = null
        if (profileAnalysis) {
          score = scoreJobLocally(job, profileAnalysis, preferences)
        }

        const created = await jobService.createJob({
          ...job,
          ...(score ? { smartScore: score.score, scoreCategory: score.category } : {}),
        })
        if (created) {
          saved++
          jobsCreated.push({
            id: created.id,
            title: created.title,
            company: created.company,
            source: created.source,
            ...(score ? { score: score.score, category: score.category } : {}),
          })
        }
      } catch (err: any) {
        if (err?.code === 'P2002' || err?.message?.includes('already exists')) {
          duplicates++
        } else {
          logger.error('Error saving job:', err)
        }
      }
    }

    logger.info('Scrape completed', { total: allJobs.length, saved, duplicates })

    // Return response matching ScrapeTriggerResult type
    res.json({
      success: true,
      message: `Scraping completed: ${saved} new jobs found`,
      data: {
        totalJobsCreated: saved,
        jobsCreated: jobsCreated.slice(0, 20),
        sourceBreakdown: Object.entries(sourceBreakdown).map(([source, count]) => ({
          source,
          scrapedCount: count,
          timestamp: new Date(),
        })),
        keywords: keywordList,
        location,
      },
    })
  } catch (error) {
    logger.error('Scrape trigger error:', error)
    res.status(500).json({ success: false, error: 'Failed to start scraping' })
  }
})

// Source name mapping (route names -> service names)
const SOURCE_MAP: Record<string, string> = {
  indeed: 'INDEED',
  drushim: 'DRUSHIM',
  alljobs: 'ALLJOBS',
  google: 'GOOGLE_JOBS',
  careers: 'COMPANY_CAREER_PAGE',
  topcompanies: 'TOP_COMPANIES',
}

// POST /api/scrape/single - Scrape a single source
router.post('/single', async (req: Request, res: Response) => {
  try {
    const { source, keyword = 'מפתח תוכנה', location = 'Israel' } = req.body

    if (!source) {
      return res.status(400).json({ success: false, error: 'source is required' })
    }

    const validSources = Object.keys(SOURCE_MAP)
    if (!validSources.includes(source)) {
      return res.status(400).json({ success: false, error: `Invalid source. Must be one of: ${validSources.join(', ')}` })
    }

    // Use scrapeSource with proper source name and keywords array
    const result = await lightweightScraperService.scrapeSource(SOURCE_MAP[source], [keyword], location)
    const jobs = result.jobs

    // Save to database
    let saved = 0
    let duplicates = 0
    for (const job of jobs) {
      try {
        await jobService.createJob(job)
        saved++
      } catch (err: any) {
        if (err?.code === 'P2002' || err?.message?.includes('already exists')) {
          duplicates++
        } else {
          logger.error('Error saving job:', err)
        }
      }
    }

    res.json({
      success: true,
      data: {
        source,
        keyword,
        location,
        total: jobs.length,
        saved,
        duplicates,
        jobs: jobs.slice(0, 5),
      },
    })
  } catch (error) {
    logger.error('Single scrape error:', error)
    res.status(500).json({ success: false, error: 'Failed to scrape source' })
  }
})

// GET /api/scrape/status - Get scraping status (matches ScrapeStatus type)
router.get('/status', optionalAuthMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId || null
    const totalJobsInDB = await jobService.countJobs(userId)
    const sourceCounts = await jobService.getSourceCounts(userId)

    const availableSources = ['INDEED', 'DRUSHIM', 'ALLJOBS', 'GOOGLE_JOBS', 'COMPANY_CAREER_PAGE', 'TOP_COMPANIES']

    // Build databaseStats with shape the frontend expects: { SOURCE: { totalJobs, activeJobs } }
    const databaseStats: Record<string, any> = {}
    for (const source of availableSources) {
      databaseStats[source] = {
        totalJobs: sourceCounts[source] || 0,
        activeJobs: sourceCounts[source] || 0,
      }
    }

    // Build sourceStats with shape { SOURCE: { count, timestamp } }
    const sourceStats: Record<string, any> = {}
    for (const [source, count] of Object.entries(sourceCounts)) {
      if (count > 0) {
        sourceStats[source] = { count, timestamp: new Date() }
      }
    }

    res.json({
      success: true,
      data: {
        totalJobsInDB,
        lastScraped: null,
        totalScrapesRun: 0,
        availableSources,
        currentStats: {
          lastScrapeTime: null,
          lastJobCount: 0,
          totalScrapesRun: 0,
          sourceStats,
        },
        databaseStats,
      },
    })
  } catch (error) {
    logger.error('Status error:', error)
    res.status(500).json({ success: false, error: 'Failed to get status' })
  }
})

// GET /api/scrape/sources - List available sources (matches ScrapeSource type)
router.get('/sources', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      sources: [
        {
          id: 'INDEED',
          name: 'Indeed Israel',
          url: 'https://il.indeed.com',
          description: 'Indeed Israel via RSS feed',
          available: true,
        },
        {
          id: 'DRUSHIM',
          name: 'Drushim',
          url: 'https://www.drushim.co.il',
          description: 'Israeli job board via HTML scraping (SSR)',
          available: true,
        },
        {
          id: 'ALLJOBS',
          name: 'AllJobs',
          url: 'https://www.alljobs.co.il',
          description: 'Israeli job board via HTML scraping',
          available: true,
        },
        {
          id: 'GOOGLE_JOBS',
          name: 'Google Jobs',
          url: 'https://serpapi.com',
          description: 'Google Jobs via SerpAPI (requires API key)',
          available: !!process.env.SERPAPI_KEY,
          requiresApiKey: 'SERPAPI_KEY',
        },
        {
          id: 'COMPANY_CAREER_PAGE',
          name: 'Company Career Pages',
          url: 'https://www.google.com',
          description: 'Company career pages via Google search (Greenhouse, Lever, Ashby)',
          available: true,
        },
        {
          id: 'TOP_COMPANIES',
          name: 'Top Israeli Companies',
          url: '/discovery',
          description: `Curated list of ${companyDiscoveryService.getTopCompanies().length}+ top Israeli tech companies — scans Greenhouse, Lever, Ashby APIs directly`,
          available: true,
        },
      ],
    },
  })
})

// GET /api/scrape/test/:source - Test a single source without saving
router.get('/test/:source', async (req: Request, res: Response) => {
  try {
    const { source } = req.params
    const keyword = (req.query.keyword as string) || 'מפתח תוכנה'
    const location = (req.query.location as string) || 'Israel'

    const validSources = Object.keys(SOURCE_MAP)
    if (!validSources.includes(source)) {
      return res.status(400).json({ success: false, error: `Invalid source. Must be one of: ${validSources.join(', ')}` })
    }

    const startTime = Date.now()
    let jobs: any[] = []
    let error: string | null = null

    try {
      const result = await lightweightScraperService.scrapeSource(SOURCE_MAP[source], [keyword], location)
      jobs = result.jobs
    } catch (err: any) {
      error = err.message
    }

    const elapsed = Date.now() - startTime

    res.json({
      success: !error,
      data: {
        source,
        keyword,
        location,
        error,
        elapsed: `${elapsed}ms`,
        count: jobs.length,
        sample: jobs.slice(0, 3),
      },
    })
  } catch (error) {
    logger.error('Test scrape error:', error)
    res.status(500).json({ success: false, error: 'Failed to test source' })
  }
})

// GET /api/scrape/search-history - Get the user's search history
router.get('/search-history', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' })
    }

    const history = getSearchHistory(userId)
    res.json({
      success: true,
      data: history,
    })
  } catch (error) {
    logger.error('Search history error:', error)
    res.status(500).json({ success: false, error: 'Failed to get search history' })
  }
})

export default router
