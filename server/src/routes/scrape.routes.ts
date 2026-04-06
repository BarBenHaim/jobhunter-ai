import { Router, Request, Response } from 'express'
import { lightweightScraperService } from '../services/lightweight-scraper.service'
import { jobService } from '../services/job.service'

const router = Router()

// POST /api/scrape/trigger - Trigger a full scrape across all sources
router.post('/trigger', async (req: Request, res: Response) => {
  try {
    const { keywords = ['software engineer', 'fullstack developer', 'frontend developer', 'backend developer'], location = 'Israel' } = req.body

    if (!Array.isArray(keywords)) {
      return res.status(400).json({ error: 'keywords must be an array' })
    }

    // Start scraping in background
    const scrapePromise = (async () => {
      const allJobs: any[] = []

      for (const keyword of keywords) {
        try {
          const results = await lightweightScraperService.scrapeAll(keyword, location)
          allJobs.push(...results)
        } catch (err) {
          console.error(`Error scraping keyword "${keyword}":`, err)
        }
      }

      // Save jobs to database
      let saved = 0
      let duplicates = 0
      for (const job of allJobs) {
        try {
          await jobService.createJob(job)
          saved++
        } catch (err: any) {
          if (err?.code === 'P2002') {
            duplicates++
          } else {
            console.error('Error saving job:', err)
          }
        }
      }

      return { total: allJobs.length, saved, duplicates }
    })()

    // Return immediately with status
    res.json({
      status: 'started',
      message: `Scraping ${keywords.length} keywords across all sources`,
      keywords,
      location
    })

    // Log results when done
    scrapePromise.then(result => {
      console.log('Scrape completed:', result)
    }).catch(err => {
      console.error('Scrape failed:', err)
    })
  } catch (error) {
    console.error('Scrape trigger error:', error)
    res.status(500).json({ error: 'Failed to start scraping' })
  }
})

// POST /api/scrape/single - Scrape a single source
router.post('/single', async (req: Request, res: Response) => {
  try {
    const { source, keyword = 'software engineer', location = 'Israel' } = req.body

    if (!source) {
      return res.status(400).json({ error: 'source is required' })
    }

    const validSources = ['indeed', 'drushim', 'alljobs', 'google']
    if (!validSources.includes(source)) {
      return res.status(400).json({ error: `Invalid source. Must be one of: ${validSources.join(', ')}` })
    }

    let results: any[] = []

    switch (source) {
      case 'indeed':
        results = await lightweightScraperService.scrapeIndeed(keyword, location)
        break
      case 'drushim':
        results = await lightweightScraperService.scrapeDrushim(keyword)
        break
      case 'alljobs':
        results = await lightweightScraperService.scrapeAllJobs(keyword)
        break
      case 'google':
        results = await lightweightScraperService.scrapeGoogleJobs(keyword, location)
        break
    }

    // Save to database
    let saved = 0
    let duplicates = 0
    for (const job of results) {
      try {
        await jobService.createJob(job)
        saved++
      } catch (err: any) {
        if (err?.code === 'P2002') {
          duplicates++
        } else {
          console.error('Error saving job:', err)
        }
      }
    }

    res.json({
      source,
      keyword,
      location,
      total: results.length,
      saved,
      duplicates,
      jobs: results.slice(0, 5) // Return first 5 as preview
    })
  } catch (error) {
    console.error('Single scrape error:', error)
    res.status(500).json({ error: 'Failed to scrape source' })
  }
})

// GET /api/scrape/status - Get scraping status
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const jobCount = await jobService.countJobs()
    const sources = await jobService.getSourceCounts()

    res.json({
      status: 'idle',
      totalJobs: jobCount,
      sources,
      lastScrape: null
    })
  } catch (error) {
    console.error('Status error:', error)
    res.status(500).json({ error: 'Failed to get status' })
  }
})

// GET /api/scrape/sources - List available sources
router.get('/sources', (_req: Request, res: Response) => {
  res.json({
    sources: [
      {
        id: 'indeed',
        name: 'Indeed Israel',
        url: 'https://il.indeed.com',
        method: 'HTML scraping',
        status: 'active'
      },
      {
        id: 'drushim',
        name: 'Drushim',
        url: 'https://www.drushim.co.il',
        method: 'Public API',
        status: 'active'
      },
      {
        id: 'alljobs',
        name: 'AllJobs',
        url: 'https://www.alljobs.co.il',
        method: 'HTML scraping',
        status: 'active'
      },
      {
        id: 'google',
        name: 'Google Jobs',
        url: 'https://serpapi.com',
        method: 'SerpAPI',
        status: process.env.SERPAPI_KEY ? 'active' : 'inactive (no API key)'
      }
    ]
  })
})

// GET /api/scrape/test/:source - Test a single source without saving
router.get('/test/:source', async (req: Request, res: Response) => {
  try {
    const { source } = req.params
    const keyword = (req.query.keyword as string) || 'software engineer'
    const location = (req.query.location as string) || 'Israel'

    const validSources = ['indeed', 'drushim', 'alljobs', 'google']
    if (!validSources.includes(source)) {
      return res.status(400).json({ error: `Invalid source. Must be one of: ${validSources.join(', ')}` })
    }

    const startTime = Date.now()
    let results: any[] = []
    let error: string | null = null

    try {
      switch (source) {
        case 'indeed':
          results = await lightweightScraperService.scrapeIndeed(keyword, location)
          break
        case 'drushim':
          results = await lightweightScraperService.scrapeDrushim(keyword)
          break
        case 'alljobs':
          results = await lightweightScraperService.scrapeAllJobs(keyword)
          break
        case 'google':
          results = await lightweightScraperService.scrapeGoogleJobs(keyword, location)
          break
      }
    } catch (err: any) {
      error = err.message
    }

    const elapsed = Date.now() - startTime

    res.json({
      source,
      keyword,
      location,
      success: !error,
      error,
      elapsed: `${elapsed}ms`,
      count: results.length,
      sample: results.slice(0, 3)
    })
  } catch (error) {
    console.error('Test scrape error:', error)
    res.status(500).json({ error: 'Failed to test source' })
  }
})

export default router
