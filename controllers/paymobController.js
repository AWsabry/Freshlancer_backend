const paymobService = require('../utils/paymob');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const Transaction = require('../models/transactionModel');
const User = require('../models/userModel');
const { encryptCookie, decryptCookie } = require('../utils/encryption');

// Handle Paymob webhook
exports.handleWebhook = catchAsync(async (req, res, next) => {
  const webhookData = req.body;

  console.log('=== PAYMOB WEBHOOK RECEIVED ===');
  console.log('Timestamp:', new Date().toISOString());

  // Process webhook data
  const processedData = paymobService.processWebhook(webhookData);

  console.log('\n📊 PAYMENT STATUS SUMMARY:');
  console.log('Transaction ID:', processedData.transactionId);
  console.log('Intention/Order ID:', processedData.intentionId);
  console.log('Amount:', `${processedData.currency} ${processedData.amount}`);
  console.log('Status:', processedData.status);
  console.log('Is Paid:', processedData.isPaid ? '✅ YES' : '❌ NO');
  console.log('Payment Method:', processedData.paymentMethod);

  if (processedData.cardType) {
    console.log('Card Type:', processedData.cardType);
    console.log('Card Last 4:', processedData.cardLastFour);
  }

  console.log('\nFull Webhook Payload:', JSON.stringify(webhookData, null, 2));
  console.log('Processed Webhook Data:', JSON.stringify(processedData, null, 2));

  // Find and update transaction
  const transaction = await Transaction.findOne({
    'metadata.intentionId': processedData.intentionId,
  });

  if (!transaction) {
    return next(new AppError('Transaction not found', 404));
  }

  // Update transaction status
  transaction.status = processedData.isPaid ? 'completed' : 'failed';
  if (processedData.isPaid) {
    transaction.completedAt = Date.now();
  }
  transaction.metadata = {
    ...transaction.metadata,
    webhookData: processedData,
    transactionId: processedData.transactionId,
    orderId: processedData.orderId,
  };
  await transaction.save();

  // If payment is successful, handle based on transaction type
  if (processedData.isPaid) {
    const Subscription = require('../models/subscriptionModel');
    const Notification = require('../models/notificationModel');

    const user = await User.findById(transaction.user);

    if (transaction.type === 'subscription_payment') {
      // Handle subscription upgrade
      const subscription = await Subscription.findById(transaction.relatedId);

      if (subscription) {
        // Only upgrade if not already active (prevent duplicate upgrades)
        if (subscription.status !== 'active' || subscription.plan !== 'premium') {
          subscription.plan = 'premium';
          subscription.status = 'active';
          subscription.startDate = Date.now();
          const endDate = new Date();
          endDate.setMonth(endDate.getMonth() + 1);
          subscription.endDate = endDate;
          subscription.lastPaymentDate = Date.now();
          subscription.applicationLimitPerMonth = 100;
          await subscription.save();

          if (user && user.studentProfile) {
            user.studentProfile.subscriptionTier = 'premium';
            user.studentProfile.subscriptionStartDate = Date.now();
            // Set expiry to 1 month from now
            const expiryDate = new Date();
            expiryDate.setMonth(expiryDate.getMonth() + 1);
            user.studentProfile.subscriptionExpiryDate = expiryDate;
            await user.save({ validateBeforeSave: false });

            // Note: Notification will be created in completePaymentSuccess to avoid duplicates
          }

          console.log('Subscription activated for user:', user._id);
        } else {
          console.log('Subscription already active - skipping duplicate activation');
        }
      }
    } else if (transaction.type === 'package_purchase') {
      // Handle package purchase (points) - directly update user points
      if (transaction.points && transaction.status === 'completed') {
        // Only add points if not already processed (check a flag we'll add)
        if (!transaction.pointsProcessed) {
          if (user && user.clientProfile) {
            const previousPoints = user.clientProfile.pointsRemaining || 0;
            user.clientProfile.pointsRemaining = previousPoints + transaction.points;
            await user.save({ validateBeforeSave: false });

            // Mark transaction as processed
            transaction.pointsProcessed = true;
            await transaction.save();

            console.log('Package activated for user:', user._id);
            console.log('Points added:', transaction.points, '(', previousPoints, '→', user.clientProfile.pointsRemaining, ')');
          }
        } else {
          console.log('Package already completed - skipping duplicate activation');
        }
      }
    }
  }

  res.status(200).json({
    status: 'success',
    message: 'Webhook processed successfully',
  });
});

