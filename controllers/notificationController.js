const Notification = require('../models/notificationModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const factory = require('./handlerFactory');

// Get my notifications
exports.getMyNotifications = catchAsync(async (req, res, next) => {
  const filter = { user: req.user._id };

  if (req.query.isRead !== undefined) {
    filter.isRead = req.query.isRead === 'true';
  }

  if (req.query.type) {
    filter.type = req.query.type;
  }

  if (req.query.priority) {
    filter.priority = req.query.priority;
  }

  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const notifications = await Notification.find(filter)
    .sort('-createdAt')
    .skip(skip)
    .limit(limit);

  const total = await Notification.countDocuments(filter);

  res.status(200).json({
    status: 'success',
    results: notifications.length,
    total,
    page,
    pages: Math.ceil(total / limit),
    data: {
      notifications,
    },
  });
});

// Get single notification
exports.getNotification = factory.getOne(Notification);

// Get unread count
exports.getUnreadCount = catchAsync(async (req, res, next) => {
  const count = await Notification.getUnreadCount(req.user._id);

  res.status(200).json({
    status: 'success',
    data: {
      unreadCount: count,
    },
  });
});

// Mark notification as read
exports.markAsRead = catchAsync(async (req, res, next) => {
  const notification = await Notification.findById(req.params.id);

  if (!notification) {
    return next(new AppError('Notification not found', 404));
  }

  if (notification.user._id.toString() !== req.user._id.toString()) {
    return next(new AppError('You are not authorized to update this notification', 403));
  }

  await notification.markAsRead();

  res.status(200).json({
    status: 'success',
    data: {
      notification,
    },
  });
});

// Mark all as read
exports.markAllAsRead = catchAsync(async (req, res, next) => {
  await Notification.markAllAsRead(req.user._id);

  res.status(200).json({
    status: 'success',
    data: {
      message: 'All notifications marked as read',
    },
  });
});

// Delete notification
exports.deleteNotification = catchAsync(async (req, res, next) => {
  const notification = await Notification.findById(req.params.id);

  if (!notification) {
    return next(new AppError('Notification not found', 404));
  }

  if (notification.user._id.toString() !== req.user._id.toString()) {
    return next(new AppError('You are not authorized to delete this notification', 403));
  }

  await notification.remove();

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

// Delete all read notifications
exports.deleteAllRead = catchAsync(async (req, res, next) => {
  await Notification.deleteMany({
    user: req.user._id,
    isRead: true,
  });

  res.status(200).json({
    status: 'success',
    data: {
      message: 'All read notifications deleted',
    },
  });
});

// Get notification settings
exports.getNotificationSettings = catchAsync(async (req, res, next) => {
  const settings = req.user.preferences?.emailNotifications || {};

  res.status(200).json({
    status: 'success',
    data: {
      settings,
    },
  });
});

// Update notification settings
exports.updateNotificationSettings = catchAsync(async (req, res, next) => {
  const allowedSettings = ['newMessages', 'jobAlerts', 'applicationUpdates', 'marketingEmails'];

  const updates = {};
  allowedSettings.forEach((setting) => {
    if (req.body[setting] !== undefined) {
      updates[`preferences.emailNotifications.${setting}`] = req.body[setting];
    }
  });

  const user = await User.findByIdAndUpdate(req.user._id, updates, {
    new: true,
    runValidators: true,
  });

  res.status(200).json({
    status: 'success',
    data: {
      settings: user.preferences.emailNotifications,
    },
  });
});

// Admin: Create system notification
exports.createSystemNotification = catchAsync(async (req, res, next) => {
  const { title, message, priority, targetRole, targetUsers } = req.body;

  if (!title || !message) {
    return next(new AppError('Title and message are required', 400));
  }

  let users = [];

  if (targetUsers && targetUsers.length > 0) {
    users = targetUsers;
  } else if (targetRole) {
    const User = require('../models/userModel');
    const targetedUsers = await User.find({ role: targetRole }).select('_id');
    users = targetedUsers.map((u) => u._id);
  } else {
    return next(new AppError('Please specify target users or target role', 400));
  }

  // Create notifications for all target users
  const notifications = await Promise.all(
    users.map((userId) =>
      Notification.create({
        user: userId,
        type: 'system_announcement',
        title,
        message,
        priority: priority || 'normal',
        icon: 'info',
        channels: {
          inApp: true,
          email: true,
        },
      })
    )
  );

  res.status(201).json({
    status: 'success',
    data: {
      notificationsSent: notifications.length,
    },
  });
});
