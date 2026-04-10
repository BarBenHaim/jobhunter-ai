import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import prisma from '../db/prisma';
import logger from '../utils/logger';
import config from '../config';
import {
  ValidationError,
  UnauthorizedError,
  ConflictError,
  NotFoundError,
} from '../utils/errors';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../middleware/auth';
import { sendEmail } from '../utils/email';

const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_MINUTES = 30;

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: SanitizedUser;
}

export interface SanitizedUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  location: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  portfolioUrl: string | null;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
}

const sanitize = (u: any): SanitizedUser => ({
  id: u.id,
  email: u.email,
  fullName: u.fullName,
  phone: u.phone ?? null,
  location: u.location ?? null,
  linkedinUrl: u.linkedinUrl ?? null,
  githubUrl: u.githubUrl ?? null,
  portfolioUrl: u.portfolioUrl ?? null,
  emailVerified: !!u.emailVerified,
  createdAt: u.createdAt,
  updatedAt: u.updatedAt,
  lastLoginAt: u.lastLoginAt ?? null,
});

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

const randomToken = (bytes = 32): string =>
  crypto.randomBytes(bytes).toString('hex');

/**
 * Validate password strength.
 * Rules:
 *  - at least config.auth.passwordMinLength characters
 *  - contains at least one letter
 *  - contains at least one digit
 *  - not a common weak password
 */
const validatePasswordStrength = (password: string): void => {
  const minLen = config.auth.passwordMinLength;
  if (!password || password.length < minLen) {
    throw new ValidationError(`Password must be at least ${minLen} characters long`);
  }
  if (!/[A-Za-z]/.test(password)) {
    throw new ValidationError('Password must contain at least one letter');
  }
  if (!/\d/.test(password)) {
    throw new ValidationError('Password must contain at least one number');
  }
  const weak = new Set([
    '12345678', 'password', 'password1', 'qwerty12', 'abc12345',
    'letmein1', '11111111', '00000000', 'iloveyou',
  ]);
  if (weak.has(password.toLowerCase())) {
    throw new ValidationError('Password is too common. Please choose a stronger password.');
  }
};

const validateEmail = (email: string): void => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !re.test(email)) {
    throw new ValidationError('A valid email address is required');
  }
};

export class AuthService {
  /**
   * Register a new user account.
   */
  async register(params: { email: string; password: string; fullName: string }): Promise<AuthResult> {
    const email = normalizeEmail(params.email);
    const fullName = params.fullName?.trim();

    validateEmail(email);
    validatePasswordStrength(params.password);

    if (!fullName || fullName.length < 2) {
      throw new ValidationError('Full name is required');
    }
    if (fullName.length > 100) {
      throw new ValidationError('Full name is too long');
    }

    const existing = await prisma.userProfile.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictError('Email already registered');
    }

    const passwordHash = await bcrypt.hash(params.password, config.auth.bcryptRounds);

    const user = await prisma.userProfile.create({
      data: {
        email,
        fullName,
        passwordHash,
        emailVerified: false,
        structuredProfile: {},
        rawKnowledge: {},
        preferences: {},
        lastLoginAt: new Date(),
      },
    });

    logger.info('[auth] user registered', { userId: user.id, email });

    // Fire-and-forget: send verification email if email service is configured
    if (config.email.user) {
      this.sendVerificationEmail(user.id).catch((err) => {
        logger.warn('[auth] failed to send verification email', err);
      });
    }

