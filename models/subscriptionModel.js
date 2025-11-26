const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'Subscription must belong to a student'],
  },
  plan: {
    type: String,
    required: [true, 'Subscription must have a plan'],
    enum: {
      values: ['free', 'premium'],
      message: 'Plan must be free or premium',
    },
    default: 'free',
  },
  status: {
    type: String,
    enum: {
      values: ['active', 'cancelled', 'expired', 'pending'],
      message: 'Status must be active, cancelled, expired, or pending',
    },
    default: 'active',
  },
  startDate: {
    type: Date,
    default: Date.now,
  },
  endDate: {
    type: Date,
    validate: {
      validator: function (val) {
        return !val || val > this.startDate;
      },
      message: 'End date must be after start date',
    },
  },
  billingCycle: {
    type: String,
    enum: ['monthly',],
    default: 'monthly',
  },
  price: {
    amount: {
      type: Number,
      default: 0,
    },
    currency: {
      type: String,
      enum: [
        // Major Currencies
        'USD', 'EUR', 'EGP', 'GBP',
        // Middle East
        'AED', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR', 'JOD', 'LBP', 'ILS', 'TRY',
        // Africa
        'ZAR', 'MAD', 'TND', 'DZD', 'NGN', 'KES', 'GHS', 'UGX', 'TZS', 'ETB',
        // Europe
        'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'HRK', 'RUB', 'UAH'
      ],
      default: 'USD',
    },
  },
  // Application limits
  applicationLimitPerMonth: {
    type: Number,
    default: function () {
      return this.plan === 'free' ? 10 : 100; // Free: 10/month, Premium: 100/month
    },
  },
  applicationsUsedThisMonth: {
    type: Number,
    default: 0,
  },
  limitResetDate: {
    type: Date,
    default: function () {
      const date = new Date();
      date.setMonth(date.getMonth() + 1);
      date.setDate(1);
      date.setHours(0, 0, 0, 0);
      return date;
    },
  },
  // Payment details
  autoRenew: {
    type: Boolean,
    default: false,
  },
  paymentMethodId: String,
  lastPaymentDate: Date,
  nextBillingDate: Date,
  // Cancellation
  cancelledAt: Date,
  cancelledBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
  },
  cancellationReason: {
    type: String,
    maxlength: [500, 'Cancellation reason must be less than 500 characters'],
  },
  // Premium features
  features: {
    increasedApplicationLimit: {
      type: Boolean,
      default: function () {
        return this.plan === 'premium'; // Premium gets 100 apps/month vs 10 for free
      },
    },
    profileBoost: {
      type: Boolean,
      default: function () {
        return this.plan === 'premium';
      },
    },
    analytics: {
      type: Boolean,
      default: function () {
        return this.plan === 'premium';
      },
    },
    prioritySupport: {
      type: Boolean,
      default: function () {
        return this.plan === 'premium';
      },
    },
    verifiedBadge: {
      type: Boolean,
      default: function () {
        return this.plan === 'premium';
      },
    },
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

// Only one active subscription per student
subscriptionSchema.index({ student: 1, status: 1 });
subscriptionSchema.index({ endDate: 1 });
subscriptionSchema.index({ limitResetDate: 1 });

// Update the updatedAt field
subscriptionSchema.pre('save', function (next) {
  if (!this.isNew) {
    this.updatedAt = Date.now();
  }
  next();
});

// Update student subscription tier when subscription changes
subscriptionSchema.post('save', async function () {
  const User = mongoose.model('User');
  if (this.status === 'active') {
    await User.findByIdAndUpdate(this.student, {
      'studentProfile.subscriptionTier': this.plan,
      'studentProfile.applicationsUsedThisMonth': this.applicationsUsedThisMonth,
      'studentProfile.applicationLimitResetDate': this.limitResetDate,
    });
  }
});

// Method to check if student can apply
subscriptionSchema.methods.canApply = function () {
  if (this.status !== 'active') {
    return { allowed: false, reason: 'Subscription is not active' };
  }

  // Check if limit reset is needed
  if (Date.now() > this.limitResetDate) {
    return { allowed: true, resetNeeded: true };
  }

  // Check application limit (both free and premium have limits now)
  if (this.applicationsUsedThisMonth >= this.applicationLimitPerMonth) {
    return {
      allowed: false,
      reason: `You have reached your monthly limit of ${this.applicationLimitPerMonth} applications. ${this.plan === 'free' ? 'Upgrade to Premium for 100 applications per month!' : 'Please wait until next month to apply again.'}`,
    };
  }

  return { allowed: true };
};

// Method to reset monthly limit
subscriptionSchema.methods.resetMonthlyLimit = async function () {
  const nextResetDate = new Date();
  nextResetDate.setMonth(nextResetDate.getMonth() + 1);
  nextResetDate.setDate(1);
  nextResetDate.setHours(0, 0, 0, 0);

  this.applicationsUsedThisMonth = 0;
  this.limitResetDate = nextResetDate;
  await this.save();
};

// Populate student information when querying
subscriptionSchema.pre(/^find/, function (next) {
  this.populate({
    path: 'student',
    select: 'name email photo role',
  });
  next();
});

const Subscription = mongoose.model('Subscription', subscriptionSchema);

module.exports = Subscription;
