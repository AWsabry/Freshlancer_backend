const StudentVerification = require('../models/studentVerificationModel');
const User = require('../models/userModel');
const Notification = require('../models/notificationModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const factory = require('./handlerFactory');
const sendEmail = require('../utils/email');
const logger = require('../utils/logger');

// Student actions

// Upload verification document
exports.uploadDocument = catchAsync(async (req, res, next) => {
  // Check if user is a student
  if (req.user.role !== 'student') {
    return next(
      new AppError('Only students can upload verification documents', 403)
    );
  }

  // Check if student already has verified status
  if (req.user.studentProfile?.isVerified) {
    return next(new AppError('Your account is already verified', 400));
  }

  // Check if file was uploaded
  if (!req.file) {
    return next(new AppError('Please upload a verification document', 400));
  }

  // Check if there's a pending verification
  const pendingVerification = await StudentVerification.findOne({
    student: req.user._id,
    status: 'pending',
  });

  if (pendingVerification) {
    return next(
      new AppError(
        'You already have a pending verification. Please wait for admin approval.',
        400
      )
    );
  }

  // Validate expected graduation year
  if (req.body.expectedGraduationYear) {
    const expectedGradYear = parseInt(req.body.expectedGraduationYear);
    if (isNaN(expectedGradYear) || expectedGradYear < 1900 || expectedGradYear > 2034) {
      return next(new AppError('Expected graduation year must be between 1900 and 2034', 400));
    }
  }

  // Build full document URL (use BASE_URL from env or construct from request)
  // Normalize BASE_URL by removing trailing slash to prevent double slashes
  const baseUrl = (process.env.BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const documentUrl = `${baseUrl}/uploads/verification-documents/${req.file.filename}`;

  const verificationData = {
    student: req.user._id,
    documentType: req.body.documentType,
    documentUrl: documentUrl, // Store full URL
    fileName: req.file.originalname,
    fileSize: req.file.size,
    institutionName: req.body.institutionName,
    studentIdNumber: req.body.studentIdNumber,
    enrollmentYear: req.body.enrollmentYear,
    expectedGraduationYear: req.body.expectedGraduationYear,
  };

  const verification = await StudentVerification.create(verificationData);

  // Update user verification status to pending and store document URL
  const user = await User.findById(req.user._id);
  if (!user.studentProfile) {
    user.studentProfile = {};
  }
  if (!user.studentProfile.verificationDocuments) {
    user.studentProfile.verificationDocuments = [];
  }
  
  // Add document to user's verification documents array
  user.studentProfile.verificationDocuments.push({
    documentUrl: documentUrl,
    fileName: req.file.originalname,
    documentType: req.body.documentType,
    uploadedAt: Date.now(),
    status: 'pending',
  });
  
  user.studentProfile.verificationStatus = 'pending';
  user.studentProfile.verificationSubmittedAt = Date.now();
  await user.save({ validateBeforeSave: false });

  res.status(201).json({
    status: 'success',
    data: {
      verification,
    },
  });
});

// Get my verifications
exports.getMyVerifications = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'student') {
    return next(new AppError('Only students can view verifications', 403));
  }

  const verifications = await StudentVerification.find({
    student: req.user._id,
  }).sort('-uploadedAt');

  res.status(200).json({
    status: 'success',
    results: verifications.length,
    data: {
      verifications,
    },
  });
});

// Get verification status
exports.getVerificationStatus = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'student') {
    return next(new AppError('Only students can check verification status', 403));
  }

  const verification = await StudentVerification.findOne({
    student: req.user._id,
  }).sort('-uploadedAt');

  res.status(200).json({
    status: 'success',
    data: {
      verificationStatus: req.user.studentProfile?.verificationStatus || 'unverified',
      isVerified: req.user.studentProfile?.isVerified || false,
      latestVerification: verification,
    },
  });
});

// Admin actions

// Get all pending verifications
exports.getAllPendingVerifications = catchAsync(async (req, res, next) => {
  const verifications = await StudentVerification.find({
    status: 'pending',
  }).sort('-uploadedAt');

  res.status(200).json({
    status: 'success',
    results: verifications.length,
    data: {
      verifications,
    },
  });
});

// Get all verifications (with filters)
exports.getAllVerifications = catchAsync(async (req, res, next) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.documentType) filter.documentType = req.query.documentType;
  if (req.query.student) filter.student = req.query.student;

  const verifications = await StudentVerification.find(filter)
    .populate('student', 'name email photo')
    .populate('reviewedBy', 'name email')
    .sort('-uploadedAt');

  res.status(200).json({
    status: 'success',
    results: verifications.length,
    data: {
      verifications,
    },
  });
});

// Get single verification
exports.getVerification = factory.getOne(StudentVerification);

