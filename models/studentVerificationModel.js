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
  const User = mongoose.model('User');
  const student = await User.findById(this.student);
  
  if (!student || !student.studentProfile) {
    return;
  }
  
  if (this.status === 'approved') {
    // Update verification document status in user's array
    if (student.studentProfile.verificationDocuments && student.studentProfile.verificationDocuments.length > 0) {
      const docIndex = student.studentProfile.verificationDocuments.findIndex(
        doc => doc.documentUrl && doc.documentUrl.includes(this.documentUrl.split('/').pop())
      );
      if (docIndex !== -1) {
        student.studentProfile.verificationDocuments[docIndex].status = 'approved';
      }
    }
    
    // Set both isVerified and verificationStatus to ensure proper verification
    student.studentProfile.isVerified = true;
    student.studentProfile.verificationStatus = 'verified';
    student.studentProfile.verificationApprovedAt = this.reviewedAt || Date.now();
    await student.save({ validateBeforeSave: false });
  } else if (this.status === 'rejected') {
    // Update verification document status in user's array
    if (student.studentProfile.verificationDocuments && student.studentProfile.verificationDocuments.length > 0) {
      const docIndex = student.studentProfile.verificationDocuments.findIndex(
        doc => doc.documentUrl && doc.documentUrl.includes(this.documentUrl.split('/').pop())
      );
      if (docIndex !== -1) {
        student.studentProfile.verificationDocuments[docIndex].status = 'rejected';
      }
    }
    
    // Set verificationStatus to rejected, but only set isVerified to false if all documents are rejected
    student.studentProfile.verificationStatus = 'rejected';
    // Check if all documents are rejected before setting isVerified to false
    const hasApprovedDoc = student.studentProfile.verificationDocuments?.some(doc => doc.status === 'approved');
    if (!hasApprovedDoc) {
      student.studentProfile.isVerified = false;
    }
    await student.save({ validateBeforeSave: false });
  }
});

const StudentVerification = mongoose.model(
  'StudentVerification',
  studentVerificationSchema
);

module.exports = StudentVerification;
