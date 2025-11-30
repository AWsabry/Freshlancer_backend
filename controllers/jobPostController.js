const JobPost = require('../models/jobPostModel');
const JobApplication = require('../models/jobApplicationModel');
const Category = require('../models/categoryModel');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

// Create a new job post (only clients)
exports.createJobPost = catchAsync(async (req, res, next) => {
  // Ensure only clients can create job posts
  if (req.user.role !== 'client') {
    return next(new AppError('Only clients can create job posts', 403));
  }

  // Add the client ID to the job post data
  req.body.client = req.user.id;

  // Validate category exists and is active
  if (req.body.category) {
    const category = await Category.findOne({
      name: req.body.category,
      isActive: true,
    });
    if (!category) {
      return next(new AppError('Invalid or inactive category', 400));
    }
  }

  // Remove deadline if it's empty or not provided
  if (!req.body.deadline || req.body.deadline === '' || req.body.deadline === null) {
    delete req.body.deadline;
  }

  const jobPost = await JobPost.create(req.body);

  res.status(201).json({
    status: 'success',
    data: {
      jobPost,
    },
  });
});

// Get all job posts with filtering and pagination
exports.getAllJobPosts = catchAsync(async (req, res, next) => {
  // Create a copy of query object and remove excluded fields
  const queryObj = { ...req.query };
  const excludedFields = ['page', 'sort', 'limit', 'fields', 'currency'];
  excludedFields.forEach((el) => delete queryObj[el]);

  // Only show open job posts to students, all posts to clients
  if (req.user.role === 'student') {
    queryObj.status = 'open';
  } else if (req.user.role === 'client') {
    // Clients can only see their own job posts
    queryObj.client = req.user.id;
  }

  // Advanced filtering
  let queryStr = JSON.stringify(queryObj);
  queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, (match) => `$${match}`);
  const queryObject = JSON.parse(queryStr);

  // Create query
  let query = JobPost.find(queryObject);
  
  // Apply currency filter using where() to ensure dot notation works
  if (req.query.currency) {
    if (req.user.role === 'student') {
      // Check if student has premium subscription
      const Subscription = require('../models/subscriptionModel');
      const subscription = await Subscription.findOne({
        student: req.user._id,
        status: 'active',
      });
      const isPremium = subscription?.plan === 'premium';
      
      if (isPremium) {
        query = query.where('budget.currency').equals(req.query.currency);
      }
    } else {
      // For clients and admins, allow currency filtering
      query = query.where('budget.currency').equals(req.query.currency);
    }
  }
  
  // Sorting
  if (req.query.sort) {
    // Handle special sort options
    if (req.query.sort === 'budget-desc') {
      // Sort by highest budget (budget.max descending)
      query = query.sort('-budget.max');
    } else if (req.query.sort === 'budget-asc') {
      // Sort by lowest budget (budget.min ascending)
      query = query.sort('budget.min');
    } else if (req.query.sort === 'createdAt-desc') {
      // Sort by newest first (descending)
      query = query.sort('-createdAt');
    } else if (req.query.sort === 'createdAt-asc') {
      // Sort by oldest first (ascending)
      query = query.sort('createdAt');
    } else {
      const sortBy = req.query.sort.split(',').join(' ');
      query = query.sort(sortBy);
    }
  } else {
    // Default: sort by newest first (descending)
    query = query.sort('-createdAt');
  }

  // Field limiting
  if (req.query.fields) {
    const fields = req.query.fields.split(',').join(' ');
    query = query.select(fields);
  } else {
    query = query.select('-__v');
  }

  // Pagination
  const page = req.query.page * 1 || 1;
  const limit = req.query.limit * 1 || 10;
  const skip = (page - 1) * limit;

  query = query.skip(skip).limit(limit);

  // Execute query with populated client info
  query = query.populate({
    path: 'client',
    select: 'name email photo clientProfile',
  });

  let jobPosts = await query;
  const total = await JobPost.countDocuments(queryObject);

  // For students, check which jobs they have applied to and subscription status
  if (req.user.role === 'student') {
    const User = require('../models/userModel');
    const Subscription = require('../models/subscriptionModel');
    
    const student = await User.findById(req.user._id).select('studentProfile.appliedJobs');
    const appliedJobIds = student?.studentProfile?.appliedJobs?.map((job) => job.jobId.toString()) || [];

    // Check if student has premium subscription
    const subscription = await Subscription.findOne({
      student: req.user._id,
      status: 'active',
    });
    const isPremium = subscription?.plan === 'premium';

    // Add hasApplied field and handle client data based on subscription
    jobPosts = jobPosts.map((job) => {
      const jobObj = job.toObject();
      jobObj.hasApplied = appliedJobIds.includes(job._id.toString());
      
      // Hide client data and budget for free plan users
      if (!isPremium) {
        // Hide client data
        if (jobObj.client && (jobObj.client._id || jobObj.client.name || jobObj.client.email || jobObj.client.photo)) {
          // Client exists but user is on free plan - hide client data
          jobObj.client = {
            message: 'Premium members only'
          };
        } else {
          // Client doesn't exist or is empty - show premium message
          jobObj.client = {
            message: 'Premium members only'
          };
        }
        
        // Hide budget data
        if (jobObj.budget) {
          jobObj.budget = {
            message: 'Premium members only'
          };
        }

        // Hide startup data for free plan users
        if (jobObj.startup) {
          jobObj.startup = {
            message: 'Premium members only'
          };
        }
      }
      // Premium users see all client data, budget, and startup (no changes needed)
      
      return jobObj;
    });
  }

  res.status(200).json({
    status: 'success',
    results: jobPosts.length,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
    data: {
      jobPosts,
    },
  });
});

