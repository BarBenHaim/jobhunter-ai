import logger from '../../utils/logger';
import { AIError } from '../../utils/errors';
import { aiClient, ProfileData } from '../client';
import {
  PROFILE_EXTRACT_PROMPT,
  PROFILE_NORMALIZE_PROMPT,
  PROFILE_ENRICH_PROMPT,
  PROFILE_GAPS_PROMPT,
} from '../prompts';

/**
 * Profile Analysis Engine
 * Extracts, normalizes, enriches, and analyzes user profiles
 */

export interface EnrichedProfile extends ProfileData {
  enrichmentMetadata?: {
    inferredSkills?: Array<{
      name: string;
      proficiency: number;
      source: string;
    }>;
    lastEnriched?: Date;
    enrichmentConfidence?: number;
  };
}

export interface ProfileGaps {
  gaps: Array<{
    category: string;
    gap: string;
    impact: string;
    difficulty: 'Easy' | 'Medium' | 'Hard';
    timelineMonths: number;
  }>;
  readiness: number;
  topPriorities: string[];
}

/**
 * Extract structured profile from raw text
 * Handles resume text, CV text, or free-form descriptions
 */
export async function extractProfile(rawText: string): Promise<ProfileData> {
  try {
    logger.info('Extracting profile from raw text');

    const prompt = PROFILE_EXTRACT_PROMPT(rawText);
    const response = await (aiClient as any).callAPI(prompt.system, prompt.user);
    const profile = (aiClient as any).parseJSON<ProfileData>(response);

    // Validate extracted profile
    if (!profile.summary || !Array.isArray(profile.skills)) {
      throw new AIError('Failed to extract valid profile structure');
    }

    logger.info('Profile extracted successfully', {
      skills: profile.skills?.length || 0,
      experiences: profile.experiences?.length || 0,
      education: profile.education?.length || 0,
    });

    return profile;
  } catch (error) {
    logger.error('Error extracting profile:', error);
    throw error instanceof AIError
      ? error
      : new AIError('Failed to extract profile from text');
  }
}

/**
 * Normalize and deduplicate profile data
 * Merges duplicates, standardizes formats, validates data
 */
export async function normalizeProfile(profile: ProfileData): Promise<ProfileData> {
  try {
    logger.info('Normalizing profile data');

    const prompt = PROFILE_NORMALIZE_PROMPT(profile);
    const response = await (aiClient as any).callAPI(prompt.system, prompt.user);
    const normalized = (aiClient as any).parseJSON<ProfileData>(response);

    // Ensure all arrays exist
    const result: ProfileData = {
      summary: normalized.summary || profile.summary,
      skills: (normalized.skills || profile.skills || []).slice(0, 100), // Limit to 100 skills
      experiences: (normalized.experiences || profile.experiences || []).slice(0, 20),
      education: (normalized.education || profile.education || []).slice(0, 10),
      certifications: (normalized.certifications || profile.certifications || []).slice(0, 20),
      languages: (normalized.languages || profile.languages || []).slice(0, 15),
      projects: (normalized.projects || profile.projects || []).slice(0, 15),
    };

    logger.info('Profile normalized successfully', {
      uniqueSkills: result.skills?.length,
      experiences: result.experiences?.length,
    });

    return result;
  } catch (error) {
    logger.error('Error normalizing profile:', error);
    // Return original if normalization fails
    return profile;
  }
}

/**
 * Enrich profile with inferred skills
 * Identifies implicit skills from experiences
 */
export async function enrichProfile(profile: ProfileData): Promise<EnrichedProfile> {
  try {
    logger.info('Enriching profile with inferred skills');

    const prompt = PROFILE_ENRICH_PROMPT(profile);
    const response = await (aiClient as any).callAPI(prompt.system, prompt.user);
    const enriched = (aiClient as any).parseJSON<EnrichedProfile>(response);

    // Extract inferred skills if present
    const inferredSkills = enriched.inferredSkills || [];
    const allSkills = [
      ...(profile.skills || []),
      ...inferredSkills,
    ];

    // Deduplicate by skill name
    const skillMap = new Map();
    for (const skill of allSkills) {
      const key = typeof skill === 'string'
        ? skill.toLowerCase()
        : (skill as any).name.toLowerCase();

      if (!skillMap.has(key)) {
        skillMap.set(key, skill);
      }
    }

    const result: EnrichedProfile = {
      ...enriched,
      skills: Array.from(skillMap.values()),
      enrichmentMetadata: {
        inferredSkills,
        lastEnriched: new Date(),
        enrichmentConfidence: 85,
      },
    };

    logger.info('Profile enriched successfully', {
      originalSkills: profile.skills?.length || 0,
      enrichedSkills: result.skills?.length || 0,
      inferredCount: inferredSkills.length,
    });

    return result;
  } catch (error) {
    logger.error('Error enriching profile:', error);
    // Return original profile with empty enrichment metadata
    return {
      ...profile,
      enrichmentMetadata: {
        inferredSkills: [],
        lastEnriched: new Date(),
        enrichmentConfidence: 0,
      },
    };
  }
}

/**
 * Identify gaps between current profile and target roles
 */
