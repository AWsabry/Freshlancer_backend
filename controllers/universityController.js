const University = require('../models/universityModel');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

// Get all universities with required countryCode filter and optional search (public endpoint)
// Returns all universities without pagination, with all model values
exports.getAllUniversities = catchAsync(async (req, res, next) => {
  const { search, countryCode } = req.query;

  // countryCode is required
  if (!countryCode || countryCode.trim() === '') {
    return next(new AppError('Country code is required', 400));
  }

  // Build query - only return approved universities for the specified country
  const query = { 
    isActive: true, 
    status: 'approved',
    countryCode: countryCode.trim().toUpperCase() // Required filter
  };

  // Add search filter if provided
  if (search && search.trim() !== '') {
    query.name = { $regex: search.trim(), $options: 'i' };
  }

  // Fetch all universities without pagination, return all model fields
  const universities = await University.find(query)
    .sort({ name: 1 })
    .lean(); // Use lean() for better performance and to get plain JavaScript objects
  
  // Return universities as a single array directly
  res.status(200).json(universities);
});

// Get single university (public endpoint)
exports.getUniversity = catchAsync(async (req, res, next) => {
  const university = await University.findById(req.params.id);

  if (!university) {
    return next(new AppError('No university found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      university,
    },
  });
});

// Create pending university (user submission - requires authentication)
exports.createPendingUniversity = catchAsync(async (req, res, next) => {
  const { name, countryCode, website } = req.body;

  if (!name || name.trim() === '') {
    return next(new AppError('University name is required', 400));
  }

  // Country code is required
  if (!countryCode || countryCode.trim().length !== 2) {
    return next(new AppError('Country code is required and must be 2 characters (e.g., US, EG, SA)', 400));
  }

  // Check if university with same name already exists (case-insensitive)
  const existingUniversity = await University.findOne({
    name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
  });

  if (existingUniversity) {
    // If it exists and is approved, return it
    if (existingUniversity.status === 'approved') {
      return res.status(200).json({
        status: 'success',
        message: 'University already exists',
        data: {
          university: existingUniversity,
        },
      });
    }
    // If it exists but is pending/rejected, return error
    return next(new AppError('This university has already been submitted and is pending approval', 400));
  }

  // Create new pending university
  const university = await University.create({
    name: name.trim(),
    countryCode: countryCode.trim().toUpperCase(),
    website: website ? website.trim() : undefined,
    status: 'pending',
    addedBy: req.user._id,
  });

  res.status(201).json({
    status: 'success',
    message: 'University submitted successfully. It will be reviewed by an admin.',
    data: {
      university,
    },
  });
});

// ============ ADMIN ENDPOINTS ============

// Get all universities (admin) - including pending and rejected
// Returns universities with pagination
exports.getAllUniversitiesAdmin = catchAsync(async (req, res, next) => {
  const { status, search, countryCode, page = 1, limit = 20 } = req.query;

  const query = {};

  // Filter by status if provided
  if (status && ['approved', 'pending', 'rejected'].includes(status)) {
    query.status = status;
  }

  // Add countryCode filter if provided
  if (countryCode && countryCode.trim() !== '') {
    query.countryCode = countryCode.trim().toUpperCase();
  }

  // Add search filter if provided
  if (search && search.trim() !== '') {
    query.name = { $regex: search.trim(), $options: 'i' };
  }

  // Calculate pagination
  const pageNum = Math.max(parseInt(page) || 1, 1);
  const limitNum = Math.min(parseInt(limit) || 20, 100); // Max 100 per page
  const skip = (pageNum - 1) * limitNum;

  // Get total count for pagination (matching current filters)
  const total = await University.countDocuments(query);

  // Get total counts by status from entire database (regardless of filters)
  const [totalApproved, totalPending, totalRejected, totalAll] = await Promise.all([
    University.countDocuments({ status: 'approved' }),
    University.countDocuments({ status: 'pending' }),
    University.countDocuments({ status: 'rejected' }),
    University.countDocuments({}), // Total all universities
  ]);

  // Fetch universities with pagination
  const universities = await University.find(query)
    .populate({
      path: 'addedBy',
      select: 'name email',
    })
    .populate({
      path: 'approvedBy',
      select: 'name email',
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNum)
    .lean();

  // Return universities with pagination metadata and status counts
  res.status(200).json({
    status: 'success',
    results: universities.length,
    total, // Total matching current filters
    page: pageNum,
    pages: Math.ceil(total / limitNum),
    counts: {
      total: totalAll, // Total from entire database
      approved: totalApproved, // Total approved from entire database
      pending: totalPending, // Total pending from entire database
      rejected: totalRejected, // Total rejected from entire database
    },
    data: {
      universities,
    },
  });
});

// Approve pending university (admin)
exports.approveUniversity = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { countryCode, website } = req.body; // Optional fields admin can add

  const university = await University.findById(id);

  if (!university) {
    return next(new AppError('No university found with that ID', 404));
  }

  if (university.status === 'approved') {
    return next(new AppError('University is already approved', 400));
  }

  // Update university
  university.status = 'approved';
  university.approvedBy = req.user._id;
  university.approvedAt = Date.now();

  // countryCode is required when approving
  if (!countryCode || countryCode.trim().length !== 2) {
    return next(new AppError('Country code is required and must be 2 characters (e.g., US, EG, SA)', 400));
  }
  university.countryCode = countryCode.trim().toUpperCase();
  
  if (website) {
    university.website = website.trim();
  }

  // Clear rejection fields if they exist
  university.rejectedAt = undefined;
  university.rejectionReason = undefined;

  await university.save();

  res.status(200).json({
    status: 'success',
    message: 'University approved successfully',
    data: {
      university,
    },
  });
});

