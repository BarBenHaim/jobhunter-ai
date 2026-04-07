import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Server as SocketIOServer } from 'socket.io';
import http from 'http';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import logger from './utils/logger';
import prisma from './db/prisma';
import { errorHandler, asyncHandler } from './middleware/errorHandler';
import { authMiddleware, AuthRequest, generateToken } from './middleware/auth';
import { startCronJobs, stopCronJobs } from './cron';
import config from './config';
import { initializeQueueProcessors, closeQueues } from './queue';

import profileRoutes from './routes/profile.routes';
import personasRoutes from './routes/personas.routes';
import jobsRoutes from './routes/jobs.routes';
import scoringRoutes from './routes/scoring.routes';
import cvRoutes from './routes/cv.routes';
import applicationsRoutes from './routes/applications.routes';
import analyticsRoutes from './routes/analytics.routes';
import interviewPrepRoutes from './routes/interview-prep.routes';
import followUpsRoutes from './routes/follow-ups.routes';
import settingsRoutes from './routes/settings.routes';
import scrapeRoutes from './routes/scrape.routes';

dotenv.config();

const app: Express = express();
const server = http.createServer(app);

// Support multiple CORS origins (comma-separated in env var)
const allowedOrigins = config.cors.origin.split(',').map((o: string) => o.trim());
const corsOriginHandler = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
  // Allow requests with no origin (mobile apps, curl, etc.)
  if (!origin) return callback(null, true);
  // Check if origin matches any allowed origin or pattern
  const isAllowed = allowedOrigins.some((allowed: string) => {
    if (allowed === '*') return true;
    if (origin === allowed) return true;
    // Support wildcard subdomains like *.vercel.app
    if (allowed.startsWith('*.')) {
      const domain = allowed.slice(2);
      return origin.endsWith(domain);
    }
    return false;
  });
  if (isAllowed) {
    callback(null, true);
  } else {
    callback(null, true); // Allow all for now during development
  }
};

const io = new SocketIOServer(server, {
  cors: {
    origin: corsOriginHandler,
    credentials: true,
  },
});

const PORT = config.app.port;
const NODE_ENV = config.app.nodeEnv;

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
});

app.use(helmet());
app.use(cors({
  origin: corsOriginHandler,
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(limiter);

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    uptime: process.uptime(),
  });
});

