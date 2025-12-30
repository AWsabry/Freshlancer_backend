const Startup = require('../models/startupModel');
const User = require('../models/userModel');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

// Create a new startup
exports.createStartup = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'client') {
    return next(new AppError('Only clients can create startup profiles', 403));
  }

  // Handle industry - if "Other" is selected, use industryOther
  let industryValue = req.body.industry;
  if (req.body.industry === 'Other' && req.body.industryOther) {
    industryValue = req.body.industryOther.trim();
  }

  const startupData = {
    client: req.user._id,
    startupName: req.body.startupName,
    position: req.body.position,
    numberOfEmployees: req.body.numberOfEmployees,
    industry: industryValue,
    stage: req.body.stage,
  };

  // Add industryOther if it was provided and used
  if (req.body.industry === 'Other' && req.body.industryOther) {
    startupData.industryOther = req.body.industryOther.trim();
  }

  // Add optional fields
  if (req.body.website) {
    startupData.website = req.body.website.trim();
  }

  if (req.body.socialLinks) {
    startupData.socialLinks = {};
    if (req.body.socialLinks.linkedin) startupData.socialLinks.linkedin = req.body.socialLinks.linkedin.trim();
    if (req.body.socialLinks.twitter) startupData.socialLinks.twitter = req.body.socialLinks.twitter.trim();
    if (req.body.socialLinks.facebook) startupData.socialLinks.facebook = req.body.socialLinks.facebook.trim();
    if (req.body.socialLinks.instagram) startupData.socialLinks.instagram = req.body.socialLinks.instagram.trim();
    if (req.body.socialLinks.github) startupData.socialLinks.github = req.body.socialLinks.github.trim();
    if (req.body.socialLinks.telegram) startupData.socialLinks.telegram = req.body.socialLinks.telegram.trim();
    if (req.body.socialLinks.whatsapp) startupData.socialLinks.whatsapp = req.body.socialLinks.whatsapp.trim();
  }

  const startup = await Startup.create(startupData);

  // Set isStartup to true for the user if it's not already set
  if (!req.user.clientProfile?.isStartup) {
    await User.findByIdAndUpdate(
      req.user._id,
      { 'clientProfile.isStartup': true },
      { new: true, runValidators: true }
    );
  }

  res.status(201).json({
    status: 'success',
    data: {
      startup,
    },
  });
});

// Get all startups by client ID
exports.getStartupsByClient = catchAsync(async (req, res, next) => {
  const startups = await Startup.find({ client: req.user._id })
    .populate('client', 'name email photo')
    .sort('-createdAt');

  res.status(200).json({
    status: 'success',
    results: startups.length,
    data: {
      startups,
    },
  });
});

// Update startup
exports.updateStartup = catchAsync(async (req, res, next) => {
  const startup = await Startup.findOne({
    _id: req.params.id,
    client: req.user._id,
  });

  if (!startup) {
    return next(new AppError('Startup not found or you do not have permission to update it', 404));
  }

  // Handle industry - if "Other" is selected, use industryOther
  if (req.body.industry) {
    if (req.body.industry === 'Other' && req.body.industryOther) {
      req.body.industry = req.body.industryOther.trim();
    } else if (req.body.industry !== 'Other') {
      delete req.body.industryOther;
    }
  }

  // Prepare update data
  const updateData = { ...req.body };

  // Handle social links - update individually if provided
  if (req.body.socialLinks) {
    updateData.socialLinks = {};
    if (req.body.socialLinks.linkedin !== undefined) updateData.socialLinks.linkedin = req.body.socialLinks.linkedin.trim() || undefined;
    if (req.body.socialLinks.twitter !== undefined) updateData.socialLinks.twitter = req.body.socialLinks.twitter.trim() || undefined;
    if (req.body.socialLinks.facebook !== undefined) updateData.socialLinks.facebook = req.body.socialLinks.facebook.trim() || undefined;
    if (req.body.socialLinks.instagram !== undefined) updateData.socialLinks.instagram = req.body.socialLinks.instagram.trim() || undefined;
    if (req.body.socialLinks.github !== undefined) updateData.socialLinks.github = req.body.socialLinks.github.trim() || undefined;
    if (req.body.socialLinks.telegram !== undefined) updateData.socialLinks.telegram = req.body.socialLinks.telegram.trim() || undefined;
    if (req.body.socialLinks.whatsapp !== undefined) updateData.socialLinks.whatsapp = req.body.socialLinks.whatsapp.trim() || undefined;
  }

  // Handle website
  if (req.body.website !== undefined) {
    updateData.website = req.body.website.trim() || undefined;
  }

  const updatedStartup = await Startup.findByIdAndUpdate(
    req.params.id,
    updateData,
    {
      new: true,
      runValidators: true,
    }
  );

  res.status(200).json({
    status: 'success',
    data: {
      startup: updatedStartup,
    },
  });
});

