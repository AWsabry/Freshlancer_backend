const Subscription = require('../models/subscriptionModel');
const User = require('../models/userModel');
const Notification = require('../models/notificationModel');

/**
 * Check and downgrade expired premium subscriptions
 * This function finds all active premium subscriptions that have passed their endDate
 * and downgrades them to free plan
 * 
 * @returns {Promise<number>} Number of subscriptions downgraded
 */
exports.checkAndDowngradeExpiredSubscriptions = async () => {
  try {
    const now = new Date();
    
    // Find all active premium subscriptions that have expired
    const expiredSubscriptions = await Subscription.find({
      plan: 'premium',
      status: 'active',
      endDate: { $lt: now }
    }).populate('student', 'name email');

    console.log(`\n🔍 Checking for expired subscriptions...`);
    console.log(`Found ${expiredSubscriptions.length} expired premium subscription(s)`);

    let downgradedCount = 0;

    for (const subscription of expiredSubscriptions) {
      try {
        console.log(`\n📉 Downgrading subscription ${subscription._id} for student ${subscription.student?.email || subscription.student}`);

        // Downgrade to free
        subscription.plan = 'free';
        subscription.status = 'expired';
        subscription.applicationLimitPerMonth = 10; // Free plan limit
        await subscription.save();

        // Update user profile to reflect free subscription
        await User.findByIdAndUpdate(subscription.student._id || subscription.student, {
          'studentProfile.subscriptionTier': 'free'
        });

        // Send notification to user
        await Notification.create({
          user: subscription.student._id || subscription.student,
          type: 'subscription_expiring',
          title: 'Subscription Expired',
          message: 'Your premium subscription has expired. You have been downgraded to the free plan. Upgrade again to continue enjoying premium benefits.',
          relatedId: subscription._id,
          relatedType: 'Subscription',
          priority: 'normal',
          icon: 'info',
        });

        console.log(`✅ Successfully downgraded subscription ${subscription._id}`);
        downgradedCount++;

      } catch (error) {
        console.error(`❌ Error downgrading subscription ${subscription._id}:`, error.message);
        // Continue with next subscription even if one fails
      }
    }

    if (downgradedCount > 0) {
      console.log(`\n✅ Successfully downgraded ${downgradedCount} expired subscription(s)`);
    } else {
      console.log(`\n✅ No expired subscriptions to downgrade`);
    }

    return downgradedCount;
  } catch (error) {
    console.error('❌ Error in checkAndDowngradeExpiredSubscriptions:', error);
    throw error;
  }
};

/**
 * Check and downgrade a single subscription if expired
 * Used for on-demand checks when user accesses their subscription
 * 
 * @param {Object} subscription - The subscription to check
 * @returns {Promise<boolean>} True if subscription was downgraded, false otherwise
 */
exports.checkAndDowngradeSingleSubscription = async (subscription) => {
  try {
    // Check if subscription is premium, active, and expired
    if (
      subscription.plan === 'premium' &&
      subscription.status === 'active' &&
      subscription.endDate &&
      subscription.endDate < new Date()
    ) {
      const User = require('../models/userModel');
      const Notification = require('../models/notificationModel');

      // Downgrade to free
      subscription.plan = 'free';
      subscription.status = 'expired';
      subscription.applicationLimitPerMonth = 10; // Free plan limit
      await subscription.save();

      // Update user profile to reflect free subscription
      await User.findByIdAndUpdate(subscription.student, {
        'studentProfile.subscriptionTier': 'free'
      });

      // Send notification to user
      await Notification.create({
        user: subscription.student,
        type: 'subscription_expiring',
        title: 'Subscription Expired',
        message: 'Your premium subscription has expired. You have been downgraded to the free plan. Upgrade again to continue enjoying premium benefits.',
        relatedId: subscription._id,
        relatedType: 'Subscription',
        priority: 'normal',
        icon: 'info',
      });

      return true; // Subscription was downgraded
    }

    return false; // Subscription is still valid
  } catch (error) {
    console.error('❌ Error checking single subscription:', error);
    throw error;
  }
};

