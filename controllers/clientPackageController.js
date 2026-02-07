const User = require('../models/userModel');
const Transaction = require('../models/transactionModel');
const Notification = require('../models/notificationModel');
const Package = require('../models/packageModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const paymobService = require('../utils/payment/paymob');
const paypalService = require('../utils/payment/paypal');

// Currency conversion rate (USD to EGP)
const USD_TO_EGP_RATE = 49.5;

// Helper function to get price in the requested currency
const getPriceForCurrency = (priceUSD, currency) => {
  if (currency === 'EGP') {
    return Math.round(priceUSD * USD_TO_EGP_RATE * 100) / 100;
  }
  return priceUSD;
};

// Get available packages (public) - fetch from database
exports.getAvailablePackages = catchAsync(async (req, res, next) => {
  const packages = await Package.find({ isActive: true })
    .sort({ displayOrder: 1, createdAt: -1 });

  // Convert to object format for backward compatibility
  const packagesObj = {};
  packages.forEach(pkg => {
    packagesObj[pkg.type] = {
      _id: pkg._id,
      name: pkg.name,
      type: pkg.type,
      pointsTotal: pkg.pointsTotal,
      priceUSD: pkg.priceUSD,
      profileViewsPerJob: pkg.profileViewsPerJob,
      description: pkg.description,
      features: pkg.features,
      icon: pkg.icon,
      color: pkg.color,
      popular: pkg.popular,
      hot: pkg.hot,
    };
  });

  res.status(200).json({
    status: 'success',
    data: {
      packages: packagesObj,
      packagesArray: packages, // Also return as array for easier frontend consumption
    },
  });
});

// Purchase package
exports.purchasePackage = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'client') {
    return next(new AppError('Only clients can purchase packages', 403));
  }

  const { packageType, packageId, paymentMethod, currency = 'USD', amount, couponCode } = req.body;

  // Fetch package from database - prefer packageId if provided, otherwise use packageType
  let packageDoc;
  if (packageId) {
    packageDoc = await Package.findById(packageId);
  } else if (packageType) {
    packageDoc = await Package.findOne({ type: packageType, isActive: true });
  } else {
    return next(new AppError('Package ID or type is required', 400));
  }

  if (!packageDoc) {
    return next(new AppError('Package not found or inactive', 404));
  }

  // Use package document as config
  const config = {
    _id: packageDoc._id,
    name: packageDoc.name,
    type: packageDoc.type,
    pointsTotal: packageDoc.pointsTotal,
    priceUSD: packageDoc.priceUSD,
    profileViewsPerJob: packageDoc.profileViewsPerJob,
    description: packageDoc.description,
  };

  // Convert base price to the requested currency
  const packagePrice = getPriceForCurrency(config.priceUSD, currency);

  // Always use the base package price as original amount (ignore frontend amount if coupon is provided)
  // This ensures consistent discount calculation on the backend
  let originalAmount = packagePrice;
  let totalAmount = originalAmount;
  let appliedCoupon = null;

  // Apply coupon discount if provided
  if (couponCode) {
    console.log('🎫 Validating coupon code for package purchase:', couponCode);
    const Coupon = require('../models/couponModel');

    const coupon = await Coupon.findOne({
      couponCode: couponCode.toUpperCase().trim(),
      isActive: true,
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() },
    });

    if (!coupon) {
      console.log('❌ Invalid or expired coupon code');
      return next(new AppError('Invalid or expired coupon code', 404));
    }

    // Check target audience
    if (coupon.targetAudience !== 'both' && coupon.targetAudience !== 'client') {
      console.log('❌ Coupon not available for clients');
      return next(new AppError('This coupon code is not available for clients', 403));
    }

    // Check if user has already used this coupon
    if (coupon.hasUserUsedCoupon(req.user._id)) {
      console.log('❌ User already used this coupon');
      return next(new AppError('You have already used this coupon code', 400));
    }

    // Check usage limit
    if (coupon.maxUsageCount && coupon.currentUsageCount >= coupon.maxUsageCount) {
      console.log('❌ Coupon reached usage limit');
      return next(new AppError('This coupon code has reached its usage limit', 400));
    }

    // Apply discount
    if (coupon.discountPercentage) {
      const discountAmount = (originalAmount * coupon.discountPercentage) / 100;
      totalAmount = Math.max(0, originalAmount - discountAmount);

      console.log('✅ Coupon applied to package:', {
        code: coupon.couponCode,
        discount: `${coupon.discountPercentage}%`,
        discountAmount,
        originalAmount,
        finalAmount: totalAmount
      });

      appliedCoupon = {
        id: coupon._id,
        code: coupon.couponCode,
        discountPercentage: coupon.discountPercentage,
        discountAmount,
      };
    }
  }

  // Add processing fees: EGP 3%; USD (PayPal) 2.9% + $0.30
  let processingFee = 0;
  if (currency === 'EGP') {
    processingFee = totalAmount * 0.03;
  } else if (currency === 'USD') {
    processingFee = totalAmount * 0.029 + 0.30;
  }
  const finalAmountWithFees = Math.round((totalAmount + processingFee) * 100) / 100;

  console.log('💰 Payment calculation:', {
    originalAmount,
    discount: appliedCoupon ? appliedCoupon.discountAmount : 0,
    subtotalAfterDiscount: totalAmount,
    processingFee,
    finalAmount: finalAmountWithFees,
    currency
  });

  // Create transaction with points directly (no ClientPackage)
  const transactionData = {
    user: req.user._id,
    type: 'package_purchase',
    amount: finalAmountWithFees,
    currency: currency,
    status: 'pending',
    paymentMethod: paymentMethod || 'credit_card',
    description: `${config.name} purchase - ${config.pointsTotal} points${appliedCoupon ? ` with ${appliedCoupon.discountPercentage}% discount` : ''}`,
    points: config.pointsTotal,
    packageType: config.type,
    packageId: config._id,
    pointsProcessed: false,
    metadata: {
      paymentType: 'package', // Flag to identify package purchase payments
    },
  };

  // Add coupon information to transaction metadata if applied
  if (appliedCoupon) {
    transactionData.metadata.coupon = {
      id: appliedCoupon.id,
      code: appliedCoupon.code,
      discountPercentage: appliedCoupon.discountPercentage,
      discountAmount: appliedCoupon.discountAmount,
      originalAmount: originalAmount,
      finalAmount: totalAmount,
    };
  }

  const transaction = await Transaction.create(transactionData);

  // If currency is EGP, use Paymob payment gateway
  if (currency === 'EGP') {
    try {
      // Get user information
      const user = await User.findById(req.user._id);

      // Prepare customer data
      const customer = {
        firstName: user.name?.split(' ')[0] || 'Guest',
        lastName: user.name?.split(' ').slice(1).join(' ') || 'User',
        email: user.email,
        phone: user.phone || '+201000000000',
        extras: {
          userId: user._id.toString(),
          userRole: user.role,
          paymentType: 'package',
          transactionId: transaction._id.toString(),
        },
      };

      // Create Paymob payment intention with final amount (includes discount and processing fees)
      const paymentIntention = await paymobService.createPaymentIntention({
        amount: finalAmountWithFees,
        currency: 'EGP',
        items: [{
          name: config.name,
          amount: finalAmountWithFees,
          description: `${config.pointsTotal} points package${appliedCoupon ? ` (with ${appliedCoupon.discountPercentage}% discount)` : ''}`,
          quantity: 1,
        }],
        billingData: req.body.billingData,
        customer,
        integrationId: req.body.integrationId,
      });

      // Update transaction with Paymob details
      transaction.metadata = {
        intentionId: paymentIntention.intentionId,
        clientSecret: paymentIntention.clientSecret,
        paymentUrl: paymentIntention.paymentUrl,
      };
      await transaction.save();

      // Return payment URL to redirect user to Paymob
      return res.status(200).json({
        status: 'success',
        data: {
          transaction,
          points: config.pointsTotal,
          packageName: config.name,
          paymentUrl: paymentIntention.paymentUrl,
          clientSecret: paymentIntention.clientSecret,
          intentionId: paymentIntention.intentionId,
          message: 'Please complete payment with Paymob',
        },
      });
    } catch (error) {
      // If Paymob fails, return error
      console.error('Paymob payment creation failed:', error);
      return next(new AppError('Failed to create payment. Please try again.', 500));
    }
  }

  // If currency is USD, use PayPal
  if (currency === 'USD') {
    const baseUrl = process.env.BASE_URL;
    const frontendUrl = process.env.FRONTEND_URL;
    if (!baseUrl || !frontendUrl) {
      return next(new AppError('Server URLs are not configured (BASE_URL, FRONTEND_URL)', 500));
    }
    const redirectBaseUrl = req.body.redirectBaseUrl || req.get('X-Frontend-Origin') || null;
    try {
      const { orderId, approvalUrl } = await paypalService.createOrder({
        amount: finalAmountWithFees,
        currency: 'USD',
        description: transaction.description,
        customId: transaction._id.toString(),
        returnUrl: `${baseUrl}/api/v1/paypal/capture?tx=${transaction._id.toString()}`,
        cancelUrl: `${frontendUrl}/payment/failed?reason=cancelled`,
      });

      transaction.paymentGateway = 'paypal';
      transaction.paymentMethod = 'paypal';
      if (transaction.metadata && typeof transaction.metadata.set === 'function') {
        transaction.metadata.set('paypalOrderId', orderId);
        transaction.metadata.set('paypalApprovalUrl', approvalUrl);
        if (redirectBaseUrl) transaction.metadata.set('redirectBaseUrl', redirectBaseUrl);
      } else {
        const existing = transaction.metadata && typeof transaction.metadata.toObject === 'function'
          ? transaction.metadata.toObject()
          : (transaction.metadata instanceof Map ? Object.fromEntries(transaction.metadata) : { ...(transaction.metadata || {}) });
        transaction.metadata = { ...existing, paypalOrderId: orderId, paypalApprovalUrl: approvalUrl, ...(redirectBaseUrl && { redirectBaseUrl }) };
      }
      await transaction.save();

      return res.status(200).json({
        status: 'success',
        data: {
          transaction,
          points: config.pointsTotal,
          packageName: config.name,
          gateway: 'paypal',
          approvalUrl,
          orderId,
          message: 'Redirect to PayPal to complete payment',
        },
      });
    } catch (error) {
      if (error.errorCode === 'PAYPAL_NOT_CONFIGURED') {
        return next(new AppError('PayPal is not configured. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to the server environment.', 503));
      }
      console.error('PayPal order creation failed:', error);
      return next(new AppError(error.message || 'Failed to create PayPal payment. Please try again.', 500));
    }
  }

  // Other currencies not supported
  return next(
    new AppError(
      'Payment gateway for this currency is not yet integrated. Please use USD or EGP.',
      400
    )
  );
});

