import prisma from '../db/prisma';
import logger from '../utils/logger';
import { NotFoundError, ValidationError, AIError } from '../utils/errors';
import { aiClient } from '../ai/client';
import { cvGenerationQueue } from '../queue';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import * as PDFDocument from 'pdfkit';

export class CVService {
  private cvOutputDir = path.join(process.cwd(), 'storage', 'cvs');

  async generateCV(jobId: string, personaId: string, templateId?: string) {
    try {
      logger.info(`Generating CV for job: ${jobId}, persona: ${personaId}`);

      // Ensure output directory exists
      await fs.mkdir(this.cvOutputDir, { recursive: true });

      // Get job, persona, and profile data
      const [job, persona, userProfile] = await Promise.all([
        prisma.job.findUnique({ where: { id: jobId } }),
        prisma.persona.findUnique({ where: { id: personaId } }),
        prisma.userProfile.findUnique({
          where: { id: (await prisma.persona.findUnique({ where: { id: personaId } }))?.userId || '' },
        }),
      ]);

      if (!job || !persona || !userProfile) {
        throw new NotFoundError('Job, persona, or user profile not found');
      }

      // Get the job score for this persona
      const jobScore = await prisma.jobScore.findUnique({
        where: {
          jobId_personaId: { jobId, personaId },
        },
      });

      // Call AI to tailor CV content
      const cvContent = await aiClient.generateCVContent(
        {
          id: job.id,
          title: job.title,
          company: job.company,
          description: job.description,
          requirements: job.requirements,
        } as any,
        {
          name: persona.name,
          title: persona.title,
          targetKeywords: persona.targetKeywords,
        },
        userProfile.structuredProfile as any,
        jobScore?.overallScore || 0
      );

      if (!cvContent) {
        throw new AIError('Failed to generate CV content');
      }

      // Generate DOCX and PDF files
      const docxPath = await this.generateDocxFile(userProfile, cvContent);
      const pdfPath = await this.generatePdfFile(userProfile, cvContent);

      // Run ATS validation
      const atsValidation = await this.atsCheck(cvContent);

      // Create or update application with CV paths
      const application = await prisma.application.upsert({
        where: {
          jobId_personaId: { jobId, personaId },
        },
        create: {
          jobId,
          personaId,
          status: 'CV_GENERATED',
          cvFilePath: docxPath,
          coverLetterPath: pdfPath,
          cvContent: cvContent as any,
        },
        update: {
          status: 'CV_GENERATED',
          cvFilePath: docxPath,
          coverLetterPath: pdfPath,
          cvContent: cvContent as any,
        },
      });

      logger.info(`CV generated for application: ${application.id}`, {
        docxPath,
        pdfPath,
        atsScore: atsValidation.score,
      });

      return {
        applicationId: application.id,
        docxPath,
        pdfPath,
        atsValidation,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error generating CV:', error);
      throw error;
    }
  }

  async getCV(applicationId: string) {
    try {
      logger.info(`Getting CV for application: ${applicationId}`);

      const application = await prisma.application.findUnique({
        where: { id: applicationId },
        select: {
          id: true,
          cvFilePath: true,
          coverLetterPath: true,
          cvContent: true,
          job: {
            select: { title: true, company: true },
          },
        },
      });

      if (!application) {
        throw new NotFoundError(`Application with id ${applicationId} not found`);
      }

      if (!application.cvFilePath) {
        throw new NotFoundError(`No CV generated for application ${applicationId}`);
      }

      return {
        applicationId: application.id,
        cvPath: application.cvFilePath,
        coverLetterPath: application.coverLetterPath,
        jobTitle: application.job.title,
        company: application.job.company,
      };
    } catch (error) {
      logger.error('Error getting CV:', error);
      throw error;
    }
  }

  async previewCV(jobId: string, personaId: string) {
    try {
      logger.info(`Previewing CV for job: ${jobId}, persona: ${personaId}`);

      // Generate without saving to database
      const job = await prisma.job.findUnique({ where: { id: jobId } });
      const persona = await prisma.persona.findUnique({ where: { id: personaId } });
      const userProfile = await prisma.userProfile.findUnique({
        where: { id: persona?.userId || '' },
      });

      if (!job || !persona || !userProfile) {
        throw new NotFoundError('Job, persona, or user profile not found');
      }

      const jobScore = await prisma.jobScore.findUnique({
        where: {
          jobId_personaId: { jobId, personaId },
        },
      });

      const cvContent = await aiClient.generateCVContent(
        {
          id: job.id,
          title: job.title,
          company: job.company,
          description: job.description,
          requirements: job.requirements,
        } as any,
        {
          name: persona.name,
          title: persona.title,
          targetKeywords: persona.targetKeywords,
        },
        userProfile.structuredProfile as any,
        jobScore?.overallScore || 0
      );

      logger.info(`CV previewed for job: ${jobId}, persona: ${personaId}`);

      return {
        jobId,
        personaId,
        cvContent,
        preview: true,
        previewedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error previewing CV:', error);
      throw error;
    }
  }

  async editCV(applicationId: string, changes: Record<string, any>) {
    try {
      logger.info(`Editing CV for application: ${applicationId}`, { changes });

      const application = await prisma.application.findUnique({
        where: { id: applicationId },
      });

      if (!application) {
        throw new NotFoundError(`Application with id ${applicationId} not found`);
      }

      const currentContent = application.cvContent as any || {};
      const mergedContent = { ...currentContent, ...changes };

      const updatedApplication = await prisma.application.update({
        where: { id: applicationId },
        data: {
          cvContent: mergedContent,
          updatedAt: new Date(),
        },
      });

      logger.info(`CV edited for application: ${applicationId}`);
      return updatedApplication;
    } catch (error) {
      logger.error('Error editing CV:', error);
      throw error;
    }
  }

  async atsCheck(cvContent: any): Promise<{ score: number; issues: string[] }> {
    try {
      logger.info(`Running ATS validation`);

      const issues: string[] = [];
      let score = 100;

      // Check for common ATS issues
      const contentStr = JSON.stringify(cvContent).toLowerCase();

      // Check for contact info
      if (!contentStr.includes('email') || !contentStr.includes('phone')) {
        issues.push('Missing contact information');
        score -= 10;
      }

      // Check for complex formatting that ATS might struggle with
      if (cvContent.hasComplexFormatting) {
        issues.push('Complex formatting detected - may not parse correctly in ATS');
        score -= 15;
      }

      // Check for required keywords
      if (!contentStr.includes('experience') && !contentStr.includes('skills')) {
        issues.push('Missing expected CV sections (experience/skills)');
        score -= 10;
      }

      // Check for education
      if (!contentStr.includes('education') && !contentStr.includes('degree')) {
        issues.push('No education information found');
        score -= 5;
      }

      // Ensure score is between 0-100
      score = Math.max(0, Math.min(100, score));

      logger.info(`ATS validation complete`, { score, issuesCount: issues.length });
      return { score, issues };
    } catch (error) {
      logger.error('Error in ATS validation:', error);
      return { score: 50, issues: ['ATS validation failed'] };
    }
  }

  async listTemplates() {
    try {
      logger.info(`Listing CV templates`);

      const templatesDir = path.join(process.cwd(), 'storage', 'templates');
      const templates = await fs.readdir(templatesDir).catch(() => []);

      const templateList = await Promise.all(
        templates.map(async template => {
          const stats = await fs.stat(path.join(templatesDir, template));
          return {
            id: template,
            name: template.replace(/[-_]/g, ' '),
            createdAt: stats.birthtime,
          };
        })
      );

      logger.info(`Found ${templateList.length} templates`);
      return templateList;
    } catch (error) {
      logger.error('Error listing templates:', error);
      return [];
    }
  }

  async uploadTemplate(filePath: string, templateName: string) {
    try {
      logger.info(`Uploading CV template: ${templateName}`, { filePath });

      const templatesDir = path.join(process.cwd(), 'storage', 'templates');
      await fs.mkdir(templatesDir, { recursive: true });

      const templateFileName = templateName.toLowerCase().replace(/\s+/g, '-') + '.docx';
      const targetPath = path.join(templatesDir, templateFileName);

      const content = await fs.readFile(filePath);
      await fs.writeFile(targetPath, content);

      logger.info(`Template uploaded: ${templateFileName}`);
      return {
        id: templateFileName,
        name: templateName,
        path: targetPath,
        uploadedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error uploading template:', error);
      throw error;
    }
  }

  private async generateDocxFile(userProfile: any, cvContent: any): Promise<string> {
    const fileName = `cv-${userProfile.id}-${Date.now()}.docx`;
    const filePath = path.join(this.cvOutputDir, fileName);

    const sections = [
      new Paragraph({
        text: userProfile.fullName,
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 100 },
      }),
      new Paragraph({
        text: `${userProfile.email}${userProfile.phone ? ` | ${userProfile.phone}` : ''}${userProfile.location ? ` | ${userProfile.location}` : ''}`,
        spacing: { after: 200 },
      }),
    ];

    // Add summary
    if (cvContent.summary) {
      sections.push(
        new Paragraph({
          text: 'Professional Summary',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 100, after: 50 },
        }),
        new Paragraph({
          text: cvContent.summary,
          spacing: { after: 100 },
        })
      );
    }

    // Add skills
    if (cvContent.skills && Array.isArray(cvContent.skills)) {
      sections.push(
        new Paragraph({
          text: 'Skills',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 100, after: 50 },
        }),
        new Paragraph({
          text: cvContent.skills.join(', '),
          spacing: { after: 100 },
        })
      );
    }

    // Add experience
    if (cvContent.experiences && Array.isArray(cvContent.experiences)) {
      sections.push(
        new Paragraph({
          text: 'Experience',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 100, after: 50 },
        })
      );

      for (const exp of cvContent.experiences) {
        sections.push(
          new Paragraph({
            text: `${exp.title} at ${exp.company}`,
            spacing: { before: 50, after: 25 },
            bold: true,
          }),
          new Paragraph({
            text: exp.description,
            spacing: { after: 50 },
          })
        );
      }
    }

