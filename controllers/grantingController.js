const Granting = require('../models/grantingModel');
const Transaction = require('../models/transactionModel');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const paymobService = require('../utils/payment/paymob');
const logger = require('../utils/logger');

// Create a new granting/donation
exports.createGranting = catchAsync(async (req, res, next) => {
  const { amount, currency, message } = req.body;

  // Validate and convert amount to number
  const amountNum = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  if (!amountNum || isNaN(amountNum) || amountNum <= 0) {
    return next(new AppError('Please provide a valid amount greater than 0', 400));
  }

  if (!currency || !['EGP', 'USD'].includes(currency)) {
    return next(new AppError('Currency must be either EGP or USD', 400));
  }

  // Validate minimum amount based on currency
  if (currency === 'EGP' && amountNum < 100) {
    return next(new AppError('Minimum amount for EGP is 100 EGP', 400));
  } else if (currency === 'USD' && amountNum < 1) {
    return next(new AppError('Minimum amount for USD is 1 USD', 400));
  }

  // Create granting record
  const granting = await Granting.create({
    user: req.user._id,
    amount: amountNum,
    currency,
    message: message || '',
    status: 'pending',
    paymentMethod: currency === 'EGP' ? 'paymob' : 'paypal', // EGP uses Paymob, USD uses PayPal
  });

  // Calculate processing fee (3% for EGP)
  const processingFee = currency === 'EGP' ? amountNum * 0.03 : 0;
  const totalAmount = amountNum + processingFee;

  // Create transaction record
  const transaction = await Transaction.create({
    user: req.user._id,
    type: 'granting',
    amount: totalAmount,
    currency,
    status: 'pending',
    description: message || `Support Freshlancer - ${currency} ${amount} donation`,
    metadata: {
      grantingId: granting._id.toString(),
      originalAmount: amount,
      processingFee,
      message: message || '',
    },
  });

  // Link transaction to granting
  granting.transaction = transaction._id;
  await granting.save();

  // Create payment intention with Paymob (for EGP) or PayPal (for USD)
  let paymentIntention;
  
  if (currency === 'EGP') {
    try {
      paymentIntention = await paymobService.createPaymentIntention({
        amount: totalAmount,
        currency: 'EGP',
        items: [
          {
            name: 'Support Freshlancer - Student Support',
            amount: totalAmount,
            description: message || 'Supporting students through Freshlancer',
            quantity: 1,
          },
        ],
        customer: {
          firstName: req.user.name?.split(' ')[0] || 'User',
          lastName: req.user.name?.split(' ').slice(1).join(' ') || '',
          email: req.user.email,
        },
        billingData: {
          email: req.user.email,
          firstName: req.user.name?.split(' ')[0] || 'User',
          lastName: req.user.name?.split(' ').slice(1).join(' ') || '',
          phoneNumber: req.user.phone || '+201000000000',
        },
        extras: {
          granting_id: granting._id.toString(),
          transaction_id: transaction._id.toString(),
        },
      });

      // Update transaction with intention ID
      transaction.metadata.set('intentionId', paymentIntention.intentionId);
      transaction.metadata.set('clientSecret', paymentIntention.clientSecret);
      await transaction.save();

      // Update granting with intention ID
      granting.metadata.set('intentionId', paymentIntention.intentionId);
      granting.metadata.set('clientSecret', paymentIntention.clientSecret);
      await granting.save();

      logger.info('Granting payment intention created:', {
        grantingId: granting._id,
        intentionId: paymentIntention.intentionId,
        amount: totalAmount,
        currency,
        hasClientSecret: !!paymentIntention.clientSecret,
        hasPaymentUrl: !!paymentIntention.paymentUrl,
      });

      // Construct payment URL if clientSecret is available but paymentUrl is not
      let paymentUrl = paymentIntention.paymentUrl;
      if (!paymentUrl && paymentIntention.clientSecret) {
        const publicKey = process.env.PAYMOB_PUBLIC_KEY || 'egy_pk_test_xgfkuiZo2us0viNDmSCVU1OvNnJQOUwv';
        paymentUrl = `https://accept.paymob.com/unifiedcheckout/?publicKey=${publicKey}&clientSecret=${paymentIntention.clientSecret}`;
      }

      res.status(201).json({
        status: 'success',
        message: 'Granting created successfully',
        data: {
          granting: {
            id: granting._id,
            amount: amountNum,
            currency,
            totalAmount,
            processingFee,
            status: granting.status,
            paymentUrl: paymentUrl || null,
            clientSecret: paymentIntention.clientSecret || null,
            intentionId: paymentIntention.intentionId,
          },
        },
      });
    } catch (error) {
      logger.error('Failed to create Paymob payment intention for granting:', {
        error: error.message,
        grantingId: granting._id,
      });
      
      // Update granting and transaction status to failed
      granting.status = 'failed';
      transaction.status = 'failed';
      await Promise.all([granting.save(), transaction.save()]);

      return next(new AppError('Failed to create payment intention. Please try again.', 500));
    }
  } else {
    // USD payments - PayPal integration (to be implemented)
    return next(new AppError('USD payments are not yet supported. Please use EGP.', 400));
  }
});

