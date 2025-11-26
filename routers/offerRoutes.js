const express = require('express');
const offerController = require('../controllers/offerController');
const authController = require('../controllers/authController');

const router = express.Router();

// Public routes (require authentication)
router.get('/featured', authController.protect, offerController.getFeaturedOffers);
router.get('/coupon/:code', authController.protect, offerController.getOfferByCoupon);

// Protected routes (require authentication)
router.use(authController.protect);

router.get('/', offerController.getAllOffers);
router.get('/:id', offerController.getOffer);
router.post('/:id/redeem', offerController.redeemOffer);

// Admin only routes
router.use(authController.restrictTo('admin'));

router.post('/', offerController.createOffer);
router.patch('/:id', offerController.updateOffer);
router.delete('/:id', offerController.deleteOffer);
router.patch('/:id/toggle-active', offerController.toggleOfferActive);
router.get('/:id/stats', offerController.getOfferStats);

module.exports = router;