// Get payment status as JSON (for frontend to check status)
exports.getPaymentStatus = catchAsync(async (req, res, next) => {
  console.log('\n========================================');
  console.log('🔔 PAYMOB PAYMENT STATUS CALLBACK');
  console.log('========================================');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Method:', req.method);

  // Log full request details
  console.log('\n📦 REQUEST BODY:');
  console.log(JSON.stringify(req.body, null, 2));

  console.log('\n🔍 QUERY PARAMETERS:');
  console.log(JSON.stringify(req.query, null, 2));

  // Paymob can send data in two ways:
  // 1. POST with body containing {type, obj, issuer_bank}
  // 2. GET with query parameters (flattened transaction data)

  let pending, success, intentionId, transactionId;

  if (req.method === 'POST' && req.body.obj) {
    // POST request with full transaction object
    const { type, obj } = req.body;

    console.log('\n🎯 PAYMOB CALLBACK (POST):');
    console.log('- Callback Type:', type || 'N/A');
    console.log('- Transaction ID:', obj.id || 'N/A');
    console.log('- Pending:', obj.pending);
    console.log('- Success:', obj.success);
    console.log('- Amount (cents):', obj.amount_cents || 'N/A');
    console.log('- Currency:', obj.currency || 'N/A');

    pending = obj.pending;
    success = obj.success;
    transactionId = obj.id;

    // Extract payment intention ID
    if (obj.payment_key_claims && obj.payment_key_claims.next_payment_intention) {
      intentionId = obj.payment_key_claims.next_payment_intention;
      console.log('- Payment Intention ID:', intentionId);
    }
  } else if (req.method === 'GET') {
    // GET request with flattened query parameters
    console.log('\n🎯 PAYMOB CALLBACK (GET):');
    console.log('- Transaction ID:', req.query.id || 'N/A');
    console.log('- Pending:', req.query.pending);
    console.log('- Success:', req.query.success);
    console.log('- Amount (cents):', req.query.amount_cents || 'N/A');
    console.log('- Currency:', req.query.currency || 'N/A');

    // Parse query parameters (they come as strings)
    pending = req.query.pending === 'true';
    success = req.query.success === 'true';
    transactionId = req.query.id;

    // Try to find intention ID from the transaction in database
    // Paymob doesn't send intention ID in GET callback, only transaction ID
    console.log('⚠️ Note: GET callback does not include intention ID directly');
  } else {
    console.log('❌ Error: Invalid callback format');
    return res.redirect(`${process.env.FRONTEND_URL}/payment/failed?error=invalid_format`);
  }

  console.log('\n✅ PAYMENT STATUS CHECK:');
  console.log('- Pending:', pending);
  console.log('- Success:', success);

  // Check if payment is successful: pending = false AND success = true
  if (pending === false && success === true) {
    console.log('✅ Payment Successful!');

    // For GET requests, we need to look up the intention ID from the transaction
    if (!intentionId && transactionId) {
      console.log('🔍 Looking up intention ID from transaction:', transactionId);
      try {
        const Transaction = require('../models/transactionModel');
        const transaction = await Transaction.findOne({
          'metadata.paymobTransactionId': transactionId
        });

        if (transaction && transaction.metadata && transaction.metadata.intentionId) {
          intentionId = transaction.metadata.intentionId;
          console.log('✅ Found intention ID:', intentionId);
        } else {
          console.log('⚠️ Transaction not found or no intention ID');
        }
      } catch (error) {
        console.log('⚠️ Error looking up transaction:', error.message);
      }
    }

    if (intentionId) {
      console.log('\n🍪 SETTING COOKIE:');
      console.log('- Cookie name: paymob_intention_id');
      console.log('- Cookie value:', intentionId);
      console.log('- Cookie options:', {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        maxAge: '1 hour (3600000ms)',
        sameSite: 'lax'
      });

      // Set encrypted cookie to be used by complete-success endpoint and frontend
      // Note: httpOnly is false to allow frontend JavaScript access
      const encryptedIntentionId = encryptCookie(intentionId, 1); // 1 hour expiry
      res.cookie('paymob_intention_id', encryptedIntentionId, {
        httpOnly: false, // Allow JavaScript access for frontend
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 1000, // 1 hour
        sameSite: 'lax'
      });

      console.log('✅ Cookie set successfully');
      console.log(`\n🔄 Redirecting to backend: ${process.env.BASE_URL}/api/v1/paymob/complete-success`);
      console.log('========================================\n');
      return res.redirect(`${process.env.BASE_URL}/api/v1/paymob/complete-success`);
    } else {
      console.log('⚠️ Warning: Missing intention ID, redirecting to frontend success without ID');
      console.log('========================================\n');
      return res.redirect(`${process.env.FRONTEND_URL}/payment/success`);
    }
  } else {
    console.log('❌ Payment Failed or Pending!');

    const failureReason = pending ? 'pending' : 'failed';
    console.log(`\n🔄 Redirecting to: ${process.env.FRONTEND_URL}/payment/failed?reason=${failureReason}`);
    console.log('========================================\n');
    return res.redirect(`${process.env.FRONTEND_URL}/payment/failed?reason=${failureReason}`);
  }
});

