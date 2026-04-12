import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import prisma from '../db/prisma';
import logger from '../utils/logger';

const router = Router();
router.use(authMiddleware);

// ─── Israeli tech salary benchmarks (monthly NIS, gross) ───
// Sourced from common market knowledge for 2024-2025 ranges
const SALARY_BENCHMARKS: Record<string, { junior: [number, number]; mid: [number, number]; senior: [number, number] }> = {
  frontend:   { junior: [14000, 20000], mid: [20000, 30000], senior: [30000, 45000] },
  backend:    { junior: [15000, 22000], mid: [22000, 32000], senior: [32000, 50000] },
  fullstack:  { junior: [15000, 22000], mid: [22000, 33000], senior: [33000, 50000] },
  mobile:     { junior: [14000, 20000], mid: [20000, 30000], senior: [30000, 45000] },
  devops:     { junior: [16000, 23000], mid: [23000, 35000], senior: [35000, 55000] },
  data:       { junior: [15000, 22000], mid: [22000, 33000], senior: [33000, 50000] },
  qa:         { junior: [12000, 17000], mid: [17000, 25000], senior: [25000, 38000] },
  security:   { junior: [16000, 23000], mid: [23000, 35000], senior: [35000, 55000] },
  pm:         { junior: [14000, 20000], mid: [20000, 30000], senior: [30000, 48000] },
  aiml:       { junior: [18000, 25000], mid: [25000, 38000], senior: [38000, 60000] },
  general:    { junior: [13000, 18000], mid: [18000, 28000], senior: [28000, 42000] },
};

/** Infer experience level from structured profile */
function inferExperienceLevel(sp: any): 'junior' | 'mid' | 'senior' {
  if (!sp?.experience || !Array.isArray(sp.experience)) return 'junior';
  const totalYears = sp.experience.reduce((sum: number, exp: any) => {
    const period = exp.period || '';
    // Try to extract years from period like "2020-2023" or "2021-Present"
    const match = period.match(/(\d{4})\s*[-–]\s*(\d{4}|Present|היום|נוכחי)/i);
    if (match) {
      const start = parseInt(match[1]);
      const end = match[2].match(/\d{4}/) ? parseInt(match[2]) : new Date().getFullYear();
      return sum + Math.max(0, end - start);
    }
    return sum + 1; // Default 1 year per position
  }, 0);

  if (totalYears >= 5) return 'senior';
  if (totalYears >= 2) return 'mid';
  return 'junior';
}

/** Score how well user matches each role based on skills + experience keywords */
function scoreRoles(sp: any): { roleId: string; score: number }[] {
  const ROLE_KEYWORDS: Record<string, string[]> = {
    frontend:  ['react', 'vue', 'angular', 'css', 'html', 'javascript', 'typescript', 'tailwind', 'next.js', 'nextjs', 'sass', 'webpack', 'vite', 'frontend', 'front-end', 'ui', 'ux'],
    backend:   ['node', 'express', 'nestjs', 'django', 'flask', 'spring', 'java', 'python', 'go', 'golang', 'rust', 'api', 'rest', 'graphql', 'microservices', 'backend', 'back-end', 'server'],
    fullstack: ['fullstack', 'full-stack', 'full stack', 'react', 'node', 'express', 'typescript', 'javascript', 'mongodb', 'postgresql', 'sql', 'api'],
    mobile:    ['react native', 'flutter', 'swift', 'kotlin', 'ios', 'android', 'mobile', 'expo'],
    devops:    ['docker', 'kubernetes', 'k8s', 'aws', 'azure', 'gcp', 'ci/cd', 'terraform', 'ansible', 'jenkins', 'devops', 'linux', 'cloud', 'infrastructure'],
    data:      ['sql', 'python', 'pandas', 'spark', 'tableau', 'power bi', 'etl', 'data', 'analytics', 'bi', 'warehouse', 'bigquery'],
    qa:        ['qa', 'testing', 'selenium', 'cypress', 'jest', 'automation', 'test', 'quality', 'playwright', 'appium'],
    security:  ['security', 'penetration', 'soc', 'siem', 'firewall', 'vulnerability', 'cyber', 'infosec'],
    pm:        ['product', 'management', 'agile', 'scrum', 'jira', 'roadmap', 'stakeholder', 'pm', 'product manager'],
    aiml:      ['machine learning', 'ml', 'ai', 'deep learning', 'tensorflow', 'pytorch', 'nlp', 'computer vision', 'llm', 'neural'],
  };

  // Collect all user keywords (lowercase)
  const userKeywords: string[] = [];
  if (sp?.skills) {
    if (Array.isArray(sp.skills)) {
      for (const s of sp.skills) {
        userKeywords.push((typeof s === 'string' ? s : s?.name || '').toLowerCase());
      }
    } else if (typeof sp.skills === 'object') {
      for (const arr of Object.values(sp.skills)) {
        if (Array.isArray(arr)) {
          for (const s of arr) userKeywords.push(String(s).toLowerCase());
        }
      }
    }
  }
  if (sp?.experience && Array.isArray(sp.experience)) {
    for (const exp of sp.experience) {
      if (exp.title) userKeywords.push(exp.title.toLowerCase());
      if (exp.highlights && Array.isArray(exp.highlights)) {
        for (const h of exp.highlights) userKeywords.push(String(h).toLowerCase());
      }
    }
  }

  const allText = userKeywords.join(' ');

  return Object.entries(ROLE_KEYWORDS).map(([roleId, keywords]) => {
    const matched = keywords.filter(kw => allText.includes(kw));
    const score = Math.min(98, Math.round((matched.length / keywords.length) * 100));
    return { roleId, score };
  }).sort((a, b) => b.score - a.score);
}

