const Coupon = require('../models/couponModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

// @desc    Create a new coupon
// @route   POST /api/v1/coupons
// @access  Admin only
exports.createCoupon = catchAsync(async (req, res, next) => {
  // Define allowed fields that exist in the model
  const allowedFields = [
    'title',
    'description',
    'targetAudience',
    'offerType',
    'discountPercentage',
    'bonusPoints',
    'bonusApplications',
    'premiumTrialDays',
    'packageDetails',
    'startDate',
    'endDate',
    'isActive',
    'maxUsageCount',
    'featured',
    'badgeText',
    'badgeColor',
    'imageUrl',
    'terms',
    'couponCode',
  ];

  // Filter request body to only include allowed fields that exist in the model
  const couponData = {};
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined && req.body[field] !== null) {
      // Handle empty strings - convert to undefined for optional fields
      if (req.body[field] === '') {
        return;
      }
      
      // Handle nested packageDetails object
      if (field === 'packageDetails' && typeof req.body[field] === 'object') {
        couponData[field] = req.body[field];
      } else if (field !== 'packageDetails') {
        couponData[field] = req.body[field];
      }
    }
  });

  // Remove any fields that don't exist in the model
  delete couponData.currentUsageCount;
  delete couponData.usedBy;
  delete couponData.createdAt;
  delete couponData.updatedAt;
  delete couponData.createdBy;

  // Set createdBy (required field)
  couponData.createdBy = req.user._id;

  // Ensure couponCode is uppercase and trimmed if provided
  if (couponData.couponCode) {
    couponData.couponCode = couponData.couponCode.toUpperCase().trim();
    if (couponData.couponCode === '') {
      return next(new AppError('Coupon code cannot be empty', 400));
    }
  }

  // Validate discountPercentage is required when offerType is 'discount'
  if (couponData.offerType === 'discount') {
    if (!couponData.discountPercentage || couponData.discountPercentage === '') {
      return next(new AppError('Discount percentage is required for discount coupons', 400));
    }
    if (couponData.discountPercentage < 1 || couponData.discountPercentage > 100) {
      return next(new AppError('Discount percentage must be between 1 and 100', 400));
    }
  }

  let coupon;
  try {
    coupon = await Coupon.create(couponData);
  } catch (error) {
    // If it's a duplicate key error for couponCode
    if (error.code === 11000) {
      return next(new AppError('A coupon with this code already exists', 409));
    }
    // Re-throw validation errors
    if (error.name === 'ValidationError') {
      return next(error);
    }
    throw error;
  }

  // Populate createdBy to avoid issues with virtuals
  try {
    await coupon.populate('createdBy', 'name email');
  } catch (populateError) {
    // If populate fails, log but continue (createdBy might not exist or already populated)
    console.error('Error populating createdBy:', populateError);
  }

  // Convert to plain object to avoid issues with virtuals during JSON serialization
  try {
    const couponObj = coupon.toObject({ virtuals: true });
    
    res.status(201).json({
      status: 'success',
      data: {
        coupon: couponObj,
      },
    });
  } catch (serializeError) {
    // If serialization fails, try without virtuals
    console.error('Error serializing coupon:', serializeError);
    const couponObj = coupon.toObject({ virtuals: false });
    res.status(201).json({
      status: 'success',
      data: {
        coupon: couponObj,
      },
    });
  }
});

