const Transaction = require('../models/transactionModel');
const { Contract } = require('../models/contractModel');
const User = require('../models/userModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const paypalService = require('../utils/payment/paypal');

async function markEscrowDepositFunded(transaction) {
  const contractId = transaction?.metadata?.get
    ? transaction.metadata.get('contractId')
    : transaction?.metadata?.contractId;
  const milestoneId = transaction?.metadata?.get
    ? transaction.metadata.get('milestoneId')
    : transaction?.metadata?.milestoneId;

  if (!contractId || !milestoneId) {
    return;
  }

  const contract = await Contract.findById(contractId);
  if (!contract) return;

  const milestone = contract.milestones.id(milestoneId);
  if (!milestone) return;

  if (milestone.state.status === 'unfunded') {
    milestone.state.fundedAmount = milestone.state.amount;
    milestone.state.fundedAt = Date.now();
    milestone.state.status = 'funded';
  }

  // Move contract forward
  if (contract.status === 'signed') contract.status = 'active';

  await contract.save();
}

// Authenticated: create a PayPal order for an existing pending transaction
exports.createOrder = catchAsync(async (req, res, next) => {
  const { transactionId } = req.body;
  if (!transactionId) {
    return next(AppError.badRequest('transactionId is required', 'PAYPAL_TRANSACTION_ID_REQUIRED'));
  }

  const tx = await Transaction.findById(transactionId);
  if (!tx) return next(AppError.notFound('Transaction not found', 'TRANSACTION_NOT_FOUND'));

  if (tx.user.toString() !== req.user._id.toString()) {
    return next(AppError.forbidden('You do not have access to this transaction', 'TRANSACTION_FORBIDDEN'));
  }

  if (tx.status !== 'pending') {
    return next(AppError.badRequest('Transaction is not pending', 'TRANSACTION_NOT_PENDING'));
  }

  const baseUrl = process.env.BASE_URL;
  const frontendUrl = process.env.FRONTEND_URL;
  if (!baseUrl || !frontendUrl) {
    return next(AppError.serverError('Server URLs are not configured', 'URLS_NOT_CONFIGURED'));
  }

  const { orderId, approvalUrl } = await paypalService.createOrder({
    amount: tx.amount,
    currency: tx.currency,
    description: tx.description,
    customId: tx._id.toString(),
    returnUrl: `${baseUrl}/api/v1/paypal/capture?tx=${tx._id.toString()}`,
    cancelUrl: `${frontendUrl}/payment/failed?reason=cancelled`,
  });

  tx.paymentGateway = 'paypal';
  tx.paymentMethod = 'paypal';
  if (tx.metadata?.set) {
    tx.metadata.set('paypalOrderId', orderId);
    tx.metadata.set('paypalApprovalUrl', approvalUrl);
  } else {
    tx.metadata = {
      ...(tx.metadata?.toObject ? tx.metadata.toObject() : tx.metadata),
      paypalOrderId: orderId,
      paypalApprovalUrl: approvalUrl,
    };
  }
  await tx.save();

  res.status(200).json({
    status: 'success',
    data: { orderId, approvalUrl, transaction: tx },
  });
});

// Public: capture PayPal order after approval redirect
exports.capture = catchAsync(async (req, res, next) => {
  const txId = req.query.tx;
  const orderId = req.query.token || req.query.orderId;

  if (!txId) {
    return next(AppError.badRequest('Missing tx query param', 'PAYPAL_TX_MISSING'));
  }
  if (!orderId) {
    return next(AppError.badRequest('Missing PayPal order token', 'PAYPAL_TOKEN_MISSING'));
  }

  const tx = await Transaction.findById(txId);
  if (!tx) return next(AppError.notFound('Transaction not found', 'TRANSACTION_NOT_FOUND'));

  // Idempotency: if already completed, just redirect
  if (tx.status === 'completed') {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    if (tx.type === 'package_purchase') {
      return res.redirect(`${frontendUrl}/payment/success?type=package`);
    }
    if (tx.type === 'subscription_payment') {
      return res.redirect(`${frontendUrl}/payment/success?type=subscription`);
    }
    if (tx.type === 'granting') {
      return res.redirect(`${frontendUrl}/payment/success?type=supporter`);
    }
    return res.redirect(`${frontendUrl}/client/contracts?payment=success`);
  }

  const captureResult = await paypalService.captureOrder(orderId);

  // Mark transaction
  tx.status = captureResult.status === 'COMPLETED' ? 'completed' : 'failed';
  tx.paymentGateway = 'paypal';
  tx.paymentMethod = 'paypal';
  if (tx.metadata?.set) {
    tx.metadata.set('paypalOrderId', orderId);
    tx.metadata.set('paypalCapture', captureResult.raw);
  } else {
    tx.metadata = {
      ...(tx.metadata?.toObject ? tx.metadata.toObject() : tx.metadata),
      paypalOrderId: orderId,
      paypalCapture: captureResult.raw,
    };
  }
  await tx.save();

  const frontendUrl = process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? 'https://freshlancer.online' : 'http://localhost:3000');

  if (tx.status === 'completed') {
    // Subscription payment: activate premium, update user, redirect to subscription success
    if (tx.type === 'subscription_payment') {
      const Subscription = require('../models/subscriptionModel');
      const subscription = await Subscription.findById(tx.relatedId);
      if (subscription && (subscription.status !== 'active' || subscription.plan !== 'premium')) {
        subscription.plan = 'premium';
        subscription.status = 'active';
        subscription.startDate = Date.now();
        const endDate = new Date();
        endDate.setMonth(endDate.getMonth() + 1);
        subscription.endDate = endDate;
        subscription.lastPaymentDate = Date.now();
        subscription.applicationLimitPerMonth = 100;
        await subscription.save();

        const user = await User.findById(tx.user);
        if (user && user.studentProfile) {
          user.studentProfile.subscriptionTier = 'premium';
          user.studentProfile.subscriptionStartDate = Date.now();
          const expiryDate = new Date();
          expiryDate.setMonth(expiryDate.getMonth() + 1);
          user.studentProfile.subscriptionExpiryDate = expiryDate;
          await user.save({ validateBeforeSave: false });
        }

        const meta = tx.metadata?.toObject ? tx.metadata.toObject() : tx.metadata || {};
        if (meta.coupon?.id && !meta.couponUsageRecorded && user) {
          try {
            const Coupon = require('../models/couponModel');
            const coupon = await Coupon.findById(meta.coupon.id);
            if (coupon && !coupon.hasUserUsedCoupon(user._id)) {
              await coupon.recordUsage(user._id);
              meta.couponUsageRecorded = true;
              tx.metadata = meta;
              await tx.save();
            }
          } catch (e) {
            // best-effort
          }
        }

        const Notification = require('../models/notificationModel');
        const sendEmail = require('../utils/email');
        await Notification.create({
          user: tx.user,
          type: 'subscription_renewed',
          title: 'Premium Subscription Activated',
          message: 'Your premium subscription is now active! You can now apply to up to 100 jobs per month.',
          relatedId: subscription._id,
          relatedType: 'Subscription',
          icon: 'payment',
        }).catch(() => {});
        if (user?.email) {
          sendEmail({
            type: 'subscription-confirmation',
            email: user.email,
            name: user.name,
            plan: 'premium',
            billingCycle: subscription.billingCycle || 'monthly',
            startDate: subscription.startDate,
            endDate: subscription.endDate,
            dashboardUrl: `${frontendUrl}/student/jobs`,
          }).catch(() => {});
        }
      }
      return res.redirect(`${frontendUrl}/payment/success?type=subscription`);
    }

    // Granting/donation (Support Us): mark completed, notify, redirect
    if (tx.type === 'granting') {
      const grantingId = tx.metadata?.get ? tx.metadata.get('grantingId') : tx.metadata?.grantingId;
      if (grantingId) {
        const Granting = require('../models/grantingModel');
        const granting = await Granting.findById(grantingId);
        if (granting && granting.status !== 'completed') {
          granting.status = 'completed';
          granting.completedAt = Date.now();
          if (!granting.transaction) granting.transaction = tx._id;
          await granting.save();

          const user = await User.findById(tx.user);
          const Notification = require('../models/notificationModel');
          const sendEmail = require('../utils/email');
          await Notification.create({
            user: tx.user,
            type: 'system_announcement',
            title: 'Thank You for Your Support!',
            message: `Thank you for supporting Freshlancer! Your contribution of ${granting.currency} ${granting.amount} helps us support students.`,
            relatedId: granting._id,
            relatedType: 'Granting',
            icon: 'payment',
          }).catch(() => {});
          if (user?.email) {
            sendEmail({
              type: 'donation-confirmation',
              email: user.email,
              name: user.name,
              amount: granting.amount,
              currency: granting.currency,
              paymentMethod: 'PayPal',
              transactionDate: granting.completedAt || Date.now(),
              message: granting.message || '',
            }).catch(() => {});
          }
        }
      }
      return res.redirect(`${frontendUrl}/payment/success?type=supporter`);
    }

    // Package purchase: add points, record coupon, redirect to package success
    if (tx.type === 'package_purchase') {
      const user = await User.findById(tx.user);
      if (user && !tx.pointsProcessed && tx.points) {
        if (user.clientProfile) {
          const previousPoints = user.clientProfile.pointsRemaining || 0;
          user.clientProfile.pointsRemaining = previousPoints + tx.points;
          await user.save({ validateBeforeSave: false });
          tx.pointsProcessed = true;
          await tx.save();
        }
        const meta = tx.metadata?.toObject ? tx.metadata.toObject() : tx.metadata || {};
        if (meta.coupon?.id && !meta.couponUsageRecorded) {
          try {
            const Coupon = require('../models/couponModel');
            const coupon = await Coupon.findById(meta.coupon.id);
            if (coupon && !coupon.hasUserUsedCoupon(user._id)) {
              await coupon.recordUsage(user._id);
              meta.couponUsageRecorded = true;
              tx.metadata = meta;
              await tx.save();
            }
          } catch (e) {
            // best-effort
          }
        }
        const Notification = require('../models/notificationModel');
        await Notification.create({
          user: user._id,
          type: 'system_announcement',
          title: 'Points Added',
          message: `${tx.points} points have been added to your account! You now have ${user.clientProfile.pointsRemaining} points available.`,
          relatedId: tx._id,
          relatedType: 'Transaction',
          icon: 'payment',
        }).catch(() => {});
      }
      return res.redirect(`${frontendUrl}/payment/success?type=package`);
    }

    // Escrow deposit: ensure only processed once
    const processed = tx.metadata?.get ? tx.metadata.get('escrowProcessed') : tx.metadata?.escrowProcessed;
    if (!processed) {
      await markEscrowDepositFunded(tx);

      // Update client wallet escrow (held funds)
      try {
        const client = await User.findById(tx.user);
        if (client) {
          const cur = tx.currency;
          const principal =
            tx.metadata?.get && tx.metadata.get('principalAmount') !== undefined
              ? Number(tx.metadata.get('principalAmount'))
              : Number(tx.metadata?.principalAmount);
          const amt = Number.isFinite(principal) && principal > 0 ? principal : tx.amount;
          if (!client.wallet) client.wallet = {};
          if (!client.wallet.escrow) client.wallet.escrow = new Map();
          const current = client.wallet.escrow.get
            ? client.wallet.escrow.get(cur) || 0
            : client.wallet.escrow[cur] || 0;
          if (client.wallet.escrow.set) {
            client.wallet.escrow.set(cur, current + amt);
          } else {
            client.wallet.escrow[cur] = current + amt;
          }
          client.wallet.updatedAt = Date.now();
          await client.save({ validateBeforeSave: false });
        }
      } catch (e) {
        // Don't fail capture redirect if wallet update fails
      }

      // Notify + email both parties about funded milestone (best-effort)
      try {
        const Notification = require('../models/notificationModel');
        const sendEmail = require('../utils/email');
        const logger = require('../utils/logger');

        const contractId = tx.metadata?.get ? tx.metadata.get('contractId') : tx.metadata?.contractId;
        const milestoneId = tx.metadata?.get ? tx.metadata.get('milestoneId') : tx.metadata?.milestoneId;
        const contract = contractId ? await Contract.findById(contractId) : null;
        const milestone = contract && milestoneId ? contract.milestones.id(milestoneId) : null;

        if (contract && milestone) {
          const frontendUrl =
            process.env.FRONTEND_URL ||
            (process.env.NODE_ENV === 'production'
              ? 'https://freshlancer.online'
              : 'http://localhost:3000');

          const milestoneTitle = milestone.plan.title;
          const amount = milestone.state.amount;
          const currency = tx.currency;

          await Notification.create([
            {
              user: contract.client?._id || contract.client,
              type: 'milestone_funded',
              title: 'Milestone Funded',
              message: `Milestone "${milestoneTitle}" has been funded.`,
              relatedId: contract._id,
              relatedType: 'Contract',
              actionUrl: `${frontendUrl}/client/contracts`,
              icon: 'payment',
            },
            {
              user: contract.student?._id || contract.student,
              type: 'milestone_funded',
              title: 'Milestone Funded',
              message: `Client deposited escrow for "${milestoneTitle}". You can start working now, but you cannot withdraw until the client approves this milestone.`,
              relatedId: contract._id,
              relatedType: 'Contract',
              actionUrl: `${frontendUrl}/student/contracts`,
              icon: 'payment',
            },
          ]);

          if (contract.client?.email) {
            sendEmail({
              type: 'milestone-funded',
              email: contract.client.email,
              name: contract.client.name,
              contractId: contract._id.toString(),
              milestoneTitle,
              amount,
              currency,
              contractUrl: `${frontendUrl}/client/contracts`,
              dashboardUrl: `${frontendUrl}/client/contracts`,
            }).catch(() => {});
          }
          if (contract.student?.email) {
            sendEmail({
              type: 'milestone-funded',
              email: contract.student.email,
              name: contract.student.name,
              contractId: contract._id.toString(),
              milestoneTitle,
              amount,
              currency,
              contractUrl: `${frontendUrl}/student/contracts`,
              dashboardUrl: `${frontendUrl}/student/contracts`,
            }).catch(() => {});
          }
        }
      } catch (e) {
        // Silent
      }

      if (tx.metadata?.set) {
        tx.metadata.set('escrowProcessed', true);
      } else {
        tx.metadata = {
          ...(tx.metadata?.toObject ? tx.metadata.toObject() : tx.metadata),
          escrowProcessed: true,
        };
      }
      await tx.save();
    }
  }

  if (tx.status === 'completed') {
    return res.redirect(`${frontendUrl}/client/contracts?payment=success`);
  }
  return res.redirect(`${frontendUrl}/payment/failed?reason=failed`);
});

