export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational: boolean = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(404, message);
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string = 'Validation failed') {
    super(400, message);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized access') {
    super(401, message);
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Access forbidden') {
    super(403, message);
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

export class AIError extends AppError {
  constructor(message: string = 'AI service error') {
    super(500, message);
    Object.setPrototypeOf(this, AIError.prototype);
  }
}

export class ScraperError extends AppError {
  constructor(message: string = 'Web scraping error') {
    super(500, message);
    Object.setPrototypeOf(this, ScraperError.prototype);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string = 'Database error') {
    super(500, message);
    Object.setPrototypeOf(this, DatabaseError.prototype);
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict') {
    super(409, message);
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}
