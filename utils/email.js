const nodemailer = require('nodemailer');

// Brand colors - matching Freshlancer frontend
const BRAND_COLORS = {
  primary: '#0284c7', // primary-600
  primaryLight: '#0ea5e9', // primary-500
  primaryDark: '#0369a1', // primary-700
  secondary: '#e5e7eb', // gray-200
  text: '#111827', // gray-900
  textLight: '#6b7280', // gray-500
  background: '#f9fafb', // gray-50
  white: '#ffffff',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#0284c7',
};

// Logo URL - Loaded from environment variable in config.env
// Trims whitespace to handle any formatting issues
const LOGO_URL = (process.env.EMAIL_LOGO_URL && process.env.EMAIL_LOGO_URL.trim()) || 'https://via.placeholder.com/200x60/0284c7/ffffff?text=Freshlancer';

// Email domain - Loaded from environment variable in config.env
// Used for support email and default noreply email
const EMAIL_DOMAIN = (process.env.EMAIL_DOMAIN && process.env.EMAIL_DOMAIN.trim()) || 'freshlancer.com';

// Helper function to create Outlook-compatible email buttons
const createEmailButton = (href, text, primaryColor = BRAND_COLORS.primary, primaryLight = BRAND_COLORS.primaryLight) => {
  return `
    <div style="text-align: center; margin: 45px 0;">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:55px;v-text-anchor:middle;width:250px;" arcsize="15%" stroke="f" fillcolor="${primaryColor}">
        <w:anchorlock/>
        <center style="color:${BRAND_COLORS.white};font-family:sans-serif;font-size:17px;font-weight:600;">${text}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-- -->
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
        <tr>
          <td style="background: ${primaryColor}; border-radius: 12px; padding: 0;">
            <a href="${href}" 
               style="display: inline-block; background: linear-gradient(135deg, ${primaryColor} 0%, ${primaryLight} 100%); background-color: ${primaryColor}; color: ${BRAND_COLORS.white}; padding: 18px 50px; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 17px; box-shadow: 0 8px 20px ${primaryColor}40; -webkit-text-size-adjust: none; mso-hide: all;">
              ${text}
            </a>
          </td>
        </tr>
      </table>
      <!--<![endif]-->
    </div>
  `;
};

