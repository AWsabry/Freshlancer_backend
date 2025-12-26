const express = require('express');
const clientPackageController = require('../controllers/clientPackageController');
const { protect, restrictTo } = require('../controllers/auth/authController');

const router = express.Router();

// Protect all routes (require authentication)
router.use(protect);
// Require email verification
const { requireEmailVerification } = require('../controllers/auth/authController');
router.use(requireEmailVerification);

// Get available packages (public for authenticated users)
router.get('/available', clientPackageController.getAvailablePackages);

// Purchase package (clients only)
router.post('/purchase', restrictTo('client'), clientPackageController.purchasePackage);

// Get my current package
router.get('/active', restrictTo('client'), clientPackageController.getMyPackage);

// Get my package history
router.get('/history', restrictTo('client'), clientPackageController.getMyPackageHistory);

// Get points balance
router.get('/points-balance', restrictTo('client'), clientPackageController.getPointsBalance);

// Cancel package
router.patch('/cancel', restrictTo('client'), clientPackageController.cancelPackage);

// Admin routes
router.get('/all', restrictTo('admin'), clientPackageController.getAllPackages);
router.get('/stats', restrictTo('admin'), clientPackageController.getPackageStats);

module.exports = router;
