import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Server as SocketIOServer, Socket } from 'socket.io';
import http from 'http';
import dotenv from 'dotenv';
import logger from './utils/logger';
import prisma from './db/prisma';
import { errorHandler } from './middleware/errorHandler';
import { verifyAccessToken } from './middleware/auth';
import { startCronJobs, stopCronJobs } from './cron';
import config from './config';
import { initializeQueueProcessors, closeQueues } from './queue';

import authRoutes from './routes/auth.routes';
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
import intelligenceRoutes from './routes/intelligence.routes';
import discoveryRoutes from './routes/discovery.routes';
import costsRoutes from './routes/costs.routes';
import dashboardRoutes from './routes/dashboard.routes';

dotenv.config();

const app: Express = express();
const server = http.createServer(app);

// ─────────────────────────────────────────────────────────────
// CORS — strict allowlist. Rejects unknown origins in production.
// ─────────────────────────────────────────────────────────────
const allowedOrigins = config.cors.origin.split(',').map((o: string) => o.trim()).filter(Boolean);
const NODE_ENV = config.app.nodeEnv;

const isOriginAllowed = (origin: string | undefined): boolean => {
  if (!origin) return true; // non-browser clients (curl, server-to-server)
  return allowedOrigins.some((allowed: string) => {
    if (allowed === '*') return true;
    if (origin === allowed) return true;
    if (allowed.startsWith('*.')) {
      const domain = allowed.slice(2);
      return origin.endsWith(domain);
    }
    return false;
  });
};

const corsOriginHandler = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
  if (isOriginAllowed(origin)) {
    return callback(null, true);
  }
  if (NODE_ENV === 'production' && config.cors.strict) {
    logger.warn(`[cors] blocked request from disallowed origin: ${origin}`);
    return callback(new Error('Not allowed by CORS'));
  }
  // Dev mode: warn but allow
  logger.warn(`[cors] allowing unknown origin in non-production: ${origin}`);
  return callback(null, true);
};

const io = new SocketIOServer(server, {
  cors: {
    origin: corsOriginHandler,
    credentials: true,
  },
});

const PORT = config.app.port;

// ─────────────────────────────────────────────────────────────
// Rate limiting — global cap for all API routes.
// ─────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(helmet());
app.use(cors({
  origin: corsOriginHandler,
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(limiter);

// Trust proxy one hop (Railway / reverse proxies) so rate limiter sees real IPs.
app.set('trust proxy', 1);

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    uptime: process.uptime(),
  });
});

// ─────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
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
app.use('/api/intelligence', intelligenceRoutes);
app.use('/api/discovery', discoveryRoutes);
app.use('/api/costs', costsRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.path,
    method: req.method,
  });
});

app.use(errorHandler);

// ─────────────────────────────────────────────────────────────
// Socket.IO — require JWT for every connection.
// ─────────────────────────────────────────────────────────────
interface AuthedSocket extends Socket {
  userId?: string;
}

io.use((socket: AuthedSocket, next) => {
  try {
    const token =
      (socket.handshake.auth && (socket.handshake.auth as any).token) ||
      (socket.handshake.headers.authorization?.toString().startsWith('Bearer ')
        ? socket.handshake.headers.authorization.toString().slice(7)
        : undefined);

    if (!token) {
      return next(new Error('Authentication required'));
    }

    const decoded = verifyAccessToken(token);
    socket.userId = decoded.userId;
    next();
  } catch (err) {
    logger.warn('[socket] unauthorized connection attempt', err);
    next(new Error('Invalid or expired token'));
  }
});

io.on('connection', (socket: AuthedSocket) => {
  logger.info(`Client connected: ${socket.id} userId=${socket.userId}`);

  // Put the socket in a per-user room so we can target it later.
  if (socket.userId) {
    socket.join(`user:${socket.userId}`);
  }

  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });

  socket.on('error', (error) => {
    logger.error(`Socket error: ${socket.id}`, error);
  });
});

// ─────────────────────────────────────────────────────────────
// Graceful shutdown
// ─────────────────────────────────────────────────────────────
const gracefulShutdown = async () => {
  logger.info('Starting graceful shutdown...');
  stopCronJobs();
  try {
    await closeQueues();
    logger.info('All queues closed');
  } catch (error) {
    logger.error('Error closing queues:', error);
  }
  server.close(() => logger.info('HTTP server closed'));
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

server.listen(PORT, async () => {
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