// Admin: Get all startups
exports.getAllStartups = catchAsync(async (req, res, next) => {
  const { page = 1, limit = 50, search, industry, stage } = req.query;

  // Build query
  const query = {};

  if (search) {
    query.$or = [
      { startupName: { $regex: search, $options: 'i' } },
      { position: { $regex: search, $options: 'i' } },
    ];
  }

  if (industry) {
    query.industry = industry;
  }

  if (stage) {
    query.stage = stage;
  }

  const skip = (page - 1) * limit;

  // Debug logging
  console.log('Admin getAllStartups - Query:', JSON.stringify(query, null, 2));
  console.log('Admin getAllStartups - Pagination:', { page, limit, skip });
  console.log('Admin getAllStartups - User:', req.user?.role, req.user?.email);

  // First, check if there are any startups in the collection
  const totalInCollection = await Startup.countDocuments({});
  console.log('Admin getAllStartups - Total startups in collection:', totalInCollection);

  const [startups, totalCount] = await Promise.all([
    Startup.find(query)
      .populate({
        path: 'client',
        select: 'name email photo phone age gender nationality role emailVerified active createdAt clientProfile',
      })
      .sort('-createdAt')
      .skip(skip)
      .limit(parseInt(limit)),
    Startup.countDocuments(query),
  ]);

  console.log('Admin getAllStartups - Found startups:', startups.length);
  console.log('Admin getAllStartups - Total count:', totalCount);
  if (startups.length > 0) {
    console.log('Admin getAllStartups - First startup sample:', {
      _id: startups[0]._id,
      startupName: startups[0].startupName,
      client: startups[0].client ? { name: startups[0].client.name, email: startups[0].client.email } : 'No client',
    });
  }

  res.status(200).json({
    status: 'success',
    results: startups.length,
    totalCount,
    totalPages: Math.ceil(totalCount / limit),
    currentPage: parseInt(page),
    data: {
      startups,
    },
  });
});

// Admin: Get startup by ID
exports.getStartup = catchAsync(async (req, res, next) => {
  const startup = await Startup.findById(req.params.id).populate(
    'client',
    'name email photo phone role createdAt'
  );

  if (!startup) {
    return next(new AppError('Startup not found', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      startup,
    },
  });
});

// Upload startup logo
exports.uploadLogo = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'client') {
    return next(new AppError('Only clients can upload startup logos', 403));
  }

  if (!req.file) {
    return next(new AppError('Please upload a logo image', 400));
  }

  const startup = await Startup.findOne({
    _id: req.params.id,
    client: req.user._id,
  });

  if (!startup) {
    return next(new AppError('Startup not found or you do not have permission to update it', 404));
  }

  // Build full logo URL (use BASE_URL from env or construct from request)
  // Normalize BASE_URL by removing trailing slash to prevent double slashes
  const baseUrl = (process.env.BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const logoUrl = `${baseUrl}/uploads/startup-logos/${req.file.filename}`;

  startup.logo = logoUrl;
  await startup.save();

  res.status(200).json({
    status: 'success',
    data: {
      startup,
    },
  });
});

// Delete startup logo
exports.deleteLogo = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'client') {
    return next(new AppError('Only clients can delete startup logos', 403));
  }

  const startup = await Startup.findOne({
    _id: req.params.id,
    client: req.user._id,
  });

  if (!startup) {
    return next(new AppError('Startup not found or you do not have permission to update it', 404));
  }

  startup.logo = undefined;
  await startup.save();

  res.status(200).json({
    status: 'success',
    data: {
      startup,
    },
  });
});

// Admin: Delete startup
exports.deleteStartup = catchAsync(async (req, res, next) => {
  const startup = await Startup.findById(req.params.id);

  if (!startup) {
    return next(new AppError('Startup not found', 404));
  }

  await Startup.findByIdAndDelete(req.params.id);

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