// @desc    Get all coupons (with filters)
// @route   GET /api/v1/coupons
// @access  Public (students/clients see active coupons, admin sees all)
exports.getAllCoupons = catchAsync(async (req, res, next) => {
  const {
    offerType,
    isActive,
    featured,
    page = 1,
    limit = 20,
    sort = '-createdAt',
  } = req.query;

  // Get targetAudience directly from query to handle undefined properly
  const targetAudienceParam = req.query.targetAudience;

  // Build query
  const query = {};
 
  // For admin users, only apply filters if explicitly provided
  // For non-admin users, apply default filters for active, valid coupons
  if (req.user?.role !== 'admin') {
    // Non-admin users only see active, valid coupons
    query.isActive = true;
    query.startDate = { $lte: new Date() };
    query.endDate = { $gte: new Date() };
  } else {
    // Admin: Only filter by isActive if explicitly provided
    if (isActive !== undefined && isActive !== '' && isActive !== null) {
      query.isActive = isActive === 'true' || isActive === true;
    }
  }
  
  // Filter by target audience
  if (targetAudienceParam && targetAudienceParam.trim() !== '') {
    if (req.user?.role === 'student') {
      query.targetAudience = { $in: ['student', 'both'] };
    } else if (req.user?.role === 'client') {
      query.targetAudience = { $in: ['client', 'both'] };
    } else if (req.user?.role === 'admin') {
      query.targetAudience = targetAudienceParam;
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

  // For admin, return all coupons without pagination and without any filters
  // For non-admin users, use pagination with filters
  let coupons;
  let total;
  
  if (req.user?.role === 'admin') {
    // Admin: Apply filters if provided, otherwise get all coupons
    // Count total documents with the query
    const totalCount = await Coupon.countDocuments(query);
    
    // Fetch coupons with applied filters
    coupons = await Coupon.find(query)
      .sort(sort)
      .populate('createdBy', 'name email');
    
    total = coupons.length;
  } else {
    // Non-admin: Use pagination
    const limitNum = parseInt(limit) || 20;
    const skip = (page - 1) * limitNum;
   
    coupons = await Coupon.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .populate('createdBy', 'name email');
    
    total = await Coupon.countDocuments(query);
  }

  res.status(200).json({
    status: 'success',
    results: coupons.length,
    data: {
      coupons,
      ...(req.user?.role !== 'admin' && {
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / (parseInt(limit) || 20)),
        },
      }),
    },
  });
});

// @desc    Get featured coupons
// @route   GET /api/v1/coupons/featured
// @access  Public
exports.getFeaturedCoupons = catchAsync(async (req, res, next) => {
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

  const coupons = await Coupon.find(query)
    .sort('-featured -createdAt')
    .limit(5);

  res.status(200).json({
    status: 'success',
    results: coupons.length,
    data: {
      coupons,
    },
  });
});

// @desc    Get single coupon
// @route   GET /api/v1/coupons/:id
// @access  Public
exports.getCoupon = catchAsync(async (req, res, next) => {
  const coupon = await Coupon.findById(req.params.id).populate('createdBy', 'name email');

  if (!coupon) {
    return next(new AppError('No coupon found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      coupon,
    },
  });
});

// @desc    Get coupon by coupon code
// @route   GET /api/v1/coupons/code/:code
// @access  Public (authenticated)
exports.getCouponByCode = catchAsync(async (req, res, next) => {
  const coupon = await Coupon.findOne({
    couponCode: req.params.code.toUpperCase(),
    isActive: true,
    startDate: { $lte: new Date() },
    endDate: { $gte: new Date() },
  });

  if (!coupon) {
    return next(new AppError('Invalid or expired coupon code', 404));
  }

  // Check target audience matches user type
  if (coupon.targetAudience !== 'both' && coupon.targetAudience !== req.user.role) {
    return next(new AppError('This coupon code is not available for your account type', 403));
  }

  // Check if user has already used this coupon
  if (coupon.hasUserUsedCoupon(req.user._id)) {
    return next(new AppError('You have already used this coupon', 400));
  }

  // Check if coupon has reached max usage
  if (coupon.maxUsageCount && coupon.currentUsageCount >= coupon.maxUsageCount) {
    return next(new AppError('This coupon has reached its maximum usage limit', 400));
  }

  res.status(200).json({
    status: 'success',
    data: {
      coupon,
    },
  });
});

