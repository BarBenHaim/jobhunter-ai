import { Router, Request, Response } from 'express'
import { lightweightScraperService } from '../services/lightweight-scraper.service'
import { companyDiscoveryService } from '../services/company-discovery.service'
import { jobService } from '../services/job.service'
import { profileService } from '../services/profile.service'
import { personaService } from '../services/persona.service'
import { smartMatchService, analyzeProfileForScoring, scoreJobLocally } from '../services/smart-match.service'
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

    // Step 3: Use combined keywords for scraping (these are optimized for job boards)
    const keywordsToUse = smartKeywords.combined?.length > 0
      ? smartKeywords.combined
      : DEFAULT_KEYWORDS

    // If user supplied custom keywords, prefer those; otherwise use smart + profile keywords
    const finalKeywords = searchConfig.keywords?.length
      ? searchConfig.keywords
      : keywordsToUse

    // OPTIMIZATION: Deduplicate keywords before batching
    // Smart keywords often overlap (e.g. "React Developer" and "React" are redundant when joined)
    const rawKeywords = finalKeywords.slice(0, 15)
    const seenLower = new Set<string>()
    const allKeywords = rawKeywords.filter(kw => {
      const lower = kw.toLowerCase().trim()
      if (!lower || seenLower.has(lower)) return false
      seenLower.add(lower)
      return true
    })

    const location = searchConfig.location || preferences?.preferredLocations?.[0] || 'Israel'

    // OPTIMIZATION: Reduced from 3 batches to 2 — each batch joins keywords into one query,
    // so fewer batches = fewer SerpAPI calls. With career pages now using 1 call instead of 3,
    // each batch costs 2 SerpAPI calls (Google Jobs + Career Pages).
    const BATCH_SIZE = 2
    const keywordBatches: string[][] = []
    for (let i = 0; i < allKeywords.length; i += Math.ceil(allKeywords.length / BATCH_SIZE)) {
      const batch = allKeywords.slice(i, i + Math.ceil(allKeywords.length / BATCH_SIZE))
      keywordBatches.push(batch)
    }

    logger.info('Smart scraping with batched keywords', {
      totalKeywords: allKeywords.length,
      deduplicated: rawKeywords.length - allKeywords.length,
      batches: keywordBatches.length,
      estimatedSerpApiCalls: keywordBatches.length * 2,
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
    // table back to the user — `listJobs` then filters on
    // `scores.some.persona.userId`. Resolve the owning persona up front so we
    // don't hit the DB once per job.
    const ownerPersona = await personaService.getOrCreateDefaultPersona(userId)
    logger.info('Smart scrape owner persona', { userId, personaId: ownerPersona.id })

    let saved = 0
    let duplicates = 0
    const jobsCreated: any[] = []
    const scoredJobs: any[] = []

    const minScoreThreshold = searchConfig.minScore || 0

    // Helper: attach a JobScore row to the owner persona for this job.
    // Required so downstream `listJobs` picks up the job under this user.
    const attachOwnership = async (
      jobId: string,
      smartScore: { score: number; skillMatch?: number; experienceMatch?: number; matchedSkills?: string[]; missingSkills?: string[]; redFlags?: string[]; reasoning?: string }
    ) => {
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
      } catch (err) {
        logger.warn('Could not upsert JobScore for smart-trigger', { jobId, personaId: ownerPersona.id })
      }
    }

    for (const job of relevantJobs) {
      try {
        const created = await jobService.createJob(job)
        if (created) {
          // Score locally — instant, no API call
          const smartScore = scoreJobLocally(
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

          // Attach the JobScore FIRST, before any early-return paths, so even
          // jobs skipped by the min-score filter still belong to this user.
          await attachOwnership(created.id, smartScore as any)

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

    // Sort created jobs by smart score
    jobsCreated.sort((a, b) => (b.smartScore || 0) - (a.smartScore || 0))

    const avgScore = jobsCreated.length > 0
      ? Math.round(jobsCreated.reduce((sum, j) => sum + (j.smartScore || 0), 0) / jobsCreated.length)
      : 0

    logger.info('Smart scrape completed', {
      total: allJobs.length,
      relevant: relevantJobs.length,
      saved,
      duplicates,
      avgScore,
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
        jobsCreated: jobsCreated.slice(0, 30),
        sourceBreakdown: Object.entries(sourceBreakdown).map(([source, count]) => ({
          source,
          scrapedCount: count,
          timestamp: new Date(),
        })),
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
        },
      },
    })
  } catch (error) {
    logger.error('Smart scrape trigger error:', error)
    res.status(500).json({ success: false, error: 'Smart scrape failed' })
  }
})

// POST /api/scrape/trigger - Trigger a full scrape across all sources
router.post('/trigger', async (req: Request, res: Response) => {
  try {
    const { keywords = DEFAULT_KEYWORDS, location = 'Israel' } = req.body

    const keywordList = Array.isArray(keywords) ? keywords : [keywords]

    logger.info('Scrape triggered', { keywords: keywordList, location })

    // Batch keywords into max 3 scrapeAll calls to save SerpAPI credits
    // Each scrapeAll costs 2 SerpAPI calls (Indeed + Google Jobs)
    const allJobs: any[] = []
    const sourceBreakdown: Record<string, number> = {}
    const BATCH_SIZE = 3
    const batches: string[][] = []
    for (let i = 0; i < keywordList.length; i += Math.ceil(keywordList.length / BATCH_SIZE)) {
      batches.push(keywordList.slice(i, i + Math.ceil(keywordList.length / BATCH_SIZE)))
    }

    for (const batch of batches) {
      try {
        const results = await lightweightScraperService.scrapeAll(batch, location)
        for (const result of results) {
          if (result.jobs && result.jobs.length > 0) {
            allJobs.push(...result.jobs)
            sourceBreakdown[result.source] = (sourceBreakdown[result.source] || 0) + result.jobs.length
          }
        }
      } catch (err) {
        logger.error(`Error scraping batch [${batch.join(', ')}]:`, err)
      }
    }

    // Filter out obviously irrelevant jobs (sales, marketing, etc.)
    const relevantJobs = allJobs.filter(job => isTechRelevant(job.title))
    const filtered = allJobs.length - relevantJobs.length
    if (filtered > 0) {
      logger.info(`Filtered out ${filtered} irrelevant jobs (non-tech titles)`)
    }

    // Save jobs to database
    let saved = 0
    let duplicates = 0
    const jobsCreated: any[] = []

    for (const job of relevantJobs) {
      try {
        const created = await jobService.createJob(job)
        if (created) {
          saved++
          jobsCreated.push({
            id: created.id,
            title: created.title,
            company: created.company,
            source: created.source,
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
