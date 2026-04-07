import { Router, Request, Response } from 'express';
import { body, query, validationResult } from 'express-validator';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { companyDiscoveryService } from '../services/company-discovery.service';
import { jobService } from '../services/job.service';
import logger from '../utils/logger';

const router = Router();

router.use(authMiddleware);

// GET /api/discovery/companies - Get curated list of top companies
router.get(
  '/companies',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const companies = companyDiscoveryService.getTopCompanies();
    const category = req.query.category as string | undefined;

    let filtered = companies;
    if (category) {
      filtered = companies.filter(c => c.category === category);
    }

    res.json({
      success: true,
      data: filtered.map(c => ({
        name: c.name,
        slug: c.slug,
        category: c.category,
        description: c.description,
        atsProvider: c.atsProvider,
        careersUrl: c.careersUrl,
      })),
      meta: {
        total: filtered.length,
        categories: {
          unicorn: companies.filter(c => c.category === 'unicorn').length,
          top_company: companies.filter(c => c.category === 'top_company').length,
          growing: companies.filter(c => c.category === 'growing').length,
        },
      },
    });
  })
);

// POST /api/discovery/scan-careers - Scan top company career pages for jobs
router.post(
  '/scan-careers',
  [
    body('keywords').optional().isArray(),
    body('categories').optional().isArray(),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', details: errors.array() } });
      return;
    }

    const { keywords = [], categories } = req.body;

    logger.info('Career scan triggered', { keywords, categories });

    const results = await companyDiscoveryService.scanTopCompanyCareers(keywords, categories);

    // Save discovered jobs to DB
    let saved = 0;
    let duplicates = 0;
    for (const result of results) {
      for (const job of result.jobs) {
        try {
          await jobService.createJob({
            ...job,
            locationType: job.locationType?.toLowerCase() || 'hybrid',
          });
          saved++;
        } catch (err: any) {
          if (err?.code === 'P2002' || err?.message?.includes('already exists')) {
            duplicates++;
          } else {
            logger.warn('Error saving discovered job:', err);
          }
        }
      }
    }

    const companiesWithJobs = results.filter(r => r.jobs.length > 0);
    const totalJobs = results.reduce((sum, r) => sum + r.jobs.length, 0);

    res.json({
      success: true,
      data: {
        companiesScanned: results.length,
        companiesWithJobs: companiesWithJobs.length,
        totalJobsFound: totalJobs,
        newJobsSaved: saved,
        duplicatesSkipped: duplicates,
        results: companiesWithJobs.map(r => ({
          company: r.company,
          jobCount: r.jobs.length,
          jobs: r.jobs.slice(0, 5).map(j => ({
            title: j.title,
            location: j.location,
            department: j.department,
            sourceUrl: j.sourceUrl,
          })),
        })),
      },
    });
  })
);

// POST /api/discovery/funded-startups - Discover recently funded startups
router.post(
  '/funded-startups',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    logger.info('Funded startups discovery triggered');

    const startups = await companyDiscoveryService.discoverRecentlyFundedStartups();

    res.json({
      success: true,
      data: {
        count: startups.length,
        startups,
      },
    });
  })
);

// POST /api/discovery/full-scan - Run complete discovery (funding + career scan)
router.post(
  '/full-scan',
  [
    body('keywords').optional().isArray(),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { keywords = [] } = req.body;

    logger.info('Full discovery scan triggered', { keywords });

    const discovery = await companyDiscoveryService.discoverAndScan(keywords);

    // Save all discovered jobs
    let saved = 0;
    let duplicates = 0;
    for (const result of discovery.topCompanyJobs) {
      for (const job of result.jobs) {
        try {
          await jobService.createJob({
            ...job,
            locationType: job.locationType?.toLowerCase() || 'hybrid',
          });
          saved++;
        } catch (err: any) {
          if (err?.code === 'P2002' || err?.message?.includes('already exists')) {
            duplicates++;
          }
        }
      }
    }

    res.json({
      success: true,
      data: {
        fundedStartups: {
          count: discovery.fundedStartups.length,
          startups: discovery.fundedStartups,
        },
        careerScan: {
          companiesWithJobs: discovery.topCompanyJobs.length,
          totalJobsFound: discovery.totalJobs,
          newJobsSaved: saved,
          duplicatesSkipped: duplicates,
          results: discovery.topCompanyJobs.map(r => ({
            company: r.company,
            jobCount: r.jobs.length,
            sampleJobs: r.jobs.slice(0, 3).map(j => ({ title: j.title, location: j.location })),
          })),
        },
      },
    });
  })
);

// POST /api/discovery/scan-company/:slug - Scan a single company's career page
router.post(
  '/scan-company/:slug',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { slug } = req.params;
    const companies = companyDiscoveryService.getTopCompanies();
    const company = companies.find(c => c.slug === slug);

    if (!company) {
      res.status(404).json({ success: false, error: 'Company not found in curated list' });
      return;
    }

    let jobs: any[] = [];
    switch (company.atsProvider) {
      case 'greenhouse': {
        const boardSlug = company.careersUrl.replace('https://boards.greenhouse.io/', '');
        jobs = await companyDiscoveryService.scrapeGreenhouseJobs(boardSlug, company.name);
        break;
      }
      case 'lever': {
        const leverSlug = company.careersUrl.replace('https://jobs.lever.co/', '');
        jobs = await companyDiscoveryService.scrapeLeverJobs(leverSlug, company.name);
        break;
      }
      case 'ashby': {
        const ashbySlug = company.careersUrl.replace('https://jobs.ashbyhq.com/', '');
        jobs = await companyDiscoveryService.scrapeAshbyJobs(ashbySlug, company.name);
        break;
      }
      default:
        res.json({
          success: true,
          data: {
            company: company.name,
            careersUrl: company.careersUrl,
            atsProvider: company.atsProvider,
            message: 'This company uses a custom career page. Visit the URL directly.',
            jobs: [],
          },
        });
        return;
    }

    // Save jobs
    let saved = 0;
    for (const job of jobs) {
      try {
        await jobService.createJob({ ...job, locationType: job.locationType?.toLowerCase() || 'hybrid' });
        saved++;
      } catch (_err) {
        // duplicate or error
      }
    }

    res.json({
      success: true,
      data: {
        company: company.name,
        atsProvider: company.atsProvider,
        totalJobs: jobs.length,
        newJobsSaved: saved,
        jobs: jobs.map(j => ({
          title: j.title,
          location: j.location,
          department: j.department,
          sourceUrl: j.sourceUrl,
        })),
      },
    });
  })
);

export default router;
