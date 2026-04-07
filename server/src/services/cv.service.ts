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
        userProfile.structuredProfile as any
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

  async previewCV(applicationId: string, content?: any) {
    try {
      logger.info(`Previewing CV for application: ${applicationId}`);

      // Get application, job, persona, and profile data
      const application = await prisma.application.findUnique({
        where: { id: applicationId },
        include: { job: true, persona: true },
      });

      if (!application) {
        throw new NotFoundError('Application not found');
      }

      const userProfile = await prisma.userProfile.findUnique({
        where: { id: application.persona.userId || '' },
      });

      if (!userProfile) {
        throw new NotFoundError('User profile not found');
      }

      // Use provided content or generate new CV content
      let cvContent = content;
      if (!cvContent) {
        cvContent = await aiClient.generateCVContent(
          {
            id: application.job.id,
            title: application.job.title,
            company: application.job.company,
            description: application.job.description,
            requirements: application.job.requirements,
          } as any,
          {
            name: application.persona.name,
            title: application.persona.title,
            targetKeywords: application.persona.targetKeywords,
          },
          userProfile.structuredProfile as any
        );
      }

      logger.info(`CV previewed for application: ${applicationId}`);

      return {
        applicationId,
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

  /**
   * Generate a standalone ATS-optimized CV without a job application
   */
  async generateStandaloneCV(userId: string | undefined, format: string = 'pdf', variant: string = 'general', targetRole?: string) {
    try {
      // Validate userId
      if (!userId) {
        throw new ValidationError('User ID is required');
      }

      logger.info(`Generating standalone CV`, { userId, format, variant, targetRole });

      // Ensure output directory exists
      await fs.mkdir(this.cvOutputDir, { recursive: true });

      const userProfile = await prisma.userProfile.findUnique({
        where: { id: userId },
      });

      if (!userProfile) {
        throw new NotFoundError('User profile not found');
      }

      // Generate CV content based on variant
      let cvContent: any;

      try {
        // Try to use AI to tailor CV for the variant
        cvContent = await this.generateAITailoredCV(userProfile, variant, targetRole);
      } catch (error) {
        // Fallback to template-based approach if AI fails
        logger.warn('AI CV generation failed, using template approach', { error });
        cvContent = this.generateTemplateCV(userProfile, variant);
      }

      if (!cvContent) {
        throw new AIError('Failed to generate CV content');
      }

      // Generate file based on format
      let filePath: string;
      if (format === 'docx') {
        filePath = await this.generateDocxFile(userProfile, cvContent);
      } else {
        filePath = await this.generatePdfFile(userProfile, cvContent);
      }

      // Run ATS validation
      const atsValidation = await this.atsCheck(cvContent);

      logger.info(`Standalone CV generated`, {
        userId,
        format,
        variant,
        filePath,
        atsScore: atsValidation.score,
      });

      return {
        userId,
        format,
        variant,
        filePath,
        atsValidation,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error generating standalone CV:', error);
      throw error;
    }
  }

  /**
   * Generate a CV deeply tailored to a specific job posting
   */
  async generateJobTailoredCV(userId: string, jobId: string, format: string = 'both') {
    try {
      logger.info(`Generating job-tailored CV`, { userId, jobId, format });

      // Ensure output directory exists
      await fs.mkdir(this.cvOutputDir, { recursive: true });

      // Fetch user profile
      const userProfile = await prisma.userProfile.findUnique({
        where: { id: userId },
      });

      if (!userProfile) {
        throw new NotFoundError('User profile not found');
      }

      // Fetch the specific job
      const job = await prisma.job.findUnique({
        where: { id: jobId },
      });

      if (!job) {
        throw new NotFoundError('Job not found');
      }

      // Call AI to generate CV content tailored to THIS specific job
      const cvContent = await aiClient.generateCVContent(
        {
          id: job.id,
          title: job.title,
          company: job.company,
          description: job.description,
          requirements: job.requirements,
        } as any,
        {
          name: userProfile.fullName || 'Professional',
          title: userProfile.fullName || 'Professional',
          targetKeywords: [],
        },
        userProfile.structuredProfile as any
      );

      if (!cvContent) {
        throw new AIError('Failed to generate CV content');
      }

      // Generate files based on format
      let pdfPath: string | null = null;
      let docxPath: string | null = null;

      if (format === 'pdf' || format === 'both') {
        pdfPath = await this.generatePdfFile(userProfile, cvContent);
      }

      if (format === 'docx' || format === 'both') {
        docxPath = await this.generateDocxFile(userProfile, cvContent);
      }

      // Run ATS validation
      const atsValidation = await this.atsCheck(cvContent);

      logger.info(`Job-tailored CV generated`, {
        userId,
        jobId,
        pdfPath,
        docxPath,
        atsScore: atsValidation.score,
      });

      return {
        userId,
        jobId,
        pdfPath,
        docxPath,
        atsScore: atsValidation.score,
        tailoringDetails: {
          summary: cvContent.summary || '',
          skills: cvContent.skills || [],
          matchPercentage: atsValidation.score,
          tailoredHighlights: cvContent.tailoredHighlights || [],
          keywordInjections: cvContent.keywordInjections || [],
        },
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error generating job-tailored CV:', error);
      throw error;
    }
  }

  /**
   * Generate multiple ATS variants of a CV (general, frontend, backend, fullstack, data, ai)
   */
  async generateATSVersions(userId: string) {
    try {
      logger.info(`Generating ATS CV versions`, { userId });

      const variants = ['general', 'frontend', 'backend', 'fullstack', 'data', 'ai'];
      const versionResults: any[] = [];

      for (const variant of variants) {
        try {
          // Generate both PDF and DOCX versions
          const pdfResult = await this.generateStandaloneCV(userId, 'pdf', variant);
          const docxResult = await this.generateStandaloneCV(userId, 'docx', variant);

          versionResults.push({
            variant,
            success: true,
            pdfPath: pdfResult.filePath,
            docxPath: docxResult.filePath,
            atsScore: pdfResult.atsValidation.score,
          });

          logger.info(`Generated ${variant} CV variant`, {
            userId,
            pdfPath: pdfResult.filePath,
            docxPath: docxResult.filePath,
            atsScore: pdfResult.atsValidation.score,
          });
        } catch (error: any) {
          logger.warn(`Failed to generate ${variant} variant:`, error);
          versionResults.push({
            variant,
            success: false,
            error: error.message,
          });
        }
      }

      const successCount = versionResults.filter((r: any) => r.success).length;
      logger.info(`Generated ${successCount}/${variants.length} CV variants`, { userId });

      return {
        versions: versionResults,
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error generating ATS versions:', error);
      throw error;
    }
  }

  /**
   * Generate AI-tailored CV content for a specific variant
   */
  private async generateAITailoredCV(userProfile: any, variant: string, targetRole?: string): Promise<any> {
    const profile = userProfile.structuredProfile || {};
    const variantPrompts: Record<string, string> = {
      general: 'Create a well-rounded CV highlighting diverse skills',
      frontend: 'Create a frontend-focused CV emphasizing React, UI/UX, and frontend technologies',
      backend: 'Create a backend-focused CV emphasizing APIs, databases, and server architecture',
      fullstack: 'Create a fullstack CV showing both frontend and backend mastery',
      data: 'Create a data-focused CV emphasizing SQL, analytics, databases, and data engineering',
      ai: 'Create an AI/ML-focused CV emphasizing machine learning, AI integrations, and data science',
    };

    const prompt = variantPrompts[variant] || variantPrompts.general;
    const role = targetRole || variant;

    // Use aiClient to generate content (will throw if not initialized)
    const cvContent = await aiClient.generateCVContent(
      {
        id: 'standalone',
        title: role,
        company: 'Self',
        description: prompt,
        requirements: '',
      } as any,
      {
        name: 'CV Variant',
        title: role,
        targetKeywords: this.getVariantKeywords(variant),
      },
      profile
    );
    return cvContent;
  }

  /**
   * Generate template-based CV content
   */
  private generateTemplateCV(userProfile: any, variant: string): any {
    const profile = userProfile.structuredProfile || {};

    // Get variant-specific skills and flatten to array of strings
    const skillsMap = this.getVariantSkills(variant, profile.skills || {});
    const skills: string[] = [];

    // Flatten skills map to array of strings
    if (typeof skillsMap === 'object' && !Array.isArray(skillsMap)) {
      for (const category in skillsMap) {
        if (Array.isArray(skillsMap[category])) {
          skills.push(...skillsMap[category]);
        }
      }
    } else if (Array.isArray(skillsMap)) {
      skills.push(...skillsMap);
    }

    // Filter experience by variant and ensure proper structure
    const rawExperiences = profile.experience || [];
    const experiences = this.filterExperienceByVariant(variant, rawExperiences).map((exp: any) => ({
      title: exp.title || 'Position',
      company: exp.company || 'Company',
      duration: exp.duration || exp.years || 'N/A',
      description: exp.description || exp.highlights?.join('. ') || 'Contributed to team projects',
    }));

    const variantTitles: Record<string, string> = {
      frontend: 'Frontend Developer',
      backend: 'Backend Developer',
      fullstack: 'Full Stack Developer',
      data: 'Data Engineer',
      ai: 'AI Engineer',
      general: userProfile.fullName || 'Professional',
    };

    // Ensure education has proper structure
    const education = (profile.education || []).map((edu: any) => ({
      degree: edu.degree || 'Degree',
      field: edu.field || 'Field of Study',
      school: edu.school || 'Institution',
    }));

    return {
      name: userProfile.fullName || 'Professional',
      title: variantTitles[variant] || userProfile.fullName || 'Professional',
      email: userProfile.email || '',
      phone: userProfile.phone || '',
      location: userProfile.location || '',
      summary: profile.summary || `Experienced ${variantTitles[variant].toLowerCase()} with proven expertise in delivering high-quality solutions`,
      skills: skills.slice(0, 15), // Limit to top 15 skills
      experiences: experiences.slice(0, 4), // Limit to top 4 experiences
      education: education,
      projects: (profile.projects || []).slice(0, 3),
      certifications: profile.certifications || [],
    };
  }

  /**
   * Get variant-specific keywords
   */
  private getVariantKeywords(variant: string): string[] {
    const keywords: Record<string, string[]> = {
      frontend: ['React', 'Vue', 'Angular', 'CSS', 'HTML', 'UI/UX', 'JavaScript', 'TypeScript'],
      backend: ['Node.js', 'Python', 'Java', 'Go', 'Rust', 'API', 'Database', 'Microservices'],
      fullstack: ['React', 'Node.js', 'TypeScript', 'MongoDB', 'PostgreSQL', 'AWS', 'Docker'],
      data: ['SQL', 'Python', 'R', 'Pandas', 'Data Analysis', 'BI', 'ETL', 'Analytics'],
      ai: ['Machine Learning', 'Python', 'TensorFlow', 'PyTorch', 'NLP', 'LLMs', 'AI APIs'],
      general: ['Software Engineer', 'Developer', 'Problem Solving', 'Team Player'],
    };
    return keywords[variant] || keywords.general;
  }

  /**
   * Get variant-specific skills subset
   */
  private getVariantSkills(variant: string, allSkills: any): Record<string, string[]> {
    const skillMapping: Record<string, Record<string, string[]>> = {
      frontend: {
        languages: ['JavaScript', 'TypeScript', 'HTML', 'CSS'],
        frontend: allSkills.frontend || ['React', 'Next.js', 'Tailwind CSS'],
      },
      backend: {
        languages: ['TypeScript', 'Python', 'Node.js'],
        backend: allSkills.backend || ['Node.js', 'Express', 'REST APIs'],
        databases: allSkills.databases || ['PostgreSQL', 'MongoDB'],
      },
      fullstack: allSkills,
      data: {
        languages: ['Python', 'SQL', 'R'],
        databases: allSkills.databases || ['PostgreSQL', 'MySQL'],
        tools: allSkills.tools || ['Pandas', 'NumPy', 'Qlik'],
      },
      ai: {
        languages: ['Python', 'TypeScript'],
        tools: ['TensorFlow', 'PyTorch', 'AI APIs', 'Prompt Engineering'],
        ai: allSkills.ai || ['Machine Learning', 'NLP'],
      },
      general: allSkills,
    };
    return skillMapping[variant] || skillMapping.general;
  }

  /**
   * Filter experiences by variant focus
   */
  private filterExperienceByVariant(variant: string, experiences: any[]): any[] {
    if (variant === 'general') return experiences;

    const relevanceKeywords: Record<string, string[]> = {
      frontend: ['frontend', 'react', 'ui', 'ux', 'javascript', 'web'],
      backend: ['backend', 'api', 'database', 'server', 'node', 'python'],
      fullstack: ['full stack', 'fullstack', 'react', 'node', 'developer'],
      data: ['data', 'sql', 'analytics', 'bi', 'database'],
      ai: ['ai', 'ml', 'machine learning', 'llm', 'nlp'],
    };

    const keywords = relevanceKeywords[variant] || [];

    // Sort experiences by relevance to variant
    return experiences
      .map(exp => ({
        ...exp,
        relevance: keywords.filter(kw =>
          (exp.title?.toLowerCase() || '').includes(kw) ||
          (exp.description?.toLowerCase() || '').includes(kw) ||
          (exp.highlights?.some((h: string) => h.toLowerCase().includes(kw)) || false)
        ).length,
      }))
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 4)
      .map(({ relevance, ...rest }) => rest);
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
