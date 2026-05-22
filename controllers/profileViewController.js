const ProfileView = require('../models/profileViewModel');
const User = require('../models/userModel');
const Notification = require('../models/notificationModel');
const StudentEducationAward = require('../models/studentEducationAwardModel');
const JobApplication = require('../models/jobApplicationModel');
const JobPost = require('../models/jobPostModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { groupAwardsByEntityForClient } = require('../utils/educationBadgeHelpers');
const { sanitizeExternalProfilesPublic } = require('../utils/clientStudentProfileHelpers');
const { buildStudentProfileSummary } = require('../services/studentProfileSummaryService');

async function assertClientUnlockedStudent(clientId, studentId) {
  const client = await User.findById(clientId);
  if (!client) throw new AppError('Client not found', 404);

  const unlockedStudents = client.clientProfile?.unlockedStudents || [];
  const hasAccess = unlockedStudents.some((id) => id.toString() === studentId);
  if (!hasAccess) {
    throw new AppError(
      "You must unlock this student's contact through an application first",
      403
    );
  }
  return client;
}

async function fetchEducationBadgesForStudent(studentId) {
  const awards = await StudentEducationAward.find({ student: studentId })
    .populate('entity', 'name slug logoUrl description website')
    .populate({
      path: 'certificate',
      select: 'title track imageUrl description',
      populate: { path: 'category', select: 'name' },
    })
    .sort('-awardedAt');
  return groupAwardsByEntityForClient(awards);
}

async function fetchApplicationHistoryForClient(studentId, clientId) {
  const jobPosts = await JobPost.find({ client: clientId }).select('_id').lean();
  const jobPostIds = jobPosts.map((j) => j._id);
  if (jobPostIds.length === 0) return [];

  const apps = await JobApplication.find({
    student: studentId,
    jobPost: { $in: jobPostIds },
  })
    .populate('jobPost', 'title category status createdAt')
    .sort('-createdAt')
    .limit(20)
    .lean();

  return apps.map((app) => ({
    _id: app._id,
    status: app.status,
    createdAt: app.createdAt,
    proposalText: app.proposalText,
    jobPost: app.jobPost
      ? {
          _id: app.jobPost._id,
          title: app.jobPost.title,
          category: app.jobPost.category,
          status: app.jobPost.status,
        }
      : null,
  }));
}

const POINTS_PER_PROFILE = 10; // Points cost to unlock a profile

// Unlock student profile (client action)
exports.unlockProfile = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'client') {
    return next(new AppError('Only clients can unlock profiles', 403));
  }

  const { studentId, jobPostId } = req.body;

  if (!studentId || !jobPostId) {
    return next(new AppError('Student ID and Job Post ID are required', 400));
  }

  // Check if already unlocked
  const existingView = await ProfileView.hasViewedFullProfile(
    req.user._id,
    studentId,
    jobPostId
  );

  if (existingView) {
    const student = await User.findById(studentId);
    return res.status(200).json({
      status: 'success',
      data: {
        message: 'Profile already unlocked',
        profile: student,
        alreadyUnlocked: true,
      },
    });
  }

  // Get active package
  const clientPackage = await ClientPackage.findOne({
    client: req.user._id,
    status: 'active',
  });

  if (!clientPackage) {
    return next(
      new AppError('No active package found. Please purchase a package first.', 403)
    );
  }

  // Check if package has points
  if (!clientPackage.hasPointsAvailable(POINTS_PER_PROFILE)) {
    return next(
      new AppError(
        `Insufficient points. You need ${POINTS_PER_PROFILE} points to unlock this profile.`,
        403
      )
    );
  }

  // Consume points
  await clientPackage.consumePoints(POINTS_PER_PROFILE, 'profile_unlock');

  // Create profile view record
  const profileView = await ProfileView.create({
    client: req.user._id,
    student: studentId,
    jobPost: jobPostId,
    viewType: 'full',
    pointsSpent: POINTS_PER_PROFILE,
    package: clientPackage._id,
    sectionsViewed: ['basic_info', 'contact_details', 'skills', 'education', 'portfolio'],
  });

  // Get full student profile
  const student = await User.findById(studentId);

  // Notify student
  await Notification.create({
    user: studentId,
    type: 'profile_viewed',
    title: 'Profile Viewed',
    message: `A client has viewed your profile for a job opportunity.`,
    relatedId: jobPostId,
    relatedType: 'JobPost',
    icon: 'info',
  });

  // Log profile view
  logger.info(`✅ Profile unlocked: Client ${req.user.email} viewed student ${student.email}`, {
    action: 'profile_view',
    clientId: req.user._id,
    studentId: studentId,
    jobPostId: jobPostId,
    pointsSpent: POINTS_PER_PROFILE,
  });

  res.status(200).json({
    status: 'success',
    data: {
      profile: student,
      profileView,
      pointsRemaining: clientPackage.pointsRemaining,
    },
  });
});

