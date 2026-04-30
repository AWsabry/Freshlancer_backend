const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { syncExternalProfilesForStudent } = require('../services/externalProfiles/externalProfiles.service');
const { isSupportedProvider } = require('../services/externalProfiles/externalProfiles.utils');
const User = require('../models/userModel');

exports.getMe = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'student') {
    return next(new AppError('Only students can access external profiles', 403));
  }

  const user = await User.findById(req.user._id).select('studentProfile.externalProfiles role');
  if (!user) return next(new AppError('User not found', 404));

  res.status(200).json({
    status: 'success',
    data: {
      externalProfiles: user.studentProfile?.externalProfiles || {},
    },
  });
});

exports.syncAll = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'student') {
    return next(new AppError('Only students can sync external profiles', 403));
  }

  const force = req.query.force === 'true' || req.body?.force === true;
  const result = await syncExternalProfilesForStudent(req.user._id, { force });

  res.status(200).json({
    status: 'success',
    data: result,
  });
});

exports.syncOne = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'student') {
    return next(new AppError('Only students can sync external profiles', 403));
  }

  const provider = req.params.provider;
  if (!isSupportedProvider(provider)) {
    return next(new AppError('Unsupported provider', 400));
  }

  const force = req.query.force === 'true' || req.body?.force === true;
  const result = await syncExternalProfilesForStudent(req.user._id, { provider, force });

  res.status(200).json({
    status: 'success',
    data: result,
  });
});

