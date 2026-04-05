/**
 * Scraper Framework - Usage Examples
 * Complete examples demonstrating how to use the job scraper framework
 */

import {
  getScraperManager,
  JobSource,
  ScraperQuery,
  CompanyPageScraper,
} from './index';

/**
 * Example 1: Run a single scraper
 */
export async function example_runSingleScraper() {
  console.log('\n=== Example 1: Run Single Scraper ===\n');

  const manager = await getScraperManager();

  const query: ScraperQuery = {
    keywords: ['Backend Engineer', 'TypeScript'],
    location: 'Tel Aviv',
    maxResults: 25,
  };

  try {
    const jobs = await manager.runScraper(JobSource.INDEED, query);
    console.log(`Found ${jobs.length} jobs on Indeed`);
    jobs.slice(0, 3).forEach((job) => {
      console.log(`- ${job.title} at ${job.company}`);
    });
  } catch (error) {
    console.error('Error:', error);
  }
}

/**
 * Example 2: Run multiple scrapers in parallel
 */
export async function example_runMultipleScrapers() {
  console.log('\n=== Example 2: Run Multiple Scrapers ===\n');

  const manager = await getScraperManager();

  const query: ScraperQuery = {
    keywords: ['Frontend Engineer'],
    location: 'Israel',
    remote: true,
    maxResults: 30,
  };

  try {
    const sources = [
      JobSource.LINKEDIN,
      JobSource.INDEED,
      JobSource.ALLJOBS,
      JobSource.DRUSHIM,
    ];

    const jobs = await manager.runScrapers(sources, query);
    console.log(`Found ${jobs.length} total jobs across ${sources.length} sources`);

    // Group by source
    const bySource = new Map<string, number>();
    jobs.forEach((job) => {
      bySource.set(job.source, (bySource.get(job.source) || 0) + 1);
    });

    console.log('\nBreakdown by source:');
    bySource.forEach((count, source) => {
      console.log(`  ${source}: ${count} jobs`);
    });
  } catch (error) {
    console.error('Error:', error);
  }
}

/**
 * Example 3: Schedule scrapers with cron expressions
 */
export async function example_scheduleScrapers() {
  console.log('\n=== Example 3: Schedule Scrapers ===\n');

  const manager = await getScraperManager();

  // Schedule scrapers with different frequencies
  manager.scheduleScrapers([
    {
      source: JobSource.LINKEDIN,
      cronExpression: '0 9 * * *', // Daily at 9 AM
    },
    {
      source: JobSource.INDEED,
      cronExpression: '0 10 * * *', // Daily at 10 AM
    },
    {
      source: JobSource.ALLJOBS,
      cronExpression: '0 */6 * * *', // Every 6 hours
    },
    {
      source: JobSource.GOOGLE_JOBS,
      cronExpression: '0 */4 * * *', // Every 4 hours
    },
  ]);

  // Start the scheduler
  manager.startScheduler();
  console.log('Scheduler started. View scheduled tasks:');

  const tasks = manager.getScheduledTasks();
  tasks.forEach((task) => {
    console.log(`  ${task.source}: ${task.cronExpression} (next run: ${task.nextRun})`);
  });

  // Keep running for demonstration
  console.log('\nScheduler will run in the background...');
  console.log('Press Ctrl+C to stop.');
  // In real app, would run indefinitely
  // setTimeout(() => manager.stopScheduler(), 60000);
}

/**
 * Example 4: Monitor scraper health
 */
export async function example_monitorHealth() {
  console.log('\n=== Example 4: Monitor Scraper Health ===\n');

  const manager = await getScraperManager();

  // Get health status
  const health = await manager.getHealthStatus();

  console.log('Scraper Health Status:');
  for (const [source, status] of Object.entries(health.scrapers)) {
    const indicator = (status as any).healthy ? '✓' : '✗';
    console.log(`  ${indicator} ${source}`);
    if (!(status as any).healthy) {
      console.log(`    Message: ${(status as any).message}`);
    }
    if ((status as any).circuitBreakerOpen) {
      console.log(`    Circuit breaker OPEN (failures: ${(status as any).failureCount})`);
    }
  }

  // Get statistics
  const stats = await manager.getStatistics();
  console.log('\nScraper Statistics:');
  for (const [source, stat] of Object.entries(stats.scrapers)) {
    const s = stat as any;
    console.log(`  ${source}:`);
    console.log(`    Total jobs: ${s.totalJobsScrapped}`);
    console.log(`    Success rate: ${s.successRate.toFixed(2)}%`);
    console.log(`    Avg response: ${s.averageResponseTime.toFixed(0)}ms`);
  }
}

