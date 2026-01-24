const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth/authController');
const adminController = require('../controllers/adminController');
const analyticsController = require('../controllers/analyticsController');
const logController = require('../controllers/logController');
const universityController = require('../controllers/universityController');
const { uploadWithdrawalEvidence } = require('../middleware/upload');
const { uploadWithErrorHandling } = require('../middleware/uploadErrorHandler');
const withdrawalController = require('../controllers/withdrawalController');

// Protect all routes and restrict to admin only
router.use(authController.protect);
// Require email verification
router.use(authController.requireEmailVerification);
router.use(authController.restrictTo('admin'));

// Dashboard stats
router.get('/stats', adminController.getDashboardStats);

// Analytics
router.get('/analytics', analyticsController.getAnalytics);

// Package management routes
router.route('/packages')
  .get(adminController.getAllPackages)
  .post(adminController.createPackage);

router.route('/packages/:id')
  .get(adminController.getPackageById)
  .patch(adminController.updatePackage)
  .delete(adminController.deletePackage);

// User management
router.get('/users', adminController.getAllUsers);
router.get('/users/:id', adminController.getUserById);
router.patch('/users/:id/suspend', adminController.toggleUserSuspension);
router.patch('/users/:id/verify', adminController.toggleUserVerification);
router.delete('/users/:id', adminController.deleteUser);

// Student verification management
router.get('/students/verification', adminController.getStudentsWithVerification);
router.patch('/verifications/:id/approve', adminController.approveVerificationDocument);
router.patch('/verifications/:id/reject', adminController.rejectVerificationDocument);

// Applications overview
router.get('/applications', adminController.getAllApplications);

// Jobs overview
router.get('/jobs', adminController.getAllJobs);

// Contracts overview
router.get('/contracts', adminController.getAllContracts);

// Withdrawals overview
router.get('/withdrawals', adminController.getAllWithdrawals);
router.patch(
  '/withdrawals/:id',
  uploadWithErrorHandling(uploadWithdrawalEvidence.single('paymentEvidence')),
  withdrawalController.updateWithdrawalStatus
);

// Appeals overview
router.get('/appeals', require('../controllers/appealController').getAllAppeals);
router.patch('/appeals/:id/status', require('../controllers/appealController').updateAppealStatus);
router.post('/appeals/:id/resolve', require('../controllers/appealController').resolveAppeal);
router.post('/appeals/:id/admin-note', require('../controllers/appealController').addAdminNote);

// Log management routes
router.get('/logs/files', logController.getLogFiles);
router.get('/logs/stats', logController.getLogStats);

// University management routes
router.get('/universities', universityController.getAllUniversitiesAdmin);
router.get('/universities/:id', universityController.getUniversityAdmin);
router.post('/universities', universityController.createUniversity);
router.patch('/universities/:id/approve', universityController.approveUniversity);
router.patch('/universities/:id/reject', universityController.rejectUniversity);
router.patch('/universities/:id', universityController.updateUniversity);
router.delete('/universities/:id', universityController.deleteUniversity);
router.get('/logs/:date', logController.getLogFileContent);
router.delete('/logs/:date', logController.deleteLogFile);

module.exports = router;
