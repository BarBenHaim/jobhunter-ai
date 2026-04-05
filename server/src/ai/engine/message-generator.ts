import logger from '../../utils/logger';
import { AIError } from '../../utils/errors';
import { aiClient, PersonaData, ProfileData } from '../client';
import {
  FOLLOW_UP_PROMPT,
  INTERVIEW_PREP_PROMPT,
  MESSAGE_PROMPT,
} from '../prompts';

/**
 * Message Generation Engine
 * Generates professional messages for various job search contexts
 */

export type FollowUpType = 'initial' | 'second' | 'final' | 'thank_you' | 'negotiation';

export interface ApplicationContext {
  jobTitle: string;
  company: string;
  personaName: string;
  daysSinceApplication: number;
  contactPerson?: string;
  recruiterEmail?: string;
  applicationLink?: string;
  previousMessages?: string[];
}

export interface InterviewContext {
  company: string;
  jobTitle: string;
  persona: PersonaData;
  profile?: ProfileData;
  jobDescription?: string;
  interviewDate?: string;
  interviewerName?: string;
  interviewFormat?: 'phone' | 'video' | 'in-person';
}

export interface InterviewPrepPackage {
  companyResearch: {
    overview: string;
    industry: string;
    size?: string;
    recentNews: string[];
    culture: string;
  };
  roleAnalysis: {
    keyResponsibilities: string[];
    successMetrics: string[];
    commonChallenges: string[];
    growthOpportunities?: string[];
  };
  questionBank: Array<{
    question: string;
    type: 'behavioral' | 'technical' | 'cultural';
    framework: string;
    keyPoints: string[];
    example?: string;
  }>;
  technicalTopics: string[];
  questionsForInterviewer: string[];
  closingTips: string[];
  redFlagBehaviors?: string[];
  successPatterns?: string[];
}

/**
 * Generate context-aware follow-up message
 */
export async function generateFollowUp(
  application: ApplicationContext,
  type: FollowUpType
): Promise<string> {
  try {
    logger.info(`Generating ${type} follow-up for ${application.company}`);

    const message = await aiClient.generateFollowUp(application, type);

    if (!message || message.trim().length === 0) {
      throw new AIError('Generated empty follow-up message');
    }

    logger.info(`Follow-up message generated (${type})`, {
      length: message.length,
      company: application.company,
    });

    return message;
  } catch (error) {
    logger.error('Error generating follow-up:', error);
    throw error instanceof AIError
      ? error
      : new AIError('Failed to generate follow-up message');
  }
}

/**
 * Generate post-interview thank you message
 */
export async function generateThankYou(
  application: ApplicationContext,
  interviewNotes?: string
): Promise<string> {
  try {
    logger.info(`Generating thank you message for ${application.company}`);

    const systemPrompt = `You are an expert professional communicator.
Generate a warm, personalized thank you email following an interview.

Requirements:
- Send within 24 hours of interview
- Reference specific discussion points if provided
- Reiterate genuine interest and key talking points
- Professional but personable tone
- 150-200 words
- Include clear next steps or closing

Return ONLY the email body text (no subject line, no markdown).`;

    const userPrompt = `Generate a thank you email for:
Candidate: ${application.personaName}
Company: ${application.company}
Position: ${application.jobTitle}
Interviewer: ${application.contactPerson || 'Hiring Manager'}
Interview Notes: ${interviewNotes || 'General interview - good fit'}`;

    const message = await (aiClient as any).callAPI(systemPrompt, userPrompt);
    return message.trim();
  } catch (error) {
    logger.error('Error generating thank you message:', error);
    throw error instanceof AIError
      ? error
      : new AIError('Failed to generate thank you message');
  }
}

/**
 * Generate comprehensive interview preparation package
 */
export async function generateInterviewPrep(
  context: InterviewContext
): Promise<InterviewPrepPackage> {
  try {
    logger.info(`Generating interview prep for ${context.company}`);

    const prepContext = {
      jobTitle: context.jobTitle,
      company: context.company,
      personaName: context.persona.name,
      jobDescription: context.jobDescription,
      profile: context.profile,
    };

    const prepPackage = await aiClient.generateInterviewPrep(prepContext);

    // Validate package structure
    if (!prepPackage.companyResearch || !prepPackage.roleAnalysis) {
      throw new AIError('Invalid interview prep package structure');
    }

    logger.info('Interview prep generated successfully', {
      questions: prepPackage.questionBank?.length || 0,
      technicalTopics: prepPackage.technicalTopics?.length || 0,
      interviewerQuestions: prepPackage.questionsForInterviewer?.length || 0,
    });

    return prepPackage;
  } catch (error) {
    logger.error('Error generating interview prep:', error);
    throw error instanceof AIError
      ? error
      : new AIError('Failed to generate interview preparation');
  }
}