// Bar Ben Haim's real CV data
const BAR_CV_STRUCTURED_PROFILE = {
  personalInfo: {
    fullName: 'Bar Ben Haim',
    title: 'Full Stack Developer & Information Systems Engineer',
    email: 'barbenbh@gmail.com',
    phone: '052-661-8184',
    location: 'Israel',
    linkedin: 'https://linkedin.com/in/barbenhaim',
    github: 'https://github.com/barbenhaim',
  },
  summary: 'Full-Stack Developer and Information Systems Engineer currently leading the development of a live SaaS platform. Experienced across the full product lifecycle, from database architecture to AI integrations, with a track record of delivering measurable business impact across startups and enterprise environments.',
  education: [
    {
      institution: 'Ono Academic College',
      degree: 'BSc Computer Science',
      period: '2025–2028',
      status: 'In Progress',
    },
    {
      institution: 'Coding Academy',
      degree: 'Full Stack Bootcamp (640 Hours)',
      period: 'Completed',
      status: 'Graduated with Excellence',
    },
  ],
  experience: [
    {
      title: 'Full Stack Developer & Founder',
      company: 'Wedding Tales',
      period: '2025–Present',
      highlights: [
        'Designed and launched a live SaaS platform using Next.js 14, React, and Firebase, serving real clients in the event industry from day one.',
        'Architected a real-time Firestore database for concurrent multi-user uploads; automated deployments via Vercel CI/CD with sub-10-minute release cycles.',
        'Integrated AI models to power intelligent features within the platform, applying hands-on experience with AI APIs and prompt-driven workflows.',
      ],
    },
    {
      title: 'Information Systems Manager & Developer',
      company: 'Nisha Group',
      period: '2024–2025',
      highlights: [
        'Managed all company technology systems and software, owning vendor relationships and a yearly budget exceeding 1,000,000 NIS.',
        'Served as Technical PM, shipping features that drove a 20% increase in user engagement; integrated CRM and SAP ERP via bi-directional API pipelines.',
        'Built PHP/JS internal tools automating core organizational workflows and reducing manual processing time significantly.',
        'Supported 100+ users through training sessions and technical consulting.',
      ],
    },
    {
      title: 'Data Analyst',
      company: 'Nisha Group',
      period: '2023–2024',
      highlights: [
        'Wrote and optimized complex SQL queries on a 500,000+ record MySQL database.',
        'Built and maintained BI dashboards using Qlik BI Suite (QlikSense, QlikView, NPrinting).',
        'Led QA processes for a successful new website launch.',
      ],
    },
    {
      title: 'Freelance Web Developer',
      company: 'O&B Websites',
      period: '2023–2025',
      highlights: [
        'Delivered custom React and WordPress apps for business clients, handling API integrations and performance from brief to launch.',
      ],
    },
  ],
  projects: [
    {
      name: 'Monday.com Clone with AI Engine',
      description: 'Built a full-featured project management app using React, Node.js, and MongoDB, with an integrated AI engine that generates board data and automates task creation.',
    },
    {
      name: 'JobHunter AI',
      description: 'AI-powered job search and application platform with real-time scraping, intelligent scoring, and automated CV generation.',
    },
  ],
  military: {
    role: 'Psychotechnical Commander & Diagnostician',
    unit: 'IDF',
    period: '2020–2022',
    description: 'Commanded a 60-soldier unit; previously conducted psychotechnical assessments for elite unit selection including 8200 and 81.',
  },
  skills: {
    languages: ['TypeScript', 'JavaScript', 'Python', 'HTML', 'CSS', 'SCSS'],
    frontend: ['React', 'Next.js 14', 'Tailwind CSS', 'Redux'],
    backend: ['Node.js', 'PHP', 'REST APIs', 'Express'],
    databases: ['MySQL', 'Firestore', 'MongoDB', 'PostgreSQL', 'Firebase'],
    bi: ['Qlik BI Suite', 'QlikSense', 'QlikView', 'NPrinting'],
    tools: ['Git', 'Vercel', 'CI/CD', 'Docker'],
    ai: ['AI API Integration', 'Prompt Engineering', 'Anthropic Claude'],
  },
  spokenLanguages: ['Hebrew (Native)', 'English (Fluent)'],
  processedAt: new Date().toISOString(),
  version: 1,
};

const BAR_CV_RAW_KNOWLEDGE = {
  lastSubmitted: new Date().toISOString(),
  content: `BAR BEN HAIM - Full Stack Developer & Information Systems Engineer · BSc Computer Science
052-661-8184 · barbenbh@gmail.com · linkedin.com/in/barbenhaim · github.com/barbenhaim

Full-Stack Developer and Information Systems Engineer currently leading the development of a live SaaS platform. Experienced across the full product lifecycle, from database architecture to AI integrations, with a track record of delivering measurable business impact across startups and enterprise environments.

Work Experience:
- Full Stack Developer & Founder | Wedding Tales (2025–Present): Designed and launched a live SaaS platform using Next.js 14, React, and Firebase. Architected real-time Firestore database. Integrated AI models.
- Information Systems Manager & Developer | Nisha Group (2024–2025): Managed all technology systems, 1M+ NIS budget. Technical PM, 20% user engagement increase. CRM and SAP ERP integration.
- Data Analyst | Nisha Group (2023–2024): SQL optimization on 500K+ records. Qlik BI dashboards. QA for website launch.
- Freelance Web Developer | O&B Websites (2023–2025): Custom React and WordPress apps.

Education: BSc Computer Science at Ono Academic College (2025–2028). Full Stack Bootcamp (640h) at Coding Academy - Graduated with Excellence.

Military: Psychotechnical Commander & Diagnostician | IDF (2020–2022). Commanded 60-soldier unit. Elite unit selection assessments (8200, 81).

Skills: TypeScript, JavaScript, Python, React, Next.js, Node.js, PHP, MySQL, MongoDB, Firestore, Firebase, Qlik BI Suite, Git, Vercel, AI integrations.`,
  contentLength: 1200,
};

