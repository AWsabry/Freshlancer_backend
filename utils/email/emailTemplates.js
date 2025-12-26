const { BRAND_COLORS } = require('./emailConstants');
const {
  createEmailWrapper,
  createEmailButton,
  createHeader,
  createGreeting,
  createParagraph,
  createFeaturesList,
  createSecurityNote,
  createInfoBox,
  createDataTable,
} = require('./emailHelpers');

/**
 * Email templates organized by type
 */
const EMAIL_TEMPLATES = {
  /**
   * Welcome email template
   */
  welcome: {
    student: (options) => {
      const features = [
        { icon: '📝', text: 'Create and offer your services' },
        { icon: '💼', text: 'Apply for job postings from clients' },
        { icon: '💰', text: 'Set your own rates and earn money' },
        { icon: '⭐', text: 'Build your reputation with reviews' },
        { icon: '🌟', text: 'Showcase your portfolio and skills' }
      ];

      return {
        subject: 'Welcome to Freshlancer - Start Your Freelancing Journey! 🎓',
        content: createEmailWrapper(`
          ${createHeader('Welcome to Freshlancer! 🎉')}
          ${createGreeting(options.name)}
          ${createParagraph('Congratulations on joining Freshlancer! We\'re thrilled to have you as part of our community of talented students. This is your gateway to showcasing your skills, connecting with clients worldwide, and building your freelancing career.')}
          ${createFeaturesList(features)}
          <p style="color: ${BRAND_COLORS.text}; font-size: 17px; line-height: 1.7; margin: 45px 0 30px 0; text-align: center; font-weight: 500;">
            Ready to get started? Verify your email address to unlock all features:
          </p>
          ${createEmailButton(options.verificationUrl, 'Verify My Email Address')}
          ${createSecurityNote(10)}
          <p style="color: ${BRAND_COLORS.textLight}; font-size: 15px; line-height: 1.7; margin: 30px 0 0 0; text-align: center;">
            Questions? Our support team is here to help you succeed! 💪
          </p>
        `, BRAND_COLORS.primary)
      };
    },
    client: (options) => {
      const features = [
        { icon: '📋', text: 'Post job opportunities for students' },
        { icon: '🔍', text: 'Browse student services and portfolios' },
        { icon: '👥', text: 'Hire talented students for your projects' },
        { icon: '⚡', text: 'Get quality work done quickly and affordably' },
        { icon: '📊', text: 'Manage multiple projects and freelancers' }
      ];

      return {
        subject: 'Welcome to Freshlancer - Find Amazing Student Talent! 💼',
        content: createEmailWrapper(`
          ${createHeader('Welcome to Freshlancer! 🎉')}
          ${createGreeting(options.name)}
          ${createParagraph('Thank you for joining Freshlancer! We\'re excited to help you connect with talented students and get your projects completed by skilled professionals at competitive rates. Your journey to finding the perfect talent starts here.')}
          ${createFeaturesList(features)}
          <p style="color: ${BRAND_COLORS.text}; font-size: 17px; line-height: 1.7; margin: 45px 0 30px 0; text-align: center; font-weight: 500;">
            Ready to start hiring? Verify your email address to unlock all features:
          </p>
          ${createEmailButton(options.verificationUrl, 'Verify My Email Address')}
          ${createSecurityNote(10)}
          <p style="color: ${BRAND_COLORS.textLight}; font-size: 15px; line-height: 1.7; margin: 30px 0 0 0; text-align: center;">
            Questions? Our support team is here to help you succeed! 💪
          </p>
        `, BRAND_COLORS.primary)
      };
    }
  },

  /**
   * Password reset email template
   */
  'password-reset': (options) => {
    const securityInfo = [
      'This link expires in <strong style="color: ' + BRAND_COLORS.primary + ';">10 minutes</strong>',
      'The link can only be used once',
      'If you didn\'t request this, please ignore this email'
    ];

    return {
      subject: 'Freshlancer - Reset Your Password 🔐',
      content: createEmailWrapper(`
        ${createHeader('Reset Your Password 🔐')}
        ${createGreeting(options.name)}
        ${createParagraph('We received a request to reset the password for your Freshlancer account. If you made this request, click the button below to set a new password.')}
        ${createEmailButton(options.resetUrl, 'Reset My Password')}
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 40px 0;">
          <tr>
            <td style="padding: 20px 0; border-top: 1px solid ${BRAND_COLORS.primary}20; border-bottom: 1px solid ${BRAND_COLORS.primary}20;">
              <p style="margin: 0 0 15px 0; color: ${BRAND_COLORS.primary}; font-size: 16px; font-weight: 600; text-align: center;">
                ⚠️ Important Security Information
              </p>
              ${createInfoBox(securityInfo)}
            </td>
          </tr>
        </table>
        <p style="color: ${BRAND_COLORS.textLight}; font-size: 15px; line-height: 1.7; margin: 30px 0 0 0; text-align: center;">
          If you didn't request a password reset, you can safely ignore this email. Your account remains secure.
        </p>
      `, BRAND_COLORS.primary)
    };
  },

  /**
   * Resend verification email template
   */
  'resend-verification': (options) => {
    const reminderInfo = [
      'This link expires in <strong style="color: ' + BRAND_COLORS.primary + ';">10 minutes</strong>',
      'Previous verification links are now invalid',
      'Verify your email to access all features'
    ];

    return {
      subject: 'Freshlancer - New Email Verification Link 📧',
      content: createEmailWrapper(`
        ${createHeader('New Verification Link 📧')}
        ${createGreeting(options.name)}
        ${createParagraph('You requested a new email verification link for your Freshlancer account. No problem! Here\'s your fresh verification link to get you started.')}
        ${createEmailButton(options.verificationUrl, 'Verify My Email Address')}
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 40px 0;">
          <tr>
            <td style="padding: 20px 0; border-top: 1px solid ${BRAND_COLORS.primary}20; border-bottom: 1px solid ${BRAND_COLORS.primary}20;">
              <p style="margin: 0 0 15px 0; color: ${BRAND_COLORS.primary}; font-size: 16px; font-weight: 600; text-align: center;">
                📋 Quick Reminder
              </p>
              ${createInfoBox(reminderInfo)}
            </td>
          </tr>
        </table>
        <p style="color: ${BRAND_COLORS.textLight}; font-size: 15px; line-height: 1.7; margin: 30px 0 0 0; text-align: center;">
          If you continue to have issues, please contact our support team for assistance.
        </p>
      `, BRAND_COLORS.primary)
    };
  },

  /**
   * Job application notification email template
   */
  'job-application': (options) => {
    const data = [
      { label: 'Student', value: 'A Student' },
      { label: 'Job Post', value: options.jobTitle },
      { label: 'Applied', value: new Date().toLocaleDateString() }
    ];

    return {
      subject: `New Application for "${options.jobTitle}" 💼`,
      content: createEmailWrapper(`
        ${createHeader('New Application! 🎉')}
        ${createGreeting(options.name)}
        ${createParagraph(`Great news! A talented student has applied for your job post "<strong style="color: ${BRAND_COLORS.primary};">${options.jobTitle}</strong>". Review their application and profile to make your decision.`)}
        ${createDataTable(data)}
        <p style="color: ${BRAND_COLORS.text}; font-size: 16px; line-height: 1.7; margin: 40px 0 30px 0; text-align: center;">
          Review the application and make your decision:
        </p>
        ${createEmailButton(options.applicationUrl || '#', 'Review Application')}
      `, BRAND_COLORS.primary)
    };
  },

  /**
   * Application status update email template
   */
  'application-status-update': (options) => {
    const statusEmojis = {
      reviewed: '👀',
      accepted: '✅',
      rejected: '❌',
    };

    const emoji = statusEmojis[options.newStatus] || '📝';
    const statusText = options.newStatus.charAt(0).toUpperCase() + options.newStatus.slice(1);

    const data = [
      { label: 'Job', value: options.jobTitle },
      { label: 'Status', value: statusText }
    ];

    if (options.feedback) {
      data.push({ label: 'Feedback', value: options.feedback });
    }

    let statusMessage = '';
    if (options.newStatus === 'accepted') {
      statusMessage = `
        <p style="color: ${BRAND_COLORS.primary}; font-size: 17px; font-weight: 600; line-height: 1.7; margin: 40px 0; text-align: center; padding: 25px; background: linear-gradient(135deg, ${BRAND_COLORS.primary}08 0%, ${BRAND_COLORS.primaryLight}05 100%); border-radius: 12px;">
          🎉 Congratulations! The client has accepted your application. They will be in touch with you soon to discuss the next steps.
        </p>
      `;
    } else if (options.newStatus === 'rejected') {
      statusMessage = `
        <p style="color: ${BRAND_COLORS.text}; font-size: 16px; line-height: 1.8; margin: 40px 0; text-align: center;">
          Thank you for your interest. While this opportunity didn't work out, don't get discouraged! Keep applying to other jobs that match your skills.
        </p>
      `;
    } else {
      statusMessage = `
        <p style="color: ${BRAND_COLORS.text}; font-size: 16px; line-height: 1.8; margin: 40px 0; text-align: center;">
          The client has reviewed your application. Please check your Freshlancer dashboard for any additional communications.
        </p>
      `;
    }

    return {
      subject: `Application Update: ${statusText} ${emoji}`,
      content: createEmailWrapper(`
        ${createHeader(`Application Update ${emoji}`)}
        ${createGreeting(options.name)}
        ${createParagraph(`We have an update regarding your application for "<strong style="color: ${BRAND_COLORS.primary};">${options.jobTitle}</strong>".`)}
        ${createDataTable(data)}
        ${statusMessage}
        ${createEmailButton(options.dashboardUrl || '#', 'View Dashboard')}
      `, BRAND_COLORS.primary)
    };
  }
};

/**
 * Get email template by type
 * @param {string} type - Email type
 * @param {Object} options - Email options
 * @returns {Object} Email template with subject and content
 */
const getEmailTemplate = (type, options) => {
  if (type === 'welcome') {
    const role = options.userRole || 'student';
    const template = EMAIL_TEMPLATES.welcome[role];
    if (!template) {
      throw new Error(`Welcome email template not found for role: ${role}`);
    }
    return template(options);
  }

  const template = EMAIL_TEMPLATES[type];
  if (!template) {
    throw new Error(`Email template not found for type: ${type}`);
  }

  return typeof template === 'function' ? template(options) : template;
};

module.exports = {
  EMAIL_TEMPLATES,
  getEmailTemplate,
};

