const User = require('../models/userModel');
const JobApplication = require('../models/jobApplicationModel');
const JobPost = require('../models/jobPostModel');
const Package = require('../models/packageModel');
const Subscription = require('../models/subscriptionModel');
const Transaction = require('../models/transactionModel');
const Notification = require('../models/notificationModel');
const ProfileView = require('../models/profileViewModel');
const StudentVerification = require('../models/studentVerificationModel');
const { Contract } = require('../models/contractModel');
const Withdrawal = require('../models/withdrawalModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

// Get all users with filtering and pagination
exports.getAllUsers = catchAsync(async (req, res, next) => {
  const { role, page = 1, limit = 50, search, includeDeleted, startDate, endDate } = req.query;

  // Build query
  const query = {};

  // Only exclude soft-deleted users if includeDeleted is not 'true'
  if (includeDeleted !== 'true') {
    query.active = { $ne: false };
  }

  if (role) {
    query.role = role;
  }
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }

  // Date range filter (filter by joinedAt)
  if (startDate || endDate) {
    query.joinedAt = {};
    if (startDate) {
      query.joinedAt.$gte = new Date(startDate);
    }
    if (endDate) {
      // Include the entire end date by setting time to end of day
      const endDateTime = new Date(endDate);
      endDateTime.setHours(23, 59, 59, 999);
      query.joinedAt.$lte = endDateTime;
    }
  }

  const skip = (page - 1) * limit;

  const [users, totalCount] = await Promise.all([
    User.find(query)
      .select('-password -passwordResetToken -emailVerificationToken')
      .sort('-joinedAt')
      .skip(skip)
      .limit(parseInt(limit)),
    User.countDocuments(query),
  ]);

  res.status(200).json({
    status: 'success',
    results: users.length,
    totalCount,
    totalPages: Math.ceil(totalCount / limit),
    currentPage: parseInt(page),
    data: {
      users,
    },
  });
});

// Get user by ID with full details
exports.getUserById = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.params.id).select(
    '-password -passwordResetToken -emailVerificationToken'
  );

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      user,
    },
  });
});

// Get all jobs with full details (admin view)
exports.getAllJobs = catchAsync(async (req, res, next) => {
  const { status, page = 1, limit = 50, search, category, clientId, startDate, endDate } = req.query;

  // Build query
  const query = {};
  if (status) {
    query.status = status;
  }
  if (category) {
    query.category = category;
  }
  if (clientId) {
    query.client = clientId;
  }
  if (search) {
    query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
    ];
  }

  // Date range filter (filter by createdAt)
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) {
      query.createdAt.$gte = new Date(startDate);
    }
    if (endDate) {
      // Include the entire end date by setting time to end of day
      const endDateTime = new Date(endDate);
      endDateTime.setHours(23, 59, 59, 999);
      query.createdAt.$lte = endDateTime;
    }
  }

  const skip = (page - 1) * limit;

  const [jobs, totalCount] = await Promise.all([
    JobPost.find(query)
      .populate({
        path: 'client',
        select: 'name email photo clientProfile',
      })
      .sort('-createdAt')
      .skip(skip)
      .limit(parseInt(limit)),
    JobPost.countDocuments(query),
  ]);

  // Get application count for each job
  const jobsWithStats = await Promise.all(
    jobs.map(async (job) => {
      const applicationCount = await JobApplication.countDocuments({ jobPost: job._id });
      return {
        ...job.toObject(),
        applicationCount,
      };
    })
  );

  res.status(200).json({
    status: 'success',
    results: jobsWithStats.length,
    totalCount,
    totalPages: Math.ceil(totalCount / limit),
    currentPage: parseInt(page),
    data: {
      jobs: jobsWithStats,
    },
  });
});

