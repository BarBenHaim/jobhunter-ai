import prisma from '../db/prisma';
import logger from '../utils/logger';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import * as fs from 'fs/promises';
import * as path from 'path';
import { profileService } from './profile.service';

const MAX_CVS_PER_USER = 3;

// Role detection patterns — Hebrew + English
const ROLE_PATTERNS: Record<string, RegExp[]> = {
  FRONTEND: [
    /front[\s-]?end/i, /react/i, /angular/i, /vue\.?js/i, /css|sass|scss|tailwind/i,
    /פרונט/i, /ממשק משתמש/i, /UI\s*developer/i,
  ],
  BACKEND: [
    /back[\s-]?end/i, /node\.?js/i, /express/i, /django/i, /flask/i, /spring/i,
    /\.net|c#/i, /java(?!script)/i, /golang|go\s+developer/i, /rust\s+developer/i,
    /בקנד/i, /שרת/i, /server[\s-]?side/i, /API\s*develop/i,
  ],
  FULLSTACK: [
    /full[\s-]?stack/i, /פולסטאק/i, /full\s*stack/i,
  ],
  DEVOPS: [
    /devops/i, /SRE/i, /cloud\s*engineer/i, /kubernetes|k8s/i, /docker/i,
    /terraform/i, /jenkins/i, /CI\/CD/i, /AWS\s*engineer/i, /azure\s*engineer/i,
    /דבאופס/i, /תשתיות/i, /infrastructure/i,
  ],
  DATA: [
    /data\s*(engineer|scientist|analyst)/i, /machine\s*learning/i, /ML\s*engineer/i,
    /AI\s*engineer/i, /deep\s*learning/i, /big\s*data/i, /ETL/i, /data\s*pipeline/i,
    /דאטה/i, /מדען נתונים/i, /BI\s*(developer|analyst)/i,
  ],
  MOBILE: [
    /mobile/i, /iOS/i, /android/i, /react\s*native/i, /flutter/i, /swift/i, /kotlin/i,
    /מובייל/i, /אפליקציה/i,
  ],
  QA: [
    /QA/i, /quality\s*assurance/i, /test\s*(engineer|automation|lead)/i, /SDET/i,
    /selenium/i, /cypress/i, /playwright/i, /בדיקות/i, /אוטומציה/i,
  ],
  MANAGEMENT: [
    /team\s*lead/i, /tech\s*lead/i, /CTO/i, /VP\s*(R&D|Engineering)/i,
    /engineering\s*manager/i, /ראש צוות/i, /מנהל פיתוח/i, /ארכיטקט/i, /architect/i,
  ],
};

/**
 * Detect the role type from CV text content
 */
