import prisma from '../db/prisma';
import logger from '../utils/logger';
import { NotFoundError, ValidationError, ConflictError } from '../utils/errors';
import { PersonaData, JobData } from '../types';
import { generateSlug } from '../utils/helpers';
import { aiClient } from '../ai/client';

export class PersonaService {
  /**
   * Resolve (and if missing, create) the "default" persona for a user. The
   * scrape pipeline uses this as the owner persona for newly discovered
   * jobs, so every authenticated user always has somewhere to attach
   * JobScore rows — which is what makes jobs per-user.
   *
   * CRITICAL: Persona.slug is `@unique` GLOBALLY (not per-user), so the
   * default slug MUST embed something user-specific. We derive the slug from
   * a short hash of the userId to guarantee uniqueness without leaking the
   * full userId into the URL.
   */
  async getOrCreateDefaultPersona(userId: string) {
    try {
      // Fast path: any active persona wins. Most users only have one.
      const existing = await prisma.persona.findFirst({
        where: { userId, isActive: true },
        orderBy: { createdAt: 'asc' },
      });
      if (existing) return existing;

      // Fall back to any persona (even inactive) before creating a new one.
      const anyExisting = await prisma.persona.findFirst({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      });
      if (anyExisting) return anyExisting;

      // Build a slug that's guaranteed globally unique by suffixing it with
      // the last 12 chars of the userId. Retry on the vanishingly unlikely
      // P2002 race by appending a timestamp fallback.
      const userSuffix = userId.replace(/[^a-z0-9]/gi, '').slice(-12).toLowerCase();
      const baseSlug = `default-${userSuffix || 'user'}`;
      const tryCreate = async (slug: string) => {
        return prisma.persona.create({
          data: {
            userId,
            name: 'Default',
            slug,
            title: 'Software Engineer',
            summary: 'Auto-created default persona.',
            targetKeywords: [],
            excludeKeywords: [],
            skillPriority: {},
            experienceRules: {},
            searchSchedule: {},
          },
        });
      };

      let created;
      try {
        created = await tryCreate(baseSlug);
      } catch (err: any) {
        // P2002 = unique constraint violation — fall back to a timestamped slug
        if (err?.code === 'P2002') {
          logger.warn('Default persona slug collision, falling back to timestamped slug', {
            userId, baseSlug,
          });
          created = await tryCreate(`${baseSlug}-${Date.now()}`);
        } else {
          throw err;
        }
      }

      logger.info(`Default persona auto-created for user: ${userId}`, {
        personaId: created.id,
        slug: created.slug,
      });
      return created;
    } catch (error) {
      logger.error('Error resolving default persona:', error);
      throw error;
    }
  }

