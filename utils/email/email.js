const { EMAIL_DOMAIN } = require('./emailConstants');
const { getEmailTemplate } = require('./emailTemplates');
const { createTransporter, logEmailResult } = require('./emailTransporter');
const logger = require('../logger');

/**
 * Send email using templates
 * @param {Object} options - Email options
 * @param {string} options.type - Email type (welcome, password-reset, etc.)
 * @param {string} options.email - Recipient email
 * @param {string} options.name - Recipient name
 * @param {string} options.userRole - User role (student/client) for welcome emails
 * @param {string} options.subject - Custom subject (optional)
 * @param {string} options.message - Plain text message (optional)
 * @param {string} options.verificationUrl - Verification URL (for welcome/resend-verification)
 * @param {string} options.resetUrl - Password reset URL (for password-reset)
 * @param {string} options.jobTitle - Job title (for job-application)
 * @param {string} options.applicationUrl - Application URL (for job-application)
 * @param {string} options.newStatus - Application status (for application-status-update)
 * @param {string} options.feedback - Feedback message (for application-status-update)
 * @param {string} options.dashboardUrl - Dashboard URL (for application-status-update)
 * @returns {Promise<Object>} Email send result
 */
const sendEmail = async (options) => {
  try {
    // Get transporter (singleton)
    const transporter = await createTransporter();

    // Get email template
    const template = getEmailTemplate(options.type, options);

    // Build email options
    const mailOptions = {
      from: `Freshlancer Team<${process.env.SMTP_USER || `noreply@${EMAIL_DOMAIN}`}>`,
      to: options.email,
      subject: template.subject || options.subject,
      text: options.message || 'Please view this email in an HTML-capable email client.',
      html: template.content,
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);

    // Log result
    logEmailResult(info, options.email);

    return info;
  } catch (error) {
    logger.error('Error sending email:', error);
    throw new Error('Failed to send email');
  }
};

module.exports = sendEmail;
