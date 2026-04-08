import Anthropic from '@anthropic-ai/sdk';
import logger from '../utils/logger';
import { AIError } from '../utils/errors';
import { costTracker } from '../services/cost-tracker.service';

/**
 * AI Client - Anthropic Claude API integration
 * Provides methods for all AI-powered operations with retry logic,
 * rate limiting, and token usage tracking
 */

export interface JobData {
  id: string;
  title: string;
  company: string;
  location?: string;
  description: string;
  requirements?: string;
  salary?: any;
  experienceLevel?: string;
}

export interface PersonaData {
  name: string;
  title: string;
  summary?: string;
  targetKeywords: string[];
  excludeKeywords?: string[];
}

export interface ProfileData {
  skills?: Array<{ name: string; proficiency: number }>;
  experiences?: any[];
  education?: any[];
  projects?: any[];
  certifications?: any[];
  languages?: string[];
  summary?: string;
}

export interface ScoreResult {
  overallScore: number;
  skillMatch: number;
  experienceMatch: number;
  cultureFit: number;
  salaryMatch: number;
  acceptanceProb: number;
  careerGrowth: number;
  isExceptional: boolean;
  exceptionalReason: string | null;
  matchedSkills: string[];
  missingSkills: string[];
  redFlags: string[];
  greenFlags: string[];
  reasoning: string;
  careerAdvice: string;
  cvTailoringTips: string[];
  bestPersona?: string;
}

interface APIMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export class AIClient {
  private client: Anthropic;
  private isInitialized = false;
  private concurrentRequests = 0;
  private maxConcurrentRequests = 10;
  private requestQueue: Array<() => Promise<any>> = [];
  private tokenUsage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;

    if (!apiKey) {
      logger.warn('Anthropic API key not configured - AI features will be limited');
      return;
    }

    this.client = new Anthropic({
      apiKey,
      defaultHeaders: {
        'user-agent': 'jobhunter-ai-client/1.0',
      },
    });

