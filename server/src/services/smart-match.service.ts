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
 * Score a single job against a user profile — LOCALLY, no API call.
 * This is designed to run on every scraped job for instant scoring.
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
  // 1. SKILL MATCH (0-100)
  // ----------------------------------------------------------
  const allCandidateSkills = [
    ...profileAnalysis.coreSkills,
    ...profileAnalysis.inferredSkills,
    ...profileAnalysis.techStack,
    ...profileAnalysis.languages,
  ];
  // Expand with synonyms
  const expandedSkills = new Set<string>();
  for (const skill of allCandidateSkills) {
    expandedSkills.add(skill);
    const syns = SKILL_SYNONYMS[skill];
    if (syns) syns.forEach(s => expandedSkills.add(s));
    // Also check if any synonym key contains our skill
    for (const [key, vals] of Object.entries(SKILL_SYNONYMS)) {
      if (vals.includes(skill)) expandedSkills.add(key);
    }
  }

  const matchedSkills: string[] = [];
  const mentionedInJob: string[] = [];

  // Extract skills mentioned in the job
  for (const skill of expandedSkills) {
    if (fullText.includes(skill)) {
      matchedSkills.push(skill);
    }
  }

  // Also find skills the job wants that the candidate doesn't have
  const missingSkills: string[] = [];
  const COMMON_TECH_TERMS = [
    'react', 'vue', 'angular', 'node.js', 'python', 'java', 'c#', 'go', 'rust',
    'typescript', 'javascript', 'aws', 'azure', 'gcp', 'docker', 'kubernetes',
    'postgresql', 'mongodb', 'redis', 'graphql', 'rest', 'microservices',
    'terraform', 'jenkins', 'git', 'linux', 'agile', 'scrum',
    'machine learning', 'deep learning', 'nlp', 'computer vision',
    'swift', 'kotlin', 'flutter', 'react native',
    'elasticsearch', 'kafka', 'rabbitmq', 'nginx',
    'ci/cd', 'devops', 'sre',
  ];
  for (const term of COMMON_TECH_TERMS) {
    if (fullText.includes(term) && !expandedSkills.has(term)) {
      missingSkills.push(term);
    }
  }

  // Calculate skill score
  const totalRelevantSkills = matchedSkills.length + missingSkills.length;
  let skillScore = totalRelevantSkills > 0
    ? Math.round((matchedSkills.length / totalRelevantSkills) * 100)
    : 50; // If no specific skills mentioned, neutral score

  // Boost if many core skills match
  if (matchedSkills.length >= 5) skillScore = Math.min(100, skillScore + 10);

  // ----------------------------------------------------------
  // 2. ROLE RELEVANCE (0-100)
  // ----------------------------------------------------------
  let roleScore = 30; // Base — at least somewhat tech

  // Check if job title directly matches target roles
  const targetRoles = profileAnalysis.targetRoles.map(r => r.toLowerCase());
  for (const target of targetRoles) {
    if (title.includes(target) || target.includes(title.split(' ')[0])) {
      roleScore = 95;
      break;
    }
    // Partial match
    const words = target.split(/\s+/);
    const matchCount = words.filter(w => title.includes(w)).length;
    if (matchCount >= Math.ceil(words.length / 2)) {
      roleScore = Math.max(roleScore, 80);
    }
  }

  // Check if job title matches previous roles
  for (const prevRole of profileAnalysis.previousRoles) {
    if (title.includes(prevRole) || prevRole.includes(title)) {
      roleScore = Math.max(roleScore, 85);
    }
  }

  // Check role adjacency
  for (const prevRole of [...profileAnalysis.previousRoles, ...targetRoles]) {
    for (const [roleKey, adjacentRoles] of Object.entries(ROLE_ADJACENCY)) {
      if (prevRole.includes(roleKey) || roleKey.includes(prevRole)) {
        for (const adj of adjacentRoles) {
          if (title.includes(adj)) {
            roleScore = Math.max(roleScore, 70); // Adjacent role match
            break;
          }
        }
      }
    }
  }

  // Check if job is in a matching domain
  for (const domain of profileAnalysis.domains) {
    if (fullText.includes(domain)) {
      roleScore = Math.max(roleScore, Math.min(roleScore + 15, 100));
    }
  }

  // ----------------------------------------------------------
  // 3. EXPERIENCE LEVEL MATCH (0-100)
  // ----------------------------------------------------------
  let experienceScore = 70; // Default neutral

  const jobExpLevel = (job.experienceLevel || '').toLowerCase();
  const years = profileAnalysis.experienceYears;

  // Parse job's experience requirements
  const expYearsMatch = fullText.match(/(\d+)\+?\s*(?:years?|שנ)/);
  const jobRequiredYears = expYearsMatch ? parseInt(expYearsMatch[1]) : 0;

  if (jobRequiredYears > 0) {
    if (years >= jobRequiredYears) {
      experienceScore = 90; // Meets or exceeds
      if (years > jobRequiredYears + 5) experienceScore = 70; // Overqualified
    } else if (years >= jobRequiredYears - 1) {
      experienceScore = 75; // Close enough - stretch opportunity
    } else {
      experienceScore = Math.max(20, 70 - (jobRequiredYears - years) * 15);
    }
  }

  // Check seniority level keywords
  const seniorityMap: Record<string, number> = {
    'junior': 1, 'ג׳וניור': 1, 'entry': 1, 'intern': 0, 'סטודנט': 0,
    'mid': 2, 'middle': 2, 'regular': 2, 'בינוני': 2,
    'senior': 3, 'סניור': 3, 'בכיר': 3, 'experienced': 3,
    'lead': 4, 'principal': 4, 'staff': 4, 'architect': 4, 'מוביל': 4, 'head': 4,
    'director': 5, 'vp': 5, 'cto': 5,
  };

  const candidateLevelNum = { JUNIOR: 1, MID: 2, SENIOR: 3, LEAD: 4 }[profileAnalysis.seniorityLevel] || 2;

  for (const [keyword, level] of Object.entries(seniorityMap)) {
    if (title.includes(keyword) || jobExpLevel.includes(keyword)) {
      const diff = Math.abs(candidateLevelNum - level);
      if (diff === 0) experienceScore = Math.max(experienceScore, 95);
      else if (diff === 1) experienceScore = Math.max(experienceScore, 75); // Stretch or slight step down
      else if (diff >= 2) experienceScore = Math.min(experienceScore, 40);
      break;
    }
  }

  // ----------------------------------------------------------
  // 4. LOCATION MATCH (0-100)
  // ----------------------------------------------------------
  let locationScore = 70; // Default neutral

  const preferredLocations = (preferences?.preferredLocations || []).map((l: string) => l.toLowerCase());
  const preferredWorkType = (preferences?.preferredWorkType || '').toLowerCase();

  if (preferredLocations.length > 0 && jobLocation) {
    const locationMatches = preferredLocations.some((loc: string) =>
      jobLocation.includes(loc) || loc.includes(jobLocation)
    );
    locationScore = locationMatches ? 95 : 50;
  }

  // Check remote/hybrid preference
  if (preferredWorkType) {
    if (preferredWorkType === 'remote' && (fullText.includes('remote') || fullText.includes('מרחוק'))) {
      locationScore = Math.max(locationScore, 95);
    }
    if (preferredWorkType === 'hybrid' && (fullText.includes('hybrid') || fullText.includes('היברידי'))) {
      locationScore = Math.max(locationScore, 90);
    }
  }

  // ----------------------------------------------------------
  // 5. GREEN FLAGS & RED FLAGS
  // ----------------------------------------------------------
  const greenFlags: string[] = [];
  const redFlags: string[] = [];

  // Green flags
  if (matchedSkills.length >= 4) greenFlags.push(`${matchedSkills.length} כישורים תואמים`);
  if (roleScore >= 80) greenFlags.push('תפקיד מתאים מאוד לרקע שלך');
  if (experienceScore >= 85) greenFlags.push('רמת ניסיון מתאימה');

  // Check for top companies
  const TOP_COMPANIES = ['google', 'microsoft', 'meta', 'amazon', 'apple', 'netflix', 'openai', 'anthropic',
    'stripe', 'monday', 'wix', 'check point', 'cyberark', 'palo alto', 'ironSource', 'fiverr',
    'similarweb', 'gett', 'via', 'mobileye', 'intel', 'nvidia', 'qualcomm'];
  if (TOP_COMPANIES.some(c => (job.company || '').toLowerCase().includes(c))) {
    greenFlags.push('חברה מובילה בתעשייה');
  }

  if (fullText.includes('growth') || fullText.includes('צמיחה')) greenFlags.push('הזדמנות לצמיחה');
  if (fullText.includes('mentor') || fullText.includes('הכשרה')) greenFlags.push('אפשרויות הכשרה');

  // Red flags
  if (missingSkills.length >= 5) redFlags.push(`חסרים ${missingSkills.length} כישורים טכניים`);
  if (experienceScore < 40) redFlags.push('פער משמעותי ברמת הניסיון');
  if (roleScore < 40) redFlags.push('תפקיד לא קשור לתחום שלך');

  // ----------------------------------------------------------
  // 6. OVERALL SCORE (weighted)
  // ----------------------------------------------------------
  const overallScore = Math.round(
    skillScore * 0.35 +
    roleScore * 0.30 +
    experienceScore * 0.20 +
    locationScore * 0.15
  );

  // Determine category
  let category: SmartScore['category'];
  if (overallScore >= 85) category = 'PERFECT';
  else if (overallScore >= 72) category = 'STRONG';
  else if (overallScore >= 60) category = 'GOOD';
  else if (overallScore >= 48) category = 'POSSIBLE';
  else if (overallScore >= 35) category = 'STRETCH';
  else category = 'WEAK';

  // ----------------------------------------------------------
  // 7. REASONING (Hebrew)
  // ----------------------------------------------------------
  let reasoning = '';
  if (category === 'PERFECT' || category === 'STRONG') {
    reasoning = `משרה מתאימה מאוד! ${matchedSkills.length > 0 ? `נמצאו ${matchedSkills.length} כישורים תואמים` : ''}${roleScore >= 80 ? ', התפקיד מתאים לרקע שלך' : ''}${experienceScore >= 80 ? ', רמת הניסיון מתאימה' : ''}.`;
  } else if (category === 'GOOD' || category === 'POSSIBLE') {
    reasoning = `משרה עם פוטנציאל. ${matchedSkills.length > 0 ? `${matchedSkills.length} כישורים תואמים` : ''}${missingSkills.length > 0 ? `, חסרים ${missingSkills.length} כישורים` : ''}. ${roleScore >= 60 ? 'התפקיד קרוב לתחום שלך' : 'כדאי לבדוק התאמה'}.`;
  } else if (category === 'STRETCH') {
    reasoning = `משרה מאתגרת — דורשת למידה. ${missingSkills.length > 0 ? `חסרים ${missingSkills.length} כישורים` : ''}, אך יכולה לקדם את הקריירה שלך.`;
  } else {
    reasoning = `התאמה נמוכה — ${redFlags.length > 0 ? redFlags[0] : 'משרה לא בתחום שלך'}.`;
  }

  return {
    score: overallScore,
    skillMatch: skillScore,
    experienceMatch: experienceScore,
    roleRelevance: roleScore,
    locationMatch: locationScore,
    reasoning,
    matchedSkills: [...new Set(matchedSkills)].slice(0, 10),
    missingSkills: [...new Set(missingSkills)].slice(0, 8),
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
