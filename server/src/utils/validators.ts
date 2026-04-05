import { ValidationError } from './errors';

export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validateUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

export const validatePassword = (password: string): boolean => {
  return password.length >= 8;
};

export const validateUUID = (id: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id) || /^[a-z0-9]+$/.test(id);
};

export const validatePhoneNumber = (phone: string): boolean => {
  const phoneRegex = /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/;
  return phoneRegex.test(phone);
};

export const validateLocation = (location: string): boolean => {
  return location && location.length > 0 && location.length <= 255;
};

export const validateScore = (score: number): boolean => {
  return score >= 0 && score <= 1;
};

export const throwValidationError = (field: string, message: string): never => {
  throw new ValidationError(`${field}: ${message}`);
};

export const validateObjectShape = (
  obj: Record<string, any>,
  shape: Record<string, string>
): boolean => {
  for (const [key, type] of Object.entries(shape)) {
    if (typeof obj[key] !== type) {
      return false;
    }
  }
  return true;
};
