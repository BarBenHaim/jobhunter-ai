import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';
import { asyncHandler } from '../middleware/errorHandler';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { authService } from '../services/auth.service';
import { ValidationError } from '../utils/errors';
import logger from '../utils/logger';

const router = Router();

// Rate limiters — narrow by route to avoid sharing a single bucket.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // 10 login attempts per 15 min per IP
  message: { success: false, error: 'Too many login attempts. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5, // 5 registrations per hour per IP
  message: { success: false, error: 'Too many accounts created. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { success: false, error: 'Too many password reset requests. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const checkValidation = (req: Request): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const first = errors.array()[0];
    throw new ValidationError((first as any).msg || 'Invalid input');
  }
};

/**
 * POST /api/auth/register
 */
router.post(
  '/register',
  registerLimiter,
  [
    body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password').isString().isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('fullName').isString().trim().notEmpty().withMessage('Full name is required'),
  ],
  asyncHandler(async (req: Request, res: Response) => {
    checkValidation(req);
    const result = await authService.register({
      email: req.body.email,
      password: req.body.password,
      fullName: req.body.fullName,
    });
    res.status(201).json({
      success: true,
      token: result.accessToken, // legacy field for existing clients
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    });
  })
);

/**
 * POST /api/auth/login
 */
router.post(
  '/login',
  loginLimiter,
  [
    body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password').isString().notEmpty().withMessage('Password is required'),
  ],
  asyncHandler(async (req: Request, res: Response) => {
    checkValidation(req);
    const result = await authService.login({
      email: req.body.email,
      password: req.body.password,
    });
    res.json({
      success: true,
      token: result.accessToken, // legacy
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    });
  })
);

/**
 * GET /api/auth/me — return current user profile
 */
router.get(
  '/me',
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = await authService.getMe(req.userId!);
    res.json({ success: true, user });
  })
);

/**
 * POST /api/auth/refresh — exchange refresh token for a new access token.
 */
router.post(
  '/refresh',
  [body('refreshToken').isString().notEmpty().withMessage('refreshToken required')],
  asyncHandler(async (req: Request, res: Response) => {
    checkValidation(req);
    const result = await authService.refresh(req.body.refreshToken);
    res.json({ success: true, ...result });
  })
);

/**
 * POST /api/auth/logout — best-effort server-side logout.
 */
router.post(
  '/logout',
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    await authService.logout(req.userId!);
    res.json({ success: true });
  })
);

/**
 * PATCH /api/auth/password — change password (authenticated).
 */
router.patch(
  '/password',
  authMiddleware,
  [
    body('currentPassword').isString().notEmpty(),
    body('newPassword').isString().isLength({ min: 8 }),
  ],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    checkValidation(req);
    await authService.changePassword(
      req.userId!,
      req.body.currentPassword,
      req.body.newPassword
    );
    res.json({ success: true, message: 'Password updated successfully' });
  })
);

/**
 * POST /api/auth/forgot-password
 */
router.post(
  '/forgot-password',
  passwordResetLimiter,
  [body('email').isEmail().normalizeEmail()],
  asyncHandler(async (req: Request, res: Response) => {
    checkValidation(req);
    const result = await authService.requestPasswordReset(req.body.email);
    // Always return 200 to prevent enumeration.
    res.json({
      success: true,
      message: 'If an account exists for that email, a reset link has been sent.',
      ...(result.devToken && process.env.NODE_ENV !== 'production' ? { devToken: result.devToken } : {}),
    });
  })
);

/**
 * POST /api/auth/reset-password
 */
router.post(
  '/reset-password',
  passwordResetLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('token').isString().notEmpty(),
    body('newPassword').isString().isLength({ min: 8 }),
  ],
  asyncHandler(async (req: Request, res: Response) => {
    checkValidation(req);
    await authService.resetPassword(req.body.email, req.body.token, req.body.newPassword);
    res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
  })
);

/**
 * POST /api/auth/verify-email
 */
router.post(
  '/verify-email',
  [
    body('email').isEmail().normalizeEmail(),
    body('token').isString().notEmpty(),
  ],
  asyncHandler(async (req: Request, res: Response) => {
    checkValidation(req);
    await authService.verifyEmail(req.body.email, req.body.token);
    res.json({ success: true, message: 'Email verified' });
  })
);

/**
 * POST /api/auth/resend-verification
 */
router.post(
  '/resend-verification',
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    await authService.sendVerificationEmail(req.userId!);
    res.json({ success: true, message: 'Verification email sent' });
  })
);

/**
 * DELETE /api/auth/account — delete own account (GDPR).
 */
router.delete(
  '/account',
  authMiddleware,
  [body('password').isString().notEmpty()],
  asyncHandler(async (req: AuthRequest, res: Response) => {
    checkValidation(req);
    await authService.deleteAccount(req.userId!, req.body.password);
    res.json({ success: true, message: 'Account deleted' });
  })
);

export default router;
