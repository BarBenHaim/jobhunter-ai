import logger from '../../utils/logger';
import { AIError } from '../../utils/errors';
import { aiClient, JobData, PersonaData, ProfileData, ScoreResult } from '../client';
import { CV_CONTENT_PROMPT } from '../prompts';

/**
 * CV Generation Engine
 * Tailors CV content for specific jobs with keyword optimization
 */

export interface CVContent {
  summary: string;
  skills: string[];
  keywordInjections: string[];
  selectedExperiences: Array<{
    title: string;
    company: string;
    duration: string;
    description: string;
  }>;
  selectedEducation: Array<{
    degree: string;
    field: string;
    school: string;
  }>;
  selectedCertifications?: string[];
  selectedProjects?: Array<{
    name: string;
    description: string;
  }>;
}

export interface CVOptimization {
  originalKeywords: string[];
  injectedKeywords: string[];
  keywordCoveragePercent: number;
  atsScore: number;
  recommendations: string[];
}

/**
 * Generate tailored CV content for a specific job
 */
export async function generateCVContent(
  job: JobData,
  persona: PersonaData,
  profile: ProfileData,
  score?: ScoreResult
): Promise<CVContent> {
  try {
    logger.info(`Generating tailored CV content for ${job.title} at ${job.company}`);

    const cvContent = await aiClient.generateCVContent(job, persona, profile);

    // Validate and normalize response
    if (!cvContent.summary || !cvContent.skills) {
      throw new AIError('Invalid CV content response');
    }

    return cvContent as CVContent;
  } catch (error) {
    logger.error('Error generating CV content:', error);
    throw error instanceof AIError
      ? error
      : new AIError('Failed to generate CV content');
  }
}

/**
 * Extract key terms and phrases from job description
 */
export async function extractKeywords(jobDescription: string): Promise<string[]> {
  try {
    logger.info('Extracting keywords from job description');

    const keywords = await aiClient.extractKeywords(jobDescription);

    // Deduplicate and normalize
    const uniqueKeywords = Array.from(
      new Set(keywords.map((k) => k.toLowerCase().trim()))
    );

    logger.info(`Extracted ${uniqueKeywords.length} unique keywords`);
    return uniqueKeywords;
  } catch (error) {
    logger.error('Error extracting keywords:', error);
    return [];
  }
}

/**
 * Generate job-specific professional summary
 */
export async function tailorSummary(
  persona: PersonaData,
  job: JobData,
  profile: ProfileData
): Promise<string> {
  try {
    logger.info(`Tailoring summary for ${job.title}`);

    const systemPrompt = `You are an expert resume writer.
Generate a compelling 2-3 sentence professional summary tailored to this specific job.
The summary should:
- Directly address the job requirements
- Highlight most relevant experience
- Show understanding of the role and company
- Be confident and specific, not generic
Return ONLY the summary text, no markdown or formatting.`;

    const userPrompt = `Create a professional summary for:
Persona: ${persona.name} - ${persona.title}
Profile: ${JSON.stringify(profile, null, 2)}
Job: ${job.title} at ${job.company}
Job Description: ${job.description}`;

    // Using the aiClient's internal API method
    const message = await (aiClient as any).callAPI(systemPrompt, userPrompt);
    return message.trim();
  } catch (error) {
    logger.error('Error tailoring summary:', error);
    // Return a basic summary as fallback
    return `Results-driven ${persona.title} with proven expertise in ${
      persona.targetKeywords?.[0] || 'technology'
    }. Seeking to contribute to ${job.company}'s mission.`;
  }
}

/**
 * Select and rewrite experiences for job relevance
 */
export async function selectExperiences(
  profile: ProfileData,
  persona: PersonaData,
  job: JobData
): Promise<
  Array<{
    title: string;
    company: string;
    duration: string;
    description: string;
  }>