// Reject pending university (admin)
exports.rejectUniversity = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { rejectionReason } = req.body;

  const university = await University.findById(id);

  if (!university) {
    return next(new AppError('No university found with that ID', 404));
  }

  if (university.status !== 'pending') {
    return next(new AppError('Only pending universities can be rejected', 400));
  }

  university.status = 'rejected';
  university.rejectedAt = Date.now();
  university.rejectionReason = rejectionReason || 'Rejected by admin';

  await university.save();

  res.status(200).json({
    status: 'success',
    message: 'University rejected successfully',
    data: {
      university,
    },
  });
});

// Create university directly (admin) - automatically approved
exports.createUniversity = catchAsync(async (req, res, next) => {
  const { name, countryCode, website } = req.body;

  if (!name || name.trim() === '') {
    return next(new AppError('University name is required', 400));
  }

  if (!countryCode || countryCode.trim().length !== 2) {
    return next(new AppError('Country code is required and must be 2 characters (e.g., US, EG, SA)', 400));
  }

  // Check if university with same name already exists (case-insensitive)
  const existingUniversity = await University.findOne({
    name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
  });

  if (existingUniversity) {
    return next(new AppError('University with this name already exists', 400));
  }

  const university = await University.create({
    name: name.trim(),
    countryCode: countryCode.trim().toUpperCase(),
    website: website ? website.trim() : undefined,
    status: 'approved',
    approvedBy: req.user._id,
    approvedAt: Date.now(),
  });

  res.status(201).json({
    status: 'success',
    message: 'University created successfully',
    data: {
      university,
    },
  });
});

// Get single university (admin) - with full populated data
exports.getUniversityAdmin = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const university = await University.findById(id)
    .populate({
      path: 'addedBy',
      select: 'name email',
    })
    .populate({
      path: 'approvedBy',
      select: 'name email',
    });

  if (!university) {
    return next(new AppError('No university found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      university,
    },
  });
});

// Update university (admin)
exports.updateUniversity = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { name, countryCode, website, isActive } = req.body;

  const university = await University.findById(id);

  if (!university) {
    return next(new AppError('No university found with that ID', 404));
  }

  // Check if name is being updated and if it conflicts with existing university
  if (name && name.trim() !== university.name) {
    const existingUniversity = await University.findOne({
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
      _id: { $ne: id },
    });

    if (existingUniversity) {
      return next(new AppError('University with this name already exists', 400));
    }
    university.name = name.trim();
  }

  // countryCode is required
  if (countryCode !== undefined) {
    if (!countryCode || countryCode.trim().length !== 2) {
      return next(new AppError('Country code is required and must be 2 characters (e.g., US, EG, SA)', 400));
    }
    university.countryCode = countryCode.trim().toUpperCase();
  } else if (!university.countryCode) {
    // If countryCode is not provided in update and university doesn't have one, it's required
    return next(new AppError('Country code is required', 400));
  }
  if (website !== undefined) {
    university.website = website ? website.trim() : undefined;
  }
  if (isActive !== undefined) {
    university.isActive = isActive;
  }

  await university.save();

  res.status(200).json({
    status: 'success',
    message: 'University updated successfully',
    data: {
      university,
    },
  });
});

// Delete university (admin) - hard delete (permanently remove from database)
exports.deleteUniversity = catchAsync(async (req, res, next) => {
  const university = await University.findById(req.params.id);

  if (!university) {
    return next(new AppError('No university found with that ID', 404));
  }

  // Hard delete - permanently remove from database
  await University.findByIdAndDelete(req.params.id);

  res.status(200).json({
    status: 'success',
    message: 'University deleted successfully',
    data: null,
  });
});

