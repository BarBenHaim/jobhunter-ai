import { Request, Response, NextFunction } from 'express';
import jwt, { SignOptions, TokenExpiredError, JsonWebTokenError } from 'jsonwebtoken';
import { UnauthorizedError } from '../utils/errors';
import logger from '../utils/logger';

export interface AuthRequest extends Request {
  userId?: string;
  tokenType?: 'access' | 'refresh';
}

const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Resolve the JWT secret.
 * - Production: MUST be set, strong (>= 32 chars), and not a known default.
 * - Development: warns loudly if unset and uses a dev-only random secret per boot.
 */
const resolveJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;

  const WEAK_DEFAULTS = new Set([
    'your-secret-key',
    'change-me-in-production',
    'secret',
    'jwt-secret',
    'development',
  ]);

  if (NODE_ENV === 'production') {
    if (!secret) {
      throw new Error('FATAL: JWT_SECRET environment variable is required in production');
    }
    if (secret.length < 32) {
      throw new Error('FATAL: JWT_SECRET must be at least 32 characters in production');
    }
    if (WEAK_DEFAULTS.has(secret)) {
      throw new Error('FATAL: JWT_SECRET is set to a known weak default. Generate a strong random value.');
    }
    return secret;
  }

  if (!secret || WEAK_DEFAULTS.has(secret)) {
    const devSecret = 'dev-only-secret-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    logger.warn('[auth] JWT_SECRET is missing or weak. Using an EPHEMERAL dev secret. Tokens will be invalidated on restart.');
    return devSecret;
  }

  return secret;
};

const JWT_SECRET = resolveJwtSecret();
const JWT_ACCESS_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || '15m') as SignOptions['expiresIn'];
const JWT_REFRESH_EXPIRES_IN = (process.env.JWT_REFRESH_EXPIRES_IN || '30d') as SignOptions['expiresIn'];

interface TokenPayload {
  userId: string;
  type: 'access' | 'refresh';
}

export const generateAccessToken = (userId: string): string => {
  return jwt.sign({ userId, type: 'access' } as TokenPayload, JWT_SECRET, {
    expiresIn: JWT_ACCESS_EXPIRES_IN,
    issuer: 'jobhunter-ai',
  });
};

export const generateRefreshToken = (userId: string): string => {
  return jwt.sign({ userId, type: 'refresh' } as TokenPayload, JWT_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN,
    issuer: 'jobhunter-ai',
  });
};

/** Legacy alias — kept so existing imports of `generateToken` continue to work. */
export const generateToken = generateAccessToken;

export const verifyAccessToken = (token: string): TokenPayload => {
  const decoded = jwt.verify(token, JWT_SECRET, { issuer: 'jobhunter-ai' }) as TokenPayload;
  if (decoded.type && decoded.type !== 'access') {
    throw new UnauthorizedError('Wrong token type');
  }
  return decoded;
};

export const verifyRefreshToken = (token: string): TokenPayload => {
  const decoded = jwt.verify(token, JWT_SECRET, { issuer: 'jobhunter-ai' }) as TokenPayload;
  if (decoded.type !== 'refresh') {
    throw new UnauthorizedError('Wrong token type');
  }
  return decoded;
};

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    throw new UnauthorizedError('No authentication token provided');
  }

  try {
    const decoded = verifyAccessToken(token);
    req.userId = decoded.userId;
    req.tokenType = 'access';
    next();
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      throw new UnauthorizedError('Token expired');
    }
    if (error instanceof JsonWebTokenError) {
      throw new UnauthorizedError('Invalid token');
    }
    throw new UnauthorizedError('Authentication failed');
  }
};

/** Optional auth — sets req.userId if a valid token is present but never throws. */
export const optionalAuthMiddleware = (req: AuthRequest, _res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return next();
  try {
    const decoded = verifyAccessToken(token);
    req.userId = decoded.userId;
    req.tokenType = 'access';
  } catch {
    /* ignore */
  }
  next();
};
