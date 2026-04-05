import prisma from '../db/prisma';
import logger from '../utils/logger';
import { NotFoundError, ValidationError } from '../utils/errors';
import { getQueueStats, scrapingQueue, scoringQueue, cvGenerationQueue, emailQueue, followUpQueue } from '../queue';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface SystemSettings {
  autoApplyEnabled: boolean;
  autoApplyMinScore: number;
  maxApplicationsPerDay: number;
  followUpEnabled: boolean;
  emailNotificationsEnabled: boolean;
  scrapersEnabled: Record<string, boolean>;
  cvGenerationQuality: 'draft' | 'standard' | 'premium';
  languagePreference: string;
}

export class SettingsService {
  private readonly defaultSettings: SystemSettings = {
    autoApplyEnabled: false,
    autoApplyMinScore: 75,
    maxApplicationsPerDay: 10,
    followUpEnabled: true,
    emailNotificationsEnabled: true,
    scrapersEnabled: {
      linkedin: false,
      indeed: false,
      alljobs: false,
      drushim: false,
      facebookGroup: false,
      wellfound: false,
      companyCareers: false,
      googleJobs: false,
      glassdoor: false,
    },
    cvGenerationQuality: 'standard',
    languagePreference: 'english',
  };

  async getSettings(userId?: string): Promise<SystemSettings> {
    try {
      logger.info(`Getting settings${userId ? ` for user: ${userId}` : ''}`);

      if (!userId) {
        return this.defaultSettings;
      }

      const userProfile = await prisma.userProfile.findUnique({
        where: { id: userId },
      });

      if (!userProfile) {
        throw new NotFoundError(`User profile with id ${userId} not found`);
      }

      const preferences = (userProfile.preferences as any) || {};

      const settings: SystemSettings = {
        autoApplyEnabled: preferences.autoApplyEnabled ?? this.defaultSettings.autoApplyEnabled,
        autoApplyMinScore: preferences.autoApplyMinScore ?? this.defaultSettings.autoApplyMinScore,
        maxApplicationsPerDay: preferences.maxApplicationsPerDay ?? this.defaultSettings.maxApplicationsPerDay,
        followUpEnabled: preferences.followUpEnabled ?? this.defaultSettings.followUpEnabled,
        emailNotificationsEnabled: preferences.emailNotificationsEnabled ?? this.defaultSettings.emailNotificationsEnabled,
        scrapersEnabled: preferences.scrapersEnabled ?? this.defaultSettings.scrapersEnabled,
        cvGenerationQuality: preferences.cvGenerationQuality ?? this.defaultSettings.cvGenerationQuality,
        languagePreference: preferences.languagePreference ?? this.defaultSettings.languagePreference,
      };

      logger.info(`Settings retrieved for user: ${userId}`);
      return settings;
    } catch (error) {
      logger.error('Error getting settings:', error);
      throw error;
    }
  }

  async updateSettings(userId: string, updates: Partial<SystemSettings>) {
    try {
      logger.info(`Updating settings for user: ${userId}`, { updates });

      const userProfile = await prisma.userProfile.findUnique({
        where: { id: userId },
      });

      if (!userProfile) {
        throw new NotFoundError(`User profile with id ${userId} not found`);
      }

      // Validate settings
      if (updates.autoApplyMinScore !== undefined) {
        if (updates.autoApplyMinScore < 0 || updates.autoApplyMinScore > 100) {
          throw new ValidationError('autoApplyMinScore must be between 0 and 100');
        }
      }

      if (updates.maxApplicationsPerDay !== undefined) {
        if (updates.maxApplicationsPerDay < 1) {
          throw new ValidationError('maxApplicationsPerDay must be at least 1');
        }
      }

      const currentPreferences = (userProfile.preferences as any) || {};
      const updatedPreferences = {
        ...currentPreferences,
        ...updates,
      };

      const updatedProfile = await prisma.userProfile.update({
        where: { id: userId },
        data: {
          preferences: updatedPreferences,
        },
      });

      logger.info(`Settings updated for user: ${userId}`);
      return updatedPreferences as SystemSettings;
    } catch (error) {
      logger.error('Error updating settings:', error);
      throw error;
    }
  }

