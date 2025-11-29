const mongoose = require('mongoose');

const packageSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Package must have a name'],
    trim: true,
    maxlength: [100, 'Package name must be less than 100 characters'],
  },
  type: {
    type: String,
    required: [true, 'Package must have a type'],
    enum: {
      values: ['basic', 'professional', 'enterprise', 'custom'],
      message: 'Package type must be basic, professional, enterprise, or custom',
    },
    unique: true, // Only one package per type
  },
  pointsTotal: {
    type: Number,
    required: [true, 'Package must specify total points'],
    min: [1, 'Points must be at least 1'],
  },
  priceUSD: {
    type: Number,
    required: [true, 'Package must have a price in USD'],
    min: [0, 'Price cannot be negative'],
  },
  description: {
    type: String,
    required: [true, 'Package must have a description'],
    trim: true,
    maxlength: [500, 'Description must be less than 500 characters'],
  },
  features: [{
    type: String,
    trim: true,
    maxlength: [200, 'Feature must be less than 200 characters'],
  }],
  profileViewsPerJob: {
    type: Number,
    min: [0, 'Profile views per job cannot be negative'],
  },
  // Display settings
  icon: {
    type: String,
    enum: ['Eye', 'Zap', 'TrendingUp', 'Package', 'Star', 'Crown'],
    default: 'Package',
  },
  color: {
    type: String,
    enum: ['blue', 'primary', 'purple', 'green', 'red', 'yellow'],
    default: 'primary',
  },
  popular: {
    type: Boolean,
    default: false,
  },
  hot: {
    type: Boolean,
    default: false,
  },
  // Status
  isActive: {
    type: Boolean,
    default: true,
  },
  // Display order
  displayOrder: {
    type: Number,
    default: 0,
    min: [0, 'Display order cannot be negative'],
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

// Update the updatedAt field before saving
packageSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Index for active packages
packageSchema.index({ isActive: 1, displayOrder: 1 });

const Package = mongoose.model('Package', packageSchema);

module.exports = Package;