  async listPersonas(userId: string, includeInactive: boolean = false) {
    try {
      logger.info(`Listing personas for user: ${userId}`, { includeInactive });

      const where: any = { userId };
      if (!includeInactive) {
        where.isActive = true;
      }

      const personas = await prisma.persona.findMany({
        where,
        include: {
          applications: {
            select: { id: true, status: true },
          },
          scoringRules: {
            select: { id: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      logger.info(`Found ${personas.length} personas for user: ${userId}`);
      return personas;
    } catch (error) {
      logger.error('Error listing personas:', error);
      throw error;
    }
  }

  async getPersona(personaId: string) {
    try {
      logger.info(`Getting persona: ${personaId}`);

      const persona = await prisma.persona.findUnique({
        where: { id: personaId },
        include: {
          applications: {
            select: { id: true, status: true },
          },
          scoringRules: true,
        },
      });

      if (!persona) {
        throw new NotFoundError(`Persona with id ${personaId} not found`);
      }

      return persona;
    } catch (error) {
      logger.error('Error getting persona:', error);
      throw error;
    }
  }

  async createPersona(userId: string, data: PersonaData) {
    try {
      logger.info(`Creating persona for user: ${userId}`, { name: data.name });

      if (!data.name || data.name.trim().length === 0) {
        throw new ValidationError('Persona name is required');
      }

      if (!data.slug) {
        data.slug = generateSlug(data.name);
      }

      // Check if slug already exists for this user
      const existingPersona = await prisma.persona.findFirst({
        where: {
          userId,
          slug: data.slug,
        },
      });

      if (existingPersona) {
        throw new ConflictError(`Persona with slug "${data.slug}" already exists for this user`);
      }

      const persona = await prisma.persona.create({
        data: {
          userId,
          name: data.name,
          slug: data.slug,
          title: data.title,
          summary: data.summary,
          targetKeywords: data.targetKeywords || [],
          excludeKeywords: data.excludeKeywords || [],
          skillPriority: data.skillPriority || {},
          experienceRules: data.experienceRules || {},
          cvTemplateId: data.cvTemplateId,
          searchSchedule: data.searchSchedule || {},
        },
      });

      logger.info(`Persona created: ${persona.id}`);
      return persona;
    } catch (error) {
      logger.error('Error creating persona:', error);
      throw error;
    }
  }

  async updatePersona(personaId: string, data: Partial<PersonaData>) {
    try {
      logger.info(`Updating persona: ${personaId}`, { data });

      const persona = await this.getPersona(personaId);
      if (!persona) {
        throw new NotFoundError(`Persona with id ${personaId} not found`);
      }

      const updatedPersona = await prisma.persona.update({
        where: { id: personaId },
        data: {
          name: data.name ?? persona.name,
          title: data.title ?? persona.title,
          summary: data.summary ?? persona.summary,
          targetKeywords: data.targetKeywords ?? persona.targetKeywords,
          excludeKeywords: data.excludeKeywords ?? persona.excludeKeywords,
          skillPriority: data.skillPriority ?? persona.skillPriority,
          experienceRules: data.experienceRules ?? persona.experienceRules,
          cvTemplateId: data.cvTemplateId ?? persona.cvTemplateId,
          searchSchedule: data.searchSchedule ?? persona.searchSchedule,
        },
        include: {
          applications: {
            select: { id: true, status: true },
          },
          scoringRules: true,
        },
      });

      logger.info(`Persona updated: ${personaId}`);
      return updatedPersona;
    } catch (error) {
      logger.error('Error updating persona:', error);
      throw error;
    }
  }

  async deletePersona(personaId: string) {
    try {
      logger.info(`Deleting persona: ${personaId}`);

      const persona = await this.getPersona(personaId);
      if (!persona) {
        throw new NotFoundError(`Persona with id ${personaId} not found`);
      }

      const deletedPersona = await prisma.persona.update({
        where: { id: personaId },
        data: { isActive: false },
      });

      logger.info(`Persona soft-deleted: ${personaId}`);
      return deletedPersona;
    } catch (error) {
      logger.error('Error deleting persona:', error);
      throw error;
    }
  }

  async getPersonaStats(personaId: string) {
    try {
      logger.info(`Getting stats for persona: ${personaId}`);

      const persona = await this.getPersona(personaId);
      if (!persona) {
        throw new NotFoundError(`Persona with id ${personaId} not found`);
      }

      const applications = await prisma.application.findMany({
        where: { personaId },
        select: { id: true, status: true, responseAt: true },
      });

      const totalApplications = applications.length;
      const appliedApplications = applications.filter(
        a => a.status !== 'PENDING' && a.status !== 'CV_GENERATED'
      ).length;
      const respondedApplications = applications.filter(
        a => a.responseAt !== null
      ).length;
      const interviewApplications = applications.filter(
        a => a.status === 'INTERVIEW'
      ).length;
      const offerApplications = applications.filter(
        a => a.status === 'OFFER'
      ).length;

      const responseRate = appliedApplications > 0
        ? Math.round((respondedApplications / appliedApplications) * 100)
        : 0;

      const interviewRate = appliedApplications > 0
        ? Math.round((interviewApplications / appliedApplications) * 100)
        : 0;

      const offerRate = appliedApplications > 0
        ? Math.round((offerApplications / appliedApplications) * 100)
        : 0;

      logger.info(`Stats calculated for persona: ${personaId}`, {
        totalApplications,
        responseRate,
        interviewRate,
      });

      return {
        personaId,
        name: persona.name,
        totalApplications,
        appliedApplications,
        respondedApplications,
        interviewApplications,
        offerApplications,
        responseRate,
        interviewRate,
        offerRate,
        calculatedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error getting persona stats:', error);
      throw error;
    }
  }

  async testScore(personaId: string, jobData: JobData) {
    try {
      logger.info(`Test scoring job for persona: ${personaId}`);

      const persona = await this.getPersona(personaId);
      if (!persona) {
        throw new NotFoundError(`Persona with id ${personaId} not found`);
      }

      // Get user profile for scoring context
      const userProfile = await prisma.userProfile.findUnique({
        where: { id: persona.userId },
      });

      if (!userProfile) {
        throw new NotFoundError(`User profile not found`);
      }

      // Call AI service to score the job
      const score = await aiClient.scoreJob(
        jobData as any,
        {
          name: persona.name,
          title: persona.title,
          summary: persona.summary,
          targetKeywords: persona.targetKeywords,
          excludeKeywords: persona.excludeKeywords,
        },
        userProfile.structuredProfile as any
      );

      if (!score) {
        throw new Error('Failed to score job');
      }

      logger.info(`Job test scored for persona: ${personaId}`, {
        overallScore: score.overallScore,
      });

      return {
        personaId,
        jobData,
        score,
        testScoredAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error test scoring job:', error);
      throw error;
    }
  }
}

export const personaService = new PersonaService();
