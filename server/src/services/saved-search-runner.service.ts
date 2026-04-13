import nodemailer, { Transporter } from 'nodemailer';
import { lightweightScraperService } from './lightweight-scraper.service';
import { scoreJobLocally } from './smart-match.service';
import prisma from '../db/prisma';
import logger from '../utils/logger';
import config from '../config';

/**
 * SavedSearchRunnerService
 *
 * Handles automated execution of saved searches and sending notifications to users.
 * - Respects notification frequency settings (realtime, hourly, daily, weekly)
 * - Scores jobs locally against saved search criteria
 * - Sends Hebrew email notifications with matching jobs
 */

interface JobWithScore {
  title: string;
  company: string;
  location: string;
  score: number;
  sourceUrl: string;
  source: string;
}

class SavedSearchRunnerService {
  private emailTransporter: Transporter | null = null;

  constructor() {
    this.initializeEmailTransporter();
  }

  /**
   * Initialize the email transporter based on configuration.
   * Supports Gmail or custom SMTP.
   */
  private initializeEmailTransporter(): void {
    try {
      if (config.email?.service === 'gmail') {
        this.emailTransporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: config.email.user,
            pass: config.email.password,
          },
        });
      } else {
        this.emailTransporter = nodemailer.createTransport({
          host: config.email?.smtp?.host || 'smtp.gmail.com',
          port: config.email?.smtp?.port || 587,
          secure: (config.email?.smtp?.port) === 465,
          auth: {
            user: config.email?.user,
            pass: config.email?.password,
          },
        });
      }
      logger.info('Email transporter initialized for saved search notifications');
    } catch (error) {
      logger.error('Failed to initialize email transporter', { error });
    }
  }

  /**
   * Check if a saved search should run based on its notification frequency
   * and the time since it last ran.
   */
  private shouldRun(savedSearch: any): boolean {
    const now = new Date();
    const lastRunAt = savedSearch.lastRunAt ? new Date(savedSearch.lastRunAt) : null;

    // Always run if never run before
    if (!lastRunAt) {
      return true;
    }

    const timeSinceLastRun = now.getTime() - lastRunAt.getTime();

    switch (savedSearch.notifyFrequency) {
      case 'realtime':
        // Run immediately (e.g., every few minutes)
        return timeSinceLastRun >= 5 * 60 * 1000; // 5 minutes
      case 'hourly':
        return timeSinceLastRun >= 60 * 60 * 1000; // 1 hour
      case 'daily':
        return timeSinceLastRun >= 24 * 60 * 60 * 1000; // 24 hours
      case 'weekly':
        return timeSinceLastRun >= 7 * 24 * 60 * 60 * 1000; // 7 days
      default:
        return true;
    }
  }

  /**
   * Run all active saved searches (or for a specific user).
   * For each search:
   * - Check if it should run based on cooldown period
   * - Scrape jobs using the search's configuration
   * - Score results locally
   * - Count new matching jobs
   * - Update metadata
   * - Send notification email if enabled and new jobs found
   */
  async runSavedSearches(userId?: string): Promise<void> {
    try {
      logger.info('Starting saved search runner', { userId: userId || 'all' });

      // Fetch all active saved searches (optionally filtered by userId)
      const where = userId ? { isActive: true, userId } : { isActive: true };
      const savedSearches = await (prisma as any).savedSearch.findMany({ where });

      if (savedSearches.length === 0) {
        logger.info('No active saved searches to run');
        return;
      }

      logger.info(`Found ${savedSearches.length} active saved searches to process`);

      // Process each saved search
      for (const savedSearch of savedSearches) {
        try {
          // Check if this search should run based on cooldown
          if (!this.shouldRun(savedSearch)) {
            logger.debug(`Skipping saved search (cooldown not expired)`, {
              savedSearchId: savedSearch.id,
              notifyFrequency: savedSearch.notifyFrequency,
              lastRunAt: savedSearch.lastRunAt,
            });
            continue;
          }

          // Prepare search parameters
          const keywords = savedSearch.keywords && savedSearch.keywords.length > 0
            ? savedSearch.keywords
            : ['מפתח תוכנה', 'software developer'];
          const location = savedSearch.location || 'Israel';
          const enabledSources = savedSearch.sources && savedSearch.sources.length > 0
            ? savedSearch.sources
            : undefined;

          logger.info(`Running saved search`, {
            savedSearchId: savedSearch.id,
            userId: savedSearch.userId,
            name: savedSearch.name,
            keywords,
          });

          // Scrape jobs
          const scrapeResults = await lightweightScraperService.scrapeAll(
            keywords,
            location,
            enabledSources
          );

          // Flatten all jobs
          const allJobs = scrapeResults.flatMap(result => result.jobs);
          logger.info(`Scraped ${allJobs.length} total jobs for search "${savedSearch.name}"`);

          // Score jobs locally
          const scoredJobs: JobWithScore[] = allJobs
            .map(job => ({
              title: job.title,
              company: job.company,
              location: job.location,
              sourceUrl: job.sourceUrl,
              source: job.source,
              score: scoreJobLocally(job, {
                skills: savedSearch.keywords || [],
                experience: [],
                education: [],
                titles: [],
                seniority: savedSearch.experienceLevel || 'MID',
                industries: [],
                techStack: savedSearch.keywords || [],
                languages: [],
                softSkills: [],
                certifications: [],
                summary: '',
              } as any, {
                minScore: savedSearch.minScore || 0,
                experienceLevel: savedSearch.experienceLevel,
                location: savedSearch.location,
              }).score,
            }))
            .filter(item => item.score >= (savedSearch.minScore || 0))
            .sort((a, b) => b.score - a.score);

          const newJobCount = scoredJobs.length;
          const totalFound = allJobs.length;

          logger.info(`Found ${newJobCount} new matching jobs for search "${savedSearch.name}"`, {
            savedSearchId: savedSearch.id,
            newJobs: newJobCount,
            totalJobs: totalFound,
          });

          // Update saved search metadata
          await (prisma as any).savedSearch.update({
            where: { id: savedSearch.id },
            data: {
              lastRunAt: new Date(),
              totalJobsFound: totalFound,
              newJobsSinceNotify: newJobCount,
            },
          });

          // Send notification email if enabled and new jobs found
          if (savedSearch.notifyEmail && newJobCount > 0) {
            // Get user email from database (assuming there's a User model with email)
            // For now, we'll need to fetch the user separately
            const user = await (prisma as any).user.findUnique({
              where: { id: savedSearch.userId },
              select: { email: true },
            });

            if (user?.email) {
              await this.sendSearchNotificationEmail(
                savedSearch.userId,
                savedSearch,
                scoredJobs.slice(0, 20) // Top 20 jobs
              );
            } else {
              logger.warn(`User email not found for saved search`, {
                savedSearchId: savedSearch.id,
                userId: savedSearch.userId,
              });
            }
          }
        } catch (error) {
          logger.error(`Error processing saved search`, {
            error,
            savedSearchId: savedSearch?.id,
            userId: savedSearch?.userId,
          });
          // Continue with next search on error
        }
      }

      logger.info('Saved search runner completed');
    } catch (error) {
      logger.error('Fatal error in saved search runner', { error });
    }
  }

  /**
   * Send a notification email to the user with new matching jobs.
   * Email is in Hebrew with job details and scores.
   */
  async sendSearchNotificationEmail(
    userId: string,
    savedSearch: any,
    newJobs: JobWithScore[]
  ): Promise<boolean> {
    try {
      if (!this.emailTransporter) {
        logger.warn('Email transporter not initialized, skipping notification');
        return false;
      }

      // Fetch user email
      const user = await (prisma as any).user.findUnique({
        where: { id: userId },
        select: { email: true, name: true },
      });

      if (!user?.email) {
        logger.warn(`Cannot send notification: user email not found`, { userId });
        return false;
      }

      // Build HTML email in Hebrew
      const jobListHTML = newJobs
        .map(
          job => `
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 12px; text-align: right;">
            <strong>${job.title}</strong><br/>
            <span style="color: #666;">${job.company}</span><br/>
            <span style="color: #999; font-size: 0.9em;">${job.location}</span>
          </td>
          <td style="padding: 12px; text-align: center;">
            <strong style="font-size: 1.2em; color: #2ecc71;">${job.score}</strong>
          </td>
          <td style="padding: 12px; text-align: center;">
            <a href="${job.sourceUrl}" target="_blank" style="color: #3498db; text-decoration: none;">
              צפייה →
            </a>
          </td>
        </tr>
      `
        )
        .join('');

      const htmlContent = `
        <!DOCTYPE html>
        <html dir="rtl" lang="he">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        </head>
        <body style="font-family: Arial, sans-serif; background-color: #f5f5f5; padding: 20px;">
          <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h2 style="color: #333; text-align: right;">
              🎯 חיפוש שמור: ${savedSearch.name}
            </h2>

            <p style="color: #666; text-align: right; font-size: 0.95em;">
              שלום ${user.name || 'חוקר העבודה'},
            </p>

            <p style="color: #666; text-align: right;">
              נמצאו <strong>${newJobs.length}</strong> משרות חדשות התואמות את החיפוש השמור שלך!
            </p>

            <table style="width: 100%; margin: 20px 0; border-collapse: collapse;">
              <thead>
                <tr style="background-color: #f8f9fa; border-bottom: 2px solid #3498db;">
                  <th style="padding: 12px; text-align: right; color: #333;">משרה</th>
                  <th style="padding: 12px; text-align: center; color: #333;">ניקוד</th>
                  <th style="padding: 12px; text-align: center; color: #333;">לפרטים</th>
                </tr>
              </thead>
              <tbody>
                ${jobListHTML}
              </tbody>
            </table>

            <p style="color: #666; text-align: right; font-size: 0.9em;">
              <strong>פילטרים יעילים:</strong><br/>
              ${savedSearch.keywords?.length > 0 ? `מילות חיפוש: ${savedSearch.keywords.join(', ')}<br/>` : ''}
              ${savedSearch.location ? `מיקום: ${savedSearch.location}<br/>` : ''}
              ${savedSearch.experienceLevel ? `רמת חוויה: ${savedSearch.experienceLevel}<br/>` : ''}
            </p>

            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />

            <p style="color: #999; text-align: center; font-size: 0.85em;">
              אם לא רוצה להמשיך לקבל עדכונים, בואו לעדכן את העדפות ההודעות שלך.
            </p>

            <p style="color: #999; text-align: center; font-size: 0.85em; margin-top: 10px;">
              © JobHunter AI
            </p>
          </div>
        </body>
        </html>
      `;

      const mailOptions = {
        from: config.email?.from || 'noreply@jobhunter.ai',
        to: user.email,
        subject: `🎯 עדכון חיפוש: ${newJobs.length} משרות חדשות - ${savedSearch.name}`,
        html: htmlContent,
      };

      // Send email
      const info = await this.emailTransporter.sendMail(mailOptions);

      logger.info(`Notification email sent`, {
        userId,
        savedSearchId: savedSearch.id,
        userEmail: user.email,
        messageId: info.messageId,
        jobCount: newJobs.length,
      });

      // Update lastNotifiedAt
      await (prisma as any).savedSearch.update({
        where: { id: savedSearch.id },
        data: { lastNotifiedAt: new Date() },
      });

      return true;
    } catch (error) {
      logger.error('Error sending search notification email', {
        error,
        userId,
        savedSearchId: savedSearch?.id,
      });
      return false;
    }
  }
}

// Export singleton instance
export const savedSearchRunnerService = new SavedSearchRunnerService();

export default SavedSearchRunnerService;
