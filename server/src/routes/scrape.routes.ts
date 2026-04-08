import { Router, Request, Response } from 'express'
import { lightweightScraperService } from '../services/lightweight-scraper.service'
import { companyDiscoveryService } from '../services/company-discovery.service'
import { jobService } from '../services/job.service'
import { profileService } from '../services/profile.service'
import { smartMatchService, analyzeProfileForScoring, scoreJobLocally } from '../services/smart-match.service'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import logger from '../utils/logger'

const router = Router()

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
  'מכירות', 'sales', 'נציג שירות', 'customer service', 'call center', 'מוקד',
  'שיווק', 'marketing', 'סושיאל', 'social media', 'תוכן', 'content writer',
  'מנהל חשבונות', 'accounting', 'הנהלת חשבונות', 'bookkeep',
  'מזכיר', 'secretary', 'אדמיניסטרציה', 'admin assistant',
  'נהג', 'driver', 'שליח', 'courier', 'משלוח',
  'טכנאי מזגנים', 'אינסטלטור', 'plumber', 'חשמלאי', 'electrician',
  'עוזר בית', 'מטפל', 'caregiver', 'סיעוד',
  'קופאי', 'cashier', 'מלצר', 'waiter', 'ברמן', 'bartender',
  'אבטחה', 'security guard', 'שומר', 'guard',
  'עורך דין', 'lawyer', 'attorney',
  'מנקה', 'cleaning', 'ניקיון',
  'פיננסי', 'financial advisor',
  'ביטוח', 'insurance agent',
]

/** Check if a job title looks tech-relevant. Returns false for obvious non-tech jobs. */
function isTechRelevant(title: string): boolean {
  if (!title) return false
  const lower = title.toLowerCase()
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

    logger.info('Smart scrape triggered', { userId })

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
        preferences
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

    // IMPORTANT: Each scrapeAll call costs 2 SerpAPI credits (Indeed + Google Jobs).
    // To avoid burning through credits, we batch keywords into a few combined queries
    // instead of running 12 separate scrapeAll calls (which would cost 24 credits!).
    const allKeywords = keywordsToUse.slice(0, 15)
    const location = preferences?.preferredLocations?.[0] || req.body.location || 'Israel'

    // Group keywords into max 3 batches (= max 6 SerpAPI calls instead of 24+)
    const BATCH_SIZE = 3
    const keywordBatches: string[][] = []
    for (let i = 0; i < allKeywords.length; i += Math.ceil(allKeywords.length / BATCH_SIZE)) {
      const batch = allKeywords.slice(i, i + Math.ceil(allKeywords.length / BATCH_SIZE))
      keywordBatches.push(batch)
    }

    logger.info('Smart scraping with batched keywords', {
      totalKeywords: allKeywords.length,
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
        const results = await lightweightScraperService.scrapeAll(batch, location)
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
    const relevantJobs = allJobs.filter(job => isTechRelevant(job.title))
    const filtered = allJobs.length - relevantJobs.length
    if (filtered > 0) {
      logger.info(`Filtered out ${filtered} irrelevant jobs`)
    }

    // Step 6: Analyze profile for local scoring (one-time)
    const profileAnalysis = analyzeProfileForScoring(structuredProfile, rawKnowledge, preferences)

    // Step 7: Save jobs and score them locally
    let saved = 0
    let duplicates = 0
    const jobsCreated: any[] = []
    const scoredJobs: any[] = []

    for (const job of relevantJobs) {
      try {
        const created = await jobService.createJob(job)
        if (created) {
          saved++

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

          // Store smart score in job metadata
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

    logger.info('Smart scrape completed', {
      total: allJobs.length,
      relevant: relevantJobs.length,
      saved,
      duplicates,
      avgScore: jobsCreated.length > 0
        ? Math.round(jobsCreated.reduce((sum, j) => sum + (j.smartScore || 0), 0) / jobsCreated.length)
        : 0,
    })

    res.json({
      success: true,
      message: `חיפוש חכם הושלם: ${saved} משרות רלוונטיות נמצאו`,
      data: {
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
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const totalJobsInDB = await jobService.countJobs()
    const sourceCounts = await jobService.getSourceCounts()

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

export default router
