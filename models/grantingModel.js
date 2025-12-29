const mongoose = require('mongoose');

const grantingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: [true, 'Granting must belong to a user'],
    },
    amount: {
      type: Number,
      required: [true, 'Granting must have an amount'],
      min: [0.01, 'Amount must be greater than 0'],
    },
    currency: {
      type: String,
      required: [true, 'Granting must have a currency'],
      enum: ['EGP', 'USD'],
      default: 'EGP',
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'cancelled'],
      default: 'pending',
    },
    paymentMethod: {
      type: String,
      enum: ['paymob', 'paypal'],
      default: 'paymob',
    },
    transaction: {
      type: mongoose.Schema.ObjectId,
      ref: 'Transaction',
    },
    message: {
      type: String,
      trim: true,
      maxlength: [500, 'Message cannot exceed 500 characters'],
    },
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    completedAt: Date,
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
grantingSchema.index({ user: 1, createdAt: -1 });
grantingSchema.index({ status: 1 });
grantingSchema.index({ 'metadata.intentionId': 1 });

// Virtual populate
grantingSchema.virtual('userDetails', {
  ref: 'User',
  localField: 'user',
  foreignField: '_id',
  justOne: true,
});

const Granting = mongoose.model('Granting', grantingSchema);

module.exports = Granting;

