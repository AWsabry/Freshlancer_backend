const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'Transaction must belong to a user'],
  },
  type: {
    type: String,
    required: [true, 'Transaction must have a type'],
    enum: {
      values: [
        'subscription_payment',
        'package_purchase',
        'escrow_deposit',
        'escrow_release',
        'payout',
        'refund',
        'platform_fee',
        'points_purchase',
      ],
      message: 'Invalid transaction type',
    },
  },
  amount: {
    type: Number,
    required: [true, 'Transaction must have an amount'],
  },
  currency: {
    type: String,
    required: [true, 'Transaction must have a currency'],
    enum: ['USD', 'EUR', 'GBP', 'EGP'],
    default: 'USD',
  },
  status: {
    type: String,
    required: [true, 'Transaction must have a status'],
    enum: {
      values: ['pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled'],
      message: 'Invalid transaction status',
    },
    default: 'pending',
  },
  // Payment gateway details
  paymentGateway: {
    type: String,
    enum: ['stripe', 'paypal', 'bank_transfer', 'manual', 'wallet'],
  },
  paymentMethod: {
    type: String,
    enum: ['credit_card', 'debit_card', 'paypal', 'bank_transfer', 'wallet'],
  },
  gatewayTransactionId: {
    type: String,
    unique: true,
    sparse: true, // Allow null values
  },
  gatewayResponse: {
    type: mongoose.Schema.Types.Mixed,
  },
  // Related documents
  relatedId: mongoose.Schema.ObjectId,
  relatedType: {
    type: String,
    enum: [
      'Subscription',
      'ClientPackage',
      'Contract',
      'Payout',
      'Refund',
    ],
  },
  // Description
  description: {
    type: String,
    required: [true, 'Transaction must have a description'],
    trim: true,
    maxlength: [500, 'Description must be less than 500 characters'],
  },
  // Points (for package_purchase transactions)
  points: {
    type: Number,
    min: [0, 'Points cannot be negative'],
  },
  packageType: {
    type: String,
    enum: ['basic', 'professional', 'enterprise', 'custom'],
  },
  pointsProcessed: {
    type: Boolean,
    default: false,
  },
  // Fee breakdown
  platformFee: {
    amount: {
      type: Number,
      default: 0,
    },
    percentage: {
      type: Number,
      default: 0,
    },
  },
  processingFee: {
    amount: {
      type: Number,
      default: 0,
    },
    percentage: {
      type: Number,
      default: 0,
    },
  },
  netAmount: {
    type: Number, // Amount after fees
  },
  // Payer and Payee (for transfers)
  payer: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
  },
  payee: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
  },
  // Bank account details (for payouts)
  bankAccount: {
    accountHolderName: String,
    accountNumber: String,
    bankName: String,
    routingNumber: String,
    swiftCode: String,
    iban: String,
  },
  // Receipt
  receiptUrl: String,
  invoiceNumber: {
    type: String,
    unique: true,
    sparse: true,
  },
  // Metadata
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
  },
  // IP and device info
  ipAddress: String,
  userAgent: String,
  // Timestamps
  initiatedAt: {
    type: Date,
    default: Date.now,
  },
  processedAt: Date,
  completedAt: Date,
  failedAt: Date,
  refundedAt: Date,
  // Failure details
  failureReason: {
    type: String,
    maxlength: [500, 'Failure reason must be less than 500 characters'],
  },
  failureCode: String,
  // Refund details
  refundReason: {
    type: String,
    maxlength: [500, 'Refund reason must be less than 500 characters'],
  },
  refundedBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
  },
  refundTransactionId: {
    type: mongoose.Schema.ObjectId,
    ref: 'Transaction',
  },
  // Notes (admin use)
  adminNotes: {
    type: String,
    maxlength: [1000, 'Admin notes must be less than 1000 characters'],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Index for better query performance
transactionSchema.index({ user: 1, createdAt: -1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ type: 1 });
transactionSchema.index({ gatewayTransactionId: 1 });
transactionSchema.index({ payer: 1, payee: 1 });
transactionSchema.index({ createdAt: -1 });

// Generate unique invoice number
transactionSchema.pre('save', async function (next) {
  if (this.isNew && !this.invoiceNumber) {
    const count = await this.constructor.countDocuments();
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    this.invoiceNumber = `INV-${year}${month}-${(count + 1)
      .toString()
      .padStart(6, '0')}`;
  }
  next();
});

// Calculate net amount after fees
transactionSchema.pre('save', function (next) {
  if (this.isModified('amount') || this.isModified('platformFee') || this.isModified('processingFee')) {
    const platformFeeAmount = this.platformFee.amount || 0;
    const processingFeeAmount = this.processingFee.amount || 0;
    this.netAmount = this.amount - platformFeeAmount - processingFeeAmount;
  }
  next();
});

// Update the updatedAt field
transactionSchema.pre('save', function (next) {
  if (!this.isNew) {
    this.updatedAt = Date.now();
  }
  next();
});

// Update timestamps based on status changes
transactionSchema.pre('save', function (next) {
  if (this.isModified('status')) {
    switch (this.status) {
      case 'processing':
        if (!this.processedAt) {
          this.processedAt = Date.now();
        }
        break;
      case 'completed':
        if (!this.completedAt) {
          this.completedAt = Date.now();
        }
        break;
      case 'failed':
        if (!this.failedAt) {
          this.failedAt = Date.now();
        }
        break;
      case 'refunded':
        if (!this.refundedAt) {
          this.refundedAt = Date.now();
        }
        break;
    }
  }
  next();
});

// Populate user information when querying
transactionSchema.pre(/^find/, function (next) {
  this.populate({
    path: 'user',
    select: 'name email role',
  })
    .populate({
      path: 'payer',
      select: 'name email',
    })
    .populate({
      path: 'payee',
      select: 'name email',
    });
  next();
});

// Static method to calculate total revenue
transactionSchema.statics.calculateTotalRevenue = async function (startDate, endDate) {
  const result = await this.aggregate([
    {
      $match: {
        status: 'completed',
        type: { $in: ['subscription_payment', 'package_purchase', 'platform_fee'] },
        completedAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$amount' },
        totalFees: { $sum: '$platformFee.amount' },
        count: { $sum: 1 },
      },
    },
  ]);

  return result[0] || { totalRevenue: 0, totalFees: 0, count: 0 };
};

// Static method to get user transaction summary
transactionSchema.statics.getUserSummary = async function (userId) {
  const result = await this.aggregate([
    {
      $match: {
        user: mongoose.Types.ObjectId(userId),
        status: 'completed',
      },
    },
    {
      $group: {
        _id: '$type',
        total: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
  ]);

  return result;
};

// Instance method to process refund
transactionSchema.methods.processRefund = async function (reason, refundedBy) {
  if (this.status !== 'completed') {
    throw new Error('Only completed transactions can be refunded');
  }

  // Create refund transaction
  const refundTransaction = await this.constructor.create({
    user: this.user,
    type: 'refund',
    amount: this.amount,
    currency: this.currency,
    status: 'completed',
    paymentGateway: this.paymentGateway,
    paymentMethod: this.paymentMethod,
    relatedId: this.relatedId,
    relatedType: this.relatedType,
    description: `Refund for ${this.description}`,
    refundReason: reason,
    refundedBy,
    payer: this.payee, // Reversed
    payee: this.payer, // Reversed
  });

  // Update original transaction
  this.status = 'refunded';
  this.refundedAt = Date.now();
  this.refundReason = reason;
  this.refundedBy = refundedBy;
  this.refundTransactionId = refundTransaction._id;

  await this.save();

  return refundTransaction;
};

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;
