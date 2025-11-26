const User = require('../models/userModel');
const Transaction = require('../models/transactionModel');
const Notification = require('../models/notificationModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const paymobService = require('../utils/paymob');

// Currency conversion rate (USD to EGP)
const USD_TO_EGP_RATE = 49.5;

// Points package configurations (in USD)
const packageConfigs = {
  basic: {
    name: '500 Points',
    pointsTotal: 500,
    priceUSD: 9.99,
    profileViewsPerJob: 50,
    description: 'Perfect for small projects',
  },
  professional: {
    name: '1000 Points',
    pointsTotal: 1000,
    priceUSD: 14.99,
    profileViewsPerJob: 100,
    description: 'Most popular choice',
  },
  enterprise: {
    name: '2000 Points',
    pointsTotal: 2000,
    priceUSD: 21.99,
    profileViewsPerJob: 200,
    description: 'For large Access',
  },
};

// Helper function to get price in the requested currency
const getPriceForCurrency = (priceUSD, currency) => {
  if (currency === 'EGP') {
    return Math.round(priceUSD * USD_TO_EGP_RATE * 100) / 100;
  }
  return priceUSD;
};

// Get available packages (public)
exports.getAvailablePackages = catchAsync(async (req, res, next) => {
  res.status(200).json({
    status: 'success',
    data: {
      packages: packageConfigs,
    },
  });
});

// Purchase package
exports.purchasePackage = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'client') {
    return next(new AppError('Only clients can purchase packages', 403));
  }

  const { packageType, paymentMethod, currency = 'USD', amount } = req.body;

  if (!packageConfigs[packageType]) {
    return next(new AppError('Invalid package type', 400));
  }

  const config = packageConfigs[packageType];

  // Use the amount sent from frontend (includes processing fees) or calculate it
  // Convert base price to the requested currency
  const packagePrice = getPriceForCurrency(config.priceUSD, currency);

  // Use the total amount from frontend (which includes processing fees)
  const totalAmount = amount || packagePrice;

  // Create transaction with points directly (no ClientPackage)
  const transaction = await Transaction.create({
    user: req.user._id,
    type: 'package_purchase',
    amount: totalAmount,
    currency: currency,
    status: 'pending',
    paymentMethod: paymentMethod || 'credit_card',
    description: `${config.name} purchase - ${config.pointsTotal} points`,
    points: config.pointsTotal,
    packageType: packageType,
    pointsProcessed: false,
  });

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

      // Create Paymob payment intention with total amount (includes processing fees)
      const paymentIntention = await paymobService.createPaymentIntention({
        amount: totalAmount,
        currency: 'EGP',
        items: [{
          name: config.name,
          amount: totalAmount,
          description: `${config.pointsTotal} points package`,
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

  // For non-EGP currencies, payment gateway integration required
  return next(
    new AppError(
      'Payment gateway for this currency is not yet integrated. Please use EGP currency or contact support.',
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
