const express = require('express');
const studentVerificationController = require('../controllers/studentVerificationController');
const authController = require('../controllers/auth/authController');
const { uploadVerificationDocument } = require('../middleware/upload');
const { uploadWithErrorHandling } = require('../middleware/uploadErrorHandler');

const router = express.Router();

// All routes require authentication
router.use(authController.protect);
// Require email verification
router.use(authController.requireEmailVerification);

// Student routes
router.post('/upload', uploadWithErrorHandling(uploadVerificationDocument.single('document')), studentVerificationController.uploadDocument);
router.get('/me', studentVerificationController.getMyVerifications);
router.get('/status', studentVerificationController.getVerificationStatus);

// Admin routes
router.use(authController.restrictTo('admin'));

router.get('/pending', studentVerificationController.getAllPendingVerifications);
router.get('/stats', studentVerificationController.getVerificationStats);
router.get('/', studentVerificationController.getAllVerifications);
router.get('/:id', studentVerificationController.getVerification);
router.patch('/:id/approve', studentVerificationController.approveVerification);
router.patch('/:id/reject', studentVerificationController.rejectVerification);

module.exports = router;
