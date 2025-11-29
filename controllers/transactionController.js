const Transaction = require('../models/transactionModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const factory = require('./handlerFactory');

// Get my transactions
exports.getMyTransactions = catchAsync(async (req, res, next) => {
  const filter = { user: req.user._id };

  if (req.query.type) filter.type = req.query.type;
  if (req.query.status) filter.status = req.query.status;

  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const transactions = await Transaction.find(filter)
    .sort('-createdAt')
    .skip(skip)
    .limit(limit);

  const total = await Transaction.countDocuments(filter);

  res.status(200).json({
    status: 'success',
    results: transactions.length,
    total,
    page,
    pages: Math.ceil(total / limit),
    data: {
      transactions,
    },
  });
});

// Get single transaction
exports.getTransaction = factory.getOne(Transaction);

// Get transaction summary
exports.getTransactionSummary = catchAsync(async (req, res, next) => {
  const summary = await Transaction.getUserSummary(req.user._id);

  res.status(200).json({
    status: 'success',
    data: {
      summary,
    },
  });
});

// Admin: Get all transactions
exports.getAllTransactions = catchAsync(async (req, res, next) => {
  const User = require('../models/userModel');
  const filter = {};

  if (req.query.type) filter.type = req.query.type;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.user) filter.user = req.query.user;
  
  // Filter by role if specified
  if (req.query.role) {
    const users = await User.find({ role: req.query.role }).select('_id');
    const userIds = users.map(u => u._id);
    filter.user = { $in: userIds };
  }

  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 50;
  const skip = (page - 1) * limit;

  const transactions = await Transaction.find(filter)
    .populate({
      path: 'user',
      select: 'name email role photo',
    })
    .sort('-createdAt')
    .skip(skip)
    .limit(limit);

  const total = await Transaction.countDocuments(filter);

  res.status(200).json({
    status: 'success',
    results: transactions.length,
    total,
    page,
    pages: Math.ceil(total / limit),
    data: {
      transactions,
    },
  });
});

// Admin: Get revenue statistics
exports.getRevenueStats = catchAsync(async (req, res, next) => {
  const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();

  const stats = await Transaction.calculateTotalRevenue(startDate, endDate);

  res.status(200).json({
    status: 'success',
    data: {
      period: {
        startDate,
        endDate,
      },
      stats,
    },
  });
});

// Admin: Process refund
exports.processRefund = catchAsync(async (req, res, next) => {
  const { reason } = req.body;

  if (!reason) {
    return next(new AppError('Refund reason is required', 400));
  }

  const transaction = await Transaction.findById(req.params.id);

  if (!transaction) {
    return next(new AppError('Transaction not found', 404));
  }

  const refundTransaction = await transaction.processRefund(reason, req.user._id);

  res.status(200).json({
    status: 'success',
    data: {
      originalTransaction: transaction,
      refundTransaction,
    },
  });
});

// Admin: Update transaction status
exports.updateTransactionStatus = catchAsync(async (req, res, next) => {
  const { status, adminNotes } = req.body;

  const validStatuses = ['pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return next(new AppError('Invalid status', 400));
  }

  const transaction = await Transaction.findById(req.params.id);

  if (!transaction) {
    return next(new AppError('Transaction not found', 404));
  }

  transaction.status = status;
  if (adminNotes) transaction.adminNotes = adminNotes;

  await transaction.save();

  res.status(200).json({
    status: 'success',
    data: {
      transaction,
    },
  });
});
