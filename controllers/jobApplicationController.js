const JobApplication = require('../models/jobApplicationModel');
const JobPost = require('../models/jobPostModel');
const User = require('../models/userModel');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const sendEmail = require('../utils/email');
const logger = require('../utils/logger');

// Apply for a job (only students)
exports.applyForJob = catchAsync(async (req, res, next) => {

  // Ensure only students can apply for jobs
  if (req.user.role !== 'student') {
    return next(new AppError('Only students can apply for jobs', 403));
  }

  const userId = req.user._id || req.user.id;

  // Check if student is verified - only select needed fields
  const student = await User.findById(userId)
    .select('studentProfile.isVerified studentProfile.verificationStatus studentProfile.allowJobApplications');

  if (!student) {
    return next(new AppError('Student not found', 404));
  }

  // Ensure studentProfile exists (initialize if it doesn't)
  if (!student.studentProfile) {
    student.studentProfile = {};
  }

  // Check verification status - use strict boolean check
  const isVerified = student.studentProfile.isVerified === true;
  const verificationStatus = student.studentProfile.verificationStatus || 'unverified';
  const allowJobApplications = student.studentProfile.allowJobApplications !== false; // Default to true if not set

  // Debug logging
  logger.debug('Verification check:', {
    userId: userId.toString(),
    isVerified,
    verificationStatus,
    isVerifiedType: typeof student.studentProfile.isVerified,
    verificationStatusValue: student.studentProfile.verificationStatus,
    studentProfileExists: !!student.studentProfile,
  });

  if (!isVerified || verificationStatus !== 'verified') {
    return next(
      new AppError(
        'You must be verified to apply for jobs. Please submit your verification documents from your profile page.',
        403
      )
    );
  }

  // Check if student has enabled job applications
  if (!allowJobApplications) {
    return next(
      new AppError(
        'You have disabled job applications. Please enable job applications in your profile settings to apply for jobs.',
        403
      )
    );
  }

  // Check if job post exists and is open - populate client for email notification
  const jobPost = await JobPost.findById(req.params.jobId).populate({
    path: 'client',
    select: 'name email',
  });
  
  if (!jobPost) {
    return next(new AppError('Job post not found', 404));
  }

  if (jobPost.status !== 'open') {
    return next(
      new AppError('This job post is no longer accepting applications', 400)
    );
  }

  // Validate jobPost has required fields
  if (!jobPost.client) {
    return next(new AppError('Job post client information is missing', 500));
  }

  // Check if student has already applied (including ALL statuses: pending, accepted, rejected, withdrawn)
  const existingApplication = await JobApplication.findOne({
    jobPost: req.params.jobId,
    student: userId,
  });

  if (existingApplication) {
    return next(
      new AppError(
        `You have already applied for this job. Current status: ${existingApplication.status}`,
        400
      )
    );
  }

  // Check if reset date has passed and reset counter if needed
  const now = new Date();
  const resetDate = student.studentProfile?.applicationLimitResetDate;

  if (resetDate && now >= resetDate) {
    // Reset the counter and set new reset date (first day of next month)
    const nextResetDate = new Date();
    nextResetDate.setMonth(nextResetDate.getMonth() + 1);
    nextResetDate.setDate(1);
    nextResetDate.setHours(0, 0, 0, 0);

    student.studentProfile.applicationsUsedThisMonth = 0;
    student.studentProfile.applicationLimitResetDate = nextResetDate;
    await student.save({ validateBeforeSave: false });

    // Also reset the subscription model
    const Subscription = require('../models/subscriptionModel');
    const subscription = await Subscription.findOne({
      student: userId,
      status: 'active',
    });

    if (subscription) {
      subscription.applicationsUsedThisMonth = 0;
      subscription.limitResetDate = nextResetDate;
      await subscription.save();
    }
  }

  // Check application limits based on subscription tier
  const subscriptionTier = student.studentProfile?.subscriptionTier || 'free';
  const applicationsUsed = student.studentProfile?.applicationsUsedThisMonth || 0;

  let monthlyLimit;
  if (subscriptionTier === 'premium') {
    monthlyLimit = 100; // Premium: 100 applications per month
  } else {
    monthlyLimit = 10; // Free: 10 applications per month
  }

  if (applicationsUsed >= monthlyLimit) {
    return next(
      new AppError(
        `You have reached your monthly application limit of ${monthlyLimit}. ${
          subscriptionTier === 'free'
            ? 'Upgrade to Premium to get 100 applications per month.'
            : 'Your limit will reset on the first day of next month.'
        }`,
        403
      )
    );
  }

  // Validate required fields before creating application
  if (!req.body.proposedBudget || !req.body.proposedBudget.amount) {
    return next(new AppError('Proposed budget is required', 400));
  }

  if (!req.body.estimatedDuration) {
    return next(new AppError('Estimated duration is required', 400));
  }

  if (!req.body.availabilityCommitment) {
    return next(new AppError('Availability commitment is required', 400));
  }

  // Create the application
  const applicationData = {
    ...req.body,
    jobPost: req.params.jobId,
    student: userId,
  };

  let application;
  try {
    application = await JobApplication.create(applicationData);
  } catch (error) {
    // Handle validation errors and duplicate key errors
    if (error.name === 'ValidationError') {
      return next(new AppError(`Validation error: ${error.message}`, 400));
    }
    if (error.code === 11000) {
      return next(new AppError('You have already applied for this job', 400));
    }
    // Re-throw unexpected errors
    throw error;
  }

  // Increment monthly application usage and add job to appliedJobs list
  // Ensure studentProfile exists
  if (!student.studentProfile) {
    student.studentProfile = {};
  }
  
  student.studentProfile.applicationsUsedThisMonth = applicationsUsed + 1;

  // Add job to appliedJobs list if not already there
  if (!student.studentProfile.appliedJobs) {
    student.studentProfile.appliedJobs = [];
  }
  
  const alreadyInList = student.studentProfile.appliedJobs.some(
    (job) => job.jobId.toString() === req.params.jobId
  );

  if (!alreadyInList) {
    student.studentProfile.appliedJobs.push({
      jobId: req.params.jobId,
      title: jobPost.title,
      appliedAt: Date.now(),
      status: 'pending',
      applicationId: application._id.toString(), // Store application ID for reference
    });
  }

  // Save student with error handling
  try {
    await student.save({ validateBeforeSave: false });
  } catch (saveError) {
    logger.error('Error saving student after application:', saveError);
    // If save fails, we should still return the application but log the error
    // The application was created successfully, so we continue
  }

  // Also update the subscription model to keep it in sync
  const Subscription = require('../models/subscriptionModel');
  const subscription = await Subscription.findOne({
    student: userId,
    status: 'active',
  });

  if (subscription) {
    subscription.applicationsUsedThisMonth = applicationsUsed + 1;
    await subscription.save();
  }

  // Increment applicationsCount in JobPost
  await JobPost.findByIdAndUpdate(
    req.params.jobId,
    { $inc: { applicationsCount: 1 } },
    { new: true }
  );

  // Send notification email to client (only if client email exists)
  if (jobPost.client && jobPost.client.email) {
    try {
      // Determine if student is premium (has active subscription)
      const isPremium = subscription && subscription.status === 'active';
      const studentLabel = isPremium ? 'premium student' : 'student';
      
      await sendEmail({
        type: 'job-application',
        email: jobPost.client.email,
        name: jobPost.client.name || 'Client',
        subject: `New Application for "${jobPost.title}"`,
        message: `You have received a new application for your job post "${jobPost.title}" from a ${studentLabel}.`,
        jobTitle: jobPost.title,
        studentName: studentLabel,
        applicationUrl: `${req.protocol}://${req.get('host')}/applications/${
          application._id
        }`,
      });
    } catch (err) {
      // Log error but don't fail the application submission
      logger.error('Failed to send application notification email:', err.message);
    }
  }

  res.status(201).json({
    status: 'success',
    message: 'Application submitted successfully',
    data: {
      application,
    },
  });
});