export async function identifyGaps(
  profile: ProfileData,
  targetRoles: string[]
): Promise<ProfileGaps> {
  try {
    logger.info('Identifying profile gaps for target roles', { targetRoles });

    const prompt = PROFILE_GAPS_PROMPT(profile, targetRoles);
    const response = await (aiClient as any).callAPI(prompt.system, prompt.user);
    const gaps = (aiClient as any).parseJSON<ProfileGaps>(response);

    // Validate gap structure
    if (!Array.isArray(gaps.gaps)) {
      gaps.gaps = [];
    }

    // Sort gaps by difficulty (Easy -> Hard) and impact
    gaps.gaps.sort((a, b) => {
      const difficultyOrder = { Easy: 0, Medium: 1, Hard: 2 };
      const diffOrder = (difficultyOrder[a.difficulty] || 1) - (difficultyOrder[b.difficulty] || 1);
      return diffOrder !== 0 ? diffOrder : b.timelineMonths - a.timelineMonths;
    });

    logger.info('Gap analysis complete', {
      totalGaps: gaps.gaps.length,
      readiness: gaps.readiness,
      topPriorities: gaps.topPriorities?.length || 0,
    });

    return gaps;
  } catch (error) {
    logger.error('Error identifying gaps:', error);
    // Return empty gaps structure
    return {
      gaps: [],
      readiness: 0,
      topPriorities: [],
    };
  }
}

/**
 * Parse CV text directly and extract structure
 * Similar to extractProfile but optimized for CV format
 */
export async function parseUploadedCV(cvText: string): Promise<ProfileData> {
  try {
    logger.info('Parsing uploaded CV');

    // Clean up CV text (remove excess whitespace, normalize line breaks)
    const cleanedText = cvText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join('\n');

    const prompt = PROFILE_EXTRACT_PROMPT(cleanedText);
    const response = await (aiClient as any).callAPI(prompt.system, prompt.user);
    const profile = (aiClient as any).parseJSON<ProfileData>(response);

    logger.info('CV parsed successfully');
    return profile;
  } catch (error) {
    logger.error('Error parsing CV:', error);
    throw error instanceof AIError
      ? error
      : new AIError('Failed to parse CV');
  }
}

/**
 * Full profile processing pipeline
 * Extract -> Normalize -> Enrich
 */
export async function processRawProfile(rawText: string): Promise<EnrichedProfile> {
  try {
    logger.info('Starting full profile processing pipeline');

    // Step 1: Extract
    const extracted = await extractProfile(rawText);
    logger.info('Step 1: Extraction complete');

    // Step 2: Normalize
    const normalized = await normalizeProfile(extracted);
    logger.info('Step 2: Normalization complete');

    // Step 3: Enrich
    const enriched = await enrichProfile(normalized);
    logger.info('Step 3: Enrichment complete');

    return enriched;
  } catch (error) {
    logger.error('Error in profile processing pipeline:', error);
    throw error instanceof AIError
      ? error
      : new AIError('Failed to process profile');
  }
}

/**
 * Get skill recommendations for improvement
 */
export async function getSkillImprovementPlan(
  profile: ProfileData,
  targetRoles: string[]
): Promise<
  Array<{
    skill: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
    reason: string;
    resourceType: string;
    estimatedHours: number;
  }>
> {
  try {
    logger.info('Generating skill improvement plan');

    const systemPrompt = `You are a career development strategist.
Given a candidate's current profile and target roles, recommend specific skills to develop.

Return a JSON array:
[
  {
    "skill": "Skill name",
    "priority": "critical|high|medium|low",
    "reason": "Why this skill is important",
    "resourceType": "Online Course|Book|Certification|Practice|Project",
    "estimatedHours": 40
  }
]

Prioritization rules:
- Critical: Essential for target role success
- High: Significantly improves competitiveness
- Medium: Nice to have, adds value
- Low: Optional, future-proof skills
- Return 8-10 recommendations maximum`;

    const currentSkills = (profile.skills || [])
      .map((s) => (typeof s === 'string' ? s : s.name))
      .join(', ');

    const userPrompt = `Generate improvement plan:
Target Roles: ${targetRoles.join(', ')}
Current Skills: ${currentSkills}
Profile Experience Level: ${profile.experiences?.length || 0} roles
Education: ${profile.education?.map((e) => e.degree).join(', ') || 'Not specified'}`;

    const response = await (aiClient as any).callAPI(systemPrompt, userPrompt);
    const plan = (aiClient as any).parseJSON(response);

    return plan;
  } catch (error) {
    logger.error('Error generating skill improvement plan:', error);
    return [];
  }
}

/**
 * Validate profile completeness
 */
export function validateProfileCompleteness(
  profile: ProfileData
): {
  score: number;
  missing: string[];
  recommendations: string[];
} {
  const missing: string[] = [];
  const recommendations: string[] = [];
  let score = 100;

  // Check summary
  if (!profile.summary || profile.summary.trim().length === 0) {
    missing.push('Professional Summary');
    score -= 15;
    recommendations.push('Add a professional summary highlighting your key strengths');
  }

  // Check skills
  if (!profile.skills || profile.skills.length === 0) {
    missing.push('Skills');
    score -= 20;
    recommendations.push('Add at least 10-15 relevant skills');
  } else if (profile.skills.length < 5) {
    score -= 10;
    recommendations.push(`Add more skills (currently ${profile.skills.length})`);
  }

  // Check experience
  if (!profile.experiences || profile.experiences.length === 0) {
    missing.push('Work Experience');
    score -= 25;
    recommendations.push('Add your work experience, including job titles and descriptions');
  }

  // Check education
  if (!profile.education || profile.education.length === 0) {
    score -= 10;
    recommendations.push('Add your educational background');
  }

  // Check projects
  if (!profile.projects || profile.projects.length === 0) {
    score -= 10;
    recommendations.push('Add 2-3 key projects demonstrating your skills');
  }

  // Check certifications
  if (!profile.certifications || profile.certifications.length === 0) {
    score -= 5;
    recommendations.push(
      'Consider adding relevant certifications to strengthen your profile'
    );
  }

  // Check languages
  if (!profile.languages || profile.languages.length === 0) {
    score -= 5;
    recommendations.push(
      'If applicable, add any languages you speak to expand opportunities'
    );
  }

  return {
    score: Math.max(0, score),
    missing,
    recommendations,
  };
}
