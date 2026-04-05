/**
 * AI Engine Exports
 * Central hub for all AI-powered services
 */

// Scoring engine
export {
  scoreJobForPersona,
  batchScoreJobs,
  recalibrateWeights,
  getTopJobs,
  type ScoringRules,
  type JobScore,
  type ScoringFeedback,
} from './scoring';

// CV Generator engine
export {
  generateCVContent,
  extractKeywords,
  tailorSummary,
  selectExperiences,
  generateCoverLetter,
  analyzeATSCompatibility,
  optimizeCVForJob,
  getSkillRecommendations,
  type CVContent,
  type CVOptimization,
} from './cv-generator';

// Profile Analyzer engine
export {
  extractProfile,
  normalizeProfile,
  enrichProfile,
  identifyGaps,
  parseUploadedCV,
  processRawProfile,
  getSkillImprovementPlan,
  validateProfileCompleteness,
  type EnrichedProfile,
  type ProfileGaps,
} from './profile-analyzer';

// Message Generator engine
export {
  generateFollowUp,
  generateThankYou,
  generateInterviewPrep,
  generateQuestionBank,
  generateSalaryNegotiation,
  generateRejectionResponse,
  generateOfferNegotiation,
  generateCompanyResearch,
  generateMessage,
  generateFollowUpVariations,
  type ApplicationContext,
  type InterviewContext,
  type InterviewPrepPackage,
  type FollowUpType,
} from './message-generator';
