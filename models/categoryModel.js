const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Category name is required'],
    trim: true,
    unique: true,
    maxlength: [50, 'Category name must be less than 50 characters'],
  },
  description: {
    type: String,
    trim: true,
    maxlength: [200, 'Description must be less than 200 characters'],
  },
  icon: {
    type: String,
    trim: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  createdBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
  },
});

// Update the updatedAt field before saving
categorySchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Index for faster queries
categorySchema.index({ name: 1 });
categorySchema.index({ isActive: 1 });

const Category = mongoose.model('Category', categorySchema);

module.exports = Category;

