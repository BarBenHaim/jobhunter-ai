import crypto from 'crypto';

export const generateJobDedupHash = (jobData: {
  title: string;
  company: string;
  location: string;
  source: string;
}): string => {
  const normalized = `${jobData.title.toLowerCase().trim()}|${jobData.company.toLowerCase().trim()}|${jobData.location.toLowerCase().trim()}|${jobData.source.toLowerCase().trim()}`;
  return crypto.createHash('sha256').update(normalized).digest('hex');
};

export const generateApplicationDedupKey = (jobId: string, personaId: string): string => {
  return `${jobId}|${personaId}`;
};

export const normalizeJobData = (jobData: {
  title: string;
  company: string;
  location: string;
  description: string;
}): {
  title: string;
  company: string;
  location: string;
  description: string;
} => {
  return {
    title: jobData.title.trim(),
    company: jobData.company.trim(),
    location: jobData.location.trim(),
    description: jobData.description.trim(),
  };
};

export const calculateJobSimilarity = (
  job1: { title: string; company: string; location: string },
  job2: { title: string; company: string; location: string }
): number => {
  let similarity = 0;
  const maxSimilarity = 3;

  if (job1.title.toLowerCase() === job2.title.toLowerCase()) {
    similarity += 1;
  }

  if (job1.company.toLowerCase() === job2.company.toLowerCase()) {
    similarity += 1;
  }

  if (job1.location.toLowerCase() === job2.location.toLowerCase()) {
    similarity += 1;
  }

  return similarity / maxSimilarity;
};