// Get all applications with full details (admin view)
exports.getAllApplications = catchAsync(async (req, res, next) => {
  const { status, page = 1, limit = 50, studentId, clientId, jobId, startDate, endDate } = req.query;

  // Build query
  const query = {};
  if (status) {
    query.status = status;
  }
  if (studentId) {
    query.student = studentId;
  }
  if (jobId) {
    query.jobPost = jobId;
  }

  // Date range filter (filter by createdAt)
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) {
      query.createdAt.$gte = new Date(startDate);
    }
    if (endDate) {
      // Include the entire end date by setting time to end of day
      const endDateTime = new Date(endDate);
      endDateTime.setHours(23, 59, 59, 999);
      query.createdAt.$lte = endDateTime;
    }
  }

  const skip = (page - 1) * limit;

  // If clientId is provided, we need to find jobs by that client first
  if (clientId) {
    const jobs = await JobPost.find({ client: clientId }).select('_id');
    const jobIds = jobs.map(job => job._id);
    query.jobPost = { $in: jobIds };
  }

  const [applications, totalCount] = await Promise.all([
    JobApplication.find(query)
      .populate({
        path: 'student',
        select: 'name email photo age nationality studentProfile',
      })
      .populate({
        path: 'jobPost',
        select: 'title budget deadline status category',
        populate: {
          path: 'client',
          select: 'name email photo',
        },
      })
      .sort('-createdAt')
      .skip(skip)
      .limit(parseInt(limit)),
    JobApplication.countDocuments(query),
  ]);

  res.status(200).json({
    status: 'success',
    results: applications.length,
    totalCount,
    totalPages: Math.ceil(totalCount / limit),
    currentPage: parseInt(page),
    data: {
      applications,
    },
  });
});

