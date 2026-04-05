import Queue from 'bull';
import nodemailer from 'nodemailer';
import logger from '../../utils/logger';
import config from '../../config';

interface EmailJobData {
  to: string;
  subject: string;
  body: string;
  htmlBody?: string;
  attachments?: Array<{
    filename: string;
    path?: string;
    content?: Buffer;
  }>;
  userId: string;
  applicationId?: string;
}

// Initialize email transporter
const transporter = nodemailer.createTransport({
  host: config.email?.host || 'smtp.gmail.com',
  port: config.email?.port || 587,
  secure: config.email?.secure || false,
  auth: {
    user: config.email?.user,
    pass: config.email?.password,
  },
});

export const setupEmailProcessor = (queue: Queue.Queue<EmailJobData>) => {
  queue.process(5, async (job) => {
    try {
      logger.info(`Processing email job ${job.id}`, {
        to: job.data.to,
        subject: job.data.subject,
        userId: job.data.userId,
      });

      const mailOptions = {
        from: config.email?.fromAddress || 'noreply@jobhunter.ai',
        to: job.data.to,
        subject: job.data.subject,
        text: job.data.body,
        html: job.data.htmlBody || job.data.body,
        attachments: job.data.attachments || [],
      };

      // Send email
      const info = await transporter.sendMail(mailOptions);

      logger.info(`Email sent successfully`, {
        messageId: info.messageId,
        to: job.data.to,
        subject: job.data.subject,
      });

      return {
        success: true,
        messageId: info.messageId,
        to: job.data.to,
        subject: job.data.subject,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error(`Error processing email job ${job.id}:`, error);
      throw error;
    }
  });
};

export const sendEmail = async (data: EmailJobData) => {
  try {
    const mailOptions = {
      from: config.email?.fromAddress || 'noreply@jobhunter.ai',
      to: data.to,
      subject: data.subject,
      text: data.body,
      html: data.htmlBody || data.body,
      attachments: data.attachments || [],
    };

    const info = await transporter.sendMail(mailOptions);

    logger.info('Email sent directly', {
      messageId: info.messageId,
      to: data.to,
      subject: data.subject,
    });

    return {
      success: true,
      messageId: info.messageId,
      response: info.response,
    };
  } catch (error) {
    logger.error('Error sending email:', error);
    throw error;
  }
};

export default setupEmailProcessor;
