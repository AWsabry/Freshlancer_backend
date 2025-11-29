const User = require('../models/userModel');
const JobApplication = require('../models/jobApplicationModel');
const JobPost = require('../models/jobPostModel');
const Package = require('../models/packageModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

// Get all users with filtering and pagination
exports.getAllUsers = catchAsync(async (req, res, next) => {
  const { role, page = 1, limit = 50, search, includeDeleted } = req.query;

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

  const skip = (page - 1) * limit;

  const [users, totalCount] = await Promise.all([
    User.find(query)
      .select('-password -passwordResetToken -emailVerificationToken')
      .sort('-createdAt')
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
  const { status, page = 1, limit = 50, search, category, clientId } = req.query;

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
  const { status, page = 1, limit = 50, studentId, clientId, jobId } = req.query;

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
  
  const [
    totalUsers,
    totalStudents,
    totalClients,
    totalApplications,
    totalJobs,
    activeJobs,
    pendingApplications,
    recentUsers,
    totalSubscriptions,
    premiumSubscriptions,
    freeSubscriptions,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ role: 'student' }),
    User.countDocuments({ role: 'client' }),
    JobApplication.countDocuments(),
    JobPost.countDocuments(),
    JobPost.countDocuments({ status: 'open' }),
    JobApplication.countDocuments({ status: 'pending' }),
    User.find()
      .select('name email role createdAt')
      .sort('-createdAt')
      .limit(10),
    Subscription.countDocuments({ status: 'active' }),
    Subscription.countDocuments({ status: 'active', plan: 'premium' }),
    Subscription.countDocuments({ status: 'active', plan: 'free' }),
  ]);

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
        totalSubscriptions,
        premiumSubscriptions,
        freeSubscriptions,
      },
      recentUsers,
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

// Delete user (soft delete by setting active to false)
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
  } else if (user.role === 'client') {
    // Find all jobs posted by this client
    const clientJobs = await JobPost.find({ client: user._id });
    const jobIds = clientJobs.map(job => job._id);

    // Delete all applications for these jobs
    await JobApplication.deleteMany({ jobPost: { $in: jobIds } });

    // Delete all job posts by this client
    await JobPost.deleteMany({ client: user._id });
  }

  // Soft delete by setting active to false
  user.active = false;
  await user.save({ validateBeforeSave: false });

  res.status(200).json({
    status: 'success',
    message: `User "${user.name}" has been deleted successfully`,
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
    user.studentProfile.isVerified = !user.studentProfile.isVerified;
    user.studentProfile.verificationStatus = user.studentProfile.isVerified ? 'verified' : 'unverified';
    if (user.studentProfile.isVerified) {
      user.studentProfile.verificationApprovedAt = Date.now();
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
    .select('name email photo studentProfile createdAt')
    .sort('-createdAt')
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

  const document = await StudentVerification.findById(req.params.id);

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

  const { rejectionReason, adminNotes } = req.body;

  if (!rejectionReason) {
    return next(new AppError('Rejection reason is required', 400));
  }

  const document = await StudentVerification.findById(req.params.id);

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
  const package = await Package.findById(req.params.id);

  if (!package) {
    return next(new AppError('Package not found', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      package,
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
  const package = await Package.findById(req.params.id);

  if (!package) {
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
  if (type && type !== package.type) {
    const existingPackage = await Package.findOne({ type });
    if (existingPackage) {
      return next(new AppError(`Package with type "${type}" already exists`, 400));
    }
  }

  // Update fields
  if (name !== undefined) package.name = name;
  if (type !== undefined) package.type = type;
  if (pointsTotal !== undefined) package.pointsTotal = pointsTotal;
  if (priceUSD !== undefined) package.priceUSD = priceUSD;
  if (description !== undefined) package.description = description;
  if (features !== undefined) package.features = features;
  if (profileViewsPerJob !== undefined) package.profileViewsPerJob = profileViewsPerJob;
  if (icon !== undefined) package.icon = icon;
  if (color !== undefined) package.color = color;
  if (popular !== undefined) package.popular = popular;
  if (hot !== undefined) package.hot = hot;
  if (isActive !== undefined) package.isActive = isActive;
  if (displayOrder !== undefined) package.displayOrder = displayOrder;

  await package.save();

  res.status(200).json({
    status: 'success',
    data: {
      package,
    },
  });
});

// Delete package
exports.deletePackage = catchAsync(async (req, res, next) => {
  const package = await Package.findById(req.params.id);

  if (!package) {
    return next(new AppError('Package not found', 404));
  }

  await Package.findByIdAndDelete(req.params.id);

  res.status(200).json({
    status: 'success',
    message: 'Package deleted successfully',
    data: null,
  });
});
