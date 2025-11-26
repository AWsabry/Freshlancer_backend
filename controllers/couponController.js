const Offer = require('../models/offerModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

// Validate and apply coupon code
exports.validateCoupon = catchAsync(async (req, res, next) => {
  const { couponCode, amount, currency = 'USD' } = req.body;
  const userRole = req.user.role;

  if (!couponCode) {
    return next(new AppError('Coupon code is required', 400));
  }

  if (!amount || amount <= 0) {
    return next(new AppError('Valid amount is required', 400));
  }

  // Find the offer by coupon code
  const offer = await Offer.findOne({
    couponCode: couponCode.toUpperCase().trim()
  });

  if (!offer) {
    return next(new AppError('Invalid coupon code', 404));
  }

  // Check if offer is valid (active and within date range)
  if (!offer.isValid) {
    return next(new AppError('This coupon code has expired or is not active', 400));
  }

  // Check target audience
  if (offer.targetAudience !== 'both' && offer.targetAudience !== userRole) {
    return next(new AppError('This coupon code is not available for your account type', 403));
  }

  // Check if user has already used this offer
  const hasUsed = await offer.hasUserUsedOffer(req.user._id);
  if (hasUsed) {
    return next(new AppError('You have already used this coupon code', 400));
  }

  // Check usage limit
  if (offer.usageLimit && offer.usageCount >= offer.usageLimit) {
    return next(new AppError('This coupon code has reached its usage limit', 400));
  }

  // Calculate discount
  let discountAmount = 0;

  if (offer.discountPercentage) {
    discountAmount = (amount * offer.discountPercentage) / 100;
  } else if (offer.discountAmount) {
    discountAmount = offer.discountAmount;
  }

  // Ensure discount doesn't exceed the total amount
  if (discountAmount > amount) {
    discountAmount = amount;
  }

  const finalAmount = Math.max(0, amount - discountAmount);

  res.status(200).json({
    status: 'success',
    data: {
      couponCode: offer.couponCode,
      discountType: offer.discountPercentage ? 'percentage' : 'fixed',
      discountValue: offer.discountPercentage || offer.discountAmount,
      discountAmount: Math.round(discountAmount * 100) / 100,
      originalAmount: amount,
      finalAmount: Math.round(finalAmount * 100) / 100,
      currency,
      offerId: offer._id,
      offerTitle: offer.title,
    },
  });
});

// Record coupon usage after successful payment
exports.recordCouponUsage = catchAsync(async (req, res, next) => {
  const { offerId } = req.body;

  if (!offerId) {
    return next(new AppError('Offer ID is required', 400));
  }

  const offer = await Offer.findById(offerId);

  if (!offer) {
    return next(new AppError('Offer not found', 404));
  }

  // Record usage
  await offer.recordUsage(req.user._id);

  res.status(200).json({
    status: 'success',
    message: 'Coupon usage recorded successfully',
  });
});
