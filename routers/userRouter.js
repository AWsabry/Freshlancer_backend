const express = require('express');

const router = express.Router();
const authController = require('../controllers/authController');
const { uploadResume, uploadAdditionalDocument, uploadPhoto } = require('../middleware/upload');

router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.get('/logout', authController.logout);
router.post('/forgotPassword', authController.forgotPassword);
router.patch('/resetPassword/:token', authController.resetPassword);
router.get('/verifyEmail/:token', authController.verifyEmail);
// Resend verification email - can be called by authenticated or unauthenticated users
router.post('/resendVerificationEmail', authController.resendVerificationEmail);

router.use(authController.protect);
router.get('/me', authController.getMe);
router.patch('/updateMe', authController.updateMe);
router.patch('/updateMyPassword', authController.updatePassword);
router.get('/platform-stats', authController.getPlatformStats);
router.get('/client-dashboard-stats', authController.getClientDashboardStats);

// Photo upload route
router.post('/uploadPhoto', uploadPhoto.single('photo'), authController.uploadPhoto);

// Resume upload/delete routes
router.post('/uploadResume', uploadResume.single('resume'), authController.uploadResume);
router.delete('/deleteResume', authController.deleteResume);

// Additional documents upload/delete routes
router.post('/uploadAdditionalDocument', uploadAdditionalDocument.single('document'), authController.uploadAdditionalDocument);
router.delete('/deleteAdditionalDocument', authController.deleteAdditionalDocument);

module.exports = router;