/**
 * Generate interview questions and STAR frameworks
 */
export async function generateQuestionBank(
  company: string,
  jobTitle: string,
  seniority: string = 'mid-level'
): Promise<
  Array<{
    question: string;
    type: 'behavioral' | 'technical' | 'cultural';
    framework: string;
    keyPoints: string[];
  }>
> {
  try {
    logger.info(`Generating question bank for ${jobTitle} at ${company}`);

    const systemPrompt = `You are an expert interview coach.
Generate 12-15 likely interview questions for this role with frameworks.

Return a JSON array:
[
  {
    "question": "Interview question",
    "type": "behavioral|technical|cultural",
    "framework": "How to approach (STAR method for behavioral)",
    "keyPoints": ["Point 1 to mention", "Point 2"]
  }
]

Guidelines:
- Mix behavioral (50%), technical (30%), cultural (20%)
- STAR: Situation, Task, Action, Result for behavioral
- Include common questions for this seniority level
- Behavioral should demonstrate: leadership, problem-solving, teamwork, learning
- Technical should cover: core technologies, system design, trade-offs
- Cultural should assess: company fit, values alignment, growth mindset`;

    const userPrompt = `Generate interview questions for:
Company: ${company}
Position: ${jobTitle}
Seniority Level: ${seniority}`;

    const response = await (aiClient as any).callAPI(systemPrompt, userPrompt);
    const questions = (aiClient as any).parseJSON(response);

    return questions;
  } catch (error) {
    logger.error('Error generating question bank:', error);
    return [];
  }
}

/**
 * Generate salary negotiation talking points
 */
export async function generateSalaryNegotiation(
  jobTitle: string,
  company: string,
  currentSalary?: number,
  experience?: string
): Promise<{
  marketRange: string;
  talkingPoints: string[];
  scriptPoints: string[];
  redFlags: string[];
}> {
  try {
    logger.info(
      `Generating salary negotiation guidance for ${jobTitle} at ${company}`
    );

    const systemPrompt = `You are an expert salary negotiation coach.
Generate data-driven negotiation guidance with realistic market ranges.

Return a JSON object:
{
  "marketRange": "$120k-$150k",
  "talkingPoints": ["Point 1", "Point 2"],
  "scriptPoints": ["Opening line", "Response if countered"],
  "redFlags": ["Warning 1"]
}

Guidelines:
- Provide realistic salary ranges for the role/company
- Include both base and total compensation
- Suggest 10-15% negotiations as reasonable starting point
- Provide specific scripts for common objections
- Include benefits, equity, and other compensation factors
- Red flags: company unwilling to negotiate, below-market offers`;

    const userPrompt = `Generate salary negotiation guidance:
Position: ${jobTitle}
Company: ${company}
Current Salary: ${currentSalary ? `$${currentSalary}` : 'Not provided'}
Experience: ${experience || 'Not specified'}`;

    const response = await (aiClient as any).callAPI(systemPrompt, userPrompt);
    const negotiation = (aiClient as any).parseJSON(response);

    return negotiation;
  } catch (error) {
    logger.error('Error generating salary negotiation:', error);
    return {
      marketRange: 'Market data unavailable',
      talkingPoints: [],
      scriptPoints: [],
      redFlags: [],
    };
  }
}

/**
 * Generate rejection response message
 */
export async function generateRejectionResponse(
  company: string,
  jobTitle: string,
  persona: PersonaData
): Promise<string> {
  try {
    logger.info(`Generating rejection response for ${jobTitle} at ${company}`);

    const systemPrompt = `You are an expert professional communicator.
Generate a gracious, professional response to a job rejection.

Requirements:
- Thank them for the opportunity and feedback
- Express continued interest in the company if appropriate
- Keep door open for future opportunities
- Professional but warm tone
- 100-150 words
- No negativity or bitterness

Return ONLY the email body text.`;

    const userPrompt = `Generate a rejection response email:
Candidate: ${persona.name}
Company: ${company}
Position: ${jobTitle}
Tone: Gracious and professional`;

    const message = await (aiClient as any).callAPI(systemPrompt, userPrompt);
    return message.trim();
  } catch (error) {
    logger.error('Error generating rejection response:', error);
    return 'Thank you for the opportunity and feedback. I remain interested in your company and would appreciate any suggestions for future roles that might be a better fit.';
  }
}

/**
 * Generate offer negotiation message
 */