    this.isInitialized = true;
    logger.info('AI Client initialized with Anthropic API');
  }

  /**
   * Call Claude API with retry logic and rate limiting
   */
  async callAPI(
    systemPrompt: string,
    userPrompt: string,
    maxRetries = 3,
    timeout = 30000
  ): Promise<string> {
    if (!this.isInitialized) {
      throw new AIError('AI service not initialized. Please configure API keys.');
    }

    // Implement rate limiting with queue
    while (this.concurrentRequests >= this.maxConcurrentRequests) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.concurrentRequests++;

    try {
      let lastError: Error | null = null;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeout);

          const response = await this.client.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4096,
            system: systemPrompt,
            messages: [
              {
                role: 'user',
                content: userPrompt,
              },
            ],
          });

          clearTimeout(timeoutId);

          // Track token usage and record cost
          if (response.usage) {
            this.tokenUsage.inputTokens += response.usage.input_tokens;
            this.tokenUsage.outputTokens += response.usage.output_tokens;
            this.tokenUsage.totalTokens += response.usage.input_tokens + response.usage.output_tokens;

            // Record API call cost
            costTracker.recordAnthropicCall(
              response.usage.input_tokens,
              response.usage.output_tokens
            );
          }

          // Extract text from response
          const content = response.content[0];
          if (content.type === 'text') {
            return content.text;
          }

          throw new Error('Unexpected response format from API');
        } catch (error) {
          lastError = error as Error;

          if (attempt < maxRetries - 1) {
            const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10000);
            logger.warn(
              `API call failed (attempt ${attempt + 1}/${maxRetries}), retrying in ${backoffMs}ms`,
              { error: lastError.message }
            );
            await new Promise(resolve => setTimeout(resolve, backoffMs));
          }
        }
      }

      throw lastError || new Error('API call failed after retries');
    } finally {
      this.concurrentRequests--;
    }
  }

  /**
   * Parse JSON response from Claude API
   */
  parseJSON<T>(text: string): T {
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonText = jsonMatch ? jsonMatch[1] : text;
      return JSON.parse(jsonText.trim());
    } catch (error) {
      logger.error('Failed to parse API response as JSON', { text: text.substring(0, 200) });
      throw new AIError('Failed to parse AI response. Please try again.');
    }
  }

  /**
   * Get token usage statistics
   */
  getTokenUsage(): TokenUsage {
    return { ...this.tokenUsage };
  }

  /**
   * Reset token usage counter
   */
  resetTokenUsage(): void {
    this.tokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  }

  /**
   * Analyze raw text knowledge and structure it into profile components
   */
  async analyzeProfile(rawText: string): Promise<ProfileData> {
    try {
      logger.info('Analyzing profile from raw text');

      if (!this.isInitialized) {
        throw new AIError('AI service not initialized. Please configure API keys.');
      }

      const systemPrompt = `You are an expert HR analyst specializing in parsing resumes and CVs.
Extract and structure professional information from the provided text.
Return a JSON object with the following structure:
{
  "summary": "Brief professional summary (2-3 sentences)",
  "skills": [{"name": "skill", "proficiency": 1-5}, ...],
  "experiences": [{"title": "Job Title", "company": "Company", "duration": "X years", "description": "Key accomplishments"}, ...],
  "education": [{"degree": "Bachelor's", "field": "Computer Science", "school": "University"}, ...],
  "certifications": ["Certification name", ...],
  "languages": ["Language", ...],
  "projects": [{"name": "Project", "description": "Brief description", "technologies": ["tech1", "tech2"]}, ...]
}
Ensure proficiency levels are 1-5, with 1 being beginner and 5 being expert.`;

      const userPrompt = `Please analyze and structure this professional information:\n\n${rawText}`;

      const response = await this.callAPI(systemPrompt, userPrompt);
      return this.parseJSON<ProfileData>(response);
    } catch (error) {
      logger.error('Error analyzing profile:', error);
      if (error instanceof AIError) throw error;
      throw new AIError('Failed to analyze profile');
    }
  }

  /**
   * Normalize and deduplicate profile data
   */
  async normalizeProfile(
    profile: ProfileData
  ): Promise<ProfileData> {
    try {
      logger.info('Normalizing profile data');

      if (!this.isInitialized) {
        throw new AIError('AI service not initialized');
      }

      const systemPrompt = `You are an expert data cleaner specializing in professional profiles.
Normalize and deduplicate the provided profile data:
- Merge duplicate skills (e.g., "JavaScript" and "JS")
- Standardize job titles (e.g., "Sr Dev" -> "Senior Developer")
- Parse date ranges into consistent format
- Remove duplicates while preserving proficiency levels
Return the cleaned profile as JSON in the same structure.`;

      const userPrompt = `Please normalize this profile:\n\n${JSON.stringify(profile, null, 2)}`;

      const response = await this.callAPI(systemPrompt, userPrompt);
      return this.parseJSON<ProfileData>(response);
    } catch (error) {
      logger.error('Error normalizing profile:', error);
      if (error instanceof AIError) throw error;
      throw new AIError('Failed to normalize profile');
    }
  }

  /**
   * Enrich profile with inferred skills and insights
   */
  async enrichProfile(profile: ProfileData): Promise<ProfileData> {
    try {
      logger.info('Enriching profile with inferred skills');

      if (!this.isInitialized) {
        throw new AIError('AI service not initialized');
      }

      const systemPrompt = `You are an expert career analyst who infers implicit skills from explicit experience.
Given a professional profile, identify additional skills that can be inferred from the experiences listed.
For example, managing a team implies leadership skills, deploying systems implies DevOps knowledge.
Add inferred skills to the skills array with appropriate proficiency levels (lower than explicit skills).
Return the enriched profile as JSON.`;

      const userPrompt = `Please enrich this profile with inferred skills:\n\n${JSON.stringify(profile, null, 2)}`;

      const response = await this.callAPI(systemPrompt, userPrompt);
      return this.parseJSON<ProfileData>(response);
    } catch (error) {
      logger.error('Error enriching profile:', error);
      if (error instanceof AIError) throw error;
      throw new AIError('Failed to enrich profile');
    }
  }

  /**
   * Identify gaps between profile and target roles
   */
  async identifyGaps(profile: ProfileData, targetRoles: string[]): Promise<string[]> {
    try {
      logger.info('Identifying profile gaps for target roles', { targetRoles });

      if (!this.isInitialized) {
        throw new AIError('AI service not initialized');
      }

      const systemPrompt = `You are an expert career advisor analyzing skill gaps.
Given a professional profile and target job roles, identify critical missing skills, experience gaps, and certifications.
Return a JSON array of gap analysis items as strings, prioritized by importance.
Format: ["Gap 1: description", "Gap 2: description", ...]`;

      const userPrompt = `Profile:\n${JSON.stringify(profile, null, 2)}\n\nTarget roles: ${targetRoles.join(', ')}\n\nIdentify critical gaps for these roles.`;

      const response = await this.callAPI(systemPrompt, userPrompt);
      return this.parseJSON<string[]>(response);
    } catch (error) {
      logger.error('Error identifying gaps:', error);
      return [];
    }
  }

  /**
   * Identify gaps in user's profile compared to market standards
   */
  async identifyProfileGaps(profile: ProfileData): Promise<string[]> {
    try {
      logger.info('Identifying profile gaps');

      if (!this.isInitialized) {
        throw new AIError('AI service not initialized');
      }

      return this.identifyGaps(profile, ['Senior Developer', 'Technical Lead']);
    } catch (error) {
      logger.error('Error identifying profile gaps:', error);
      throw new AIError('Failed to identify profile gaps');
    }
  }

  /**
   * Score a job against a persona using AI analysis
   */
  async scoreJob(
    job: JobData,
    persona: PersonaData,
    profile?: ProfileData
  ): Promise<ScoreResult> {
    try {
      logger.info(`Scoring job for persona: ${persona.name}`);

      if (!this.isInitialized) {
        throw new AIError('AI service not initialized');
      }

      const systemPrompt = `You are an expert career advisor and job-candidate fit analyst.
Evaluate how well a job matches a professional persona considering:
1. **Career Growth Potential** - Is this a step up? Does it advance their trajectory?
2. **Exceptional Opportunity Detection** - Flag outstanding jobs (top-tier companies, unique roles, above-market salary, learning opportunities)
3. **CV-Job Match Quality** - How well does the candidate's actual experience match what's needed?
4. **Hidden Gems** - Jobs that may not perfectly match keywords but offer great growth
5. **Full Career Trajectory** - Consider their entire career arc, not just keyword matching
6. **Stretch Opportunities** - Jobs 10-20% above current level are growth opportunities

Top-tier companies: Google, Microsoft, Meta, Amazon, Apple, Netflix, OpenAI, Anthropic, Stripe, Figma, etc.

Return a JSON object with:
{
  "overallScore": 0-100,
  "skillMatch": 0-100,
  "experienceMatch": 0-100,
  "cultureFit": 0-100,
  "salaryMatch": 0-100,
  "acceptanceProb": 0-1,
  "careerGrowth": 0-100,
  "isExceptional": true/false,
  "exceptionalReason": "string or null",
  "matchedSkills": ["skill1", "skill2"],
  "missingSkills": ["skill1", "skill2"],
  "redFlags": ["concern1", "concern2"],
  "greenFlags": ["positive1", "positive2"],
  "reasoning": "3-4 sentence detailed analysis",
  "careerAdvice": "1-2 sentences about how this job fits career trajectory",
  "cvTailoringTips": ["tip1", "tip2", "tip3"]
}`;

      const profileStr = profile
        ? `\nCandidate Profile:\n${JSON.stringify(profile, null, 2)}`
        : '';

      const userPrompt = `Evaluate this job for the following persona:
Name: ${persona.name}
Target Title: ${persona.title}
Target Keywords: ${persona.targetKeywords.join(', ')}
Summary: ${persona.summary || 'Not provided'}${profileStr}

Job Details:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location || 'Not specified'}
Description: ${job.description}
Requirements: ${job.requirements || 'Not specified'}
Salary: ${job.salary ? JSON.stringify(job.salary) : 'Not specified'}
Experience Level: ${job.experienceLevel || 'Not specified'}

Think deeply about:
- Does this advance their career? Is it a stretch (good) or too easy/repetitive?
- Is the company top-tier? Does it have strong learning opportunities?
- Will this job fill skill gaps the candidate has?
- What specific CV bullets would make them stand out for THIS job?
- Are there hidden reasons this might be exceptional despite not perfectly matching keywords?

Provide a detailed fit analysis with career growth potential.`;

      const response = await this.callAPI(systemPrompt, userPrompt);
      return this.parseJSON<ScoreResult>(response);
    } catch (error) {
      logger.error('Error scoring job:', error);
      if (error instanceof AIError) throw error;
      throw new AIError('Failed to score job');
    }
  }

  /**
   * Batch score multiple jobs efficiently
   */
  async batchScoreJobs(
    jobs: JobData[],
    persona: PersonaData,
    profile?: ProfileData
  ): Promise<ScoreResult[]> {
    try {
      logger.info(`Batch scoring ${jobs.length} jobs`);

      const scores = await Promise.all(
        jobs.map(job => this.scoreJob(job, persona, profile))
      );

      return scores;
    } catch (error) {
      logger.error('Error batch scoring jobs:', error);
      throw new AIError('Failed to batch score jobs');
    }
  }

  /**
   * Generate tailored CV content for a specific job
   */
  async generateCVContent(
    job: JobData,
    persona: PersonaData,
    profile?: ProfileData
  ): Promise<any> {
    try {
      logger.info(`Generating CV content for job: ${job.title}`);

      if (!this.isInitialized) {
        throw new AIError('AI service not initialized');
      }

      const systemPrompt = `You are an elite CV strategist who thinks like a top recruitment agency. Your job is to AGGRESSIVELY reshape a candidate's CV to maximize their chances for a SPECIFIC job.

You don't just select relevant experience — you REFRAME, RETITLE, and RESHAPE everything to fit the target role. Think of it as showing the same person from a completely different angle.

CRITICAL RULES FOR AGGRESSIVE TAILORING:
1. **RETITLE job positions** — If the candidate was "Data Analyst" but applying for a dev role, retitle to "Data Solutions Developer" or "Technical Analyst & Developer". If they were "Info Systems Manager" and applying for a PM role, retitle to "Technical Project Manager". The title must be truthful but angled toward the target job.
2. **REWRITE every experience bullet** — Don't copy descriptions. Rewrite them emphasizing the aspects that matter for THIS job. A database role becomes "Architected and optimized SQL-based data pipelines" for a backend role, or "Led cross-functional data initiatives" for a PM role.
3. **REORDER experiences** — Put the most relevant experience FIRST, regardless of chronological order.
4. **INJECT job keywords naturally** — Weave 10-15 keywords from the job description into skills and experience descriptions seamlessly.
5. **EMPHASIZE transferable achievements** — Managing 100+ users becomes "stakeholder management", budget oversight becomes "resource planning", building CRM integrations becomes "system architecture".
6. **CREATE a killer summary** — 2-3 sentences that read like this person was BORN for this specific role.
7. **INCLUDE ALL experiences** — Don't drop experiences. Reshape each one to show relevance to the target role. Every role has transferable value.

Return a JSON object with:
{
  "summary": "2-3 sentence professional summary that positions the candidate perfectly for THIS role",
  "skills": ["Skill 1", "Skill 2", ...] (up to 15, prioritized by job relevance, include exact terms from job posting),
  "keywordInjections": ["keyword1", "keyword2", ...] (10-15 keywords extracted from job description),
  "experiences": [
    {
      "title": "RESHAPED Job Title (angled toward target role)",
      "company": "Company Name",
      "duration": "Period (e.g. 2024-2025)",
      "description": "3-4 bullet points as a single string, each on new line with •, rewritten to emphasize relevance to target job. Use action verbs and quantified achievements."
    }
  ],
  "education": [
    {
      "degree": "Degree",
      "field": "Field",
      "school": "School"
    }
  ],
  "projects": [
    {
      "name": "Project Name",
      "description": "Tailored description emphasizing aspects relevant to target job"
    }
  ],
  "tailoredHighlights": ["highlight1", "highlight2", "highlight3", "highlight4", "highlight5"],
  "matchPercentage": 0-100
}

IMPORTANT FIELD NAMES: Use "experiences" (not "selectedExperiences"), "education" (not "selectedEducation"), "projects" (not "selectedProjects").

Rules:
- Be AGGRESSIVE with reshaping — the candidate gave explicit permission to "round corners" and reframe
- Every experience description must use the LANGUAGE of the target job (technical terms, industry jargon)
- tailoredHighlights should be 5 specific, compelling bullet points for THIS job
- matchPercentage reflects estimated ATS pass rate
- ATS-friendly: no special characters except standard punctuation, bullet points as •
- Output must be valid JSON`;

      const profileStr = profile
        ? `\nCandidate Profile:\n${JSON.stringify(profile, null, 2)}`
        : '';

      const userPrompt = `Generate deeply tailored CV content for:
Persona: ${persona.name} (${persona.title})
${profileStr}

Job Details:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location || 'Not specified'}
Description: ${job.description}
Requirements: ${job.requirements || 'Not specified'}

Think deeply about:
- What does this company/role REALLY want (read between the lines)?
- What is the job type (engineering, product, leadership, growth, data)?
- Which of the candidate's experiences are most relevant?
- What keywords appear in the job description that should be naturally woven in?
- What 3-5 bullet points would make the candidate stand out for THIS specific role?

Generate the CV content with heavy focus on THIS specific job match.`;

      const response = await this.callAPI(systemPrompt, userPrompt);
      return this.parseJSON<any>(response);
    } catch (error) {
      logger.error('Error generating CV content:', error);
      if (error instanceof AIError) throw error;
      throw new AIError('Failed to generate CV content');
    }
  }

  /**
   * Extract keywords from job description
   */
  async extractKeywords(jobDescription: string): Promise<string[]> {
    try {
      logger.info('Extracting keywords from job description');

      if (!this.isInitialized) {
        throw new AIError('AI service not initialized');
      }

      const systemPrompt = `You are an expert at identifying critical keywords in job descriptions.
Extract 15-20 key technical skills, soft skills, and industry terms from the job description.
Return as a JSON array of strings: ["keyword1", "keyword2", ...]`;

      const userPrompt = `Extract key keywords from this job description:\n\n${jobDescription}`;

      const response = await this.callAPI(systemPrompt, userPrompt);
      return this.parseJSON<string[]>(response);
    } catch (error) {
      logger.error('Error extracting keywords:', error);
      return [];
    }
  }

  /**
   * Generate a follow-up message
   */
  async generateFollowUp(
    context: {
      jobTitle: string;
      company: string;
      personaName: string;
      daysSinceApplication: number;
      previousMessages?: string[];
    },
    type: 'initial' | 'second' | 'final' | 'thank_you' | 'negotiation'
  ): Promise<string> {
    try {
      logger.info(`Generating ${type} follow-up message for ${context.company}`);

      if (!this.isInitialized) {
        throw new AIError('AI service not initialized');
      }

      const typeGuidance: Record<string, string> = {
        initial: 'A polite initial follow-up expressing continued interest (4-5 days after application)',
        second: 'A more direct follow-up referencing the specific role and timeline (7-10 days after first follow-up)',
        final: 'A final professional follow-up (5-7 days after second follow-up)',
        thank_you: 'A thank you message after an interview, reiterating interest and key talking points',
        negotiation: 'A professional negotiation message for salary or terms discussion',
      };

      const previousContext = context.previousMessages
        ? `\n\nPrevious messages sent:\n${context.previousMessages.map((msg, i) => `${i + 1}. ${msg}`).join('\n')}`
        : '';

      const systemPrompt = `You are an expert professional email writer.
Generate a compelling, professional follow-up email that:
- Is concise (150-200 words)
- Uses a professional but friendly tone
- Includes specific references to the role and company
- Demonstrates genuine interest without being pushy
- Avoids sounding generic or desperate
Type: ${typeGuidance[type]}`;

      const userPrompt = `Write a ${type} follow-up email for:
Persona: ${context.personaName}
Job: ${context.jobTitle} at ${context.company}
Days since application: ${context.daysSinceApplication}${previousContext}`;

      const response = await this.callAPI(systemPrompt, userPrompt);
      return response.trim();
    } catch (error) {
      logger.error('Error generating follow-up:', error);
      if (error instanceof AIError) throw error;
      throw new AIError('Failed to generate follow-up message');
    }
  }

  /**
   * Generate comprehensive interview preparation package
   */
  async generateInterviewPrep(context: {
    jobTitle: string;
    company: string;
    personaName: string;
    jobDescription?: string;
    profile?: ProfileData;
  }): Promise<any> {
    try {
      logger.info(`Generating interview prep for ${context.company}`);

      if (!this.isInitialized) {
        throw new AIError('AI service not initialized');
      }

      const systemPrompt = `You are an expert interview coach.
Generate comprehensive interview preparation for a candidate.
Return a JSON object with:
{
  "companyResearch": {
    "overview": "2-3 sentence company overview",
    "industry": "Industry/sector",
    "culture": "Company culture highlights",
    "recentNews": ["News item 1", "News item 2"]
  },
  "roleAnalysis": {
    "keyResponsibilities": ["Responsibility 1", ...],
    "successMetrics": ["Metric 1", ...],
    "commonChallenges": ["Challenge 1", ...]
  },
  "questionBank": [
    {
      "question": "Question text",
      "type": "behavioral|technical|cultural",
      "framework": "STAR or technical approach",
      "keyPoints": ["Point 1", "Point 2"]
    }
  ],
  "technicalPrep": ["Topic 1", "Topic 2"],
  "questionsForInterviewer": ["Question 1", ...],
  "closingTips": ["Tip 1", "Tip 2"]
}`;

      const profileStr = context.profile
        ? `\nCandidate Profile:\n${JSON.stringify(context.profile, null, 2)}`
        : '';

      const jobStr = context.jobDescription
        ? `\nJob Description:\n${context.jobDescription}`
        : '';

      const userPrompt = `Prepare interview coaching for:
Persona: ${context.personaName}
Company: ${context.company}
Position: ${context.jobTitle}${jobStr}${profileStr}`;

      const response = await this.callAPI(systemPrompt, userPrompt);
      return this.parseJSON<any>(response);
    } catch (error) {
      logger.error('Error generating interview prep:', error);
      if (error instanceof AIError) throw error;
      throw new AIError('Failed to generate interview preparation');
    }
  }

  /**
   * Generate a cover letter
   */
  async generateCoverLetter(
    job: JobData,
    persona: PersonaData,
    profile?: ProfileData
  ): Promise<string> {
    try {
      logger.info(`Generating cover letter for ${job.company}`);

      if (!this.isInitialized) {
        throw new AIError('AI service not initialized');
      }

      const systemPrompt = `You are an expert cover letter writer.
Generate a compelling, tailored cover letter that:
- Is 3-4 paragraphs
- Opens with a strong hook showing genuine interest
- Demonstrates how the candidate's experience matches the role
- Highlights 2-3 specific achievements or skills from their profile
- Closes with enthusiasm and clear next steps
- Uses a professional but personable tone`;

      const profileStr = profile
        ? `\nCandidate Profile:\n${JSON.stringify(profile, null, 2)}`
        : '';

      const userPrompt = `Generate a cover letter for:
Persona: ${persona.name} (${persona.title})
${profileStr}

Position: ${job.title} at ${job.company}
Location: ${job.location || 'Not specified'}
Description: ${job.description}
Requirements: ${job.requirements || 'Not specified'}`;

      const response = await this.callAPI(systemPrompt, userPrompt);
      return response.trim();
    } catch (error) {
      logger.error('Error generating cover letter:', error);
      if (error instanceof AIError) throw error;
      throw new AIError('Failed to generate cover letter');
    }
  }

  /**
   * Validate CV for ATS compatibility
   */
  async validateATSCompatibility(cvText: string): Promise<any> {
    try {
      logger.info('Validating CV for ATS compatibility');

      if (!this.isInitialized) {
        throw new AIError('AI service not initialized');
      }

      const systemPrompt = `You are an ATS (Applicant Tracking System) expert.
Analyze a CV for compatibility with ATS systems.
Return a JSON object with:
{
  "isATSFriendly": true/false,
  "score": 0-100,
  "issues": ["Issue 1", "Issue 2"],
  "recommendations": ["Recommendation 1", "Recommendation 2"],
  "keywordCoverage": {
    "found": ["keyword1", "keyword2"],
    "missing": ["keyword1", "keyword2"]
  }
}
Check for:
- Tables, images, special formatting
- Standard fonts and structure
- Clear section headers
- Proper text encoding
- No graphics or PDFs with images`;

      const userPrompt = `Analyze this CV for ATS compatibility:\n\n${cvText}`;

      const response = await this.callAPI(systemPrompt, userPrompt);
      return this.parseJSON<any>(response);
    } catch (error) {
      logger.error('Error validating ATS compatibility:', error);
      throw new AIError('Failed to validate ATS compatibility');
    }
  }

  /**
   * Generate professional message
   */
  async generateMessage(
    context: Record<string, any>,
    type: string
  ): Promise<string> {
    try {
      logger.info(`Generating professional ${type} message`);

      if (!this.isInitialized) {
        throw new AIError('AI service not initialized');
      }

      const systemPrompt = `You are an expert professional communication writer.
Generate appropriate professional messages based on context and type.
Ensure messages are concise, professional, and contextually relevant.`;

      const userPrompt = `Generate a professional ${type} message for:\n${JSON.stringify(context, null, 2)}`;

      const response = await this.callAPI(systemPrompt, userPrompt);
      return response.trim();
    } catch (error) {
      logger.error('Error generating message:', error);
      if (error instanceof AIError) throw error;
      throw new AIError('Failed to generate message');
    }
  }
}

export const aiClient = new AIClient();
