import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Server as SocketIOServer } from 'socket.io';
import http from 'http';
import dotenv from 'dotenv';
import logger from './utils/logger';
import prisma from './db/prisma';
import { errorHandler, asyncHandler } from './middleware/errorHandler';
import { authMiddleware, AuthRequest } from './middleware/auth';
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

app.post('/api/auth/login', authLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  res.status(200).json({
    message: 'Auth endpoint ready',
    email,
  });
}));

app.post('/api/auth/register', authLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { email, password, fullName } = req.body;

  if (!email || !password || !fullName) {
    res.status(400).json({ error: 'Email, password, and full name are required' });
    return;
  }

  res.status(201).json({
    message: 'Registration endpoint ready',
    email,
  });
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

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} in ${NODE_ENV} mode`);
  logger.info(`Health check: http://localhost:${PORT}/health`);

  try {
    initializeQueueProcessors();
    logger.info('Queue processors initialized');
  } catch (error) {
    logger.error('Failed to initialize queue processors:', error);
  }

  startCronJobs();
});

export { app, server, io };