    const doc = new Document({
      sections: [
        {
          children: sections,
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    await fs.writeFile(filePath, buffer);

    logger.info(`DOCX file generated: ${filePath}`);
    return filePath;
  }

  private async generatePdfFile(userProfile: any, cvContent: any): Promise<string> {
    const fileName = `cv-${userProfile.id}-${Date.now()}.pdf`;
    const filePath = path.join(this.cvOutputDir, fileName);

    const doc = new PDFDocument();
    const stream = require('fs').createWriteStream(filePath);

    doc.pipe(stream);

    // Add title
    doc.fontSize(20).font('Helvetica-Bold').text(userProfile.fullName);
    doc.fontSize(10).font('Helvetica').text(
      `${userProfile.email}${userProfile.phone ? ` | ${userProfile.phone}` : ''}${userProfile.location ? ` | ${userProfile.location}` : ''}`
    );
    doc.moveDown();

    // Add summary
    if (cvContent.summary) {
      doc.fontSize(12).font('Helvetica-Bold').text('Professional Summary');
      doc.fontSize(10).font('Helvetica').text(cvContent.summary);
      doc.moveDown();
    }

    // Add skills
    if (cvContent.skills && Array.isArray(cvContent.skills)) {
      doc.fontSize(12).font('Helvetica-Bold').text('Skills');
      doc.fontSize(10).font('Helvetica').text(cvContent.skills.join(', '));
      doc.moveDown();
    }

    // Add experience
    if (cvContent.experiences && Array.isArray(cvContent.experiences)) {
      doc.fontSize(12).font('Helvetica-Bold').text('Experience');
      for (const exp of cvContent.experiences) {
        doc.fontSize(11).font('Helvetica-Bold').text(`${exp.title} at ${exp.company}`);
        doc.fontSize(10).font('Helvetica').text(exp.description);
        doc.moveDown();
      }
    }

    doc.end();

    return new Promise((resolve, reject) => {
      stream.on('finish', () => {
        logger.info(`PDF file generated: ${filePath}`);
        resolve(filePath);
      });
      stream.on('error', reject);
    });
  }
}

export const cvService = new CVService();