// Helper function to create email wrapper with consistent branding
// primaryColorOverride allows using different primary colors for client vs student
const createEmailWrapper = (content, primaryColorOverride = null) => {
  const primaryColor = primaryColorOverride || BRAND_COLORS.primary;
  const primaryLight = primaryColorOverride || BRAND_COLORS.primaryLight;
  const primaryDark = primaryColorOverride || BRAND_COLORS.primaryDark;
  
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Freshlancer</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif; background: linear-gradient(135deg, ${primaryColor}08 0%, ${primaryLight}05 100%);">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background: linear-gradient(135deg, ${primaryColor}08 0%, ${primaryLight}05 100%);">
        <tr>
          <td align="center" style="padding: 50px 20px;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: ${BRAND_COLORS.white}; border-radius: 20px; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1); overflow: hidden;">
              <!-- Elegant Header -->
              <tr>
                <td style="background: linear-gradient(135deg, ${primaryColor} 0%, ${primaryLight} 50%, ${primaryDark} 100%); padding: 50px 40px; text-align: center; position: relative;">
                  <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: url('data:image/svg+xml,%3Csvg width=\\'60\\' height=\\'60\\' viewBox=\\'0 0 60 60\\' xmlns=\\'http://www.w3.org/2000/svg\\'%3E%3Cg fill=\\'none\\' fill-rule=\\'evenodd\\'%3E%3Cg fill=\\'%23ffffff\\' fill-opacity=\\'0.1\\'%3E%3Cpath d=\\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E') repeat; opacity: 0.3;"></div>
                  <div style="position: relative; z-index: 1;">
                    <img src="${LOGO_URL}" alt="Freshlancer Logo" style="max-width: 220px; height: auto; margin-bottom: 20px; filter: brightness(0) invert(1);" />
                    <div style="height: 4px; background: linear-gradient(90deg, transparent, ${BRAND_COLORS.white}40, transparent); margin-top: 25px; border-radius: 2px;"></div>
                  </div>
                </td>
              </tr>
              <!-- Content -->
              <tr>
                <td style="padding: 50px 40px;">
                  ${content}
                </td>
              </tr>
              <!-- Elegant Footer -->
              <tr>
                <td style="background-color: ${BRAND_COLORS.white}; padding: 40px; text-align: center; border-top: 1px solid ${primaryColor}15;">
                  <p style="margin: 0 0 12px 0; color: ${primaryColor}; font-size: 16px; font-weight: 600; line-height: 1.6;">
                    Freshlancer
                  </p>
                  <p style="margin: 0 0 20px 0; color: ${BRAND_COLORS.textLight}; font-size: 14px; line-height: 1.6;">
                    Connecting Talented Students with Global Opportunities
                  </p>
                  <div style="border-top: 1px solid ${primaryColor}15; padding-top: 25px; margin-top: 25px;">
                    <p style="margin: 0 0 15px 0; color: ${BRAND_COLORS.textLight}; font-size: 12px;">
                      © ${new Date().getFullYear()} Freshlancer. All rights reserved.
                    </p>
                    <p style="margin: 0; color: ${BRAND_COLORS.textLight}; font-size: 13px;">
                      <a href="${process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? 'https://freshlancer.online' : 'http://localhost:3000')}" style="color: ${primaryColor}; text-decoration: none; font-weight: 500; margin: 0 10px;">Visit Website</a>
                      <span style="color: ${primaryColor}40;">|</span>
                      <a href="mailto:support@${EMAIL_DOMAIN}" style="color: ${primaryColor}; text-decoration: none; font-weight: 500; margin: 0 10px;">Support</a>
                    </p>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
};

const sendEmail = async (options) => {
 
  try {
    let transporter;

    // Check if real SMTP credentials are configured
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {

     
      // Use real SMTP service (Gmail, Outlook, SendGrid, Hostinger, etc.)
      // secure: true = SSL/TLS on port 465 (implicit encryption)
      // secure: false = STARTTLS on port 587 (upgrades to TLS after connection)
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true' || false, // true for 465 (SSL), false for 587 (STARTTLS)
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
        // STARTTLS is automatically used when secure=false
        requireTLS: process.env.SMTP_SECURE !== 'true', // Require TLS when using STARTTLS
        
      });
      console.log('📧 Using configured SMTP service:', process.env.SMTP_HOST);
    } else {
      // Fallback to Ethereal Email for development/testing
      console.log('⚠️  No SMTP configuration found. Using Ethereal Email (testing service).');
      console.log('⚠️  Emails will NOT be sent to real addresses. Check server console for preview URLs.');
      console.log('⚠️  To send real emails, configure SMTP_HOST, SMTP_USER, and SMTP_PASS in config.env');
      
      let testAccount = await nodemailer.createTestAccount();
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

    // Generate dynamic content based on email type and user role
    let emailContent = '';
    let emailSubject = options.subject;
    if (options.type === 'welcome') {
      if (options.userRole === 'student') {
        console.log('student');
        emailSubject = 'Welcome to Freshlancer - Start Your Freelancing Journey! 🎓';
        emailContent = createEmailWrapper(`
          <div style="text-align: center; margin-bottom: 40px;">
            <h1 style="color: ${BRAND_COLORS.primary}; font-size: 32px; font-weight: 700; margin: 0 0 15px 0; line-height: 1.2; letter-spacing: -0.5px;">
              Welcome to Freshlancer! 🎉
            </h1>
            <div style="width: 60px; height: 4px; background: linear-gradient(90deg, ${BRAND_COLORS.primary}, ${BRAND_COLORS.primaryLight}); margin: 0 auto; border-radius: 2px;"></div>
          </div>
          
          <p style="color: ${BRAND_COLORS.text}; font-size: 18px; line-height: 1.7; margin: 0 0 25px 0; font-weight: 500;">
            Hi ${options.name || 'there'},
          </p>
          <p style="color: ${BRAND_COLORS.text}; font-size: 16px; line-height: 1.8; margin: 0 0 40px 0;">
            Congratulations on joining Freshlancer! We're thrilled to have you as part of our community of talented students. This is your gateway to showcasing your skills, connecting with clients worldwide, and building your freelancing career.
          </p>
          
          <div style="margin: 45px 0;">
            <h3 style="color: ${BRAND_COLORS.primary}; font-size: 22px; font-weight: 600; margin: 0 0 25px 0; text-align: center;">
              What You Can Do
            </h3>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid ${BRAND_COLORS.primary}10;">
                  <span style="color: ${BRAND_COLORS.primary}; font-size: 20px; margin-right: 12px;">📝</span>
                  <span style="color: ${BRAND_COLORS.text}; font-size: 16px; line-height: 1.6;">Create and offer your services</span>
                </td>
              </tr>
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid ${BRAND_COLORS.primary}10;">
                  <span style="color: ${BRAND_COLORS.primary}; font-size: 20px; margin-right: 12px;">💼</span>
                  <span style="color: ${BRAND_COLORS.text}; font-size: 16px; line-height: 1.6;">Apply for job postings from clients</span>
                </td>
              </tr>
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid ${BRAND_COLORS.primary}10;">
                  <span style="color: ${BRAND_COLORS.primary}; font-size: 20px; margin-right: 12px;">💰</span>
                  <span style="color: ${BRAND_COLORS.text}; font-size: 16px; line-height: 1.6;">Set your own rates and earn money</span>
                </td>
              </tr>
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid ${BRAND_COLORS.primary}10;">
                  <span style="color: ${BRAND_COLORS.primary}; font-size: 20px; margin-right: 12px;">⭐</span>
                  <span style="color: ${BRAND_COLORS.text}; font-size: 16px; line-height: 1.6;">Build your reputation with reviews</span>
                </td>
              </tr>
              <tr>
                <td style="padding: 12px 0;">
                  <span style="color: ${BRAND_COLORS.primary}; font-size: 20px; margin-right: 12px;">🌟</span>
                  <span style="color: ${BRAND_COLORS.text}; font-size: 16px; line-height: 1.6;">Showcase your portfolio and skills</span>
                </td>
              </tr>
            </table>
          </div>
          
          <p style="color: ${BRAND_COLORS.text}; font-size: 17px; line-height: 1.7; margin: 45px 0 30px 0; text-align: center; font-weight: 500;">
            Ready to get started? Verify your email address to unlock all features:
          </p>
          
          ${createEmailButton(options.verificationUrl, 'Verify My Email Address', BRAND_COLORS.primary, BRAND_COLORS.primaryLight)}
          
          <p style="color: ${BRAND_COLORS.textLight}; font-size: 14px; line-height: 1.7; margin: 35px 0 0 0; text-align: center; padding-top: 30px; border-top: 1px solid ${BRAND_COLORS.primary}10;">
            <span style="color: ${BRAND_COLORS.primary}; font-weight: 500;">⏰ Security Note:</span> This verification link expires in <strong style="color: ${BRAND_COLORS.primary};">10 minutes</strong> for your security.
          </p>
          
          <p style="color: ${BRAND_COLORS.textLight}; font-size: 15px; line-height: 1.7; margin: 30px 0 0 0; text-align: center;">
            Questions? Our support team is here to help you succeed! 💪
          </p>
        `, BRAND_COLORS.primary);
      } else {
        console.log('client');
        emailSubject = 'Welcome to Freshlancer - Find Amazing Student Talent! 💼';
        emailContent = createEmailWrapper(`
          <div style="text-align: center; margin-bottom: 40px;">
            <h1 style="color: ${BRAND_COLORS.primary}; font-size: 32px; font-weight: 700; margin: 0 0 15px 0; line-height: 1.2; letter-spacing: -0.5px;">
              Welcome to Freshlancer! 🎉
            </h1>
            <div style="width: 60px; height: 4px; background: linear-gradient(90deg, ${BRAND_COLORS.primary}, ${BRAND_COLORS.primaryLight}); margin: 0 auto; border-radius: 2px;"></div>
          </div>
          
          <p style="color: ${BRAND_COLORS.text}; font-size: 18px; line-height: 1.7; margin: 0 0 25px 0; font-weight: 500;">
            Hello ${options.name || 'there'},
          </p>
          <p style="color: ${BRAND_COLORS.text}; font-size: 16px; line-height: 1.8; margin: 0 0 40px 0;">
            Thank you for joining Freshlancer! We're excited to help you connect with talented students and get your projects completed by skilled professionals at competitive rates. Your journey to finding the perfect talent starts here.
          </p>
          
          <div style="margin: 45px 0;">
            <h3 style="color: ${BRAND_COLORS.primary}; font-size: 22px; font-weight: 600; margin: 0 0 25px 0; text-align: center;">
              What You Can Do
            </h3>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid ${BRAND_COLORS.primary}10;">
                  <span style="color: ${BRAND_COLORS.primary}; font-size: 20px; margin-right: 12px;">📋</span>
                  <span style="color: ${BRAND_COLORS.text}; font-size: 16px; line-height: 1.6;">Post job opportunities for students</span>
                </td>
              </tr>
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid ${BRAND_COLORS.primary}10;">
                  <span style="color: ${BRAND_COLORS.primary}; font-size: 20px; margin-right: 12px;">🔍</span>
                  <span style="color: ${BRAND_COLORS.text}; font-size: 16px; line-height: 1.6;">Browse student services and portfolios</span>
                </td>
              </tr>
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid ${BRAND_COLORS.primary}10;">
                  <span style="color: ${BRAND_COLORS.primary}; font-size: 20px; margin-right: 12px;">👥</span>
                  <span style="color: ${BRAND_COLORS.text}; font-size: 16px; line-height: 1.6;">Hire talented students for your projects</span>
                </td>
              </tr>
              <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid ${BRAND_COLORS.primary}10;">
                  <span style="color: ${BRAND_COLORS.primary}; font-size: 20px; margin-right: 12px;">⚡</span>
                  <span style="color: ${BRAND_COLORS.text}; font-size: 16px; line-height: 1.6;">Get quality work done quickly and affordably</span>
                </td>
              </tr>
              <tr>
                <td style="padding: 12px 0;">
                  <span style="color: ${BRAND_COLORS.primary}; font-size: 20px; margin-right: 12px;">📊</span>
                  <span style="color: ${BRAND_COLORS.text}; font-size: 16px; line-height: 1.6;">Manage multiple projects and freelancers</span>
                </td>
              </tr>
            </table>
          </div>
          
          <p style="color: ${BRAND_COLORS.text}; font-size: 17px; line-height: 1.7; margin: 45px 0 30px 0; text-align: center; font-weight: 500;">
            Ready to start hiring? Verify your email address to unlock all features:
          </p>
          
          ${createEmailButton(options.verificationUrl, 'Verify My Email Address', BRAND_COLORS.primary, BRAND_COLORS.primaryLight)}
          
          <p style="color: ${BRAND_COLORS.textLight}; font-size: 14px; line-height: 1.7; margin: 35px 0 0 0; text-align: center; padding-top: 30px; border-top: 1px solid ${BRAND_COLORS.primary}10;">
            <span style="color: ${BRAND_COLORS.primary}; font-weight: 500;">⏰ Security Note:</span> This verification link expires in <strong style="color: ${BRAND_COLORS.primary};">10 minutes</strong> for your security.
          </p>
          
          <p style="color: ${BRAND_COLORS.textLight}; font-size: 15px; line-height: 1.7; margin: 30px 0 0 0; text-align: center;">
            Questions? Our support team is here to help you succeed! 💪
          </p>
        `, BRAND_COLORS.primary);
      }
    } else if (options.type === 'password-reset') {
      emailSubject = 'Freshlancer - Reset Your Password 🔐';
      emailContent = createEmailWrapper(`
        <div style="text-align: center; margin-bottom: 40px;">
          <h1 style="color: ${BRAND_COLORS.primary}; font-size: 32px; font-weight: 700; margin: 0 0 15px 0; line-height: 1.2; letter-spacing: -0.5px;">
            Reset Your Password 🔐
          </h1>
          <div style="width: 60px; height: 4px; background: linear-gradient(90deg, ${BRAND_COLORS.primary}, ${BRAND_COLORS.primaryLight}); margin: 0 auto; border-radius: 2px;"></div>
        </div>
        
        <p style="color: ${BRAND_COLORS.text}; font-size: 18px; line-height: 1.7; margin: 0 0 25px 0; font-weight: 500;">
          Hello ${options.name || 'there'},
        </p>
        <p style="color: ${BRAND_COLORS.text}; font-size: 16px; line-height: 1.8; margin: 0 0 40px 0;">
          We received a request to reset the password for your Freshlancer account. If you made this request, click the button below to set a new password.
        </p>
        
        ${createEmailButton(options.resetUrl, 'Reset My Password', BRAND_COLORS.primary, BRAND_COLORS.primaryLight)}
        
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 40px 0;">
          <tr>
            <td style="padding: 20px 0; border-top: 1px solid ${BRAND_COLORS.primary}20; border-bottom: 1px solid ${BRAND_COLORS.primary}20;">
              <p style="margin: 0 0 15px 0; color: ${BRAND_COLORS.primary}; font-size: 16px; font-weight: 600; text-align: center;">
                ⚠️ Important Security Information
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="padding: 8px 0; text-align: left;">
                    <span style="color: ${BRAND_COLORS.primary}; font-size: 14px; margin-right: 10px;">•</span>
                    <span style="color: ${BRAND_COLORS.text}; font-size: 14px; line-height: 1.7;">This link expires in <strong style="color: ${BRAND_COLORS.primary};">10 minutes</strong></span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; text-align: left;">
                    <span style="color: ${BRAND_COLORS.primary}; font-size: 14px; margin-right: 10px;">•</span>
                    <span style="color: ${BRAND_COLORS.text}; font-size: 14px; line-height: 1.7;">The link can only be used once</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; text-align: left;">
                    <span style="color: ${BRAND_COLORS.primary}; font-size: 14px; margin-right: 10px;">•</span>
                    <span style="color: ${BRAND_COLORS.text}; font-size: 14px; line-height: 1.7;">If you didn't request this, please ignore this email</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        
        <p style="color: ${BRAND_COLORS.textLight}; font-size: 15px; line-height: 1.7; margin: 30px 0 0 0; text-align: center;">
          If you didn't request a password reset, you can safely ignore this email. Your account remains secure.
        </p>
      `, BRAND_COLORS.primary);
    } else if (options.type === 'resend-verification') {
      console.log('SMTP_HOST', process.env.SMTP_HOST);
      console.log('SMTP_USER', process.env.SMTP_USER);
      console.log('SMTP_PASS', process.env.SMTP_PASS);
      console.log('verificationUrl', options.verificationUrl);
      emailSubject = 'Freshlancer - New Email Verification Link 📧';
      emailContent = createEmailWrapper(`
        <div style="text-align: center; margin-bottom: 40px;">
          <h1 style="color: ${BRAND_COLORS.primary}; font-size: 32px; font-weight: 700; margin: 0 0 15px 0; line-height: 1.2; letter-spacing: -0.5px;">
            New Verification Link 📧
          </h1>
          <div style="width: 60px; height: 4px; background: linear-gradient(90deg, ${BRAND_COLORS.primary}, ${BRAND_COLORS.primaryLight}); margin: 0 auto; border-radius: 2px;"></div>
        </div>
        
        <p style="color: ${BRAND_COLORS.text}; font-size: 18px; line-height: 1.7; margin: 0 0 25px 0; font-weight: 500;">
          Hello ${options.name || 'there'},
        </p>
        <p style="color: ${BRAND_COLORS.text}; font-size: 16px; line-height: 1.8; margin: 0 0 40px 0;">
          You requested a new email verification link for your Freshlancer account. No problem! Here's your fresh verification link to get you started.
        </p>
        
        ${createEmailButton(options.verificationUrl, 'Verify My Email Address', BRAND_COLORS.primary, BRAND_COLORS.primaryLight)}
        
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin: 40px 0;">
          <tr>
            <td style="padding: 20px 0; border-top: 1px solid ${BRAND_COLORS.primary}20; border-bottom: 1px solid ${BRAND_COLORS.primary}20;">
              <p style="margin: 0 0 15px 0; color: ${BRAND_COLORS.primary}; font-size: 16px; font-weight: 600; text-align: center;">
                📋 Quick Reminder
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="padding: 8px 0; text-align: left;">
                    <span style="color: ${BRAND_COLORS.primary}; font-size: 14px; margin-right: 10px;">•</span>
                    <span style="color: ${BRAND_COLORS.text}; font-size: 14px; line-height: 1.7;">This link expires in <strong style="color: ${BRAND_COLORS.primary};">10 minutes</strong></span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; text-align: left;">
                    <span style="color: ${BRAND_COLORS.primary}; font-size: 14px; margin-right: 10px;">•</span>
                    <span style="color: ${BRAND_COLORS.text}; font-size: 14px; line-height: 1.7;">Previous verification links are now invalid</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; text-align: left;">
                    <span style="color: ${BRAND_COLORS.primary}; font-size: 14px; margin-right: 10px;">•</span>
                    <span style="color: ${BRAND_COLORS.text}; font-size: 14px; line-height: 1.7;">Verify your email to access all features</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        
        <p style="color: ${BRAND_COLORS.textLight}; font-size: 15px; line-height: 1.7; margin: 30px 0 0 0; text-align: center;">
          If you continue to have issues, please contact our support team for assistance.
        </p>
      `, BRAND_COLORS.primary);
    } else if (options.type === 'job-application') {
      emailSubject = `New Application for "${options.jobTitle}" 💼`;
      emailContent = createEmailWrapper(`
        <div style="text-align: center; margin-bottom: 40px;">
          <h1 style="color: ${BRAND_COLORS.primary}; font-size: 32px; font-weight: 700; margin: 0 0 15px 0; line-height: 1.2; letter-spacing: -0.5px;">
            New Application! 🎉
          </h1>
          <div style="width: 60px; height: 4px; background: linear-gradient(90deg, ${BRAND_COLORS.primary}, ${BRAND_COLORS.primaryLight}); margin: 0 auto; border-radius: 2px;"></div>
        </div>
        
        <p style="color: ${BRAND_COLORS.text}; font-size: 18px; line-height: 1.7; margin: 0 0 25px 0; font-weight: 500;">
          Hello ${options.name},
        </p>
        <p style="color: ${BRAND_COLORS.text}; font-size: 16px; line-height: 1.8; margin: 0 0 40px 0;">
          Great news! A talented student has applied for your job post "<strong style="color: ${BRAND_COLORS.primary};">${options.jobTitle}</strong>". Review their application and profile to make your decision.
        </p>
        
        <div style="margin: 40px 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td style="padding: 15px 0; border-bottom: 1px solid ${BRAND_COLORS.primary}10;">
                <span style="color: ${BRAND_COLORS.primary}; font-weight: 600; font-size: 15px; margin-right: 10px;">Student:</span>
                <span style="color: ${BRAND_COLORS.text}; font-size: 16px;">A Student</span>
              </td>
            </tr>
            <tr>
              <td style="padding: 15px 0; border-bottom: 1px solid ${BRAND_COLORS.primary}10;">
                <span style="color: ${BRAND_COLORS.primary}; font-weight: 600; font-size: 15px; margin-right: 10px;">Job Post:</span>
                <span style="color: ${BRAND_COLORS.text}; font-size: 16px;">${options.jobTitle}</span>
              </td>
            </tr>
            <tr>
              <td style="padding: 15px 0;">
                <span style="color: ${BRAND_COLORS.primary}; font-weight: 600; font-size: 15px; margin-right: 10px;">Applied:</span>
                <span style="color: ${BRAND_COLORS.text}; font-size: 16px;">${new Date().toLocaleDateString()}</span>
              </td>
            </tr>
          </table>
        </div>
        
        <p style="color: ${BRAND_COLORS.text}; font-size: 16px; line-height: 1.7; margin: 40px 0 30px 0; text-align: center;">
          Review the application and make your decision:
        </p>
        
        ${createEmailButton(options.applicationUrl || '#', 'Review Application', BRAND_COLORS.primary, BRAND_COLORS.primaryLight)}
      `, BRAND_COLORS.primary);
    } else if (options.type === 'application-status-update') {
      const statusEmojis = {
        reviewed: '👀',
        accepted: '✅',
        rejected: '❌',
      };

      emailSubject = `Application Update: ${options.newStatus.charAt(0).toUpperCase() + options.newStatus.slice(1)} ${statusEmojis[options.newStatus] || '📝'}`;
      emailContent = createEmailWrapper(`
        <div style="text-align: center; margin-bottom: 40px;">
          <h1 style="color: ${BRAND_COLORS.primary}; font-size: 32px; font-weight: 700; margin: 0 0 15px 0; line-height: 1.2; letter-spacing: -0.5px;">
            Application Update ${statusEmojis[options.newStatus] || ''}
          </h1>
          <div style="width: 60px; height: 4px; background: linear-gradient(90deg, ${BRAND_COLORS.primary}, ${BRAND_COLORS.primaryLight}); margin: 0 auto; border-radius: 2px;"></div>
        </div>
        
        <p style="color: ${BRAND_COLORS.text}; font-size: 18px; line-height: 1.7; margin: 0 0 25px 0; font-weight: 500;">
          Hello ${options.name},
        </p>
        <p style="color: ${BRAND_COLORS.text}; font-size: 16px; line-height: 1.8; margin: 0 0 40px 0;">
          We have an update regarding your application for "<strong style="color: ${BRAND_COLORS.primary};">${options.jobTitle}</strong>".
        </p>
        
        <div style="margin: 40px 0;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td style="padding: 15px 0; border-bottom: 1px solid ${BRAND_COLORS.primary}10;">
                <span style="color: ${BRAND_COLORS.primary}; font-weight: 600; font-size: 15px; margin-right: 10px;">Job:</span>
                <span style="color: ${BRAND_COLORS.text}; font-size: 16px;">${options.jobTitle}</span>
              </td>
            </tr>
            <tr>
              <td style="padding: 15px 0; border-bottom: 1px solid ${BRAND_COLORS.primary}10;">
                <span style="color: ${BRAND_COLORS.primary}; font-weight: 600; font-size: 15px; margin-right: 10px;">Status:</span>
                <span style="color: ${BRAND_COLORS.text}; font-size: 16px; font-weight: 500;">${options.newStatus.charAt(0).toUpperCase() + options.newStatus.slice(1)}</span>
              </td>
            </tr>
            ${options.feedback ? `
            <tr>
              <td style="padding: 15px 0;">
                <span style="color: ${BRAND_COLORS.primary}; font-weight: 600; font-size: 15px; margin-right: 10px;">Feedback:</span>
                <span style="color: ${BRAND_COLORS.text}; font-size: 16px; line-height: 1.7;">${options.feedback}</span>
              </td>
            </tr>
            ` : ''}
          </table>
        </div>
        
        ${options.newStatus === 'accepted' ? `
          <p style="color: ${BRAND_COLORS.primary}; font-size: 17px; font-weight: 600; line-height: 1.7; margin: 40px 0; text-align: center; padding: 25px; background: linear-gradient(135deg, ${BRAND_COLORS.primary}08 0%, ${BRAND_COLORS.primaryLight}05 100%); border-radius: 12px;">
            🎉 Congratulations! The client has accepted your application. They will be in touch with you soon to discuss the next steps.
          </p>
        ` : options.newStatus === 'rejected' ? `
          <p style="color: ${BRAND_COLORS.text}; font-size: 16px; line-height: 1.8; margin: 40px 0; text-align: center;">
            Thank you for your interest. While this opportunity didn't work out, don't get discouraged! Keep applying to other jobs that match your skills.
          </p>
        ` : `
          <p style="color: ${BRAND_COLORS.text}; font-size: 16px; line-height: 1.8; margin: 40px 0; text-align: center;">
            The client has reviewed your application. Please check your Freshlancer dashboard for any additional communications.
          </p>
        `}
        
        ${createEmailButton(options.dashboardUrl || '#', 'View Dashboard', BRAND_COLORS.primary, BRAND_COLORS.primaryLight)}
      `, BRAND_COLORS.primary);
    }
    console.log('YALAYWSYASDASDd');
    // Email options
    const mailOptions = {
      from: `Freshlancer Team<${process.env.SMTP_USER || `noreply@${EMAIL_DOMAIN}`}>`,
      to: options.email,
      subject: emailSubject,
      text: options.message || 'Please view this email in an HTML-capable email client.',
      html: emailContent,
    };
    console.log('mailOptions', mailOptions);
    // Send email
    const info = await transporter.sendMail(mailOptions);
    
    if (process.env.SMTP_HOST) {
      console.log('SMTP_HOST', process.env.SMTP_HOST);
      console.log('info', info);
      // Real SMTP - email was actually sent
      console.log('✅ Email sent successfully via SMTP:', info.messageId);
      console.log('📧 To:', options.email);
    } else {
      console.log('YALAYWSYASDASDd');
      // Ethereal Email - only preview available
      console.log('📧 Email preview created (Ethereal Email - NOT sent to real address):', info.messageId);
      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) {
        console.log('🔗 Preview URL:', previewUrl);
      }
      console.log('⚠️  IMPORTANT: This is a test email. Configure SMTP settings to send real emails.');
    }

    return info;
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error('Failed to send email');
  }
};

module.exports = sendEmail;