// Get all applications for a user
exports.getMyApplications = catchAsync(async (req, res, next) => {
  
  let query = {};

  const userId = req.user._id || req.user.id;

  if (req.user.role === 'student') {
  
    // Students see their own applications
    query.student = userId;
  } else if (req.user.role === 'client') {
    // Clients see applications for their job posts
    const myJobPosts = await JobPost.find({ client: userId }).select(
      '_id'
    );
    const jobPostIds = myJobPosts.map((job) => job._id);
    query.jobPost = { $in: jobPostIds };
  }

  // Filtering
  const queryObj = { ...req.query };
  const excludedFields = ['page', 'sort', 'limit', 'fields'];
  excludedFields.forEach((el) => delete queryObj[el]);

  // Add filters to main query
  Object.assign(query, queryObj);

  // Create query
  let mongoQuery = JobApplication.find(query);

  // Sorting
  if (req.query.sort) {
    const sortBy = req.query.sort.split(',').join(' ');
    mongoQuery = mongoQuery.sort(sortBy);
  } else {
    mongoQuery = mongoQuery.sort('-createdAt');
  }

  // Field limiting
  if (req.query.fields) {
    const fields = req.query.fields.split(',').join(' ');
    mongoQuery = mongoQuery.select(fields);
  } else {
    mongoQuery = mongoQuery.select('-__v');
  }

  // Pagination
  const page = req.query.page * 1 || 1;
  const limit = req.query.limit * 1 || 10;
  const skip = (page - 1) * limit;

  mongoQuery = mongoQuery.skip(skip).limit(limit);

  // Populate jobPost with client info
  mongoQuery = mongoQuery.populate({
    path: 'jobPost',
    select: 'title budget deadline status category description skillsRequired location client',
    populate: {
      path: 'client',
      select: 'name email photo clientProfile',
    },
  });

  // Execute query
  let applications = await mongoQuery;
  const total = await JobApplication.countDocuments(query);

  // For students, check subscription and hide client data for free users
  if (req.user.role === 'student') {
    const Subscription = require('../models/subscriptionModel');
    const subscription = await Subscription.findOne({
      student: req.user._id,
      status: 'active',
    });
    const isPremium = subscription?.plan === 'premium';

    // Hide client data and budget for free plan users
    if (!isPremium) {
      applications = applications.map((app) => {
        const appObj = app.toObject();
        if (appObj.jobPost) {
          // Hide client data
          if (appObj.jobPost.client) {
            if (appObj.jobPost.client._id || appObj.jobPost.client.name || appObj.jobPost.client.email || appObj.jobPost.client.photo) {
              appObj.jobPost.client = { message: 'Premium members only' };
            } else {
              appObj.jobPost.client = { message: 'Premium members only' };
            }
          }
          
          // Hide budget data
          if (appObj.jobPost.budget) {
            appObj.jobPost.budget = {
              message: 'Premium members only'
            };
          }
        }
        
        // Replace contactUnlockedByClient boolean with "premium members only" for non-premium users
        if (appObj.contactUnlockedByClient !== undefined) {
          appObj.contactUnlockedByClient = 'premium members only';
        }
        
        return appObj;
      });
    }
  }

  res.status(200).json({
    status: 'success',
    results: applications.length,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
    data: {
      applications,
    },
  });
});

