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
// AI KEYWORD EXPANSION
// ============================================================

/**
 * Use AI to deeply analyze the user's profile and generate smart,
 * expanded search keywords — thinking like a senior recruiter.
 */
export async function generateSmartKeywords(
  structuredProfile: any,
  rawKnowledge: any,
  preferences: any
): Promise<SmartKeywords> {
  try {
    logger.info('Generating smart keywords from full profile');

    const profileText = rawKnowledge?.content || '';
    const targetRoles = preferences?.targetRoles || [];
    const excludeKeywords = preferences?.excludeKeywords || [];

    const systemPrompt = `You are a SENIOR TECH RECRUITER in Israel with 15 years of experience placing developers in hi-tech companies.

Your job: Given a candidate's full profile, generate the SMARTEST possible search keywords to find jobs they'd be perfect for.

Think DEEPLY:
- What roles match their EXACT experience?
- What ADJACENT roles could they transition to? (e.g., a system admin could do DevOps, a full-stack dev could do frontend lead)
- What roles value their COMBINATION of skills? (e.g., someone with both coding + product experience is rare)
- What Hebrew job titles are used on Israeli job boards?
- What seniority-appropriate terms should we search for?
- What industry terms capture their niche?

CRITICAL RULES:
- Generate search terms that will find RELEVANT jobs, not generic ones
- Include Hebrew terms for Israeli job boards (Drushim, AllJobs)
- Think about what HR managers would title the job posting
- Consider both startup and corporate job title conventions
- Include terms for roles that VALUE their background even if not exact match

Return a JSON object:
{
  "primary": ["exact role match terms - 5-8 terms"],
  "adjacent": ["roles they could transition to based on skills - 5-8 terms"],
  "skills": ["key technical skills to search for - 5-10 terms"],
  "hebrew": ["Hebrew job titles and keywords - 5-10 terms"],
  "industry": ["industry/domain specific terms - 3-5 terms"],
  "seniority": ["level-appropriate terms - 3-5 terms"],
  "combined": ["top 10-15 combined search queries optimized for job boards, mixing role + tech"]
}`;

    const userPrompt = `CANDIDATE PROFILE:

${profileText ? `--- Raw Resume/Knowledge ---\n${profileText}\n---\n` : ''}
${structuredProfile ? `--- Structured Profile ---\n${JSON.stringify(structuredProfile, null, 2)}\n---\n` : ''}
${targetRoles.length > 0 ? `\nTarget Roles: ${targetRoles.join(', ')}` : ''}
${excludeKeywords.length > 0 ? `\nExclude Keywords: ${excludeKeywords.join(', ')}` : ''}

Based on this candidate's FULL background, generate smart search keywords.
Remember: Think like a recruiter who deeply understands the Israeli tech market.
Consider what this person CAN do, not just what they've done.
Consider adjacent roles, stretch roles, and hidden-gem opportunities.`;

    const response = await aiClient.callAPI(systemPrompt, userPrompt, 2, 45000);
    const keywords = aiClient.parseJSON<SmartKeywords>(response);

    logger.info('Smart keywords generated', {
      primary: keywords.primary?.length,
      adjacent: keywords.adjacent?.length,
      combined: keywords.combined?.length,
    });

    return keywords;
  } catch (error) {
    logger.error('Error generating smart keywords:', error);
    // Fallback to basic keywords
    const targetRoles = preferences?.targetRoles || [];
    return {
      primary: targetRoles.length > 0 ? targetRoles : ['Software Engineer', 'Developer', 'Full Stack'],
      adjacent: [],
      skills: [],
      hebrew: ['מפתח תוכנה', 'פיתוח', 'מהנדס תוכנה'],
      industry: [],
      seniority: [],
      combined: targetRoles.length > 0
        ? [...targetRoles, 'מפתח תוכנה', 'Developer']
        : ['Software Engineer', 'Full Stack Developer', 'מפתח תוכנה'],
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
        const match = exp.duration.match(/(\d+)/);
        if (match) experienceYears += parseInt(match[1]);
      }
      if (exp.startYear && exp.endYear) {
        experienceYears += exp.endYear - exp.startYear;
      }
    }
  }
  // Also check raw text for years of experience
  const yearsMatch = rawText.match(/(\d+)\+?\s*(?:years?|שנ)/);
  if (yearsMatch) {
    const parsed = parseInt(yearsMatch[1]);
    if (parsed > experienceYears) experienceYears = parsed;
  }

  let seniorityLevel: ProfileAnalysis['seniorityLevel'] = 'MID';
  if (experienceYears <= 2) seniorityLevel = 'JUNIOR';
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
      else if (deg.includes('bachelor') || deg.includes('bsc') || deg.includes('b.a')) educationLevel = 'bachelors';
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
  'full stack': ['frontend', 'backend', 'web developer', 'software engineer', 'full-stack', 'fullstack'],
  'frontend': ['ui developer', 'web developer', 'react developer', 'frontend engineer', 'ui engineer', 'full stack'],
  'backend': ['server developer', 'api developer', 'backend engineer', 'full stack', 'software engineer', 'platform engineer'],
  'devops': ['sre', 'site reliability', 'infrastructure', 'platform engineer', 'cloud engineer', 'system administrator', 'system engineer'],
  'system admin': ['devops', 'it manager', 'infrastructure', 'network engineer', 'cloud engineer', 'system engineer'],
  'team lead': ['tech lead', 'engineering manager', 'development manager', 'architect', 'principal engineer', 'staff engineer'],
  'tech lead': ['team lead', 'architect', 'staff engineer', 'principal engineer', 'engineering manager'],
  'product manager': ['project manager', 'product owner', 'scrum master', 'business analyst'],
  'data engineer': ['backend', 'etl developer', 'data architect', 'analytics engineer', 'bi developer'],
  'qa': ['test engineer', 'sdet', 'automation engineer', 'quality engineer', 'test automation'],
  'mobile': ['ios developer', 'android developer', 'react native', 'flutter developer'],
  'software engineer': ['developer', 'programmer', 'full stack', 'backend', 'frontend'],
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
  'docker': ['containers', 'containerization'],
  'kubernetes': ['k8s'],
  'postgresql': ['postgres', 'pg'],
  'mongodb': ['mongo'],
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
};

