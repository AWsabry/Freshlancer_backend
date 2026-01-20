const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'Notification must belong to a user'],
  },
  type: {
    type: String,
    required: [true, 'Notification must have a type'],
    enum: {
      values: [
        'job_invite',
        'application_status',
        'application_received',
        'new_message',
        'deadline_reminder',
        'payment_received',
        'payment_released',
        'contract_created',
        'contract_updated',
        'contract_signed',
        'contract_completed',
        'milestone_funded',
        'milestone_submitted',
        'milestone_approved',
        'review_received',
        'profile_viewed',
        'verification_approved',
        'verification_rejected',
        'subscription_expiring',
        'subscription_renewed',
        'system_announcement',
        'account_suspended',
      ],
      message: 'Invalid notification type',
    },
  },
  title: {
    type: String,
    required: [true, 'Notification must have a title'],
    trim: true,
    maxlength: [200, 'Title must be less than 200 characters'],
  },
  message: {
    type: String,
    required: [true, 'Notification must have a message'],
    trim: true,
    maxlength: [1000, 'Message must be less than 1000 characters'],
  },
  // Related documents
  relatedId: mongoose.Schema.ObjectId,
  relatedType: {
    type: String,
    enum: [
      'JobPost',
      'JobApplication',
      'Contract',
      'Conversation',
      'Transaction',
      'Review',
      'Subscription',
      'StudentVerification',
      'User',
      'ClientPackage',
    ],
  },
  // Action URL for deep linking
  actionUrl: {
    type: String,
    trim: true,
  },
  actionText: {
    type: String,
    default: 'View',
  },
  // Status
  isRead: {
    type: Boolean,
    default: false,
  },
  readAt: Date,
  // Priority
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal',
  },
  // Additional data
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
  },
  // Icon/Image
  icon: {
    type: String,
    enum: [
      'info',
      'success',
      'warning',
      'error',
      'message',
      'payment',
      'job',
      'contract',
      'review',
    ],
    default: 'info',
  },
  // Delivery channels
  channels: {
    inApp: {
      type: Boolean,
      default: true,
    },
    email: {
      type: Boolean,
      default: false,
    },
    push: {
      type: Boolean,
      default: false,
    },
  },
  // Email delivery status
  emailSent: {
    type: Boolean,
    default: false,
  },
  emailSentAt: Date,
  // Push notification status
  pushSent: {
    type: Boolean,
    default: false,
  },
  pushSentAt: Date,
  // Expiry
  expiresAt: Date,
  // Auto-dismiss
  autoDismiss: {
    type: Boolean,
    default: false,
  },
  dismissedAt: Date,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Index for better query performance
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, isRead: 1 });
notificationSchema.index({ type: 1 });
notificationSchema.index({ priority: 1 });
notificationSchema.index({ expiresAt: 1 });

// Update readAt timestamp when marked as read
notificationSchema.pre('save', function (next) {
  if (this.isModified('isRead') && this.isRead === true && !this.readAt) {
    this.readAt = Date.now();
  }
  next();
});

// Check user's notification preferences before creating
notificationSchema.pre('save', async function (next) {
  if (this.isNew) {
    const User = mongoose.model('User');
    const user = await User.findById(this.user);

    if (!user) {
      return next(new Error('User not found'));
    }

    // Check email notification preference
    if (this.channels.email) {
      const prefs = user.preferences?.emailNotifications;
      if (prefs) {
        switch (this.type) {
          case 'new_message':
            this.channels.email = prefs.newMessages;
            break;
          case 'job_invite':
            this.channels.email = prefs.jobAlerts;
            break;
          case 'application_status':
          case 'application_received':
            this.channels.email = prefs.applicationUpdates;
            break;
          default:
            break;
        }
      }
    }
  }
  next();
});

// Populate user information when querying
notificationSchema.pre(/^find/, function (next) {
  this.populate({
    path: 'user',
    select: 'name email photo',
  });
  next();
});

// Static method to create and send notification
notificationSchema.statics.createNotification = async function (data) {
  const notification = await this.create(data);

  // Here you would integrate with email and push notification services
  // For example:
  // if (notification.channels.email) {
  //   await sendEmail(notification);
  // }
  // if (notification.channels.push) {
  //   await sendPushNotification(notification);
  // }

  return notification;
};

// Static method to mark all as read for a user
notificationSchema.statics.markAllAsRead = async function (userId) {
  return this.updateMany(
    { user: userId, isRead: false },
    { isRead: true, readAt: Date.now() }
  );
};

// Static method to get unread count
notificationSchema.statics.getUnreadCount = async function (userId) {
  return this.countDocuments({ user: userId, isRead: false });
};

// Static method to delete expired notifications
notificationSchema.statics.deleteExpired = async function () {
  return this.deleteMany({
    expiresAt: { $lt: Date.now() },
  });
};

// Instance method to mark as read
notificationSchema.methods.markAsRead = function () {
  this.isRead = true;
  this.readAt = Date.now();
  return this.save();
};

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