// Get dashboard statistics
exports.getDashboardStats = catchAsync(async (req, res, next) => {
  const Subscription = require('../models/subscriptionModel');
  const Transaction = require('../models/transactionModel');
  
  // Get current year start and end dates
  const currentYear = new Date().getFullYear();
  const yearStart = new Date(currentYear, 0, 1);
  const yearEnd = new Date(currentYear, 11, 31, 23, 59, 59, 999);

  // Get client user IDs first
  const clientUserIds = await User.find({ role: 'client' }).distinct('_id');

  const [
    totalUsers,
    totalStudents,
    totalClients,
    totalApplications,
    totalJobs,
    activeJobs,
    pendingApplications,
    recentUsers,
    currentPremiumStudents,
    totalClientTransactions,
    freeSubscriptions,
    totalActiveSubscriptions,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ role: 'student' }),
    User.countDocuments({ role: 'client' }),
    JobApplication.countDocuments(),
    JobPost.countDocuments(),
    JobPost.countDocuments({ status: 'open' }),
    JobApplication.countDocuments({ status: 'pending' }),
    User.find()
      .select('name email role joinedAt')
      .sort('-joinedAt')
      .limit(10),
    // Count students with active premium subscriptions
    Subscription.countDocuments({ status: 'active', plan: 'premium' }),
    // Count transactions by clients
    Transaction.countDocuments({
      user: { $in: clientUserIds }
    }),
    Subscription.countDocuments({ status: 'active', plan: 'free' }),
    // Total active subscriptions (all plans)
    Subscription.countDocuments({ status: 'active' }),
  ]);
  
  // Get student user IDs for student transactions
  const studentUserIds = await User.find({ role: 'student' }).distinct('_id');

  // Client transactions yearly data
  const clientYearlyData = await Transaction.aggregate([
    {
      $match: {
        user: { $in: clientUserIds },
        createdAt: { $gte: yearStart, $lte: yearEnd }
      }
    },
    {
      $group: {
        _id: { $month: '$createdAt' },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);

  // Student transactions yearly data
  const studentYearlyData = await Transaction.aggregate([
    {
      $match: {
        user: { $in: studentUserIds },
        createdAt: { $gte: yearStart, $lte: yearEnd }
      }
    },
    {
      $group: {
        _id: { $month: '$createdAt' },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);

  // Format yearly data with all months (fill missing months with 0)
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const clientYearlyChartData = Array.from({ length: 12 }, (_, i) => {
    const monthData = clientYearlyData.find(d => d._id === i + 1);
    return {
      month: monthNames[i],
      transactions: monthData ? monthData.count : 0
    };
  });

  const studentYearlyChartData = Array.from({ length: 12 }, (_, i) => {
    const monthData = studentYearlyData.find(d => d._id === i + 1);
    return {
      month: monthNames[i],
      transactions: monthData ? monthData.count : 0
    };
  });

  res.status(200).json({
    status: 'success',
    data: {
      stats: {
        totalUsers,
        totalStudents,
        totalClients,
        totalApplications,
        totalJobs,
        activeJobs,
        pendingApplications,
        currentPremiumStudents,
        totalClientTransactions,
        freeSubscriptions,
        totalActiveSubscriptions,
      },
      recentUsers,
      clientYearlyChartData,
      studentYearlyChartData,
    },
  });
});

// Suspend/Unsuspend user
exports.toggleUserSuspension = catchAsync(async (req, res, next) => {
  const { reason } = req.body;
  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  // Toggle suspension
  user.suspended = !user.suspended;

  if (user.suspended) {
    user.suspendedAt = Date.now();
    user.suspendedBy = req.user.id;
    user.suspensionReason = reason || 'No reason provided';
  } else {
    user.suspendedAt = undefined;
    user.suspendedBy = undefined;
    user.suspensionReason = undefined;
  }

  await user.save({ validateBeforeSave: false });

  res.status(200).json({
    status: 'success',
    message: user.suspended ? 'User suspended successfully' : 'User unsuspended successfully',
    data: {
      user,
    },
  });
});

// Delete user (hard delete with cascading cleanup)
exports.deleteUser = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  // Prevent deleting admin users
  if (user.role === 'admin') {
    return next(new AppError('Cannot delete admin users', 403));
  }

  // Delete associated data based on user role
  if (user.role === 'student') {
    // Delete all applications by this student
    await JobApplication.deleteMany({ student: user._id });

    // Delete subscriptions for this student
    await Subscription.deleteMany({ student: user._id });

    // Delete student verification documents
    await StudentVerification.deleteMany({ student: user._id });
  } else if (user.role === 'client') {
    // Find all jobs posted by this client
    const clientJobs = await JobPost.find({ client: user._id });
    const jobIds = clientJobs.map(job => job._id);

    // Delete all applications for these jobs
    await JobApplication.deleteMany({ jobPost: { $in: jobIds } });

    // Delete all job posts by this client
    await JobPost.deleteMany({ client: user._id });
  }

  // Delete profile views where the user is either the client or the student
  await ProfileView.deleteMany({
    $or: [{ client: user._id }, { student: user._id }],
  });

  // Delete notifications that belong to this user or directly reference this user
  await Notification.deleteMany({
    $or: [
      { user: user._id },
      { relatedType: 'User', relatedId: user._id },
    ],
  });

  // Delete all transactions for this user
  await Transaction.deleteMany({ user: user._id });

  // Finally, hard delete the user document itself
  await User.findByIdAndDelete(user._id);

  res.status(200).json({
    status: 'success',
    message: `User "${user.name}" has been permanently deleted successfully`,
    data: null,
  });
});

// Verify/Unverify user (for students or clients)
exports.toggleUserVerification = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  // Toggle verification based on role
  if (user.role === 'student') {
    if (!user.studentProfile) {
      return next(new AppError('Student profile not found', 400));
    }
    const newVerifiedStatus = !user.studentProfile.isVerified;
    user.studentProfile.isVerified = newVerifiedStatus;
    // Ensure both fields are set consistently
    user.studentProfile.verificationStatus = newVerifiedStatus ? 'verified' : 'unverified';
    if (newVerifiedStatus) {
      user.studentProfile.verificationApprovedAt = Date.now();
      // If there are verification documents, mark them as approved
      if (user.studentProfile.verificationDocuments && user.studentProfile.verificationDocuments.length > 0) {
        user.studentProfile.verificationDocuments.forEach(doc => {
          if (doc.status === 'pending') {
            doc.status = 'approved';
          }
        });
      }
    } else {
      // If unverifying, don't change document statuses but ensure verificationStatus is unverified
      user.studentProfile.verificationStatus = 'unverified';
    }
  } else if (user.role === 'client') {
    if (!user.clientProfile) {
      return next(new AppError('Client profile not found', 400));
    }
    user.clientProfile.isVerified = !user.clientProfile.isVerified;
  } else {
    return next(new AppError('Only students and clients can be verified', 400));
  }

  await user.save({ validateBeforeSave: false });

  res.status(200).json({
    status: 'success',
    message: user.studentProfile?.isVerified || user.clientProfile?.isVerified
      ? 'User verified successfully'
      : 'User unverified successfully',
    data: {
      user,
    },
  });
});

