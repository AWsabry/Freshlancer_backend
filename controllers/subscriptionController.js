const Subscription = require('../models/subscriptionModel');
const User = require('../models/userModel');
const Transaction = require('../models/transactionModel');
const Notification = require('../models/notificationModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const paymobService = require('../utils/paymob');
const {
  getPremiumPrices,
  getPriceForCurrency,
  getCurrencyByCountry,
} = require('../utils/currencyRates');

// Get my subscription
exports.getMySubscription = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'student') {
    return next(new AppError('Only students have subscriptions', 403));
  }

  let subscription = await Subscription.findOne({
    student: req.user._id,
    status: 'active',
  });

  // Create free subscription if none exists
  if (!subscription) {
    subscription = await Subscription.create({
      student: req.user._id,
      plan: 'free',
      status: 'active',
    });
  }

  res.status(200).json({
    status: 'success',
    data: {
      subscription,
    },
  });
});

// Check application limit
exports.checkApplicationLimit = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'student') {
    return next(new AppError('Only students can check application limits', 403));
  }

  const User = require('../models/userModel');
  const student = await User.findById(req.user._id);

  if (!student) {
    return next(new AppError('Student not found', 404));
  }

  // Check if reset date has passed and reset counter if needed
  const now = new Date();
  const resetDate = student.studentProfile?.applicationLimitResetDate;

  if (resetDate && now >= resetDate) {
    // Reset the counter and set new reset date (first day of next month)
    const nextResetDate = new Date();
    nextResetDate.setMonth(nextResetDate.getMonth() + 1);
    nextResetDate.setDate(1);
    nextResetDate.setHours(0, 0, 0, 0);

    student.studentProfile.applicationsUsedThisMonth = 0;
    student.studentProfile.applicationLimitResetDate = nextResetDate;
    await student.save({ validateBeforeSave: false });
  }

  // Get subscription tier and limits
  const subscriptionTier = student.studentProfile?.subscriptionTier || 'free';
  const applicationsUsed = student.studentProfile?.applicationsUsedThisMonth || 0;
  const applicationResetDate = student.studentProfile?.applicationLimitResetDate;

  let monthlyLimit;
  if (subscriptionTier === 'premium') {
    monthlyLimit = 100; // Premium: 100 applications per month
  } else {
    monthlyLimit = 10; // Free: 10 applications per month
  }

  const canApply = applicationsUsed < monthlyLimit;

  res.status(200).json({
    status: 'success',
    data: {
      canApply,
      reason: canApply ? null : `You have reached your monthly limit of ${monthlyLimit} applications`,
      currentUsage: applicationsUsed,
      limit: monthlyLimit,
      plan: subscriptionTier,
      resetDate: applicationResetDate,
    },
  });
});