/**
 * Example 5: Register custom company career pages
 */
export async function example_customCompanyPages() {
  console.log('\n=== Example 5: Custom Company Career Pages ===\n');

  const manager = await getScraperManager();
  const scraper = manager['scrapers'].get(JobSource.COMPANY_CAREER_PAGE);

  if (scraper instanceof CompanyPageScraper) {
    // Register company career pages
    scraper.registerCompanies([
      {
        name: 'Wix',
        url: 'https://www.wix.com/en/jobs',
        selectors: {
          jobContainer: '.job-card',
          title: 'h3.job-title',
          location: '.job-location',
          description: '.job-description',
        },
        atsType: 'generic',
        enabled: true,
      },
      {
        name: 'JFrog',
        url: 'https://jfrog.com/careers/',
        selectors: {
          jobContainer: '[data-job-id]',
          title: '.job-title',
          location: '.job-location',
          description: '.job-desc',
        },
        atsType: 'greenhouse',
        enabled: true,
      },
      {
        name: 'SailPoint',
        url: 'https://www.sailpoint.com/careers/',
        selectors: {}, // Auto-detect ATS
        enabled: true,
      },
    ]);

    // Scrape company pages
    const query: ScraperQuery = {
      keywords: ['Engineer'],
      maxResults: 50,
    };

    const jobs = await manager.runScraper(JobSource.COMPANY_CAREER_PAGE, query);
    console.log(`Found ${jobs.length} jobs from company career pages`);
  }
}

/**
 * Example 6: Advanced query with filters
 */
export async function example_advancedQuery() {
  console.log('\n=== Example 6: Advanced Query with Filters ===\n');

  const manager = await getScraperManager();

  // Detailed job search
  const query: ScraperQuery = {
    keywords: ['Software Engineer', 'Senior Developer', 'Tech Lead'],
    location: 'Tel Aviv',
    remote: false, // Must be in-office
    experienceLevel: 'senior',
    maxResults: 40,
    customFilters: {
      minSalary: 500000, // Israeli Shekels
      companySize: ['large', 'medium'],
      industryFocus: ['Technology', 'Finance'],
    },
  };

  try {
    // Run scrapers that support these filters
    const jobs = await manager.runScrapers([JobSource.LINKEDIN, JobSource.INDEED], query);

    // Filter results
    const qualifiedJobs = jobs.filter((job) => {
      return (
        job.experienceLevel === 'senior' &&
        job.locationType !== 'remote' &&
        job.location?.includes('Tel Aviv')
      );
    });

    console.log(`Query: ${query.keywords.join(', ')}`);
    console.log(`Location: ${query.location}`);
    console.log(`Experience: ${query.experienceLevel}`);
    console.log(`Results: ${qualifiedJobs.length} jobs`);

    // Show top 5
    console.log('\nTop results:');
    qualifiedJobs.slice(0, 5).forEach((job, i) => {
      console.log(`${i + 1}. ${job.title}`);
      console.log(`   ${job.company} | ${job.location}`);
      if (job.salary) {
        console.log(`   Salary: ${job.salary.raw}`);
      }
    });
  } catch (error) {
    console.error('Error:', error);
  }
}

/**
 * Example 7: Error handling and retry logic
 */