// Get a single application
exports.getApplication = catchAsync(async (req, res, next) => {
  const application = await JobApplication.findById(req.params.id)
    .populate({
      path: 'jobPost',
      select: 'title budget deadline status category description skillsRequired location client',
      populate: {
        path: 'client',
        select: 'name email photo clientProfile',
      },
    })
    .populate({
      path: 'student',
      select: '-password', // Exclude password
    });

  if (!application) {
    return next(new AppError('Application not found', 404));
  }

  const userId = req.user._id || req.user.id;

  // Check permissions - handle case where client might not be populated yet
  const isOwner = application.student && application.student._id.toString() === userId.toString();
  let isJobOwner = false;
  
  if (application.jobPost && application.jobPost.client) {
    const clientId = application.jobPost.client._id 
      ? application.jobPost.client._id.toString() 
      : application.jobPost.client.toString();
    isJobOwner = clientId === userId.toString();
  }

  if (!isOwner && !isJobOwner) {
    return next(
      new AppError(
        'You can only view your own applications or applications for your job posts',
        403
      )
    );
  }

  // Mark as read by client if accessed by client
  if (req.user.role === 'client' && !application.readByClient) {
    await JobApplication.findByIdAndUpdate(req.params.id, {
      readByClient: true,
      readByClientAt: Date.now(),
    });
    application.readByClient = true;
    application.readByClientAt = Date.now();
  }

  // For clients, hide student data if not unlocked
  if (req.user.role === 'client') {
    const appObj = application.toObject();
    
    // Get subscriptionTier before potentially hiding student data
    let subscriptionTier = appObj.student?.studentProfile?.subscriptionTier;
    
    // Fallback: If subscriptionTier is missing, check Subscription model
    if (!subscriptionTier && appObj.student?._id) {
      const Subscription = require('../models/subscriptionModel');
      const subscription = await Subscription.findOne({
        student: appObj.student._id,
        status: 'active',
        plan: 'premium'
      });
      subscriptionTier = subscription ? 'premium' : 'free';
    }
    
    // Check if student contact is unlocked
    if (!appObj.contactUnlockedByClient) {
      // Student is locked - hide all student data but keep subscriptionTier for premium badge
      appObj.student = {
        message: 'Student is Locked',
        studentProfile: subscriptionTier ? { subscriptionTier } : undefined
      };
    } else {
      // If unlocked, remove password and appliedJobs from student data but keep subscriptionTier
      if (appObj.student) {
        delete appObj.student.password;
        if (appObj.student.studentProfile) {
          // Ensure subscriptionTier is set (use fallback if missing)
          if (!appObj.student.studentProfile.subscriptionTier && subscriptionTier) {
            appObj.student.studentProfile.subscriptionTier = subscriptionTier;
          }
          // Remove sensitive fields but keep the rest
          if (appObj.student.studentProfile.appliedJobs) {
            delete appObj.student.studentProfile.appliedJobs;
          }
        } else if (subscriptionTier) {
          // If studentProfile doesn't exist but we have subscriptionTier, create it
          appObj.student.studentProfile = { subscriptionTier };
        }
      }
    }

    return res.status(200).json({
      status: 'success',
      data: {
        application: appObj,
      },
    });
  }

  // For students, check subscription and hide client data and budget for free users
  if (req.user.role === 'student') {
    const Subscription = require('../models/subscriptionModel');
    const subscription = await Subscription.findOne({
      student: req.user._id,
      status: 'active',
    });
    const isPremium = subscription?.plan === 'premium';

    const appObj = application.toObject();
    
    // Hide client data and budget for free plan users
    if (!isPremium) {
      // Replace contactUnlockedByClient boolean with "premium members only" for non-premium users
      if (appObj.contactUnlockedByClient !== undefined) {
        appObj.contactUnlockedByClient = 'premium members only';
      }
      
      if (appObj.jobPost) {
        // Hide client data
        if (appObj.jobPost.client) {
          if (appObj.jobPost.client._id || appObj.jobPost.client.name || appObj.jobPost.client.email || appObj.jobPost.client.photo) {
            appObj.jobPost.client = { message: 'Premium members only' };
          } else {
            appObj.jobPost.client = { message: 'Premium members only' };
          }
        }
        
        // Hide budget data
        if (appObj.jobPost.budget) {
          appObj.jobPost.budget = {
            message: 'Premium members only'
          };
        }
      }
    }

    return res.status(200).json({
      status: 'success',
      data: {
        application: appObj,
      },
    });
  }

  res.status(200).json({
    status: 'success',
    data: {
      application,
    },
  });
});