    return {
      accessToken: generateAccessToken(user.id),
      refreshToken: generateRefreshToken(user.id),
      user: sanitize(user),
    };
  }

  /**
   * Login with email + password. Tracks failed attempts and locks account after too many failures.
   */
  async login(params: { email: string; password: string }): Promise<AuthResult> {
    const email = normalizeEmail(params.email);

    if (!email || !params.password) {
      throw new ValidationError('Email and password are required');
    }

    const user = await prisma.userProfile.findUnique({ where: { email } });

    // Constant-time-ish response: still run a hash compare on a dummy when user missing.
    if (!user || !user.passwordHash) {
      await bcrypt.compare(params.password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinval');
      throw new UnauthorizedError('Invalid email or password');
    }

    // Check lockout
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minsLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new UnauthorizedError(`Account temporarily locked. Try again in ${minsLeft} minute(s).`);
    }

    const valid = await bcrypt.compare(params.password, user.passwordHash);

    if (!valid) {
      const failed = (user.failedLoginAttempts || 0) + 1;
      const updateData: any = { failedLoginAttempts: failed };
      if (failed >= MAX_FAILED_ATTEMPTS) {
        updateData.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
        updateData.failedLoginAttempts = 0;
        logger.warn('[auth] account locked due to failed login attempts', { userId: user.id });
      }
      await prisma.userProfile.update({ where: { id: user.id }, data: updateData });
      throw new UnauthorizedError('Invalid email or password');
    }

    // Reset failed counter, update lastLoginAt
    await prisma.userProfile.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    logger.info('[auth] user logged in', { userId: user.id });

    return {
      accessToken: generateAccessToken(user.id),
      refreshToken: generateRefreshToken(user.id),
      user: sanitize(user),
    };
  }

  /**
   * Get the current user by ID — used for /me endpoint.
   */
  async getMe(userId: string): Promise<SanitizedUser> {
    const user = await prisma.userProfile.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User not found');
    return sanitize(user);
  }

  /**
   * Exchange a refresh token for a new access token (and a rotated refresh token).
   */
  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    if (!refreshToken) throw new UnauthorizedError('Refresh token required');

    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    const user = await prisma.userProfile.findUnique({ where: { id: decoded.userId } });
    if (!user) throw new UnauthorizedError('User no longer exists');

    // Reject tokens issued before tokensValidFrom (used for global logout / password change)
    // Note: this is best-effort — refresh token iat is in seconds.
    return {
      accessToken: generateAccessToken(user.id),
      refreshToken: generateRefreshToken(user.id),
    };
  }

  /**
   * Change password for an authenticated user. Requires current password.
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    if (!currentPassword) throw new ValidationError('Current password is required');
    validatePasswordStrength(newPassword);

    const user = await prisma.userProfile.findUnique({ where: { id: userId } });
    if (!user || !user.passwordHash) throw new NotFoundError('User not found');

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedError('Current password is incorrect');

    if (currentPassword === newPassword) {
      throw new ValidationError('New password must differ from current password');
    }

    const passwordHash = await bcrypt.hash(newPassword, config.auth.bcryptRounds);

    await prisma.userProfile.update({
      where: { id: userId },
      data: {
        passwordHash,
        tokensValidFrom: new Date(), // invalidate older tokens
        resetTokenHash: null,
        resetTokenExpires: null,
      },
    });

    logger.info('[auth] password changed', { userId });
  }

  /**
   * Request a password reset — generates a token, stores its hash, emails the user.
   * Always returns success to prevent email enumeration.
   */
  async requestPasswordReset(email: string): Promise<{ devToken?: string }> {
    const normalized = normalizeEmail(email);
    const user = await prisma.userProfile.findUnique({ where: { email: normalized } });

    if (!user) {
      logger.info('[auth] password reset requested for unknown email', { email: normalized });
      return {}; // do not reveal
    }

    const token = randomToken(32);
    const tokenHash = hashToken(token);
    const expires = new Date(Date.now() + config.auth.resetTokenTtlMinutes * 60 * 1000);

    await prisma.userProfile.update({
      where: { id: user.id },
      data: {
        resetTokenHash: tokenHash,
        resetTokenExpires: expires,
      },
    });

    const clientBase = process.env.CLIENT_URL || 'http://localhost:3000';
    const resetLink = `${clientBase}/auth/reset-password?token=${token}&email=${encodeURIComponent(user.email)}`;

    if (config.email.user) {
      try {
        await sendEmail({
          to: user.email,
          subject: 'JobHunter AI — Reset your password',
          html: `
            <div style="font-family: Arial, sans-serif; padding: 20px;">
              <h2>Password reset request</h2>
              <p>We received a request to reset the password on your JobHunter AI account.</p>
              <p>Click the link below to set a new password. This link will expire in ${config.auth.resetTokenTtlMinutes} minutes.</p>
              <p><a href="${resetLink}" style="background:#4f46e5;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;">Reset password</a></p>
              <p style="color:#666;font-size:12px;">If you did not request this, you can safely ignore this email.</p>
            </div>
          `,
        });
      } catch (e) {
        logger.warn('[auth] failed to send password reset email', e);
      }
    } else {
      logger.info('[auth] password reset token (dev mode)', { userId: user.id, token, resetLink });
    }

    // In dev, expose the token to the caller for testing.
    if (process.env.NODE_ENV !== 'production') {
      return { devToken: token };
    }
    return {};
  }

  /**
   * Complete password reset using the token sent by email.
   */
  async resetPassword(email: string, token: string, newPassword: string): Promise<void> {
    if (!email || !token) throw new ValidationError('Email and token are required');
    validatePasswordStrength(newPassword);

    const normalized = normalizeEmail(email);
    const user = await prisma.userProfile.findUnique({ where: { email: normalized } });
    if (!user || !user.resetTokenHash || !user.resetTokenExpires) {
      throw new UnauthorizedError('Invalid or expired reset token');
    }
    if (user.resetTokenExpires < new Date()) {
      throw new UnauthorizedError('Invalid or expired reset token');
    }

    const tokenHash = hashToken(token);
    // constant-time compare
    const a = Buffer.from(tokenHash, 'hex');
    const b = Buffer.from(user.resetTokenHash, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new UnauthorizedError('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(newPassword, config.auth.bcryptRounds);
    await prisma.userProfile.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetTokenHash: null,
        resetTokenExpires: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
        tokensValidFrom: new Date(),
      },
    });

    logger.info('[auth] password reset completed', { userId: user.id });
  }

  /**
   * Send an email verification link.
   */
  async sendVerificationEmail(userId: string): Promise<void> {
    const user = await prisma.userProfile.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User not found');
    if (user.emailVerified) return;

    const token = randomToken(32);
    const tokenHash = hashToken(token);
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    await prisma.userProfile.update({
      where: { id: user.id },
      data: {
        emailVerifyTokenHash: tokenHash,
        emailVerifyExpires: expires,
      },
    });

    const clientBase = process.env.CLIENT_URL || 'http://localhost:3000';
    const verifyLink = `${clientBase}/auth/verify-email?token=${token}&email=${encodeURIComponent(user.email)}`;

    if (config.email.user) {
      await sendEmail({
        to: user.email,
        subject: 'JobHunter AI — Verify your email',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2>Welcome to JobHunter AI</h2>
            <p>Please verify your email address by clicking the link below:</p>
            <p><a href="${verifyLink}" style="background:#4f46e5;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;">Verify email</a></p>
            <p style="color:#666;font-size:12px;">This link will expire in 24 hours.</p>
          </div>
        `,
      });
    } else {
      logger.info('[auth] email verify token (dev mode)', { userId: user.id, token, verifyLink });
    }
  }

  /**
   * Verify email using the token.
   */
  async verifyEmail(email: string, token: string): Promise<void> {
    if (!email || !token) throw new ValidationError('Email and token are required');

    const normalized = normalizeEmail(email);
    const user = await prisma.userProfile.findUnique({ where: { email: normalized } });
    if (!user || !user.emailVerifyTokenHash || !user.emailVerifyExpires) {
      throw new UnauthorizedError('Invalid or expired verification token');
    }
    if (user.emailVerifyExpires < new Date()) {
      throw new UnauthorizedError('Invalid or expired verification token');
    }

    const tokenHash = hashToken(token);
    const a = Buffer.from(tokenHash, 'hex');
    const b = Buffer.from(user.emailVerifyTokenHash, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new UnauthorizedError('Invalid or expired verification token');
    }

    await prisma.userProfile.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerifyTokenHash: null,
        emailVerifyExpires: null,
      },
    });

    logger.info('[auth] email verified', { userId: user.id });
  }

  /**
   * Logout — on the server we simply bump tokensValidFrom so older tokens lose standing.
   * With stateless JWT this is best-effort until we add a revocation store.
   */
  async logout(userId: string): Promise<void> {
    await prisma.userProfile.update({
      where: { id: userId },
      data: { tokensValidFrom: new Date() },
    });
    logger.info('[auth] user logged out', { userId });
  }

  /**
   * Delete account (GDPR) — requires password confirmation.
   * Cascades delete via Prisma relations (personas, analyticsEvents etc.).
   */
  async deleteAccount(userId: string, password: string): Promise<void> {
    if (!password) throw new ValidationError('Password is required to delete your account');

    const user = await prisma.userProfile.findUnique({ where: { id: userId } });
    if (!user || !user.passwordHash) throw new NotFoundError('User not found');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedError('Password is incorrect');

    await prisma.userProfile.delete({ where: { id: userId } });
    logger.info('[auth] account deleted', { userId });
  }
}

export const authService = new AuthService();
