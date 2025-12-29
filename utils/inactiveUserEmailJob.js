const User = require('../models/userModel');
const sendEmail = require('./email');
const logger = require('./logger');

/**
 * Send weekly emails to inactive users (students and clients)
 * Users who haven't logged in for 7+ days
 * 
 * @returns {Promise<Object>} Summary of emails sent
 */
exports.sendInactiveUserEmails = async () => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    logger.info('\n========================================');
    logger.info('📧 SENDING INACTIVE USER EMAILS');
    logger.info('========================================');
    logger.info('Looking for users inactive since:', sevenDaysAgo.toISOString());

    // Find inactive students and clients
    // Users who:
    // - Haven't logged in for 7+ days (or never logged in)
    // - Have email verified
    // - Are not suspended
    // - Are active
    // - Have marketing emails enabled (or null/undefined for opt-in)
    const inactiveUsers = await User.find({
      role: { $in: ['student', 'client'] },
      emailVerified: true,
      suspended: false,
      active: true,
      $and: [
        {
          $or: [
            { lastLoginAt: { $lt: sevenDaysAgo } },
            { lastLoginAt: { $exists: false } }
          ]
        },
        {
          $or: [
            { 'preferences.emailNotifications.marketingEmails': true },
            { 'preferences.emailNotifications.marketingEmails': { $exists: false } }
          ]
        }
      ]
    }).select('name email role lastLoginAt preferences');

    logger.info(`Found ${inactiveUsers.length} inactive users to email`);

    let emailsSent = 0;
    let emailsFailed = 0;
    const results = {
      students: { sent: 0, failed: 0 },
      clients: { sent: 0, failed: 0 }
    };

    for (const user of inactiveUsers) {
      try {
        const daysSinceLastLogin = user.lastLoginAt 
          ? Math.floor((Date.now() - user.lastLoginAt.getTime()) / (1000 * 60 * 60 * 24))
          : null;

        await sendEmail({
          type: 'inactive-user-reminder',
          email: user.email,
          name: user.name,
          userRole: user.role,
          daysSinceLastLogin: daysSinceLastLogin || 'never',
          dashboardUrl: user.role === 'student' 
            ? 'https://freshlancer.online/student/dashboard'
            : 'https://freshlancer.online/client/dashboard'
        });

        emailsSent++;
        if (user.role === 'student') {
          results.students.sent++;
        } else {
          results.clients.sent++;
        }

        logger.info(`✅ Email sent to ${user.email} (${user.role})`);
      } catch (error) {
        emailsFailed++;
        if (user.role === 'student') {
          results.students.failed++;
        } else {
          results.clients.failed++;
        }
        logger.error(`❌ Failed to send email to ${user.email}:`, error.message);
      }
    }

    logger.info('\n✅ INACTIVE USER EMAIL JOB COMPLETED');
    logger.info(`Total emails sent: ${emailsSent}`);
    logger.info(`Total emails failed: ${emailsFailed}`);
    logger.info(`Students: ${results.students.sent} sent, ${results.students.failed} failed`);
    logger.info(`Clients: ${results.clients.sent} sent, ${results.clients.failed} failed`);
    logger.info('========================================\n');

    return {
      totalSent: emailsSent,
      totalFailed: emailsFailed,
      results
    };
  } catch (error) {
    logger.error('❌ Error in sendInactiveUserEmails:', error);
    throw error;
  }
};