// Update application status (only clients)
exports.updateApplicationStatus = catchAsync(async (req, res, next) => {
  const { status, clientFeedback } = req.body;

  if (req.user.role !== 'client') {
    return next(
      new AppError('Only clients can update application status', 403)
    );
  }

  if (!['reviewed', 'accepted', 'rejected'].includes(status)) {
    return next(
      new AppError(
        'Invalid status. Must be reviewed, accepted, or rejected',
        400
      )
    );
  }

  const application = await JobApplication.findById(req.params.id);

  if (!application) {
    return next(new AppError('Application not found', 404));
  }

  const userId = req.user._id || req.user.id;

  // Check if client owns the job post
  if (application.jobPost.client._id.toString() !== userId.toString()) {
    return next(
      new AppError('You can only update applications for your job posts', 403)
    );
  }

  // Update application
  const updateData = { status };
  if (clientFeedback) {
    updateData.clientFeedback = {
      ...clientFeedback,
      givenAt: Date.now(),
    };
  }

  const updatedApplication = await JobApplication.findByIdAndUpdate(
    req.params.id,
    updateData,
    { new: true, runValidators: true }
  ).populate('student', 'studentProfile');

  // Update student's appliedJobs list status
  if (updatedApplication && updatedApplication.student) {
    const student = await User.findById(updatedApplication.student._id);
    if (student && student.studentProfile && student.studentProfile.appliedJobs) {
      const jobIndex = student.studentProfile.appliedJobs.findIndex(
        (job) => job.jobId.toString() === application.jobPost._id.toString()
      );
      
      if (jobIndex !== -1) {
        student.studentProfile.appliedJobs[jobIndex].status = status;
        if (status === 'accepted') {
          student.studentProfile.appliedJobs[jobIndex].acceptedAt = Date.now();
        }
        try {
          await student.save({ validateBeforeSave: false });
        } catch (saveError) {
          logger.error('Error updating student appliedJobs status:', saveError);
        }
      }
    }
  }

  // If accepted, update job post status to in-progress
  if (status === 'accepted') {
    await JobPost.findByIdAndUpdate(application.jobPost._id, {
      status: 'in-progress',
    });
  }

  // Send notification email to student
  try {
    await sendEmail({
      type: 'application-status-update',
      email: application.student.email,
      name: application.student.name,
      subject: `Application Update for "${application.jobPost.title}"`,
      message: `Your application for "${application.jobPost.title}" has been ${status}.`,
      jobTitle: application.jobPost.title,
      newStatus: status,
      feedback: clientFeedback && clientFeedback.message,
    });
  } catch (err) {
    logger.error('Failed to send status update notification email:', err.message);
  }

  res.status(200).json({
    status: 'success',
    data: {
      application: updatedApplication,
    },
  });
});

