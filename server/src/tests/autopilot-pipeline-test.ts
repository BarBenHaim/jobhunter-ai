/**
 * AutoPilot Pipeline E2E Test
 *
 * Tests the full pipeline: keyword generation → scraping → filtering → scoring
 * with demo profiles at different seniority levels.
 *
 * Run: npx ts-node --project tsconfig.json src/tests/autopilot-pipeline-test.ts
 */

import { analyzeProfileForScoring, scoreJobLocally, buildSkillDepthProfile, generateStackSearchQueries, interpretFreeTextSearch, applyFreeTextBoosts } from '../services/smart-match.service';
import { lightweightScraperService } from '../services/lightweight-scraper.service';

// ═══════════════════════════════════════════════════════════
// DEMO PROFILES — representing real candidates
// ═══════════════════════════════════════════════════════════

const PROFILES = {
  // Profile 1: Junior Fullstack Developer (2 years experience)
  juniorFullstack: {
    structuredProfile: {
      skills: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'HTML', 'CSS', 'Git', 'MongoDB'],
      inferredSkills: ['Express', 'REST API', 'Agile'],
      experiences: [
        {
          title: 'Junior Full Stack Developer',
          company: 'Startup XYZ',
          description: 'Building web applications using React and Node.js. Working with MongoDB and REST APIs.',
          startDate: '2024-01',
          endDate: null,
          duration: '14 months',
        },
        {
          title: 'Intern - Web Developer',
          company: 'Tech Corp',
          description: 'Frontend development with React, CSS, responsive design.',
          startDate: '2023-06',
          endDate: '2023-12',
          duration: '6 months',
        },
      ],
      education: [
        { degree: 'B.Sc. Computer Science', institution: 'Tel Aviv University' },
      ],
      projects: [
        { name: 'E-commerce Platform', technologies: ['React', 'Node.js', 'MongoDB', 'Stripe'] },
      ],
      languages: ['JavaScript', 'TypeScript', 'Python'],
      summary: 'Junior Full Stack developer with 2 years experience in React and Node.js',
    },
    rawKnowledge: {
      content: 'Full Stack Developer with experience in JavaScript, TypeScript, React, Node.js, Express, MongoDB. Built REST APIs, responsive web apps. Familiar with Git, Docker basics, AWS basics. B.Sc Computer Science from Tel Aviv University.',
    },
    preferences: {
      targetRoles: ['Full Stack Developer', 'Frontend Developer', 'מפתח פולסטאק'],
      preferredLocations: ['Tel Aviv', 'תל אביב', 'Ramat Gan', 'רמת גן'],
      preferredWorkType: 'hybrid',
    },
  },

  // Profile 2: Mid-level Backend Developer (4 years)
  midBackend: {
    structuredProfile: {
      skills: ['Python', 'Node.js', 'PostgreSQL', 'Docker', 'AWS', 'Redis', 'TypeScript', 'Git', 'Linux'],
      inferredSkills: ['Microservices', 'CI/CD', 'REST API', 'GraphQL', 'Kubernetes'],
      experiences: [
        {
          title: 'Backend Developer',
          company: 'Fintech Solutions Ltd',
          description: 'Developed microservices architecture using Python and Node.js. Managed PostgreSQL databases, implemented CI/CD with GitHub Actions, deployed on AWS.',
          startDate: '2022-03',
          endDate: null,
          duration: '24 months',
        },
        {
          title: 'Software Developer',
          company: 'Web Agency',
          description: 'Full stack development with Python Django and React. Database design with PostgreSQL.',
          startDate: '2020-06',
          endDate: '2022-02',
          duration: '20 months',
        },
      ],
      education: [
        { degree: 'B.Sc. Software Engineering', institution: 'Technion' },
      ],
      projects: [
        { name: 'Payment Processing System', technologies: ['Python', 'PostgreSQL', 'Redis', 'Docker', 'AWS'] },
      ],
      languages: ['Python', 'TypeScript', 'JavaScript', 'SQL', 'Go'],
      summary: 'Backend developer specializing in Python and cloud infrastructure with 4 years experience',
    },
    rawKnowledge: {
      content: 'Backend Developer with 4 years of experience. Expert in Python, Node.js, PostgreSQL, Redis. Strong in Docker, Kubernetes, AWS (EC2, S3, Lambda, RDS). Experience with microservices, CI/CD, GitHub Actions. Built high-throughput payment processing systems. B.Sc Software Engineering from Technion.',
    },
    preferences: {
      targetRoles: ['Backend Developer', 'Software Engineer', 'מפתח בקנד'],
      preferredLocations: ['Tel Aviv', 'Herzliya', 'הרצליה'],
      preferredWorkType: 'remote',
    },
  },

  // Profile 3: Empty/new profile — no CV uploaded yet
  empty: {
    structuredProfile: {},
    rawKnowledge: {},
    preferences: {
      targetRoles: ['Software Developer'],
      preferredLocations: ['Israel'],
    },
  },
};

