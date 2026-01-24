const paymobService = require('../utils/payment/paymob');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const Transaction = require('../models/transactionModel');
const User = require('../models/userModel');
const { encryptCookie, decryptCookie } = require('../utils/encryption');
const sendEmail = require('../utils/email');
const logger = require('../utils/logger');

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
    ...transaction.metadata.toObject ? transaction.metadata.toObject() : transaction.metadata,
    webhookData: processedData,
    transactionId: processedData.transactionId,
    orderId: processedData.orderId,
  };
  await transaction.save();

  // If payment is successful, handle based on transaction type
  if (processedData.isPaid) {
    const Subscription = require('../models/subscriptionModel');
    const Notification = require('../models/notificationModel');
    const Coupon = require('../models/couponModel');

    const user = await User.findById(transaction.user);

    // Record coupon usage if coupon was applied
    if (transaction.metadata?.coupon?.id && !transaction.metadata?.couponUsageRecorded) {
      console.log('🎫 Recording coupon usage for:', transaction.metadata.coupon.code);
      try {
        const coupon = await Coupon.findById(transaction.metadata.coupon.id);
        if (coupon && !coupon.hasUserUsedCoupon(user._id)) {
          await coupon.recordUsage(user._id);
          transaction.metadata.couponUsageRecorded = true;
          await transaction.save();
          console.log('✅ Coupon usage recorded successfully');
        } else {
          console.log('⚠️ Coupon already used or not found');
        }
      } catch (error) {
        console.error('❌ Error recording coupon usage:', error.message);
      }
    }

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

            // Send subscription confirmation email asynchronously
            // Note: Email may also be sent in completePaymentSuccess, but sending here ensures it's sent even if that handler isn't called
            sendEmail({
              type: 'subscription-confirmation',
              email: user.email,
              name: user.name,
              amount: transaction.amount,
              currency: transaction.currency,
              paymentMethod: processedData.paymentMethod || 'Paymob',
              transactionDate: transaction.completedAt || Date.now(),
              startDate: subscription.startDate,
              endDate: subscription.endDate,
              dashboardUrl: `${process.env.FRONTEND_URL}/student/jobs`,
            })
              .then(() => {
                logger.info('✅ Subscription confirmation email sent to:', user.email);
              })
              .catch(err => {
                logger.error('❌ Failed to send subscription confirmation email:', {
                  error: err.message,
                  userId: user._id,
                  email: user.email,
                });
              });
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
    } else if (transaction.type === 'escrow_deposit') {
      // Handle contract escrow deposit funding
      const { Contract } = require('../models/contractModel');

      const contractId = transaction.metadata?.get
        ? transaction.metadata.get('contractId')
        : transaction.metadata?.contractId;
      const milestoneId = transaction.metadata?.get
        ? transaction.metadata.get('milestoneId')
        : transaction.metadata?.milestoneId;

      const alreadyProcessed = transaction.metadata?.get
        ? transaction.metadata.get('escrowProcessed')
        : transaction.metadata?.escrowProcessed;

      if (contractId && milestoneId && !alreadyProcessed) {
        const contract = await Contract.findById(contractId);
        if (contract) {
          const milestone = contract.milestones.id(milestoneId);
          if (milestone && milestone.state.status === 'unfunded') {
            milestone.state.fundedAmount = milestone.state.amount;
            milestone.state.fundedAt = Date.now();
            milestone.state.status = 'funded';
            if (contract.status === 'signed') contract.status = 'active';
            await contract.save();
          }
        }

        // Update client wallet escrow balance (held funds)
        try {
          if (user) {
            const cur = transaction.currency;
            const principal =
              transaction.metadata?.get && transaction.metadata.get('principalAmount') !== undefined
                ? Number(transaction.metadata.get('principalAmount'))
                : Number(transaction.metadata?.principalAmount);
            const amt = Number.isFinite(principal) && principal > 0 ? principal : transaction.amount;
            if (!user.wallet) user.wallet = {};
            if (!user.wallet.escrow) user.wallet.escrow = new Map();
            const current = user.wallet.escrow.get
              ? user.wallet.escrow.get(cur) || 0
              : user.wallet.escrow[cur] || 0;
            if (user.wallet.escrow.set) {
              user.wallet.escrow.set(cur, current + amt);
            } else {
              user.wallet.escrow[cur] = current + amt;
            }
            user.wallet.updatedAt = Date.now();
            await user.save({ validateBeforeSave: false });
          }
        } catch (e) {
          console.log('⚠️ Failed to update client wallet escrow:', e.message);
        }

        // Notify + email both parties (best-effort)
        try {
          const frontendUrl =
            process.env.FRONTEND_URL ||
            (process.env.NODE_ENV === 'production'
              ? 'https://freshlancer.online'
              : 'http://localhost:3000');

          const refreshed = await Contract.findById(contractId);
          const ms = refreshed?.milestones?.id ? refreshed.milestones.id(milestoneId) : null;
          const milestoneTitle = ms?.plan?.title || 'Milestone';
          const principal =
            transaction.metadata?.get && transaction.metadata.get('principalAmount') !== undefined
              ? Number(transaction.metadata.get('principalAmount'))
              : Number(transaction.metadata?.principalAmount);
          const amount = ms?.state?.amount || (Number.isFinite(principal) && principal > 0 ? principal : transaction.amount);

          if (refreshed?.client?._id && refreshed?.student?._id) {
            await Notification.create([
              {
                user: refreshed.client._id,
                type: 'milestone_funded',
                title: 'Milestone Funded',
                message: `Milestone "${milestoneTitle}" has been funded.`,
                relatedId: refreshed._id,
                relatedType: 'Contract',
                actionUrl: `${frontendUrl}/client/contracts`,
                icon: 'payment',
              },
              {
                user: refreshed.student._id,
                type: 'milestone_funded',
                title: 'Milestone Funded',
                message: `Client deposited escrow for "${milestoneTitle}". You can start working now, but you cannot withdraw until the client approves this milestone.`,
                relatedId: refreshed._id,
                relatedType: 'Contract',
                actionUrl: `${frontendUrl}/student/contracts`,
                icon: 'payment',
              },
            ]);
          }

          if (refreshed?.client?.email) {
            sendEmail({
              type: 'milestone-funded',
              email: refreshed.client.email,
              name: refreshed.client.name,
              contractId: refreshed._id.toString(),
              milestoneTitle,
              amount,
              currency: transaction.currency,
              contractUrl: `${frontendUrl}/client/contracts`,
              dashboardUrl: `${frontendUrl}/client/contracts`,
            }).catch(() => {});
          }
          if (refreshed?.student?.email) {
            sendEmail({
              type: 'milestone-funded',
              email: refreshed.student.email,
              name: refreshed.student.name,
              contractId: refreshed._id.toString(),
              milestoneTitle,
              amount,
              currency: transaction.currency,
              contractUrl: `${frontendUrl}/student/contracts`,
              dashboardUrl: `${frontendUrl}/student/contracts`,
            }).catch(() => {});
          }
        } catch (e) {
          console.log('⚠️ Failed to notify milestone-funded:', e.message);
        }

        // Mark transaction as processed to avoid duplicate funding updates
        if (transaction.metadata?.set) {
          transaction.metadata.set('escrowProcessed', true);
        } else {
          transaction.metadata = {
            ...(transaction.metadata?.toObject ? transaction.metadata.toObject() : transaction.metadata),
            escrowProcessed: true,
          };
        }
        await transaction.save();
      }
    } else if (transaction.type === 'granting') {
      // Handle granting/donation payment
      const Granting = require('../models/grantingModel');
      const grantingId = transaction.metadata?.grantingId;
      
      if (grantingId) {
        const granting = await Granting.findById(grantingId);
        
        if (granting) {
          // If transaction status is completed, ensure granting status is also completed
          if (transaction.status === 'completed' && granting.status !== 'completed') {
            granting.status = 'completed';
            granting.completedAt = Date.now();
            
            // Ensure transaction is linked to granting
            if (!granting.transaction) {
              granting.transaction = transaction._id;
            }
            
            await granting.save();
            
            console.log('✅ Granting marked as completed');
            console.log('Granting ID:', granting._id);
            console.log('Status:', granting.status);
            console.log('Completed At:', granting.completedAt);
            console.log('Transaction linked:', granting.transaction ? 'Yes' : 'No');
            
            // Create notification
            await Notification.create({
              user: user._id,
              type: 'system_announcement',
              title: 'Thank You for Your Support!',
              message: `Thank you for supporting Freshlancer! Your contribution of ${granting.currency} ${granting.amount} helps us support students.`,
              relatedId: granting._id,
              relatedType: 'Granting',
              icon: 'success',
            });
            
            console.log('✅ Notification created for granting');
            
            // Send donation confirmation email asynchronously
            sendEmail({
              type: 'donation-confirmation',
              email: user.email,
              name: user.name,
              amount: granting.amount,
              currency: granting.currency,
              paymentMethod: processedData.paymentMethod || 'Paymob',
              transactionDate: granting.completedAt || Date.now(),
              message: granting.message || '',
            })
              .then(() => {
                logger.info('✅ Donation confirmation email sent to:', user.email);
              })
              .catch(err => {
                logger.error('❌ Failed to send donation confirmation email:', {
                  error: err.message,
                  userId: user._id,
                  email: user.email,
                });
              });
          } else {
            console.log('⚠️ Granting already completed - skipping duplicate update');
          }
        } else {
          console.log('❌ Granting not found for ID:', grantingId);
        }
      } else {
        console.log('❌ No grantingId found in transaction metadata');
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
        type: { $in: ['subscription_payment', 'package_purchase', 'granting'] }
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

    // Record coupon usage if coupon was applied
    if (transaction.metadata?.coupon?.id && !transaction.metadata?.couponUsageRecorded) {
      console.log('🎫 Recording coupon usage for:', transaction.metadata.coupon.code);
      try {
        const Coupon = require('../models/couponModel');
        const coupon = await Coupon.findById(transaction.metadata.coupon.id);
        if (coupon && !coupon.hasUserUsedCoupon(user._id)) {
          await coupon.recordUsage(user._id);
          transaction.metadata.couponUsageRecorded = true;
          await transaction.save();
          console.log('✅ Coupon usage recorded successfully');
        } else {
          console.log('⚠️ Coupon already used or not found');
        }
      } catch (error) {
        console.error('❌ Error recording coupon usage:', error.message);
      }
    }

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
            
            // Send subscription confirmation email asynchronously
            sendEmail({
              type: 'subscription-confirmation',
              email: user.email,
              name: user.name,
              amount: transaction.amount,
              currency: transaction.currency,
              paymentMethod: transaction.paymentMethod || 'Paymob',
              transactionDate: transaction.completedAt || Date.now(),
              startDate: subscription.startDate,
              endDate: subscription.endDate,
              dashboardUrl: `${process.env.FRONTEND_URL}/student/jobs`,
            })
              .then(() => {
                logger.info('✅ Subscription confirmation email sent to:', user.email);
              })
              .catch(err => {
                logger.error('❌ Failed to send subscription confirmation email:', {
                  error: err.message,
                  userId: user._id,
                  email: user.email,
                });
              });
            
            // Log subscription purchase success
            logger.success(`✅ Subscription purchased: ${user.email} upgraded to premium`, {
              action: 'subscription_purchase',
              userId: user._id,
              email: user.email,
              subscriptionId: subscription._id,
              transactionId: transaction._id,
              amount: transaction.amount,
              currency: transaction.currency,
            });
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
          
          // Log package purchase success
          logger.success(`✅ Package purchased: ${user.email} - ${transaction.points} points added`, {
            action: 'package_purchase',
            userId: user._id,
            email: user.email,
            transactionId: transaction._id,
            points: transaction.points,
            amount: transaction.amount,
            currency: transaction.currency,
          });
        } else {
          console.log('⚠️ Warning: User has no clientProfile');
        }
      } else {
        console.log('⚠️ Package already completed - skipping points addition to prevent duplicates');
      }

      console.log('=== PACKAGE ACTIVATION COMPLETE ===\n');
    }
    // Handle contract escrow deposit
    else if (transaction.type === 'escrow_deposit') {
      console.log('\n=== PROCESSING CONTRACT ESCROW DEPOSIT ===');

      const { Contract } = require('../models/contractModel');
      const contractId = transaction.metadata?.get
        ? transaction.metadata.get('contractId')
        : transaction.metadata?.contractId;
      const milestoneId = transaction.metadata?.get
        ? transaction.metadata.get('milestoneId')
        : transaction.metadata?.milestoneId;

      const alreadyProcessed = transaction.metadata?.get
        ? transaction.metadata.get('escrowProcessed')
        : transaction.metadata?.escrowProcessed;
      if (!alreadyProcessed && contractId && milestoneId) {
        const contract = await Contract.findById(contractId);
        if (contract) {
          const milestone = contract.milestones.id(milestoneId);
          if (milestone && milestone.state.status === 'unfunded') {
            milestone.state.fundedAmount = milestone.state.amount;
            milestone.state.fundedAt = Date.now();
            milestone.state.status = 'funded';
            if (contract.status === 'signed') contract.status = 'active';
            await contract.save();
            console.log('✅ Contract milestone funded:', { contractId, milestoneId });
          } else {
            console.log('⚠️ Milestone not found or already funded');
          }
        } else {
          console.log('⚠️ Contract not found for deposit');
        }

        // Update client wallet escrow balance (held funds) — principal only, not fees
        try {
          if (user) {
            const cur = transaction.currency;
            const principal =
              transaction.metadata?.get && transaction.metadata.get('principalAmount') !== undefined
                ? Number(transaction.metadata.get('principalAmount'))
                : Number(transaction.metadata?.principalAmount);
            const amt = Number.isFinite(principal) && principal > 0 ? principal : transaction.amount;
            if (!user.wallet) user.wallet = {};
            if (!user.wallet.escrow) user.wallet.escrow = new Map();
            const current = user.wallet.escrow.get
              ? user.wallet.escrow.get(cur) || 0
              : user.wallet.escrow[cur] || 0;
            if (user.wallet.escrow.set) {
              user.wallet.escrow.set(cur, current + amt);
            } else {
              user.wallet.escrow[cur] = current + amt;
            }
            user.wallet.updatedAt = Date.now();
            await user.save({ validateBeforeSave: false });
          }
        } catch (e) {
          console.log('⚠️ Failed to update client wallet escrow:', e.message);
        }

        // Notify + email both parties (best-effort)
        try {
          const frontendUrl =
            process.env.FRONTEND_URL ||
            (process.env.NODE_ENV === 'production'
              ? 'https://freshlancer.online'
              : 'http://localhost:3000');

          const refreshed = await Contract.findById(contractId);
          const ms = refreshed?.milestones?.id ? refreshed.milestones.id(milestoneId) : null;
          const milestoneTitle = ms?.plan?.title || 'Milestone';
          const principal =
            transaction.metadata?.get && transaction.metadata.get('principalAmount') !== undefined
              ? Number(transaction.metadata.get('principalAmount'))
              : Number(transaction.metadata?.principalAmount);
          const amount = ms?.state?.amount || (Number.isFinite(principal) && principal > 0 ? principal : transaction.amount);

          const Notification = require('../models/notificationModel');
          if (refreshed?.client?._id && refreshed?.student?._id) {
            await Notification.create([
              {
                user: refreshed.client._id,
                type: 'milestone_funded',
                title: 'Milestone Funded',
                message: `Milestone "${milestoneTitle}" has been funded.`,
                relatedId: refreshed._id,
                relatedType: 'Contract',
                actionUrl: `${frontendUrl}/client/contracts`,
                icon: 'payment',
              },
              {
                user: refreshed.student._id,
                type: 'milestone_funded',
                title: 'Milestone Funded',
                message: `Client deposited escrow for "${milestoneTitle}". You can start working now, but you cannot withdraw until the client approves this milestone.`,
                relatedId: refreshed._id,
                relatedType: 'Contract',
                actionUrl: `${frontendUrl}/student/contracts`,
                icon: 'payment',
              },
            ]);
          }

          if (refreshed?.client?.email) {
            sendEmail({
              type: 'milestone-funded',
              email: refreshed.client.email,
              name: refreshed.client.name,
              contractId: refreshed._id.toString(),
              milestoneTitle,
              amount,
              currency: transaction.currency,
              contractUrl: `${frontendUrl}/client/contracts`,
              dashboardUrl: `${frontendUrl}/client/contracts`,
            }).catch(() => {});
          }
          if (refreshed?.student?.email) {
            sendEmail({
              type: 'milestone-funded',
              email: refreshed.student.email,
              name: refreshed.student.name,
              contractId: refreshed._id.toString(),
              milestoneTitle,
              amount,
              currency: transaction.currency,
              contractUrl: `${frontendUrl}/student/contracts`,
              dashboardUrl: `${frontendUrl}/student/contracts`,
            }).catch(() => {});
          }
        } catch (e) {
          console.log('⚠️ Failed to notify milestone-funded:', e.message);
        }

        // Mark transaction processed
        if (transaction.metadata?.set) {
          transaction.metadata.set('escrowProcessed', true);
        } else {
          transaction.metadata = {
            ...(transaction.metadata?.toObject ? transaction.metadata.toObject() : transaction.metadata),
            escrowProcessed: true,
          };
        }
        await transaction.save();
      } else {
        console.log('⚠️ Escrow deposit already processed or missing metadata');
      }

      console.log('=== END CONTRACT ESCROW DEPOSIT ===\n');
    }
    // Handle granting payment
    else if (transaction.type === 'granting') {
      console.log('\n=== PROCESSING GRANTING PAYMENT ===');
      
      const Granting = require('../models/grantingModel');
      const grantingId = transaction.metadata?.grantingId;
      
      if (grantingId) {
        const granting = await Granting.findById(grantingId);
        
        if (granting) {
          console.log('Granting found:', granting._id);
          console.log('Current status:', granting.status);
          console.log('Transaction status:', transaction.status);
          
          // If transaction status is completed, ensure granting status is also completed
          if (transaction.status === 'completed' && granting.status !== 'completed') {
            granting.status = 'completed';
            granting.completedAt = Date.now();
            
            // Ensure transaction is linked to granting
            if (!granting.transaction) {
              granting.transaction = transaction._id;
            }
            
            await granting.save();
            
            console.log('✅ Granting marked as completed');
            console.log('Granting ID:', granting._id);
            console.log('Status:', granting.status);
            console.log('Completed At:', granting.completedAt);
            console.log('Transaction linked:', granting.transaction ? 'Yes' : 'No');
            
            // Create notification
            await Notification.create({
              user: user._id,
              type: 'system_announcement',
              title: 'Thank You for Your Support!',
              message: `Thank you for supporting Freshlancer! Your contribution of ${granting.currency} ${granting.amount} helps us support students.`,
              relatedId: granting._id,
              relatedType: 'Granting',
              icon: 'success',
            });
            
            console.log('✅ Notification created');
            
            // Send donation confirmation email asynchronously
            sendEmail({
              type: 'donation-confirmation',
              email: user.email,
              name: user.name,
              amount: granting.amount,
              currency: granting.currency,
              paymentMethod: transaction.paymentMethod || 'Paymob',
              transactionDate: granting.completedAt || Date.now(),
              message: granting.message || '',
            })
              .then(() => {
                logger.info('✅ Donation confirmation email sent to:', user.email);
              })
              .catch(err => {
                logger.error('❌ Failed to send donation confirmation email:', {
                  error: err.message,
                  userId: user._id,
                  email: user.email,
                });
              });
            
            // Log donation success
            logger.success(`✅ Donation received: ${user.email} - ${granting.currency} ${granting.amount}`, {
              action: 'donation_success',
              userId: user._id,
              email: user.email,
              grantingId: granting._id,
              transactionId: transaction._id,
              amount: granting.amount,
              currency: granting.currency,
            });
          } else {
            console.log('⚠️ Granting already completed - skipping update to prevent duplicates');
          }
        } else {
          console.log('❌ Warning: Granting not found for ID:', grantingId);
        }
      } else {
        console.log('❌ Warning: No grantingId found in transaction metadata');
      }
      
      console.log('=== GRANTING PROCESSING COMPLETE ===\n');
    }

    // Clear the intention ID cookie after successful processing
    console.log('🍪 Clearing intentionId cookie');
    res.clearCookie('paymob_intention_id');

    // Determine redirect URL based on payment type
    const paymentType = transaction.metadata?.paymentType || transaction.type;
    let redirectUrl = `${process.env.FRONTEND_URL}/payment/success`;
    
    console.log('\n📤 DETERMINING REDIRECT URL');
    console.log('Payment Type:', paymentType);
    console.log('Transaction Type:', transaction.type);
    
    // Redirect based on payment type
    if (paymentType === 'supporter' || transaction.type === 'granting') {
      redirectUrl = `${process.env.FRONTEND_URL}/payment/success?type=supporter`;
      console.log('✅ Redirecting to supporter success page');
    } else if (paymentType === 'subscription' || transaction.type === 'subscription_payment') {
      redirectUrl = `${process.env.FRONTEND_URL}/payment/success?type=subscription`;
      console.log('✅ Redirecting to subscription success page');
    } else if (paymentType === 'package' || transaction.type === 'package_purchase') {
      redirectUrl = `${process.env.FRONTEND_URL}/payment/success?type=package`;
      console.log('✅ Redirecting to package success page');
    } else if (paymentType === 'contract_escrow_deposit' || transaction.type === 'escrow_deposit') {
      const contractId = transaction.metadata?.get
        ? transaction.metadata.get('contractId')
        : transaction.metadata?.contractId;
      redirectUrl = `${process.env.FRONTEND_URL}/client/contracts?payment=success${contractId ? `&contractId=${contractId}` : ''}`;
      console.log('✅ Redirecting to contracts page after escrow deposit');
    } else {
      console.log('⚠️ Unknown payment type, using default success page');
    }
    
    console.log(`Redirect URL: ${redirectUrl}`);
    console.log('=== END COMPLETE PAYMENT SUCCESS ===\n');

    return res.redirect(redirectUrl);
  } catch (error) {
    console.error('❌ Payment success processing error:', error);
    console.error('Error stack:', error.stack);
    console.log('=== END COMPLETE PAYMENT SUCCESS (ERROR) ===\n');

    return res.redirect(`${process.env.FRONTEND_URL}/payment/failed?error=processing_error`);
  }
});

// Success callback - called after successful payment (Paymob redirect endpoint)
exports.paymentSuccess = catchAsync(async (req, res, next) => {
  // Paymob can send 'id' as query parameter or as route parameter
  const intentionId = req.query.id || req.params.id; // Check both query and params

  console.log('=== PAYMENT SUCCESS CALLBACK ===');
  console.log('Intention ID from query:', req.query.id);
  console.log('Intention ID from params:', req.params.id);
  console.log('Final Intention ID:', intentionId);
  console.log('Redirecting to complete-success endpoint...');

  if (!intentionId) {
    console.log('❌ Missing intention ID');
    return res.redirect(`${process.env.FRONTEND_URL}/payment/failed?error=missing_id`);
  }

  // Redirect to complete-success endpoint which will process the payment and redirect appropriately
  return res.redirect(`${process.env.BASE_URL}/api/v1/paymob/complete-success?id=${intentionId}`);
});
