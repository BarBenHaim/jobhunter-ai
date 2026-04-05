import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development'
      ? ['query', 'error', 'warn']
      : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

prisma.$connect().then(() => {
  logger.info('Database connected successfully');
}).catch((error) => {
  logger.error('Failed to connect to database:', error);
  process.exit(1);
});

export default prisma;
