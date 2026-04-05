import nodemailer, { Transporter } from 'nodemailer';
import logger from './logger';
import config from '../config';
import { EmailData } from '../types';

let transporter: Transporter | null = null;

export const getEmailTransporter = (): Transporter => {
  if (transporter) {
    return transporter;
  }

  if (config.email.service === 'gmail') {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: config.email.user,
        pass: config.email.password,
      },
    });
  } else {
    transporter = nodemailer.createTransport({
      host: config.email.smtp.host,
      port: config.email.smtp.port,
      secure: config.email.smtp.port === 465,
      auth: {
        user: config.email.user,
        pass: config.email.password,
      },
    });
  }

  return transporter;
};

export const sendEmail = async (emailData: EmailData): Promise<boolean> => {
  try {
    const transporter = getEmailTransporter();

    const mailOptions = {
      from: config.email.from,
      to: emailData.to,
      subject: emailData.subject,
      html: emailData.html,
      text: emailData.text,
      attachments: emailData.attachments,
    };

    await transporter.sendMail(mailOptions);
    logger.info(`Email sent to ${emailData.to}`, { subject: emailData.subject });
    return true;
  } catch (error) {
    logger.error('Failed to send email:', error);
    return false;
  }
};

export const sendApplicationConfirmation = async (
  to: string,
  applicationData: {
    jobTitle: string;
    company: string;
    appliedAt: string;
  }
): Promise<boolean> => {
  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2>Application Confirmation</h2>
      <p>Your application for <strong>${applicationData.jobTitle}</strong> at <strong>${applicationData.company}</strong> has been submitted.</p>
      <p><strong>Applied at:</strong> ${applicationData.appliedAt}</p>
      <p>We'll keep you updated on the status of your application.</p>
      <br/>
      <p>Best regards,<br/>JobHunter AI Team</p>
    </div>
  `;

  return sendEmail({
    to,
    subject: `Application Confirmation: ${applicationData.jobTitle} at ${applicationData.company}`,
    html,
  });
};

export const sendFollowUpReminder = async (
  to: string,
  followUpData: {
    jobTitle: string;
    company: string;
    followUpType: string;
    scheduledAt: string;
  }
): Promise<boolean> => {
  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2>Follow-up Reminder</h2>
      <p>Time for your ${followUpData.followUpType.toLowerCase()} follow-up for your application at <strong>${followUpData.company}</strong>.</p>
      <p><strong>Position:</strong> ${followUpData.jobTitle}</p>
      <p><strong>Scheduled at:</strong> ${followUpData.scheduledAt}</p>
      <p>Login to JobHunter AI to send your follow-up message.</p>
      <br/>
      <p>Best regards,<br/>JobHunter AI Team</p>
    </div>
  `;

  return sendEmail({
    to,
    subject: `Follow-up Reminder: ${followUpData.jobTitle} at ${followUpData.company}`,
    html,
  });
};

export const sendInterviewInvitation = async (
  to: string,
  interviewData: {
    jobTitle: string;
    company: string;
    interviewDate: string;
    interviewType: string;
  }
): Promise<boolean> => {
  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2>Interview Invitation</h2>
      <p>Great news! You've been invited to an interview for the position of <strong>${interviewData.jobTitle}</strong> at <strong>${interviewData.company}</strong>.</p>
      <p><strong>Interview Type:</strong> ${interviewData.interviewType}</p>
      <p><strong>Scheduled Date:</strong> ${interviewData.interviewDate}</p>
      <p>Log in to JobHunter AI to view your interview preparation materials and more details.</p>
      <br/>
      <p>Best regards,<br/>JobHunter AI Team</p>
    </div>
  `;

  return sendEmail({
    to,
    subject: `Interview Invitation: ${interviewData.jobTitle} at ${interviewData.company}`,
    html,
  });
};

export const verifyEmailConnection = async (): Promise<boolean> => {
  try {
    const transporter = getEmailTransporter();
    await transporter.verify();
    logger.info('Email connection verified');
    return true;
  } catch (error) {
    logger.error('Email connection failed:', error);
    return false;
  }
};