// @desc    Validate and apply coupon code
// @route   POST /api/v1/coupons/validate
// @access  Authenticated
exports.validateCoupon = catchAsync(async (req, res, next) => {
  const { couponCode, amount, currency = 'USD' } = req.body;
  const userRole = req.user.role;

  if (!couponCode) {
    return next(new AppError('Coupon code is required', 400));
  }

  if (!amount || amount <= 0) {
    return next(new AppError('Valid amount is required', 400));
  }

  // Find the coupon by coupon code
  const coupon = await Coupon.findOne({
    couponCode: couponCode.toUpperCase().trim()
  });

  if (!coupon) {
    return next(new AppError('Invalid coupon code', 404));
  }

  // Check if coupon is valid (active and within date range)
  if (!coupon.isValid) {
    return next(new AppError('This coupon code has expired or is not active', 400));
  }

  // Check target audience
  if (coupon.targetAudience !== 'both' && coupon.targetAudience !== userRole) {
    return next(new AppError('This coupon code is not available for your account type', 403));
  }

  // Check if user has already used this coupon
  const hasUsed = await coupon.hasUserUsedCoupon(req.user._id);
  if (hasUsed) {
    return next(new AppError('You have already used this coupon code', 400));
  }

  // Check usage limit
  if (coupon.maxUsageCount && coupon.currentUsageCount >= coupon.maxUsageCount) {
    return next(new AppError('This coupon code has reached its usage limit', 400));
  }

  // Calculate discount
  let discountAmount = 0;

  if (coupon.discountPercentage) {
    discountAmount = (amount * coupon.discountPercentage) / 100;
  }

  // Ensure discount doesn't exceed the total amount
  if (discountAmount > amount) {
    discountAmount = amount;
  }

  const finalAmount = Math.max(0, amount - discountAmount);

  res.status(200).json({
    status: 'success',
    data: {
      couponCode: coupon.couponCode,
      discountType: coupon.discountPercentage ? 'percentage' : null,
      discountValue: coupon.discountPercentage || null,
      discountAmount: Math.round(discountAmount * 100) / 100,
      originalAmount: amount,
      finalAmount: Math.round(finalAmount * 100) / 100,
      currency,
      couponId: coupon._id,
      couponTitle: coupon.title,
    },
  });
});

// @desc    Apply/Redeem a coupon
// @route   POST /api/v1/coupons/:id/redeem
// @access  Authenticated (student/client)
exports.redeemCoupon = catchAsync(async (req, res, next) => {
  const coupon = await Coupon.findById(req.params.id);

  if (!coupon) {
    return next(new AppError('No coupon found with that ID', 404));
  }

  // Check if coupon is valid
  const now = new Date();
  if (!coupon.isActive || coupon.startDate > now || coupon.endDate < now) {
    return next(new AppError('This coupon is not currently valid', 400));
  }

  // Check target audience
  if (coupon.targetAudience !== 'both' && coupon.targetAudience !== req.user.role) {
    return next(new AppError('This coupon is not available for your account type', 403));
  }

  // Record usage
  try {
    await coupon.recordUsage(req.user._id);
  } catch (error) {
    return next(new AppError(error.message, 400));
  }

  // Apply the coupon benefits based on coupon type
  const User = require('../models/userModel');
  const user = await User.findById(req.user._id);

  switch (coupon.offerType) {
    case 'bonus_points':
      if (req.user.role === 'client' && coupon.bonusPoints) {
        user.clientProfile.points += coupon.bonusPoints;
        await user.save();
      }
      break;

    case 'free_applications':
      if (req.user.role === 'student' && coupon.bonusApplications) {
        const currentLimit = user.studentProfile.subscriptionTier === 'premium' ? 100 : 10;
        user.studentProfile.applicationsUsedThisMonth = Math.max(
          0,
          user.studentProfile.applicationsUsedThisMonth - coupon.bonusApplications
        );
        await user.save();
      }
      break;

    case 'premium_trial':
      if (req.user.role === 'student' && coupon.premiumTrialDays) {
        const Subscription = require('../models/subscriptionModel');
        const existingSubscription = await Subscription.findOne({ student: user._id });

        if (!existingSubscription || existingSubscription.plan !== 'premium') {
          const trialEnd = new Date();
          trialEnd.setDate(trialEnd.getDate() + coupon.premiumTrialDays);

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
    message: 'Coupon redeemed successfully',
    data: {
      coupon,
    },
  });
});

// @desc    Update a coupon
// @route   PATCH /api/v1/coupons/:id
// @access  Admin only
exports.updateCoupon = catchAsync(async (req, res, next) => {
  // Define allowed fields from the model (same as create)
  const allowedFields = [
    'title',
    'description',
    'targetAudience',
    'offerType',
    'discountPercentage',
    'bonusPoints',
    'bonusApplications',
    'premiumTrialDays',
    'packageDetails',
    'startDate',
    'endDate',
    'isActive',
    'maxUsageCount',
    'featured',
    'badgeText',
    'badgeColor',
    'imageUrl',
    'terms',
    'couponCode',
  ];

  // Find the coupon first to ensure it exists
  const coupon = await Coupon.findById(req.params.id);

  if (!coupon) {
    return next(new AppError('No coupon found with that ID', 404));
  }

  // Filter request body to only include allowed fields
  const updateData = {};
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      // Don't update couponCode if it's being set to empty string (preserve existing)
      if (field === 'couponCode' && req.body[field] === '') {
        return;
      }
      
      // Handle nested packageDetails object
      if (field === 'packageDetails' && typeof req.body[field] === 'object') {
        updateData[field] = req.body[field];
      } else if (field !== 'packageDetails') {
        updateData[field] = req.body[field];
      }
    }
  });

  // Prevent updating certain fields
  delete updateData.createdBy;
  delete updateData.currentUsageCount;
  delete updateData.usedBy;
  delete updateData.createdAt;
  delete updateData.updatedAt;

  // Ensure couponCode is uppercase if provided
  if (updateData.couponCode) {
    updateData.couponCode = updateData.couponCode.toUpperCase().trim();
  }

  // Validate discountPercentage is required when offerType is 'discount'
  // Check if offerType is being updated to 'discount' or if it's already 'discount'
  const finalOfferType = updateData.offerType !== undefined ? updateData.offerType : coupon.offerType;
  if (finalOfferType === 'discount') {
    // If offerType is 'discount', discountPercentage must be provided (either in update or already exists)
    const finalDiscountPercentage = updateData.discountPercentage !== undefined ? updateData.discountPercentage : coupon.discountPercentage;
    if (!finalDiscountPercentage || finalDiscountPercentage === '' || finalDiscountPercentage === null) {
      return next(new AppError('Discount percentage is required for discount coupons', 400));
    }
    if (finalDiscountPercentage < 1 || finalDiscountPercentage > 100) {
      return next(new AppError('Discount percentage must be between 1 and 100', 400));
    }
  }

  // Update the coupon fields
  Object.keys(updateData).forEach(key => {
    coupon[key] = updateData[key];
  });

  // Validate the document
  try {
    await coupon.validate();
  } catch (validationError) {
    return next(validationError);
  }

  // Save the updated coupon
  await coupon.save();

  res.status(200).json({
    status: 'success',
    data: {
      coupon,
    },
  });
});