// ═══════════════════════════════════════════════════════════
// TEST: Profile Analysis
// ═══════════════════════════════════════════════════════════

function testProfileAnalysis() {
  console.log('\n' + '═'.repeat(70));
  console.log('TEST 1: PROFILE ANALYSIS');
  console.log('═'.repeat(70));

  for (const [name, profile] of Object.entries(PROFILES)) {
    const analysis = analyzeProfileForScoring(
      profile.structuredProfile,
      profile.rawKnowledge,
      profile.preferences
    );

    console.log(`\n📋 Profile: ${name}`);
    console.log(`   Core Skills (${analysis.coreSkills.length}): ${analysis.coreSkills.join(', ') || '(empty)'}`);
    console.log(`   Inferred (${analysis.inferredSkills.length}): ${analysis.inferredSkills.join(', ') || '(empty)'}`);
    console.log(`   Tech Stack (${analysis.techStack.length}): ${analysis.techStack.join(', ') || '(empty)'}`);
    console.log(`   Languages (${analysis.languages.length}): ${analysis.languages.join(', ') || '(empty)'}`);
    console.log(`   Experience: ${analysis.experienceYears} years`);
    console.log(`   Seniority: ${analysis.seniorityLevel}`);
    console.log(`   Domains: ${analysis.domains.join(', ') || '(none)'}`);
    console.log(`   Previous Roles: ${analysis.previousRoles.join(', ') || '(none)'}`);
    console.log(`   Target Roles: ${analysis.targetRoles.join(', ') || '(none)'}`);
    console.log(`   Education: ${analysis.educationLevel}`);

    const totalSkills = analysis.coreSkills.length + analysis.inferredSkills.length + analysis.techStack.length;
    console.log(`   ⚡ Total skills for matching: ${totalSkills}`);
    if (totalSkills < 3) {
      console.log(`   ⚠️  THIN PROFILE — scoring will use soft floor`);
    }
  }
}

// ═══════════════════════════════════════════════════════════
// TEST: Scoring with synthetic job data
// ═══════════════════════════════════════════════════════════

