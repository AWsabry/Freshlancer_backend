const nodemailer = require('nodemailer');
const logger = require('../logger');
const { handleNetworkError } = require('../networkErrorHandler');
const AppError = require('../AppError');

let transporter = null;

/**
 * Create and cache email transporter (singleton pattern)
 * @returns {Promise<Object>} Nodemailer transporter instance
 */
const createTransporter = async () => {
  // Return cached transporter if it exists
  if (transporter) {
    return transporter;
  }

  try {
    // Check if real SMTP credentials are configured
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      // Use real SMTP service
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true', // true for 465 (SSL), false for 587 (STARTTLS)
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
        requireTLS: process.env.SMTP_SECURE !== 'true', // Require TLS when using STARTTLS
        connectionTimeout: 10000, // 10 seconds connection timeout
        greetingTimeout: 5000, // 5 seconds greeting timeout
        socketTimeout: 10000, // 10 seconds socket timeout
      });
      
      logger.info('📧 Using configured SMTP service:', process.env.SMTP_HOST);
    } else {
      // Fallback to Ethereal Email for development/testing
      logger.warn('⚠️  No SMTP configuration found. Using Ethereal Email (testing service).');
      logger.warn('⚠️  Emails will NOT be sent to real addresses. Check server console for preview URLs.');
      logger.warn('⚠️  To send real emails, configure SMTP_HOST, SMTP_USER, and SMTP_PASS in config.env');
      
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
    }

    return transporter;
  } catch (error) {
    logger.error('Failed to create email transporter:', error);
    throw handleNetworkError(error, 'Email Service (SMTP)');
  }
};

/**
 * Log email sending result
 * @param {Object} info - Nodemailer send result
 * @param {string} email - Recipient email
 */
const logEmailResult = (info, email) => {
  if (process.env.SMTP_HOST) {
    logger.info('✅ Email sent successfully via SMTP:', info.messageId);
    logger.info('📧 To:', email);
  } else {
    logger.info('📧 Email preview created (Ethereal Email - NOT sent to real address):', info.messageId);
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      logger.info('🔗 Preview URL:', previewUrl);
    }
    logger.warn('⚠️  IMPORTANT: This is a test email. Configure SMTP settings to send real emails.');
  }
};

module.exports = {
  createTransporter,
  logEmailResult,
};