export async function generateOfferNegotiation(
  company: string,
  jobTitle: string,
  currentOffer?: {
    baseSalary?: number;
    signingBonus?: number;
    equity?: string;
  },
  persona?: PersonaData
): Promise<string> {
  try {
    logger.info(`Generating offer negotiation message for ${jobTitle}`);

    const systemPrompt = `You are an expert offer negotiation coach.
Generate a professional, confident offer negotiation email.

Requirements:
- Express enthusiasm for the role
- Acknowledge and appreciate the offer
- State counter-proposal clearly with justification
- Professional but collaborative tone
- Leave room for further discussion
- 200-300 words

Return ONLY the email body text.`;

    const offerDetails = currentOffer
      ? `\nCurrent Offer:\n- Base Salary: $${currentOffer.baseSalary || 'Not specified'}\n- Signing Bonus: ${currentOffer.signingBonus || 'None'}\n- Equity: ${currentOffer.equity || 'None'}`
      : '';

    const userPrompt = `Generate offer negotiation email:
Candidate: ${persona?.name || 'Professional'}
Company: ${company}
Position: ${jobTitle}${offerDetails}`;

    const message = await (aiClient as any).callAPI(systemPrompt, userPrompt);
    return message.trim();
  } catch (error) {
    logger.error('Error generating offer negotiation:', error);
    throw error instanceof AIError
      ? error
      : new AIError('Failed to generate offer negotiation message');
  }
}

/**
 * Generate company research summary
 */
export async function generateCompanyResearch(
  company: string
): Promise<{
  overview: string;
  industry: string;
  size: string;
  recentNews: string[];
  cultureTips: string[];
  competitiveAdvantage: string[];
}> {
  try {
    logger.info(`Generating company research for ${company}`);

    const systemPrompt = `You are a corporate research analyst.
Generate research insights about a company for interview preparation.

Return a JSON object:
{
  "overview": "2-3 sentence company description",
  "industry": "Industry/sector",
  "size": "Approximate employee count",
  "recentNews": ["News item 1", "News item 2"],
  "cultureTips": ["Culture insight 1"],
  "competitiveAdvantage": ["Advantage 1"]
}

Focus on:
- What they do and their market position
- Recent product launches or updates
- Company culture characteristics
- Competitive advantages or market position
- Growth trajectory (if public/known)`;

    const userPrompt = `Research this company: ${company}`;

    const response = await (aiClient as any).callAPI(systemPrompt, userPrompt);
    const research = (aiClient as any).parseJSON(response);

    return research;
  } catch (error) {
    logger.error('Error generating company research:', error);
    return {
      overview: 'Company research unavailable',
      industry: 'Unknown',
      size: 'Unknown',
      recentNews: [],
      cultureTips: [],
      competitiveAdvantage: [],
    };
  }
}

/**
 * Generate professional message for various contexts
 */
export async function generateMessage(
  context: Record<string, any>,
  type: string
): Promise<string> {
  try {
    logger.info(`Generating ${type} message`);

    const message = await aiClient.generateMessage(context, type);

    if (!message || message.trim().length === 0) {
      throw new AIError(`Generated empty ${type} message`);
    }

    return message;
  } catch (error) {
    logger.error(`Error generating ${type} message:`, error);
    throw error instanceof AIError
      ? error
      : new AIError(`Failed to generate ${type} message`);
  }
}

/**
 * Generate multiple follow-up variations
 * Useful for A/B testing different approaches
 */
export async function generateFollowUpVariations(
  application: ApplicationContext,
  type: FollowUpType,
  variations: number = 3
): Promise<string[]> {
  try {
    logger.info(`Generating ${variations} ${type} follow-up variations`);

    const systemPrompt = `You are an expert professional communication strategist.
Generate ${variations} different variations of a follow-up message.
Each should have a slightly different tone/approach while maintaining professionalism.

Return a JSON array of strings (message bodies only, no markdown):
["Message 1", "Message 2", "Message 3"]

Requirements:
- Each variation should be distinct in approach
- Mix: Direct, Personal/Relationship-focused, Value-add/Research-focused
- All professional and non-pushy
- 150-250 words each`;

    const userPrompt = `Generate ${variations} ${type} follow-up variations for:
Candidate: ${application.personaName}
Company: ${application.company}
Position: ${application.jobTitle}
Days since application: ${application.daysSinceApplication}`;

    const response = await (aiClient as any).callAPI(systemPrompt, userPrompt);
    const messages = (aiClient as any).parseJSON<string[]>(response);

    return messages.slice(0, variations);
  } catch (error) {
    logger.error('Error generating follow-up variations:', error);
    return [];
  }
}
