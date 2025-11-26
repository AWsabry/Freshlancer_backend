const Offer = require('../models/offerModel');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

// @desc    Create a new offer
// @route   POST /api/v1/offers
// @access  Admin only
exports.createOffer = catchAsync(async (req, res, next) => {
  // Add the admin user ID as createdBy
  req.body.createdBy = req.user._id;

  const offer = await Offer.create(req.body);

  res.status(201).json({
    status: 'success',
    data: {
      offer,
    },
  });
});

// @desc    Get all offers (with filters)
// @route   GET /api/v1/offers
// @access  Public (students/clients see active offers, admin sees all)
exports.getAllOffers = catchAsync(async (req, res, next) => {
  const {
    targetAudience,
    offerType,
    isActive,
    featured,
    page = 1,
    limit = 20,
    sort = '-featured -createdAt',
  } = req.query;

  // Build query
  const query = {};

  // Non-admin users only see active, valid offers
  if (req.user?.role !== 'admin') {
    query.isActive = true;
    query.startDate = { $lte: new Date() };
    query.endDate = { $gte: new Date() };
  } else if (isActive !== undefined) {
    query.isActive = isActive === 'true';
  }

  // Filter by target audience
  if (targetAudience) {
    if (req.user?.role === 'student') {
      query.targetAudience = { $in: ['student', 'both'] };
    } else if (req.user?.role === 'client') {
      query.targetAudience = { $in: ['client', 'both'] };
    } else {
      query.targetAudience = targetAudience;
    }
  } else if (req.user?.role === 'student') {
    query.targetAudience = { $in: ['student', 'both'] };
  } else if (req.user?.role === 'client') {
    query.targetAudience = { $in: ['client', 'both'] };
  }

  if (offerType) {
    query.offerType = offerType;
  }

  if (featured !== undefined) {
    query.featured = featured === 'true';
  }

  // Pagination
  const skip = (page - 1) * limit;

  const offers = await Offer.find(query)
    .sort(sort)
    .skip(skip)
    .limit(parseInt(limit))
    .populate('createdBy', 'name email');

  const total = await Offer.countDocuments(query);

  res.status(200).json({
    status: 'success',
    results: offers.length,
    data: {
      offers,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
      },
    },
  });
});

// @desc    Get featured offers
// @route   GET /api/v1/offers/featured
// @access  Public
exports.getFeaturedOffers = catchAsync(async (req, res, next) => {
  const query = {
    isActive: true,
    featured: true,
    startDate: { $lte: new Date() },
    endDate: { $gte: new Date() },
  };

  // Filter by user role
  if (req.user?.role === 'student') {
    query.targetAudience = { $in: ['student', 'both'] };
  } else if (req.user?.role === 'client') {
    query.targetAudience = { $in: ['client', 'both'] };
  }

  const offers = await Offer.find(query)
    .sort('-featured -createdAt')
    .limit(5);

  res.status(200).json({
    status: 'success',
    results: offers.length,
    data: {
      offers,
    },
  });
});

// @desc    Get single offer
// @route   GET /api/v1/offers/:id
// @access  Public
exports.getOffer = catchAsync(async (req, res, next) => {
  const offer = await Offer.findById(req.params.id).populate('createdBy', 'name email');

  if (!offer) {
    return next(new AppError('No offer found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      offer,
    },
  });
});

// @desc    Get offer by coupon code
// @route   GET /api/v1/offers/coupon/:code
// @access  Public (authenticated)
exports.getOfferByCoupon = catchAsync(async (req, res, next) => {
  const offer = await Offer.findOne({
    couponCode: req.params.code.toUpperCase(),
    isActive: true,
    startDate: { $lte: new Date() },
    endDate: { $gte: new Date() },
  });

  if (!offer) {
    return next(new AppError('Invalid or expired coupon code', 404));
  }

  // Check if user has already used this offer
  if (offer.hasUserUsedOffer(req.user._id)) {
    return next(new AppError('You have already used this offer', 400));
  }

  // Check if offer has reached max usage
  if (offer.maxUsageCount && offer.currentUsageCount >= offer.maxUsageCount) {
    return next(new AppError('This offer has reached its maximum usage limit', 400));
  }

  res.status(200).json({
    status: 'success',
    data: {
      offer,
    },
  });
});