// Get student profile (for clients who have unlocked via application)
exports.getStudentProfile = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'client') {
    return next(new AppError('Only clients can view student profiles', 403));
  }

  const { studentId } = req.params;

  // Get the student with nested university populated
  // (Frontend helper returns N/A if university is only an ObjectId string)
  const student = await User.findById(studentId)
    .populate({
      path: 'studentProfile.university',
      select: 'name status countryCode',
    })
    .lean();

  if (!student || student.role !== 'student') {
    return next(new AppError('Student not found', 404));
  }

  await assertClientUnlockedStudent(req.user._id, studentId);

  const [educationBadges, applicationHistory] = await Promise.all([
    fetchEducationBadgesForStudent(studentId),
    fetchApplicationHistoryForClient(studentId, req.user._id),
  ]);

  const externalProfilesPublic = sanitizeExternalProfilesPublic(
    student.studentProfile?.externalProfiles
  );

  res.status(200).json({
    status: 'success',
    data: {
      student: {
        _id: student._id,
        name: student.name,
        email: student.email,
        photo: student.photo,
        age: student.age,
        gender: student.gender,
        nationality: student.nationality,
        country: student.country,
        phone: student.phone,
        location: student.location,
        studentProfile: student.studentProfile || {},
        subscriptionTier: student.studentProfile?.subscriptionTier || 'free',
        joinedAt: student.joinedAt,
        createdAt: student.createdAt,
      },
      educationBadges: { entities: educationBadges },
      applicationHistory,
      externalProfilesPublic,
    },
  });
});

exports.generateStudentProfileSummary = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'client') {
    return next(new AppError('Only clients can summarize student profiles', 403));
  }

  const { studentId } = req.params;
  await assertClientUnlockedStudent(req.user._id, studentId);

  const student = await User.findById(studentId)
    .populate({
      path: 'studentProfile.university',
      select: 'name status countryCode',
    })
    .lean();

  if (!student || student.role !== 'student') {
    return next(new AppError('Student not found', 404));
  }

  const [educationBadges, applicationHistory] = await Promise.all([
    fetchEducationBadgesForStudent(studentId),
    fetchApplicationHistoryForClient(studentId, req.user._id),
  ]);

  const summary = await buildStudentProfileSummary({
    student,
    educationBadges: { entities: educationBadges },
    applicationHistory,
    externalProfiles: student.studentProfile?.externalProfiles,
  });

  res.status(200).json({
    status: 'success',
    data: { summary },
  });
});

// Get anonymized profile (free preview)
exports.getAnonymizedProfile = catchAsync(async (req, res, next) => {
  const { studentId } = req.params;

  const student = await User.findById(studentId);

  if (!student || student.role !== 'student') {
    return next(new AppError('Student not found', 404));
  }

  const anonymizedProfile = ProfileView.getAnonymizedProfile(student);

  res.status(200).json({
    status: 'success',
    data: {
      profile: anonymizedProfile,
      isAnonymized: true,
      message: 'Unlock full profile to see complete details',
    },
  });
});

// Get my viewed profiles (client)
exports.getMyViewedProfiles = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'client') {
    return next(new AppError('Only clients can view this data', 403));
  }

  const filter = { client: req.user._id };
  if (req.query.jobPost) filter.jobPost = req.query.jobPost;
  if (req.query.viewType) filter.viewType = req.query.viewType;

  const views = await ProfileView.find(filter).sort('-viewedAt');

  res.status(200).json({
    status: 'success',
    results: views.length,
    data: {
      views,
    },
  });
});

// Get profile viewers (student - who viewed my profile)
exports.getMyProfileViewers = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'student') {
    return next(new AppError('Only students can view this data', 403));
  }

  const views = await ProfileView.find({
    student: req.user._id,
    viewType: 'full',
  }).sort('-viewedAt');

  res.status(200).json({
    status: 'success',
    results: views.length,
    data: {
      views,
    },
  });
});

