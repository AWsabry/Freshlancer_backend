const express = require('express');
const couponController = require('../controllers/couponController');
const { protect } = require('../controllers/authController');

const router = express.Router();

// Protect all routes (require authentication)
router.use(protect);

// Validate coupon code
router.post('/validate', couponController.validateCoupon);

// Record coupon usage (called after successful payment)
router.post('/record-usage', couponController.recordCouponUsage);

module.exports = router;