// Approve verification
exports.approveVerification = catchAsync(async (req, res, next) => {
  const verification = await StudentVerification.findById(req.params.id).populate('student', 'name email');

  if (!verification) {
    return next(new AppError('No verification found with that ID', 404));
  }

  if (verification.status !== 'pending') {
    return next(
      new AppError(
        `Cannot approve verification with status: ${verification.status}`,
        400
      )
    );
  }

  verification.status = 'approved';
  verification.reviewedBy = req.user._id;
  verification.reviewedAt = Date.now();
  verification.adminNotes = req.body.adminNotes;

  await verification.save();

  // Update user's studentProfile verification status - ensure both fields are set
  const studentId = verification.student._id || verification.student;
  const student = await User.findById(studentId);
  if (!student) {
    return next(new AppError('Student not found', 404));
  }
  
  if (!student.studentProfile) {
    student.studentProfile = {};
  }
  
  // Update verification document status in user's verificationDocuments array
  if (student.studentProfile.verificationDocuments && student.studentProfile.verificationDocuments.length > 0) {
    const docIndex = student.studentProfile.verificationDocuments.findIndex(
      doc => doc.documentUrl && doc.documentUrl.includes(verification.documentUrl.split('/').pop())
    );
    if (docIndex !== -1) {
      student.studentProfile.verificationDocuments[docIndex].status = 'approved';
    }
  }
  
  // Set both isVerified and verificationStatus to ensure proper verification
  student.studentProfile.verificationStatus = 'verified';
  student.studentProfile.isVerified = true;
  student.studentProfile.verificationApprovedAt = Date.now();
  
  await student.save({ validateBeforeSave: false });

  // Create notification for student
  await Notification.create({
    user: studentId,
    type: 'verification_approved',
    title: 'Verification Approved',
    message: 'Your student verification has been approved. You can now apply for jobs!',
    relatedId: verification._id,
    relatedType: 'StudentVerification',
    priority: 'high',
    icon: 'success',
    channels: {
      inApp: true,
      email: true,
    },
  });

  // Send email to student
  sendEmail({
    type: 'verification-approved',
    email: student.email,
    name: student.name,
    adminNotes: req.body.adminNotes || undefined,
    dashboardUrl: `${process.env.FRONTEND_URL}/student/jobs`,
  })
    .then(() => {
      logger.info('✅ Verification approval email sent to:', student.email);
    })
    .catch(err => {
      logger.error('❌ Failed to send verification approval email:', {
        error: err.message,
        studentId: student._id,
        email: student.email,
      });
    });

  res.status(200).json({
    status: 'success',
    data: {
      verification,
    },
  });
});

// Reject verification
exports.rejectVerification = catchAsync(async (req, res, next) => {
  const verification = await StudentVerification.findById(req.params.id).populate('student', 'name email');

  if (!verification) {
    return next(new AppError('No verification found with that ID', 404));
  }

  if (verification.status !== 'pending') {
    return next(
      new AppError(
        `Cannot reject verification with status: ${verification.status}`,
        400
      )
    );
  }

  if (!req.body.rejectionReason) {
    return next(
      new AppError('Please provide a rejection reason', 400)
    );
  }

  verification.status = 'rejected';
  verification.reviewedBy = req.user._id;
  verification.reviewedAt = Date.now();
  verification.rejectionReason = req.body.rejectionReason;
  verification.adminNotes = req.body.adminNotes;

  await verification.save();

  // Update user's studentProfile verification status - ensure both fields are set
  const studentId = verification.student._id || verification.student;
  const student = await User.findById(studentId);
  if (!student) {
    return next(new AppError('Student not found', 404));
  }
  
  if (!student.studentProfile) {
    student.studentProfile = {};
  }
  
  // Update verification document status in user's verificationDocuments array
  if (student.studentProfile.verificationDocuments && student.studentProfile.verificationDocuments.length > 0) {
    const docIndex = student.studentProfile.verificationDocuments.findIndex(
      doc => doc.documentUrl && doc.documentUrl.includes(verification.documentUrl.split('/').pop())
    );
    if (docIndex !== -1) {
      student.studentProfile.verificationDocuments[docIndex].status = 'rejected';
    }
  }
  
  // Set both isVerified and verificationStatus to ensure proper rejection
  student.studentProfile.verificationStatus = 'rejected';
  student.studentProfile.isVerified = false;
  
  await student.save({ validateBeforeSave: false });

  // Create notification for student
  await Notification.create({
    user: studentId,
    type: 'verification_rejected',
    title: 'Verification Rejected',
    message: `Your student verification has been rejected. Reason: ${req.body.rejectionReason}`,
    relatedId: verification._id,
    relatedType: 'StudentVerification',
    priority: 'high',
    icon: 'error',
    channels: {
      inApp: true,
      email: true,
    },
  });

  // Send email to student
  sendEmail({
    type: 'verification-rejected',
    email: student.email,
    name: student.name,
    rejectionReason: req.body.rejectionReason,
    adminNotes: req.body.adminNotes || undefined,
    verificationUrl: `${process.env.FRONTEND_URL}/student/verification`,
  })
    .then(() => {
      logger.info('✅ Verification rejection email sent to:', student.email);
    })
    .catch(err => {
      logger.error('❌ Failed to send verification rejection email:', {
        error: err.message,
        studentId: student._id,
        email: student.email,
      });
    });

  res.status(200).json({
    status: 'success',
    data: {
      verification,
    },
  });
});

// Get verification statistics (admin)
exports.getVerificationStats = catchAsync(async (req, res, next) => {
  const stats = await StudentVerification.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ]);

  const totalVerifications = await StudentVerification.countDocuments();

  res.status(200).json({
    status: 'success',
    data: {
      total: totalVerifications,
      stats,
    },
  });
});