export async function example_errorHandling() {
  console.log('\n=== Example 7: Error Handling ===\n');

  const manager = await getScraperManager();

  const query: ScraperQuery = {
    keywords: ['DevOps Engineer'],
    maxResults: 20,
  };

  // Try each scraper with error handling
  const results = new Map<JobSource, any>();

  for (const source of [JobSource.LINKEDIN, JobSource.INDEED, JobSource.ALLJOBS]) {
    try {
      console.log(`\nScraping ${source}...`);

      // Check health first
      const health = await manager.getHealthStatus();
      const scraperHealth = health.scrapers[source];

      if (!scraperHealth.healthy) {
        console.log(`⚠️  ${source} is unhealthy: ${scraperHealth.message}`);
        if (scraperHealth.circuitBreakerOpen) {
          console.log(`Circuit breaker is open. Skipping this scraper.`);
          continue;
        }
      }

      // Run scraper with timeout
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Scraper timeout')), 120000)
      );

      const jobs = (await Promise.race([
        manager.runScraper(source, query),
        timeoutPromise,
      ])) as any[];

      results.set(source, {
        status: 'success',
        count: jobs.length,
      });

      console.log(`✓ ${source}: ${jobs.length} jobs`);
    } catch (error) {
      results.set(source, {
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      });

      console.log(`✗ ${source}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Summary
  console.log('\n\nSummary:');
  let successful = 0;
  let failed = 0;
  results.forEach((result) => {
    if (result.status === 'success') {
      successful++;
      console.log(`  ✓ ${result.count} jobs`);
    } else {
      failed++;
      console.log(`  ✗ ${result.error}`);
    }
  });
  console.log(`\nTotal: ${successful} successful, ${failed} failed`);
}

/**
 * Example 8: Production-ready setup
 */
export async function example_productionSetup() {
  console.log('\n=== Example 8: Production-Ready Setup ===\n');

  const manager = await getScraperManager();

  // 1. Configure schedules
  console.log('1. Setting up scraper schedules...');
  manager.scheduleScrapers([
    { source: JobSource.LINKEDIN, cronExpression: '0 8,14,20 * * *' }, // 3x daily
    { source: JobSource.INDEED, cronExpression: '0 */6 * * *' }, // Every 6 hours
    { source: JobSource.ALLJOBS, cronExpression: '0 */6 * * *' }, // Every 6 hours
    { source: JobSource.DRUSHIM, cronExpression: '0 */8 * * *' }, // Every 8 hours
    { source: JobSource.GOOGLE_JOBS, cronExpression: '0 */4 * * *' }, // Every 4 hours
    { source: JobSource.WELLFOUND, cronExpression: '0 */12 * * *' }, // Twice daily
  ]);

  // 2. Health monitoring
  console.log('\n2. Setting up health monitoring...');
  setInterval(async () => {
    const health = await manager.getHealthStatus();
    const unhealthy = Object.entries(health.scrapers).filter((entry) => !(entry[1] as any).healthy);

    if (unhealthy.length > 0) {
      console.log(`⚠️  Health alert: ${unhealthy.length} scraper(s) unhealthy`);
      unhealthy.forEach(([source, status]) => {
        console.log(`   ${source}: ${(status as any).message}`);
      });
      // Send alert email/slack
    }
  }, 300000); // Check every 5 minutes

  // 3. Start scheduler
  console.log('\n3. Starting scheduler...');
  manager.startScheduler();

  // 4. Initial population
  console.log('\n4. Running initial scrape...');
  const initialQuery: ScraperQuery = {
    keywords: ['Software Engineer', 'Product Manager', 'Data Scientist'],
    maxResults: 50,
  };

  const initialJobs = await manager.runAllScrapers(initialQuery);
  console.log(`✓ Initial scrape: ${initialJobs.length} jobs loaded`);

  // 5. Periodic statistics reporting
  console.log('\n5. Setting up statistics reporting...');
  setInterval(() => {
    const stats = manager.getStatistics();
    console.log('\n--- Hourly Statistics ---');
    Object.entries(stats.scrapers).forEach(([source, stat]) => {
      const s = stat as any;
      console.log(`${source}: ${s.totalJobsScrapped} jobs, ${s.successRate.toFixed(1)}% success`);
    });
  }, 3600000); // Every hour

  console.log('\n✓ Production setup complete!');
  console.log('  - Scheduler running');
  console.log('  - Health monitoring active');
  console.log('  - Statistics tracking enabled');
}

/**
 * Run examples
 */
async function runExamples() {
  console.log('JobHunter AI Scraper Framework - Examples\n');

  try {
    // Uncomment the examples you want to run:

    // await example_runSingleScraper();
    // await example_runMultipleScrapers();
    // await example_scheduleScrapers();
    // await example_monitorHealth();
    // await example_customCompanyPages();
    // await example_advancedQuery();
    // await example_errorHandling();
    // await example_productionSetup();

    console.log('\n\nDone! Modify EXAMPLES.ts to run specific examples.');
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Uncomment to run examples
// runExamples().catch(console.error);

export { runExamples };