// Upgrade to premium
exports.upgradeToPremium = catchAsync(async (req, res, next) => {
  console.log('\n=== SUBSCRIPTION UPGRADE REQUEST ===');
  console.log('Timestamp:', new Date().toISOString());
  console.log('User ID:', req.user._id);
  console.log('User Role:', req.user.role);
  console.log('Request Body:', JSON.stringify(req.body, null, 2));

  if (req.user.role !== 'student') {
    console.log('❌ Error: Only students can upgrade subscriptions');
    return next(new AppError('Only students can upgrade subscriptions', 403));
  }

  // Find current subscription
  let subscription = await Subscription.findOne({
    student: req.user._id,
    status: 'active',
  });

  console.log('Current Subscription:', subscription ? {
    id: subscription._id,
    plan: subscription.plan,
    status: subscription.status
  } : 'No active subscription found');

  if (subscription && subscription.plan === 'premium') {
    console.log('❌ Error: User already has premium subscription');
    return next(new AppError('You already have a premium subscription', 400));
  }

  // Get currency and billing cycle from request
  const currency = req.body.currency || 'EGP';

  const billingCycle = req.body.billingCycle || 'monthly';
  
  console.log('Currency:', currency);
  console.log('Billing Cycle:', billingCycle);

  // Validate currency
  const supportedCurrencies = ['USD', 'EGP', 'EUR', 'GBP', 'AED', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR', 'JOD', 'LBP', 'ILS', 'TRY', 'ZAR', 'MAD', 'TND', 'DZD', 'NGN', 'KES', 'GHS', 'UGX', 'TZS', 'ETB', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'HRK', 'RUB', 'UAH'];
  if (!supportedCurrencies.includes(currency)) {
    return next(new AppError(`Currency ${currency} is not supported`, 400));
  }

  // Get price for the selected currency
  const premiumPrice = getPriceForCurrency(currency, billingCycle);
  console.log('Premium Price:', premiumPrice, currency);

  // Create or update subscription
  if (subscription) {
    console.log('📝 Updating existing subscription to premium');
    // Upgrade existing subscription
    subscription.plan = 'premium';
    subscription.applicationLimitPerMonth = 100; // Premium gets 100 applications per month
    subscription.price = {
      amount: premiumPrice,
      currency: currency,
    };
    subscription.billingCycle = billingCycle;
    subscription.autoRenew = req.body.autoRenew || true;
    subscription.paymentMethodId = req.body.paymentMethodId;
    subscription.nextBillingDate = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000
    ); // 30 days from now
    subscription.status = 'pending'; // Set to pending until payment is confirmed

    await subscription.save();
    console.log('✅ Subscription updated:', {
      id: subscription._id,
      plan: subscription.plan,
      status: subscription.status,
      price: subscription.price
    });
  } else {
    console.log('📝 Creating new premium subscription');
    // Create new premium subscription
    subscription = await Subscription.create({
      student: req.user._id,
      plan: 'premium',
      status: 'pending', // Set to pending until payment is confirmed
      applicationLimitPerMonth: 100, // Premium gets 100 applications per month
      price: {
        amount: premiumPrice,
        currency: currency,
      },
      billingCycle: billingCycle,
      autoRenew: req.body.autoRenew || true,
      paymentMethodId: req.body.paymentMethodId,
      nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    console.log('✅ Subscription created:', {
      id: subscription._id,
      plan: subscription.plan,
      status: subscription.status,
      price: subscription.price
    });
  }

  // Create transaction record
  console.log('📝 Creating transaction record');
  const transaction = await Transaction.create({
    user: req.user._id,
    type: 'subscription_payment',
    amount: premiumPrice,
    currency: currency,
    status: 'pending',
    paymentMethod: req.body.paymentMethod || 'credit_card',
    description: `Premium subscription - ${billingCycle} billing (${currency})`,
    relatedId: subscription._id,
    relatedType: 'Subscription',
  });
  console.log('✅ Transaction created:', {
    id: transaction._id,
    type: transaction.type,
    amount: transaction.amount,
    currency: transaction.currency,
    status: transaction.status
  });

  // If currency is EGP, use Paymob payment gateway
  if (currency === 'EGP') {
    console.log('\n💳 Initiating Paymob payment for EGP subscription upgrade');
    try {
      // Get user information
      const user = await User.findById(req.user._id);
      console.log('User Info:', {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone
      });

      // Prepare customer data
      const customer = {
        firstName: user.name?.split(' ')[0] || 'Guest',
        lastName: user.name?.split(' ').slice(1).join(' ') || 'User',
        email: user.email,
        phone: user.phone || '+201000000000',
        extras: {
          userId: user._id.toString(),
          userRole: user.role,
          paymentType: 'subscription',
          subscriptionId: subscription._id.toString(),
        },
      };
      console.log('Customer Data:', JSON.stringify(customer, null, 2));

      // Create Paymob payment intention
      console.log('📞 Calling Paymob API to create payment intention...');
      const paymentIntention = await paymobService.createPaymentIntention({
        amount: premiumPrice,
        currency: 'EGP',
        items: [{
          name: 'Premium Subscription',
          amount: premiumPrice,
          description: `Premium subscription - ${billingCycle} billing`,
          quantity: 1,
        }],
        billingData: req.body.billingData,
        customer,
        integrationId: req.body.integrationId,
      });

      console.log('✅ Paymob Payment Intention Created:', {
        intentionId: paymentIntention.intentionId,
        clientSecret: paymentIntention.clientSecret ? '***' : null,
        paymentUrl: paymentIntention.paymentUrl
      });

      // Update transaction with Paymob details
      transaction.metadata = {
        intentionId: paymentIntention.intentionId,
        clientSecret: paymentIntention.clientSecret,
        paymentUrl: paymentIntention.paymentUrl,
      };
      await transaction.save();
      console.log('✅ Transaction updated with Paymob details');

      // Set intentionId in cookie (clear old one first)
      // Cookie expires in 1 hour
      // Note: httpOnly is false to allow frontend JavaScript access
      console.log('🍪 Setting intentionId cookie:', paymentIntention.intentionId);
      res.cookie('paymob_intention_id', paymentIntention.intentionId, {
        httpOnly: false, // Allow JavaScript access for frontend
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 1000, // 1 hour
        sameSite: 'lax'
      });

      // Prepare response
      const responseData = {
        status: 'success',
        data: {
          subscription,
          transaction,
          paymentUrl: paymentIntention.paymentUrl,
          clientSecret: paymentIntention.clientSecret,
          intentionId: paymentIntention.intentionId,
          message: 'Please complete payment with Paymob',
        },
      };

      console.log('\n📤 RESPONSE OUTPUT:');
      console.log('Status Code: 200');
      console.log('Response Data:', JSON.stringify({
        status: responseData.status,
        data: {
          subscription: {
            id: responseData.data.subscription._id,
            plan: responseData.data.subscription.plan,
            status: responseData.data.subscription.status
          },
          transaction: {
            id: responseData.data.transaction._id,
            type: responseData.data.transaction.type,
            amount: responseData.data.transaction.amount,
            status: responseData.data.transaction.status
          },
          paymentUrl: responseData.data.paymentUrl,
          intentionId: responseData.data.intentionId,
          message: responseData.data.message
        }
      }, null, 2));
      console.log('=== END SUBSCRIPTION UPGRADE REQUEST ===\n');

      // Return payment URL to redirect user to Paymob
      return res.status(200).json(responseData);
    } catch (error) {
      // If Paymob fails, return error
      console.error('❌ Paymob payment creation failed:', error);
      console.error('Error Details:', {
        message: error.message,
        stack: error.stack,
        response: error.response?.data
      });
      console.log('=== END SUBSCRIPTION UPGRADE REQUEST (ERROR) ===\n');
      return next(new AppError('Failed to create payment. Please try again.', 500));
    }
  }

  // For non-EGP currencies, payment gateway integration required
  console.log('❌ Error: Payment gateway not integrated for currency:', currency);
  console.log('=== END SUBSCRIPTION UPGRADE REQUEST (ERROR) ===\n');
  return next(
    new AppError(
      'Payment gateway for this currency is not yet integrated. Please use EGP currency or contact support.',
      400
    )
  );
});

// Cancel subscription
exports.cancelSubscription = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'student') {
    return next(new AppError('Only students can cancel subscriptions', 403));
  }

  const subscription = await Subscription.findOne({
    student: req.user._id,
    status: 'active',
  });

  if (!subscription) {
    return next(new AppError('No active subscription found', 404));
  }

  if (subscription.plan === 'free') {
    return next(new AppError('Cannot cancel free subscription', 400));
  }

  subscription.status = 'cancelled';
  subscription.cancelledAt = Date.now();
  subscription.cancelledBy = req.user._id;
  subscription.cancellationReason = req.body.reason;
  subscription.autoRenew = false;

  await subscription.save();

  // Create free subscription to replace premium
  await Subscription.create({
    student: req.user._id,
    plan: 'free',
    status: 'active',
  });

  // Create notification
  await Notification.create({
    user: req.user._id,
    type: 'subscription_expiring',
    title: 'Subscription Cancelled',
    message: 'Your premium subscription has been cancelled. You now have a free account.',
    relatedId: subscription._id,
    relatedType: 'Subscription',
    priority: 'normal',
    icon: 'info',
  });

  res.status(200).json({
    status: 'success',
    data: {
      subscription,
      message:
        'Subscription cancelled successfully. You have been downgraded to free plan.',
    },
  });
});