  async getSystemHealth() {
    try {
      logger.info(`Checking system health`);

      const health: any = {
        timestamp: new Date().toISOString(),
        status: 'healthy',
        components: {},
      };

      // Check database
      try {
        const userCount = await prisma.userProfile.count();
        health.components.database = {
          status: 'healthy',
          userCount,
        };
      } catch (error) {
        health.components.database = {
          status: 'unhealthy',
          error: (error as Error).message,
        };
        health.status = 'degraded';
      }

      // Check queues
      try {
        const [scrapingStats, scoringStats, cvStats, emailStats, followUpStats] = await Promise.all([
          getQueueStats(scrapingQueue),
          getQueueStats(scoringQueue),
          getQueueStats(cvGenerationQueue),
          getQueueStats(emailQueue),
          getQueueStats(followUpQueue),
        ]);

        health.components.queues = {
          status: 'healthy',
          scraping: scrapingStats,
          scoring: scoringStats,
          cvGeneration: cvStats,
          email: emailStats,
          followUp: followUpStats,
        };
      } catch (error) {
        health.components.queues = {
          status: 'unhealthy',
          error: (error as Error).message,
        };
        health.status = 'degraded';
      }

      // Check storage
      try {
        const storagePath = path.join(process.cwd(), 'storage');
        await fs.access(storagePath);
        health.components.storage = {
          status: 'healthy',
          path: storagePath,
        };
      } catch (error) {
        health.components.storage = {
          status: 'unhealthy',
          error: (error as Error).message,
        };
        health.status = 'degraded';
      }

      // Check jobs count
      try {
        const jobCount = await prisma.job.count();
        const activeJobCount = await prisma.job.count({ where: { isActive: true } });
        health.components.jobs = {
          status: 'healthy',
          totalJobs: jobCount,
          activeJobs: activeJobCount,
        };
      } catch (error) {
        health.components.jobs = {
          status: 'unhealthy',
          error: (error as Error).message,
        };
        health.status = 'degraded';
      }

      logger.info(`System health checked`, { status: health.status });
      return health;
    } catch (error) {
      logger.error('Error checking system health:', error);
      throw error;
    }
  }

  async exportData(userId: string) {
    try {
      logger.info(`Exporting data for user: ${userId}`);

      const [userProfile, personas, applications, jobs] = await Promise.all([
        prisma.userProfile.findUnique({ where: { id: userId } }),
        prisma.persona.findMany({
          where: { userId },
          include: {
            applications: true,
            scoringRules: true,
          },
        }),
        prisma.application.findMany({
          where: { persona: { userId } },
          include: { job: true, followUps: true },
        }),
        prisma.job.findMany({
          where: {
            applications: {
              some: { persona: { userId } },
            },
          },
          include: { scores: true },
        }),
      ]);

      if (!userProfile) {
        throw new NotFoundError(`User profile with id ${userId} not found`);
      }

      const exportData = {
        user: userProfile,
        personas,
        applications,
        jobs,
        exportedAt: new Date().toISOString(),
      };

      logger.info(`Data exported for user: ${userId}`);
      return exportData;
    } catch (error) {
      logger.error('Error exporting data:', error);
      throw error;
    }
  }

