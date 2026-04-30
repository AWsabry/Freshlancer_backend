const express = require('express');
const authController = require('../controllers/auth/authController');
const externalProfilesController = require('../controllers/externalProfilesController');

const router = express.Router();

// Protect all routes after this middleware
router.use(authController.protect);
// Require email verification
router.use(authController.requireEmailVerification);

router.get('/me', authController.restrictTo('student'), externalProfilesController.getMe);
router.post('/sync', authController.restrictTo('student'), externalProfilesController.syncAll);
router.post('/sync/:provider', authController.restrictTo('student'), externalProfilesController.syncOne);

module.exports = router;

