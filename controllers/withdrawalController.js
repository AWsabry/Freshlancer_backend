const path = require('path');
const fs = require('fs');
const Transaction = require('../models/transactionModel');
const User = require('../models/userModel');
const Withdrawal = require('../models/withdrawalModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const Notification = require('../models/notificationModel');
const sendEmail = require('../utils/email');
const logger = require('../utils/logger');

// Minimum withdrawal amounts per currency (only EGP supported for withdrawals)
const MIN_WITHDRAWAL_AMOUNTS = {
  EGP: 500, // 500 for testing (will be 1000 in production)
};

// Round money helper
const roundMoney = (amount) => Math.round((Number(amount) || 0) * 100) / 100;

// Get wallet value helper
const getWalletValue = (wallet, currency) => {
  if (!wallet || !wallet.balances) return 0;
  const balances = wallet.balances;
  if (typeof balances.get === 'function') {
    return Number(balances.get(currency) || 0);
  }
  return Number(balances[currency] || 0);
};

const getMapValue = (map, key) => (map?.get ? map.get(key) || 0 : map?.[key] || 0);
const setMapValue = (map, key, val) => {
  if (map?.set) {
    map.set(key, val);
    return;
  }
  if (map && typeof map === 'object') map[key] = val;
};

// Request withdrawal (student only)
exports.requestWithdrawal = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'student') {
    return next(AppError.forbidden('Only students can request withdrawals', 'WITHDRAWAL_STUDENT_ONLY'));
  }

  const { amount, currency, paymentMethod, bankAccount, instapayPhone, instapayUsername } = req.body;

  // Validate amount
  const amountNum = roundMoney(Number(amount));
  if (!amountNum || amountNum <= 0) {
    return next(AppError.badRequest('Please provide a valid withdrawal amount', 'WITHDRAWAL_INVALID_AMOUNT'));
  }

  // Validate currency - only EGP allowed
  if (!currency || currency !== 'EGP') {
    return next(AppError.badRequest('Withdrawals are only available for EGP currency', 'WITHDRAWAL_INVALID_CURRENCY'));
  }

  // Check minimum withdrawal amount
  const minAmount = MIN_WITHDRAWAL_AMOUNTS[currency] || 500;
  if (amountNum < minAmount) {
    return next(
      AppError.badRequest(
        `Minimum withdrawal amount is ${currency} ${minAmount}`,
        'WITHDRAWAL_BELOW_MINIMUM'
      )
    );
  }

  // Validate payment method
  if (!paymentMethod || !['bank_transfer', 'instapay'].includes(paymentMethod)) {
    return next(AppError.badRequest('Payment method must be either "bank_transfer" or "instapay"', 'WITHDRAWAL_INVALID_PAYMENT_METHOD'));
  }

  // Validate payment details based on method
  if (paymentMethod === 'bank_transfer') {
    if (!bankAccount || typeof bankAccount !== 'object') {
      return next(AppError.badRequest('Bank account details are required for bank transfer', 'WITHDRAWAL_BANK_ACCOUNT_REQUIRED'));
    }

    const { accountHolderName, accountNumber, bankName, iban, swiftCode, routingNumber } = bankAccount;

    if (!accountHolderName || !accountNumber || !bankName) {
      return next(
        AppError.badRequest(
          'Bank account holder name, account number, and bank name are required',
          'WITHDRAWAL_BANK_ACCOUNT_INCOMPLETE'
        )
      );
    }
  } else if (paymentMethod === 'instapay') {
    if (!instapayPhone || typeof instapayPhone !== 'string' || instapayPhone.trim().length === 0) {
      return next(AppError.badRequest('Phone number is required for InstaPay', 'WITHDRAWAL_INSTAPAY_PHONE_REQUIRED'));
    }
    if (!instapayUsername || typeof instapayUsername !== 'string' || instapayUsername.trim().length === 0) {
      return next(AppError.badRequest('InstaPay username is required', 'WITHDRAWAL_INSTAPAY_USERNAME_REQUIRED'));
    }
  }

  // Get user with fresh wallet data
  const user = await User.findById(req.user._id);
  if (!user) {
    return next(AppError.notFound('User not found', 'USER_NOT_FOUND'));
  }

  // Sum of amounts in pending/processing withdrawals (same currency) – can't withdraw same money again
  const pendingAgg = await Withdrawal.aggregate([
    {
      $match: {
        user: user._id,
        currency,
        status: { $in: ['pending', 'processing'] },
      },
    },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  const pendingTotal = roundMoney(pendingAgg[0]?.total ?? 0);
  const walletBalance = getWalletValue(user.wallet, currency);
  const availableForWithdrawal = roundMoney(walletBalance - pendingTotal);
  if (availableForWithdrawal < amountNum) {
    return next(
      AppError.badRequest(
        `Insufficient balance. Available for withdrawal: ${currency} ${availableForWithdrawal.toFixed(2)} (${currency} ${pendingTotal.toFixed(2)} locked in pending withdrawals).`,
        'WITHDRAWAL_INSUFFICIENT_BALANCE'
      )
    );
  }

  // Create withdrawal transaction (pending - admin will approve)
  const transactionData = {
    user: user._id,
    type: 'payout',
    amount: amountNum,
    currency,
    status: 'pending',
    paymentGateway: paymentMethod === 'instapay' ? 'instapay' : 'bank_transfer',
    paymentMethod: paymentMethod,
    relatedType: 'Payout',
    description: `Withdrawal request via ${paymentMethod === 'instapay' ? 'InstaPay' : 'bank transfer'}`,
    metadata: {
      withdrawalRequestedAt: Date.now(),
      withdrawalRequestedBy: user._id.toString(),
      paymentMethod: paymentMethod,
    },
  };

  if (paymentMethod === 'bank_transfer') {
    const { accountHolderName, accountNumber, bankName, iban, swiftCode, routingNumber } = bankAccount;
    transactionData.bankAccount = {
      accountHolderName: accountHolderName.trim(),
      accountNumber: accountNumber.trim(),
      bankName: bankName.trim(),
      iban: iban ? iban.trim() : undefined,
      swiftCode: swiftCode ? swiftCode.trim() : undefined,
      routingNumber: routingNumber ? routingNumber.trim() : undefined,
    };
  } else if (paymentMethod === 'instapay') {
    transactionData.metadata.instapayPhone = instapayPhone.trim();
    transactionData.metadata.instapayUsername = instapayUsername.trim();
  }

  const transaction = await Transaction.create(transactionData);

  // Create withdrawal record
  const withdrawalData = {
    user: user._id,
    transaction: transaction._id,
    amount: amountNum,
    currency,
    paymentMethod,
    status: 'pending',
    requestedAt: Date.now(),
  };

  if (paymentMethod === 'bank_transfer') {
    const { accountHolderName, accountNumber, bankName, iban, swiftCode, routingNumber } = bankAccount;
    withdrawalData.bankAccount = {
      accountHolderName: accountHolderName.trim(),
      accountNumber: accountNumber.trim(),
      bankName: bankName.trim(),
      iban: iban ? iban.trim() : undefined,
      swiftCode: swiftCode ? swiftCode.trim() : undefined,
      routingNumber: routingNumber ? routingNumber.trim() : undefined,
    };
  } else if (paymentMethod === 'instapay') {
    withdrawalData.instapayPhone = instapayPhone.trim();
    withdrawalData.instapayUsername = instapayUsername.trim();
  }

  const withdrawal = await Withdrawal.create(withdrawalData);

  // Notify admin (best-effort)
  try {
    const frontendUrl =
      process.env.FRONTEND_URL ||
      (process.env.NODE_ENV === 'production' ? 'https://freshlancer.online' : 'http://localhost:3000');

    const admins = await User.find({ role: 'admin', active: true }).select('_id');
    if (admins.length > 0) {
      await Notification.create(
        admins.map((admin) => ({
          user: admin._id,
          type: 'withdrawal_request',
          title: 'New Withdrawal Request',
          message: `${user.name} requested withdrawal of ${currency} ${amountNum.toFixed(2)} via ${paymentMethod === 'instapay' ? 'InstaPay' : 'Bank Transfer'}`,
          relatedId: transaction._id,
          relatedType: 'Transaction',
          actionUrl: `${frontendUrl}/admin/transactions`,
          icon: 'payment',
        }))
      );
    }
  } catch (e) {
    logger.error('❌ Failed to notify admins about withdrawal request:', e.message);
  }

  // Email user confirmation (best-effort)
  try {
    sendEmail({
      type: 'withdrawal-requested',
      email: user.email,
      name: user.name,
      amount: amountNum,
      currency,
      transactionId: transaction._id.toString(),
      dashboardUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/student/wallet`,
    }).catch((e) => logger.error('❌ Failed to send withdrawal-requested email:', e.message));
  } catch (e) {
    logger.error('❌ Failed to send withdrawal-requested email:', e.message);
  }

  res.status(201).json({
    status: 'success',
    data: { transaction, withdrawal },
    message: 'Withdrawal request submitted. It will be processed after admin approval.',
  });
});

// Get my withdrawals (student only)
exports.getMyWithdrawals = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'student') {
    return next(AppError.forbidden('Only students can view their withdrawals', 'WITHDRAWAL_STUDENT_ONLY'));
  }

  const withdrawals = await Withdrawal.find({ user: req.user._id })
    .sort('-createdAt')
    .limit(100);

  res.status(200).json({
    status: 'success',
    results: withdrawals.length,
    data: { withdrawals },
  });
});

// Get withdrawal minimums (public info)
exports.getWithdrawalMinimums = catchAsync(async (req, res) => {
  res.status(200).json({
    status: 'success',
    data: { minimums: MIN_WITHDRAWAL_AMOUNTS },
  });
});

const WITHDRAWAL_STATUSES = ['pending', 'processing', 'completed', 'rejected', 'cancelled'];

// Admin: Update withdrawal status (admin only). Multipart: status, adminNotes?, rejectedReason?, paymentEvidence? (file)
exports.updateWithdrawalStatus = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'admin') {
    return next(AppError.forbidden('Only admins can update withdrawal status', 'WITHDRAWAL_ADMIN_ONLY'));
  }

  const rawStatus = (req.body.status || '').trim().toLowerCase();
  const adminNotes = typeof req.body.adminNotes === 'string' ? req.body.adminNotes.trim() : '';
  const rejectedReason = typeof req.body.rejectedReason === 'string' ? req.body.rejectedReason.trim() : '';

  if (!WITHDRAWAL_STATUSES.includes(rawStatus)) {
    return next(
      AppError.badRequest(
        `Status must be one of: ${WITHDRAWAL_STATUSES.join(', ')}`,
        'WITHDRAWAL_INVALID_STATUS'
      )
    );
  }

  if (rawStatus === 'rejected' && !rejectedReason) {
    return next(AppError.badRequest('Rejection reason is required when status is rejected', 'WITHDRAWAL_REJECTION_REASON_REQUIRED'));
  }

  const withdrawal = await Withdrawal.findById(req.params.id);
  if (!withdrawal) {
    return next(AppError.notFound('Withdrawal not found', 'WITHDRAWAL_NOT_FOUND'));
  }

  const prevStatus = withdrawal.status;
  withdrawal.status = rawStatus;

  if (adminNotes) {
    withdrawal.adminNotes = adminNotes;
  }

  if (rawStatus === 'processing') {
    if (!withdrawal.processedAt) withdrawal.processedAt = new Date();
  } else if (rawStatus === 'completed') {
    if (!withdrawal.completedAt) withdrawal.completedAt = new Date();
    if (req.file && req.file.path) {
      withdrawal.paymentEvidencePath = req.file.path;
      withdrawal.paymentEvidenceOriginalName = req.file.originalname || path.basename(req.file.path);
    }
  } else if (rawStatus === 'rejected') {
    withdrawal.rejectedAt = new Date();
    withdrawal.rejectedBy = req.user._id;
    withdrawal.rejectedReason = rejectedReason;
  }

  await withdrawal.save();

  // When status becomes completed: deduct amount from student wallet (remove from wallet)
  if (rawStatus === 'completed' && prevStatus !== 'completed') {
    const studentUser = await User.findById(withdrawal.user);
    if (studentUser) {
      if (!studentUser.wallet) studentUser.wallet = {};
      if (!studentUser.wallet.balances) studentUser.wallet.balances = new Map();
      const cur = withdrawal.currency;
      const currentBal = getMapValue(studentUser.wallet.balances, cur);
      if (currentBal < withdrawal.amount) {
        logger.warn(
          `Withdrawal ${withdrawal._id} completed: student wallet ${cur} balance (${currentBal}) < withdrawal amount (${withdrawal.amount}). Deducting anyway.`
        );
      }
      const newBal = roundMoney(currentBal - withdrawal.amount);
      setMapValue(studentUser.wallet.balances, cur, newBal);
      studentUser.wallet.updatedAt = new Date();
      await studentUser.save({ validateBeforeSave: false });
    }
  }

  // Update linked transaction
  const transaction = await Transaction.findById(withdrawal.transaction);
  if (transaction) {
    if (rawStatus === 'processing') {
      transaction.status = 'processing';
    } else if (rawStatus === 'completed') {
      transaction.status = 'completed';
    } else if (rawStatus === 'rejected') {
      transaction.status = 'failed';
      transaction.failureReason = rejectedReason;
    } else if (rawStatus === 'cancelled') {
      transaction.status = 'cancelled';
    }
    await transaction.save();
  }

  const frontendUrl =
    process.env.FRONTEND_URL ||
    (process.env.NODE_ENV === 'production' ? 'https://freshlancer.online' : 'http://localhost:3000');
  const walletUrl = `${frontendUrl}/student/wallet`;

  // Notify user (best-effort)
  try {
    const titleByStatus = {
      processing: 'Withdrawal is being processed',
      completed: 'Withdrawal completed',
      rejected: 'Withdrawal rejected',
      cancelled: 'Withdrawal cancelled',
    };
    const title = titleByStatus[rawStatus] || `Withdrawal ${rawStatus}`;
    const msg = {
      processing: `Your withdrawal request of ${withdrawal.currency} ${withdrawal.amount.toFixed(2)} has been accepted and is being processed.`,
      completed: `Your withdrawal of ${withdrawal.currency} ${withdrawal.amount.toFixed(2)} has been completed.`,
      rejected: `Your withdrawal request of ${withdrawal.currency} ${withdrawal.amount.toFixed(2)} was rejected. Reason: ${rejectedReason}`,
      cancelled: `Your withdrawal request of ${withdrawal.currency} ${withdrawal.amount.toFixed(2)} was cancelled.`,
    };
    await Notification.create({
      user: withdrawal.user,
      type: 'withdrawal_request',
      title,
      message: msg[rawStatus] || title,
      relatedId: withdrawal._id,
      relatedType: 'Transaction',
      actionUrl: walletUrl,
      icon: 'payment',
    });
  } catch (e) {
    logger.error('❌ Failed to notify user about withdrawal status update:', e.message);
  }

  // Send status email (template + optional payment evidence attachment)
  try {
    const user = await User.findById(withdrawal.user).select('name email');
    if (!user?.email) return;

    const emailOptions = {
      email: user.email,
      name: user.name,
      amount: withdrawal.amount,
      currency: withdrawal.currency,
      dashboardUrl: walletUrl,
      adminNotes: adminNotes || undefined,
      updatedAt: withdrawal.updatedAt,
      completedAt: withdrawal.completedAt,
      rejectedAt: withdrawal.rejectedAt,
      rejectedReason: rawStatus === 'rejected' ? rejectedReason : undefined,
    };

    let templateType;
    if (rawStatus === 'processing') {
      templateType = 'withdrawal-status-processing';
    } else if (rawStatus === 'completed') {
      templateType = 'withdrawal-status-completed';
      emailOptions.hasPaymentEvidence = !!(withdrawal.paymentEvidencePath && fs.existsSync(withdrawal.paymentEvidencePath));
    } else if (rawStatus === 'rejected') {
      templateType = 'withdrawal-status-rejected';
    } else {
      return; // pending / cancelled: no template for now
    }

    const attachments = [];
    if (rawStatus === 'completed' && withdrawal.paymentEvidencePath && fs.existsSync(withdrawal.paymentEvidencePath)) {
      attachments.push({
        filename: withdrawal.paymentEvidenceOriginalName || path.basename(withdrawal.paymentEvidencePath),
        path: withdrawal.paymentEvidencePath,
      });
    }

    await sendEmail({
      ...emailOptions,
      type: templateType,
      attachments: attachments.length ? attachments : undefined,
    });
  } catch (e) {
    logger.error('❌ Failed to send withdrawal status email:', e.message);
  }

  res.status(200).json({
    status: 'success',
    data: { withdrawal },
    message: `Withdrawal status updated to ${rawStatus}.`,
  });
});
