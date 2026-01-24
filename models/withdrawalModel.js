const mongoose = require('mongoose');

const withdrawalSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'Withdrawal must belong to a user'],
    index: true,
  },
  transaction: {
    type: mongoose.Schema.ObjectId,
    ref: 'Transaction',
    required: [true, 'Withdrawal must have an associated transaction'],
    unique: true,
  },
  amount: {
    type: Number,
    required: [true, 'Withdrawal must have an amount'],
    min: [0.01, 'Amount must be greater than 0'],
  },
  currency: {
    type: String,
    required: [true, 'Withdrawal must have a currency'],
    enum: ['USD', 'EGP'],
    default: 'EGP',
  },
  paymentMethod: {
    type: String,
    required: [true, 'Payment method is required'],
    enum: ['bank_transfer', 'instapay'],
  },
  status: {
    type: String,
    required: [true, 'Withdrawal must have a status'],
    enum: ['pending', 'processing', 'completed', 'rejected', 'cancelled'],
    default: 'pending',
  },
  // Bank account details (for bank_transfer)
  bankAccount: {
    accountHolderName: String,
    accountNumber: String,
    bankName: String,
    iban: String,
    swiftCode: String,
    routingNumber: String,
  },
  // InstaPay details
  instapayPhone: String,
  instapayUsername: String,
  // Admin notes
  adminNotes: {
    type: String,
    maxlength: [1000, 'Admin notes must be less than 1000 characters'],
  },
  rejectedReason: {
    type: String,
    maxlength: [500, 'Rejection reason must be less than 500 characters'],
  },
  // Processing dates
  requestedAt: {
    type: Date,
    default: Date.now,
  },
  processedAt: Date,
  completedAt: Date,
  rejectedAt: Date,
  rejectedBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
  },
  /** Payment evidence document (e.g. transfer receipt) when status is completed */
  paymentEvidencePath: {
    type: String,
    default: null,
  },
  paymentEvidenceOriginalName: {
    type: String,
    default: null,
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

// Indexes
withdrawalSchema.index({ user: 1, createdAt: -1 });
withdrawalSchema.index({ status: 1 });
withdrawalSchema.index({ transaction: 1 });

// Update timestamps
withdrawalSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  if (this.isModified('status')) {
    switch (this.status) {
      case 'processing':
        if (!this.processedAt) this.processedAt = Date.now();
        break;
      case 'completed':
        if (!this.completedAt) this.completedAt = Date.now();
        break;
      case 'rejected':
        if (!this.rejectedAt) this.rejectedAt = Date.now();
        break;
    }
  }
  next();
});

// Populate user and transaction
withdrawalSchema.pre(/^find/, function (next) {
  this.populate({
    path: 'user',
    select: 'name email phone role',
  }).populate({
    path: 'transaction',
    select: 'amount currency status description invoiceNumber',
  });
  next();
});

const Withdrawal = mongoose.model('Withdrawal', withdrawalSchema);

module.exports = Withdrawal;