// Renew subscription (auto-renewal)
exports.renewSubscription = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'student') {
    return next(new AppError('Only students can renew subscriptions', 403));
  }

  const subscription = await Subscription.findOne({
    student: req.user._id,
    status: 'active',
  });

  if (!subscription) {
    return next(new AppError('No active subscription found', 404));
  }

  if (subscription.plan === 'free') {
    return next(new AppError('Free subscriptions do not need renewal', 400));
  }

  // Create renewal transaction
  const transaction = await Transaction.create({
    user: req.user._id,
    type: 'subscription_payment',
    amount: subscription.price.amount,
    currency: subscription.price.currency,
    status: 'pending',
    paymentMethod: req.body.paymentMethod || 'credit_card',
    description: `Premium subscription renewal - ${subscription.billingCycle}`,
    relatedId: subscription._id,
    relatedType: 'Subscription',
  });

  // Update subscription dates
  subscription.lastPaymentDate = Date.now();
  subscription.nextBillingDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await subscription.save();

  res.status(200).json({
    status: 'success',
    data: {
      subscription,
      transaction,
      message: 'Subscription renewed successfully',
    },
  });
});

// Get subscription history
exports.getSubscriptionHistory = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'student') {
    return next(new AppError('Only students can view subscription history', 403));
  }

  const subscriptions = await Subscription.find({
    student: req.user._id,
  }).sort('-createdAt');

  res.status(200).json({
    status: 'success',
    results: subscriptions.length,
    data: {
      subscriptions,
    },
  });
});

