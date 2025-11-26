const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
  try {
    // Create a test account with Ethereal Email for development
    let testAccount = await nodemailer.createTestAccount();

    // Create transporter using the test account
    const transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: testAccount.user, // generated ethereal user
        pass: testAccount.pass, // generated ethereal password
      },
    });

    // Generate dynamic content based on email type and user role
    let emailContent = '';
    let emailSubject = options.subject;

    if (options.type === 'welcome') {
      if (options.userRole === 'student') {
        emailSubject =
          'Welcome to FreeStudent - Start Your Freelancing Journey! 🎓';
        emailContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa;">
            <div style="background-color: #ffffff; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <div style="text-align: center; border-bottom: 3px solid #28a745; padding-bottom: 20px; margin-bottom: 30px;">
                <h1 style="color: #28a745; font-size: 32px; margin-bottom: 10px;">🎓 FreeStudent</h1>
                <p style="color: #666;">Your Gateway to Freelancing Success</p>
              </div>
              
              <h2 style="color: #333;">Welcome to FreeStudent! 🎉</h2>
              <p>Hi ${options.name || 'there'},</p>
              <p>Congratulations on joining FreeStudent - the platform where talented students like you can showcase your skills and earn money by providing services to clients worldwide!</p>
              
              <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #28a745;">What you can do as a Student:</h3>
                <ul>
                  <li>📝 Create and offer your services</li>
                  <li>💼 Apply for job postings from clients</li>
                  <li>💰 Set your own rates and earn money</li>
                  <li>⭐ Build your reputation with reviews</li>
                  <li>🌟 Showcase your portfolio and skills</li>
                </ul>
              </div>
              
              <p>To get started, please verify your email address by clicking the button below:</p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${
                  options.verificationUrl
                }" style="display: inline-block; background-color: #28a745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">Verify My Email Address</a>
              </div>
              
              <p><small>This verification link will expire in 10 minutes for security reasons.</small></p>
              
              <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #666; font-size: 12px;">
                <p>Best regards,<br><strong>The FreeStudent Team</strong></p>
                <p>FreeStudent - Connecting Talented Students with Global Opportunities</p>
              </div>
            </div>
          </div>
        `;
      } else {
        emailSubject =
          'Welcome to FreeStudent - Find Amazing Student Talent! 💼';
        emailContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa;">
            <div style="background-color: #ffffff; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <div style="text-align: center; border-bottom: 3px solid #007bff; padding-bottom: 20px; margin-bottom: 30px;">
                <h1 style="color: #007bff; font-size: 32px; margin-bottom: 10px;">💼 FreeStudent</h1>
                <p style="color: #666;">Access to Top Student Talent</p>
              </div>
              
              <h2 style="color: #333;">Welcome to FreeStudent! 🎉</h2>
              <p>Hello ${options.name || 'there'},</p>
              <p>Thank you for joining FreeStudent - the premier platform where you can connect with talented students and get your projects completed by skilled professionals at competitive rates!</p>
              
              <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #007bff;">What you can do as a Client:</h3>
                <ul>
                  <li>📋 Post job opportunities for students</li>
                  <li>🔍 Browse student services and portfolios</li>
                  <li>👥 Hire talented students for your projects</li>
                  <li>⚡ Get quality work done quickly and affordably</li>
                  <li>📊 Manage multiple projects and freelancers</li>
                </ul>
              </div>
              
              <p>To start posting jobs and hiring students, please verify your email address:</p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${
                  options.verificationUrl
                }" style="display: inline-block; background-color: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">Verify My Email Address</a>
              </div>
              
              <p><small>This verification link will expire in 10 minutes for security reasons.</small></p>
              
              <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #666; font-size: 12px;">
                <p>Best regards,<br><strong>The FreeStudent Team</strong></p>
                <p>FreeStudent - Your Gateway to Student Talent</p>
              </div>
            </div>
          </div>
        `;
      }
    } else if (options.type === 'password-reset') {
      emailSubject = 'FreeStudent - Reset Your Password 🔐';
      emailContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa;">
          <div style="background-color: #ffffff; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <div style="text-align: center; border-bottom: 3px solid #dc3545; padding-bottom: 20px; margin-bottom: 30px;">
              <h1 style="color: #dc3545; font-size: 32px; margin-bottom: 10px;">🔐 FreeStudent</h1>
              <p style="color: #666;">Password Reset Request</p>
            </div>
            
            <h2 style="color: #333;">Reset Your Password</h2>
            <p>Hello ${options.name || 'there'},</p>
            <p>We received a request to reset the password for your FreeStudent account. If you made this request, click the button below to set a new password:</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${
                options.resetUrl
              }" style="display: inline-block; background-color: #dc3545; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">Reset My Password</a>
            </div>
            
            <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 15px; margin: 20px 0;">
              <strong>⚠️ Important Security Information:</strong>
              <ul>
                <li>This link will expire in <strong>10 minutes</strong></li>
                <li>The link can only be used once</li>
                <li>If you didn't request this reset, please ignore this email</li>
              </ul>
            </div>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #666; font-size: 12px;">
              <p>Best regards,<br><strong>The FreeStudent Security Team</strong></p>
              <p>FreeStudent - Secure. Simple. Student-Focused.</p>
            </div>
          </div>
        </div>
      `;
    } else if (options.type === 'resend-verification') {
      emailSubject = 'FreeStudent - New Email Verification Link 📧';
      emailContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa;">
          <div style="background-color: #ffffff; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <div style="text-align: center; border-bottom: 3px solid #17a2b8; padding-bottom: 20px; margin-bottom: 30px;">
              <h1 style="color: #17a2b8; font-size: 32px; margin-bottom: 10px;">📧 FreeStudent</h1>
              <p style="color: #666;">New Verification Link</p>
            </div>
            
            <h2 style="color: #333;">Here's Your New Verification Link</h2>
            <p>Hello ${options.name || 'there'},</p>
            <p>You requested a new email verification link for your FreeStudent account. No problem! Here's your fresh verification link:</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${
                options.verificationUrl
              }" style="display: inline-block; background-color: #17a2b8; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">Verify My Email Address</a>
            </div>
            
            <div style="background-color: #d1ecf1; border: 1px solid #bee5eb; border-radius: 8px; padding: 15px; margin: 20px 0;">
              <strong>📋 Quick Reminder:</strong>
              <ul>
                <li>This new link will expire in <strong>10 minutes</strong></li>
                <li>Your previous verification links are now invalid</li>
                <li>You need to verify your email to access all features</li>
              </ul>
            </div>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #666; font-size: 12px;">
              <p>Best regards,<br><strong>The FreeStudent Team</strong></p>
              <p>FreeStudent - Bridging Students and Opportunities</p>
            </div>
          </div>
        </div>
      `;
    } else if (options.type === 'job-application') {
      emailSubject = `New Application for "${options.jobTitle}" 💼`;
      emailContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa;">
          <div style="background-color: #ffffff; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <div style="text-align: center; border-bottom: 3px solid #007bff; padding-bottom: 20px; margin-bottom: 30px;">
              <h1 style="color: #007bff; font-size: 32px; margin-bottom: 10px;">💼 FreeStudent</h1>
              <p style="color: #666;">New Job Application Received</p>
            </div>
            
            <h2 style="color: #333;">You Have a New Application! 🎉</h2>
            <p>Hello ${options.name},</p>
            <p>Great news! A talented student has applied for your job post "<strong>${
              options.jobTitle
            }</strong>".</p>
            
            <div style="background-color: #e3f2fd; border-left: 4px solid #2196f3; padding: 15px; margin: 20px 0;">
              <h3 style="color: #1976d2; margin-top: 0;">Application Details:</h3>
              <p><strong>Student:</strong> ${options.studentName}</p>
              <p><strong>Job Post:</strong> ${options.jobTitle}</p>
              <p><strong>Applied:</strong> ${new Date().toLocaleDateString()}</p>
            </div>
            
            <p>Review the application and student's profile to make your decision. You can accept, reject, or request more information.</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${
                options.applicationUrl || '#'
              }" style="display: inline-block; background-color: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">Review Application</a>
            </div>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #666; font-size: 12px;">
              <p>Best regards,<br><strong>The FreeStudent Team</strong></p>
              <p>FreeStudent - Connecting Talent with Opportunity</p>
            </div>
          </div>
        </div>
      `;
    } else if (options.type === 'application-status-update') {
      const statusColors = {
        reviewed: '#ff9800',
        accepted: '#4caf50',
        rejected: '#f44336',
      };
      const statusEmojis = {
        reviewed: '👀',
        accepted: '✅',
        rejected: '❌',
      };

      emailSubject = `Application Update: ${options.newStatus} ${
        statusEmojis[options.newStatus] || '📝'
      }`;
      emailContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f8f9fa;">
          <div style="background-color: #ffffff; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <div style="text-align: center; border-bottom: 3px solid ${
              statusColors[options.newStatus] || '#6c757d'
            }; padding-bottom: 20px; margin-bottom: 30px;">
              <h1 style="color: ${
                statusColors[options.newStatus] || '#6c757d'
              }; font-size: 32px; margin-bottom: 10px;">${
        statusEmojis[options.newStatus] || '📝'
      } FreeStudent</h1>
              <p style="color: #666;">Application Status Update</p>
            </div>
            
            <h2 style="color: #333;">Your Application Has Been ${
              options.newStatus.charAt(0).toUpperCase() +
              options.newStatus.slice(1)
            } ${statusEmojis[options.newStatus] || ''}</h2>
            <p>Hello ${options.name},</p>
            <p>We have an update regarding your application for "<strong>${
              options.jobTitle
            }</strong>".</p>
            
            <div style="background-color: ${
              options.newStatus === 'accepted'
                ? '#e8f5e8'
                : options.newStatus === 'rejected'
                ? '#ffeaa7'
                : '#e3f2fd'
            }; border-left: 4px solid ${
        statusColors[options.newStatus] || '#6c757d'
      }; padding: 15px; margin: 20px 0;">
              <h3 style="color: ${
                statusColors[options.newStatus] || '#6c757d'
              }; margin-top: 0;">Status Update:</h3>
              <p><strong>Job:</strong> ${options.jobTitle}</p>
              <p><strong>New Status:</strong> ${
                options.newStatus.charAt(0).toUpperCase() +
                options.newStatus.slice(1)
              }</p>
              ${
                options.feedback
                  ? `<p><strong>Client Feedback:</strong> ${options.feedback}</p>`
                  : ''
              }
            </div>
            
            ${
              options.newStatus === 'accepted'
                ? '<p style="color: #4caf50; font-weight: bold;">🎉 Congratulations! The client has accepted your application. They will be in touch with you soon to discuss the next steps.</p>'
                : options.newStatus === 'rejected'
                ? "<p>Thank you for your interest. While this opportunity didn't work out, don't get discouraged! Keep applying to other jobs that match your skills.</p>"
                : '<p>The client has reviewed your application. Please check your FreeStudent dashboard for any additional communications.</p>'
            }
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${
                options.dashboardUrl || '#'
              }" style="display: inline-block; background-color: ${
        statusColors[options.newStatus] || '#6c757d'
      }; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">View Dashboard</a>
            </div>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #666; font-size: 12px;">
              <p>Best regards,<br><strong>The FreeStudent Team</strong></p>
              <p>FreeStudent - Your Success is Our Mission</p>
            </div>
          </div>
        </div>
      `;
    }

    // Email options
    const mailOptions = {
      from: '"FreeStudent Team" <noreply@freestudent.com>',
      to: options.email,
      subject: emailSubject,
      text:
        options.message ||
        'Please view this email in an HTML-capable email client.',
      html: emailContent,
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);

    console.log('Email sent successfully:', info.messageId);
    console.log('Preview URL (Ethereal):', nodemailer.getTestMessageUrl(info));

    return info;
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error('Failed to send email');
  }
};

module.exports = sendEmail;