// Get a single job post
exports.getJobPost = catchAsync(async (req, res, next) => {
  // Validate the ID format
  if (!req.params.id || req.params.id.length !== 24) {
    return next(new AppError('Invalid job post ID format', 400));
  }

  const jobPost = await JobPost.findById(req.params.id)
    .populate({
      path: 'client',
      select: 'name email photo clientProfile',
    })
    .populate({
      path: 'startup',
      select: 'startupName',
    });

  if (!jobPost) {
    return next(new AppError('No job post found with that ID', 404));
  }

  // Students can view any open job post
  // Clients can only view their own job posts
  const userId = req.user._id || req.user.id;
  
  // Check client ownership - handle case where client might not be populated or doesn't exist
  if (req.user.role === 'client') {
    try {
      // Handle different cases: populated client object, client ID string, or null
      let clientId = null;
      
      if (jobPost.client) {
        if (jobPost.client._id) {
          // Client is populated as an object
          clientId = jobPost.client._id.toString();
        } else if (typeof jobPost.client === 'string') {
          // Client is just an ID string
          clientId = jobPost.client;
        } else if (jobPost.client.toString) {
          // Try to convert to string
          clientId = jobPost.client.toString();
        }
      }
      
      // Only check ownership if we have a client ID
      if (clientId && clientId !== userId.toString()) {
        return next(new AppError('You can only view your own job posts', 403));
      }
    } catch (err) {
      // If there's any error accessing client, log it but don't block the request
      console.error('Error checking client ownership:', err);
    }
  }

  if (req.user.role === 'student' && jobPost.status !== 'open') {
    return next(new AppError('This job post is no longer available', 404));
  }

  // For students, check subscription and hide client data and budget for free users
  if (req.user.role === 'student') {
    // Fetch user with studentProfile to check subscriptionTier
    const User = require('../models/userModel');
    const student = await User.findById(req.user._id).select('studentProfile.subscriptionTier');
    
    // Check subscription tier from user profile (primary source)
    const subscriptionTier = student?.studentProfile?.subscriptionTier || 'free';
    let isPremium = subscriptionTier === 'premium';
    
    // Also check Subscription model as fallback
    if (!isPremium) {
      const Subscription = require('../models/subscriptionModel');
      const subscription = await Subscription.findOne({
        student: req.user._id,
        status: 'active',
      });
      isPremium = subscription?.plan === 'premium' || false;
    }

    const jobObj = jobPost.toObject();
    
    // Hide client data and budget for free plan users
    if (!isPremium) {
      // Hide client data - remove all client information
      jobObj.client = { message: 'Premium members only' };
      
      // Hide budget data - remove all budget information
      jobObj.budget = {
        message: 'Premium members only'
      };

      // Hide startup data for free plan users
      if (jobObj.startup) {
        jobObj.startup = {
          message: 'Premium members only'
        };
      }
    }

    return res.status(200).json({
      status: 'success',
      data: {
        jobPost: jobObj,
      },
    });
  }

  res.status(200).json({
    status: 'success',
    data: {
      jobPost,
    },
  });
});

