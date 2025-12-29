const User = require('../models/userModel');
const logger = require('./logger');

/**
 * Check if a user logged in today
 * @param {Object} user - User object with lastLoginAt field
 * @returns {boolean} True if user logged in today, false otherwise
 */
exports.userLoggedInToday = (user) => {
  if (!user || !user.lastLoginAt) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0); // Start of today (00:00:00)

  const lastLogin = new Date(user.lastLoginAt);
  lastLogin.setHours(0, 0, 0, 0); // Start of last login day

  return lastLogin.getTime() === today.getTime();
};

/**
 * Check if a user logged in on a specific date
 * @param {Object} user - User object with lastLoginAt field
 * @param {Date} date - Date to check (defaults to today)
 * @returns {boolean} True if user logged in on the specified date
 */
exports.userLoggedInOnDate = (user, date = new Date()) => {
  if (!user || !user.lastLoginAt) {
    return false;
  }

  const checkDate = new Date(date);
  checkDate.setHours(0, 0, 0, 0);

  const lastLogin = new Date(user.lastLoginAt);
  lastLogin.setHours(0, 0, 0, 0);

  return lastLogin.getTime() === checkDate.getTime();
};

/**
 * Get daily active users statistics
 * Checks how many users logged in on a specific date
 * 
 * @param {Date} date - Date to check (defaults to today)
 * @returns {Promise<Object>} Statistics about daily active users
 */
exports.getDailyActiveUsers = async (date = new Date()) => {
  try {
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(checkDate);
    nextDay.setDate(nextDay.getDate() + 1);

    // Find all users who logged in on the specified date
    const activeUsers = await User.find({
      lastLoginAt: {
        $gte: checkDate,
        $lt: nextDay
      },
      active: true,
      suspended: false
    }).select('role emailVerified');

    const total = activeUsers.length;
    const students = activeUsers.filter(u => u.role === 'student').length;
    const clients = activeUsers.filter(u => u.role === 'client').length;
    const admins = activeUsers.filter(u => u.role === 'admin').length;
    const verified = activeUsers.filter(u => u.emailVerified).length;
    const unverified = activeUsers.filter(u => !u.emailVerified).length;

    return {
      date: checkDate.toISOString().split('T')[0],
      total,
      byRole: {
        students,
        clients,
        admins
      },
      byVerification: {
        verified,
        unverified
      }
    };
  } catch (error) {
    logger.error('Error getting daily active users:', error);
    throw error;
  }
};

/**
 * Get users who logged in today
 * 
 * @returns {Promise<Array>} Array of users who logged in today
 */
exports.getUsersLoggedInToday = async () => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const users = await User.find({
      lastLoginAt: {
        $gte: today,
        $lt: tomorrow
      },
      active: true,
      suspended: false
    }).select('name email role lastLoginAt emailVerified');

    return users;
  } catch (error) {
    logger.error('Error getting users logged in today:', error);
    throw error;
  }
};

/**
 * Get users who did NOT log in today
 * Useful for identifying inactive users on a daily basis
 * 
 * @returns {Promise<Array>} Array of users who did not log in today
 */
exports.getUsersNotLoggedInToday = async () => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const users = await User.find({
      $or: [
        { lastLoginAt: { $lt: today } },
        { lastLoginAt: { $exists: false } },
        { lastLoginAt: null }
      ],
      active: true,
      suspended: false,
      role: { $in: ['student', 'client'] }
    }).select('name email role lastLoginAt emailVerified');

    return users;
  } catch (error) {
    logger.error('Error getting users not logged in today:', error);
    throw error;
  }
};

/**
 * Daily activity report job
 * Logs daily active user statistics
 * Can be scheduled to run daily
 * 
 * @param {Date} date - Date to generate report for (defaults to yesterday)
 * @returns {Promise<Object>} Daily activity report
 */
exports.generateDailyActivityReport = async (date = null) => {
  try {
    // Default to yesterday's date (since we're checking the previous day)
    const reportDate = date || (() => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      return yesterday;
    })();

    logger.info('\n========================================');
    logger.info('📊 GENERATING DAILY ACTIVITY REPORT');
    logger.info('========================================');
    logger.info('Report date:', reportDate.toISOString().split('T')[0]);

    const stats = await exports.getDailyActiveUsers(reportDate);

    logger.info('\n📈 Daily Active Users Statistics:');
    logger.info(`   Total: ${stats.total}`);
    logger.info(`   Students: ${stats.byRole.students}`);
    logger.info(`   Clients: ${stats.byRole.clients}`);
    logger.info(`   Admins: ${stats.byRole.admins}`);
    logger.info(`   Verified: ${stats.byVerification.verified}`);
    logger.info(`   Unverified: ${stats.byVerification.unverified}`);
    logger.info('========================================\n');

    return stats;
  } catch (error) {
    logger.error('❌ Error generating daily activity report:', error);
    throw error;
  }
};

