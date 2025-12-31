const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth/authController');
const studentVerificationController = require('../controllers/studentVerificationController');
const universityController = require('../controllers/universityController');

// Protect all routes and restrict to moderator or admin
router.use(authController.protect);
// Require email verification
router.use(authController.requireEmailVerification);
router.use(authController.restrictTo('admin', 'moderator'));

// Student verification management routes
router.get('/verifications/pending', studentVerificationController.getAllPendingVerifications);
router.get('/verifications', studentVerificationController.getAllVerifications);
router.get('/verifications/:id', studentVerificationController.getVerification);
router.patch('/verifications/:id/approve', studentVerificationController.approveVerification);
router.patch('/verifications/:id/reject', studentVerificationController.rejectVerification);

// University management routes
router.get('/universities', universityController.getAllUniversitiesAdmin);
router.patch('/universities/:id/approve', universityController.approveUniversity);
router.patch('/universities/:id/reject', universityController.rejectUniversity);

module.exports = router;