// Update a job post (only by the client who created it)
exports.updateJobPost = catchAsync(async (req, res, next) => {
  // Validate category if it's being updated
  if (req.body.category) {
    const category = await Category.findOne({
      name: req.body.category,
      isActive: true,
    });
    if (!category) {
      return next(new AppError('Invalid or inactive category', 400));
    }
  }
  const jobPost = await JobPost.findById(req.params.id);

  if (!jobPost) {
    return next(new AppError('No job post found with that ID', 404));
  }

  // Only the client who created the job post can update it
  if (jobPost.client._id.toString() !== req.user.id) {
    return next(new AppError('You can only update your own job posts', 403));
  }

  // Prevent updating certain fields
  const restrictedFields = ['client', 'applicationsCount', 'createdAt'];
  restrictedFields.forEach((field) => delete req.body[field]);

  // Remove deadline if it's empty or not provided
  if (!req.body.deadline || req.body.deadline === '' || req.body.deadline === null) {
    delete req.body.deadline;
  }

  const updatedJobPost = await JobPost.findByIdAndUpdate(
    req.params.id,
    req.body,
    {
      new: true,
      runValidators: true,
    }
  );

  res.status(200).json({
    status: 'success',
    data: {
      jobPost: updatedJobPost,
    },
  });
});

// Delete a job post (only by the client who created it)
exports.deleteJobPost = catchAsync(async (req, res, next) => {
  const jobPost = await JobPost.findById(req.params.id);

  if (!jobPost) {
    return next(new AppError('No job post found with that ID', 404));
  }

  // Only the client who created the job post can delete it
  if (jobPost.client._id.toString() !== req.user.id) {
    return next(new AppError('You can only delete your own job posts', 403));
  }

  // Check if job post has applications
  if (jobPost.applicationsCount > 0) {
    return next(
      new AppError(
        'Cannot delete job post with existing applications. Please close it instead.',
        400
      )
    );
  }

  await JobPost.findByIdAndDelete(req.params.id);

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

// Close a job post (mark as completed or cancelled)
exports.closeJobPost = catchAsync(async (req, res, next) => {
  const { status } = req.body;

  if (!['completed', 'cancelled'].includes(status)) {
    return next(
      new AppError('Status must be either completed or cancelled', 400)
    );
  }

  const jobPost = await JobPost.findById(req.params.id);

  if (!jobPost) {
    return next(new AppError('No job post found with that ID', 404));
  }

  // Only the client who created the job post can close it
  if (jobPost.client._id.toString() !== req.user.id) {
    return next(new AppError('You can only close your own job posts', 403));
  }

  if (jobPost.status !== 'open' && jobPost.status !== 'in-progress') {
    return next(new AppError('Job post is already closed', 400));
  }

  // If status is 'cancelled', automatically withdraw all applications for this job
  if (status === 'cancelled') {
    const applicationsToWithdraw = await JobApplication.find({
      jobPost: req.params.id,
      status: { $nin: ['withdrawn', 'accepted'] }, // Don't withdraw already withdrawn or accepted applications
    });

    // Update all applicable applications to 'withdrawn'
    await JobApplication.updateMany(
      {
        jobPost: req.params.id,
        status: { $nin: ['withdrawn', 'accepted'] },
      },
      {
        $set: {
          status: 'withdrawn',
          withdrawnAt: Date.now(),
          withdrawalReason: 'Job was withdrawn by client',
        },
      }
    );

    console.log(
      `Automatically withdrew ${applicationsToWithdraw.length} applications for cancelled job ${req.params.id}`
    );
  }

  // If status is 'completed', automatically reject all non-accepted applications
  if (status === 'completed') {
    const applicationsToReject = await JobApplication.find({
      jobPost: req.params.id,
      status: { $nin: ['rejected', 'accepted', 'withdrawn'] }, // Don't reject already rejected, accepted, or withdrawn applications
    });

    // Update all applicable applications to 'rejected'
    await JobApplication.updateMany(
      {
        jobPost: req.params.id,
        status: { $nin: ['rejected', 'accepted', 'withdrawn'] },
      },
      {
        $set: {
          status: 'rejected',
        },
      }
    );

    console.log(
      `Automatically rejected ${applicationsToReject.length} applications for completed job ${req.params.id}`
    );
  }

  const updatedJobPost = await JobPost.findByIdAndUpdate(
    req.params.id,
    { status },
    {
      new: true,
      runValidators: true,
    }
  );

  res.status(200).json({
    status: 'success',
    data: {
      jobPost: updatedJobPost,
    },
  });
});

// Get job posts statistics for dashboard
exports.getJobPostStats = catchAsync(async (req, res, next) => {
  let matchStage = {};

  // Clients can only see their own stats
  if (req.user.role === 'client') {
    matchStage.client = req.user._id;
  }

  const stats = await JobPost.aggregate([
    {
      $match: matchStage,
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        avgBudget: { $avg: '$budget.max' },
        totalApplications: { $sum: '$applicationsCount' },
      },
    },
    {
      $sort: { count: -1 },
    },
  ]);

  const categoryStats = await JobPost.aggregate([
    {
      $match: matchStage,
    },
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 },
        avgBudget: { $avg: '$budget.max' },
      },
    },
    {
      $sort: { count: -1 },
    },
    {
      $limit: 10,
    },
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      statusStats: stats,
      categoryStats,
    },
  });
});