/**
 * Extract what the job ACTUALLY requires — parse the requirements/description
 * to find "must have" vs "nice to have" skills.
 */
function extractJobRequirements(desc: string, reqs: string): {
  mustHave: string[];
  niceToHave: string[];
  allMentioned: string[];
} {
  const fullText = `${desc} ${reqs}`.toLowerCase();
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
  const jobReqs = extractJobRequirements(desc, reqs);

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

    // Apply realistic curve: 60% raw coverage → 75 score (strong candidate)
    const rawMustScore = mustHaveRatio * 100;
    const curvedMustScore = rawMustScore <= 30
      ? rawMustScore * 0.8                          // Below 30% → harsh
      : 30 * 0.8 + (rawMustScore - 30) * 1.15;     // Above 30% → generous curve
    const clampedMust = Math.min(100, curvedMustScore);

    // Must-haves 70%, nice-to-haves 30%
    requirementsCoverage = Math.round(clampedMust * 0.70 + niceRatio * 100 * 0.30);
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
  if (totalMustHave >= 4 && matchedMustHave.length <= 1) {
    requirementsCoverage = Math.min(requirementsCoverage, 25);
  }

  // ----------------------------------------------------------
  // STEP 4: EXPERIENCE & SENIORITY FIT (25% of total score)
  // "Am I at the right career level for this role?"
  // ----------------------------------------------------------
  let experienceScore = 65; // Default: can't detect level → assume neutral-positive (keywords were tailored)

  const jobExpLevel = (job.experienceLevel || '').toLowerCase();
  const years = profileAnalysis.experienceYears;

  // Parse ALL mentions of required years in the job text
  const yearsPatterns = fullText.matchAll(/(\d+)\+?\s*(?:years?|שנ|שנות|שנים)/g);
  let jobRequiredYears = 0;
  for (const m of yearsPatterns) {
    const y = parseInt(m[1]);
    if (y > jobRequiredYears && y <= 20) jobRequiredYears = y; // Take the highest reasonable requirement
  }

  if (jobRequiredYears > 0) {
    if (years >= jobRequiredYears && years <= jobRequiredYears + 4) {
      experienceScore = 95; // Sweet spot — meets requirements, not overqualified
    } else if (years >= jobRequiredYears) {
      experienceScore = 80; // Overqualified slightly but still good
      if (years > jobRequiredYears + 7) experienceScore = 55; // Significantly overqualified
    } else if (years >= jobRequiredYears - 1) {
      experienceScore = 70; // Close — could stretch
    } else if (years >= jobRequiredYears - 2) {
      experienceScore = 45; // Noticeable gap
    } else {
      experienceScore = Math.max(10, 30 - (jobRequiredYears - years) * 5); // Major gap
    }
  }

  // Check seniority level keywords in the title
  const seniorityMap: Record<string, number> = {
    'intern': 0, 'סטודנט': 0, 'student': 0,
    'junior': 1, 'ג׳וניור': 1, 'entry': 1,
    'mid': 2, 'middle': 2, 'regular': 2, 'בינוני': 2,
    'senior': 3, 'סניור': 3, 'בכיר': 3, 'experienced': 3, 'sr.': 3, 'sr ': 3,
    'lead': 4, 'principal': 4, 'staff': 4, 'architect': 4, 'מוביל': 4, 'head': 4,
    'director': 5, 'vp': 5, 'cto': 5, 'manager': 4,
  };

  const candidateLevelNum = { JUNIOR: 1, MID: 2, SENIOR: 3, LEAD: 4 }[profileAnalysis.seniorityLevel] || 2;
  let detectedJobLevel = -1;

  for (const [keyword, level] of Object.entries(seniorityMap)) {
    if (title.includes(keyword) || jobExpLevel.includes(keyword)) {
      detectedJobLevel = level;
      break;
    }
  }

  if (detectedJobLevel >= 0) {
    const diff = candidateLevelNum - detectedJobLevel;
    if (diff === 0) {
      experienceScore = Math.max(experienceScore, 95); // Exact level match
    } else if (diff === 1) {
      experienceScore = Math.max(experienceScore, 70); // Slight step down — overqualified but OK
    } else if (diff === -1) {
      experienceScore = Math.max(experienceScore, 60); // One level up — stretch, realistic
    } else if (diff >= 2) {
      experienceScore = Math.min(experienceScore, 45); // Way overqualified
    } else if (diff <= -2) {
      experienceScore = Math.min(experienceScore, 25); // Under-leveled significantly
    }
  }

  // ----------------------------------------------------------
  // STEP 5: ROLE ALIGNMENT (20% of total score)
  // "Is this the kind of work I actually do / can do?"
  // ----------------------------------------------------------
  let roleScore = 15; // Low base — must EARN role relevance via actual matches

  const targetRoles = profileAnalysis.targetRoles.map(r => r.toLowerCase());
  const previousRoles = profileAnalysis.previousRoles;

  // Direct title match with target roles
  for (const target of targetRoles) {
    if (title.includes(target) || target.includes(title.replace(/senior |junior |lead |sr\.? |jr\.? /g, '').trim())) {
      roleScore = 95;
      break;
    }
    // Multi-word partial match — e.g. "Full Stack" matches "Full Stack Developer"
    const words = target.split(/\s+/).filter(w => w.length > 2);
    if (words.length > 0) {
      const matchCount = words.filter(w => title.includes(w)).length;
      if (matchCount >= Math.ceil(words.length * 0.6)) {
        roleScore = Math.max(roleScore, 85);
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
  let locationScore = 70;

  const preferredLocations = (preferences?.preferredLocations || []).map((l: string) => l.toLowerCase());
  const preferredWorkType = (preferences?.preferredWorkType || '').toLowerCase();

  if (preferredLocations.length > 0 && jobLocation) {
    const locationMatches = preferredLocations.some((loc: string) =>
      jobLocation.includes(loc) || loc.includes(jobLocation)
    );
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
    'מפתח', 'מהנדס', 'תוכנה', 'פיתוח', 'מנתח', 'בודק', 'QA', 'דאטה', 'מערכות',
    'טכנולוג', 'אינטגרציה', 'אוטומציה', 'סייבר', 'אבטחת מידע',
    'qlik', 'tableau', 'power bi', 'crm', 'erp', 'sap', 'salesforce',
  ];

  const titleHasTechPattern = TECH_ROLE_PATTERNS.some(p => title.includes(p));
  const totalSkillOverlap = jobReqs.allMentioned.length > 0
    ? [...expandedSkills].filter(s => jobReqs.allMentioned.includes(s)).length
    : [...expandedSkills].filter(s => fullText.includes(s)).length;

  let isTechRelevant = titleHasTechPattern || totalSkillOverlap >= 2;

  // If no tech pattern in title and very few skill matches, this is likely not a relevant job
  if (!isTechRelevant) {
    // Check if description has enough tech overlap to still be relevant
    const descTechHits = [...expandedSkills].filter(s => fullText.includes(s)).length;
    if (descTechHits >= 3) {
      isTechRelevant = true; // Description has enough tech content
    }
  }

  // ----------------------------------------------------------
  // STEP 7: OVERALL SCORE — weighted by professional fit
  // ----------------------------------------------------------
  let overallScore = Math.round(
    requirementsCoverage * 0.50 +  // 50%: Do I meet the requirements?
    experienceScore * 0.25 +       // 25%: Am I at the right level?
    roleScore * 0.20 +             // 20%: Is this my kind of role?
    locationScore * 0.05           //  5%: Location (minor)
  );

  // TECH RELEVANCE GATE: Non-tech jobs get hard-capped
  if (!isTechRelevant) {
    overallScore = Math.min(overallScore, 20);
    roleScore = Math.min(roleScore, 10);
  }

  // ----------------------------------------------------------
  // STEP 8: GREEN FLAGS & RED FLAGS
  // ----------------------------------------------------------
  const greenFlags: string[] = [];
  const redFlags: string[] = [];

  if (matchedMustHave.length >= 3) greenFlags.push(`עומד ב-${matchedMustHave.length}/${totalMustHave} דרישות חובה`);
  if (matchedMustHave.length === totalMustHave && totalMustHave > 0) greenFlags.push('עומד בכל דרישות החובה!');
  if (roleScore >= 85) greenFlags.push('התפקיד מתאים לרקע המקצועי שלך');
  if (experienceScore >= 85) greenFlags.push('רמת הניסיון בדיוק מתאימה');
  if (domainOverlap) greenFlags.push('ניסיון בתחום הרלוונטי');

  const TOP_COMPANIES = ['google', 'microsoft', 'meta', 'amazon', 'apple', 'netflix', 'openai', 'anthropic',
    'stripe', 'monday', 'wix', 'check point', 'cyberark', 'palo alto', 'fiverr',
    'similarweb', 'gett', 'via', 'mobileye', 'intel', 'nvidia', 'qualcomm'];
  if (TOP_COMPANIES.some(c => (job.company || '').toLowerCase().includes(c))) {
    greenFlags.push('חברה מובילה');
  }

  if (missingMustHave.length >= 3) redFlags.push(`חסרים ${missingMustHave.length} דרישות חובה: ${missingMustHave.slice(0, 3).join(', ')}`);
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

export const smartMatchService = {
  generateSmartKeywords,
  analyzeProfileForScoring,
  scoreJobLocally,
};
