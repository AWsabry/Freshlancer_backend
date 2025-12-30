const mongoose = require('mongoose');

const universitySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'University name is required'],
    trim: true,
    maxlength: [200, 'University name must be less than 200 characters'],
  },
  countryCode: {
    type: String,
    required: [true, 'Country code is required'],
    trim: true,
    maxlength: [2, 'Country code must be 2 characters'],
    minlength: [2, 'Country code must be 2 characters'],
    uppercase: true,
  },
  website: {
    type: String,
    trim: true,
    validate: {
      validator: function (val) {
        if (!val || val === '') return true; // Optional field
        return /^https?:\/\/.+/.test(val);
      },
      message: 'Website must be a valid URL starting with http:// or https://',
    },
  },
  status: {
    type: String,
    enum: ['approved', 'pending', 'rejected'],
    default: 'approved', // Existing universities are approved, new user submissions are pending
  },
  addedBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: false, // Only required for user-submitted universities
  },
  rejectedAt: {
    type: Date,
  },
  rejectionReason: {
    type: String,
    trim: true,
    maxlength: [500, 'Rejection reason must be less than 500 characters'],
  },
  approvedBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
  },
  approvedAt: {
    type: Date,
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
});

// Update the updatedAt field before saving
universitySchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes for faster queries
universitySchema.index({ name: 1 });
universitySchema.index({ countryCode: 1 });
universitySchema.index({ isActive: 1 });
universitySchema.index({ status: 1 });
universitySchema.index({ addedBy: 1 });
universitySchema.index({ name: 'text' }); // Text index for search

const University = mongoose.model('University', universitySchema, 'universities');

module.exports = University;

