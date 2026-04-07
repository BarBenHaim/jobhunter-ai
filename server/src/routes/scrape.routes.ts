import { Router, Request, Response } from 'express'
import { lightweightScraperService } from '../services/lightweight-scraper.service'
import { jobService } from '../services/job.service'
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
  'מפתח תוכנה',
  'פיתוח',
]

// POST /api/scrape/trigger - Trigger a full scrape across all sources
router.post('/trigger', async (req: Request, res: Response) => {
  try {
    const { keywords = DEFAULT_KEYWORDS, location = 'Israel' } = req.body

    const keywordList = Array.isArray(keywords) ? keywords : [keywords]

    logger.info('Scrape triggered', { keywords: keywordList, location })

    // Scrape each keyword separately across all sources (each scraper joins keywords)
    const allJobs: any[] = []
    const sourceBreakdown: Record<string, number> = {}

    for (const keyword of keywordList) {
      try {
        const results = await lightweightScraperService.scrapeAll([keyword], location)
        for (const result of results) {
          if (result.jobs && result.jobs.length > 0) {
            allJobs.push(...result.jobs)
            sourceBreakdown[result.source] = (sourceBreakdown[result.source] || 0) + result.jobs.length
          }
        }
      } catch (err) {
        logger.error(`Error scraping keyword "${keyword}":`, err)
      }
    }

    // Save jobs to database
    let saved = 0
    let duplicates = 0
    const jobsCreated: any[] = []

    for (const job of allJobs) {
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

    const availableSources = ['INDEED', 'DRUSHIM', 'ALLJOBS', 'GOOGLE_JOBS']

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
          description: 'Indeed Israel (limited - site requires JavaScript rendering)',
          available: false,
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