> {
  try {
    logger.info('Selecting and tailoring experiences');

    const systemPrompt = `You are an expert resume strategist.
Given a candidate's experience history and a target job, select the 3-5 most relevant experiences
and rewrite their descriptions to emphasize job-relevant achievements.

Return a JSON array:
[
  {
    "title": "Job Title",
    "company": "Company",
    "duration": "Start-End",
    "description": "2-3 sentences emphasizing job-relevant accomplishments"
  }
]

Rules:
- Prioritize by relevance to target job
- Include quantifiable results (% improvements, users impacted, etc.)
- Use action verbs (Led, Designed, Implemented, etc.)
- Tailor language to match job keywords
- Only include 3-5 most relevant experiences
- If gap, mention volunteer work or projects`;

    const userPrompt = `Select experiences for this job:
Target Job: ${job.title} at ${job.company}
Job Description: ${job.description}

Candidate Experiences:
${JSON.stringify(profile.experiences || [], null, 2)}`;

    const response = await (aiClient as any).callAPI(systemPrompt, userPrompt);
    const experiences = (aiClient as any).parseJSON(response);
    return experiences;
  } catch (error) {
    logger.error('Error selecting experiences:', error);
    // Return first 3 experiences as fallback
    return (profile.experiences || []).slice(0, 3).map((exp) => ({
      title: exp.title || '',
      company: exp.company || '',
      duration: exp.duration || '',
      description: exp.description || '',
    }));
  }
}

/**
 * Generate tailored cover letter
 */
export async function generateCoverLetter(
  job: JobData,
  persona: PersonaData,
  profile: ProfileData
): Promise<string> {
  try {
    logger.info(`Generating cover letter for ${job.title} at ${job.company}`);

    const coverLetter = await aiClient.generateCoverLetter(job, persona, profile);
    return coverLetter;
  } catch (error) {
    logger.error('Error generating cover letter:', error);
    throw error instanceof AIError
      ? error
      : new AIError('Failed to generate cover letter');
  }
}

/**
 * Analyze CV for ATS compatibility and keyword coverage
 */
export async function analyzeATSCompatibility(
  cvText: string,
  jobKeywords?: string[]
): Promise<CVOptimization> {
  try {
    logger.info('Analyzing CV for ATS compatibility');

    const atsResult = await aiClient.validateATSCompatibility(cvText);

    // Extract job keywords if not provided
    let keywords = jobKeywords || [];
    if (!jobKeywords) {
      keywords = [
        'javascript',
        'typescript',
        'react',
        'node',
        'sql',
        'cloud',
        'aws',
      ];
    }

    // Calculate keyword coverage
    const cvLower = cvText.toLowerCase();
    const foundKeywords = keywords.filter((kw) =>
      cvLower.includes(kw.toLowerCase())
    );
    const keywordCoveragePercent = (foundKeywords.length / keywords.length) * 100;

    const result: CVOptimization = {
      originalKeywords: keywords,
      injectedKeywords: foundKeywords,
      keywordCoveragePercent: Math.round(keywordCoveragePercent),
      atsScore: atsResult.score || 0,
      recommendations: atsResult.recommendations || [],
    };

    logger.info('ATS analysis complete', {
      score: result.atsScore,
      keywordCoverage: result.keywordCoveragePercent,
    });

    return result;
  } catch (error) {
    logger.error('Error analyzing ATS compatibility:', error);
    throw error instanceof AIError
      ? error
      : new AIError('Failed to analyze ATS compatibility');
  }
}

/**
 * Optimize CV content for specific job
 * Full pipeline: extract keywords, generate content, validate ATS
 */