const SAMPLE_JOBS = [
  {
    title: 'Full Stack Developer',
    company: 'CyberTech Ltd',
    description: 'We are looking for a Full Stack Developer to join our team. You will work with React, Node.js, TypeScript, and MongoDB. Experience with AWS is a plus.',
    requirements: 'Requirements: 2+ years experience, React, Node.js, TypeScript, MongoDB. Nice to have: Docker, AWS, CI/CD.',
    location: 'Tel Aviv',
    experienceLevel: '2-3 years',
  },
  {
    title: 'Senior Backend Engineer',
    company: 'FinTech Corp',
    description: 'Looking for a Senior Backend Engineer to design and build scalable microservices. Python, PostgreSQL, Docker, Kubernetes, AWS required.',
    requirements: 'Must have: 5+ years backend experience, Python, PostgreSQL, Docker. Nice to have: Kubernetes, Terraform, Go.',
    location: 'Herzliya',
    experienceLevel: 'Senior, 5+ years',
  },
  {
    title: 'Junior Frontend Developer',
    company: 'StartupAI',
    description: 'Join our team as a Junior Frontend Developer. Work with React, TypeScript, and Tailwind CSS to build beautiful user interfaces.',
    requirements: 'Requirements: React, TypeScript, CSS. Bonus: Next.js, Tailwind.',
    location: 'Tel Aviv',
    experienceLevel: 'Junior, 0-2 years',
  },
  {
    title: 'מפתח תוכנה - Python',
    company: 'חברת הייטק',
    description: 'דרוש מפתח תוכנה עם ניסיון ב-Python, Django, PostgreSQL. עבודה בסביבת Agile, פיתוח מיקרוסרביסים, ניסיון עם Docker ו-AWS.',
    requirements: 'דרישות: Python, Django, PostgreSQL, Docker. יתרון: AWS, Kubernetes, CI/CD.',
    location: 'רמת גן',
    experienceLevel: '3+ שנים',
  },
  {
    title: 'DevOps Engineer',
    company: 'CloudFirst',
    description: 'DevOps Engineer needed to manage CI/CD pipelines, Kubernetes clusters, and AWS infrastructure. Terraform, Docker, Linux required.',
    requirements: 'Must have: AWS, Docker, Kubernetes, Terraform, Linux, CI/CD. Nice to have: Python, Go, Ansible.',
    location: 'Remote',
    experienceLevel: '3-5 years',
  },
  {
    title: 'Data Analyst',
    company: 'DataViz Inc',
    description: 'Looking for a Data Analyst with SQL expertise. You will analyze business data, create dashboards with Tableau, and provide insights to stakeholders.',
    requirements: 'SQL, Excel, Tableau. Nice to have: Python, R, Power BI.',
    location: 'Tel Aviv',
    experienceLevel: '1-3 years',
  },
  {
    title: 'QA Automation Engineer',
    company: 'TestPro',
    description: 'QA Automation Engineer to develop and maintain automated test suites using Cypress, Playwright, and Selenium.',
    requirements: 'Requirements: Cypress or Selenium, JavaScript/TypeScript, CI/CD. Nice to have: Playwright, Docker.',
    location: 'Petah Tikva',
    experienceLevel: '2-4 years',
  },
  {
    title: 'Product Manager - Technical',
    company: 'SaaS Platform',
    description: 'Technical Product Manager to work with engineering team on product roadmap. Understanding of web technologies, Agile/Scrum, and data-driven decisions.',
    requirements: 'Technical background, Agile/Scrum experience, analytical skills.',
    location: 'Tel Aviv - Hybrid',
    experienceLevel: '3+ years',
  },
  // ═══ MODERN/EMERGING ROLES — testing discovery matching ═══
  {
    title: 'AI Application Developer',
    company: 'GenAI Startup',
    description: 'Build AI-powered web applications using React, Node.js, and LLM APIs (OpenAI, Anthropic). Integrate AI models into production products with great UX.',
    requirements: 'Requirements: React, Node.js, TypeScript, REST APIs. Experience with AI/LLM APIs is a huge plus. Nice to have: Python, Docker.',
    location: 'Tel Aviv',
    experienceLevel: '2+ years',
  },
  {
    title: 'Design Engineer',
    company: 'DesignTech Co',
    description: 'Design Engineer who bridges design and engineering. Build design systems, component libraries, and polished UI using React, TypeScript, and CSS. Work closely with designers.',
    requirements: 'Requirements: React, TypeScript, CSS/Tailwind, Figma. Bonus: Storybook, animation, accessibility.',
    location: 'Tel Aviv',
    experienceLevel: '2-4 years',
  },
  {
    title: 'Platform Engineer',
    company: 'ScaleUp Inc',
    description: 'Platform Engineer to build and maintain internal developer tools and infrastructure. Python, Docker, Kubernetes, AWS. Build CI/CD pipelines and developer productivity tools.',
    requirements: 'Must have: Python, Docker, AWS, CI/CD. Nice to have: Kubernetes, Terraform, Go.',
    location: 'Herzliya',
    experienceLevel: '3-5 years',
  },
  {
    title: 'מפתח אינטגרציות',
    company: 'TechFlow',
    description: 'מפתח אינטגרציות לבניית חיבורים בין מערכות. עבודה עם REST APIs, Node.js, TypeScript, webhooks. פיתוח workflow automation ואינטגרציה עם מערכות CRM, ERP.',
    requirements: 'דרישות: Node.js, TypeScript, REST API, Git. יתרון: Python, Docker, ניסיון עם Zapier/Make/n8n.',
    location: 'תל אביב-יפו',
    experienceLevel: '1-3 שנים',
  },
  {
    title: 'Growth Engineer',
    company: 'Unicorn Labs',
    description: 'Growth Engineer to build experiments, A/B tests, and data-driven features. Work with React, Node.js, analytics tools, and optimize conversion funnels.',
    requirements: 'Requirements: React, Node.js, TypeScript, analytics (Mixpanel/Amplitude). Nice to have: Python, SQL.',
    location: 'Remote',
    experienceLevel: '2-3 years',
  },
];