// Complete payment success handler - updates everything
exports.completePaymentSuccess = catchAsync(async (req, res, next) => {
  console.log('\n=== COMPLETE PAYMENT SUCCESS ===');
  console.log('Timestamp:', new Date().toISOString());

  // Log all cookies received
  console.log('\n🍪 ALL COOKIES RECEIVED:');
  console.log(JSON.stringify(req.cookies, null, 2));

  // Check specifically for paymob_intention_id cookie
  console.log('\n🔍 CHECKING FOR PAYMOB COOKIE:');
  console.log('- Cookie exists:', !!req.cookies.paymob_intention_id);
  console.log('- Encrypted Cookie value:', req.cookies.paymob_intention_id || 'NOT FOUND');

  // Decrypt cookie if it exists
  let decryptedCookieValue = null;
  if (req.cookies.paymob_intention_id) {
    try {
      decryptedCookieValue = decryptCookie(req.cookies.paymob_intention_id);
      console.log('- Decrypted Cookie value:', decryptedCookieValue || 'DECRYPTION FAILED');
    } catch (error) {
      console.log('- Cookie decryption error:', error.message);
    }
  }

  // Log query parameters
  console.log('\n📋 QUERY PARAMETERS:');
  console.log('- Query id:', req.query.id || 'N/A');
  console.log('- All query params:', JSON.stringify(req.query, null, 2));

  // Try to get intentionId from query parameter, decrypted cookie, or find the latest pending transaction
  let intentionId = req.query.id || decryptedCookieValue;

  console.log('\n✅ INTENTION ID RESOLUTION:');
  console.log('- Source: Query =', req.query.id ? '✓' : '✗', '| Cookie =', decryptedCookieValue ? '✓' : '✗');
  console.log('- Initial intentionId:', intentionId || 'NOT FOUND');

  // If no intentionId provided, try to find the most recent pending transaction
  if (!intentionId) {
    console.log('⚠️ No intentionId provided, searching for latest pending transaction...');

    try {
      const latestTransaction = await Transaction.findOne({
        status: 'pending',
        type: { $in: ['subscription_payment', 'package_purchase'] }
      })
      .sort({ createdAt: -1 })
      .limit(1);

      if (latestTransaction && latestTransaction.metadata && latestTransaction.metadata.intentionId) {
        intentionId = latestTransaction.metadata.intentionId;
        console.log('✅ Found intentionId from latest pending transaction:', intentionId);
      } else {
        console.log('❌ No pending transaction found with intentionId');
      }
    } catch (error) {
      console.log('❌ Error searching for transaction:', error.message);
    }
  }

  if (!intentionId) {
    console.log('❌ Error: Missing intention ID - could not find from query, cookie, or database');
    return res.redirect(`${process.env.FRONTEND_URL}/payment/failed?error=missing_id`);
  }

  console.log('✅ Using Intention ID:', intentionId);

  try {
    // Find transaction by intention ID
    const transaction = await Transaction.findOne({
      'metadata.intentionId': intentionId,
    }).populate('user');

    if (!transaction) {
      console.log('❌ Error: Transaction not found for intention ID:', intentionId);
      return res.redirect(`${process.env.FRONTEND_URL}/payment/failed?error=transaction_not_found`);
    }

    console.log('✅ Transaction found:', transaction._id);
    console.log('Transaction type:', transaction.type);
    console.log('Current status:', transaction.status);

    // Update transaction status to completed if not already
    if (transaction.status !== 'completed') {
      console.log('Updating transaction status to completed');
      transaction.status = 'completed';
      transaction.completedAt = Date.now();
      transaction.metadata.set('verifiedAt', Date.now());
      transaction.metadata.set('successCallbackReceived', Date.now());
      await transaction.save();
      console.log('✅ Transaction status updated');
    } else {
      console.log('Transaction already completed');
    }

    // Get required models
    const Subscription = require('../models/subscriptionModel');
    const Notification = require('../models/notificationModel');

    const user = await User.findById(transaction.user);

    if (!user) {
      console.log('❌ Error: User not found:', transaction.user);
      return res.redirect(`${process.env.FRONTEND_URL}/payment/failed?error=user_not_found`);
    }

    console.log('✅ User found:', user._id, user.email);

    // Handle subscription payment
    if (transaction.type === 'subscription_payment') {
      console.log('\n=== UPGRADING SUBSCRIPTION TO PREMIUM ===');

      const subscription = await Subscription.findById(transaction.relatedId);

      if (subscription) {
        console.log('Subscription found:', subscription._id);
        console.log('Current plan:', subscription.plan);
        console.log('Current status:', subscription.status);

        // Only upgrade if not already active premium (prevent duplicate upgrades and notifications)
        if (subscription.status !== 'active' || subscription.plan !== 'premium') {
          subscription.plan = 'premium';
          subscription.status = 'active';
          subscription.startDate = Date.now();
          const endDate = new Date();
          endDate.setMonth(endDate.getMonth() + 1);
          subscription.endDate = endDate;
          subscription.lastPaymentDate = Date.now();
          subscription.applicationLimitPerMonth = 100;
          await subscription.save();

          console.log('✅ Subscription upgraded to:', subscription.plan);
          console.log('End date:', endDate);

          // Update user profile to premium
          if (user.studentProfile) {
            console.log('Updating user studentProfile to premium');

            user.studentProfile.subscriptionTier = 'premium';
            user.studentProfile.subscriptionStartDate = Date.now();
            const expiryDate = new Date();
            expiryDate.setMonth(expiryDate.getMonth() + 1);
            user.studentProfile.subscriptionExpiryDate = expiryDate;
            await user.save({ validateBeforeSave: false });

            console.log('✅ User profile upgraded to premium');
            console.log('Expiry date:', expiryDate);

            // Create notification
            await Notification.create({
              user: user._id,
              type: 'subscription_renewed',
              title: 'Premium Subscription Activated',
              message: 'Your premium subscription is now active! You can now apply to up to 100 jobs per month.',
              relatedId: subscription._id,
              relatedType: 'Subscription',
              priority: 'high',
              icon: 'success',
            });

            console.log('✅ Notification created');
          } else {
            console.log('⚠️ Warning: User has no studentProfile');
          }
        } else {
          console.log('⚠️ Subscription already active premium - skipping upgrade and notification to prevent duplicates');
        }
      } else {
        console.log('⚠️ Warning: Subscription not found for ID:', transaction.relatedId);
      }

      console.log('=== SUBSCRIPTION UPGRADE COMPLETE ===\n');
    } 
    // Handle package purchase
    else if (transaction.type === 'package_purchase') {
      console.log('\n=== ACTIVATING PACKAGE PURCHASE ===');
      console.log('Transaction points:', transaction.points);
      console.log('Points processed:', transaction.pointsProcessed);

      // Only add points if not already processed (prevent double-adding)
      if (!transaction.pointsProcessed && transaction.points) {
        if (user.clientProfile) {
          const previousPoints = user.clientProfile.pointsRemaining || 0;
          user.clientProfile.pointsRemaining = previousPoints + transaction.points;
          await user.save({ validateBeforeSave: false });

          console.log('✅ User points updated:', previousPoints, '→', user.clientProfile.pointsRemaining);

          // Mark transaction as processed
          transaction.pointsProcessed = true;
          await transaction.save();

          // Create notification
          await Notification.create({
            user: user._id,
            type: 'system_announcement',
            title: 'Points Added Successfully',
            message: `${transaction.points} points have been added to your account! You now have ${user.clientProfile.pointsRemaining} points available.`,
            relatedId: transaction._id,
            relatedType: 'Transaction',
            icon: 'success',
          });

          console.log('✅ Notification created');
        } else {
          console.log('⚠️ Warning: User has no clientProfile');
        }
      } else {
        console.log('⚠️ Package already completed - skipping points addition to prevent duplicates');
      }

      console.log('=== PACKAGE ACTIVATION COMPLETE ===\n');
    }

    // Clear the intention ID cookie after successful processing
    console.log('🍪 Clearing intentionId cookie');
    res.clearCookie('paymob_intention_id');

    // Redirect to frontend success page
    console.log('\n📤 REDIRECTING TO FRONTEND SUCCESS PAGE');
    console.log(`Redirect URL: ${process.env.FRONTEND_URL}/payment/success`);
    console.log('=== END COMPLETE PAYMENT SUCCESS ===\n');

    return res.redirect(`${process.env.FRONTEND_URL}/payment/success`);
  } catch (error) {
    console.error('❌ Payment success processing error:', error);
    console.error('Error stack:', error.stack);
    console.log('=== END COMPLETE PAYMENT SUCCESS (ERROR) ===\n');

    return res.redirect(`${process.env.FRONTEND_URL}/payment/failed?error=processing_error`);
  }
});

// Success callback - called after successful payment (Paymob redirect endpoint)
exports.paymentSuccess = catchAsync(async (req, res, next) => {
  const { id } = req.query; // Paymob sends 'id' as the intention ID

  console.log('=== PAYMENT SUCCESS CALLBACK ===');
  console.log('Intention ID:', id);
  console.log('Redirecting to frontend with ID...');

  if (!id) {
    console.log('❌ Missing intention ID');
    return res.redirect(`${process.env.FRONTEND_URL}/payment/failed?error=missing_id`);
  }

  // Simply redirect to frontend payment success page with the intention ID
  // The frontend will handle calling /complete-success to upgrade the subscription
  return res.redirect(`${process.env.FRONTEND_URL}/payment/success?id=${id}`);
});
