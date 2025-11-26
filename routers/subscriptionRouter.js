const express = require('express');
const subscriptionController = require('../controllers/subscriptionController');
const authController = require('../controllers/authController');

const router = express.Router();

// Public route - get pricing
router.get('/pricing', subscriptionController.getSubscriptionPricing);

// All routes below require authentication
router.use(authController.protect);

// Student routes (only students can manage subscriptions)
router.use(authController.restrictTo('student', 'admin'));

router.get('/me', subscriptionController.getMySubscription);
router.get('/check-limit', subscriptionController.checkApplicationLimit);
router.post('/upgrade', subscriptionController.upgradeToPremium);
router.post('/cancel', subscriptionController.cancelSubscription);
router.post('/renew', subscriptionController.renewSubscription);
router.get('/history', subscriptionController.getSubscriptionHistory);

// Admin routes
router.use(authController.restrictTo('admin'));

router.get('/', subscriptionController.getAllSubscriptions);
router.get('/stats', subscriptionController.getSubscriptionStats);

module.exports = router;
