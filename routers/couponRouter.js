const express = require('express');
const couponController = require('../controllers/couponController');
const authController = require('../controllers/auth/authController');

const router = express.Router();

// Public routes (require authentication)
router.get('/featured', authController.protect, authController.requireEmailVerification, couponController.getFeaturedCoupons);
router.get('/code/:code', authController.protect, authController.requireEmailVerification, couponController.getCouponByCode);

// Protected routes (require authentication)
router.use(authController.protect);
// Require email verification
router.use(authController.requireEmailVerification);

router.get('/', couponController.getAllCoupons);
router.get('/:id', couponController.getCoupon);
router.post('/:id/redeem', couponController.redeemCoupon);
router.post('/validate', couponController.validateCoupon);
router.post('/record-usage', couponController.recordCouponUsage);

// Admin only routes
router.use(authController.restrictTo('admin'));

router.post('/', couponController.createCoupon);
router.patch('/:id', couponController.updateCoupon);
router.delete('/:id', couponController.deleteCoupon);
router.patch('/:id/toggle-active', couponController.toggleCouponActive);
router.get('/:id/stats', couponController.getCouponStats);

module.exports = router;