// @desc    Apply/Redeem an offer
// @route   POST /api/v1/offers/:id/redeem
// @access  Authenticated (student/client)
exports.redeemOffer = catchAsync(async (req, res, next) => {
  const offer = await Offer.findById(req.params.id);

  if (!offer) {
    return next(new AppError('No offer found with that ID', 404));
  }

  // Check if offer is valid
  const now = new Date();
  if (!offer.isActive || offer.startDate > now || offer.endDate < now) {
    return next(new AppError('This offer is not currently valid', 400));
  }

  // Check target audience
  if (offer.targetAudience !== 'both' && offer.targetAudience !== req.user.role) {
    return next(new AppError('This offer is not available for your account type', 403));
  }

  // Record usage
  try {
    await offer.recordUsage(req.user._id);
  } catch (error) {
    return next(new AppError(error.message, 400));
  }

  // Apply the offer benefits based on offer type
  const User = require('../models/userModel');
  const user = await User.findById(req.user._id);

  switch (offer.offerType) {
    case 'bonus_points':
      if (req.user.role === 'client' && offer.bonusPoints) {
        user.clientProfile.points += offer.bonusPoints;
        await user.save();
      }
      break;

    case 'free_applications':
      if (req.user.role === 'student' && offer.bonusApplications) {
        const currentLimit = user.studentProfile.subscriptionTier === 'premium' ? 100 : 10;
        user.studentProfile.applicationsUsedThisMonth = Math.max(
          0,
          user.studentProfile.applicationsUsedThisMonth - offer.bonusApplications
        );
        await user.save();
      }
      break;

    case 'premium_trial':
      if (req.user.role === 'student' && offer.premiumTrialDays) {
        const Subscription = require('../models/subscriptionModel');
        const existingSubscription = await Subscription.findOne({ student: user._id });

        if (!existingSubscription || existingSubscription.plan !== 'premium') {
          const trialEnd = new Date();
          trialEnd.setDate(trialEnd.getDate() + offer.premiumTrialDays);

          await Subscription.findOneAndUpdate(
            { student: user._id },
            {
              plan: 'premium',
              status: 'trial',
              startDate: new Date(),
              endDate: trialEnd,
              autoRenew: false,
            },
            { upsert: true, new: true }
          );

          user.studentProfile.subscriptionTier = 'premium';
          await user.save();
        }
      }
      break;
  }

  res.status(200).json({
    status: 'success',
    message: 'Offer redeemed successfully',
    data: {
      offer,
    },
  });
});

// @desc    Update an offer
// @route   PATCH /api/v1/offers/:id
// @access  Admin only
exports.updateOffer = catchAsync(async (req, res, next) => {
  // Prevent updating certain fields
  delete req.body.createdBy;
  delete req.body.currentUsageCount;
  delete req.body.usedBy;

  const offer = await Offer.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  if (!offer) {
    return next(new AppError('No offer found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      offer,
    },
  });
});

// @desc    Delete an offer
// @route   DELETE /api/v1/offers/:id
// @access  Admin only
exports.deleteOffer = catchAsync(async (req, res, next) => {
  const offer = await Offer.findByIdAndDelete(req.params.id);

  if (!offer) {
    return next(new AppError('No offer found with that ID', 404));
  }

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

// @desc    Toggle offer active status
// @route   PATCH /api/v1/offers/:id/toggle-active
// @access  Admin only
exports.toggleOfferActive = catchAsync(async (req, res, next) => {
  const offer = await Offer.findById(req.params.id);

  if (!offer) {
    return next(new AppError('No offer found with that ID', 404));
  }

  offer.isActive = !offer.isActive;
  await offer.save();

  res.status(200).json({
    status: 'success',
    data: {
      offer,
    },
  });
});

// @desc    Get offer usage statistics
// @route   GET /api/v1/offers/:id/stats
// @access  Admin only
exports.getOfferStats = catchAsync(async (req, res, next) => {
  const offer = await Offer.findById(req.params.id).populate('usedBy.user', 'name email role');

  if (!offer) {
    return next(new AppError('No offer found with that ID', 404));
  }

  const stats = {
    totalUsage: offer.currentUsageCount,
    maxUsage: offer.maxUsageCount || 'Unlimited',
    remainingUsage: offer.maxUsageCount ? offer.maxUsageCount - offer.currentUsageCount : 'Unlimited',
    usagePercentage: offer.maxUsageCount
      ? Math.round((offer.currentUsageCount / offer.maxUsageCount) * 100)
      : 0,
    recentUsage: offer.usedBy.slice(-10).reverse(),
  };

  res.status(200).json({
    status: 'success',
    data: {
      stats,
    },
  });
});