function detectRoleType(text: string): { roleType: string; confidence: number } {
  const scores: Record<string, number> = {};

  for (const [role, patterns] of Object.entries(ROLE_PATTERNS)) {
    scores[role] = 0;
    for (const pattern of patterns) {
      const matches = text.match(new RegExp(pattern, 'gi'));
      if (matches) {
        scores[role] += matches.length;
      }
    }
  }

  // Fullstack gets a boost if both frontend and backend score
  if (scores.FRONTEND > 0 && scores.BACKEND > 0) {
    scores.FULLSTACK = (scores.FULLSTACK || 0) + Math.min(scores.FRONTEND, scores.BACKEND);
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const top = sorted[0];

  if (top[1] === 0) return { roleType: 'GENERAL', confidence: 0 };

  const total = sorted.reduce((sum, [, s]) => sum + s, 0);
  return { roleType: top[0], confidence: Math.round((top[1] / total) * 100) };
}

/**
 * Extract skills from CV text
 */
function extractSkillsFromText(text: string): string[] {
  const SKILL_PATTERNS = [
    // Programming languages
    /\b(JavaScript|TypeScript|Python|Java|C\+\+|C#|Go|Rust|Ruby|PHP|Swift|Kotlin|Scala|R|Perl|MATLAB)\b/gi,
    // Frameworks
    /\b(React|Angular|Vue\.?js|Next\.?js|Nuxt|Svelte|Express|NestJS|Django|Flask|Spring\s*Boot|\.NET|Rails|Laravel|FastAPI)\b/gi,
    // Databases
    /\b(PostgreSQL|MySQL|MongoDB|Redis|Elasticsearch|DynamoDB|Cassandra|SQLite|Oracle|SQL\s*Server|Firebase)\b/gi,
    // Cloud & DevOps
    /\b(AWS|Azure|GCP|Docker|Kubernetes|Terraform|Jenkins|GitHub\s*Actions|CircleCI|Ansible|Nginx|Linux)\b/gi,
    // Tools
    /\b(Git|Jira|Confluence|Figma|Storybook|Webpack|Vite|GraphQL|REST|gRPC|Kafka|RabbitMQ|Cypress|Selenium|Jest|Playwright)\b/gi,
    // Data
    /\b(Spark|Hadoop|Airflow|Pandas|NumPy|TensorFlow|PyTorch|Scikit-learn|Tableau|Power\s*BI|Looker)\b/gi,
  ];

  const skills = new Set<string>();
  for (const pattern of SKILL_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach(m => skills.add(m.trim()));
    }
  }
  return Array.from(skills);
}

export const cvLibraryService = {
  /**
   * Upload a new CV file and create UploadedCV record
   */
  async uploadCV(
    userId: string,
    fileBuffer: Buffer,
    originalName: string,
    mimeType: string,
    label?: string
  ) {
    // Check limit
    const existingCount = await (prisma as any).uploadedCV.count({ where: { userId } });
    if (existingCount >= MAX_CVS_PER_USER) {
      throw new Error(`ניתן להעלות עד ${MAX_CVS_PER_USER} קורות חיים. מחק קובץ קיים לפני העלאת חדש.`);
    }

    // Determine file type
    const nameLower = originalName.toLowerCase();
    const isDocx = mimeType.includes('wordprocessingml') || nameLower.endsWith('.docx');
    const isPdf = mimeType === 'application/pdf' || nameLower.endsWith('.pdf');
    if (!isDocx && !isPdf) {
      throw new Error('רק קבצי PDF ו-DOCX נתמכים');
    }
    const ext = isPdf ? '.pdf' : '.docx';

    // Save file to uploads directory
    const uploadsDir = path.join(process.cwd(), 'uploads', 'cvs', userId);
    await fs.mkdir(uploadsDir, { recursive: true });
    const fileName = `cv_${Date.now()}${ext}`;
    const filePath = path.join(uploadsDir, fileName);
    await fs.writeFile(filePath, fileBuffer);

    // Extract text
    let extractedText = '';
    try {
      if (isDocx) {
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        extractedText = result.value;
      } else {
        const pdfData = await pdfParse(fileBuffer);
        extractedText = pdfData.text;
      }
    } catch (err) {
      logger.error('[CVLibrary] Text extraction failed:', err);
    }

    // Auto-detect role type
    const { roleType, confidence } = detectRoleType(extractedText);
    const extractedSkills = extractSkillsFromText(extractedText);

    // If this is the first CV, make it default
    const isFirst = existingCount === 0;

    // Create record
    const cv = await (prisma as any).uploadedCV.create({
      data: {
        userId,
        fileName: originalName,
        filePath,
        fileSize: fileBuffer.length,
        mimeType: isPdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        roleType,
        roleTypeAutoDetected: true,
        label: label || `${originalName} (${roleType})`,
        extractedText,
        extractedSkills,
        extractedProfile: { confidence, detectedRole: roleType },
        parsedAt: new Date(),
        isDefault: isFirst,
      },
    });

    // Re-merge all CVs into the unified profile
    await this.mergeProfileFromAllCVs(userId);

    logger.info(`[CVLibrary] CV uploaded: ${cv.id} as ${roleType} (confidence: ${confidence}%) for user ${userId}`);
    return cv;
  },

  /**
   * Get all uploaded CVs for a user
   */
  async getUserCVs(userId: string) {
    return (prisma as any).uploadedCV.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        roleType: true,
        roleTypeAutoDetected: true,
        label: true,
        extractedSkills: true,
        isDefault: true,
        parsedAt: true,
        createdAt: true,
      },
    });
  },

  /**
   * Delete a CV
   */
  async deleteCV(userId: string, cvId: string) {
    const cv = await (prisma as any).uploadedCV.findFirst({
      where: { id: cvId, userId },
    });
    if (!cv) throw new Error('CV not found');

    // Delete file from disk
    try {
      await fs.unlink(cv.filePath);
    } catch (err) {
      logger.warn('[CVLibrary] Could not delete file:', err);
    }

    await (prisma as any).uploadedCV.delete({ where: { id: cvId } });

    // If we deleted the default, make another one default
    if (cv.isDefault) {
      const remaining = await (prisma as any).uploadedCV.findFirst({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      });
      if (remaining) {
        await (prisma as any).uploadedCV.update({
          where: { id: remaining.id },
          data: { isDefault: true },
        });
      }
    }

    // Re-merge profile
    await this.mergeProfileFromAllCVs(userId);
    return { success: true };
  },

  /**
   * Update CV metadata (label, role type, default status)
   */
  async updateCV(userId: string, cvId: string, updates: { label?: string; roleType?: string; isDefault?: boolean }) {
    const cv = await (prisma as any).uploadedCV.findFirst({
      where: { id: cvId, userId },
    });
    if (!cv) throw new Error('CV not found');

    const data: any = {};
    if (updates.label !== undefined) data.label = updates.label;
    if (updates.roleType !== undefined) {
      data.roleType = updates.roleType;
      data.roleTypeAutoDetected = false; // User overrode
    }
    if (updates.isDefault) {
      // Unset other defaults
      await (prisma as any).uploadedCV.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
      data.isDefault = true;
    }

    return (prisma as any).uploadedCV.update({
      where: { id: cvId },
      data,
    });
  },

  /**
   * Merge all CVs into unified profile — enriches structuredProfile + rawKnowledge
   */
  async mergeProfileFromAllCVs(userId: string) {
    const cvs = await (prisma as any).uploadedCV.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });

    if (cvs.length === 0) return;

    // Combine all extracted text
    const allText = cvs.map((cv: any) => cv.extractedText || '').join('\n\n---\n\n');

    // Merge all skills
    const allSkills = new Set<string>();
    for (const cv of cvs) {
      if (cv.extractedSkills) {
        cv.extractedSkills.forEach((s: string) => allSkills.add(s));
      }
    }

    // Submit combined knowledge to profile service (this triggers AI analysis)
    await profileService.submitKnowledge(userId, allText);
    await profileService.processKnowledge(userId);

    logger.info(`[CVLibrary] Merged ${cvs.length} CVs into profile for user ${userId}, total skills: ${allSkills.size}`);
  },

  /**
   * Select the best CV for a given job — used by AutoPilot
   */
  selectBestCVForJob(
    cvs: Array<{ id: string; roleType: string; extractedSkills: string[]; isDefault: boolean; filePath: string; label: string }>,
    jobTitle: string,
    jobDescription: string
  ): { cvId: string; filePath: string; label: string; matchReason: string } | null {
    if (cvs.length === 0) return null;
    if (cvs.length === 1) {
      return { cvId: cvs[0].id, filePath: cvs[0].filePath, label: cvs[0].label, matchReason: 'CV יחיד' };
    }

    const jobText = `${jobTitle} ${jobDescription}`.toLowerCase();

    // Score each CV against the job
    const scored = cvs.map(cv => {
      let score = 0;
      let reason = '';

      // Role type matching
      const roleMap: Record<string, RegExp[]> = {
        FRONTEND: [/front/i, /react/i, /angular/i, /vue/i, /ui/i, /css/i, /פרונט/i],
        BACKEND: [/back/i, /server/i, /api/i, /node/i, /python/i, /java(?!script)/i, /בקנד/i],
        FULLSTACK: [/full[\s-]?stack/i, /פולסטאק/i],
        DEVOPS: [/devops/i, /cloud/i, /infra/i, /sre/i, /דבאופס/i],
        DATA: [/data/i, /ml/i, /machine/i, /analytics/i, /דאטה/i],
        MOBILE: [/mobile/i, /ios/i, /android/i, /react native/i, /מובייל/i],
        QA: [/qa/i, /test/i, /quality/i, /automation/i, /בדיקות/i],
      };

      const patterns = roleMap[cv.roleType] || [];
      const roleMatches = patterns.filter(p => p.test(jobText)).length;
      if (roleMatches > 0) {
        score += roleMatches * 20;
        reason = `סוג תפקיד מתאים (${cv.roleType})`;
      }

      // Skill overlap
      if (cv.extractedSkills) {
        const matchedSkills = cv.extractedSkills.filter(skill =>
          jobText.includes(skill.toLowerCase())
        );
        score += matchedSkills.length * 5;
        if (matchedSkills.length > 0) {
          reason += ` + ${matchedSkills.length} כישורים תואמים`;
        }
      }

      // Default bonus (tiebreaker)
      if (cv.isDefault) score += 1;

      return { cv, score, reason: reason || 'CV ברירת מחדל' };
    });

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];

    return {
      cvId: best.cv.id,
      filePath: best.cv.filePath,
      label: best.cv.label,
      matchReason: best.reason,
    };
  },
};
