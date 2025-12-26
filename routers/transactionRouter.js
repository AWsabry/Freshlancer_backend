const express = require('express');
const transactionController = require('../controllers/transactionController');
const authController = require('../controllers/auth/authController');

const router = express.Router();

// All routes require authentication
router.use(authController.protect);
// Require email verification
router.use(authController.requireEmailVerification);

// Routes for all authenticated users
router.get('/me', transactionController.getMyTransactions);
router.get('/summary', transactionController.getTransactionSummary);
router.get('/:id', transactionController.getTransaction);

// Admin routes
router.use(authController.restrictTo('admin'));

router.get('/', transactionController.getAllTransactions);
router.get('/revenue-stats', transactionController.getRevenueStats);
router.post('/:id/refund', transactionController.processRefund);
router.patch('/:id/status', transactionController.updateTransactionStatus);

module.exports = router;