function testScoringWithSyntheticJobs() {
  console.log('\n' + '═'.repeat(70));
  console.log('TEST 2: SCORING WITH SYNTHETIC JOBS');
  console.log('═'.repeat(70));

  for (const [profileName, profile] of Object.entries(PROFILES)) {
    const analysis = analyzeProfileForScoring(
      profile.structuredProfile,
      profile.rawKnowledge,
      profile.preferences
    );

    console.log(`\n🎯 Profile: ${profileName} (${analysis.seniorityLevel}, ${analysis.experienceYears}yr, ${analysis.coreSkills.length + analysis.inferredSkills.length + analysis.techStack.length} skills)`);
    console.log('-'.repeat(70));

    const scores: { title: string; company: string; score: number; category: string; matched: string[]; missing: string[] }[] = [];

    for (const job of SAMPLE_JOBS) {
      const result = scoreJobLocally(job, analysis, profile.preferences);
      scores.push({
        title: job.title,
        company: job.company,
        score: result.score,
        category: result.category,
        matched: result.matchedSkills,
        missing: result.missingSkills,
      });
    }

    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);

    for (const s of scores) {
      const emoji = s.score >= 65 ? '🟢' : s.score >= 40 ? '🟡' : '🔴';
      console.log(`   ${emoji} ${s.score.toString().padStart(3)}% [${s.category.padEnd(8)}] ${s.title} @ ${s.company}`);
      if (s.matched.length > 0) console.log(`      ✅ ${s.matched.slice(0, 6).join(', ')}`);
      if (s.missing.length > 0) console.log(`      ❌ ${s.missing.slice(0, 5).join(', ')}`);
    }

    const avg = Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length);
    const qualifying = scores.filter(s => s.score >= 40).length;
    const strong = scores.filter(s => s.score >= 65).length;
    console.log(`\n   📊 Average: ${avg}% | Qualifying (≥40): ${qualifying}/${scores.length} | Strong (≥65): ${strong}/${scores.length}`);
  }
}

// ═══════════════════════════════════════════════════════════
// TEST: Real scraping + scoring
// ═══════════════════════════════════════════════════════════

