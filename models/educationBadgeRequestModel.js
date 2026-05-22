const mongoose = require('mongoose');

const educationBadgeRequestSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: true,
    },
    entity: {
      type: mongoose.Schema.ObjectId,
      ref: 'EducationEntity',
      required: true,
    },
    certificate: {
      type: mongoose.Schema.ObjectId,
      ref: 'EducationCertificate',
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    studentNote: {
      type: String,
      trim: true,
      maxlength: [1000, 'Note must be less than 1000 characters'],
    },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: [500, 'Rejection reason must be less than 500 characters'],
    },
    adminNotes: {
      type: String,
      trim: true,
      maxlength: [1000, 'Admin notes must be less than 1000 characters'],
    },
    reviewedBy: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
    },
    reviewedAt: Date,
    proofDocument: {
      filename: String,
      url: String,
      mimeType: String,
      uploadedAt: Date,
    },
  },
  { timestamps: true }
);

educationBadgeRequestSchema.index({ student: 1, certificate: 1, status: 1 });
educationBadgeRequestSchema.index({ status: 1, createdAt: -1 });

const EducationBadgeRequest = mongoose.model(
  'EducationBadgeRequest',
  educationBadgeRequestSchema
);

module.exports = EducationBadgeRequest;
