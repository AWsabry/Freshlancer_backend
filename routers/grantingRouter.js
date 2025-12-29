const express = require('express');
const grantingController = require('../controllers/grantingController');
const authController = require('../controllers/auth/authController');

const router = express.Router();

// All routes require authentication
router.use(authController.protect);
router.use(authController.requireEmailVerification);

// User routes (students and clients can create grantings)
router.post('/', grantingController.createGranting);
router.get('/me', grantingController.getMyGrantings);

// Admin routes
router.use(authController.restrictTo('admin'));

router.get('/', grantingController.getAllGrantings);
router.get('/stats', grantingController.getGrantingStats);

module.exports = router;

