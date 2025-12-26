const mongoose = require('mongoose');

const studentVerificationSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'Verification must belong to a student'],
  },
  documentType: {
    type: String,
    required: [true, 'Document type is required'],
    enum: {
      values: ['student_id', 'enrollment_certificate', 'transcript', 'other'],
      message:
        'Document type must be student_id, enrollment_certificate, transcript, or other',
    },
  },
  documentUrl: {
    type: String,
    required: [true, 'Document URL is required'],
  },
  fileName: {
    type: String,
    required: [true, 'File name is required'],
  },
  fileSize: {
    type: Number, // in bytes
  },
  status: {
    type: String,
    enum: {
      values: ['pending', 'approved', 'rejected'],
      message: 'Status must be pending, approved, or rejected',
    },
    default: 'pending',
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
  reviewedBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User', // Admin who reviewed
  },
  reviewedAt: Date,
  rejectionReason: {
    type: String,
    maxlength: [
      500,
      'Rejection reason must be less than 500 characters',
    ],
  },
  adminNotes: {
    type: String,
    maxlength: [1000, 'Admin notes must be less than 1000 characters'],
  },
  expiryDate: {
    type: Date,
    validate: {
      validator: function (val) {
        return !val || val > Date.now();
      },
      message: 'Expiry date must be in the future',
    },
  },
  // University/Institution details
  institutionName: {
    type: String,
    trim: true,
    maxlength: [200, 'Institution name must be less than 200 characters'],
  },
  studentIdNumber: {
    type: String,
    trim: true,
  },
  enrollmentYear: Number,
  expectedGraduationYear: {
    type: Number,
    min: [1900, 'Expected graduation year must be valid'],
    max: [2034, 'Expected graduation year must not exceed 2034'],
  },
});

// Index for better query performance
studentVerificationSchema.index({ student: 1 });
studentVerificationSchema.index({ status: 1 });
studentVerificationSchema.index({ uploadedAt: -1 });

// Populate student and reviewer information when querying
studentVerificationSchema.pre(/^find/, function (next) {
  this.populate({
    path: 'student',
    select: 'name email photo role',
  }).populate({
    path: 'reviewedBy',
    select: 'name email role',
  });
  next();
});

// Update student verification status when document is approved
studentVerificationSchema.post('save', async function () {
  if (this.status === 'approved') {
    const User = mongoose.model('User');
    await User.findByIdAndUpdate(this.student, {
      'studentProfile.isVerified': true,
      'studentProfile.verificationStatus': 'verified',
      'studentProfile.verificationApprovedAt': this.reviewedAt || Date.now(),
    });
  } else if (this.status === 'rejected') {
    const User = mongoose.model('User');
    await User.findByIdAndUpdate(this.student, {
      'studentProfile.verificationStatus': 'rejected',
    });
  }
});

const StudentVerification = mongoose.model(
  'StudentVerification',
  studentVerificationSchema
);

module.exports = StudentVerification;