export async function optimizeCVForJob(
  job: JobData,
  persona: PersonaData,
  profile: ProfileData,
  score?: ScoreResult
): Promise<{
  content: CVContent;
  optimization: CVOptimization;
  recommendations: string[];
}> {
  try {
    logger.info(`Full CV optimization for ${job.title}`);

    // Step 1: Extract keywords
    const keywords = await extractKeywords(job.description);

    // Step 2: Generate tailored content
    const content = await generateCVContent(job, persona, profile, score);

    // Step 3: Simulate CV text for ATS analysis
    const simulated = generateSimulatedCVText(content);

    // Step 4: Analyze ATS compatibility
    const optimization = await analyzeATSCompatibility(simulated, keywords);

    // Generate recommendations
    const recommendations: string[] = [];

    if (optimization.atsScore < 70) {
      recommendations.push(
        'CV has ATS compatibility issues. Consider using simpler formatting.'
      );
    }

    if (optimization.keywordCoveragePercent < 60) {
      recommendations.push(
        `Only ${optimization.keywordCoveragePercent}% of job keywords present. Add more relevant terms.`
      );
    }

    if (content.skills.length < 10) {
      recommendations.push(
        'Consider adding more relevant skills from your background.'
      );
    }

    logger.info('CV optimization complete', {
      atsScore: optimization.atsScore,
      keywordCoverage: optimization.keywordCoveragePercent,
      recommendations: recommendations.length,
    });

    return {
      content,
      optimization,
      recommendations,
    };
  } catch (error) {
    logger.error('Error optimizing CV:', error);
    throw error instanceof AIError
      ? error
      : new AIError('Failed to optimize CV');
  }
}

/**
 * Generate simulated CV text from CV content structure
 * Used for ATS analysis
 */
function generateSimulatedCVText(content: CVContent): string {
  const lines: string[] = [];

  // Summary
  lines.push(content.summary);
  lines.push('');

  // Skills
  if (content.skills.length > 0) {
    lines.push('SKILLS');
    lines.push(content.skills.join(', '));
    lines.push('');
  }

  // Experience
  if (content.selectedExperiences.length > 0) {
    lines.push('EXPERIENCE');
    for (const exp of content.selectedExperiences) {
      lines.push(`${exp.title} at ${exp.company}`);
      lines.push(`${exp.duration}`);
      lines.push(exp.description);
      lines.push('');
    }
  }

  // Education
  if (content.selectedEducation.length > 0) {
    lines.push('EDUCATION');
    for (const edu of content.selectedEducation) {
      lines.push(`${edu.degree} in ${edu.field}`);
      lines.push(`${edu.school}`);
      lines.push('');
    }
  }

  // Certifications
  if (content.selectedCertifications && content.selectedCertifications.length > 0) {
    lines.push('CERTIFICATIONS');
    lines.push(content.selectedCertifications.join(', '));
    lines.push('');
  }

  // Projects
  if (content.selectedProjects && content.selectedProjects.length > 0) {
    lines.push('PROJECTS');
    for (const project of content.selectedProjects) {
      lines.push(project.name);
      lines.push(project.description);
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Get skill recommendations to improve for job match
 */
export async function getSkillRecommendations(
  profile: ProfileData,
  job: JobData
): Promise<
  Array<{
    skill: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
    reason: string;
    timeToLearn: string;
  }>
> {
  try {
    logger.info(`Getting skill recommendations for ${job.title}`);

    const systemPrompt = `You are a career development advisor.
Analyze the required skills for a job and the candidate's current skills.
Return a JSON array of recommended skills to learn, prioritized by importance:

[
  {
    "skill": "Skill name",
    "priority": "critical|high|medium|low",
    "reason": "Why this skill matters for the role",
    "timeToLearn": "1-2 weeks", "1-2 months", "2-3 months", "3+ months"
  }
]

Rules:
- Include 5-8 recommendations
- Critical = Must have for role success
- High = Significantly improves candidacy
- Medium = Nice to have, helps differentiation
- Low = Optional nice-to-have
- Be realistic about learning times`;

    const candidateSkills = (profile.skills || [])
      .map((s) => (typeof s === 'string' ? s : s.name))
      .join(', ');

    const userPrompt = `Recommend skills to improve:
Job: ${job.title}
Job Description: ${job.description}
Current Skills: ${candidateSkills}`;

    const response = await (aiClient as any).callAPI(systemPrompt, userPrompt);
    const recommendations = (aiClient as any).parseJSON(response);
    return recommendations;
  } catch (error) {
    logger.error('Error getting skill recommendations:', error);
    return [];
  }
}