// Shortlist a student profile
exports.shortlistProfile = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'client') {
    return next(new AppError('Only clients can shortlist profiles', 403));
  }

  const { studentId, jobPostId } = req.body;

  const profileView = await ProfileView.findOne({
    client: req.user._id,
    student: studentId,
    jobPost: jobPostId,
  });

  if (!profileView) {
    return next(
      new AppError('Profile not viewed yet. Please unlock the profile first.', 404)
    );
  }

  profileView.isShortlisted = true;
  profileView.shortlistedAt = Date.now();

  await profileView.save();

  res.status(200).json({
    status: 'success',
    data: {
      profileView,
      message: 'Profile shortlisted successfully',
    },
  });
});

// Update action taken on profile
exports.updateProfileAction = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'client') {
    return next(new AppError('Only clients can update profile actions', 403));
  }

  const { studentId, jobPostId, action, notes } = req.body;

  const validActions = ['invited', 'messaged', 'shortlisted', 'rejected'];
  if (!validActions.includes(action)) {
    return next(new AppError('Invalid action', 400));
  }

  const profileView = await ProfileView.findOne({
    client: req.user._id,
    student: studentId,
    jobPost: jobPostId,
  });

  if (!profileView) {
    return next(new AppError('Profile not viewed yet', 404));
  }

  profileView.actionTaken = action;
  profileView.actionTakenAt = Date.now();
  if (notes) profileView.clientNotes = notes;

  await profileView.save();

  res.status(200).json({
    status: 'success',
    data: {
      profileView,
    },
  });
});

// Get shortlisted profiles
exports.getShortlistedProfiles = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'client') {
    return next(new AppError('Only clients can view shortlisted profiles', 403));
  }

  const filter = {
    client: req.user._id,
    isShortlisted: true,
  };

  if (req.query.jobPost) filter.jobPost = req.query.jobPost;

  const views = await ProfileView.find(filter).sort('-shortlistedAt');

  res.status(200).json({
    status: 'success',
    results: views.length,
    data: {
      views,
    },
  });
});

// Admin: Get all profile views
exports.getAllProfileViews = catchAsync(async (req, res, next) => {
  const filter = {};
  if (req.query.viewType) filter.viewType = req.query.viewType;
  if (req.query.client) filter.client = req.query.client;
  if (req.query.student) filter.student = req.query.student;

  const views = await ProfileView.find(filter).sort('-viewedAt');

  res.status(200).json({
    status: 'success',
    results: views.length,
    data: {
      views,
    },
  });
});

// Admin: Get profile view statistics
exports.getProfileViewStats = catchAsync(async (req, res, next) => {
  const stats = await ProfileView.aggregate([
    {
      $group: {
        _id: '$viewType',
        count: { $sum: 1 },
        totalPointsSpent: { $sum: '$pointsSpent' },
      },
    },
  ]);

  const totalViews = await ProfileView.countDocuments();

  res.status(200).json({
    status: 'success',
    data: {
      total: totalViews,
      stats,
    },
  });
});

// Get all unlocked students (client)
exports.getUnlockedStudents = catchAsync(async (req, res, next) => {

  if (req.user.role !== 'client') {
    return next(new AppError('Only clients can view unlocked students', 403));
  }

  // Get client with unlocked students
  const client = await User.findById(req.user._id).populate({
    path: 'clientProfile.unlockedStudents',
    select: 'name email phone photo age gender nationality country location studentProfile joinedAt emailVerified createdAt',
  });

  if (!client) {
    return next(new AppError('Client not found', 404));
  }

  const unlockedStudents = client.clientProfile?.unlockedStudents || [];
  
  // Map students to include verification status and subscription tier from studentProfile
  const studentsWithVerification = unlockedStudents.map(student => {
    const studentObj = student.toObject ? student.toObject() : student;
    return {
      ...studentObj,
      subscriptionTier: studentObj.studentProfile?.subscriptionTier || 'free',
      isVerified: studentObj.studentProfile?.isVerified || false,
      verificationStatus: studentObj.studentProfile?.verificationStatus || 'unverified',
    };
  });

  res.status(200).json({
    status: 'success',
    results: studentsWithVerification.length,
    data: {
      students: studentsWithVerification,
    },
  });
});