// Get all students with their verification documents
exports.getStudentsWithVerification = catchAsync(async (req, res, next) => {
  const StudentVerification = require('../models/studentVerificationModel');

  // Build query filters
  const filter = {
    role: 'student',
    active: { $ne: false }, // Exclude deleted users
  };

  // Filter by verification status if provided
  if (req.query.verificationStatus) {
    filter['studentProfile.verificationStatus'] = req.query.verificationStatus;
  }

  // Search by name or email
  if (req.query.search) {
    filter.$or = [
      { name: { $regex: req.query.search, $options: 'i' } },
      { email: { $regex: req.query.search, $options: 'i' } },
    ];
  }

  // Pagination
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  // Get students
  const students = await User.find(filter)
    .select('name email photo studentProfile joinedAt')
    .sort('-joinedAt')
    .skip(skip)
    .limit(limit);

  // Get total count
  const total = await User.countDocuments(filter);

  // Get verification documents for each student
  const studentsWithDocs = await Promise.all(
    students.map(async (student) => {
      const verificationDocs = await StudentVerification.find({
        student: student._id,
      }).sort('-uploadedAt');

      return {
        ...student.toObject(),
        verificationDocuments: verificationDocs,
      };
    })
  );

  res.status(200).json({
    status: 'success',
    results: studentsWithDocs.length,
    total,
    page,
    pages: Math.ceil(total / limit),
    data: {
      students: studentsWithDocs,
    },
  });
});

// Approve verification document
exports.approveVerificationDocument = catchAsync(async (req, res, next) => {
  const StudentVerification = require('../models/studentVerificationModel');
  const User = require('../models/userModel');
  const sendEmail = require('../utils/email');
  const logger = require('../utils/logger');

  const document = await StudentVerification.findById(req.params.id).populate('student', 'name email');

  if (!document) {
    return next(new AppError('Verification document not found', 404));
  }

  if (document.status === 'approved') {
    return next(new AppError('Document is already approved', 400));
  }

  document.status = 'approved';
  document.reviewedBy = req.user.id;
  document.reviewedAt = Date.now();
  document.adminNotes = req.body.adminNotes || '';

  await document.save();

  // Update student profile verification status if needed
  const student = await User.findById(document.student._id || document.student);
  if (student && student.studentProfile) {
    // Check if all documents are approved
    const allVerifications = await StudentVerification.find({ 
      student: student._id,
      status: { $ne: 'rejected' }
    });
    const allApproved = allVerifications.every(v => v.status === 'approved');
    
    if (allApproved && allVerifications.length > 0) {
      student.studentProfile.verificationStatus = 'verified';
      student.studentProfile.isVerified = true;
      student.studentProfile.verificationApprovedAt = Date.now();
      await student.save({ validateBeforeSave: false });
    }
  }

  // Send email to student
  if (student && student.email) {
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
  }

  res.status(200).json({
    status: 'success',
    data: {
      document,
    },
  });
});

