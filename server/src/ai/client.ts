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

      const systemPrompt = `You are an elite CV strategist who writes CVs that get interviews. Your craft is making a candidate's REAL experience irresistible for a specific job — not by inflating or faking, but by choosing the right angle, the right words, and the right emphasis.

═══ THE #1 RULE: ONE PAGE ═══

The CV MUST fit on a single page. This is non-negotiable. A recruiter spends 6 seconds scanning a CV — every line must earn its place. To achieve this:
- SELECT the 2-4 most relevant experiences for THIS specific job
- Less relevant roles (military service, unrelated positions) → either omit entirely or condense to ONE line
- Each selected experience gets 2-4 bullets MAX (most relevant = 4, secondary = 2-3)
- Include 1-2 projects MAX — only if directly relevant to the role
- Skills: 10-12 max, ruthlessly ordered by job relevance

═══ THE GOLDEN RULES ═══

1. TITLES ARE SACRED
   - Use the candidate's EXACT job title. Period.
   - NO parenthetical additions like "(Product Owner)" or "(Technical Lead)" — this looks fake to recruiters and is the #1 red flag.
   - If their title was "Data Analyst", output "Data Analyst". Not "Data Analyst (Growth Analytics Lead)".
   - The DESCRIPTION is where you show relevance, not the title.

2. SHOW, DON'T TELL — CONCRETE OVER GENERIC
   Every bullet point MUST contain at least ONE of: a number, a technology name, a specific deliverable, or a measurable outcome.

   BAD (generic buzzwords):
   • Led cross-functional collaboration to drive product decisions
   • Spearheaded data-driven initiatives improving business outcomes

   GOOD (concrete and specific):
   • Built a React + Node.js dashboard used by 50+ sales reps, reducing report generation time from 2 hours to 5 minutes
   • Migrated legacy PHP system to TypeScript/Express microservices, cutting API response time by 60%

   If the candidate's profile doesn't include specific numbers, infer reasonable ones from context (e.g. team size, system scale) — but keep them realistic. Don't turn a 3-person startup into "led a team of 50".

3. THE SUMMARY IS YOUR ELEVATOR PITCH
   Write it as if the candidate has 10 seconds to convince a hiring manager. It must:
   - Open with years of experience + primary domain
   - Connect their strongest qualification directly to the TYPE of role (not the specific company)
   - End with a unique differentiator — what makes this candidate different from 100 others
   - Be 2-3 sentences MAX. No fluff words like "passionate" or "motivated".
   - NEVER mention the target company name in the summary — it looks desperate and auto-generated. A good CV summary works for any similar role, not just one company.
   - NEVER end with "perfectly positioned for X" or "ideal fit for Y" — let the reader draw that conclusion.

   BAD: "Passionate full-stack developer seeking new opportunities at ACME Corp."
   BAD: "...perfectly positioned for Google's engineering needs."
   GOOD: "Full-stack developer with 2+ years building production React/Node.js applications. Founded and shipped a live SaaS platform, with hands-on experience in modern JavaScript ecosystems from database design to CI/CD deployment."

4. KEYWORD STRATEGY
   - Read the job description and identify the 8-12 most important keywords (technologies, methodologies, domain terms)
   - Weave each keyword into a SPECIFIC description of something the candidate actually did
   - Don't keyword-stuff. Each keyword should appear 1-2 times naturally, not crammed into one bullet
   - Skills list should put the job's required skills FIRST (if the candidate has them)

5. SELECTIVE EXPERIENCE — QUALITY OVER QUANTITY
   This is the most important tactical decision you make:
   - Analyze ALL the candidate's experiences and SELECT only the ones that strengthen the application
   - For a Full Stack Developer role: lead with coding roles (SaaS founder, web dev), then dev-adjacent roles (IS Manager with coding), SKIP or condense non-tech roles (military service → one line like "Psychotechnical Commander | IDF | 2020-2022" with NO bullets, or omit entirely)
   - For a Data Analyst role: lead with data analysis experience, then dev roles showing SQL/analytics, condense the rest
   - NEVER include 5+ full experiences — it screams "I just dumped my entire CV without thinking"
   - The "included" field in the output tells the system which experiences you selected and which you omitted

6. HONESTY BOUNDARIES
   - Only list skills the candidate actually has
   - Don't invent projects or achievements
   - Don't upgrade seniority ("managed" → "directed", "helped" → "spearheaded")
   - If the candidate is junior, it's OK — emphasize learning speed, technical depth, and initiative instead

═══ OUTPUT FORMAT ═══

Return a JSON object:
{
  "summary": "2-3 sentence elevator pitch (see rule #3)",
  "skills": ["Skill1", "Skill2", ...] (10-12 — candidate's REAL skills, ordered by relevance to this job),
  "keywordInjections": ["keyword1", ...] (8-12 from job desc that match candidate's real skills),
  "experiences": [
    {
      "title": "Exact Real Job Title — NO parenthetical additions",
      "company": "Company Name",
      "duration": "2023-2025",
      "description": "2-4 bullets separated by \\n•. Every bullet must contain a concrete detail (number, tech name, deliverable). First bullet = most relevant to target job.",
      "relevance": "high" | "medium" | "condensed"
    }
  ],
  "omittedExperiences": ["Role title | Company | Reason for omission"],
  "education": [{"degree": "...", "field": "...", "school": "..."}],
  "projects": [{"name": "Real Project", "description": "Concrete description with technologies used and outcome"}],
  "tailoredHighlights": ["5 specific, concrete reasons this candidate fits THIS job"],
  "matchPercentage": 0-100
}

EXPERIENCE SELECTION RULES:
- "high" relevance = 3-4 bullets, prominent placement. Use for roles directly matching the target job.
- "medium" relevance = 2-3 bullets, included but secondary. Use for dev-adjacent or transferable roles.
- "condensed" = title + company + dates ONLY, zero bullets. Use for roles that show career progression but aren't relevant (e.g., military service for a dev role).
- Total experiences in output: 2-4 (selected) + 0-1 (condensed). That's it.
- List omitted experiences in "omittedExperiences" for transparency.

IMPORTANT FIELD NAMES: Use "experiences" (not "selectedExperiences"), "education" (not "selectedEducation"), "projects" (not "selectedProjects").

═══ QUALITY CHECKLIST (verify before returning) ═══
□ Would this CV fit on ONE PAGE when printed? (Max ~500 words of content, excluding headers)
□ Every job title is EXACTLY as it appears in the candidate's profile — zero modifications
□ Every bullet point has at least one concrete detail (number, tech, deliverable)
□ Summary does NOT mention the target company name
□ Summary does NOT end with "positioned for", "ideal for", or "perfect fit" phrasing
□ No buzzwords without substance ("leveraged", "spearheaded", "synergized")
□ At most 4 experiences included (2-3 with bullets + 0-1 condensed)
□ Skills list contains only technologies the candidate actually knows, max 12
□ Only 1-2 projects included (the most relevant ones)
□ Output is valid JSON`;

      const profileStr = profile
        ? `\nCandidate Profile:\n${JSON.stringify(profile, null, 2)}`
        : '';

      const userPrompt = `Generate a high-quality, ONE-PAGE tailored CV for this specific job application.

CANDIDATE: ${persona.name} (${persona.title})
${profileStr}

TARGET JOB:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location || 'Not specified'}
Description: ${job.description}
Requirements: ${job.requirements || 'Not specified'}

CRITICAL — READ BEFORE GENERATING:
1. ONE PAGE IS MANDATORY. Select only the 2-4 most relevant experiences. Condense or omit the rest. A 5-experience CV with 4 bullets each = too long. Be ruthless.
2. Job titles must be EXACTLY as they appear in the profile — no parenthetical additions, no modifications whatsoever.
3. Every single bullet point needs a concrete detail: a number, a technology, a specific deliverable, or a measurable outcome. "Led cross-functional teams" is NOT acceptable. "Led a 5-person team to ship a React dashboard in 3 months" IS.
4. The summary must NOT mention "${job.company}" or any company name — write it as a strong standalone professional summary that emphasizes the skills relevant to this TYPE of role. No "perfectly positioned for X" endings.
5. THINK about which experiences matter for a "${job.title}" role:
   - Coding/dev roles → high relevance, 3-4 bullets
   - Dev-adjacent roles (data, IT, management with tech) → medium, 2-3 bullets
   - Non-tech roles (military, sales) → condensed (title + dates only) or omit
6. Include at most 1-2 projects (the most relevant), not all of them.
7. Skills: max 12, ordered by this job's requirements. Drop skills that don't strengthen this application.`;

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

      const systemPrompt = `You are a career coach specializing in professional follow-up communication for Israeli tech professionals.

Generate a follow-up email that feels HUMAN and PERSONAL — not templated.

TYPE: ${typeGuidance[type]}

RULES:
1. Keep to 100-180 words — recruiters skim, short emails get read
2. Subject line must be specific: include job title + your name
3. Opening: reference something SPECIFIC from the application or interview (never "I'm following up on...")
4. Middle: add ONE piece of value — a relevant article, a project update, a new skill you learned
5. Close: clear but not desperate. "Would love to discuss further" > "I hope to hear from you"
6. Never apologize for following up
7. Never use "just checking in" or "touching base"
8. If this is a second/final follow-up, acknowledge the timeline without passive aggression
9. If thank_you: mention a SPECIFIC topic discussed in the interview
10. Output the email with Subject: line first, then body

BAD EXAMPLE: "Dear Hiring Manager, I am writing to follow up on my application for the Software Developer position. I remain very interested in the role and believe I would be a great fit."
GOOD EXAMPLE: "Subject: Bar Ben Haim — Junior Developer Application\n\nHi [Name],\n\nSince applying last week, I built a small tool that does [X] — it reminded me of the challenge your team mentioned in the job posting about [Y]. Happy to share the repo if useful.\n\nLooking forward to connecting."`;


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

      const systemPrompt = `You are a senior tech interview coach who has prepared hundreds of candidates for Israeli hi-tech companies.

Generate a PRACTICAL, ACTIONABLE interview preparation package. Everything should be specific to THIS role at THIS company — no generic advice.

Return a JSON object:
{
  "companyResearch": {
    "overview": "2-3 sentences about what the company actually DOES and their main product",
    "industry": "Specific sector (e.g., 'Cloud Security SaaS' not just 'Technology')",
    "culture": "Specific culture signals from the job posting (remote/hybrid, team size, methodologies mentioned)",
    "techStack": ["Technologies they likely use based on the job description"],
    "interviewStyle": "What to expect based on company size and culture (startup = casual + take-home, enterprise = structured + whiteboard)"
  },
  "roleAnalysis": {
    "keyResponsibilities": ["What you'll actually DO day-to-day — be specific"],
    "successMetrics": ["How they'll measure your performance in the first 90 days"],
    "redFlags": ["Things to watch out for in this role/company"]
  },
  "questionBank": [
    {
      "question": "Exact question they might ask",
      "type": "behavioral|technical|system_design|cultural",
      "sampleAnswer": "A concrete answer framework using the candidate's actual experience",
      "keyPoints": ["Specific things to mention from your background"]
    }
  ],
  "technicalPrep": [
    {
      "topic": "Specific technical topic",
      "depth": "What level of knowledge to expect",
      "practiceResources": "What to practice or review"
    }
  ],
  "questionsForInterviewer": ["Smart questions that show you've researched the company — NOT generic questions like 'what does a typical day look like'"],
  "negotiationTips": ["Salary range expectations for this role in Israel", "What benefits to negotiate"]
}

IMPORTANT: Generate at least 8-10 questions in the questionBank, covering behavioral, technical, and cultural types.
For each question, the sampleAnswer should reference the CANDIDATE'S actual experience from their profile.`;

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

      const systemPrompt = `You are a senior career advisor writing personalized cover letters for Israeli hi-tech professionals.

RULES:
1. NEVER use generic openers like "I am writing to express my interest" or "I was excited to see your posting"
2. Open with a SPECIFIC hook: a relevant achievement, a connection to the company's product, or a shared mission
3. Paragraph 2: Connect 2-3 CONCRETE achievements from the candidate's experience to the role's key requirements. Use numbers and specifics.
4. Paragraph 3: Show you understand the company's challenges and explain how you'd contribute from day one
5. Close with a confident call-to-action (not "I hope to hear from you")
6. Keep to 250-350 words total
7. Never mention the company name more than twice
8. Write in English unless the job posting is in Hebrew
9. Tone: confident and professional, NOT desperate or over-eager

EXAMPLES OF BAD OPENINGS (NEVER USE):
- "I am writing to apply for..."
- "I was excited to discover..."
- "With my background in..."

EXAMPLES OF GOOD OPENINGS:
- "When I built [specific project], I solved [specific problem] — the same challenge your team faces with [company product]."
- "Three years of shipping [specific feature] taught me that [insight] — which is exactly why [role] caught my attention."`;

      const profileStr = profile
        ? `\nCandidate Profile:\n${JSON.stringify(profile, null, 2)}`
        : '';

      const userPrompt = `Write a cover letter for:
Candidate: ${persona.name} — ${persona.title}
${profileStr}

Applying for: ${job.title} at ${job.company}
Location: ${job.location || 'Israel'}
Job Description: ${(job.description || '').substring(0, 1500)}
Requirements: ${(job.requirements || '').substring(0, 800)}

IMPORTANT: Reference SPECIFIC skills and achievements from the candidate's profile. Do NOT write generic statements.`;

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
  /**
   * Generate focused question bank for interview prep
   */
  async generateQuestionBank(context: {
    jobTitle: string;
    company: string;
    description?: string | null;
    requirements?: string | null;
    personaBackground?: any;
    topicFocus?: string;
  }): Promise<any[]> {
    try {
      logger.info(`Generating question bank for ${context.company}`);

      if (!this.isInitialized) {
        throw new AIError('AI service not initialized');
      }

      const systemPrompt = `You are a senior tech interview coach in Israel.
Generate a focused interview question bank. Return a JSON array of questions:
[
  {
    "question": "The exact question",
    "type": "behavioral|technical|system_design|cultural|situational",
    "difficulty": "easy|medium|hard",
    "sampleAnswer": "A strong answer structure using STAR framework for behavioral, or step-by-step for technical",
    "keyPoints": ["Key point to mention 1", "Key point 2"],
    "followUps": ["Likely follow-up question 1"]
  }
]

Generate 10-15 questions. Mix types: 40% technical, 30% behavioral, 20% situational, 10% cultural.
${context.topicFocus ? `Focus especially on: ${context.topicFocus}` : ''}
Make answers SPECIFIC to the candidate's background when profile is provided.`;

      const userPrompt = `Generate interview questions for:
Position: ${context.jobTitle} at ${context.company}
Description: ${(context.description || '').substring(0, 1000)}
Requirements: ${(context.requirements || '').substring(0, 800)}
${context.personaBackground ? `Candidate Background:\n${JSON.stringify(context.personaBackground, null, 2)}` : ''}`;

      const response = await this.callAPI(systemPrompt, userPrompt);
      return this.parseJSON<any[]>(response);
    } catch (error) {
      logger.error('Error generating question bank:', error);
      throw new AIError('Failed to generate question bank');
    }
  }

  /**
   * Generate company research for interview preparation
   */
  async generateCompanyResearch(context: {
    company: string;
    jobTitle: string;
    jobDescription?: string | null;
  }): Promise<any> {
    try {
      logger.info(`Generating company research for ${context.company}`);

      if (!this.isInitialized) {
        throw new AIError('AI service not initialized');
      }

      const systemPrompt = `You are a research analyst specializing in Israeli tech companies.
Generate practical company research for interview preparation. Return JSON:
{
  "overview": "What the company does, main products, and market position (3-4 sentences)",
  "founded": "Year founded and founders if known",
  "size": "Estimated company size (employees)",
  "funding": "Known funding rounds or public status",
  "techStack": ["Known or likely technologies used"],
  "culture": "Work culture, values, and what employees say",
  "competitors": ["Main competitors in their space"],
  "recentDevelopments": ["Recent news, product launches, or milestones"],
  "interviewProcess": "What to expect in their interview process based on company size and culture",
  "talkingPoints": ["Smart things to mention in the interview that show you researched the company"]
}

Be honest about what you know vs don't know. Don't fabricate specific details.`;

      const userPrompt = `Research for interview at:
Company: ${context.company}
Role: ${context.jobTitle}
${context.jobDescription ? `Job Context: ${context.jobDescription.substring(0, 800)}` : ''}`;

      const response = await this.callAPI(systemPrompt, userPrompt);
      return this.parseJSON<any>(response);
    } catch (error) {
      logger.error('Error generating company research:', error);
      throw new AIError('Failed to generate company research');
    }
  }

  /**
   * Generate salary research for a role
   */
  async generateSalaryResearch(context: {
    jobTitle: string;
    company: string;
    location?: string | null;
    salary?: { min?: number; max?: number; currency?: string } | null;
  }): Promise<any> {
    try {
      logger.info(`Generating salary research for ${context.jobTitle} at ${context.company}`);

      if (!this.isInitialized) {
        throw new AIError('AI service not initialized');
      }

      const systemPrompt = `You are a compensation analyst specializing in the Israeli tech market.
Provide salary research and negotiation guidance. Return JSON:
{
  "estimatedRange": {
    "min": 0,
    "max": 0,
    "currency": "ILS",
    "period": "monthly"
  },
  "marketContext": "How this role's compensation compares to market average in Israel",
  "factors": ["Factors that affect salary for this specific role"],
  "negotiationTips": [
    "Specific negotiation advice for this company/role type"
  ],
  "benefits": ["Common benefits to expect/negotiate for this type of company in Israel"],
  "redFlags": ["Salary-related red flags to watch for"],
  "sources": "Note: These are estimates based on general Israeli tech market data"
}

IMPORTANT: All salary estimates should be in Israeli Shekels (ILS) per month (gross).
Be transparent that these are estimates. Israeli tech salaries vary significantly by company stage and location.`;

      const userPrompt = `Salary research for:
Role: ${context.jobTitle}
Company: ${context.company}
Location: ${context.location || 'Israel'}
${context.salary ? `Listed salary: ${context.salary.min}-${context.salary.max} ${context.salary.currency}` : 'No salary listed'}`;

      const response = await this.callAPI(systemPrompt, userPrompt);
      return this.parseJSON<any>(response);
    } catch (error) {
      logger.error('Error generating salary research:', error);
      throw new AIError('Failed to generate salary research');
    }
  }
}

export const aiClient = new AIClient();