// Search job posts with text search
exports.searchJobPosts = catchAsync(async (req, res, next) => {
  const { q } = req.query;

  if (!q) {
    return next(new AppError('Please provide a search query', 400));
  }

  let matchStage = {
    $and: [
      {
        $or: [
          { title: { $regex: q, $options: 'i' } },
          { description: { $regex: q, $options: 'i' } },
          { skillsRequired: { $in: [new RegExp(q, 'i')] } },
          { category: { $regex: q, $options: 'i' } },
        ],
      },
    ],
  };

  // Students can only search open job posts
  if (req.user.role === 'student') {
    matchStage.$and.push({ status: 'open' });
  } else if (req.user.role === 'client') {
    matchStage.$and.push({ client: req.user._id });
  }
  
  // Handle currency filter (premium only for students)
  if (req.query.currency) {
    if (req.user.role === 'student') {
      // Check if student has premium subscription
      const Subscription = require('../models/subscriptionModel');
      const subscription = await Subscription.findOne({
        student: req.user._id,
        status: 'active',
      });
      const isPremium = subscription?.plan === 'premium';
      
      if (isPremium) {
        matchStage.$and.push({ 'budget.currency': req.query.currency });
      }
    } else {
      // For clients and admins, allow currency filtering
      matchStage.$and.push({ 'budget.currency': req.query.currency });
    }
  }

  const page = req.query.page * 1 || 1;
  const limit = req.query.limit * 1 || 10;
  const skip = (page - 1) * limit;

  // Determine sort order
  let sortStage = { createdAt: -1 }; // Default sort (newest first)
  if (req.query.sort === 'budget-desc') {
    sortStage = { 'budget.max': -1 }; // Sort by highest budget
  } else if (req.query.sort === 'budget-asc') {
    sortStage = { 'budget.min': 1 }; // Sort by lowest budget
  } else if (req.query.sort === 'createdAt-desc') {
    sortStage = { createdAt: -1 }; // Sort by newest first (descending)
  } else if (req.query.sort === 'createdAt-asc') {
    sortStage = { createdAt: 1 }; // Sort by oldest first (ascending)
  }

  const jobPosts = await JobPost.aggregate([
    { $match: matchStage },
    { $sort: sortStage },
    { $skip: skip },
    { $limit: limit },
    {
      $lookup: {
        from: 'users',
        localField: 'client',
        foreignField: '_id',
        as: 'client',
        pipeline: [{ $project: { name: 1, email: 1, photo: 1, role: 1 } }],
      },
    },
    { $unwind: { path: '$client', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'startups',
        localField: 'startup',
        foreignField: '_id',
        as: 'startup',
        pipeline: [{ $project: { startupName: 1 } }],
      },
    },
    { $unwind: { path: '$startup', preserveNullAndEmptyArrays: true } },
  ]);

  const total = await JobPost.aggregate([
    { $match: matchStage },
    { $count: 'total' },
  ]);

  const totalCount = total.length > 0 ? total[0].total : 0;

  // For students, check subscription and hide client data and budget for free users
  if (req.user.role === 'student') {
    const Subscription = require('../models/subscriptionModel');
    const subscription = await Subscription.findOne({
      student: req.user._id,
      status: 'active',
    });
    const isPremium = subscription?.plan === 'premium';

    // Hide client data and budget for free plan users
    if (!isPremium) {
      jobPosts.forEach((job) => {
        // Hide client data
        if (job.client && (job.client._id || job.client.name || job.client.email || job.client.photo)) {
          job.client = { message: 'Premium members only' };
        } else {
          job.client = { message: 'Premium members only' };
        }
        
        // Hide budget data
        if (job.budget) {
          job.budget = {
            message: 'Premium members only'
          };
        }

        // Hide startup data for free plan users
        if (job.startup) {
          job.startup = {
            message: 'Premium members only'
          };
        }
      });
    }
  }

  res.status(200).json({
    status: 'success',
    results: jobPosts.length,
    pagination: {
      page,
      limit,
      total: totalCount,
      pages: Math.ceil(totalCount / limit),
    },
    data: {
      jobPosts,
    },
  });
});

// Get featured/urgent job posts
exports.getFeaturedJobPosts = catchAsync(async (req, res, next) => {
  const limit = req.query.limit * 1 || 6;

  const featuredJobs = await JobPost.find({
    status: 'open',
    $or: [{ featured: true }, { urgent: true }],
  })
    .sort({ urgent: -1, featured: -1, createdAt: -1 })
    .limit(limit);

  res.status(200).json({
    status: 'success',
    results: featuredJobs.length,
    data: {
      jobPosts: featuredJobs,
    },
  });
});