// GET /api/dashboard/insights
router.get(
  '/insights',
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.userId!;

    // Fetch profile + personas + job scores in parallel
    const [profile, personas] = await Promise.all([
      prisma.userProfile.findUnique({ where: { id: userId } }),
      prisma.persona.findMany({ where: { userId }, select: { id: true } }),
    ]);

    const personaIds = personas.map(p => p.id);
    const sp = (profile?.structuredProfile as any) || {};

    // Get job scores for this user's personas (last 30 days, limit 500)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const scores = personaIds.length > 0
      ? await prisma.jobScore.findMany({
          where: {
            personaId: { in: personaIds },
            scoredAt: { gte: thirtyDaysAgo },
          },
          include: {
            job: {
              select: { id: true, title: true, company: true, salary: true, rawData: true, source: true },
            },
          },
          orderBy: { overallScore: 'desc' },
          take: 500,
        })
      : [];

    // ─── 1. Top roles with real match scores ───
    const roleScores = scoreRoles(sp);
    const expLevel = inferExperienceLevel(sp);

    // Enhance role scores with actual job score data if available
    const roleJobCounts: Record<string, { count: number; avgScore: number; topJob?: any }> = {};
    for (const score of scores) {
      const titleLower = score.job.title.toLowerCase();
      for (const role of roleScores) {
        const roleKw = role.roleId;
        // Simple check if job title relates to this role
        const isRelevant =
          (roleKw === 'frontend' && /front|react|vue|angular|ui/i.test(titleLower)) ||
          (roleKw === 'backend' && /back|server|api|node|java(?!script)/i.test(titleLower)) ||
          (roleKw === 'fullstack' && /full.?stack/i.test(titleLower)) ||
          (roleKw === 'mobile' && /mobile|ios|android|react native/i.test(titleLower)) ||
          (roleKw === 'devops' && /devops|sre|cloud|infra/i.test(titleLower)) ||
          (roleKw === 'data' && /data|bi|analyst|analytics/i.test(titleLower)) ||
          (roleKw === 'qa' && /qa|test|quality/i.test(titleLower)) ||
          (roleKw === 'security' && /security|cyber|soc/i.test(titleLower)) ||
          (roleKw === 'pm' && /product.?manager|pm\b/i.test(titleLower)) ||
          (roleKw === 'aiml' && /ai|ml|machine.?learn|data.?scien/i.test(titleLower));

        if (isRelevant) {
          if (!roleJobCounts[roleKw]) roleJobCounts[roleKw] = { count: 0, avgScore: 0 };
          roleJobCounts[roleKw].count++;
          roleJobCounts[roleKw].avgScore += score.overallScore;
          if (!roleJobCounts[roleKw].topJob || score.overallScore > (roleJobCounts[roleKw].topJob.score || 0)) {
            roleJobCounts[roleKw].topJob = {
              title: score.job.title,
              company: score.job.company,
              score: score.overallScore,
            };
          }
        }
      }
    }
    // Finalize averages
    for (const [key, val] of Object.entries(roleJobCounts)) {
      if (val.count > 0) val.avgScore = Math.round(val.avgScore / val.count);
    }

    const ROLE_META: Record<string, { name: string; nameHe: string; icon: string }> = {
      frontend:  { name: 'Frontend Developer', nameHe: 'מפתח פרונטאנד', icon: '🎨' },
      backend:   { name: 'Backend Developer', nameHe: 'מפתח בקאנד', icon: '⚙️' },
      fullstack: { name: 'Full Stack Developer', nameHe: 'מפתח פולסטאק', icon: '🔗' },
      mobile:    { name: 'Mobile Developer', nameHe: 'מפתח מובייל', icon: '📱' },
      devops:    { name: 'DevOps Engineer', nameHe: 'מהנדס DevOps', icon: '☁️' },
      data:      { name: 'Data / BI Analyst', nameHe: 'אנליסט דאטה / BI', icon: '📊' },
      qa:        { name: 'QA Engineer', nameHe: 'מהנדס QA', icon: '🧪' },
      security:  { name: 'Security Engineer', nameHe: 'מהנדס אבטחה', icon: '🔒' },
      pm:        { name: 'Product Manager', nameHe: 'מנהל מוצר', icon: '📋' },
      aiml:      { name: 'AI / ML Engineer', nameHe: 'מהנדס AI / ML', icon: '🤖' },
      general:   { name: 'Software Developer', nameHe: 'מפתח תוכנה', icon: '💻' },
    };

    const topRoles = roleScores
      .filter(r => r.score > 10)
      .slice(0, 5)
      .map(r => ({
        id: r.roleId,
        ...ROLE_META[r.roleId] || { name: r.roleId, nameHe: r.roleId, icon: '💼' },
        profileMatch: r.score,
        jobsFound: roleJobCounts[r.roleId]?.count || 0,
        avgJobScore: roleJobCounts[r.roleId]?.avgScore || 0,
        topJob: roleJobCounts[r.roleId]?.topJob || null,
      }));

    // ─── 2. Salary estimate ───
    const topRoleId = topRoles[0]?.id || 'general';
    const benchmarks = SALARY_BENCHMARKS[topRoleId] || SALARY_BENCHMARKS.general;
    const range = benchmarks[expLevel];

    // Check if we have actual salary data from scored jobs
    let realSalaryCount = 0;
    let realSalaryMin = Infinity;
    let realSalaryMax = 0;
    for (const score of scores) {
      const salary = score.job.salary as any;
      if (salary?.min || salary?.max) {
        realSalaryCount++;
        if (salary.min) realSalaryMin = Math.min(realSalaryMin, salary.min);
        if (salary.max) realSalaryMax = Math.max(realSalaryMax, salary.max);
      }
    }

    const salaryInsight = {
      estimatedRange: { min: range[0], max: range[1], currency: 'ILS' },
      experienceLevel: expLevel,
      basedOnRole: topRoleId,
      basedOnRoleHe: ROLE_META[topRoleId]?.nameHe || topRoleId,
      fromJobData: realSalaryCount > 0 ? {
        count: realSalaryCount,
        min: realSalaryMin === Infinity ? 0 : realSalaryMin,
        max: realSalaryMax,
      } : null,
    };

    // ─── 3. Profile strength ───
    let profileStrength = 0;
    const strengthItems: { label: string; done: boolean }[] = [];
    if (sp.experience?.length > 0) { profileStrength += 25; strengthItems.push({ label: 'ניסיון תעסוקתי', done: true }); }
    else strengthItems.push({ label: 'ניסיון תעסוקתי', done: false });
    if (sp.skills && (Array.isArray(sp.skills) ? sp.skills.length > 0 : Object.keys(sp.skills).length > 0)) { profileStrength += 25; strengthItems.push({ label: 'סקילים טכניים', done: true }); }
    else strengthItems.push({ label: 'סקילים טכניים', done: false });
    if (sp.education?.length > 0) { profileStrength += 20; strengthItems.push({ label: 'השכלה', done: true }); }
    else strengthItems.push({ label: 'השכלה', done: false });
    if (sp.projects?.length > 0) { profileStrength += 15; strengthItems.push({ label: 'פרויקטים', done: true }); }
    else strengthItems.push({ label: 'פרויקטים', done: false });
    if (profile?.linkedinUrl) { profileStrength += 10; strengthItems.push({ label: 'לינקדאין', done: true }); }
    else strengthItems.push({ label: 'לינקדאין', done: false });
    if (sp.summary) { profileStrength += 5; strengthItems.push({ label: 'סיכום מקצועי', done: true }); }
    else strengthItems.push({ label: 'סיכום מקצועי', done: false });

    // ─── 4. Score distribution ───
    const scoreDistribution = { high: 0, medium: 0, low: 0 };
    for (const s of scores) {
      if (s.overallScore >= 70) scoreDistribution.high++;
      else if (s.overallScore >= 50) scoreDistribution.medium++;
      else scoreDistribution.low++;
    }

    // ─── 5. Top matches ───
    const topMatches = scores.slice(0, 5).map(s => ({
      jobId: s.job.id,
      title: s.job.title,
      company: s.job.company,
      score: Math.round(s.overallScore),
      skillMatch: Math.round(s.skillMatch),
    }));

    res.json({
      success: true,
      data: {
        topRoles,
        salaryInsight,
        profileStrength: { score: Math.min(100, profileStrength), items: strengthItems },
        scoreDistribution,
        topMatches,
        totalScoredJobs: scores.length,
        experienceLevel: expLevel,
      },
    });
  })
);

export default router;