async function testRealScraping() {
  console.log('\n' + '═'.repeat(70));
  console.log('TEST 3: REAL SCRAPING + SCORING');
  console.log('═'.repeat(70));

  const profile = PROFILES.juniorFullstack;
  const analysis = analyzeProfileForScoring(
    profile.structuredProfile,
    profile.rawKnowledge,
    profile.preferences
  );

  console.log(`\n🔍 Scraping with keywords: ${profile.preferences.targetRoles.join(', ')}`);
  console.log(`   Location: Tel Aviv`);
  console.log(`   Profile: juniorFullstack (${analysis.coreSkills.length + analysis.inferredSkills.length + analysis.techStack.length} skills)\n`);

  // Only scrape from free sources (no SerpAPI key needed)
  const freeSources = ['INDEED', 'DRUSHIM', 'ALLJOBS'];

  let allJobs: any[] = [];
  const sourceStats: Record<string, { total: number; error?: string }> = {};

  for (const source of freeSources) {
    try {
      console.log(`   📡 Scraping ${source}...`);
      const results = await lightweightScraperService.scrapeAll(
        ['Full Stack Developer', 'React Developer'],
        'Tel Aviv',
        [source]
      );
      const sourceResult = results.find(r => r.source === source);
      const jobs = sourceResult?.jobs || [];
      sourceStats[source] = { total: jobs.length, error: sourceResult?.error };
      allJobs.push(...jobs);
      console.log(`   ✅ ${source}: ${jobs.length} jobs${sourceResult?.error ? ` (⚠️ ${sourceResult.error})` : ''}`);
    } catch (err: any) {
      sourceStats[source] = { total: 0, error: err.message };
      console.log(`   ❌ ${source}: Error — ${err.message}`);
    }
  }

  console.log(`\n   Total scraped: ${allJobs.length} jobs`);

  if (allJobs.length === 0) {
    console.log('   ⚠️  No jobs scraped — cannot test scoring. Check network/sources.');
    return;
  }

  // Show sample of raw job data
  console.log('\n   📋 Sample scraped jobs (first 5):');
  for (const job of allJobs.slice(0, 5)) {
    console.log(`      - "${job.title}" @ ${job.company} [${job.source}]`);
    console.log(`        Location: ${job.location || '?'} | URL: ${(job.sourceUrl || '').slice(0, 60)}...`);
    console.log(`        Description: ${(job.description || '').slice(0, 100)}...`);
  }

  // Score all jobs
  console.log('\n   🎯 Scoring all jobs...');
  const scored = allJobs.map(job => ({
    job,
    score: scoreJobLocally(job, analysis, profile.preferences),
  }));

  scored.sort((a, b) => b.score.score - a.score.score);

  // Score distribution
  const dist = {
    perfect: scored.filter(s => s.score.score >= 78).length,
    strong: scored.filter(s => s.score.score >= 65 && s.score.score < 78).length,
    good: scored.filter(s => s.score.score >= 52 && s.score.score < 65).length,
    possible: scored.filter(s => s.score.score >= 40 && s.score.score < 52).length,
    stretch: scored.filter(s => s.score.score >= 28 && s.score.score < 40).length,
    weak: scored.filter(s => s.score.score < 28).length,
  };

  console.log('\n   📊 Score Distribution:');
  console.log(`      🟣 PERFECT (≥78): ${dist.perfect}`);
  console.log(`      🟢 STRONG  (65-77): ${dist.strong}`);
  console.log(`      🟡 GOOD    (52-64): ${dist.good}`);
  console.log(`      🟠 POSSIBLE(40-51): ${dist.possible}`);
  console.log(`      🔵 STRETCH (28-39): ${dist.stretch}`);
  console.log(`      🔴 WEAK    (<28):  ${dist.weak}`);

  const avg = scored.length > 0 ? Math.round(scored.reduce((s, x) => s + x.score.score, 0) / scored.length) : 0;
  const qualifying = scored.filter(s => s.score.score >= 40).length;
  console.log(`\n      Average: ${avg}% | Qualifying (≥40): ${qualifying}/${scored.length} (${scored.length > 0 ? Math.round(qualifying/scored.length*100) : 0}%)`);

  // Top 10 matches
  console.log('\n   🏆 Top 10 Matches:');
  for (const { job, score } of scored.slice(0, 10)) {
    const emoji = score.score >= 65 ? '🟢' : score.score >= 40 ? '🟡' : '🔴';
    console.log(`      ${emoji} ${score.score.toString().padStart(3)}% [${score.category.padEnd(8)}] "${job.title}" @ ${job.company}`);
    if (score.matchedSkills.length > 0) console.log(`         ✅ ${score.matchedSkills.slice(0, 5).join(', ')}`);
    if (score.missingSkills.length > 0) console.log(`         ❌ ${score.missingSkills.slice(0, 4).join(', ')}`);
    if (score.greenFlags.length > 0) console.log(`         🟢 ${score.greenFlags[0]}`);
    if (score.redFlags.length > 0) console.log(`         🔴 ${score.redFlags[0]}`);
  }

  // Bottom 5 (to understand what fails)
  console.log('\n   📉 Bottom 5 (to diagnose):');
  for (const { job, score } of scored.slice(-5)) {
    console.log(`      🔴 ${score.score.toString().padStart(3)}% [${score.category.padEnd(8)}] "${job.title}" @ ${job.company}`);
    console.log(`         Reasoning: ${score.reasoning?.slice(0, 80) || '(none)'}...`);
  }
}

