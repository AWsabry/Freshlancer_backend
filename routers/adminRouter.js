const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth/authController');
const adminController = require('../controllers/adminController');
const analyticsController = require('../controllers/analyticsController');
const logController = require('../controllers/logController');
const universityController = require('../controllers/universityController');

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
router.patch('/users/:id/role', adminController.updateUserRole);
router.delete('/users/:id', adminController.deleteUser);

// Student verification management
router.get('/students/verification', adminController.getStudentsWithVerification);
router.patch('/verifications/:id/approve', adminController.approveVerificationDocument);
router.patch('/verifications/:id/reject', adminController.rejectVerificationDocument);

// Applications overview
router.get('/applications', adminController.getAllApplications);

// Jobs overview
router.get('/jobs', adminController.getAllJobs);

// Log management routes
router.get('/logs/files', logController.getLogFiles);
router.get('/logs/stats', logController.getLogStats);

// University management routes
router.get('/universities', universityController.getAllUniversitiesAdmin);
router.post('/universities', universityController.createUniversity);
router.patch('/universities/:id/approve', universityController.approveUniversity);
router.patch('/universities/:id/reject', universityController.rejectUniversity);
router.patch('/universities/:id', universityController.updateUniversity);
router.delete('/universities/:id', universityController.deleteUniversity);
router.get('/logs/:date', logController.getLogFileContent);
router.delete('/logs/:date', logController.deleteLogFile);

module.exports = router;