// Accept application (only clients)
exports.acceptApplication = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'client') {
    return next(new AppError('Only clients can accept applications', 403));
  }

  const application = await JobApplication.findById(req.params.id).populate([
    { path: 'student', select: 'name email' },
    { path: 'jobPost', select: 'title client' },
  ]);

  if (!application) {
    return next(new AppError('Application not found', 404));
  }

  const userId = req.user._id || req.user.id;

  // Check if client owns the job post
  const jobClientId = application.jobPost.client._id
    ? application.jobPost.client._id.toString()
    : application.jobPost.client.toString();

  if (jobClientId !== userId.toString()) {
    return next(new AppError('You can only accept applications for your own jobs', 403));
  }

  // Update application status
  application.status = 'accepted';
  application.acceptedAt = Date.now();
  await application.save();

  // Update student's appliedJobs list status
  const student = await User.findById(application.student._id);
  if (student && student.studentProfile && student.studentProfile.appliedJobs) {
    const jobIndex = student.studentProfile.appliedJobs.findIndex(
      (job) => job.jobId.toString() === application.jobPost._id.toString()
    );
    
    if (jobIndex !== -1) {
      student.studentProfile.appliedJobs[jobIndex].status = 'accepted';
      student.studentProfile.appliedJobs[jobIndex].acceptedAt = Date.now();
      try {
        await student.save({ validateBeforeSave: false });
      } catch (saveError) {
        logger.error('Error updating student appliedJobs status on accept:', saveError);
      }
    }
  }

  // Update job post status to in-progress
  await JobPost.findByIdAndUpdate(application.jobPost._id, {
    status: 'in-progress',
  });

  // Send notification email to student
  try {
    const frontendUrl = process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? 'https://freshlancer.online' : 'http://localhost:3000');
    await sendEmail({
      type: 'application-status-update',
      email: application.student.email,
      name: application.student.name,
      subject: `Application Accepted for "${application.jobPost.title}"`,
      message: `Your application for "${application.jobPost.title}" has been accepted.`,
      jobTitle: application.jobPost.title,
      newStatus: 'accepted',
      feedback: null,
      dashboardUrl: `${frontendUrl}/student/applications/${application._id}`,
    });
  } catch (err) {
    logger.error('Failed to send acceptance notification email:', err.message);
  }

  // Create notification for student
  const Notification = require('../models/notificationModel');
  await Notification.create({
    user: application.student._id,
    type: 'application_status',
    title: 'Application Accepted!',
    message: `Congratulations! Your application for "${application.jobPost.title}" has been accepted. The client can now contact you to discuss the project. This is not a final approval - please wait for the client to reach out.`,
    relatedId: application._id,
    relatedType: 'JobApplication',
    icon: 'success',
  });

  res.status(200).json({
    status: 'success',
    data: {
      application,
    },
  });
});

// Reject application (only clients)
exports.rejectApplication = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'client') {
    return next(new AppError('Only clients can reject applications', 403));
  }

  const { reason } = req.body;

  const application = await JobApplication.findById(req.params.id).populate([
    { path: 'student', select: 'name email' },
    { path: 'jobPost', select: 'title client' },
  ]);

  if (!application) {
    return next(new AppError('Application not found', 404));
  }

  const userId = req.user._id || req.user.id;

  // Check if client owns the job post
  const jobClientId = application.jobPost.client._id
    ? application.jobPost.client._id.toString()
    : application.jobPost.client.toString();

  if (jobClientId !== userId.toString()) {
    return next(new AppError('You can only reject applications for your own jobs', 403));
  }

  // Update application status
  application.status = 'rejected';
  application.rejectedAt = Date.now();
  if (reason) {
    application.rejectionReason = reason;
  }
  await application.save();

  // Update student's appliedJobs list status
  const student = await User.findById(application.student._id);
  if (student && student.studentProfile && student.studentProfile.appliedJobs) {
    const jobIndex = student.studentProfile.appliedJobs.findIndex(
      (job) => job.jobId.toString() === application.jobPost._id.toString()
    );
    
    if (jobIndex !== -1) {
      student.studentProfile.appliedJobs[jobIndex].status = 'rejected';
      student.studentProfile.appliedJobs[jobIndex].rejectedAt = Date.now();
      if (reason) {
        student.studentProfile.appliedJobs[jobIndex].rejectionReason = reason;
      }
      try {
        await student.save({ validateBeforeSave: false });
      } catch (saveError) {
        logger.error('Error updating student appliedJobs status on reject:', saveError);
      }
    }
  }

  // Create notification for student
  const Notification = require('../models/notificationModel');
  await Notification.create({
    user: application.student._id,
    type: 'application_status',
    title: 'Application Update',
    message: `Your application for "${application.jobPost.title}" was not selected at this time.${reason ? ` Reason: ${reason}` : ''}`,
    relatedId: application._id,
    relatedType: 'JobApplication',
    icon: 'info',
  });

  res.status(200).json({
    status: 'success',
    data: {
      application,
    },
  });
});

