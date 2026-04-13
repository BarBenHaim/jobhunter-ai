import { aiClient } from '../ai/client';
import logger from '../utils/logger';

/**
 * Smart Match Service
 *
 * Thinks like a recruitment agency / headhunter:
 * 1. Deeply analyzes user profile to understand their full potential
 * 2. Generates expanded search keywords beyond obvious matches
 * 3. Scores jobs with recruiter-level intelligence (locally, no API per job)
 * 4. Catches "hidden gems" — jobs the user qualifies for but wouldn't search for
 */

// ============================================================
// TYPES
// ============================================================

export interface SmartKeywords {
  primary: string[];        // Direct role matches (what they ARE)
  adjacent: string[];       // Adjacent roles (what they COULD DO)
  discovery: string[];      // Modern/emerging roles (what they DON'T KNOW they can be)
  skills: string[];         // Technical skill keywords
  hebrew: string[];         // Hebrew equivalents
  industry: string[];       // Industry-specific terms
  seniority: string[];      // Level-appropriate terms
  combined: string[];       // Top combined queries for scrapers
}

export interface SmartScore {
  score: number;             // 0-100 overall match
  skillMatch: number;        // 0-100 skill overlap
  experienceMatch: number;   // 0-100 experience level fit
  roleRelevance: number;     // 0-100 how relevant is the role type
  locationMatch: number;     // 0-100 location fit
  reasoning: string;         // Hebrew explanation of the match
  matchedSkills: string[];   // Skills that match
  missingSkills: string[];   // Important skills they lack
  greenFlags: string[];      // Positive signals
  redFlags: string[];        // Warning signals
  category: 'PERFECT' | 'STRONG' | 'GOOD' | 'POSSIBLE' | 'STRETCH' | 'WEAK';
}

export interface ProfileAnalysis {
  coreSkills: string[];
  inferredSkills: string[];
  experienceYears: number;
  seniorityLevel: 'JUNIOR' | 'MID' | 'SENIOR' | 'LEAD';
  domains: string[];           // e.g. ['web', 'backend', 'devops', 'mobile']
  techStack: string[];         // specific technologies
  softSkills: string[];
  previousRoles: string[];
  targetRoles: string[];
  languages: string[];         // programming languages
  spokenLanguages: string[];
  educationLevel: string;
}

// ============================================================
// KEYWORD CACHE — avoid re-generating if profile hasn't changed
// ============================================================

interface CachedKeywords {
  keywords: SmartKeywords;
  profileHash: string;
  timestamp: number;
}

const keywordCache = new Map<string, CachedKeywords>();
const KEYWORD_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours — regenerate daily for freshness

function computeProfileHash(structuredProfile: any, preferences: any, searchConfig?: any): string {
  // Simple hash: stringify the key parts that affect keyword generation
  const data = JSON.stringify({
    skills: structuredProfile?.skills || [],
    experiences: (structuredProfile?.experiences || []).map((e: any) => e.title),
    targetRoles: preferences?.targetRoles || [],
    experienceLevel: searchConfig?.experienceLevel || preferences?.experienceLevel || '',
    customKeywords: searchConfig?.keywords || [],
  });
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const chr = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return hash.toString(36);
}

// ============================================================
// AI KEYWORD EXPANSION
// ============================================================

/**
 * Use AI to deeply analyze the user's profile and generate smart,
 * expanded search keywords — thinking like a senior recruiter.
 * Results are cached for 7 days if profile hasn't changed.
 */
