const express = require('express');
const notificationController = require('../controllers/notificationController');
const authController = require('../controllers/auth/authController');

const router = express.Router();

// All routes require authentication
router.use(authController.protect);
// Require email verification
router.use(authController.requireEmailVerification);

// Routes for all authenticated users
router.get('/', notificationController.getMyNotifications);
router.get('/unread-count', notificationController.getUnreadCount);
router.get('/settings', notificationController.getNotificationSettings);
router.patch('/settings', notificationController.updateNotificationSettings);
router.get('/:id', notificationController.getNotification);
router.patch('/:id/read', notificationController.markAsRead);
router.patch('/read-all', notificationController.markAllAsRead);
router.delete('/:id', notificationController.deleteNotification);
router.delete('/read-all', notificationController.deleteAllRead);

// Admin routes
router.post('/system', authController.restrictTo('admin'), notificationController.createSystemNotification);

module.exports = router;