// Admin: Get all subscriptions
exports.getAllSubscriptions = catchAsync(async (req, res, next) => {
  const filter = {};
  if (req.query.plan) filter.plan = req.query.plan;
  if (req.query.status) filter.status = req.query.status;

  const subscriptions = await Subscription.find(filter).sort('-createdAt');

  res.status(200).json({
    status: 'success',
    results: subscriptions.length,
    data: {
      subscriptions,
    },
  });
});

// Admin: Get subscription statistics
exports.getSubscriptionStats = catchAsync(async (req, res, next) => {
  const stats = await Subscription.aggregate([
    {
      $match: { status: 'active' },
    },
    {
      $group: {
        _id: '$plan',
        count: { $sum: 1 },
        totalRevenue: {
          $sum: '$price.amount',
        },
      },
    },
  ]);

  const totalSubscriptions = await Subscription.countDocuments({ status: 'active' });

  res.status(200).json({
    status: 'success',
    data: {
      total: totalSubscriptions,
      stats,
    },
  });
});

// Get subscription pricing based on user's location/currency
exports.getSubscriptionPricing = catchAsync(async (req, res, next) => {
  // Get user's currency from their location or use provided currency
  const requestedCurrency = req.query.currency;
  let userCurrency = 'USD'; // Default

  // If user is logged in (optional), try to get currency from their profile
  if (req.user && req.user.id) {
    try {
      const user = await User.findById(req.user.id);
      if (user && user.location && user.location.country) {
        userCurrency = getCurrencyByCountry(user.location.country);
      }
    } catch (error) {
      // If user lookup fails, continue with default currency
      console.log('User lookup failed, using default currency');
    }
  }

  // Override with requested currency if provided
  const currency = requestedCurrency || userCurrency;

  // Get prices for all billing cycles
  const pricing = {
    currency,
    plans: {
      free: {
        name: 'Free',
        price: {
          amount: 0,
          currency,
        },
        features: [
          '10 job applications per month',
          'Basic profile',
          'Standard support',
        ],
      },
      premium: {
        name: 'Premium',
        billingCycles: {
          monthly: {
            price: {
              amount: getPriceForCurrency(currency, 'monthly'),
              currency,
            },
            savings: null,
          },
          quarterly: {
            price: {
              amount: getPriceForCurrency(currency, 'quarterly'),
              currency,
            },
            savings: Math.round(
              (getPriceForCurrency(currency, 'monthly') * 3 -
                getPriceForCurrency(currency, 'quarterly')) *
                100
            ) / 100,
          },
          yearly: {
            price: {
              amount: getPriceForCurrency(currency, 'yearly'),
              currency,
            },
            savings: Math.round(
              (getPriceForCurrency(currency, 'monthly') * 12 -
                getPriceForCurrency(currency, 'yearly')) *
                100
            ) / 100,
          },
        },
        features: [
          '100 job applications per month',
          'Profile boost (appear higher in search)',
          'Advanced analytics dashboard',
          'Priority customer support',
          'Verified badge',
          'See job budgets',
        ],
      },
    },
  };

  res.status(200).json({
    status: 'success',
    data: pricing,
  });
});