export async function generateSmartKeywords(
  structuredProfile: any,
  rawKnowledge: any,
  preferences: any,
  searchConfig?: { experienceLevel?: string; keywords?: string[] }
): Promise<SmartKeywords> {
  try {
    // Check cache first — avoid burning AI tokens if profile hasn't changed
    const cacheKey = 'user_keywords'; // Single user system for now
    const profileHash = computeProfileHash(structuredProfile, preferences, searchConfig);
    const cached = keywordCache.get(cacheKey);

    if (cached && cached.profileHash === profileHash && (Date.now() - cached.timestamp) < KEYWORD_CACHE_TTL) {
      logger.info('Using cached smart keywords (profile unchanged)', { age: Math.round((Date.now() - cached.timestamp) / 60000) + 'min' });
      return cached.keywords;
    }

    logger.info('Generating smart keywords from full profile (cache miss or expired)');

    const profileText = rawKnowledge?.content || '';
    const targetRoles = preferences?.targetRoles || [];
    const excludeKeywords = preferences?.excludeKeywords || [];
    const experienceLevel = searchConfig?.experienceLevel || preferences?.experienceLevel || '';
    const customKeywords = searchConfig?.keywords || [];

    // Determine seniority context for the prompt
    const isStudent = experienceLevel?.toLowerCase()?.includes('student') ||
      targetRoles.some((r: string) => r.toLowerCase().includes('student') || r.toLowerCase().includes('סטודנט') || r.toLowerCase().includes('junior') || r.toLowerCase().includes('intern'));
    const isJunior = isStudent || experienceLevel?.toLowerCase()?.includes('junior') || experienceLevel?.toLowerCase()?.includes('entry');

    let seniorityInstruction = '';
    if (isStudent) {
      seniorityInstruction = `
⛔ ABSOLUTE RULE - THIS CANDIDATE IS A STUDENT / ENTRY-LEVEL:

FORBIDDEN WORDS — NEVER include these in ANY keyword:
Senior, Lead, Principal, Staff, Architect, Manager, Head, Director, VP, CTO, Team Lead, Tech Lead, סניור, בכיר, מוביל, ראש צוות, מנהל

REQUIRED WORDS — Every "combined" query MUST include at least one of:
Student, Junior, Intern, Entry, Graduate, סטודנט, ג'וניור, התמחות, משרת סטודנט

EXAMPLES of GOOD combined queries:
- "Junior Software Developer React"
- "Student Developer Position Israel"
- "סטודנט פיתוח תוכנה"
- "Intern Full Stack Developer"
- "Entry Level Developer JavaScript"
- "Junior Backend Developer Node.js"
- "משרת סטודנט פיתוח"
- "Graduate Software Engineer"

EXAMPLES of BAD combined queries (NEVER generate these):
- "Full Stack Developer React Next.js" (missing student/junior qualifier!)
- "Software Engineer TypeScript" (too generic, will return senior roles!)
- "Technical Product Manager" (way above student level!)

The ENTIRE search should be calibrated for someone with 0-1 years of experience.`;
    } else if (isJunior) {
      seniorityInstruction = `
⚠️ IMPORTANT - CANDIDATE IS JUNIOR LEVEL (0-2 years experience):
- AVOID: "Senior", "Lead", "Principal", "Staff", "Architect", "סניור", "בכיר"
- PREFER: "Junior", "Entry Level", "ג'וניור", "מתחיל/ה"
- Every "combined" query should include "Junior" or "Entry" to filter results
- Focus on roles requiring 0-2 years of experience`;
    }

    const systemPrompt = `You are a SENIOR TECH RECRUITER in Israel with 15 years of experience placing developers in hi-tech companies.
You are known for finding candidates HIDDEN GEM roles — positions they'd be PERFECT for but would never think to search for.

Your job: Given a candidate's full profile, generate search keywords that cover THREE layers:
1. OBVIOUS — their stated target roles (what they asked for)
2. ADJACENT — traditional roles their skills transfer to
3. DISCOVERY — modern, emerging, or non-obvious roles where their unique skill combination is a superpower

${seniorityInstruction}

ABSOLUTE PRIORITY RULE:
The candidate has EXPLICITLY selected specific roles they want. These MUST be the foundation of your keywords.
Do NOT override their choices with what you think is better. Their selected roles should appear FIRST in "primary" and dominate "combined".
${targetRoles.length > 0 ? `\n🎯 CANDIDATE'S SELECTED ROLES (HIGHEST PRIORITY): ${targetRoles.join(', ')}\nThese roles MUST be the core of all generated keywords. Build everything around these.` : ''}

Think DEEPLY:
- What roles match their EXACT experience AND their stated preferences?
- What ADJACENT roles could they transition to? (must be SAME seniority level)
- What Hebrew job titles are used on Israeli job boards for these specific roles?
- What industry terms capture their niche?

🔥 DISCOVERY MODE — THIS IS WHERE YOU ADD THE REAL VALUE:
Think about the candidate's FULL skill combination, not just individual skills. Ask yourself:
- "What MODERN roles (2024-2026) combine exactly these skills?"
- "What EMERGING job titles didn't exist 2 years ago but are now hot?"
- "Where would this person's unique combination be rare and valuable?"

MODERN ROLE EXAMPLES to consider (match to candidate's ACTUAL skills):
- AI Application Developer, LLM Engineer, AI Full Stack Developer, Prompt Engineer
- Design Engineer, Creative Technologist, Design Systems Engineer
- Developer Experience (DevEx/DX) Engineer, Developer Advocate, SDK Engineer
- Platform Engineer, Internal Tools Developer, Productivity Engineer
- Growth Engineer, Experimentation Engineer, Product Engineer
- Integration Developer, API Engineer, Workflow Automation Developer
- MLOps Engineer, AI Infrastructure, Data Platform Engineer
- FinOps Engineer, Cloud Native Engineer, Reliability Engineer
- Accessibility Engineer, Performance Engineer, Frontend Platform
- Technical Content Engineer, Documentation Engineer

🎯 PRECISION JOB TITLES — High-value titles to include in "combined" when relevant:
- "Product Engineer" — devs who code but think product. Best for SaaS/startup companies.
- "Founding Engineer" — early-stage startups (Seed/Series A), employee #1-5.
- "Full Stack SaaS" / "SaaS Developer" — filters out agencies, targets product companies.
- "Technical Product Manager" / "Data Product Manager" — strategic/management roles for devs.

🔍 COMPOUND QUERIES for "combined" — combine role + context for precision:
- "Product Engineer Startup" (not just "Product Engineer" or just "Startup")
- "Full Stack SaaS" (filters to product companies)
- "Founding Engineer" (gets early-stage roles)
- "Full Stack AI" (AI-powered app development)
Include 3-5 compound queries in "combined" for best results.

The DISCOVERY roles MUST match the candidate's actual skill set — don't suggest AI roles to someone who only knows HTML/CSS.
A React+Node.js developer CAN be suggested "AI Application Developer" because they can build AI-powered apps.
A Python+AWS developer CAN be suggested "MLOps Engineer" because the skills transfer.

CRITICAL RULES:
- Generate search terms that match the candidate's ACTUAL level and preferences
- NEVER suggest roles above the candidate's experience level
- Include Hebrew terms for Israeli job boards (Drushim, AllJobs)
- Think about what HR managers would title the job posting
- Consider both startup and corporate job title conventions
- The "combined" field is what actually gets searched — make it count
- Discovery keywords should be ~30% of combined queries

Return a JSON object:
{
  "primary": ["exact role match terms based on candidate's selected roles - 5-8 terms"],
  "adjacent": ["roles they could transition to AT THE SAME LEVEL - 5-8 terms"],
  "discovery": ["modern/emerging roles their skill combo uniquely qualifies them for - 5-8 terms"],
  "skills": ["key technical skills to search for - 5-10 terms"],
  "hebrew": ["Hebrew job titles and keywords matching their level - 5-10 terms"],
  "industry": ["industry/domain specific terms - 3-5 terms"],
  "seniority": ["level-appropriate terms ONLY - 3-5 terms"],
  "combined": ["top 15-20 combined search queries: 40% primary, 30% adjacent, 30% discovery — each optimized for job boards"]
}`;

    const userPrompt = `CANDIDATE PROFILE:

${profileText ? `--- Raw Resume/Knowledge ---\n${profileText}\n---\n` : ''}
${structuredProfile ? `--- Structured Profile ---\n${JSON.stringify(structuredProfile, null, 2)}\n---\n` : ''}
${targetRoles.length > 0 ? `\n🎯 CANDIDATE'S SELECTED TARGET ROLES (MUST PRIORITIZE): ${targetRoles.join(', ')}` : ''}
${experienceLevel ? `\n⚡ EXPERIENCE LEVEL: ${experienceLevel}` : ''}
${customKeywords.length > 0 ? `\nCustom Keywords to include: ${customKeywords.join(', ')}` : ''}
${excludeKeywords.length > 0 ? `\nExclude Keywords: ${excludeKeywords.join(', ')}` : ''}

Based on this candidate's FULL background, generate smart search keywords.
Remember:
- RESPECT the candidate's selected roles and experience level above all else
- Think like a recruiter who deeply understands the Israeli tech market
- Match keywords to the candidate's ACTUAL level — not aspirational roles
- USE DISCOVERY MODE: Find at least 5 modern/emerging role titles that this candidate's unique skill combination qualifies them for
- Think: "What job would this person CRUSH that they've never even heard of?"
- The "combined" keywords are what get searched on job boards — they must be precise and level-appropriate`;

    const response = await aiClient.callAPI(systemPrompt, userPrompt, 2, 45000);
    const keywords = aiClient.parseJSON<SmartKeywords>(response);

    logger.info('Smart keywords generated', {
      primary: keywords.primary?.length,
      adjacent: keywords.adjacent?.length,
      discovery: keywords.discovery?.length,
      combined: keywords.combined?.length,
    });

    // Ensure discovery field exists (backward compat with older AI responses)
    if (!keywords.discovery) keywords.discovery = [];

    // Cache the results
    keywordCache.set(cacheKey, {
      keywords,
      profileHash,
      timestamp: Date.now(),
    });

    return keywords;
  } catch (error) {
    logger.error('Error generating smart keywords:', error);
    // Fallback to basic keywords
    const targetRoles = preferences?.targetRoles || [];
    return {
      primary: targetRoles.length > 0 ? targetRoles : ['Software Engineer', 'Developer', 'Full Stack'],
      adjacent: [],
      discovery: ['AI Developer', 'Platform Engineer', 'Product Engineer'],
      skills: [],
      hebrew: ['מפתח תוכנה', 'פיתוח', 'מהנדס תוכנה'],
      industry: [],
      seniority: [],
      combined: targetRoles.length > 0
        ? [...targetRoles, 'מפתח תוכנה', 'Developer', 'AI Developer']
        : ['Software Engineer', 'Full Stack Developer', 'מפתח תוכנה', 'AI Developer'],
    };
  }
}

// ============================================================
// PROFILE ANALYSIS (for local scoring)
// ============================================================

/**
 * Extract a detailed analysis of the user's profile for local scoring.
 * This is a ONE-TIME analysis, not per-job.
 */
export function analyzeProfileForScoring(
  structuredProfile: any,
  rawKnowledge: any,
  preferences: any
): ProfileAnalysis {
  const skills: string[] = [];
  const inferredSkills: string[] = [];
  const techStack: string[] = [];
  const previousRoles: string[] = [];
  const domains: string[] = [];
  const languages: string[] = [];
  const softSkills: string[] = [];

  // Extract from structured profile
  if (structuredProfile) {
    // Skills
    if (Array.isArray(structuredProfile.skills)) {
      for (const skill of structuredProfile.skills) {
        const name = typeof skill === 'string' ? skill : skill.name;
        if (name) {
          skills.push(name.toLowerCase());
          techStack.push(name.toLowerCase());
        }
      }
    }

    // Inferred skills
    if (Array.isArray(structuredProfile.inferredSkills)) {
      for (const skill of structuredProfile.inferredSkills) {
        const name = typeof skill === 'string' ? skill : skill.name;
        if (name) inferredSkills.push(name.toLowerCase());
      }
    }

    // Experiences → extract roles and domains
    if (Array.isArray(structuredProfile.experiences)) {
      for (const exp of structuredProfile.experiences) {
        if (exp.title) previousRoles.push(exp.title.toLowerCase());
        if (exp.description) {
          // Extract domain hints
          const desc = exp.description.toLowerCase();
          if (desc.includes('web') || desc.includes('website') || desc.includes('frontend')) domains.push('web');
          if (desc.includes('backend') || desc.includes('server') || desc.includes('api')) domains.push('backend');
          if (desc.includes('mobile') || desc.includes('ios') || desc.includes('android')) domains.push('mobile');
          if (desc.includes('devops') || desc.includes('ci/cd') || desc.includes('deploy') || desc.includes('infrastructure')) domains.push('devops');
          if (desc.includes('data') || desc.includes('analytics') || desc.includes('ml') || desc.includes('machine learning')) domains.push('data');
          if (desc.includes('cloud') || desc.includes('aws') || desc.includes('azure') || desc.includes('gcp')) domains.push('cloud');
          if (desc.includes('security') || desc.includes('cyber')) domains.push('security');
          if (desc.includes('product') || desc.includes('pm') || desc.includes('roadmap')) domains.push('product');
          if (desc.includes('lead') || desc.includes('manage') || desc.includes('team')) softSkills.push('leadership');
        }
      }
    }

    // Languages (programming)
    if (Array.isArray(structuredProfile.languages)) {
      for (const lang of structuredProfile.languages) {
        const name = typeof lang === 'string' ? lang : lang.name;
        if (name) {
          // Distinguish programming from spoken
          const progLangs = ['javascript', 'typescript', 'python', 'java', 'c#', 'c++', 'go', 'rust', 'ruby', 'php', 'swift', 'kotlin', 'sql'];
          if (progLangs.some(p => name.toLowerCase().includes(p))) {
            languages.push(name.toLowerCase());
          }
        }
      }
    }

    // Projects → extract more tech stack
    if (Array.isArray(structuredProfile.projects)) {
      for (const proj of structuredProfile.projects) {
        if (Array.isArray(proj.technologies)) {
          for (const tech of proj.technologies) {
            techStack.push(tech.toLowerCase());
          }
        }
      }
    }
  }

  // Extract from raw knowledge text
  const rawText = (rawKnowledge?.content || '').toLowerCase();

  // Detect more skills from raw text
  const TECH_KEYWORDS = [
    'react', 'vue', 'angular', 'node.js', 'express', 'next.js', 'typescript', 'javascript',
    'python', 'django', 'flask', 'java', 'spring', 'kotlin', 'swift',
    'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform',
    'postgresql', 'mongodb', 'redis', 'mysql', 'elasticsearch',
    'graphql', 'rest api', 'microservices', 'ci/cd', 'git',
    'linux', 'nginx', 'rabbitmq', 'kafka',
    'html', 'css', 'sass', 'tailwind', 'webpack', 'vite',
    'prisma', 'sequelize', 'typeorm',
    'jest', 'cypress', 'playwright', 'selenium',
    'figma', 'photoshop', 'ui/ux',
    'agile', 'scrum', 'jira',
    'system admin', 'active directory', 'networking', 'vmware',
  ];

  for (const kw of TECH_KEYWORDS) {
    if (rawText.includes(kw) && !skills.includes(kw) && !techStack.includes(kw)) {
      techStack.push(kw);
    }
  }

  // Estimate seniority
  let experienceYears = 0;
  if (structuredProfile?.experiences) {
    for (const exp of structuredProfile.experiences) {
      if (exp.duration) {
        const durStr = String(exp.duration).toLowerCase();
        // Try to parse "X years" or "X months" or just a number
        const yearsM = durStr.match(/(\d+)\s*(?:years?|שנ)/i);
        const monthsM = durStr.match(/(\d+)\s*(?:months?|חודש)/i);
        if (yearsM) {
          experienceYears += parseInt(yearsM[1]);
        } else if (monthsM) {
          experienceYears += parseInt(monthsM[1]) / 12;
        } else {
          // Plain number — assume months if > 12, years otherwise
          const num = parseInt(String(exp.duration));
          if (!isNaN(num)) {
            experienceYears += num > 12 ? num / 12 : num;
          }
        }
      }
      // Fallback: calculate from startDate/endDate if duration is missing
      if (!exp.duration && exp.startDate) {
        const start = new Date(exp.startDate);
        const end = exp.endDate ? new Date(exp.endDate) : new Date();
        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
          experienceYears += (end.getTime() - start.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
        }
      }
    }
    experienceYears = Math.round(experienceYears * 10) / 10; // Round to 1 decimal
  }
  // Also check raw text for years of experience
  const yearsMatch = rawText.match(/(\d+)\+?\s*(?:years?|שנ)/);
  if (yearsMatch) {
    const parsed = parseInt(yearsMatch[1]);
    if (parsed > experienceYears) experienceYears = parsed;
  }

  // Check if user explicitly selected student/junior roles — this overrides experience calculation
  const targetRolesRaw = preferences?.targetRoles || [];
  const isExplicitlyStudent = targetRolesRaw.some((r: string) => {
    const lower = r.toLowerCase();
    return lower.includes('student') || lower.includes('סטודנט') || lower.includes('intern') || lower.includes('התמחות');
  });
  const isExplicitlyJunior = isExplicitlyStudent || targetRolesRaw.some((r: string) => {
    const lower = r.toLowerCase();
    return lower.includes('junior') || lower.includes('ג\'וניור') || lower.includes('entry');
  });

  let seniorityLevel: ProfileAnalysis['seniorityLevel'] = 'MID';
  if (isExplicitlyStudent) {
    seniorityLevel = 'JUNIOR';
    experienceYears = Math.min(experienceYears, 1); // Student — cap experience at 1 year
  } else if (isExplicitlyJunior) {
    seniorityLevel = 'JUNIOR';
    experienceYears = Math.min(experienceYears, 2); // Junior — cap experience at 2 years
  } else if (experienceYears <= 2) seniorityLevel = 'JUNIOR';
  else if (experienceYears <= 5) seniorityLevel = 'MID';
  else if (experienceYears <= 8) seniorityLevel = 'SENIOR';
  else seniorityLevel = 'LEAD';

  // Education
  let educationLevel = 'unknown';
  if (structuredProfile?.education) {
    for (const edu of structuredProfile.education) {
      const deg = (edu.degree || '').toLowerCase();
      if (deg.includes('phd') || deg.includes('doctorate')) educationLevel = 'phd';
      else if (deg.includes('master') || deg.includes('msc') || deg.includes('mba')) educationLevel = 'masters';
      else if (deg.includes('bachelor') || deg.includes('bsc') || deg.includes('b.sc') || deg.includes('b.a') || deg.includes('b.tech') || deg.includes('תואר ראשון')) educationLevel = 'bachelors';
    }
  }

  const targetRoles = preferences?.targetRoles || [];

  return {
    coreSkills: [...new Set(skills)],
    inferredSkills: [...new Set(inferredSkills)],
    experienceYears,
    seniorityLevel,
    domains: [...new Set(domains)],
    techStack: [...new Set(techStack)],
    softSkills: [...new Set(softSkills)],
    previousRoles: [...new Set(previousRoles)],
    targetRoles,
    languages: [...new Set(languages)],
    spokenLanguages: [],
    educationLevel,
  };
}

// ============================================================
// SMART LOCAL SCORING (No API call per job — fast!)
// ============================================================

/**
 * Role adjacency map — roles that share transferable skills.
 * If someone held Role A, they're potentially a fit for Role B.
 */
const ROLE_ADJACENCY: Record<string, string[]> = {
  // ─── Classic roles ───────────────────────────────────
  'full stack': ['frontend', 'backend', 'web developer', 'software engineer', 'full-stack', 'fullstack', 'developer', 'software developer',
    // Modern adjacencies:
    'ai full stack', 'ai application developer', 'design engineer', 'creative technologist', 'integration developer', 'solutions engineer'],
  'frontend': ['ui developer', 'web developer', 'react developer', 'frontend engineer', 'ui engineer', 'full stack', 'ui/ux', 'ux engineer',
    'design engineer', 'creative technologist', 'design systems engineer', 'ui architect', 'accessibility engineer', 'frontend platform'],
  'backend': ['server developer', 'api developer', 'backend engineer', 'full stack', 'software engineer', 'platform engineer', 'data engineer',
    'ai backend', 'ml engineer', 'integration engineer', 'api engineer', 'infrastructure developer'],
  'devops': ['sre', 'site reliability', 'infrastructure', 'platform engineer', 'cloud engineer', 'system administrator', 'system engineer', 'operations engineer',
    'mlops', 'devsecops', 'reliability engineer', 'infrastructure engineer', 'cloud native engineer', 'finops'],
  'system admin': ['devops', 'it manager', 'infrastructure', 'network engineer', 'cloud engineer', 'system engineer', 'operations'],
  'team lead': ['tech lead', 'engineering manager', 'development manager', 'architect', 'principal engineer', 'staff engineer'],
  'tech lead': ['team lead', 'architect', 'staff engineer', 'principal engineer', 'engineering manager'],
  'product manager': ['project manager', 'product owner', 'scrum master', 'business analyst', 'technical product manager',
    'ai product manager', 'growth product manager', 'platform product manager'],
  'data engineer': ['backend', 'etl developer', 'data architect', 'analytics engineer', 'bi developer', 'data analyst', 'data scientist',
    'ml engineer', 'mlops', 'ai engineer', 'data platform engineer'],
  'data analyst': ['bi developer', 'analytics engineer', 'data engineer', 'business analyst', 'data scientist',
    'growth analyst', 'product analyst', 'revenue analyst'],
  'qa': ['test engineer', 'sdet', 'automation engineer', 'quality engineer', 'test automation', 'qa automation', 'qa engineer', 'בודק תוכנה',
    'reliability engineer', 'chaos engineer'],
  'automation': ['qa', 'test automation', 'sdet', 'devops', 'automation engineer',
    'rpa developer', 'workflow automation', 'integration developer'],
  'mobile': ['ios developer', 'android developer', 'react native', 'flutter developer', 'mobile engineer',
    'cross-platform developer'],
  'software engineer': ['developer', 'programmer', 'full stack', 'backend', 'frontend', 'software developer', 'מהנדס תוכנה',
    'ai engineer', 'ml engineer', 'platform engineer', 'tools engineer', 'developer experience'],
  'solutions architect': ['architect', 'cloud architect', 'technical consultant', 'presales engineer', 'software architect'],
  'security': ['cyber', 'information security', 'security engineer', 'penetration', 'soc analyst', 'אבטחת מידע',
    'devsecops', 'application security', 'cloud security engineer'],

  // ─── Modern/Emerging roles (2024-2026) ────────────────
  'ai engineer': ['ml engineer', 'ai developer', 'llm engineer', 'prompt engineer', 'ai application developer', 'ai full stack',
    'nlp engineer', 'computer vision engineer', 'ai researcher', 'applied ai', 'generative ai', 'conversational ai',
    'backend', 'full stack', 'data engineer', 'data scientist', 'software engineer', 'מפתח AI', 'מהנדס בינה מלאכותית'],
  'ml engineer': ['ai engineer', 'data scientist', 'mlops', 'ai developer', 'deep learning', 'applied scientist',
    'backend', 'data engineer', 'research engineer'],
  'prompt engineer': ['ai engineer', 'llm engineer', 'ai application developer', 'conversational ai', 'content engineer',
    'ai trainer', 'technical writer'],
  'design engineer': ['frontend', 'ui engineer', 'creative technologist', 'design systems engineer', 'ux engineer',
    'full stack', 'ui developer', 'web developer'],
  'platform engineer': ['devops', 'sre', 'infrastructure', 'cloud engineer', 'backend', 'developer experience',
    'tools engineer', 'internal tools'],
  'developer experience': ['devrel', 'developer advocate', 'developer relations', 'tools engineer', 'platform engineer',
    'technical writer', 'sdk engineer', 'frontend', 'full stack'],
  'integration developer': ['api developer', 'middleware', 'automation engineer', 'solutions engineer', 'backend',
    'full stack', 'workflow automation', 'rpa developer', 'מפתח אינטגרציות'],
  'growth engineer': ['full stack', 'frontend', 'marketing engineer', 'growth hacker', 'experimentation engineer',
    'product engineer', 'data analyst'],
  'product engineer': ['full stack', 'frontend', 'backend', 'growth engineer', 'software engineer',
    'design engineer'],

  // ─── Student/junior transition ─────────────────────────
  'student': ['junior', 'intern', 'graduate', 'entry level', 'trainee', 'developer', 'software engineer', 'qa', 'test', 'automation', 'support engineer', 'it',
    'ai intern', 'junior ai developer', 'technical support'],
  'junior': ['student', 'intern', 'graduate', 'entry level', 'trainee', 'developer', 'software engineer', 'qa', 'frontend', 'backend', 'full stack', 'support',
    'junior ai developer', 'junior ml engineer'],
  'intern': ['student', 'junior', 'graduate', 'trainee', 'developer', 'qa', 'test'],

  // ─── Hebrew roles ──────────────────────────────────────
  'developer': ['software engineer', 'programmer', 'full stack', 'web developer', 'software developer', 'מפתח'],
  'מפתח': ['developer', 'software', 'programmer', 'full stack', 'פיתוח', 'תוכנה', 'מהנדס', 'ai developer', 'מפתח AI'],
  'מהנדס': ['engineer', 'developer', 'מפתח', 'software', 'תוכנה'],
  'בודק': ['qa', 'test', 'automation', 'quality', 'בדיקות'],
};

/**
 * Skill synonyms and related technologies
 */
const SKILL_SYNONYMS: Record<string, string[]> = {
  'react': ['reactjs', 'react.js', 'react native'],
  'node.js': ['nodejs', 'node', 'express', 'express.js'],
  'typescript': ['ts'],
  'javascript': ['js', 'ecmascript', 'es6'],
  'python': ['django', 'flask', 'fastapi'],
  'aws': ['amazon web services', 'ec2', 's3', 'lambda'],
  'docker': ['containers', 'containerization', 'docker-compose'],
  'kubernetes': ['k8s'],
  'postgresql': ['postgres', 'pg'],
  'mongodb': ['mongo', 'mongoose'],
  'ci/cd': ['continuous integration', 'continuous deployment', 'jenkins', 'github actions', 'gitlab ci'],
  'css': ['scss', 'sass', 'less', 'styled-components', 'tailwind', 'tailwindcss'],
  'html': ['html5'],
  'sql': ['mysql', 'postgresql', 'sqlite', 'mssql', 'tsql'],
  'git': ['github', 'gitlab', 'bitbucket', 'version control'],
  'agile': ['scrum', 'kanban', 'sprint'],
  'rest api': ['restful', 'api development', 'api design'],
  'graphql': ['apollo', 'hasura'],
  'linux': ['ubuntu', 'centos', 'debian', 'bash', 'shell'],
  'microservices': ['micro-services', 'service-oriented', 'distributed systems'],
  'vue': ['vuejs', 'vue.js', 'vue 3', 'nuxt', 'nuxt.js'],
  'angular': ['angularjs', 'angular.js', 'ng'],
  'next.js': ['nextjs', 'next'],
  'java': ['jvm', 'j2ee', 'jee', 'spring boot'],
  'c#': ['csharp', 'c-sharp', '.net', 'dotnet', 'asp.net'],
  'c++': ['cpp'],
  'go': ['golang'],
  'rust': ['rustlang'],
  'ruby': ['rails', 'ruby on rails', 'ror'],
  'php': ['laravel', 'symfony', 'wordpress'],
  'swift': ['ios development', 'swiftui'],
  'kotlin': ['android development'],
  'terraform': ['iac', 'infrastructure as code'],
  'elasticsearch': ['elastic', 'elk'],
  'redis': ['caching', 'in-memory'],
  'machine learning': ['ml', 'deep learning', 'neural networks'],
};

// ============================================================
// SEMANTIC MATCHING ENGINE
// Understands job descriptions like a human recruiter would —
// reads between the lines, infers implied skills, and measures
// conceptual alignment beyond just keyword matching.
// ============================================================

/**
 * Semantic skill clusters — groups of skills that naturally go together.
 * If a job mentions concepts from a cluster, a candidate who knows other
 * skills in the same cluster gets PARTIAL credit (semantic match).
 *
 * Think: "build scalable web apps" → implies React/Vue/Angular + Node/Python + DB
 */
const SEMANTIC_CLUSTERS: Record<string, { trigger: RegExp[]; impliedSkills: string[]; weight: number }> = {
  // Web application development
  'web-apps': {
    trigger: [/web\s*app/i, /web\s*develop/i, /web\s*platform/i, /web\s*application/i, /אפליקציית?\s*ווב/i, /פיתוח\s*אתרים/i],
    impliedSkills: ['javascript', 'html', 'css', 'react', 'node.js', 'typescript', 'rest api', 'git'],
    weight: 0.6, // partial credit — these are LIKELY skills, not definite
  },
  'scalable-systems': {
    trigger: [/scalab/i, /high.?throughput/i, /high.?availab/i, /distributed/i, /מערכות\s*מבוזרות/i, /עומסים/i, /performance/i],
    impliedSkills: ['docker', 'kubernetes', 'aws', 'microservices', 'redis', 'monitoring', 'linux', 'ci/cd'],
    weight: 0.5,
  },
  'api-development': {
    trigger: [/build.*api/i, /develop.*api/i, /api\s*design/i, /restful/i, /api\s*gateway/i, /פיתוח\s*API/i],
    impliedSkills: ['rest api', 'node.js', 'python', 'typescript', 'graphql', 'postgresql', 'mongodb', 'docker'],
    weight: 0.6,
  },
  'data-pipeline': {
    trigger: [/data\s*pipeline/i, /ETL/i, /data\s*warehouse/i, /data\s*lake/i, /batch\s*process/i, /real.?time\s*data/i],
    impliedSkills: ['python', 'sql', 'aws', 'docker', 'postgresql', 'redis', 'kafka', 'linux'],
    weight: 0.5,
  },
  'cloud-native': {
    trigger: [/cloud.?native/i, /serverless/i, /cloud\s*infra/i, /cloud\s*architect/i, /ענן/i, /תשתיות\s*ענן/i],
    impliedSkills: ['aws', 'docker', 'kubernetes', 'terraform', 'ci/cd', 'linux', 'microservices'],
    weight: 0.5,
  },
  'ai-powered': {
    trigger: [/AI[\s-]*powered/i, /LLM/i, /generative\s*ai/i, /GPT/i, /artificial\s*intelligen/i, /בינה\s*מלאכותית/i, /machine\s*learn/i],
    impliedSkills: ['python', 'rest api', 'docker', 'aws', 'git'],
    weight: 0.5,
  },
  'frontend-modern': {
    trigger: [/modern\s*frontend/i, /responsive/i, /SPA/i, /single.?page/i, /component.?based/i, /design\s*system/i, /UI\s*library/i],
    impliedSkills: ['react', 'typescript', 'css', 'html', 'javascript', 'figma', 'git'],
    weight: 0.6,
  },
  'devops-culture': {
    trigger: [/CI\/CD/i, /automate.*deploy/i, /infrastructure.?as.?code/i, /containeriz/i, /pipeline/i, /delivery/i],
    impliedSkills: ['docker', 'kubernetes', 'aws', 'linux', 'git', 'terraform', 'ci/cd'],
    weight: 0.5,
  },
  'startup-fullstack': {
    trigger: [/startup/i, /fast.?paced/i, /wear.*hats/i, /end.?to.?end/i, /ownership/i, /hands.?on/i, /סטארטאפ/i],
    impliedSkills: ['react', 'node.js', 'typescript', 'aws', 'docker', 'git', 'agile', 'postgresql'],
    weight: 0.4, // lower weight — very broad
  },
  'testing-quality': {
    trigger: [/test.*driven/i, /TDD/i, /quality/i, /automated\s*test/i, /testing\s*framework/i, /בדיקות\s*אוטומט/i],
    impliedSkills: ['jest', 'cypress', 'selenium', 'typescript', 'ci/cd', 'git'],
    weight: 0.5,
  },
};

/**
 * Semantic matching: analyze the job description for CONCEPTS, not just keywords.
 * Returns additional implied skill matches with a confidence weight.
 */
function semanticSkillMatch(
  jobText: string,
  candidateSkills: Set<string>,
): { semanticMatches: string[]; semanticScore: number; matchedClusters: string[] } {
  const semanticMatches: string[] = [];
  const matchedClusters: string[] = [];
  let totalWeight = 0;
  let matchedWeight = 0;

  for (const [clusterName, cluster] of Object.entries(SEMANTIC_CLUSTERS)) {
    // Check if job description triggers this cluster
    const triggered = cluster.trigger.some(t => t.test(jobText));
    if (!triggered) continue;

    matchedClusters.push(clusterName);

    // Count how many implied skills the candidate has
    const impliedHits = cluster.impliedSkills.filter(s => candidateSkills.has(s));
    if (impliedHits.length > 0) {
      const coverage = impliedHits.length / cluster.impliedSkills.length;
      totalWeight += cluster.weight;
      matchedWeight += cluster.weight * coverage;
      // Add skills the candidate matched via semantic inference
      for (const skill of impliedHits) {
        if (!semanticMatches.includes(skill)) {
          semanticMatches.push(skill);
        }
      }
    }
  }

  const semanticScore = totalWeight > 0
    ? Math.round((matchedWeight / totalWeight) * 100)
    : 0;

  return { semanticMatches, semanticScore, matchedClusters };
}

/**
 * Skill learnability map — how hard is a missing skill to pick up?
 * Used in gap analysis to determine if a near-miss is actually viable.
 * Scale: 1 = learn in a weekend, 5 = months of deep study
 */
const SKILL_LEARNABILITY: Record<string, number> = {
  // Easy (1-2): Can learn in days/weeks
  'git': 1, 'html': 1, 'css': 1, 'agile': 1, 'scrum': 1, 'jira': 1,
  'tailwind': 1, 'bootstrap': 1, 'sass': 1, 'vite': 1, 'webpack': 1,
  'jest': 1, 'figma': 1, 'rest api': 1, 'graphql': 2,
  'docker': 2, 'typescript': 2, 'next.js': 2, 'prisma': 2, 'redux': 2,
  'mongodb': 2, 'redis': 2, 'cypress': 2, 'playwright': 2, 'storybook': 2,

  // Medium (3): Weeks to months
  'react': 3, 'vue': 3, 'angular': 3, 'node.js': 3, 'express': 3,
  'python': 3, 'sql': 3, 'postgresql': 3, 'mysql': 3,
  'aws': 3, 'azure': 3, 'gcp': 3, 'linux': 3, 'ci/cd': 3,
  'kubernetes': 3, 'terraform': 3, 'elasticsearch': 3,
  'django': 3, 'flask': 3, 'spring': 3,

  // Hard (4-5): Months of deep work
  'java': 4, 'c#': 4, 'c++': 5, 'go': 4, 'rust': 5, 'scala': 4,
  'machine learning': 5, 'deep learning': 5, 'system design': 4,
  'microservices': 4, 'kafka': 4, 'architecture': 4,
};

/**
 * Analyze the gap between candidate and job — for "almost matching" jobs,
 * returns actionable insight about what's missing and how hard it is to learn.
 */
function analyzeSkillGap(
  matchedMustHave: string[],
  missingMustHave: string[],
  matchedNiceToHave: string[],
  missingNiceToHave: string[],
): { gapScore: number; gapLevel: 'EASY' | 'MODERATE' | 'HARD' | 'MAJOR'; learnableSkills: string[]; hardSkills: string[]; gapMessage: string } {
  // Calculate how learnable the missing skills are
  const learnableSkills: string[] = [];
  const hardSkills: string[] = [];
  let totalDifficulty = 0;

  for (const skill of missingMustHave) {
    const difficulty = SKILL_LEARNABILITY[skill] || 3;
    totalDifficulty += difficulty;
    if (difficulty <= 2) {
      learnableSkills.push(skill);
    } else {
      hardSkills.push(skill);
    }
  }

  // Gap score: 100 = no gap, 0 = huge gap
  const totalMust = matchedMustHave.length + missingMustHave.length;
  if (totalMust === 0) return { gapScore: 100, gapLevel: 'EASY', learnableSkills: [], hardSkills: [], gapMessage: '' };

  const coverageRatio = matchedMustHave.length / totalMust;
  const avgDifficulty = missingMustHave.length > 0 ? totalDifficulty / missingMustHave.length : 0;

  // Boost score if missing skills are easy to learn
  const learnabilityBonus = learnableSkills.length > 0
    ? (learnableSkills.length / missingMustHave.length) * 15
    : 0;

  const gapScore = Math.round(Math.min(100, coverageRatio * 85 + learnabilityBonus));

  let gapLevel: 'EASY' | 'MODERATE' | 'HARD' | 'MAJOR';
  if (missingMustHave.length === 0) gapLevel = 'EASY';
  else if (missingMustHave.length <= 2 && avgDifficulty <= 2.5) gapLevel = 'EASY';
  else if (missingMustHave.length <= 3 && avgDifficulty <= 3) gapLevel = 'MODERATE';
  else if (missingMustHave.length <= 5) gapLevel = 'HARD';
  else gapLevel = 'MAJOR';

  // Build actionable message
  let gapMessage = '';
  if (learnableSkills.length > 0 && hardSkills.length === 0) {
    gapMessage = `חסר לך ${learnableSkills.join(', ')} — אפשר ללמוד תוך ימים/שבועות`;
  } else if (learnableSkills.length > 0 && hardSkills.length > 0) {
    gapMessage = `${learnableSkills.join(', ')} קל ללמוד, אבל ${hardSkills.join(', ')} דורש השקעה משמעותית`;
  } else if (hardSkills.length > 0) {
    gapMessage = `חסר: ${hardSkills.join(', ')} — דורש לימוד מעמיק`;
  }

  return { gapScore, gapLevel, learnableSkills, hardSkills, gapMessage };
}

// ============================================================
// JOB REQUIREMENTS EXTRACTION
// ============================================================

/**
 * Extract what the job ACTUALLY requires — parse the requirements/description
 * to find "must have" vs "nice to have" skills.
 */
function extractJobRequirements(desc: string, reqs: string, jobTitle: string = ''): {
  mustHave: string[];
  niceToHave: string[];
  allMentioned: string[];
} {
  const fullText = `${desc} ${reqs}`.toLowerCase();
  const title = jobTitle.toLowerCase();
  const mustHave: string[] = [];
  const niceToHave: string[] = [];
  const allMentioned: string[] = [];

  // All tech terms we can detect
  const ALL_TECH = [
    'react', 'vue', 'angular', 'svelte', 'next.js', 'nuxt',
    'node.js', 'express', 'fastify', 'nestjs', 'koa',
    'typescript', 'javascript', 'python', 'java', 'c#', 'c++', 'go', 'golang', 'rust', 'ruby', 'php', 'scala', 'kotlin', 'swift', 'dart',
    'aws', 'azure', 'gcp', 'google cloud',
    'docker', 'kubernetes', 'terraform', 'ansible', 'helm',
    'postgresql', 'mongodb', 'redis', 'mysql', 'elasticsearch', 'dynamodb', 'cassandra', 'neo4j',
    'graphql', 'rest api', 'grpc', 'websocket',
    'microservices', 'monolith', 'serverless', 'event-driven',
    'ci/cd', 'jenkins', 'github actions', 'gitlab ci', 'circleci',
    'git', 'linux', 'nginx', 'apache',
    'rabbitmq', 'kafka', 'sqs', 'pubsub',
    'html', 'css', 'sass', 'tailwind', 'bootstrap', 'material ui',
    'webpack', 'vite', 'rollup', 'babel',
    'prisma', 'sequelize', 'typeorm', 'mongoose', 'knex',
    'jest', 'mocha', 'cypress', 'playwright', 'selenium', 'testing',
    'figma', 'photoshop', 'sketch', 'ui/ux', 'design system',
    'agile', 'scrum', 'kanban', 'jira', 'confluence',
    'system design', 'architecture', 'design patterns', 'solid',
    'machine learning', 'deep learning', 'nlp', 'computer vision', 'pytorch', 'tensorflow',
    'react native', 'flutter', 'ios', 'android', 'mobile',
    'devops', 'sre', 'monitoring', 'observability', 'datadog', 'grafana', 'prometheus',
    'security', 'oauth', 'jwt', 'encryption',
    'sql', 'nosql', 'data modeling',
    'product management', 'project management',
    'communication', 'leadership', 'mentoring', 'team management',
    'english', 'hebrew',
  ];

  // Detect "must have" zones in the text
  const mustHaveZones: string[] = [];
  const niceToHaveZones: string[] = [];

  // Split text into sections based on common headers
  const mustPatterns = [
    /(?:requirements|דרישות|must.?have|חובה|required|what you.?(?:ll )?need|what we.?(?:re )?looking for|qualifications|experience required|prerequisites|תנאי סף)[:\s\-]*([\s\S]*?)(?=(?:nice|bonus|plus|advantage|יתרון|preferred|$))/gi,
  ];
  const nicePatterns = [
    /(?:nice.?to.?have|bonus|advantage|יתרון|preferred|plus|extra|good to have)[:\s\-]*([\s\S]*?)(?=(?:\n\n|\n[A-Z]|$))/gi,
  ];

  for (const pattern of mustPatterns) {
    let match;
    while ((match = pattern.exec(fullText)) !== null) {
      mustHaveZones.push(match[1] || match[0]);
    }
  }
  for (const pattern of nicePatterns) {
    let match;
    while ((match = pattern.exec(fullText)) !== null) {
      niceToHaveZones.push(match[1] || match[0]);
    }
  }

  const mustZoneText = mustHaveZones.join(' ');
  const niceZoneText = niceToHaveZones.join(' ');

  for (const tech of ALL_TECH) {
    if (fullText.includes(tech)) {
      allMentioned.push(tech);

      if (mustZoneText.includes(tech)) {
        mustHave.push(tech);
      } else if (niceZoneText.includes(tech)) {
        niceToHave.push(tech);
      } else {
        // No clear must-have/nice-to-have zone detected.
        // In reality, job descriptions are WISH LISTS — most listed skills are
        // nice-to-have, only 3-5 are truly critical. Without clear markers,
        // only put skills found in the TITLE as must-have; the rest are nice-to-have.
        if (title.includes(tech)) {
          mustHave.push(tech);
        } else {
          niceToHave.push(tech);
        }
      }
    }
  }

  return {
    mustHave: [...new Set(mustHave)],
    niceToHave: [...new Set(niceToHave)],
    allMentioned: [...new Set(allMentioned)],
  };
}

/**
 * Score a single job against a user profile — LOCALLY, no API call.
 *
 * PHILOSOPHY: The score answers ONE question:
 * "כמה סיכוי יש לי להתאים לתפקיד הזה ביחס ליכולות שלי?"
 * = How likely am I to be a real professional fit for this job?
 *
 * This is NOT about "would I like the job" — it's about honest professional match.
 * A score of 80+ means: you cover most requirements, right experience level, relevant background.
 * A score of 40 means: significant gaps exist, you'd need to learn a lot.
 */
export function scoreJobLocally(
  job: { title: string; company: string; description?: string; requirements?: string; location?: string; experienceLevel?: string },
  profileAnalysis: ProfileAnalysis,
  preferences: any
): SmartScore {
  const title = (job.title || '').toLowerCase();
  const desc = (job.description || '').toLowerCase();
  const reqs = (job.requirements || '').toLowerCase();
  const fullText = `${title} ${desc} ${reqs}`;
  const jobLocation = (job.location || '').toLowerCase();

  // ----------------------------------------------------------
  // STEP 1: Extract what the job ACTUALLY requires
  // ----------------------------------------------------------
  const jobReqs = extractJobRequirements(desc, reqs, title);

  // ----------------------------------------------------------
  // STEP 2: Build expanded set of candidate skills
  // ----------------------------------------------------------
  const allCandidateSkills = [
    ...profileAnalysis.coreSkills,
    ...profileAnalysis.inferredSkills,
    ...profileAnalysis.techStack,
    ...profileAnalysis.languages,
  ];

  const expandedSkills = new Set<string>();
  for (const skill of allCandidateSkills) {
    expandedSkills.add(skill);
    const syns = SKILL_SYNONYMS[skill];
    if (syns) syns.forEach(s => expandedSkills.add(s));
    for (const [key, vals] of Object.entries(SKILL_SYNONYMS)) {
      if (vals.includes(skill)) expandedSkills.add(key);
    }
  }

  // Check if candidate has enough skills to properly evaluate
  const candidateHasSkills = expandedSkills.size >= 3;

  // ----------------------------------------------------------
  // STEP 2.5: SEMANTIC MATCHING — understand the job BEYOND keywords
  // "The job says 'build scalable web applications' — that MEANS React/Node/Docker"
  // ----------------------------------------------------------
  const semantic = semanticSkillMatch(fullText, expandedSkills);

  // Semantic bonus: if the job description implies skills the candidate has
  // (even without explicitly naming them), boost the match
  // This is added as a separate signal, not mixed into keyword matching
  const semanticBonus = semantic.semanticScore > 0
    ? Math.round(semantic.semanticScore * 0.15) // Max ~15 points from semantic
    : 0;

  // ----------------------------------------------------------
  // STEP 3: REQUIREMENTS COVERAGE (50% of total score)
  // "How many of the job's actual requirements do I meet?"
  // This is the CORE of the score — honest gap analysis.
  // ----------------------------------------------------------
  const matchedMustHave: string[] = [];
  const missingMustHave: string[] = [];
  const matchedNiceToHave: string[] = [];
  const missingNiceToHave: string[] = [];

  for (const skill of jobReqs.mustHave) {
    if (expandedSkills.has(skill)) {
      matchedMustHave.push(skill);
    } else {
      // Check if we have a synonym
      let found = false;
      for (const [key, vals] of Object.entries(SKILL_SYNONYMS)) {
        if ((key === skill || vals.includes(skill)) && (expandedSkills.has(key) || vals.some(v => expandedSkills.has(v)))) {
          matchedMustHave.push(skill);
          found = true;
          break;
        }
      }
      if (!found) missingMustHave.push(skill);
    }
  }

  for (const skill of jobReqs.niceToHave) {
    if (expandedSkills.has(skill)) {
      matchedNiceToHave.push(skill);
    } else {
      let found = false;
      for (const [key, vals] of Object.entries(SKILL_SYNONYMS)) {
        if ((key === skill || vals.includes(skill)) && (expandedSkills.has(key) || vals.some(v => expandedSkills.has(v)))) {
          matchedNiceToHave.push(skill);
          found = true;
          break;
        }
      }
      if (!found) missingNiceToHave.push(skill);
    }
  }

  // Calculate requirements coverage score
  //
  // KEY INSIGHT: Job descriptions are wish lists. Even a PERFECT candidate
  // typically matches 60-70% of listed technologies. A score of 100 would mean
  // you literally know every single thing they mentioned — almost never happens.
  //
  // Real-world calibration:
  //   Match 80%+ of must-haves → you're a top candidate (score ~90)
  //   Match 60%+ of must-haves → strong candidate, worth applying (score ~75)
  //   Match 40%+ of must-haves → decent shot, gaps are learnable (score ~55)
  //   Match <30% of must-haves → significant gaps (score ~30)
  //
  const totalMustHave = matchedMustHave.length + missingMustHave.length;
  const totalNiceToHave = matchedNiceToHave.length + missingNiceToHave.length;
  const totalAll = matchedMustHave.length + matchedNiceToHave.length + missingMustHave.length + missingNiceToHave.length;

  let requirementsCoverage: number;

  if (totalMustHave > 0) {
    const mustHaveRatio = matchedMustHave.length / totalMustHave;
    const niceRatio = totalNiceToHave > 0 ? matchedNiceToHave.length / totalNiceToHave : 0.5;

    // Apply realistic curve calibrated to real-world job description norms:
    //   Job descriptions are wish lists. Matching 60% of must-haves makes
    //   you a strong candidate in practice, so the curve is generous above
    //   the 25% baseline.
    //
    //   mustHaveRatio  rawMust   → curvedMust  (× 0.65 + nice × 0.35)
    //   0.25 (25%)     25        →  22         (≈ 14 + nice)
    //   0.40 (40%)     40        →  42         (≈ 27 + nice)
    //   0.50 (50%)     50        →  55         (≈ 36 + nice)  — "decent shot"
    //   0.60 (60%)     60        →  68         (≈ 44 + nice)  — "strong"
    //   0.80 (80%)     80        →  94         (≈ 61 + nice)  — "top candidate"
    //   1.00 (100%)    100       → 100         (≈ 65 + nice)
    const rawMustScore = mustHaveRatio * 100;
    let curvedMustScore: number;
    if (rawMustScore <= 25) {
      curvedMustScore = rawMustScore * 0.9;            // Below 25% → modest penalty
    } else {
      curvedMustScore = 25 * 0.9 + (rawMustScore - 25) * 1.3;  // Above 25% → generous curve
    }
    const clampedMust = Math.min(100, curvedMustScore);

    // Must-haves 65%, nice-to-haves 35% — slightly more weight to nice-to-haves
    // because many "must-haves" in job posts are really nice-to-haves
    requirementsCoverage = Math.round(clampedMust * 0.65 + niceRatio * 100 * 0.35);
  } else if (totalNiceToHave > 0) {
    // No clear must-haves — all skills treated as nice-to-have (less harsh)
    const niceRatio = matchedNiceToHave.length / totalNiceToHave;
    // Curve: matching half of nice-to-haves = pretty good (70+)
    requirementsCoverage = Math.round(Math.min(100, niceRatio * 100 * 1.2 + 15));
  } else {
    // Job doesn't list specific tech — use general skill overlap
    const descSkillHits = [...expandedSkills].filter(s => fullText.includes(s)).length;
    const allDescSkills = jobReqs.allMentioned.length;
    if (allDescSkills > 0) {
      const ratio = descSkillHits / Math.max(allDescSkills, descSkillHits);
      requirementsCoverage = Math.round(Math.min(100, ratio * 100 * 1.2 + 15));
    } else {
      requirementsCoverage = 35; // Unknown requirements — cautious score, rely on role alignment
    }
  }

  // Only penalize hard if missing ALL or nearly all must-haves
  // — but NOT when the candidate profile is too thin to evaluate
  if (totalMustHave >= 4 && matchedMustHave.length <= 1 && candidateHasSkills) {
    requirementsCoverage = Math.min(requirementsCoverage, 25);
  }

  // If candidate profile is thin (< 3 skills), use a softer floor to avoid
  // rejecting everything. The user just hasn't uploaded their CV yet.
  if (!candidateHasSkills) {
    requirementsCoverage = Math.max(requirementsCoverage, 45);
  }

  // ----------------------------------------------------------
  // STEP 4: EXPERIENCE & SENIORITY FIT (25% of total score)
  // "Am I at the right career level for this role?"
  // ----------------------------------------------------------
  const jobExpLevel = (job.experienceLevel || '').toLowerCase();
  const years = profileAnalysis.experienceYears;
  const candidateIsStudent = profileAnalysis.seniorityLevel === 'JUNIOR' && years <= 1;
  const candidateIsJunior = profileAnalysis.seniorityLevel === 'JUNIOR';

  // Detect job seniority level from title and description
  const seniorityMap: Record<string, number> = {
    'intern': 0, 'סטודנט': 0, 'student': 0, 'התמחות': 0, 'internship': 0,
    'junior': 1, "ג'וניור": 1, 'ג׳וניור': 1, 'entry': 1, 'entry level': 1, 'entry-level': 1, 'graduate': 1,
    'mid': 2, 'middle': 2, 'regular': 2, 'בינוני': 2,
    'senior': 3, 'סניור': 3, 'בכיר': 3, 'experienced': 3, 'sr.': 3, 'sr ': 3,
    'lead': 4, 'principal': 4, 'staff': 4, 'architect': 4, 'מוביל': 4, 'head': 4, 'ראש צוות': 4,
    'director': 5, 'vp': 5, 'cto': 5, 'manager': 4,
  };

  const candidateLevelNum = { JUNIOR: 1, MID: 2, SENIOR: 3, LEAD: 4 }[profileAnalysis.seniorityLevel] || 2;
  let detectedJobLevel = -1;

  // Check title first, then description
  for (const [keyword, level] of Object.entries(seniorityMap)) {
    if (title.includes(keyword) || jobExpLevel.includes(keyword)) {
      detectedJobLevel = level;
      break;
    }
  }

  // Parse ALL mentions of required years in the job text
  const yearsPatterns = fullText.matchAll(/(\d+)\+?\s*(?:years?|שנ|שנות|שנים)/g);
  let jobRequiredYears = 0;
  for (const m of yearsPatterns) {
    const y = parseInt(m[1]);
    if (y > jobRequiredYears && y <= 20) jobRequiredYears = y;
  }

  // If no seniority keyword in title, infer from required years
  if (detectedJobLevel < 0 && jobRequiredYears > 0) {
    if (jobRequiredYears <= 1) detectedJobLevel = 0;       // intern/student
    else if (jobRequiredYears <= 2) detectedJobLevel = 1;   // junior
    else if (jobRequiredYears <= 5) detectedJobLevel = 2;   // mid
    else if (jobRequiredYears <= 8) detectedJobLevel = 3;   // senior
    else detectedJobLevel = 4;                               // lead+
  }

  // Calculate experience score
  let experienceScore: number;

  if (detectedJobLevel >= 0) {
    const diff = candidateLevelNum - detectedJobLevel;
    if (diff === 0) {
      experienceScore = 92; // Exact level match — great!
    } else if (diff === 1) {
      experienceScore = 68; // Slightly overqualified
    } else if (diff === -1) {
      experienceScore = 45; // One level up — stretch
    } else if (diff >= 2) {
      experienceScore = 30; // Way overqualified
    } else if (diff <= -2) {
      experienceScore = 10; // Significantly under-leveled
    } else {
      experienceScore = 50;
    }

    // Student/junior explicit level match bonus
    if (candidateIsStudent && detectedJobLevel === 0) {
      experienceScore = 95; // Student applying for student/intern position
    } else if (candidateIsJunior && detectedJobLevel <= 1) {
      experienceScore = 90; // Junior applying for junior/intern position
    }

    // Student vs senior = almost no chance
    if (candidateIsStudent && detectedJobLevel >= 3) {
      experienceScore = 5;
    } else if (candidateIsJunior && detectedJobLevel >= 3) {
      experienceScore = 10;
    }
  } else if (jobRequiredYears > 0) {
    // No seniority keyword, but years are mentioned
    if (years >= jobRequiredYears && years <= jobRequiredYears + 4) {
      experienceScore = 90;
    } else if (years >= jobRequiredYears) {
      experienceScore = 75;
    } else if (years >= jobRequiredYears - 1) {
      experienceScore = 60;
    } else {
      experienceScore = Math.max(5, 30 - (jobRequiredYears - years) * 8);
    }
  } else {
    // No seniority info at all — many job posts simply don't mention level,
    // especially on Israeli boards. Being too pessimistic here kills the
    // score for juniors/students on jobs that might actually be open to them.
    if (candidateIsStudent) {
      experienceScore = 45; // Unknown level — give benefit of the doubt
    } else if (candidateIsJunior) {
      experienceScore = 50; // Many unlabeled jobs accept juniors
    } else {
      experienceScore = 60; // Mid-level default — neutral
    }
  }

  // ----------------------------------------------------------
  // STEP 5: ROLE ALIGNMENT (20% of total score)
  // "Is this the kind of work I actually do / can do?"
  // ----------------------------------------------------------
  let roleScore = 15; // Low base — must EARN role relevance via actual matches

  const targetRoles = profileAnalysis.targetRoles.map(r => r.toLowerCase());
  const previousRoles = profileAnalysis.previousRoles;

  // Strip seniority prefixes for fuzzy matching — "Software Developer Student" should match "Software Developer"
  const stripSeniority = (s: string) => s.replace(/\b(senior|junior|lead|sr\.?|jr\.?|student|intern|סטודנט|ג'וניור|סניור|בכיר|מוביל)\b/gi, '').replace(/\s+/g, ' ').trim();
  const cleanTitle = stripSeniority(title);

  // Direct title match with target roles
  for (const target of targetRoles) {
    const cleanTarget = stripSeniority(target);
    // Exact match (after stripping seniority)
    if (cleanTitle.includes(cleanTarget) || cleanTarget.includes(cleanTitle)) {
      roleScore = 95;
      break;
    }
    // Also check original
    if (title.includes(target) || target.includes(cleanTitle)) {
      roleScore = 95;
      break;
    }
    // Multi-word partial match — "Software Developer" matches "Full Stack Software Developer"
    const words = cleanTarget.split(/\s+/).filter(w => w.length > 2);
    if (words.length > 0) {
      const matchCount = words.filter(w => cleanTitle.includes(w)).length;
      if (matchCount >= Math.ceil(words.length * 0.5)) {
        roleScore = Math.max(roleScore, 85);
      }
    }
    // Individual significant word match — "developer" in target matches "developer" in title
    for (const w of words) {
      if (w.length >= 4 && cleanTitle.includes(w)) {
        roleScore = Math.max(roleScore, 70);
      }
    }
  }

  // Match with previous roles
  for (const prevRole of previousRoles) {
    const prev = prevRole.toLowerCase();
    if (title.includes(prev) || prev.includes(title.replace(/senior |junior |lead |sr\.? |jr\.? /g, '').trim())) {
      roleScore = Math.max(roleScore, 90);
    }
    // Partial word match
    const words = prev.split(/\s+/).filter(w => w.length > 2);
    if (words.length > 0) {
      const matchCount = words.filter(w => title.includes(w)).length;
      if (matchCount >= Math.ceil(words.length * 0.5)) {
        roleScore = Math.max(roleScore, 75);
      }
    }
  }

  // Role adjacency — someone who did X can realistically do Y
  for (const prevRole of [...previousRoles.map(r => r.toLowerCase()), ...targetRoles]) {
    for (const [roleKey, adjacentRoles] of Object.entries(ROLE_ADJACENCY)) {
      if (prevRole.includes(roleKey) || roleKey.includes(prevRole)) {
        for (const adj of adjacentRoles) {
          if (title.includes(adj)) {
            roleScore = Math.max(roleScore, 65); // Adjacent = realistic but needs adaptation
            break;
          }
        }
      }
    }
  }

  // Domain overlap — if job is in a domain you've worked in, boost
  let domainOverlap = false;
  for (const domain of profileAnalysis.domains) {
    if (fullText.includes(domain)) {
      domainOverlap = true;
      roleScore = Math.max(roleScore, Math.min(roleScore + 15, 85));
    }
  }

  // If role score is still low but skills match well, boost role score
  // (means: the tools are right even if the title is different — common in tech)
  if (roleScore <= 30 && requirementsCoverage >= 65) {
    roleScore = Math.max(roleScore, 50); // "Different title, similar skillset"
  }
  if (roleScore <= 30 && requirementsCoverage >= 50) {
    roleScore = Math.max(roleScore, 40); // Some overlap in tools
  }

  // ----------------------------------------------------------
  // STEP 6: LOCATION (5% of total — minor factor)
  // ----------------------------------------------------------
  const CITY_ALIASES: Record<string, string[]> = {
    'tel aviv': ['תל אביב', 'ת"א', "ת\"א", 'tlv', 'tel-aviv', 'תל אביב-יפו', 'tel aviv-yafo', 'tel aviv yafo'],
    'jerusalem': ['ירושלים'],
    'haifa': ['חיפה'],
    'herzliya': ['הרצליה'],
    'ramat gan': ['רמת גן', 'ר"ג', "ר\"ג", 'ramat-gan'],
    'petah tikva': ['פתח תקווה', 'פתח תקוה', 'petach tikva', 'petah-tikva'],
    'rishon lezion': ['ראשון לציון', 'rishon-letzion'],
    'netanya': ['נתניה'],
    'beer sheva': ['באר שבע', 'beersheba', 'be\'er sheva'],
    'rehovot': ['רחובות'],
    'modiin': ['מודיעין', "מודיעין-מכבים-רעות"],
    'kfar saba': ['כפר סבא'],
    'ra\'anana': ['רעננה', 'raanana'],
    'bnei brak': ['בני ברק'],
    'holon': ['חולון'],
    'bat yam': ['בת ים'],
    'ashdod': ['אשדוד'],
    'ashkelon': ['אשקלון'],
    'yokneam': ['יקנעם'],
    'caesarea': ['קיסריה'],
  };

  let locationScore = 70;

  const preferredLocations = (preferences?.preferredLocations || []).map((l: string) => l.toLowerCase());
  const preferredWorkType = (preferences?.preferredWorkType || '').toLowerCase();

  if (preferredLocations.length > 0 && jobLocation) {
    const locationMatches = preferredLocations.some((loc: string) => {
      if (jobLocation.includes(loc) || loc.includes(jobLocation)) return true;
      // Check aliases
      for (const [canonical, aliases] of Object.entries(CITY_ALIASES)) {
        const allForms = [canonical, ...aliases];
        const locMatchesAlias = allForms.some(a => loc.includes(a) || a.includes(loc));
        const jobMatchesAlias = allForms.some(a => jobLocation.includes(a) || a.includes(jobLocation));
        if (locMatchesAlias && jobMatchesAlias) return true;
      }
      return false;
    });
    locationScore = locationMatches ? 95 : 50;
  }
  if (preferredWorkType === 'remote' && (fullText.includes('remote') || fullText.includes('מרחוק'))) {
    locationScore = Math.max(locationScore, 95);
  }
  if (preferredWorkType === 'hybrid' && (fullText.includes('hybrid') || fullText.includes('היברידי'))) {
    locationScore = Math.max(locationScore, 90);
  }

  // ----------------------------------------------------------
  // STEP 6.5: TECH RELEVANCE GATE
  // "Is this even a tech/dev job at all?"
  // If the job has ZERO skill overlap with the candidate AND the title
  // doesn't match any tech role pattern, it's probably irrelevant garbage
  // from a broad search. Hard-cap the score.
  // ----------------------------------------------------------
  const TECH_ROLE_PATTERNS = [
    'developer', 'engineer', 'architect', 'devops', 'sre', 'qa', 'tester',
    'programmer', 'coder', 'software', 'data', 'analyst', 'fullstack', 'full stack',
    'full-stack', 'frontend', 'front-end', 'backend', 'back-end', 'web ',
    'mobile', 'ios', 'android', 'cloud', 'security', 'cyber', 'ml', 'ai ',
    'machine learning', 'product manager', 'scrum', 'agile', 'tech lead',
    'it ', 'information technology', 'system', 'database', 'dba', 'bi ',
    'business intelligence', 'automation', 'integration',
    // Modern/emerging role patterns (2024-2026)
    'llm', 'generative ai', 'prompt engineer', 'ai application', 'ai developer',
    'mlops', 'devsecops', 'finops', 'platform engineer', 'reliability',
    'design engineer', 'creative technolog', 'design system', 'developer experience',
    'devrel', 'developer advocate', 'sdk', 'growth engineer', 'product engineer',
    'accessibility', 'performance engineer', 'internal tools', 'workflow',
    'api engineer', 'infrastructure engineer', 'solutions engineer',
    // Hebrew
    'מפתח', 'מהנדס', 'תוכנה', 'פיתוח', 'מנתח', 'בודק', 'QA', 'דאטה', 'מערכות',
    'טכנולוג', 'אינטגרציה', 'אוטומציה', 'סייבר', 'אבטחת מידע',
    'בינה מלאכותית', 'למידת מכונה',
    'qlik', 'tableau', 'power bi', 'crm', 'erp', 'sap', 'salesforce',
  ];

  const titleHasTechPattern = TECH_ROLE_PATTERNS.some(p => title.includes(p));
  const totalSkillOverlap = jobReqs.allMentioned.length > 0
    ? [...expandedSkills].filter(s => jobReqs.allMentioned.includes(s)).length
    : [...expandedSkills].filter(s => fullText.includes(s)).length;

  // If candidate has very few skills (empty/new profile), skip the tech gate entirely
  // — we can't determine relevance without a baseline to compare against
  let isTechRelevant = titleHasTechPattern || totalSkillOverlap >= 2;

  if (!isTechRelevant && candidateHasSkills) {
    // Check if description has enough tech overlap to still be relevant
    const descTechHits = [...expandedSkills].filter(s => fullText.includes(s)).length;
    if (descTechHits >= 3) {
      isTechRelevant = true;
    }
  }

  // If candidate profile is too thin, assume relevance from job title/keywords
  if (!candidateHasSkills) {
    isTechRelevant = true; // Don't penalize when we can't evaluate
  }

  // ----------------------------------------------------------
  // STEP 6.6: GAP ANALYSIS — for "almost matching" jobs
  // ----------------------------------------------------------
  const gapAnalysis = analyzeSkillGap(matchedMustHave, missingMustHave, matchedNiceToHave, missingNiceToHave);

  // ----------------------------------------------------------
  // STEP 7: OVERALL SCORE — weighted by professional fit
  // ----------------------------------------------------------
  let overallScore = Math.round(
    requirementsCoverage * 0.50 +  // 50%: Do I meet the requirements?
    experienceScore * 0.25 +       // 25%: Am I at the right level?
    roleScore * 0.20 +             // 20%: Is this my kind of role?
    locationScore * 0.05           //  5%: Location (minor)
  );

  // SEMANTIC BONUS: Add points for conceptual alignment beyond keywords
  // Capped to avoid inflating weak matches — only helps when base score is decent
  if (semanticBonus > 0 && overallScore >= 30) {
    overallScore = Math.min(100, overallScore + semanticBonus);
  }

  // GAP ANALYSIS BOOST: If missing skills are easy to learn, give a small boost
  // This is the "balanced" approach — not aggressive, but acknowledges learnable gaps
  if (gapAnalysis.gapLevel === 'EASY' && overallScore >= 35 && overallScore < 65) {
    overallScore = Math.min(100, overallScore + 5); // Small nudge for easily closeable gaps
  }

  // TECH RELEVANCE GATE: Non-tech jobs are penalized but NOT hard-capped.
  // A hard cap of 20 was too aggressive — jobs like "Operations Engineer"
  // or Hebrew-titled tech roles sometimes miss pattern matching but still
  // have genuine skill overlap. Use a multiplier so skill-matched jobs
  // can still surface, but jobs with zero overlap score very low.
  if (!isTechRelevant) {
    overallScore = Math.round(overallScore * 0.45);
    roleScore = Math.min(roleScore, 25);
  }

  // ----------------------------------------------------------
  // STEP 8: GREEN FLAGS & RED FLAGS
  // ----------------------------------------------------------
  const greenFlags: string[] = [];
  const redFlags: string[] = [];

  if (matchedMustHave.length >= 3) greenFlags.push(`עומד ב-${matchedMustHave.length}/${totalMustHave} דרישות חובה`);
  if (matchedMustHave.length === totalMustHave && totalMustHave > 0) greenFlags.push('עומד בכל דרישות החובה!');
  if (roleScore >= 85) greenFlags.push('התפקיד מתאים לרקע המקצועי שלך');
  if (semantic.matchedClusters.length > 0) greenFlags.push(`התאמה סמנטית: ${semantic.matchedClusters.slice(0, 2).join(', ')}`);
  if (gapAnalysis.gapLevel === 'EASY' && missingMustHave.length > 0) greenFlags.push(`הפער קטן וניתן לסגירה: ${gapAnalysis.learnableSkills.join(', ')}`);
  if (experienceScore >= 85) greenFlags.push('רמת הניסיון בדיוק מתאימה');
  if (domainOverlap) greenFlags.push('ניסיון בתחום הרלוונטי');

  const TOP_COMPANIES = ['google', 'microsoft', 'meta', 'amazon', 'apple', 'netflix', 'openai', 'anthropic',
    'stripe', 'monday', 'wix', 'check point', 'cyberark', 'palo alto', 'fiverr',
    'similarweb', 'gett', 'via', 'mobileye', 'intel', 'nvidia', 'qualcomm'];
  if (TOP_COMPANIES.some(c => (job.company || '').toLowerCase().includes(c))) {
    greenFlags.push('חברה מובילה');
  }

  if (gapAnalysis.gapMessage) redFlags.push(gapAnalysis.gapMessage);
  else if (missingMustHave.length >= 3) redFlags.push(`חסרים ${missingMustHave.length} דרישות חובה: ${missingMustHave.slice(0, 3).join(', ')}`);
  else if (missingMustHave.length > 0) redFlags.push(`חסרים: ${missingMustHave.join(', ')}`);
  if (experienceScore <= 30) redFlags.push('פער ניסיון משמעותי');
  if (detectedJobLevel >= 0 && candidateLevelNum - detectedJobLevel <= -2) redFlags.push('רמת הבכירות גבוהה מידי');
  if (detectedJobLevel >= 0 && candidateLevelNum - detectedJobLevel >= 3) redFlags.push('תפקיד מתחת לרמה שלך');
  if (roleScore <= 25) redFlags.push('תחום שונה מהניסיון שלך');
  if (!isTechRelevant) redFlags.push('לא נראה כתפקיד טכנולוגי/פיתוח');

  // ----------------------------------------------------------
  // STEP 9: CATEGORY & REASONING
  // ----------------------------------------------------------
  let category: SmartScore['category'];
  if (overallScore >= 78) category = 'PERFECT';
  else if (overallScore >= 65) category = 'STRONG';
  else if (overallScore >= 52) category = 'GOOD';
  else if (overallScore >= 40) category = 'POSSIBLE';
  else if (overallScore >= 28) category = 'STRETCH';
  else category = 'WEAK';

  // Build honest reasoning in Hebrew
  let reasoning = '';
  const allMatched = [...matchedMustHave, ...matchedNiceToHave];
  const allMissing = [...missingMustHave, ...missingNiceToHave];

  if (category === 'PERFECT') {
    reasoning = `התאמה מצוינת! `;
    if (totalMustHave > 0) reasoning += `אתה עומד ב-${matchedMustHave.length}/${totalMustHave} דרישות חובה. `;
    if (roleScore >= 80) reasoning += `התפקיד ישירות בתחום שלך. `;
    if (experienceScore >= 80) reasoning += `רמת הניסיון מתאימה. `;
    reasoning += `סיכויים טובים מאוד!`;
  } else if (category === 'STRONG') {
    reasoning = `התאמה חזקה. `;
    if (totalMustHave > 0) reasoning += `אתה עומד ב-${matchedMustHave.length}/${totalMustHave} דרישות חובה. `;
    if (allMissing.length > 0) reasoning += `חסרים: ${allMissing.slice(0, 3).join(', ')}. `;
    reasoning += `שווה להגיש!`;
  } else if (category === 'GOOD') {
    reasoning = `התאמה סבירה. `;
    if (allMatched.length > 0) reasoning += `יש לך ${allMatched.length} כישורים מתאימים. `;
    if (missingMustHave.length > 0) reasoning += `חסרים ${missingMustHave.length} דרישות חובה (${missingMustHave.slice(0, 2).join(', ')}). `;
    if (roleScore >= 60) reasoning += `התפקיד קרוב לתחום שלך. `;
    else reasoning += `התפקיד דורש הסתגלות. `;
  } else if (category === 'POSSIBLE') {
    reasoning = `יש פער — `;
    if (missingMustHave.length > 0) reasoning += `חסרים ${missingMustHave.length}/${totalMustHave} דרישות חובה. `;
    if (experienceScore < 50) reasoning += `רמת הניסיון לא מספיקה. `;
    if (roleScore < 50) reasoning += `התפקיד שונה מהרקע שלך. `;
    reasoning += `אפשרי אם מוכנים ללמוד.`;
  } else if (category === 'STRETCH') {
    reasoning = `משרה מאתגרת — פערים משמעותיים. `;
    if (missingMustHave.length > 0) reasoning += `חסרים ${missingMustHave.length} דרישות חובה. `;
    if (experienceScore < 40) reasoning += `פער ניסיון. `;
    reasoning += `דורש למידה עצמית משמעותית.`;
  } else {
    reasoning = `התאמה נמוכה`;
    if (redFlags.length > 0) reasoning += ` — ${redFlags[0]}`;
    reasoning += `. כנראה לא כדאי להגיש.`;
  }

  return {
    score: overallScore,
    skillMatch: requirementsCoverage,
    experienceMatch: experienceScore,
    roleRelevance: roleScore,
    locationMatch: locationScore,
    reasoning: reasoning.trim(),
    matchedSkills: [...new Set([...matchedMustHave, ...matchedNiceToHave])].slice(0, 10),
    missingSkills: [...new Set([...missingMustHave, ...missingNiceToHave])].slice(0, 8),
    greenFlags,
    redFlags,
    category,
  };
}

// ============================================================
// EXPORT SERVICE
// ============================================================
// SKILL DEPTH PROFILING
// Not just "knows React: yes/no" but "React: 3 years, production apps, Mid-Senior"
// ============================================================

export interface SkillDepth {
  name: string;
  level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  yearsUsed: number;
  context: string[];  // e.g. ['production', 'side-project', 'course']
  confidence: number; // 0-100 how confident we are in this assessment
}

/**
 * Analyze the DEPTH of each skill from the full profile.
 * Instead of binary has/doesn't-have, we estimate proficiency.
 */
export function buildSkillDepthProfile(
  structuredProfile: any,
  rawKnowledge: any,
): SkillDepth[] {
  const skillMap = new Map<string, SkillDepth>();
  const rawText = (rawKnowledge?.content || '').toLowerCase();

  // Helper: detect context for a skill
  function detectContext(skill: string): string[] {
    const contexts: string[] = [];
    const lower = skill.toLowerCase();
    if (rawText.includes(`${lower} in production`) || rawText.includes(`built.*${lower}`)) contexts.push('production');
    if (rawText.includes(`learning ${lower}`) || rawText.includes(`course.*${lower}`)) contexts.push('course');
    return contexts.length > 0 ? contexts : ['work'];
  }

  // 1. Extract from structured experiences — gives us DURATION per skill
  if (structuredProfile?.experiences) {
    for (const exp of structuredProfile.experiences) {
      const desc = (exp.description || '').toLowerCase();
      const title = (exp.title || '').toLowerCase();

      // Calculate duration of this experience
      let durationYears = 0;
      if (exp.duration) {
        const durStr = String(exp.duration).toLowerCase();
        const yearsM = durStr.match(/(\d+)\s*(?:years?|שנ)/i);
        const monthsM = durStr.match(/(\d+)\s*(?:months?|חודש)/i);
        if (yearsM) durationYears = parseInt(yearsM[1]);
        else if (monthsM) durationYears = parseInt(monthsM[1]) / 12;
        else {
          const num = parseInt(durStr);
          if (!isNaN(num)) durationYears = num > 12 ? num / 12 : num;
        }
      } else if (exp.startDate) {
        const start = new Date(exp.startDate);
        const end = exp.endDate ? new Date(exp.endDate) : new Date();
        durationYears = (end.getTime() - start.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      }

      // Scan for skills mentioned in this experience
      const DETECTABLE_SKILLS = [
        'react', 'vue', 'angular', 'next.js', 'node.js', 'express', 'typescript', 'javascript',
        'python', 'django', 'flask', 'java', 'spring', 'kotlin', 'swift', 'go', 'rust', 'c#', '.net',
        'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform', 'ci/cd',
        'postgresql', 'mongodb', 'redis', 'mysql', 'elasticsearch',
        'graphql', 'rest api', 'microservices', 'kafka',
        'html', 'css', 'tailwind', 'sass',
        'git', 'linux', 'nginx',
        'jest', 'cypress', 'selenium', 'playwright',
        'figma', 'agile', 'scrum',
        'machine learning', 'pytorch', 'tensorflow',
        'react native', 'flutter',
      ];

      for (const skill of DETECTABLE_SKILLS) {
        if (desc.includes(skill) || title.includes(skill)) {
          const existing = skillMap.get(skill);
          if (existing) {
            existing.yearsUsed += durationYears;
            if (!existing.context.includes('production')) existing.context.push('production');
          } else {
            skillMap.set(skill, {
              name: skill,
              level: 'intermediate',
              yearsUsed: durationYears,
              context: ['production'],
              confidence: 80,
            });
          }
        }
      }
    }
  }

  // 2. Add skills from structured skills list (may not have duration)
  if (structuredProfile?.skills) {
    for (const s of structuredProfile.skills) {
      const name = (typeof s === 'string' ? s : s.name || '').toLowerCase();
      if (!name) continue;
      if (!skillMap.has(name)) {
        skillMap.set(name, {
          name,
          level: 'intermediate',
          yearsUsed: 0, // Unknown duration
          context: detectContext(name),
          confidence: 60,
        });
      }
    }
  }

  // 3. Add inferred skills (lower confidence)
  if (structuredProfile?.inferredSkills) {
    for (const s of structuredProfile.inferredSkills) {
      const name = (typeof s === 'string' ? s : s.name || '').toLowerCase();
      if (!name) continue;
      if (!skillMap.has(name)) {
        skillMap.set(name, {
          name,
          level: 'beginner',
          yearsUsed: 0,
          context: ['inferred'],
          confidence: 40,
        });
      }
    }
  }

  // 4. Determine level based on years
  for (const skill of skillMap.values()) {
    if (skill.yearsUsed >= 5) skill.level = 'expert';
    else if (skill.yearsUsed >= 3) skill.level = 'advanced';
    else if (skill.yearsUsed >= 1) skill.level = 'intermediate';
    else if (skill.yearsUsed > 0) skill.level = 'beginner';
    // If no duration but listed in skills → keep intermediate (declared skill)
  }

  return Array.from(skillMap.values()).sort((a, b) => b.yearsUsed - a.yearsUsed);
}

// ============================================================
// AI RE-RANKING — Batch analyze top jobs with AI for deep matching
// Only called for the TOP candidates after local scoring, not per-job.
// Cost: ~1 AI call per batch of 15-20 jobs (≈ $0.02)
// ============================================================

/**
 * AI re-ranks the top N jobs by sending them in a single batch to Claude.
 * The AI reads each job + the full profile and produces a deeper match score
 * with nuanced reasoning that keyword matching can't capture.
 */
export async function aiReRankJobs(
  jobs: Array<{ id: string; title: string; company: string; description: string; requirements?: string; localScore: number; localCategory: string }>,
  profileAnalysis: ProfileAnalysis,
  skillDepth: SkillDepth[],
  preferences: any,
  maxJobs: number = 20,
): Promise<Array<{ id: string; aiScore: number; aiReasoning: string; aiCategory: string; finalScore: number }>> {
  try {
    const topJobs = jobs.slice(0, maxJobs);
    if (topJobs.length === 0) return [];

    // Build a compact profile summary for AI
    const topSkills = skillDepth.slice(0, 12).map(s =>
      `${s.name} (${s.level}${s.yearsUsed > 0 ? `, ${Math.round(s.yearsUsed * 10) / 10}yr` : ''})`
    ).join(', ');

    const profileSummary = [
      `כישורים מובילים: ${topSkills}`,
      `ניסיון: ${profileAnalysis.experienceYears} שנים, רמה: ${profileAnalysis.seniorityLevel}`,
      `תפקידים קודמים: ${profileAnalysis.previousRoles.join(', ') || 'אין'}`,
      `תפקידי יעד: ${profileAnalysis.targetRoles.join(', ') || 'לא צוינו'}`,
      `דומיינים: ${profileAnalysis.domains.join(', ') || 'כללי'}`,
      `השכלה: ${profileAnalysis.educationLevel}`,
    ].join('\n');

    // Build compact job list
    const jobList = topJobs.map((j, i) => [
      `[${i + 1}] "${j.title}" @ ${j.company} (ציון מקומי: ${j.localScore}%)`,
      `תיאור: ${(j.description || '').slice(0, 300)}`,
      j.requirements ? `דרישות: ${j.requirements.slice(0, 200)}` : '',
    ].filter(Boolean).join('\n')).join('\n---\n');

    const systemPrompt = `אתה מגייס סניור עם 15 שנות ניסיון בהייטק הישראלי.
קיבלת רשימת משרות שכבר דורגו באלגוריתם מקומי. תפקידך לבצע "second opinion" — ניתוח עמוק יותר שלוקח בחשבון:

1. **התאמה קונטקסטואלית** — האם שילוב הכישורים של המועמד באמת מתאים למה שהחברה צריכה? (לא רק מילות מפתח)
2. **פוטנציאל צמיחה** — האם המשרה תקדם את הקריירה שלו?
3. **התאמה תרבותית** — האם סוג החברה (סטארטאפ/קורפורייט) מתאים לרמה שלו?
4. **מציאותיות** — האם באמת יש סיכוי שיזומן לראיון?

לכל משרה, החזר:
- aiScore: 0-100 (ציון מתוקן שלך)
- reasoning: הסבר קצר בעברית (עד 30 מילים)
- category: PERFECT/STRONG/GOOD/POSSIBLE/STRETCH/WEAK

החזר JSON array: [{"idx": 1, "aiScore": 85, "reasoning": "...", "category": "PERFECT"}, ...]`;

    const userPrompt = `פרופיל המועמד:
${profileSummary}

${topJobs.length} משרות לדירוג מחדש:
${jobList}

דרג כל משרה. החזר רק JSON array, בלי טקסט נוסף.`;

    const response = await aiClient.callAPI(systemPrompt, userPrompt, 2, 60000);
    const rankings = aiClient.parseJSON<Array<{ idx: number; aiScore: number; reasoning: string; category: string }>>(response);

    if (!Array.isArray(rankings)) {
      logger.warn('[AI-ReRank] Invalid response format, falling back to local scores');
      return topJobs.map(j => ({ id: j.id, aiScore: j.localScore, aiReasoning: '', aiCategory: j.localCategory, finalScore: j.localScore }));
    }

    // Merge AI scores with local scores: 60% AI, 40% local (AI is smarter but local is consistent)
    return topJobs.map((job, i) => {
      const aiResult = rankings.find(r => r.idx === i + 1);
      if (!aiResult) {
        return { id: job.id, aiScore: job.localScore, aiReasoning: '', aiCategory: job.localCategory, finalScore: job.localScore };
      }

      const finalScore = Math.round(aiResult.aiScore * 0.6 + job.localScore * 0.4);
      return {
        id: job.id,
        aiScore: aiResult.aiScore,
        aiReasoning: aiResult.reasoning,
        aiCategory: aiResult.category || job.localCategory,
        finalScore,
      };
    });
  } catch (err) {
    logger.error('[AI-ReRank] Failed, falling back to local scores:', err);
    return jobs.slice(0, maxJobs).map(j => ({
      id: j.id, aiScore: j.localScore, aiReasoning: '', aiCategory: j.localCategory, finalScore: j.localScore,
    }));
  }
}

// ============================================================
// TECH-STACK SEARCH STRATEGY
// Instead of searching by role title, also search by technology
// combinations. "React Node.js" catches jobs with weird titles
// that still use the candidate's exact tech stack.
// ============================================================

/**
 * Generate tech-stack-based search queries from the candidate's profile.
 * These complement title-based keywords to find jobs hidden behind non-standard titles.
 */
export function generateStackSearchQueries(
  profileAnalysis: ProfileAnalysis,
  skillDepth: SkillDepth[],
  preferences: any,
): string[] {
  const queries: string[] = [];

  // Get top skills by depth (most experienced → most relevant)
  const deepSkills = skillDepth
    .filter(s => s.level === 'advanced' || s.level === 'expert' || s.yearsUsed >= 1)
    .slice(0, 8)
    .map(s => s.name);

  // If not enough deep skills, use core skills
  const topSkills = deepSkills.length >= 3
    ? deepSkills
    : profileAnalysis.coreSkills.slice(0, 8);

  if (topSkills.length < 2) return queries;

  // Generate 2-skill combo queries (most effective on job boards)
  // Priority: pair the PRIMARY skill with secondary ones
  const primary = topSkills[0];
  for (let i = 1; i < Math.min(topSkills.length, 5); i++) {
    queries.push(`${primary} ${topSkills[i]}`);
  }

  // Add Hebrew tech queries for Israeli boards
  const hebrewMap: Record<string, string> = {
    'react': 'React מפתח', 'node.js': 'Node.js מפתח', 'python': 'Python מפתח',
    'java': 'Java מפתח', 'typescript': 'TypeScript', 'docker': 'Docker DevOps',
    'aws': 'AWS ענן', 'kubernetes': 'Kubernetes', 'angular': 'Angular מפתח',
    'vue': 'Vue.js מפתח', 'c#': 'C# .NET מפתח', 'go': 'Golang מפתח',
  };

  for (const skill of topSkills.slice(0, 3)) {
    const hebrewQuery = hebrewMap[skill];
    if (hebrewQuery) queries.push(hebrewQuery);
  }

  // Add domain-specific stack combos
  const domains = profileAnalysis.domains;
  if (domains.includes('web') && topSkills.includes('react')) {
    queries.push('React TypeScript Developer');
  }
  if (domains.includes('backend') && topSkills.includes('python')) {
    queries.push('Python Backend Developer');
  }
  if (domains.includes('devops') || topSkills.includes('docker')) {
    queries.push('Docker Kubernetes Engineer');
  }
  if (topSkills.some(s => ['python', 'pytorch', 'tensorflow'].includes(s))) {
    queries.push('AI ML Python Engineer');
  }

  // Location-qualified queries (most effective)
  const location = preferences?.preferredLocations?.[0];
  if (location && queries.length > 3) {
    // Add location to top 3 queries
    for (let i = 0; i < 3 && i < queries.length; i++) {
      queries.push(`${queries[i]} ${location}`);
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return queries.filter(q => {
    const lower = q.toLowerCase();
    if (seen.has(lower)) return false;
    seen.add(lower);
    return true;
  }).slice(0, 12);
}

// ============================================================
// FREE-TEXT SEARCH INTERPRETATION
// ============================================================

/**
 * Interprets a natural language search query into structured search parameters.
 *
 * Examples:
 *   "אני רוצה משרת פיתוח מוצר בסטרטאפים" → product dev roles at startups
 *   "fullstack but more backend heavy with Python" → backend-leaning fullstack, Python emphasis
 *   "AI roles that use React" → AI application dev with React requirement
 *   "remote positions in fintech" → fintech domain, remote filter
 */
export interface FreeTextSearchIntent {
  // Extracted search keywords for scrapers
  keywords: string[];
  hebrewKeywords: string[];
  // Scoring boost/penalty adjustments (applied on top of normal scoring)
  scoringBoosts: {
    titlePatterns: string[];     // Job titles that get +bonus
    companyTypes: string[];      // e.g., 'startup', 'enterprise', 'agency'
    domains: string[];           // e.g., 'fintech', 'healthtech', 'ecommerce'
    mustHaveSkills: string[];    // Skills the user explicitly wants to use
    preferRemote: boolean;
    preferHybrid: boolean;
  };
  // Natural language summary of what the user is looking for (Hebrew)
  intentSummary: string;
  // Original query preserved for logging
  originalQuery: string;
}

// ── Keyword extraction patterns for local fallback ──
const FREE_TEXT_ROLE_PATTERNS: Record<string, string[]> = {
  // ── Product / Founding / SaaS precision titles ──
  'פיתוח מוצר': ['Product Engineer', 'Product Developer', 'מפתח מוצר', 'Founding Engineer', 'Full Stack SaaS'],
  'product engineer': ['Product Engineer', 'Product Developer', 'SaaS Developer'],
  'מהנדס מוצר': ['Product Engineer', 'Product Developer', 'מפתח מוצר'],
  'founding': ['Founding Engineer', 'Founding Developer', 'First Engineer'],
  'founding engineer': ['Founding Engineer', 'Founding Developer', 'Early Stage Engineer'],
  'מייסד טכנולוגי': ['Founding Engineer', 'CTO', 'Technical Co-Founder'],
  'saas': ['SaaS Developer', 'Full Stack SaaS', 'SaaS Engineer', 'Product Engineer'],
  'technical product manager': ['Technical Product Manager', 'Data Product Manager', 'Technical PM'],
  'tpm': ['Technical Product Manager', 'Technical Program Manager'],
  'data product': ['Data Product Manager', 'Data PM', 'Product Analyst'],
  // ── Standard roles ──
  'פולסטאק': ['Full Stack Developer', 'Fullstack Developer', 'מפתח פולסטאק', 'Full Stack Engineer', 'Full Stack SaaS'],
  'פול סטאק': ['Full Stack Developer', 'Fullstack Developer', 'מפתח פולסטאק', 'Full Stack SaaS'],
  'full stack': ['Full Stack Developer', 'Fullstack Engineer', 'מפתח פולסטאק', 'Full Stack SaaS'],
  'fullstack': ['Full Stack Developer', 'Fullstack Engineer', 'מפתח פולסטאק', 'Product Engineer'],
  'פרונטאנד': ['Frontend Developer', 'Frontend Engineer', 'מפתח פרונטאנד', 'UI Developer'],
  'frontend': ['Frontend Developer', 'Frontend Engineer', 'מפתח פרונטאנד', 'UI Engineer'],
  'בקאנד': ['Backend Developer', 'Backend Engineer', 'מפתח בקאנד', 'Server Developer'],
  'backend': ['Backend Developer', 'Backend Engineer', 'מפתח בקאנד', 'Server Engineer'],
  'devops': ['DevOps Engineer', 'מהנדס DevOps', 'Platform Engineer', 'SRE', 'Infrastructure Engineer'],
  'דבאופס': ['DevOps Engineer', 'מהנדס DevOps', 'Platform Engineer'],
  'data': ['Data Engineer', 'Data Analyst', 'Data Scientist', 'מהנדס נתונים', 'Data Platform Engineer'],
  'נתונים': ['Data Engineer', 'Data Analyst', 'מהנדס נתונים', 'אנליסט'],
  'ai': ['AI Developer', 'AI Engineer', 'ML Engineer', 'מפתח AI', 'AI Application Developer', 'LLM Engineer'],
  'בינה מלאכותית': ['AI Developer', 'AI Engineer', 'מפתח AI', 'מפתח בינה מלאכותית', 'LLM Engineer'],
  'qa': ['QA Engineer', 'QA Automation', 'בודק תוכנה', 'אוטומציה', 'SDET'],
  'בדיקות': ['QA Engineer', 'QA Automation', 'בודק תוכנה', 'בדיקות אוטומטיות'],
  'אוטומציה': ['QA Automation', 'Automation Engineer', 'אוטומציה', 'SDET'],
  'מוביל': ['Tech Lead', 'Team Lead', 'מוביל טכנולוגי', 'Engineering Lead', 'Engineering Manager'],
  'tech lead': ['Tech Lead', 'Team Lead', 'Engineering Lead', 'Staff Engineer'],
  'ארכיטקט': ['Software Architect', 'ארכיטקט תוכנה', 'Solutions Architect', 'System Architect'],
  'mobile': ['Mobile Developer', 'iOS Developer', 'Android Developer', 'מפתח מובייל', 'React Native Developer'],
  'מובייל': ['Mobile Developer', 'מפתח מובייל', 'React Native Developer', 'Flutter Developer'],
  'סייבר': ['Cyber Security', 'Security Engineer', 'מהנדס סייבר', 'AppSec', 'Security Analyst'],
  'cyber': ['Cyber Security', 'Security Engineer', 'מהנדס סייבר', 'Application Security'],
  'ענן': ['Cloud Engineer', 'מהנדס ענן', 'Cloud Architect', 'AWS Engineer'],
  'cloud': ['Cloud Engineer', 'Cloud Architect', 'AWS Engineer', 'Azure Engineer'],
  'אינטגרציות': ['Integration Developer', 'מפתח אינטגרציות', 'API Developer', 'Integration Engineer'],
  'integration': ['Integration Developer', 'Integration Engineer', 'API Developer', 'Middleware Developer'],
  'growth': ['Growth Engineer', 'Growth Developer', 'Experimentation Engineer'],
  'platform': ['Platform Engineer', 'Infrastructure Engineer', 'Internal Tools Developer'],
  'embedded': ['Embedded Developer', 'Firmware Engineer', 'מפתח אמבדד', 'Embedded Software Engineer'],
  'אמבדד': ['Embedded Developer', 'Firmware Engineer', 'מפתח אמבדד'],
};

// ── Compound search queries — boolean-style combos that target precise niches ──
// These are generated when user mentions BOTH a role AND a context (startup, SaaS, AI, etc.)
// Inspired by LinkedIn boolean search strategies
interface CompoundRule {
  roleTriggers: RegExp[];       // Role keywords that activate this rule
  contextTriggers: RegExp[];    // Context keywords (startup, SaaS, AI, etc.)
  queries: string[];            // Compound queries to generate
  titleBoosts: string[];        // Title patterns to boost in scoring
}

const COMPOUND_SEARCH_RULES: CompoundRule[] = [
  // Product + Startup/SaaS
  {
    roleTriggers: [/product/i, /מוצר/i, /פולסטאק/i, /full.?stack/i, /fullstack/i],
    contextTriggers: [/startup/i, /סטרטאפ/i, /סטארטאפ/i, /seed/i, /early.?stage/i, /שלב מוקדם/i],
    queries: ['Product Engineer Startup', 'Founding Engineer', 'Full Stack Startup Seed', 'Product Engineer OR Founding Engineer'],
    titleBoosts: ['product engineer', 'founding engineer', 'founding developer', 'first engineer'],
  },
  // Full Stack + SaaS
  {
    roleTriggers: [/full.?stack/i, /fullstack/i, /פולסטאק/i, /פול.?סטאק/i],
    contextTriggers: [/saas/i, /מוצר/i, /product/i, /b2b/i],
    queries: ['Full Stack SaaS', 'SaaS Developer', 'Product Engineer SaaS', 'Full Stack Product'],
    titleBoosts: ['saas developer', 'saas engineer', 'product engineer', 'full stack saas'],
  },
  // Full Stack / Backend + AI
  {
    roleTriggers: [/full.?stack/i, /fullstack/i, /backend/i, /developer/i, /מפתח/i, /פולסטאק/i],
    contextTriggers: [/\bai\b/i, /בינה מלאכותית/i, /machine.?learning/i, /llm/i, /gpt/i],
    queries: ['Full Stack AI', 'AI Application Developer', 'LLM Engineer', 'Full Stack Next.js AI'],
    titleBoosts: ['ai developer', 'ai application', 'ai engineer', 'llm engineer', 'ml engineer'],
  },
  // Data / Analytics + Product
  {
    roleTriggers: [/data/i, /נתונים/i, /analytics/i, /אנליטיק/i, /bi\b/i],
    contextTriggers: [/product/i, /מוצר/i, /manager/i, /מנהל/i, /אסטרטג/i, /strateg/i],
    queries: ['Data Product Manager', 'Technical Product Manager Data', 'Product Analyst', 'Data Product Manager SQL BI'],
    titleBoosts: ['data product manager', 'product analyst', 'technical product manager', 'data pm'],
  },
  // Frontend + Design / UX
  {
    roleTriggers: [/frontend/i, /פרונטאנד/i, /front.?end/i, /react/i],
    contextTriggers: [/design/i, /עיצוב/i, /ux/i, /ui/i, /creative/i],
    queries: ['Design Engineer', 'Frontend UX Developer', 'Creative Technologist', 'UI Engineer'],
    titleBoosts: ['design engineer', 'creative technologist', 'ui engineer', 'design systems'],
  },
  // DevOps / Backend + Startup
  {
    roleTriggers: [/devops/i, /דבאופס/i, /platform/i, /infra/i, /backend/i],
    contextTriggers: [/startup/i, /סטרטאפ/i, /early/i, /שלב מוקדם/i],
    queries: ['Platform Engineer Startup', 'DevOps Startup', 'Infrastructure Engineer Seed', 'SRE Startup'],
    titleBoosts: ['platform engineer', 'infra engineer', 'founding engineer'],
  },
  // Any role + Fintech
  {
    roleTriggers: [/develop/i, /engineer/i, /מפתח/i, /מהנדס/i, /full.?stack/i, /backend/i, /frontend/i],
    contextTriggers: [/fintech/i, /פינטק/i, /financial/i, /banking/i, /payment/i, /תשלום/i, /בנק/i],
    queries: ['Developer Fintech', 'Engineer Financial', 'Full Stack Fintech', 'Backend Payments'],
    titleBoosts: ['fintech', 'financial', 'payments', 'banking'],
  },
  // Any role + Remote
  {
    roleTriggers: [/develop/i, /engineer/i, /מפתח/i, /מהנדס/i],
    contextTriggers: [/remote/i, /מרחוק/i, /מהבית/i, /from.?home/i, /ריחוק/i],
    queries: ['Remote Developer', 'Remote Engineer', 'Work From Home Developer'],
    titleBoosts: ['remote'],
  },
  // Full Stack + Next.js / React specific stack
  {
    roleTriggers: [/full.?stack/i, /fullstack/i, /פולסטאק/i, /react/i],
    contextTriggers: [/next\.?js/i, /react/i, /node\.?js/i],
    queries: ['Full Stack React Next.js', 'React Node.js Developer', 'Next.js Full Stack'],
    titleBoosts: ['react', 'next.js', 'node.js'],
  },
];

const FREE_TEXT_COMPANY_PATTERNS: Record<string, string[]> = {
  'סטרטאפ': ['startup'],
  'startup': ['startup'],
  'סטארטאפ': ['startup'],
  'היי-טק': ['hitech'],
  'הייטק': ['hitech'],
  'enterprise': ['enterprise'],
  'corporate': ['enterprise'],
  'חברה גדולה': ['enterprise'],
  'agency': ['agency'],
  'סוכנות': ['agency'],
  'פינטק': ['fintech'],
  'fintech': ['fintech'],
  'healthtech': ['healthtech'],
  'הלת\'טק': ['healthtech'],
  'ecommerce': ['ecommerce'],
  'אי-קומרס': ['ecommerce'],
  'gaming': ['gaming'],
  'גיימינג': ['gaming'],
  'edtech': ['edtech'],
  'חינוך': ['edtech'],
  'saas': ['saas'],
};

const FREE_TEXT_DOMAIN_PATTERNS: Record<string, string[]> = {
  'פינטק': ['fintech', 'financial', 'banking', 'payments'],
  'fintech': ['fintech', 'financial', 'banking', 'payments'],
  'healthtech': ['healthtech', 'healthcare', 'medical', 'health'],
  'בריאות': ['healthtech', 'healthcare', 'medical'],
  'ecommerce': ['ecommerce', 'retail', 'marketplace'],
  'gaming': ['gaming', 'game', 'gamedev'],
  'saas': ['saas', 'b2b', 'cloud'],
  'ai': ['ai', 'machine learning', 'artificial intelligence'],
  'security': ['cybersecurity', 'infosec', 'security'],
  'סייבר': ['cybersecurity', 'infosec', 'security'],
};

/**
 * LOCAL fallback — extracts keywords from free text without AI.
 * Fast, works offline, covers common Hebrew/English patterns.
 * Also generates compound search queries (boolean-style) for precise job board targeting.
 */
function extractKeywordsFromFreeText(query: string): FreeTextSearchIntent {
  const lowerQuery = query.toLowerCase();
  const keywords: string[] = [];
  const hebrewKeywords: string[] = [];
  const titlePatterns: string[] = [];
  const companyTypes: string[] = [];
  const domains: string[] = [];
  const mustHaveSkills: string[] = [];

  // Extract role-related keywords
  for (const [pattern, kws] of Object.entries(FREE_TEXT_ROLE_PATTERNS)) {
    if (lowerQuery.includes(pattern)) {
      for (const kw of kws) {
        if (/[\u0590-\u05FF]/.test(kw)) {
          if (!hebrewKeywords.includes(kw)) hebrewKeywords.push(kw);
        } else {
          if (!keywords.includes(kw)) keywords.push(kw);
        }
        titlePatterns.push(kw.toLowerCase());
      }
    }
  }

  // Extract company type preferences
  for (const [pattern, types] of Object.entries(FREE_TEXT_COMPANY_PATTERNS)) {
    if (lowerQuery.includes(pattern)) {
      for (const t of types) {
        if (!companyTypes.includes(t)) companyTypes.push(t);
      }
    }
  }

  // Extract domain preferences
  for (const [pattern, doms] of Object.entries(FREE_TEXT_DOMAIN_PATTERNS)) {
    if (lowerQuery.includes(pattern)) {
      for (const d of doms) {
        if (!domains.includes(d)) domains.push(d);
      }
    }
  }

  // ── COMPOUND SEARCH RULES ──
  // Match role+context combos to generate precision search queries
  // E.g., "fullstack בסטרטאפ" → "Product Engineer Startup", "Founding Engineer"
  for (const rule of COMPOUND_SEARCH_RULES) {
    const hasRole = rule.roleTriggers.some(r => r.test(query));
    const hasContext = rule.contextTriggers.some(c => c.test(query));
    if (hasRole && hasContext) {
      for (const q of rule.queries) {
        if (!keywords.includes(q)) keywords.push(q);
      }
      for (const tp of rule.titleBoosts) {
        if (!titlePatterns.includes(tp)) titlePatterns.push(tp);
      }
    }
  }

  // Extract explicitly mentioned skills (React, Python, Node.js, etc.)
  const SKILL_EXTRACT_PATTERNS = [
    /\breact\b/i, /\bnode\.?js\b/i, /\bpython\b/i, /\btypescript\b/i, /\bjavascript\b/i,
    /\bjava\b/i, /\bc#\b/i, /\bc\+\+\b/i, /\bgo\b/i, /\bgolang\b/i, /\brust\b/i,
    /\bvue\b/i, /\bangular\b/i, /\bnext\.?js\b/i, /\baws\b/i, /\bazure\b/i, /\bgcp\b/i,
    /\bdocker\b/i, /\bkubernetes\b/i, /\bpostgresql\b/i, /\bpostgres\b/i, /\bmongodb\b/i,
    /\bsql\b/i, /\b\.net\b/i, /\bphp\b/i, /\bruby\b/i, /\bswift\b/i, /\bkotlin\b/i,
    /\bflutter\b/i, /\breact native\b/i, /\bgraphql\b/i, /\bterraform\b/i, /\belasticsearch\b/i,
    /\bredis\b/i, /\bpytorch\b/i, /\btensorflow\b/i,
  ];

  for (const pattern of SKILL_EXTRACT_PATTERNS) {
    const match = query.match(pattern);
    if (match) {
      mustHaveSkills.push(match[0]);
    }
  }

  // Detect remote/hybrid preferences
  const preferRemote = /\bremote\b|ריחוק|מרחוק|עבודה מהבית|from home|מהבית/i.test(query);
  const preferHybrid = /\bhybrid\b|היברידי|היברידית|משולב/i.test(query);

  // If keywords are empty, try to extract meaningful words from the query
  if (keywords.length === 0 && hebrewKeywords.length === 0) {
    const hebrewWords = query.match(/[\u0590-\u05FF]+(?:\s+[\u0590-\u05FF]+)*/g) || [];
    const englishWords = query.match(/[a-zA-Z][\w.#+-]*(?:\s+[a-zA-Z][\w.#+-]*)*/g) || [];

    for (const w of hebrewWords) {
      if (w.length > 2) hebrewKeywords.push(w);
    }
    for (const w of englishWords) {
      if (w.length > 2 && !['the', 'and', 'but', 'with', 'more', 'want', 'like', 'also', 'that', 'not'].includes(w.toLowerCase())) {
        keywords.push(w);
      }
    }
  }

  // Build intent summary
  const summaryParts: string[] = [];
  if (keywords.length > 0) summaryParts.push(keywords.slice(0, 4).join(', '));
  if (hebrewKeywords.length > 0) summaryParts.push(hebrewKeywords.slice(0, 2).join(', '));
  if (companyTypes.length > 0) summaryParts.push(`סוג: ${companyTypes.join(', ')}`);
  if (domains.length > 0) summaryParts.push(`תחום: ${domains.join(', ')}`);
  if (preferRemote) summaryParts.push('remote');

  return {
    keywords: keywords.slice(0, 20),
    hebrewKeywords: hebrewKeywords.slice(0, 10),
    scoringBoosts: {
      titlePatterns: titlePatterns.slice(0, 15),
      companyTypes,
      domains,
      mustHaveSkills,
      preferRemote,
      preferHybrid,
    },
    intentSummary: `חיפוש: ${summaryParts.join(' • ')}`,
    originalQuery: query,
  };
}

/**
 * AI-powered free-text search interpretation.
 * Uses AI to deeply understand what the user is looking for and generate optimal search parameters.
 * Falls back to local extraction if AI fails.
 */
export async function interpretFreeTextSearch(
  query: string,
  structuredProfile: any,
  rawKnowledge: any,
  preferences: any,
): Promise<FreeTextSearchIntent> {
  // Start with local extraction as baseline (also serves as fallback)
  const localResult = extractKeywordsFromFreeText(query);

  try {
    const profileSkills = [
      ...(structuredProfile?.skills || []),
      ...(structuredProfile?.inferredSkills || []),
    ].slice(0, 15);

    const targetRoles = preferences?.targetRoles || [];
    const experienceLevel = preferences?.experienceLevel || '';

    const systemPrompt = `You are a SENIOR TECH RECRUITER in Israel with deep knowledge of the Israeli tech market.
A candidate has described what they're looking for in NATURAL LANGUAGE.
Your job: Interpret their request and generate PRECISION search parameters that will find exactly what they want.

The candidate may write in Hebrew, English, or mixed. Understand the INTENT behind their words.

🎯 PRECISION JOB TITLES — Use these exact titles when relevant:
- "Product Engineer" → The BEST title for developers who code but think product. Used by startups and SaaS companies.
- "Founding Engineer" → Surfaces early-stage startups (Seed / Series A). Perfect for people who want to be employee #1-5.
- "Full Stack SaaS" / "SaaS Developer" → Filters out agencies and consulting shops, targets companies with a tech product.
- "Technical Product Manager" / "Data Product Manager" → For developers transitioning to strategic/management roles.
- "Design Engineer" / "Creative Technologist" → For frontend devs with UX/design orientation.
- "Platform Engineer" → Modern title for DevOps/infrastructure in product companies.
- "Growth Engineer" / "Experimentation Engineer" → For devs interested in metrics, A/B testing, user growth.
- "AI Application Developer" / "LLM Engineer" → For devs building AI-powered applications (not research).

🔍 COMPOUND SEARCH STRATEGY — Generate boolean-style queries:
Instead of just single keywords, create COMPOUND queries that target precise niches:
- "Product Engineer" OR "Founding Engineer" (catches both titles)
- "Full Stack" AND "Startup" (filters for startup context)
- "Full Stack" AND ("Next.js" OR "React") AND "AI" (stack-specific)
- "Technical Product Manager" AND ("Data" OR "SQL") (niche TPM)

EXAMPLES of interpretation:
- "אני רוצה משרת פיתוח מוצר בסטרטאפים" → Product Engineer, Founding Engineer, Full Stack SaaS, early-stage startup focus
- "fullstack but more backend heavy with Python" → Backend-leaning Full Stack, Python Backend Engineer, boost backend/API/server
- "something with AI that uses my React skills" → AI Application Developer, LLM Engineer, Full Stack AI, React + AI combos
- "remote fintech positions" → Fintech domain, remote filter, Developer Fintech, Engineer Financial
- "סטרטאפ קטן שאני יכול להשפיע" → Founding Engineer, First Engineer, Early Stage, seed-stage startup
- "פולסטאק בסטרטאפים" → Product Engineer Startup, Founding Engineer, Full Stack SaaS, Full Stack Startup Seed

CANDIDATE'S PROFILE:
- Skills: ${profileSkills.join(', ') || 'Not specified'}
- Target roles: ${targetRoles.join(', ') || 'Not specified'}
- Experience level: ${experienceLevel || 'Not specified'}

Return a JSON object:
{
  "keywords": ["PRECISION English search terms — include compound queries like 'Product Engineer Startup', 'Full Stack SaaS' — 10-15 terms"],
  "hebrewKeywords": ["Hebrew search terms for Israeli boards — מפתח מוצר, מהנדס תוכנה בסטרטאפ — 5-8 terms"],
  "titlePatterns": ["EXACT job title substrings to boost: 'product engineer', 'founding engineer', 'saas' — lowercase"],
  "companyTypes": ["preferred company types: startup|enterprise|agency|scaleup"],
  "domains": ["industry domains: fintech|healthtech|ecommerce|gaming|saas|ai|security"],
  "mustHaveSkills": ["skills the user explicitly mentioned wanting to use"],
  "preferRemote": false,
  "preferHybrid": false,
  "intentSummary": "Hebrew 1-sentence summary — be specific: מחפש/ת תפקידי Product Engineer / Founding Engineer בסטרטאפים בשלב מוקדם"
}`;

    const userPrompt = `CANDIDATE'S SEARCH REQUEST (natural language):
"${query}"

Interpret this request. What are they REALLY looking for? Generate search parameters that will find exactly what they want.`;

    const response = await aiClient.callAPI(systemPrompt, userPrompt, 1.5, 30000);
    const parsed = aiClient.parseJSON<any>(response);

    if (parsed && parsed.keywords) {
      return {
        keywords: [...(parsed.keywords || []), ...localResult.keywords].filter((v, i, a) =>
          a.findIndex(x => x.toLowerCase() === v.toLowerCase()) === i
        ).slice(0, 20),
        hebrewKeywords: [...(parsed.hebrewKeywords || []), ...localResult.hebrewKeywords].filter((v, i, a) =>
          a.findIndex(x => x.toLowerCase() === v.toLowerCase()) === i
        ).slice(0, 10),
        scoringBoosts: {
          titlePatterns: [...(parsed.titlePatterns || []), ...localResult.scoringBoosts.titlePatterns].filter((v, i, a) =>
            a.findIndex(x => x.toLowerCase() === v.toLowerCase()) === i
          ).slice(0, 15),
          companyTypes: parsed.companyTypes || localResult.scoringBoosts.companyTypes,
          domains: parsed.domains || localResult.scoringBoosts.domains,
          mustHaveSkills: parsed.mustHaveSkills || localResult.scoringBoosts.mustHaveSkills,
          preferRemote: parsed.preferRemote ?? localResult.scoringBoosts.preferRemote,
          preferHybrid: parsed.preferHybrid ?? localResult.scoringBoosts.preferHybrid,
        },
        intentSummary: parsed.intentSummary || localResult.intentSummary,
        originalQuery: query,
      };
    }
  } catch (err) {
    logger.warn('AI free-text interpretation failed, using local extraction', err);
  }

  return localResult;
}

/**
 * Apply free-text scoring boosts to a job's score.
 * Called after scoreJobLocally() to adjust scores based on user's free-text intent.
 */
export function applyFreeTextBoosts(
  baseScore: SmartScore,
  jobData: { title?: string; company?: string; description?: string; location?: string; locationType?: string },
  intent: FreeTextSearchIntent,
): SmartScore {
  let bonus = 0;
  const boostReasons: string[] = [];
  const fullText = `${jobData.title || ''} ${jobData.company || ''} ${jobData.description || ''}`.toLowerCase();
  const title = (jobData.title || '').toLowerCase();

  // 1. Title pattern boost (max +12)
  // Precision titles (multi-word like "product engineer") get higher weight than single-word
  const titleHits = intent.scoringBoosts.titlePatterns.filter(p => title.includes(p.toLowerCase()));
  if (titleHits.length > 0) {
    const precisionHits = titleHits.filter(h => h.includes(' ')); // Multi-word = precision
    const singleHits = titleHits.filter(h => !h.includes(' '));
    bonus += Math.min(precisionHits.length * 6 + singleHits.length * 3, 12);
    boostReasons.push(`כותרת מתאימה: ${titleHits.slice(0, 3).join(', ')}`);
  }

  // 2. Company type boost (max +8)
  const companyBoosts = intent.scoringBoosts.companyTypes;
  if (companyBoosts.length > 0) {
    const companySignals: Record<string, RegExp[]> = {
      'startup': [/startup/i, /סטרטאפ/i, /early\s*stage/i, /seed/i, /series\s*[ab]/i, /pre-seed/i, /founded\s*20[12]/i],
      'enterprise': [/enterprise/i, /corporation/i, /global/i, /multinational/i, /fortune\s*\d/i],
      'agency': [/agency/i, /consulting/i, /consultancy/i, /סוכנות/i],
      'scaleup': [/scale-?up/i, /unicorn/i, /series\s*[cd]/i, /ipo/i, /growth\s*stage/i],
    };
    for (const ct of companyBoosts) {
      const signals = companySignals[ct] || [];
      if (signals.some(s => s.test(fullText))) {
        bonus += 8;
        boostReasons.push(`סוג חברה: ${ct}`);
        break;
      }
    }
  }

  // 3. Domain boost (max +8)
  const domainBoosts = intent.scoringBoosts.domains;
  if (domainBoosts.length > 0) {
    const domainSignals: Record<string, RegExp[]> = {
      'fintech': [/fintech/i, /financial/i, /banking/i, /payments?/i, /פינטק/i, /פיננסי/i],
      'healthtech': [/health/i, /medical/i, /healthcare/i, /בריאות/i, /רפואה/i],
      'ecommerce': [/e-?commerce/i, /retail/i, /marketplace/i, /shopping/i, /מסחר/i],
      'gaming': [/gaming/i, /game\s*(dev|design)/i, /גיימינג/i],
      'saas': [/saas/i, /\bb2b\b/i, /platform/i],
      'ai': [/\bai\b/i, /artificial\s*intelligence/i, /machine\s*learning/i, /llm/i, /בינה מלאכותית/i],
      'security': [/cyber/i, /security/i, /infosec/i, /סייבר/i, /אבטח/i],
    };
    for (const dom of domainBoosts) {
      const signals = domainSignals[dom] || [];
      if (signals.some(s => s.test(fullText))) {
        bonus += 8;
        boostReasons.push(`תחום: ${dom}`);
        break;
      }
    }
  }

  // 4. Must-have skills boost (max +8)
  const mustHave = intent.scoringBoosts.mustHaveSkills;
  if (mustHave.length > 0) {
    const hits = mustHave.filter(s => fullText.includes(s.toLowerCase()));
    if (hits.length > 0) {
      bonus += Math.min(hits.length * 3, 8);
      boostReasons.push(`כישורים נדרשים: ${hits.join(', ')}`);
    }
  }

  // 5. Remote/Hybrid preference (max +5)
  if (intent.scoringBoosts.preferRemote) {
    const locType = (jobData.locationType || '').toLowerCase();
    if (/remote/i.test(fullText) || locType === 'remote') {
      bonus += 5;
      boostReasons.push('עבודה מרחוק');
    }
  }
  if (intent.scoringBoosts.preferHybrid) {
    const locType = (jobData.locationType || '').toLowerCase();
    if (/hybrid/i.test(fullText) || locType === 'hybrid') {
      bonus += 5;
      boostReasons.push('עבודה היברידית');
    }
  }

  // Apply bonus (cap total at 100)
  const adjustedScore = Math.min(100, baseScore.score + bonus);

  // Add boost reasons to green flags
  const updatedGreenFlags = [...(baseScore.greenFlags || [])];
  if (boostReasons.length > 0) {
    updatedGreenFlags.push(`🎯 חיפוש חופשי: ${boostReasons.join(' | ')}`);
  }

  // Recalculate category based on new score
  let category = baseScore.category;
  if (adjustedScore >= 85) category = 'PERFECT';
  else if (adjustedScore >= 70) category = 'STRONG';
  else if (adjustedScore >= 55) category = 'GOOD';
  else if (adjustedScore >= 40) category = 'POSSIBLE';
  else if (adjustedScore >= 25) category = 'STRETCH';
  else category = 'WEAK';

  return {
    ...baseScore,
    score: adjustedScore,
    greenFlags: updatedGreenFlags,
    category,
    reasoning: baseScore.reasoning + (boostReasons.length > 0 ? ` | בונוס חיפוש: +${bonus}` : ''),
  };
}

// ============================================================
// EXPORTS
// ============================================================

export const smartMatchService = {
  generateSmartKeywords,
  analyzeProfileForScoring,
  scoreJobLocally,
  buildSkillDepthProfile,
  aiReRankJobs,
  generateStackSearchQueries,
  interpretFreeTextSearch,
  applyFreeTextBoosts,
};
