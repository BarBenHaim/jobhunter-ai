import { Express, Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import logger from '../utils/logger';

export const errorHandler = (
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  let error = err;

  if (!(error instanceof AppError)) {
    const statusCode = 500;
    const message = err.message || 'Internal server error';
    error = new AppError(statusCode, message, false);
  }

  const { statusCode, message } = error as AppError;

  logger.error('Error:', {
    statusCode,
    message,
    stack: error.stack,
  });

  res.status(statusCode).json({
    success: false,
    error: {
      statusCode,
      message,
    },
  });
};

export const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export const setupErrorHandling = (app: Express): void => {
  app.use(errorHandler);
};
