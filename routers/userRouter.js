const express = require('express');

const router = express.Router();
const authController = require('../controllers/auth/authController');
const withdrawalController = require('../controllers/withdrawalController');
const { uploadResume, uploadAdditionalDocument, uploadPhoto } = require('../middleware/upload');
const { uploadWithErrorHandling } = require('../middleware/uploadErrorHandler');

router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.get('/logout', authController.logout);
router.post('/forgotPassword', authController.forgotPassword);
router.patch('/resetPassword/:token', authController.resetPassword);
router.get('/verifyEmail/:token', authController.verifyEmail);
// Resend verification email - can be called by authenticated or unauthenticated users
// This route should be accessible even if email is not verified
router.post('/resendVerificationEmail', authController.resendVerificationEmail);

// Protect all routes below (require authentication)
router.use(authController.protect);

// Require email verification for all protected routes
// This allows resendVerificationEmail to work, but blocks everything else
router.use(authController.requireEmailVerification);

router.get('/me', authController.getMe);
router.patch('/updateMe', authController.updateMe);
router.patch('/updateMyPassword', authController.updatePassword);
router.get('/platform-stats', authController.getPlatformStats);
router.get('/client-dashboard-stats', authController.getClientDashboardStats);

// Photo upload route
router.post('/uploadPhoto', uploadWithErrorHandling(uploadPhoto.single('photo')), authController.uploadPhoto);

// Resume upload/delete routes
router.post('/uploadResume', uploadWithErrorHandling(uploadResume.single('resume')), authController.uploadResume);
router.delete('/deleteResume', authController.deleteResume);

// Additional documents upload/delete routes
router.post('/uploadAdditionalDocument', uploadWithErrorHandling(uploadAdditionalDocument.single('document')), authController.uploadAdditionalDocument);
router.delete('/deleteAdditionalDocument', authController.deleteAdditionalDocument);

// Withdrawal routes (student only)
router.get('/withdrawal-minimums', withdrawalController.getWithdrawalMinimums);
router.get('/withdrawals', withdrawalController.getMyWithdrawals);
router.post('/withdrawal-request', withdrawalController.requestWithdrawal);

module.exports = router;