// Demo login — finds or creates the user, ensures passwordHash is set
app.post('/api/auth/demo-login', authLimiter, asyncHandler(async (req: Request, res: Response) => {
  const email = 'barbenbh@gmail.com';
  let profile = await prisma.userProfile.findUnique({ where: { email } });

  if (!profile) {
    // Create new user with password hash
    const passwordHash = await bcrypt.hash('123456', 12);
    profile = await prisma.userProfile.create({
      data: {
        fullName: 'Bar Ben Haim',
        email,
        passwordHash,
        phone: '052-661-8184',
        location: 'Israel',
        linkedinUrl: 'https://linkedin.com/in/barbenhaim',
        githubUrl: 'https://github.com/barbenhaim',
        structuredProfile: BAR_CV_STRUCTURED_PROFILE,
        rawKnowledge: BAR_CV_RAW_KNOWLEDGE,
        preferences: {
          jobTypes: ['Full Stack Developer', 'Frontend Developer', 'Backend Developer', 'Software Engineer'],
          locations: ['Israel', 'Tel Aviv', 'Remote'],
          experience: 'mid',
          sources: ['DRUSHIM', 'ALLJOBS'],
        },
      },
    });
    logger.info('Created Bar Ben Haim profile with password hash', { id: profile.id });
  } else {
    // Update existing profile if missing passwordHash or CV data
    const needsUpdate = !profile.passwordHash || !profile.structuredProfile || Object.keys(profile.structuredProfile as any).length === 0;
    if (needsUpdate) {
      const passwordHash = profile.passwordHash || await bcrypt.hash('123456', 12);
      profile = await prisma.userProfile.update({
        where: { id: profile.id },
        data: {
          fullName: 'Bar Ben Haim',
          passwordHash,
          phone: '052-661-8184',
          location: 'Israel',
          linkedinUrl: 'https://linkedin.com/in/barbenhaim',
          githubUrl: 'https://github.com/barbenhaim',
          structuredProfile: BAR_CV_STRUCTURED_PROFILE,
          rawKnowledge: BAR_CV_RAW_KNOWLEDGE,
          preferences: {
            jobTypes: ['Full Stack Developer', 'Frontend Developer', 'Backend Developer', 'Software Engineer'],
            locations: ['Israel', 'Tel Aviv', 'Remote'],
            experience: 'mid',
            sources: ['DRUSHIM', 'ALLJOBS'],
          },
        },
      });
      logger.info('Updated profile with Bar Ben Haim CV data and password', { id: profile.id });
    }
  }

  const token = generateToken(profile.id);
  logger.info('Demo login', { userId: profile.id });
  res.json({ success: true, token, user: profile });
}));

// Force-seed CV data into existing profile (one-time migration helper)
app.post('/api/auth/seed-cv', asyncHandler(async (req: Request, res: Response) => {
  const profile = await prisma.userProfile.findFirst();
  if (!profile) {
    res.status(404).json({ success: false, error: 'No profile found' });
    return;
  }
  const updated = await prisma.userProfile.update({
    where: { id: profile.id },
    data: {
      fullName: 'Bar Ben Haim',
      email: 'barbenbh@gmail.com',
      phone: '052-661-8184',
      location: 'Israel',
      linkedinUrl: 'https://linkedin.com/in/barbenhaim',
      githubUrl: 'https://github.com/barbenhaim',
      structuredProfile: BAR_CV_STRUCTURED_PROFILE,
      rawKnowledge: BAR_CV_RAW_KNOWLEDGE,
      preferences: {
        jobTypes: ['Full Stack Developer', 'Frontend Developer', 'Backend Developer', 'Software Engineer'],
        locations: ['Israel', 'Tel Aviv', 'Remote'],
        experience: 'mid',
        sources: ['DRUSHIM', 'ALLJOBS'],
      },
    },
  });
  logger.info('Seeded CV data into profile', { id: updated.id });
  res.json({ success: true, message: 'CV data seeded', user: updated });
}));

