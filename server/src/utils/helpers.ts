import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

export const generateId = (): string => {
  return uuidv4();
};

export const generateSlug = (text: string): string => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 50);
};

export const generateHash = (text: string): string => {
  return crypto
    .createHash('sha256')
    .update(text)
    .digest('hex');
};

export const parseJson = (json: string, defaultValue: any = null): any => {
  try {
    return JSON.parse(json);
  } catch {
    return defaultValue;
  }
};

export const stringifyJson = (obj: any, pretty: boolean = false): string => {
  try {
    return JSON.stringify(obj, null, pretty ? 2 : 0);
  } catch {
    return '{}';
  }
};

export const truncateString = (str: string, length: number): string => {
  if (str.length <= length) return str;
  return str.substring(0, length - 3) + '...';
};

export const delay = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export const retry = async <T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delayMs: number = 1000
): Promise<T> => {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxAttempts) {
        await delay(delayMs * attempt);
      }
    }
  }

  throw lastError || new Error('Max retry attempts reached');
};

export const chunk = <T>(arr: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

export const groupBy = <T>(
  arr: T[],
  keyFn: (item: T) => string | number
): Record<string, T[]> => {
  return arr.reduce((acc, item) => {
    const key = keyFn(item);
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(item);
    return acc;
  }, {} as Record<string, T[]>);
};

export const sortByScore = <T extends { overallScore?: number }>(arr: T[]): T[] => {
  return [...arr].sort((a, b) => (b.overallScore || 0) - (a.overallScore || 0));
};

export const calculatePercentage = (value: number, total: number): number => {
  if (total === 0) return 0;
  return Math.round((value / total) * 100);
};

export const isValidDate = (date: unknown): date is Date => {
  return date instanceof Date && !isNaN(date.getTime());
};

export const formatDate = (date: Date, format: string = 'YYYY-MM-DD'): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return format
    .replace('YYYY', String(year))
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds);
};

export const getDayOfWeek = (date: Date): string => {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[date.getDay()];
};

export const getDaysDifference = (date1: Date, date2: Date): number => {
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.round((date2.getTime() - date1.getTime()) / oneDay);
};

export const mergeObjects = <T extends Record<string, any>>(target: T, source: T): T => {
  return { ...target, ...source };
};

export const deepMerge = <T extends Record<string, any>>(target: T, source: T): T => {
  const result = { ...target };

  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
  }

  return result;
};

export const pickFields = <T extends Record<string, any>, K extends keyof T>(
  obj: T,
  fields: K[]
): Pick<T, K> => {
  const result = {} as Pick<T, K>;
  fields.forEach(field => {
    result[field] = obj[field];
  });
  return result;
};