// ═══════════════════════════════════════════════════════════
// RUN ALL TESTS
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// TEST 4: Skill Depth Profiling + Stack Search Queries
// ═══════════════════════════════════════════════════════════
function testSkillDepthAndStackSearch() {
  console.log('\n══════════════════════════════════════════════════════════════════════');
  console.log('TEST 4: SKILL DEPTH PROFILING + STACK SEARCH QUERIES');
  console.log('══════════════════════════════════════════════════════════════════════\n');

  const profileEntries = [
    { name: 'juniorFullstack', ...PROFILES.juniorFullstack },
    { name: 'midBackend', ...PROFILES.midBackend },
    { name: 'empty', ...PROFILES.empty },
  ];

  for (const entry of profileEntries) {
    const structured = entry.structuredProfile;
    const raw = entry.rawKnowledge;
    const prefs = entry.preferences;

    console.log(`🎯 Profile: ${entry.name}`);
    console.log('----------------------------------------------------------------------');

    // Skill Depth
    const skillDepth = buildSkillDepthProfile(structured, raw);
    console.log(`   📊 Skill Depth: ${skillDepth.length} skills profiled`);
    for (const sd of skillDepth.slice(0, 5)) {
      console.log(`      ${sd.level === 'expert' ? '🏆' : sd.level === 'advanced' ? '⭐' : sd.level === 'intermediate' ? '📗' : '📘'} ${sd.name}: ${sd.level} (${sd.yearsUsed.toFixed(1)}yr, confidence: ${sd.confidence.toFixed(2)}, ctx: ${sd.context.join(',')})`);
    }

    // Stack Search Queries
    const profileAnalysis = analyzeProfileForScoring(structured, raw, prefs);
    const stackQueries = generateStackSearchQueries(profileAnalysis, skillDepth, prefs);
    console.log(`   🔍 Stack Queries: ${stackQueries.length} generated`);
    for (const sq of stackQueries) {
      console.log(`      → "${sq}"`);
    }
    console.log('');
  }
}