// Get my current points (replaces getMyPackage)
exports.getMyPackage = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'client') {
    return next(new AppError('Only clients have packages', 403));
  }

  const user = await User.findById(req.user._id);

  if (!user || !user.clientProfile) {
    return next(new AppError('Client profile not found', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      pointsRemaining: user.clientProfile.pointsRemaining || 0,
      pointsUsed: user.clientProfile.pointsUsed || 0,
    },
  });
});

// Get my package history (now returns transactions)
exports.getMyPackageHistory = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'client') {
    return next(new AppError('Only clients can view package history', 403));
  }

  const transactions = await Transaction.find({
    user: req.user._id,
    type: 'package_purchase',
  }).sort('-createdAt');

  res.status(200).json({
    status: 'success',
    results: transactions.length,
    data: {
      packages: transactions, // Keep key name for backward compatibility
      transactions,
    },
  });
});

// Get points balance
exports.getPointsBalance = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'client') {
    return next(new AppError('Only clients have points', 403));
  }

  // Get user with client profile
  const user = await User.findById(req.user._id);

  if (!user || !user.clientProfile) {
    return next(new AppError('Client profile not found', 404));
  }

  const pointsRemaining = user.clientProfile.pointsRemaining || 0;
  const pointsUsed = user.clientProfile.pointsUsed || 0;
  const unlockedStudentsCount = user.clientProfile.unlockedStudents?.length || 0;

  res.status(200).json({
    status: 'success',
    data: {
      pointsRemaining,
      pointsUsed,
      unlockedStudentsCount,
      hasPoints: pointsRemaining > 0,
    },
  });
});

// Cancel package - No longer needed (packages don't have ongoing subscriptions)
exports.cancelPackage = catchAsync(async (req, res, next) => {
  return next(new AppError('Packages cannot be cancelled. Please contact support for refunds.', 400));
});

// Admin: Get all packages (now returns transactions)
exports.getAllPackages = catchAsync(async (req, res, next) => {
  const filter = { type: 'package_purchase' };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.packageType) filter.packageType = req.query.packageType;

  const transactions = await Transaction.find(filter).sort('-createdAt').populate('user', 'name email');

  res.status(200).json({
    status: 'success',
    results: transactions.length,
    data: {
      packages: transactions, // Keep key name for backward compatibility
      transactions,
    },
  });
});

// Admin: Get package statistics (now uses transactions)
exports.getPackageStats = catchAsync(async (req, res, next) => {
  const stats = await Transaction.aggregate([
    {
      $match: {
        type: 'package_purchase',
        status: 'completed',
      },
    },
    {
      $group: {
        _id: '$packageType',
        count: { $sum: 1 },
        totalRevenue: { $sum: '$amount' },
        totalPointsSold: { $sum: '$points' },
      },
    },
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      stats,
    },
  });
});