// @desc    Delete a coupon
// @route   DELETE /api/v1/coupons/:id
// @access  Admin only
exports.deleteCoupon = catchAsync(async (req, res, next) => {
  const coupon = await Coupon.findByIdAndDelete(req.params.id);

  if (!coupon) {
    return next(new AppError('No coupon found with that ID', 404));
  }

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

// @desc    Toggle coupon active status
// @route   PATCH /api/v1/coupons/:id/toggle-active
// @access  Admin only
exports.toggleCouponActive = catchAsync(async (req, res, next) => {
  const coupon = await Coupon.findById(req.params.id);

  if (!coupon) {
    return next(new AppError('No coupon found with that ID', 404));
  }

  coupon.isActive = !coupon.isActive;
  await coupon.save();

  res.status(200).json({
    status: 'success',
    data: {
      coupon,
    },
  });
});

// @desc    Get coupon usage statistics
// @route   GET /api/v1/coupons/:id/stats
// @access  Admin only
exports.getCouponStats = catchAsync(async (req, res, next) => {
  const coupon = await Coupon.findById(req.params.id).populate('usedBy.user', 'name email role');

  if (!coupon) {
    return next(new AppError('No coupon found with that ID', 404));
  }

  const stats = {
    totalUsage: coupon.currentUsageCount,
    maxUsage: coupon.maxUsageCount || 'Unlimited',
    remainingUsage: coupon.maxUsageCount ? coupon.maxUsageCount - coupon.currentUsageCount : 'Unlimited',
    usagePercentage: coupon.maxUsageCount
      ? Math.round((coupon.currentUsageCount / coupon.maxUsageCount) * 100)
      : 0,
    recentUsage: coupon.usedBy.slice(-10).reverse(),
  };

  res.status(200).json({
    status: 'success',
    data: {
      stats,
    },
  });
});

// @desc    Record coupon usage after successful payment
// @route   POST /api/v1/coupons/record-usage
// @access  Authenticated
exports.recordCouponUsage = catchAsync(async (req, res, next) => {
  const { couponId } = req.body;

  if (!couponId) {
    return next(new AppError('Coupon ID is required', 400));
  }

  const coupon = await Coupon.findById(couponId);

  if (!coupon) {
    return next(new AppError('Coupon not found', 404));
  }

  // Record usage
  await coupon.recordUsage(req.user._id);

  res.status(200).json({
    status: 'success',
    message: 'Coupon usage recorded successfully',
  });
});