// Withdraw application (only students)
exports.withdrawApplication = catchAsync(async (req, res, next) => {
  const { reason } = req.body;

  if (req.user.role !== 'student') {
    return next(
      new AppError('Only students can withdraw their applications', 403)
    );
  }

  const application = await JobApplication.findById(req.params.id);

  if (!application) {
    return next(new AppError('Application not found', 404));
  }

  const userId = req.user._id || req.user.id;

  // Check if student owns the application
  if (application.student._id.toString() !== userId.toString()) {
    return next(
      new AppError('You can only withdraw your own applications', 403)
    );
  }

  // Check if application can be withdrawn
  if (['accepted', 'withdrawn'].includes(application.status)) {
    return next(
      new AppError(
        'Cannot withdraw an accepted or already withdrawn application',
        400
      )
    );
  }

  const updatedApplication = await JobApplication.findByIdAndUpdate(
    req.params.id,
    {
      status: 'withdrawn',
      withdrawnAt: Date.now(),
      withdrawalReason: reason,
    },
    { new: true, runValidators: true }
  );

  // Decrement applicationsCount in JobPost
  await JobPost.findByIdAndUpdate(
    application.jobPost,
    { $inc: { applicationsCount: -1 } },
    { new: true }
  );

  res.status(200).json({
    status: 'success',
    message: 'Application withdrawn successfully',
    data: {
      application: updatedApplication,
    },
  });
});

// Delete application (only by student who created it, and only if not accepted)
exports.deleteApplication = catchAsync(async (req, res, next) => {
  const application = await JobApplication.findById(req.params.id);

  if (!application) {
    return next(new AppError('Application not found', 404));
  }

  const userId = req.user._id || req.user.id;

  // Check if student owns the application
  if (application.student._id.toString() !== userId.toString()) {
    return next(new AppError('You can only delete your own applications', 403));
  }

  // Check if application can be deleted
  if (application.status === 'accepted') {
    return next(new AppError('Cannot delete an accepted application', 400));
  }

  // Decrement applicationsCount in JobPost only if not withdrawn
  if (application.status !== 'withdrawn') {
    await JobPost.findByIdAndUpdate(
      application.jobPost,
      { $inc: { applicationsCount: -1 } },
      { new: true }
    );
  }

  await JobApplication.findByIdAndDelete(req.params.id);

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

// Get application statistics
exports.getApplicationStats = catchAsync(async (req, res, next) => {
  let matchStage = {};

  const userId = req.user._id || req.user.id;

  if (req.user.role === 'student') {
    matchStage.student = userId;
  } else if (req.user.role === 'client') {
    const myJobPosts = await JobPost.find({ client: userId }).select(
      '_id'
    );
    const jobPostIds = myJobPosts.map((job) => job._id);
    matchStage.jobPost = { $in: jobPostIds };
  }

  const stats = await JobApplication.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        avgProposedBudget: { $avg: '$proposedBudget.amount' },
      },
    },
    { $sort: { count: -1 } },
  ]);

  // Monthly application trends
  const monthlyStats = await JobApplication.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.year': -1, '_id.month': -1 } },
    { $limit: 12 },
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      statusStats: stats,
      monthlyStats,
    },
  });
});

// Check if student has already applied to a job
exports.checkApplicationStatus = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'student') {
    return next(new AppError('Only students can check application status', 403));
  }

  const userId = req.user._id || req.user.id;

  // Check if student has already applied (including ALL statuses: pending, accepted, rejected, withdrawn)
  const existingApplication = await JobApplication.findOne({
    jobPost: req.params.jobId,
    student: userId,
  });

  res.status(200).json({
    status: 'success',
    data: {
      hasApplied: !!existingApplication,
      application: existingApplication || null,
    },
  });
});

