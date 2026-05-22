const mongoose = require('mongoose');

const educationCertificateSchema = new mongoose.Schema(
  {
    entity: {
      type: mongoose.Schema.ObjectId,
      ref: 'EducationEntity',
      required: [true, 'Certificate must belong to an education entity'],
    },
    category: {
      type: mongoose.Schema.ObjectId,
      ref: 'Category',
      default: null,
    },
    title: {
      type: String,
      required: [true, 'Certificate title is required'],
      trim: true,
      maxlength: [200, 'Title must be less than 200 characters'],
    },
    track: {
      type: String,
      required: [true, 'Track is required'],
      trim: true,
      maxlength: [200, 'Track must be less than 200 characters'],
    },
    imageUrl: {
      type: String,
      default: '',
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description must be less than 1000 characters'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

educationCertificateSchema.index({ entity: 1, isActive: 1, sortOrder: 1 });
educationCertificateSchema.index({ category: 1 });

const EducationCertificate = mongoose.model(
  'EducationCertificate',
  educationCertificateSchema
);

module.exports = EducationCertificate;
