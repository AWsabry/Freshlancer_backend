const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Offer must have a title'],
    trim: true,
    maxlength: [100, 'Offer title must be less than 100 characters'],
  },
  description: {
    type: String,
    required: [true, 'Offer must have a description'],
    trim: true,
    maxlength: [500, 'Offer description must be less than 500 characters'],
  },
  targetAudience: {
    type: String,
    required: [true, 'Offer must have a target audience'],
    enum: {
      values: ['student', 'client', 'both'],
      message: 'Target audience must be student, client, or both',
    },
  },
  offerType: {
    type: String,
    required: [true, 'Offer must have a type'],
    enum: {
      values: ['discount', 'bonus_points', 'free_applications', 'premium_trial', 'bundle', 'custom'],
      message: 'Invalid offer type',
    },
  },
  // Discount details
  discountPercentage: {
    type: Number,
    min: [0, 'Discount percentage cannot be negative'],
    max: [100, 'Discount percentage cannot exceed 100%'],
  },
  // Bonus details
  bonusPoints: {
    type: Number,
    min: [0, 'Bonus points cannot be negative'],
  },
  bonusApplications: {
    type: Number,
    min: [0, 'Bonus applications cannot be negative'],
  },
  premiumTrialDays: {
    type: Number,
    min: [1, 'Premium trial must be at least 1 day'],
  },
  // Package details for bundled offers
  packageDetails: {
    originalPrice: {
      type: Number,
      min: [0, 'Original price cannot be negative'],
    },
    discountedPrice: {
      type: Number,
      min: [0, 'Discounted price cannot be negative'],
    },
    currency: {
      type: String,
      default: 'EGP',
      enum: [
        'USD', 'EUR', 'EGP', 'GBP',
        'AED', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR', 'JOD', 'LBP', 'ILS', 'TRY',
        'ZAR', 'MAD', 'TND', 'DZD', 'NGN', 'KES', 'GHS', 'UGX', 'TZS', 'ETB',
        'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'HRK', 'RUB', 'UAH'
      ],
    },
    features: [{
      type: String,
      trim: true,
    }],
  },
  // Validity period
  startDate: {
    type: Date,
    required: [true, 'Offer must have a start date'],
  },
  endDate: {
    type: Date,
    required: [true, 'Offer must have an end date'],
    validate: {
      validator: function(value) {
        // Get the startDate - could be from this.startDate (new) or this.get('startDate') (existing)
        const startDate = this.startDate || this.get('startDate');
        if (!startDate || !value) return true; // Let required validator handle missing values
        // Compare dates by setting time to midnight UTC to avoid timezone issues
        const start = new Date(startDate);
        start.setUTCHours(0, 0, 0, 0);
        const end = new Date(value);
        end.setUTCHours(0, 0, 0, 0);
        return end > start;
      },
      message: 'End date must be after start date',
    },
  },
  // Usage tracking
  isActive: {
    type: Boolean,
    default: true,
  },
  maxUsageCount: {
    type: Number,
    min: [1, 'Max usage count must be at least 1'],
  },
  currentUsageCount: {
    type: Number,
    default: 0,
    min: [0, 'Current usage count cannot be negative'],
  },
  usedBy: [{
    user: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
    },
    usedAt: {
      type: Date,
      default: Date.now,
    },
  }],
  // Display settings
  featured: {
    type: Boolean,
    default: false,
  },
  badgeText: {
    type: String,
    trim: true,
    maxlength: [20, 'Badge text must be less than 20 characters'],
  },
  badgeColor: {
    type: String,
    enum: ['red', 'blue', 'green', 'yellow', 'purple', 'pink'],
    default: 'blue',
  },
  imageUrl: {
    type: String,
    trim: true,
  },
  // Terms and conditions
  terms: {
    type: String,
    trim: true,
    maxlength: [1000, 'Terms must be less than 1000 characters'],
  },
  // Coupon code (optional)
  couponCode: {
    type: String,
    trim: true,
    uppercase: true,
    unique: true,
    sparse: true, // Allows null values while maintaining uniqueness for non-null values
  },
  // Metadata
  createdBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'Offer must be created by an admin'],
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

// Indexes for better query performance
offerSchema.index({ targetAudience: 1, isActive: 1, startDate: 1, endDate: 1 });
offerSchema.index({ featured: 1 });
offerSchema.index({ couponCode: 1 });

// Update the updatedAt field
offerSchema.pre('save', function(next) {
  if (!this.isNew) {
    this.updatedAt = Date.now();
  }
  next();
});

// Automatically deactivate expired offers
offerSchema.pre(/^find/, function(next) {
  // Automatically set isActive to false for expired offers
  const now = new Date();
  this.where({ endDate: { $lt: now }, isActive: true }).update({ isActive: false });
  next();
});

// Virtual for checking if offer is currently valid
offerSchema.virtual('isValid').get(function() {
  const now = new Date();
  return this.isActive &&
         this.startDate <= now &&
         this.endDate >= now &&
         (!this.maxUsageCount || this.currentUsageCount < this.maxUsageCount);
});

// Virtual for calculating savings percentage
offerSchema.virtual('savingsPercentage').get(function() {
  if (this.packageDetails?.originalPrice && this.packageDetails?.discountedPrice) {
    const savings = this.packageDetails.originalPrice - this.packageDetails.discountedPrice;
    return Math.round((savings / this.packageDetails.originalPrice) * 100);
  }
  return this.discountPercentage || 0;
});

// Method to check if user has already used this offer
offerSchema.methods.hasUserUsedOffer = function(userId) {
  return this.usedBy.some(usage => usage.user.toString() === userId.toString());
};

// Method to record offer usage
offerSchema.methods.recordUsage = async function(userId) {
  if (this.maxUsageCount && this.currentUsageCount >= this.maxUsageCount) {
    throw new Error('This offer has reached its maximum usage limit');
  }

  if (this.hasUserUsedOffer(userId)) {
    throw new Error('You have already used this offer');
  }

  this.usedBy.push({ user: userId, usedAt: Date.now() });
  this.currentUsageCount += 1;
  await this.save();
};

// Set virtuals to true in JSON
offerSchema.set('toJSON', { virtuals: true });
offerSchema.set('toObject', { virtuals: true });

const Offer = mongoose.model('Offer', offerSchema);

module.exports = Offer;