// Unlock student contact (only clients, costs 10 points)
exports.unlockStudentContact = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'client') {
    return next(new AppError('Only clients can unlock student contacts', 403));
  }

  // Fetch application with populated jobPost to check ownership
  const application = await JobApplication.findById(req.params.id).populate({
    path: 'jobPost',
    select: 'client',
  });

  if (!application) {
    return next(new AppError('Application not found', 404));
  }

  if (!application.jobPost) {
    return next(new AppError('Job post not found', 404));
  }

  const userId = req.user._id || req.user.id;

  // Check if client owns the job post
  const jobPostClientId = application.jobPost.client._id
    ? application.jobPost.client._id.toString()
    : application.jobPost.client.toString();

  if (jobPostClientId !== userId.toString()) {
    return next(
      new AppError('You can only unlock contacts for your own job posts', 403)
    );
  }

  // Check if already unlocked
  if (application.contactUnlockedByClient) {
    return res.status(200).json({
      status: 'success',
      message: 'Contact already unlocked',
      data: {
        application,
      },
    });
  }

  // Get client user to check points
  const User = require('../models/userModel');
  const client = await User.findById(userId);

  if (!client) {
    return next(new AppError('Client not found', 404));
  }

  // Check if enough points
  const pointsCost = 10;
  const currentPoints = client.clientProfile?.pointsRemaining || 0;

  if (currentPoints < pointsCost) {
    return next(
      new AppError(
        `Insufficient points. You need ${pointsCost} points to unlock this contact. You have ${currentPoints} points remaining.`,
        400
      )
    );
  }

  // Deduct points from user
  client.clientProfile.pointsRemaining -= pointsCost;
  client.clientProfile.pointsUsed += pointsCost;

  // Add student to unlocked students list if not already there
  if (!client.clientProfile.unlockedStudents) {
    client.clientProfile.unlockedStudents = [];
  }

  const studentId = application.student._id || application.student;
  if (!client.clientProfile.unlockedStudents.some(id => id.toString() === studentId.toString())) {
    client.clientProfile.unlockedStudents.push(studentId);
  }

  await client.save({ validateBeforeSave: false });

  // Mark application as unlocked
  application.contactUnlockedByClient = true;
  application.contactUnlockedAt = Date.now();
  await application.save({ validateBeforeSave: false });

  // Populate the application before returning
  await application.populate([
    {
      path: 'jobPost',
      select: 'title budget deadline status client',
      populate: {
        path: 'client',
        select: 'name email photo',
      },
    },
    {
      path: 'student',
      select: '-password', // Exclude password
    },
  ]);

  // Remove password and appliedJobs from student data, but preserve subscriptionTier
  const appObj = application.toObject();
  
  // Ensure subscriptionTier is preserved
  let subscriptionTier = appObj.student?.studentProfile?.subscriptionTier;
  
  // Fallback: If subscriptionTier is missing, check Subscription model
  if (!subscriptionTier && appObj.student?._id) {
    const Subscription = require('../models/subscriptionModel');
    const subscription = await Subscription.findOne({
      student: appObj.student._id,
      status: 'active',
      plan: 'premium'
    });
    subscriptionTier = subscription ? 'premium' : 'free';
  }
  
  if (appObj.student) {
    delete appObj.student.password;
    if (appObj.student.studentProfile) {
      // Ensure subscriptionTier is set (use fallback if missing)
      if (!appObj.student.studentProfile.subscriptionTier && subscriptionTier) {
        appObj.student.studentProfile.subscriptionTier = subscriptionTier;
      }
      // Remove sensitive fields but keep the rest
      if (appObj.student.studentProfile.appliedJobs) {
        delete appObj.student.studentProfile.appliedJobs;
      }
    } else if (subscriptionTier) {
      // If studentProfile doesn't exist but we have subscriptionTier, create it
      appObj.student.studentProfile = { subscriptionTier };
    }
  }

  res.status(200).json({
    status: 'success',
    message: `Student contact unlocked successfully. ${pointsCost} points deducted.`,
    data: {
      application: appObj,
      pointsRemaining: client.clientProfile.pointsRemaining,
    },
  });
});