// Get user's granting history
exports.getMyGrantings = catchAsync(async (req, res, next) => {
  const grantings = await Granting.find({ user: req.user._id })
    .sort('-createdAt')
    .populate('transaction', 'status amount currency completedAt');

  res.status(200).json({
    status: 'success',
    results: grantings.length,
    data: {
      grantings,
    },
  });
});

// Get all grantings (admin only)
exports.getAllGrantings = catchAsync(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const filter = {};
  if (req.query.status) {
    filter.status = req.query.status;
  }
  if (req.query.currency) {
    filter.currency = req.query.currency;
  }

  // Date range filter
  if (req.query.startDate || req.query.endDate) {
    filter.createdAt = {};
    if (req.query.startDate) {
      filter.createdAt.$gte = new Date(req.query.startDate);
    }
    if (req.query.endDate) {
      const endDate = new Date(req.query.endDate);
      endDate.setHours(23, 59, 59, 999); // Include the entire end date
      filter.createdAt.$lte = endDate;
    }
  }

  // Search by user name or email
  if (req.query.search) {
    const User = require('../models/userModel');
    const searchRegex = new RegExp(req.query.search, 'i');
    const users = await User.find({
      $or: [
        { name: searchRegex },
        { email: searchRegex },
      ],
    }).select('_id');
    const userIds = users.map(u => u._id);
    filter.user = { $in: userIds };
  }

  const grantings = await Granting.find(filter)
    .populate('user', 'name email role')
    .populate('transaction', 'status amount currency completedAt')
    .sort('-createdAt')
    .skip(skip)
    .limit(limit);

  const total = await Granting.countDocuments(filter);

  res.status(200).json({
    status: 'success',
    results: grantings.length,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
    data: {
      grantings,
    },
  });
});

// Get granting statistics (admin only)
exports.getGrantingStats = catchAsync(async (req, res, next) => {
  const totalGrantings = await Granting.countDocuments();
  const completedGrantings = await Granting.countDocuments({ status: 'completed' });
  const pendingGrantings = await Granting.countDocuments({ status: 'pending' });
  const failedGrantings = await Granting.countDocuments({ status: 'failed' });

  // Calculate total amounts
  const totalAmounts = await Granting.aggregate([
    {
      $match: { status: 'completed' },
    },
    {
      $group: {
        _id: '$currency',
        total: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
  ]);

  const stats = {
    total: totalGrantings,
    completed: completedGrantings,
    pending: pendingGrantings,
    failed: failedGrantings,
    totalAmounts: totalAmounts.reduce((acc, curr) => {
      acc[curr._id] = {
        total: curr.total,
        count: curr.count,
      };
      return acc;
    }, {}),
  };

  res.status(200).json({
    status: 'success',
    data: {
      stats,
    },
  });
});

