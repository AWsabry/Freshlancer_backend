const Granting = require('../models/grantingModel');
const Transaction = require('../models/transactionModel');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const paymobService = require('../utils/payment/paymob');
const paypalService = require('../utils/payment/paypal');
const logger = require('../utils/logger');

// Create a new granting/donation
exports.createGranting = catchAsync(async (req, res, next) => {
  try {
    console.log('\n=== CREATING GRANTING ===');
    console.log('User ID:', req.user?._id);
    console.log('User Email:', req.user?.email);
    console.log('User Name:', req.user?.name);
    console.log('Request Body:', JSON.stringify(req.body, null, 2));

    const { amount, currency, message } = req.body;

    // Validate user exists
    if (!req.user || !req.user._id) {
      console.log('❌ Error: User not authenticated');
      return next(new AppError('User authentication required', 401));
    }

    // Validate user email exists
    if (!req.user.email) {
      console.log('❌ Error: User email is missing');
      return next(new AppError('User email is required. Please update your profile.', 400));
    }

    // Validate and convert amount to number
    const amountNum = typeof amount === 'string' ? parseFloat(amount) : amount;
    
    if (!amountNum || isNaN(amountNum) || amountNum <= 0) {
      console.log('❌ Error: Invalid amount:', amount);
      return next(new AppError('Please provide a valid amount greater than 0', 400));
    }

    if (!currency || !['EGP', 'USD'].includes(currency)) {
      console.log('❌ Error: Invalid currency:', currency);
      return next(new AppError('Currency must be either EGP or USD', 400));
    }

    // Validate minimum amount based on currency
    if (currency === 'EGP' && amountNum < 100) {
      console.log('❌ Error: Amount below minimum for EGP:', amountNum);
      return next(new AppError('Minimum amount for EGP is 100 EGP', 400));
    } else if (currency === 'USD' && amountNum < 1) {
      console.log('❌ Error: Amount below minimum for USD:', amountNum);
      return next(new AppError('Minimum amount for USD is 1 USD', 400));
    }

    console.log('✅ Validation passed');
    console.log('Creating granting record...');

    // Create granting record
    const granting = await Granting.create({
      user: req.user._id,
      amount: amountNum,
      currency,
      message: message || '',
      status: 'pending',
      paymentMethod: currency === 'EGP' ? 'paymob' : 'paypal', // EGP uses Paymob, USD uses PayPal
    });

    console.log('✅ Granting created:', granting._id);

    // Processing fee: EGP 3%; USD (PayPal) 2.9% + $0.30
    let processingFee = 0;
    if (currency === 'EGP') {
      processingFee = amountNum * 0.03;
    } else if (currency === 'USD') {
      processingFee = amountNum * 0.029 + 0.30;
    }
    const totalAmount = Math.round((amountNum + processingFee) * 100) / 100;

    console.log('Payment calculation:', {
      originalAmount: amountNum,
      processingFee,
      totalAmount,
      currency
    });

    // Create transaction record with retry logic for duplicate invoice numbers
    console.log('Creating transaction record...');
    let transaction;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        transaction = await Transaction.create({
          user: req.user._id,
          type: 'granting',
          amount: totalAmount,
          currency,
          status: 'pending',
          description: message || `Support Freshlancer - ${currency} ${amountNum} donation`,
          metadata: {
            paymentType: 'supporter', // Flag to identify supporter/donation payments
            grantingId: granting._id.toString(),
            originalAmount: amountNum,
            processingFee,
            message: message || '',
          },
        });
        console.log('✅ Transaction created:', transaction._id);
        break; // Success, exit retry loop
      } catch (error) {
        // Check if it's a duplicate invoice number error
        if (error.code === 11000 && error.keyPattern && error.keyPattern.invoiceNumber) {
          retryCount++;
          console.log(`⚠️ Duplicate invoice number detected, retrying (attempt ${retryCount}/${maxRetries})...`);
          
          if (retryCount >= maxRetries) {
            // If we've exhausted retries, delete the granting and return error
            await Granting.findByIdAndDelete(granting._id);
            console.error('❌ Failed to create transaction after retries:', error);
            return next(new AppError('Failed to create transaction due to invoice number conflict. Please try again.', 500));
          }
          
          // Wait a bit before retrying (to allow invoice number generation to catch up)
          await new Promise(resolve => setTimeout(resolve, 100));
        } else {
          // If it's a different error, throw it
          throw error;
        }
      }
    }

    // Link transaction to granting
    granting.transaction = transaction._id;
    await granting.save();
    console.log('✅ Transaction linked to granting');

    // Create payment intention with Paymob (for EGP) or PayPal (for USD)
    let paymentIntention;
    
    if (currency === 'EGP') {
      try {
        console.log('Creating Paymob payment intention...');
        
        // Prepare customer data with safe defaults
        const userName = req.user.name || 'User';
        const nameParts = userName.split(' ');
        const firstName = nameParts[0] || 'User';
        const lastName = nameParts.slice(1).join(' ') || '';
        
        const customerData = {
          firstName,
          lastName,
          email: req.user.email,
        };
        
        const billingData = {
          email: req.user.email,
          firstName,
          lastName,
          phoneNumber: req.user.phone || '+201000000000',
        };

        console.log('Customer Data:', JSON.stringify(customerData, null, 2));
        console.log('Billing Data:', JSON.stringify(billingData, null, 2));

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
          customer: customerData,
          billingData: billingData,
          extras: {
            granting_id: granting._id.toString(),
            transaction_id: transaction._id.toString(),
          },
        });

        console.log('✅ Paymob payment intention created:', paymentIntention.intentionId);

        // Update transaction with intention ID
        console.log('Updating transaction with Paymob details...');
        transaction.metadata.set('intentionId', paymentIntention.intentionId);
        transaction.metadata.set('clientSecret', paymentIntention.clientSecret);
        await transaction.save();
        console.log('✅ Transaction updated');

        // Update granting with intention ID
        console.log('Updating granting with Paymob details...');
        granting.metadata.set('intentionId', paymentIntention.intentionId);
        granting.metadata.set('clientSecret', paymentIntention.clientSecret);
        await granting.save();
        console.log('✅ Granting updated');

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

        console.log('✅ Granting creation complete');
        console.log('=== END CREATING GRANTING ===\n');

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
        console.error('❌ Error creating Paymob payment intention:', error);
        console.error('Error stack:', error.stack);
        logger.error('Failed to create Paymob payment intention for granting:', {
          error: error.message,
          errorStack: error.stack,
          grantingId: granting._id,
          userId: req.user._id,
        });
        
        // Update granting and transaction status to failed
        granting.status = 'failed';
        transaction.status = 'failed';
        await Promise.all([granting.save(), transaction.save()]);

        console.log('=== END CREATING GRANTING (ERROR) ===\n');
        return next(new AppError(`Failed to create payment intention: ${error.message}`, 500));
      }
    } else {
      // USD payments - PayPal
      const baseUrl = process.env.BASE_URL;
      const frontendUrl = process.env.FRONTEND_URL;
      if (!baseUrl || !frontendUrl) {
        return next(new AppError('Server URLs are not configured (BASE_URL, FRONTEND_URL)', 500));
      }
      const redirectBaseUrl = req.body.redirectBaseUrl || req.get('X-Frontend-Origin') || null;
      try {
        const { orderId, approvalUrl } = await paypalService.createOrder({
          amount: totalAmount,
          currency: 'USD',
          description: message || 'Support Freshlancer - Donation',
          customId: transaction._id.toString(),
          returnUrl: `${baseUrl}/api/v1/paypal/capture?tx=${transaction._id.toString()}`,
          cancelUrl: `${frontendUrl}/payment/failed?reason=cancelled`,
        });

        granting.paymentMethod = 'paypal';
        await granting.save();
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

        logger.info('Granting PayPal order created', { grantingId: granting._id, orderId });

        console.log('=== END CREATING GRANTING ===\n');
        return res.status(201).json({
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
            },
            gateway: 'paypal',
            approvalUrl,
            orderId,
          },
        });
      } catch (error) {
        if (error.errorCode === 'PAYPAL_NOT_CONFIGURED') {
          return next(new AppError('PayPal is not configured. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to the server environment.', 503));
        }
        console.error('PayPal order creation failed:', error);
        granting.status = 'failed';
        transaction.status = 'failed';
        await Promise.all([granting.save(), transaction.save()]);
        return next(new AppError(error.message || 'Failed to create PayPal payment. Please try again.', 500));
      }
    }
  } catch (error) {
    console.error('❌ Unexpected error in createGranting:', error);
    console.error('Error stack:', error.stack);
    logger.error('Unexpected error in createGranting:', {
      error: error.message,
      errorStack: error.stack,
      userId: req.user?._id,
    });
    console.log('=== END CREATING GRANTING (ERROR) ===\n');
    return next(new AppError(`An unexpected error occurred: ${error.message}`, 500));
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