// ═══════════════════════════════════════════════════════════
// TEST 5: Free-Text Search Interpretation + Scoring Boosts
// ═══════════════════════════════════════════════════════════
function testFreeTextSearch() {
  console.log('\n══════════════════════════════════════════════════════════════════════');
  console.log('TEST 5: FREE-TEXT SEARCH (LOCAL EXTRACTION + SCORING BOOSTS)');
  console.log('══════════════════════════════════════════════════════════════════════\n');

  const testQueries = [
    'אני רוצה משרת פיתוח מוצר בסטרטאפים',
    'fullstack but more backend heavy with Python',
    'remote fintech positions with React',
    'אני מחפש משהו בתחום ה-AI שמשתמש ב-React',
    'DevOps in a startup with Docker and Kubernetes',
    'QA automation בחברה גדולה',
    'junior frontend developer remote',
  ];

  // Use juniorFullstack profile for scoring tests
  const profile = PROFILES.juniorFullstack;
  const profileAnalysis = analyzeProfileForScoring(profile.structuredProfile, profile.rawKnowledge, profile.preferences);

  for (const query of testQueries) {
    // Local extraction (no AI call)
    const intent = (interpretFreeTextSearch as any).__localFallback
      ? (interpretFreeTextSearch as any).__localFallback(query)
      : (() => {
          // Call the exported function but it's async — we'll test the sync local extraction directly
          // by importing the extractKeywordsFromFreeText local helper via a dummy sync test
          // Since extractKeywordsFromFreeText is not exported, we test via the full function
          // For now, just test the scoring boosts path
          return null;
        })();

    // We can't easily test the local extraction without exporting it,
    // so let's test the boost mechanism with synthetic intents
    console.log(`   🔍 Query: "${query}"`);
  }

  // Test local extraction with compound rules
  console.log('\n   📊 Local Extraction Tests (with compound rules):');

  // We can't call the private function directly, but we can test via interpretFreeTextSearch
  // which falls back to local extraction when AI is not available.
  // For now, test the scoring boosts mechanism.

  // Test scoring boosts with synthetic intent (simulating compound search result)
  console.log('\n   📊 Scoring Boost Tests (Precision Titles):');

  const syntheticIntent = {
    keywords: ['Product Engineer', 'Product Engineer Startup', 'Founding Engineer', 'Full Stack SaaS'],
    hebrewKeywords: ['מפתח מוצר'],
    scoringBoosts: {
      titlePatterns: ['product engineer', 'founding engineer', 'saas developer', 'startup', 'product'],
      companyTypes: ['startup'] as string[],
      domains: ['saas'] as string[],
      mustHaveSkills: ['react', 'typescript'] as string[],
      preferRemote: false,
      preferHybrid: false,
    },
    intentSummary: 'חיפוש: Product Engineer / Founding Engineer בסטרטאפים',
    originalQuery: 'אני רוצה משרת פיתוח מוצר בסטרטאפים',
  };

  const testJobs = [
    { title: 'Product Engineer', company: 'AI Startup (Series A)', description: 'Build our SaaS product using React and TypeScript. Early-stage startup.', location: 'Tel Aviv', locationType: 'HYBRID' },
    { title: 'Founding Engineer', company: 'Stealth Startup (Seed)', description: 'Be our first engineer. Build the product from scratch with React, Node.js, and TypeScript. Startup environment.', location: 'Tel Aviv', locationType: 'ONSITE' },
    { title: 'Full Stack SaaS Developer', company: 'CloudTools SaaS', description: 'Build and maintain our B2B SaaS platform. React, Node.js, PostgreSQL.', location: 'Tel Aviv', locationType: 'HYBRID' },
    { title: 'Full Stack Developer', company: 'Enterprise Corp', description: 'Maintain legacy Java applications for banking system.', location: 'Haifa', locationType: 'ONSITE' },
    { title: 'Product Developer', company: 'FinTech Startup', description: 'Build financial product features with React, Node.js, TypeScript.', location: 'Tel Aviv', locationType: 'REMOTE' },
    { title: 'Backend Developer', company: 'Google', description: 'Work on distributed systems with Python and Go.', location: 'Tel Aviv', locationType: 'ONSITE' },
    { title: 'Full Stack Developer', company: 'Web Agency Ltd', description: 'Build client websites using WordPress, PHP, jQuery. Agency work.', location: 'Ramat Gan', locationType: 'ONSITE' },
  ];

  for (const job of testJobs) {
    const baseScore = scoreJobLocally(job, profileAnalysis, profile.preferences);
    const boostedScore = applyFreeTextBoosts(baseScore, job, syntheticIntent);
    const diff = boostedScore.score - baseScore.score;
    const icon = diff > 0 ? '⬆️' : '➡️';
    console.log(`      ${icon} ${job.title} @ ${job.company}: ${baseScore.score}% → ${boostedScore.score}% (${diff > 0 ? '+' : ''}${diff}) [${boostedScore.category}]`);
    if (diff > 0) {
      const boostFlags = boostedScore.greenFlags.filter(f => f.includes('חיפוש חופשי'));
      for (const bf of boostFlags) {
        console.log(`         ${bf}`);
      }
    }
  }
}

async function main() {
  console.log('🔬 AutoPilot Pipeline Test Suite');
  console.log('================================\n');

  // Test 1: Profile analysis (pure, no network)
  testProfileAnalysis();

  // Test 2: Scoring with synthetic jobs (pure, no network)
  testScoringWithSyntheticJobs();

  // Test 3: Real scraping + scoring (requires network)
  try {
    await testRealScraping();
  } catch (err: any) {
    console.log(`\n❌ Real scraping test failed: ${err.message}`);
  }

  // Test 4: Skill depth + stack search (pure, no network)
  testSkillDepthAndStackSearch();

  // Test 5: Free-text search + scoring boosts (pure, no network)
  testFreeTextSearch();

  console.log('\n\n✅ All tests completed');
}

main().catch(console.error);