// Get applications for a specific job with filters (only clients)
exports.getJobApplications = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'client') {
    return next(new AppError('Only clients can view job applications', 403));
  }

  const { jobId } = req.params;

  // Verify job belongs to client
  const jobPost = await JobPost.findById(jobId);
  if (!jobPost) {
    return next(new AppError('Job post not found', 404));
  }

  const clientId = req.user._id || req.user.id;
  const jobClientId = jobPost.client._id ? jobPost.client._id.toString() : jobPost.client.toString();

  if (jobClientId !== clientId.toString()) {
    return next(new AppError('You can only view applications for your own jobs', 403));
  }

  // Build aggregation pipeline for proper filtering
  const pipeline = [
    { $match: { jobPost: jobPost._id } },
    {
      $lookup: {
        from: 'users',
        localField: 'student',
        foreignField: '_id',
        as: 'student',
      },
    },
    { $unwind: '$student' },
  ];

  // Apply filters (must be after $unwind so student data is available)
  const matchStage = {};

  // Filter by experience level (check student's experience level)
  if (req.query.experienceLevel) {
    matchStage['student.studentProfile.experienceLevel'] = req.query.experienceLevel;
  }

  // Filter by status
  if (req.query.status) {
    matchStage.status = req.query.status;
  }

  // Filter by nationality
  if (req.query.nationality) {
    matchStage['student.nationality'] = req.query.nationality;
  }

  // Filter by subscription tier
  if (req.query.subscriptionTier) {
    matchStage['student.studentProfile.subscriptionTier'] = req.query.subscriptionTier;
  }

  // Add match stage if there are filters (before $project)
  if (Object.keys(matchStage).length > 0) {
    pipeline.push({ $match: matchStage });
  }

  // Exclude password but keep subscriptionTier for premium badge display
  pipeline.push({
    $project: {
      'student.password': 0,
      'student.studentProfile.appliedJobs': 0,
      'student.studentProfile.resume': 0,
      'student.studentProfile.verificationDocuments': 0,
      'student.studentProfile.additionalDocuments': 0,
      // Keep subscriptionTier to show premium badge
    },
  });

  // Add sorting
  const sortBy = req.query.sortBy || 'createdAt';
  const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
  pipeline.push({ $sort: { [sortBy]: sortOrder } });

  // Get total count before pagination
  const countPipeline = [...pipeline, { $count: 'total' }];
  const countResult = await JobApplication.aggregate(countPipeline);
  const total = countResult.length > 0 ? countResult[0].total : 0;

  // Add pagination
  const page = req.query.page * 1 || 1;
  const limit = req.query.limit * 1 || 10;
  const skip = (page - 1) * limit;

  pipeline.push({ $skip: skip });
  pipeline.push({ $limit: limit });

  // Execute aggregation
  let applications = await JobApplication.aggregate(pipeline);

  // Get all student IDs to check subscription status if subscriptionTier is missing
  const studentIds = [...new Set(applications.map(app => app.student?._id).filter(Boolean))];
  const Subscription = require('../models/subscriptionModel');
  const activeSubscriptions = await Subscription.find({
    student: { $in: studentIds },
    status: 'active',
    plan: 'premium'
  }).select('student plan');
  
  // Create a map of student IDs to premium status
  const premiumStudentMap = new Map();
  activeSubscriptions.forEach(sub => {
    premiumStudentMap.set(sub.student.toString(), true);
  });

  // Hide student data for applications that are not unlocked, but keep subscriptionTier for premium badge
  applications = applications.map((app) => {
    // Check if student contact is unlocked
    // contactUnlockedByClient defaults to false, so check explicitly
    let subscriptionTier = app.student?.studentProfile?.subscriptionTier;
    
    // Fallback: If subscriptionTier is missing, check Subscription model
    if (!subscriptionTier && app.student?._id) {
      const studentId = app.student._id.toString();
      if (premiumStudentMap.has(studentId)) {
        subscriptionTier = 'premium';
      } else {
        subscriptionTier = 'free';
      }
    }
    
    if (!app.contactUnlockedByClient || app.contactUnlockedByClient === false) {
      // Student is locked - hide all student data but keep subscriptionTier for premium badge
      app.student = {
        message: 'Student is Locked',
        studentProfile: subscriptionTier ? { subscriptionTier } : undefined
      };
    } else {
      // If unlocked, remove password and sensitive data but keep all studentProfile data including subscriptionTier
      if (app.student) {
        delete app.student.password;
        if (app.student.studentProfile) {
          // Ensure subscriptionTier is set (use fallback if missing)
          if (!app.student.studentProfile.subscriptionTier && subscriptionTier) {
            app.student.studentProfile.subscriptionTier = subscriptionTier;
          }
          // Remove sensitive fields but keep the rest of studentProfile
          delete app.student.studentProfile.appliedJobs;
          delete app.student.studentProfile.resume;
          delete app.student.studentProfile.verificationDocuments;
          delete app.student.studentProfile.additionalDocuments;
        } else if (subscriptionTier) {
          // If studentProfile doesn't exist but we have subscriptionTier, create it
          app.student.studentProfile = { subscriptionTier };
        }
      }
    }
    return app;
  });

  // Get unique nationalities for filter dropdown
  const uniqueNationalities = await JobApplication.aggregate([
    { $match: { jobPost: jobPost._id } },
    {
      $lookup: {
        from: 'users',
        localField: 'student',
        foreignField: '_id',
        as: 'studentData',
      },
    },
    { $unwind: '$studentData' },
    { $group: { _id: '$studentData.nationality' } },
    { $sort: { _id: 1 } },
  ]);

  res.status(200).json({
    status: 'success',
    results: applications.length,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
    data: {
      applications,
      uniqueNationalities: uniqueNationalities.map((n) => n._id).filter(Boolean),
    },
  });
});
