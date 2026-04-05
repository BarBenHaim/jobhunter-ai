import prisma from '../db/prisma';
import logger from '../utils/logger';

async function seed() {
  logger.info('Starting database seed...');

  try {
    const existingUsers = await prisma.userProfile.count();

    if (existingUsers > 0) {
      logger.info(`Database already has ${existingUsers} users. Skipping seed.`);
      return;
    }

    logger.info('Creating demo user profile...');
    const demoUser = await prisma.userProfile.create({
      data: {
        fullName: 'Demo User',
        email: 'demo@jobhunter.ai',
        phone: '+1234567890',
        location: 'San Francisco, CA',
        linkedinUrl: 'https://linkedin.com/in/demouser',
        githubUrl: 'https://github.com/demouser',
        portfolioUrl: 'https://portfolio.example.com',
        rawKnowledge: {
          skills: ['TypeScript', 'React', 'Node.js', 'PostgreSQL'],
          experience: 5,
        },
        structuredProfile: {
          yearsOfExperience: 5,
          currentTitle: 'Full Stack Developer',
          keySkills: ['TypeScript', 'React', 'Node.js'],
        },
        preferences: {
          salaryMin: 120000,
          salaryMax: 180000,
          locations: ['San Francisco', 'Remote'],
          jobTypes: ['Full-time', 'Contract'],
        },
      },
    });

    logger.info(`Created demo user: ${demoUser.id}`);

    logger.info('Creating demo personas...');
    const persona1 = await prisma.persona.create({
      data: {
        userId: demoUser.id,
        name: 'Senior Frontend Developer',
        slug: 'senior-frontend-developer',
        title: 'Senior Frontend Developer',
        summary: 'Looking for senior frontend roles focusing on React and TypeScript',
        targetKeywords: ['React', 'TypeScript', 'Frontend', 'Senior', 'Vue.js'],
        excludeKeywords: ['Junior', 'Internship', 'PHP'],
        skillPriority: {
          React: 10,
          TypeScript: 9,
          JavaScript: 8,
          CSS: 7,
          Testing: 6,
        },
        experienceRules: {
          minYears: 4,
          preferredYears: 6,
        },
        isActive: true,
        searchSchedule: {
          frequency: 'daily',
          time: '09:00',
        },
      },
    });

    logger.info(`Created persona: ${persona1.id}`);

    const persona2 = await prisma.persona.create({
      data: {
        userId: demoUser.id,
        name: 'Full Stack Developer',
        slug: 'full-stack-developer',
        title: 'Full Stack Developer',
        summary: 'Full stack roles with Node.js backend and React frontend',
        targetKeywords: ['Full Stack', 'Node.js', 'React', 'MongoDB', 'AWS'],
        excludeKeywords: ['DevOps', 'Java', 'C++'],
        skillPriority: {
          'Node.js': 10,
          React: 9,
          TypeScript: 8,
          MongoDB: 7,
          AWS: 6,
        },
        experienceRules: {
          minYears: 3,
          preferredYears: 5,
        },
        isActive: true,
        searchSchedule: {
          frequency: 'weekly',
          time: '09:00',
        },
      },
    });

    logger.info(`Created persona: ${persona2.id}`);

    logger.info('Creating demo jobs...');
    const job1 = await prisma.job.create({
      data: {
        externalId: 'job-001',
        source: 'LINKEDIN',
        sourceUrl: 'https://linkedin.com/jobs/view/001',
        title: 'Senior React Developer',
        company: 'Tech Corp',
        companyUrl: 'https://techcorp.com',
        location: 'San Francisco, CA',
        locationType: 'HYBRID',
        description:
          'We are looking for a Senior React Developer with 5+ years of experience. You will work on our core product.',
        requirements:
          '5+ years React experience, TypeScript, Testing, REST APIs',
        salary: {
          min: 150000,
          max: 200000,
          currency: 'USD',
        },
        experienceLevel: 'senior',
        postedAt: new Date(),
        dedupHash: 'hash001',
        isActive: true,
        rawData: {
          jobId: '001',
          description: 'Full job description...',
        },
      },
    });

    logger.info(`Created job: ${job1.id}`);

    const job2 = await prisma.job.create({
      data: {
        externalId: 'job-002',
        source: 'INDEED',
        sourceUrl: 'https://indeed.com/viewjob?jk=002',
        title: 'Full Stack Node.js Developer',
        company: 'StartUp Inc',
        companyUrl: 'https://startupinc.com',
        location: 'Remote',
        locationType: 'REMOTE',
        description:
          'Join our team as a Full Stack Developer. Work with Node.js and React on modern web applications.',
        requirements:
          '3+ years full stack experience, Node.js, React, MongoDB',
        salary: {
          min: 120000,
          max: 160000,
          currency: 'USD',
        },
        experienceLevel: 'mid_level',
        postedAt: new Date(),
        dedupHash: 'hash002',
        isActive: true,
        rawData: {
          jobId: '002',
          description: 'Full job description...',
        },
      },
    });

    logger.info(`Created job: ${job2.id}`);

    logger.info('Creating demo job scores...');
    const score1 = await prisma.jobScore.create({
      data: {
        jobId: job1.id,
        personaId: persona1.id,
        overallScore: 0.92,
        skillMatch: 0.95,
        experienceMatch: 0.90,
        cultureFit: 0.88,
        salaryMatch: 0.92,
        acceptanceProb: 0.85,
        recommendation: 'AUTO_APPLY',
        reasoning: 'Excellent match for senior frontend role',
        matchedSkills: ['React', 'TypeScript', 'Testing'],
        missingSkills: ['Vue.js'],
        redFlags: [],
      },
    });

    logger.info(`Created job score: ${score1.id}`);

    logger.info('Seed completed successfully!');
  } catch (error) {
    logger.error('Seed error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seed().catch((error) => {
  logger.error('Fatal seed error:', error);
  process.exit(1);
});
