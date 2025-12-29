const JobApplication = require('../models/jobApplicationModel');
const User = require('../models/userModel');
const Subscription = require('../models/subscriptionModel');
const Notification = require('../models/notificationModel');
const sendEmail = require('./email');
const logger = require('./logger');
const { getFrontendUrl } = require('./helpers');

/**
 * Get the start and end of the current month
 * @returns {Object} { startOfMonth, endOfMonth }
 */
const getCurrentMonthRange = () => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  
  return { startOfMonth, endOfMonth };
};

/**
 * Count applications from JobApplication collection for a student in the current month
 * @param {String} studentId - Student user ID
 * @returns {Promise<Number>} Number of applications this month
 */
const countApplicationsThisMonth = async (studentId) => {
  try {
    const { startOfMonth, endOfMonth } = getCurrentMonthRange();
    
    const count = await JobApplication.countDocuments({
      student: studentId,
      createdAt: {
        $gte: startOfMonth,
        $lte: endOfMonth,
      },
    });
    
    return count;
  } catch (error) {
    logger.error('Error counting applications this month:', error);
    return 0;
  }
};

/**
 * Sync applicationsUsedThisMonth from JobApplication collection
 * Also checks and resets if a month has passed
 * @param {String} studentId - Student user ID
 * @returns {Promise<Object>} { applicationsUsedThisMonth, wasReset, resetDate }
 */
const syncApplicationCount = async (studentId) => {
  try {
    const student = await User.findById(studentId).select('name email studentProfile');
    if (!student || !student.studentProfile) {
      return { applicationsUsedThisMonth: 0, wasReset: false, resetDate: null };
    }

    const now = new Date();
    const resetDate = student.studentProfile?.applicationLimitResetDate;
    const { startOfMonth, endOfMonth } = getCurrentMonthRange();

    // Check if reset date has passed or doesn't exist
    let wasReset = false;
    let nextResetDate = resetDate;

    if (!resetDate || now >= resetDate) {
      // Reset date is first day of next month
      nextResetDate = new Date();
      nextResetDate.setMonth(nextResetDate.getMonth() + 1);
      nextResetDate.setDate(1);
      nextResetDate.setHours(0, 0, 0, 0);

      wasReset = true;
      logger.info('🔄 Application limit reset detected:', {
        studentId: studentId.toString(),
        resetDate: resetDate ? resetDate.toISOString() : 'none',
        now: now.toISOString(),
        nextResetDate: nextResetDate.toISOString(),
      });
    }

    // Count actual applications from JobApplication collection for current month
    const actualCount = await countApplicationsThisMonth(studentId);

    // Update student profile
    student.studentProfile.applicationsUsedThisMonth = actualCount;
    if (wasReset) {
      student.studentProfile.applicationLimitResetDate = nextResetDate;
    }
    await student.save({ validateBeforeSave: false });

    // Also sync subscription model
    const subscription = await Subscription.findOne({
      student: studentId,
      status: 'active',
    });

    if (subscription) {
      subscription.applicationsUsedThisMonth = actualCount;
      if (wasReset) {
        subscription.limitResetDate = nextResetDate;
      }
      await subscription.save();
    }

    // Send email and notification if reset occurred
    if (wasReset) {
      logger.info('📧 RESET DETECTED - Sending reset notification and email for student:', {
        studentId: studentId.toString(),
        email: student.email,
        name: student.name,
      });
      
      const subscriptionTier = student.studentProfile?.subscriptionTier || 'free';
      const monthlyLimit = subscriptionTier === 'premium' ? 100 : 10;
      const frontendUrl = getFrontendUrl();

      // Check if a reset notification was already sent recently (within last 1 hour) to prevent duplicates
      const recentResetNotification = await Notification.findOne({
        user: studentId,
        type: 'system_announcement',
        title: 'Application Limit Reset! 🎉',
        createdAt: { $gte: new Date(Date.now() - 3600000) }, // Within last 1 hour
      });

      if (recentResetNotification) {
        logger.info('⏭️ Reset notification already sent recently, skipping duplicate:', {
          notificationId: recentResetNotification._id,
          studentId: studentId.toString(),
        });
      } else {
        // Create notification
        try {
          const notification = await Notification.create({
            user: studentId,
            type: 'system_announcement',
            title: 'Application Limit Reset! 🎉',
            message: `Your monthly application limit has been reset! You now have ${monthlyLimit} fresh applications available. Start applying to new jobs!`,
            priority: 'medium',
            icon: 'success',
          });
          logger.info('✅ Notification created successfully for application limit reset:', {
            notificationId: notification._id,
            studentId: studentId.toString(),
            message: notification.message,
          });
        } catch (notifError) {
          logger.error('❌ Error creating reset notification:', {
            error: notifError.message,
            stack: notifError.stack,
            studentId: studentId.toString(),
            code: notifError.code,
            name: notifError.name,
          });
        }
      }

      // Send email asynchronously (always send, even if notification was skipped)
      if (student.email) {
        logger.info('📨 Attempting to send reset email to:', student.email);
        sendEmail({
          type: 'application-limit-reset',
          email: student.email,
          name: student.name || 'Student',
          subscriptionTier: subscriptionTier,
          dashboardUrl: `${frontendUrl}/student/jobs`,
        })
          .then(() => {
            logger.info('✅ Application limit reset email sent successfully to:', student.email);
          })
          .catch(err => {
            logger.error('❌ Failed to send application limit reset email:', {
              error: err.message,
              stack: err.stack,
              userId: studentId.toString(),
              email: student.email,
              errorType: err.constructor.name,
            });
          });
      } else {
        logger.warn('⚠️ Student email not found, cannot send reset email:', {
          studentId: studentId.toString(),
          hasEmail: !!student.email,
        });
      }
    }

    logger.debug('Synced application count:', {
      studentId: studentId.toString(),
      applicationsUsedThisMonth: actualCount,
      wasReset,
      resetDate: nextResetDate,
    });

    return {
      applicationsUsedThisMonth: actualCount,
      wasReset,
      resetDate: nextResetDate,
    };
  } catch (error) {
    logger.error('Error syncing application count:', error);
    return { applicationsUsedThisMonth: 0, wasReset: false, resetDate: null };
  }
};