  async importData(userId: string, data: any) {
    try {
      logger.info(`Importing data for user: ${userId}`);

      if (!data || typeof data !== 'object') {
        throw new ValidationError('Invalid import data format');
      }

      const userProfile = await prisma.userProfile.findUnique({
        where: { id: userId },
      });

      if (!userProfile) {
        throw new NotFoundError(`User profile with id ${userId} not found`);
      }

      const results: any = {
        imported: {
          personas: 0,
          applications: 0,
          jobs: 0,
        },
        errors: [],
      };

      // Import personas
      if (data.personas && Array.isArray(data.personas)) {
        for (const personaData of data.personas) {
          try {
            const existingPersona = await prisma.persona.findFirst({
              where: { userId, slug: personaData.slug },
            });

            if (!existingPersona) {
              await prisma.persona.create({
                data: {
                  userId,
                  name: personaData.name,
                  slug: personaData.slug,
                  title: personaData.title,
                  summary: personaData.summary,
                  targetKeywords: personaData.targetKeywords,
                  excludeKeywords: personaData.excludeKeywords,
                  skillPriority: personaData.skillPriority,
                  experienceRules: personaData.experienceRules,
                  cvTemplateId: personaData.cvTemplateId,
                },
              });
              results.imported.personas++;
            }
          } catch (error) {
            results.errors.push({
              type: 'persona',
              name: personaData.name,
              error: (error as Error).message,
            });
          }
        }
      }

      // Import jobs
      if (data.jobs && Array.isArray(data.jobs)) {
        for (const jobData of data.jobs) {
          try {
            const existingJob = await prisma.job.findUnique({
              where: { dedupHash: jobData.dedupHash },
            });

            if (!existingJob) {
              await prisma.job.create({
                data: {
                  externalId: jobData.externalId,
                  source: jobData.source,
                  sourceUrl: jobData.sourceUrl,
                  title: jobData.title,
                  company: jobData.company,
                  companyUrl: jobData.companyUrl,
                  location: jobData.location,
                  locationType: jobData.locationType,
                  description: jobData.description,
                  requirements: jobData.requirements,
                  salary: jobData.salary,
                  experienceLevel: jobData.experienceLevel,
                  postedAt: jobData.postedAt,
                  expiresAt: jobData.expiresAt,
                  dedupHash: jobData.dedupHash,
                },
              });
              results.imported.jobs++;
            }
          } catch (error) {
            results.errors.push({
              type: 'job',
              title: jobData.title,
              error: (error as Error).message,
            });
          }
        }
      }

      logger.info(`Data imported for user: ${userId}`, { results });
      return {
        userId,
        ...results,
        importedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error importing data:', error);
      throw error;
    }
  }

  async backupDatabase() {
    try {
      logger.info(`Creating database backup`);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDir = path.join(process.cwd(), 'backups');
      await fs.mkdir(backupDir, { recursive: true });

      // Export all data
      const allUsers = await prisma.userProfile.findMany({
        include: {
          personas: {
            include: {
              applications: true,
              scoringRules: true,
            },
          },
        },
      });

      const allJobs = await prisma.job.findMany({
        include: { scores: true, applications: true },
      });

      const backup = {
        timestamp,
        users: allUsers,
        jobs: allJobs,
      };

      const backupPath = path.join(backupDir, `backup-${timestamp}.json`);
      await fs.writeFile(backupPath, JSON.stringify(backup, null, 2));

      logger.info(`Database backup created: ${backupPath}`);
      return {
        backupPath,
        timestamp,
        dataSize: JSON.stringify(backup).length,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error creating backup:', error);
      throw error;
    }
  }

  async clearOldData(daysOld: number = 90) {
    try {
      logger.info(`Clearing data older than ${daysOld} days`);

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      // Remove old inactive applications
      const deletedApplications = await prisma.application.deleteMany({
        where: {
          status: 'REJECTED',
          updatedAt: { lt: cutoffDate },
        },
      });

      // Deactivate old jobs
      const deactivatedJobs = await prisma.job.updateMany({
        where: {
          expiresAt: { lt: cutoffDate },
          isActive: true,
        },
        data: {
          isActive: false,
        },
      });

      logger.info(`Old data cleared`, {
        deletedApplications: deletedApplications.count,
        deactivatedJobs: deactivatedJobs.count,
      });

      return {
        deletedApplications: deletedApplications.count,
        deactivatedJobs: deactivatedJobs.count,
        clearedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error clearing old data:', error);
      throw error;
    }
  }
}

export const settingsService = new SettingsService();
