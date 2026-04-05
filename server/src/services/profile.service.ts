import prisma from '../db/prisma';
import logger from '../utils/logger';
import { NotFoundError, ValidationError, AIError } from '../utils/errors';
import { UserProfileData } from '../types';
import { aiClient } from '../ai/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import mammoth from 'mammoth';
import * as pdfLib from 'pdf-lib';

export class ProfileService {
  async getProfile(userId: string) {
    try {
      logger.info(`Getting profile for user: ${userId}`);
      const profile = await prisma.userProfile.findUnique({
        where: { id: userId },
      });

      if (!profile) {
        throw new NotFoundError(`User profile with id ${userId} not found`);
      }

      return profile;
    } catch (error) {
      logger.error('Error getting profile:', error);
      throw error;
    }
  }

  async updateProfile(userId: string, data: Partial<UserProfileData>) {
    try {
      logger.info(`Updating profile for user: ${userId}`, { data });

      const existingProfile = await this.getProfile(userId);
      if (!existingProfile) {
        throw new NotFoundError(`User profile with id ${userId} not found`);
      }

      const updatedProfile = await prisma.userProfile.update({
        where: { id: userId },
        data: {
          fullName: data.fullName ?? existingProfile.fullName,
          email: data.email ?? existingProfile.email,
          phone: data.phone ?? existingProfile.phone,
          location: data.location ?? existingProfile.location,
          linkedinUrl: data.linkedinUrl ?? existingProfile.linkedinUrl,
          githubUrl: data.githubUrl ?? existingProfile.githubUrl,
          portfolioUrl: data.portfolioUrl ?? existingProfile.portfolioUrl,
          preferences: data.preferences ?? existingProfile.preferences,
        },
      });

      logger.info(`Profile updated for user: ${userId}`);
      return updatedProfile;
    } catch (error) {
      logger.error('Error updating profile:', error);
      throw error;
    }
  }

  async submitKnowledge(userId: string, rawText: string) {
    try {
      if (!rawText || rawText.trim().length === 0) {
        throw new ValidationError('Knowledge text cannot be empty');
      }

      logger.info(`Submitting knowledge for user: ${userId}`, {
        textLength: rawText.length,
      });

      const profile = await this.getProfile(userId);

      const existingKnowledge = typeof profile.rawKnowledge === 'object'
        ? profile.rawKnowledge
        : {};

      const updatedRawKnowledge = {
        ...existingKnowledge,
        lastSubmitted: new Date().toISOString(),
        content: rawText,
        contentLength: rawText.length,
      };

      const updatedProfile = await prisma.userProfile.update({
        where: { id: userId },
        data: {
          rawKnowledge: updatedRawKnowledge,
        },
      });

      logger.info(`Knowledge submitted for user: ${userId}`);
      return updatedProfile;
    } catch (error) {
      logger.error('Error submitting knowledge:', error);
      throw error;
    }
  }

  async processKnowledge(userId: string) {
    try {
      logger.info(`Processing knowledge for user: ${userId}`);

      const profile = await this.getProfile(userId);

      if (!profile.rawKnowledge || typeof profile.rawKnowledge !== 'object') {
        throw new ValidationError('No raw knowledge found to process');
      }

      const rawData = profile.rawKnowledge as any;
      if (!rawData.content) {
        throw new ValidationError('Raw knowledge content is empty');
      }

      // Call AI service to structure the knowledge
      const structuredProfile = await aiClient.analyzeProfile(rawData.content);

      if (!structuredProfile) {
        throw new AIError('Failed to structure profile from raw knowledge');
      }

      // Merge with existing structured profile
      const existingStructured = typeof profile.structuredProfile === 'object'
        ? profile.structuredProfile
        : {};

      const updatedStructuredProfile = {
        ...existingStructured,
        ...structuredProfile,
        processedAt: new Date().toISOString(),
        version: ((existingStructured as any)?.version || 0) + 1,
      };

      const updatedProfile = await prisma.userProfile.update({
        where: { id: userId },
        data: {
          structuredProfile: updatedStructuredProfile,
        },
      });

      logger.info(`Knowledge processed for user: ${userId}`);
      return updatedProfile;
    } catch (error) {
      logger.error('Error processing knowledge:', error);
      throw error;
    }
  }

  async uploadCV(userId: string, filePath: string) {
    try {
      logger.info(`Uploading CV for user: ${userId}`, { filePath });

      if (!fs.statSync(filePath)) {
        throw new ValidationError(`File not found: ${filePath}`);
      }

      const extension = path.extname(filePath).toLowerCase();
      let extractedText = '';

      if (extension === '.docx') {
        const fileBuffer = await fs.readFile(filePath);
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        extractedText = result.value;
      } else if (extension === '.pdf') {
        const fileBuffer = await fs.readFile(filePath);
        const pdfDoc = await pdfLib.PDFDocument.load(fileBuffer);
        const pages = pdfDoc.getPages();

        for (const page of pages) {
          const text = page.getTextContent?.() || '';
          extractedText += text;
        }
      } else {
        throw new ValidationError('Unsupported file format. Please use .pdf or .docx');
      }

      if (!extractedText || extractedText.trim().length === 0) {
        throw new ValidationError('Could not extract text from CV file');
      }

      // Store the CV content as raw knowledge
      await this.submitKnowledge(userId, extractedText);

      // Process it
      const updatedProfile = await this.processKnowledge(userId);

      logger.info(`CV uploaded and processed for user: ${userId}`);
      return updatedProfile;
    } catch (error) {
      logger.error('Error uploading CV:', error);
      throw error;
    }
  }

  async getGaps(userId: string) {
    try {
      logger.info(`Getting profile gaps for user: ${userId}`);

      const profile = await this.getProfile(userId);

      if (!profile.structuredProfile || typeof profile.structuredProfile !== 'object') {
        throw new ValidationError('No structured profile found. Please process knowledge first.');
      }

      // Call AI service to identify gaps
      const gaps = await aiClient.identifyProfileGaps(profile.structuredProfile as any);

      if (!gaps) {
        throw new AIError('Failed to identify profile gaps');
      }

      logger.info(`Profile gaps identified for user: ${userId}`, {
        gapsCount: gaps.length,
      });

      return {
        userId,
        profile: profile.structuredProfile,
        gaps,
        identifiedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error getting profile gaps:', error);
      throw error;
    }
  }
}

export const profileService = new ProfileService();