/**
 * Increment application count atomically
 * Note: This should be called AFTER creating the JobApplication
 * The count will be synced from JobApplication collection on next read
 * @param {String} studentId - Student user ID
 * @returns {Promise<Number>} New application count
 */
const incrementApplicationCount = async (studentId) => {
  try {
    // Use atomic increment on User
    const updatedUser = await User.findByIdAndUpdate(
      studentId,
      { 
        $inc: { 'studentProfile.applicationsUsedThisMonth': 1 },
        // Ensure studentProfile exists
        $setOnInsert: { studentProfile: { applicationsUsedThisMonth: 0 } }
      },
      { new: true, runValidators: false, upsert: false }
    );

    // Also update subscription atomically
    await Subscription.updateOne(
      { student: studentId, status: 'active' },
      { $inc: { applicationsUsedThisMonth: 1 } }
    );

    const newCount = updatedUser?.studentProfile?.applicationsUsedThisMonth || 0;
    
    logger.debug('Incremented application count:', {
      studentId: studentId.toString(),
      newCount,
    });

    return newCount;
  } catch (error) {
    logger.error('Error incrementing application count:', error);
    // Fallback: sync from JobApplication collection
    const { applicationsUsedThisMonth } = await syncApplicationCount(studentId);
    return applicationsUsedThisMonth;
  }
};

module.exports = {
  countApplicationsThisMonth,
  syncApplicationCount,
  incrementApplicationCount,
  getCurrentMonthRange,
};