// Reject verification document
exports.rejectVerificationDocument = catchAsync(async (req, res, next) => {
  const StudentVerification = require('../models/studentVerificationModel');
  const User = require('../models/userModel');
  const sendEmail = require('../utils/email');
  const logger = require('../utils/logger');

  const { rejectionReason, adminNotes } = req.body;

  if (!rejectionReason) {
    return next(new AppError('Rejection reason is required', 400));
  }

  const document = await StudentVerification.findById(req.params.id).populate('student', 'name email');

  if (!document) {
    return next(new AppError('Verification document not found', 404));
  }

  if (document.status === 'rejected') {
    return next(new AppError('Document is already rejected', 400));
  }

  document.status = 'rejected';
  document.reviewedBy = req.user.id;
  document.reviewedAt = Date.now();
  document.rejectionReason = rejectionReason;
  document.adminNotes = adminNotes || '';

  await document.save();

  // Update student profile verification status
  const student = await User.findById(document.student._id || document.student);
  if (student && student.studentProfile) {
    student.studentProfile.verificationStatus = 'rejected';
    student.studentProfile.isVerified = false;
    await student.save({ validateBeforeSave: false });
  }

  // Send email to student
  if (student && student.email) {
    sendEmail({
      type: 'verification-rejected',
      email: student.email,
      name: student.name,
      rejectionReason: rejectionReason,
      adminNotes: adminNotes || undefined,
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
  }

  res.status(200).json({
    status: 'success',
    data: {
      document,
    },
  });
});

// ==================== PACKAGE MANAGEMENT ====================

// Get all packages
exports.getAllPackages = catchAsync(async (req, res, next) => {
  const { isActive, type, page = 1, limit = 50 } = req.query;

  const query = {};
  if (isActive !== undefined) {
    query.isActive = isActive === 'true';
  }
  if (type) {
    query.type = type;
  }

  const skip = (page - 1) * limit;

  const [packages, totalCount] = await Promise.all([
    Package.find(query)
      .sort({ displayOrder: 1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Package.countDocuments(query),
  ]);

  res.status(200).json({
    status: 'success',
    results: packages.length,
    totalCount,
    totalPages: Math.ceil(totalCount / limit),
    currentPage: parseInt(page),
    data: {
      packages,
    },
  });
});

// Get package by ID
exports.getPackageById = catchAsync(async (req, res, next) => {
  const packageData = await Package.findById(req.params.id);

  if (!packageData) {
    return next(new AppError('Package not found', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      package: packageData,
    },
  });
});

// Create new package
exports.createPackage = catchAsync(async (req, res, next) => {
  const {
    name,
    type,
    pointsTotal,
    priceUSD,
    description,
    features,
    profileViewsPerJob,
    icon,
    color,
    popular,
    hot,
    isActive,
    displayOrder,
  } = req.body;

  // Check if package type already exists
  if (type) {
    const existingPackage = await Package.findOne({ type });
    if (existingPackage) {
      return next(new AppError(`Package with type "${type}" already exists`, 400));
    }
  }

  const newPackage = await Package.create({
    name,
    type,
    pointsTotal,
    priceUSD,
    description,
    features: features || [],
    profileViewsPerJob,
    icon: icon || 'Package',
    color: color || 'primary',
    popular: popular || false,
    hot: hot || false,
    isActive: isActive !== undefined ? isActive : true,
    displayOrder: displayOrder || 0,
  });

  res.status(201).json({
    status: 'success',
    data: {
      package: newPackage,
    },
  });
});

// Update package
exports.updatePackage = catchAsync(async (req, res, next) => {
  const packageData = await Package.findById(req.params.id);

  if (!packageData) {
    return next(new AppError('Package not found', 404));
  }

  const {
    name,
    type,
    pointsTotal,
    priceUSD,
    description,
    features,
    profileViewsPerJob,
    icon,
    color,
    popular,
    hot,
    isActive,
    displayOrder,
  } = req.body;

  // Check if type is being changed and if new type already exists
  if (type && type !== packageData.type) {
    const existingPackage = await Package.findOne({ type });
    if (existingPackage) {
      return next(new AppError(`Package with type "${type}" already exists`, 400));
    }
  }

  // Update fields
  if (name !== undefined) packageData.name = name;
  if (type !== undefined) packageData.type = type;
  if (pointsTotal !== undefined) packageData.pointsTotal = pointsTotal;
  if (priceUSD !== undefined) packageData.priceUSD = priceUSD;
  if (description !== undefined) packageData.description = description;
  if (features !== undefined) packageData.features = features;
  if (profileViewsPerJob !== undefined) packageData.profileViewsPerJob = profileViewsPerJob;
  if (icon !== undefined) packageData.icon = icon;
  if (color !== undefined) packageData.color = color;
  if (popular !== undefined) packageData.popular = popular;
  if (hot !== undefined) packageData.hot = hot;
  if (isActive !== undefined) packageData.isActive = isActive;
  if (displayOrder !== undefined) packageData.displayOrder = displayOrder;

  await packageData.save();

  res.status(200).json({
    status: 'success',
    data: {
      package: packageData,
    },
  });
});

// Delete package
exports.deletePackage = catchAsync(async (req, res, next) => {
  const packageData = await Package.findById(req.params.id);

  if (!packageData) {
    return next(new AppError('Package not found', 404));
  }

  await Package.findByIdAndDelete(req.params.id);

  res.status(200).json({
    status: 'success',
    message: 'Package deleted successfully',
    data: null,
  });
});

// Get all contracts (admin view)
exports.getAllContracts = catchAsync(async (req, res, next) => {
  const { status, page = 1, limit = 50, clientId, studentId, startDate, endDate } = req.query;

  const query = {};
  if (status) {
    query.status = status;
  }
  if (clientId) {
    query.client = clientId;
  }
  if (studentId) {
    query.student = studentId;
  }

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) {
      query.createdAt.$gte = new Date(startDate);
    }
    if (endDate) {
      const endDateTime = new Date(endDate);
      endDateTime.setHours(23, 59, 59, 999);
      query.createdAt.$lte = endDateTime;
    }
  }

  const skip = (page - 1) * limit;

  const [contracts, totalCount] = await Promise.all([
    Contract.find(query)
      .populate({
        path: 'client',
        select: 'name email phone',
      })
      .populate({
        path: 'student',
        select: 'name email phone',
      })
      .populate({
        path: 'jobPost',
        select: 'title category',
      })
      .sort('-createdAt')
      .skip(skip)
      .limit(parseInt(limit)),
    Contract.countDocuments(query),
  ]);

  res.status(200).json({
    status: 'success',
    results: contracts.length,
    totalCount,
    totalPages: Math.ceil(totalCount / limit),
    currentPage: parseInt(page),
    data: {
      contracts,
    },
  });
});

// Get all withdrawals (admin view)
exports.getAllWithdrawals = catchAsync(async (req, res, next) => {
  const { status, page = 1, limit = 50, userId, paymentMethod, startDate, endDate } = req.query;

  const query = {};
  if (status) {
    query.status = status;
  }
  if (userId) {
    query.user = userId;
  }
  if (paymentMethod) {
    query.paymentMethod = paymentMethod;
  }

  if (startDate || endDate) {
    query.requestedAt = {};
    if (startDate) {
      query.requestedAt.$gte = new Date(startDate);
    }
    if (endDate) {
      const endDateTime = new Date(endDate);
      endDateTime.setHours(23, 59, 59, 999);
      query.requestedAt.$lte = endDateTime;
    }
  }

  const skip = (page - 1) * limit;

  const [withdrawals, totalCount] = await Promise.all([
    Withdrawal.find(query)
      .populate({
        path: 'user',
        select: 'name email phone role',
      })
      .populate({
        path: 'transaction',
        select: 'amount currency status invoiceNumber',
      })
      .sort('-createdAt')
      .skip(skip)
      .limit(parseInt(limit)),
    Withdrawal.countDocuments(query),
  ]);

  res.status(200).json({
    status: 'success',
    results: withdrawals.length,
    totalCount,
    totalPages: Math.ceil(totalCount / limit),
    currentPage: parseInt(page),
    data: {
      withdrawals,
    },
  });
});