app.post('/api/auth/login', authLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ success: false, error: 'Email and password are required' });
    return;
  }

  const profile = await prisma.userProfile.findUnique({ where: { email } });
  if (!profile || !profile.passwordHash) {
    res.status(401).json({ success: false, error: 'Invalid email or password' });
    return;
  }

  const valid = await bcrypt.compare(password, profile.passwordHash);
  if (!valid) {
    res.status(401).json({ success: false, error: 'Invalid email or password' });
    return;
  }

  const token = generateToken(profile.id);
  res.json({ success: true, token, user: profile });
}));

app.post('/api/auth/register', authLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { email, password, fullName } = req.body;

  if (!email || !password || !fullName) {
    res.status(400).json({ success: false, error: 'Email, password, and full name are required' });
    return;
  }

  const existing = await prisma.userProfile.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ success: false, error: 'Email already registered' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const profile = await prisma.userProfile.create({
    data: {
      email,
      fullName,
      passwordHash,
      structuredProfile: {},
      rawKnowledge: {},
      preferences: {},
    },
  });

  const token = generateToken(profile.id);
  logger.info('User registered', { userId: profile.id, email });
  res.status(201).json({ success: true, token, user: profile });
}));

app.use('/api/profile', profileRoutes);
app.use('/api/personas', personasRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/scoring', scoringRoutes);
app.use('/api/cv', cvRoutes);
app.use('/api/applications', applicationsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/interview-prep', interviewPrepRoutes);
app.use('/api/follow-ups', followUpsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/scrape', scrapeRoutes);

app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.path,
    method: req.method,
  });
});

app.use(errorHandler);

io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);

  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });

  socket.on('error', (error) => {
    logger.error(`Socket error: ${socket.id}`, error);
  });
});

const gracefulShutdown = async () => {
  logger.info('Starting graceful shutdown...');

  stopCronJobs();

  try {
    await closeQueues();
    logger.info('All queues closed');
  } catch (error) {
    logger.error('Error closing queues:', error);
  }

  server.close(() => {
    logger.info('HTTP server closed');
  });

  try {
    await prisma.$disconnect();
    logger.info('Prisma disconnected successfully');
  } catch (error) {
    logger.error('Error disconnecting from Prisma:', error);
  }

  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Initialize demo user on startup
const initializeDemoUser = async () => {
  try {
    const email = 'barbenbh@gmail.com';
    let user = await prisma.userProfile.findUnique({ where: { email } });

    if (!user) {
      const passwordHash = await bcrypt.hash('123456', 12);
      user = await prisma.userProfile.create({
        data: {
          fullName: 'Bar Ben Haim',
          email,
          passwordHash,
          phone: '052-661-8184',
          location: 'Israel',
          linkedinUrl: 'https://linkedin.com/in/barbenhaim',
          githubUrl: 'https://github.com/barbenhaim',
          structuredProfile: BAR_CV_STRUCTURED_PROFILE,
          rawKnowledge: BAR_CV_RAW_KNOWLEDGE,
          preferences: {
            jobTypes: ['Full Stack Developer', 'Frontend Developer', 'Backend Developer', 'Software Engineer'],
            locations: ['Israel', 'Tel Aviv', 'Remote'],
            experience: 'mid',
            sources: ['DRUSHIM', 'ALLJOBS'],
          },
        },
      });
      logger.info('Created demo user on startup', { id: user.id });
    } else if (!user.passwordHash) {
      const passwordHash = await bcrypt.hash('123456', 12);
      user = await prisma.userProfile.update({
        where: { id: user.id },
        data: { passwordHash },
      });
      logger.info('Updated demo user with password hash', { id: user.id });
    }
  } catch (error) {
    logger.error('Failed to initialize demo user:', error);
  }
};

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

server.listen(PORT, async () => {
  logger.info(`Server running on port ${PORT} in ${NODE_ENV} mode`);
  logger.info(`Health check: http://localhost:${PORT}/health`);

  // Initialize demo user
  await initializeDemoUser();

  try {
    initializeQueueProcessors();
    logger.info('Queue processors initialized');
  } catch (error) {
    logger.error('Failed to initialize queue processors:', error);
  }

  startCronJobs();
});

export { app, server, io };
