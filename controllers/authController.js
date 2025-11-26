const { promisify } = require('util');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/userModel');
const AppError = require('../utils/AppError');
const sendEmail = require('../utils/email');

const catchAsync = require('../utils/catchAsync');

//function to generate token using id of user
const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });

const createSendToken = (user, status, req, res, message = null) => {
  const token = signToken(user._id);
  res.cookie('jwt', token, {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
    sameSite: 'lax', // Helps with CORS and cookie handling
  });
  user.password = undefined; //remove password from show in response

  // Determine missing fields based on user role
  let missingFields = [];
  if (user.role === 'student') {
    if (
      !user.studentProfile ||
      !user.studentProfile.skills ||
      !user.studentProfile.skills.length
    ) {
      missingFields = ['skills'];
    }
  } else if (user.role === 'client') {
    if (!user.clientProfile || !user.clientProfile.companyName) {
      missingFields = ['company information'];
    }
  }

  // Add profile completion status to response
  const userResponse = {
    ...user.toObject(),
    profileStatus: {
      completionPercentage: user.profileCompletionPercentage || 0,
      needsProfileSetup: (user.profileCompletionPercentage || 0) < 50,
      missingFields,
    },
  };

  const response = {
    status: 'success',
    token,
    message: message || 'Authentication successful',
    data: {
      user: userResponse,
    },
  };

  res.status(status).json(response);
};

exports.signup = catchAsync(async (req, res, next) => {
  let user = await User.find({ email: req.body.email });
  if (user.length > 0) return next(new AppError('Email already exist', 400));


  // Prepare user data with enhanced profile initialization
  const userData = {
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    passwordConfirm: req.body.passwordConfirm,
    passwordChangedAt: req.body.passwordChangedAt,
    role: req.body.role,
    emailVerified: true, // Auto-verify email on registration
    accountCreatedSource: 'api', // Track how account was created
    profileCompletionPercentage: 20, // Basic info filled = 20%
  };

  // Add optional fields only if provided
  if (req.body.age !== undefined && req.body.age !== null) {
    userData.age = req.body.age;
  }
  if (req.body.gender) {
    userData.gender = req.body.gender;
  }
  if (req.body.nationality) {
    userData.nationality = req.body.nationality;
  }

  // Initialize role-specific profile objects
  if (req.body.role === 'student') {
    userData.studentProfile = {
      skills: [],
      education: [],
      portfolio: [],
      socialLinks: {},
      languages: [],
      certifications: [],
      availability: 'Available',
    };
  } else if (req.body.role === 'client') {
    userData.clientProfile = {
      paymentMethods: [],
      verificationDocuments: [],
      isVerified: false,
    };
  }

  const newUser = await User.create(userData);
  
  // Send token and user data immediately after registration
  createSendToken(newUser, 201, req, res, 'Registration successful!');
});

exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;
  
  // Validate input
  if (!email || !password) {
    return next(new AppError('Please provide both email and password', 400));
  }

  // Find user and include password field (which is normally excluded)
  const user = await User.findOne({ email }).select('+password');
  
  // Check if user exists
  if (!user) {
    return next(new AppError('Invalid email or password', 401));
  }

  // Check if user account is deleted
  if (user.active === false) {
    return next(new AppError('This account has been deleted. Please contact support if you believe this is an error.', 401));
  }

  // Check if user is suspended
  if (user.suspended) {
    const reason = user.suspensionReason || 'No reason provided';
    return next(new AppError(`Your account has been suspended. Reason: ${reason}. Please contact support for assistance.`, 403));
  }

  // Check if password is correct
  const isPasswordCorrect = await user.checkPassword(password, user.password);
  if (!isPasswordCorrect) {
    return next(new AppError('Invalid email or password', 401));
  }

  // Email verification check removed - users can login immediately after registration

  // All checks passed - send token and user data
  createSendToken(user, 200, req, res, 'Login successful');
});

exports.logout = (req, res) => {
  res.cookie('jwt', 'loggedOut', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  });
  res.status(200).json({ status: 'success' });
};

exports.protect = catchAsync(async (req, res, next) => {
  let token;
  //1)check if the token is exist
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  }
  if (!token)
    return next(new AppError('you are not logged in, please log in.', 401));

  //2)verification token
  //verify is sync function we use promisify to turn it to async function and return a promise
  //error handled in errorController
  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

  //3)check if user still exist
  const currentUser = await User.findById(decoded.id);
  if (!currentUser) return next(new AppError('user token dose not exist', 401));

  //3.5)check if user account is deleted
  if (currentUser.active === false) {
    return next(new AppError('This account has been deleted. Please contact support if you believe this is an error.', 401));
  }

  //3.6)check if user is suspended
  if (currentUser.suspended) {
    const reason = currentUser.suspensionReason || 'No reason provided';
    return next(new AppError(`Your account has been suspended. Reason: ${reason}. Please contact support for assistance.`, 403));
  }

  //4)check if user change the password after the token was issued
  if (currentUser.changePasswordAfter(decoded.iat)) {
    return next(
      new AppError('user change the password recently please log in again'),
      401
    );
  }

  //go to protected route
  req.user = currentUser;
  next();
});

//restrict some user from access routs
exports.restrictTo =
  (...roles) =>
  (req, res, next) => {
    //roles is an array
    if (!roles.includes(req.user.role))
      return next(
        new AppError('you do not have permission to perform this action', 403)
      );
    next();
  };

exports.forgotPassword = catchAsync(async (req, res, next) => {
  //1)get user  from posted email
  const user = await User.findOne({ email: req.body.email });
  if (!user)
    return next(new AppError('there are no user with this email'), 404);

  //2)generate user token
  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false }); //save the changes and leave the unchanged fields

  //3)send it to user email
  try {
    const resetURL = `${req.protocol}://${req.get(
      'host'
    )}/api/v1/users/resetPassword/${resetToken}`;

    await sendEmail({
      type: 'password-reset',
      email: user.email,
      name: user.name,
      userRole: user.role,
      subject: 'FreeStudent - Reset Your Password',
      resetUrl: resetURL,
      message: `You requested a password reset for your FreeStudent account. Click the link to reset your password.`,
    });

    res.status(200).json({
      status: 'success',
      message: 'Password reset email sent!',
    });
  } catch (err) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });

    return next(
      new AppError('There was an error sending the email. Try again later!'),
      500
    );
  }
});

exports.sendVerificationEmail = catchAsync(async (req, res, next) => {
  //1)get user  from posted email
  const user = await User.findOne({ email: req.body.email });
  if (!user) return next(new AppError('user not found', 404));
  if (user.emailVerified)
    return next(new AppError('email already verified', 400));

  //2)generate user token
  const verificationToken = user.createEmailVerificationToken();
  await user.save({ validateBeforeSave: false }); //save the changes and leave the unchanged fields

  //3)send it to user email
  try {
    const verificationURL = `${req.protocol}://${req.get(
      'host'
    )}/api/v1/users/verifyEmail/${verificationToken}`;

    // Get user role specific subject and message
    const welcomeMessage =
      user.role === 'student'
        ? 'Welcome to FreeStudent - Start Your Freelancing Journey!'
        : 'Welcome to FreeStudent - Find Amazing Student Talent!';

    await sendEmail({
      type: 'welcome',
      email: user.email,
      name: user.name,
      userRole: user.role,
      subject: welcomeMessage,
      verificationUrl: verificationURL,
      message: `Welcome to FreeStudent! Please verify your email address to get started.`,
    });

    // Send token and user data along with verification email confirmation
    createSendToken(user, 200, req, res, 'Registration successful! Verification email sent.');
  } catch (err) {
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save({ validateBeforeSave: false });

    return next(
      new AppError('There was an error sending the email. Try again later!'),
      500
    );
  }
});

exports.resendVerificationEmail = catchAsync(async (req, res, next) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user) return next(new AppError('user not found', 404));
  if (user.emailVerified)
    return next(new AppError('email already verified', 400));

  //2)generate user token
  const verificationToken = user.createEmailVerificationToken();
  await user.save({ validateBeforeSave: false }); //save the changes and leave the unchanged fields

  //3)send it to user email
  try {
    const verificationURL = `${req.protocol}://${req.get(
      'host'
    )}/api/v1/users/verifyEmail/${verificationToken}`;

    await sendEmail({
      type: 'resend-verification',
      email: user.email,
      name: user.name,
      userRole: user.role,
      subject: 'FreeStudent - New Email Verification Link',
      verificationUrl: verificationURL,
      message: `Here is your new verification link for your FreeStudent account.`,
    });

    res.status(200).json({
      status: 'success',
      message: 'New verification email sent!',
    });
  } catch (err) {
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save({ validateBeforeSave: false });

    return next(
      new AppError('There was an error sending the email. Try again later!'),
      500
    );
  }
});

exports.verifyEmail = catchAsync(async (req, res, next) => {
  //1)get user passed on the token
  //hash the token to compare it with that in db
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');
  //get user thats matches the token and expires date greater than now
  const user = await User.findOne({
    emailVerificationToken: hashedToken,
    emailVerificationExpires: { $gt: Date.now() },
  });

  //2)if there is user and token dose not expires verify the email
  if (!user) {
    return res.status(400).json({
      status: 'error',
      message:
        'Token is invalid or has expired. Your email may already be verified.',
    });
  }

  user.emailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save();

  res.status(200).json({
    status: 'success',
    message: 'Email verified successfully! You can now log in.',
  });
});

exports.isEmailVerified = catchAsync(async (req, res, next) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user) {
    // User doesn't exist, but let login handle this error
    return next();
  }
  if (user.emailVerified === false) {
    return next(new AppError('you have to verify your email first', 401));
  }
  next();
});

exports.resetPassword = catchAsync(async (req, res, next) => {
  //1)get user passed on the token
  //hash the token to compare it with that in db
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');
  //get user thats matches the token and expires date greater than now
  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  //2)if there is user and token dose not expires reset the password
  if (!user) return next(new AppError('Token is invalid or expires'), 400);
  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  //3)update changedPasswordAt property at user
  //at mongo middleware

  //4)send the jwt and log the user in
  createSendToken(user, 200, req, res);
});

exports.updatePassword = catchAsync(async (req, res, next) => {
  //1)get user form collection
  const user = await User.findOne(req.user._id).select('+password');

  //2)check if POSTed password is correct or not
  if (!(await user.checkPassword(req.body.passwordCurrent, user.password)))
    return next(new AppError('wrong password'), 401);

  //3)if so update the password
  user.password = req.body.password;
  user.passwordConfirm = req.body.passwordConfirm;
  await user.save();

  //4)log user in send the token
  createSendToken(user, 200, req, res);
});

exports.getMe = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user.id);

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

// Update user profile (personal info and student profile)
exports.updateMe = catchAsync(async (req, res, next) => {
  // 1) Create error if user POSTs password data
  if (req.body.password || req.body.passwordConfirm) {
    return next(
      new AppError(
        'This route is not for password updates. Please use /updateMyPassword.',
        400
      )
    );
  }

  // 2) Fields that are not allowed to be updated
  const restrictedFields = ['email', 'role', 'emailVerified', 'active', 'suspended'];
  restrictedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      delete req.body[field];
    }
  });

  // 3) Build update object for allowed fields
  const updateData = {};

  // Personal information fields
  const allowedPersonalFields = ['name', 'photo', 'phone', 'age', 'gender', 'nationality'];
  allowedPersonalFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      updateData[field] = req.body[field];
    }
  });

  // Location fields
  if (req.body.location) {
    updateData.location = {};
    if (req.body.location.country) updateData.location.country = req.body.location.country;
    if (req.body.location.city) updateData.location.city = req.body.location.city;
    if (req.body.location.timezone) updateData.location.timezone = req.body.location.timezone;
  }

  // Student profile fields (only for students)
  if (req.user.role === 'student' && req.body.studentProfile) {
    const sp = req.body.studentProfile;

    // Skills
    if (sp.skills !== undefined) updateData['studentProfile.skills'] = sp.skills;

    // Education
    if (sp.education !== undefined) updateData['studentProfile.education'] = sp.education;

    // Experience
    if (sp.experienceLevel !== undefined) updateData['studentProfile.experienceLevel'] = sp.experienceLevel;
    if (sp.yearsOfExperience !== undefined)
      updateData['studentProfile.yearsOfExperience'] = sp.yearsOfExperience;

    // Hourly rate - handle nested fields individually
    if (sp.hourlyRate !== undefined) {
      if (sp.hourlyRate.min !== undefined) updateData['studentProfile.hourlyRate.min'] = sp.hourlyRate.min;
      if (sp.hourlyRate.max !== undefined) updateData['studentProfile.hourlyRate.max'] = sp.hourlyRate.max;
      if (sp.hourlyRate.currency !== undefined) updateData['studentProfile.hourlyRate.currency'] = sp.hourlyRate.currency;
    }

    // Portfolio
    if (sp.portfolio !== undefined) updateData['studentProfile.portfolio'] = sp.portfolio;

    // Social links
    if (sp.socialLinks !== undefined) updateData['studentProfile.socialLinks'] = sp.socialLinks;

    // Bio and availability
    if (sp.bio !== undefined) updateData['studentProfile.bio'] = sp.bio;
    if (sp.availability !== undefined) updateData['studentProfile.availability'] = sp.availability;

    // Languages
    if (sp.languages !== undefined) updateData['studentProfile.languages'] = sp.languages;

    // Certifications
    if (sp.certifications !== undefined) updateData['studentProfile.certifications'] = sp.certifications;

    // Resume
    if (sp.resume !== undefined) updateData['studentProfile.resume'] = sp.resume;
  }

  // Client profile fields (only for clients)
  if (req.user.role === 'client' && req.body.clientProfile) {
    const cp = req.body.clientProfile;

    // Company name
    if (cp.companyName !== undefined) updateData['clientProfile.companyName'] = cp.companyName;

    // Industry
    if (cp.industry !== undefined) updateData['clientProfile.industry'] = cp.industry;

    // Company size
    if (cp.companySize !== undefined) updateData['clientProfile.companySize'] = cp.companySize;

    // Website
    if (cp.website !== undefined) updateData['clientProfile.website'] = cp.website;

    // Description
    if (cp.description !== undefined) updateData['clientProfile.description'] = cp.description;
  }

  // Support direct clientProfile fields for backwards compatibility
  if (req.user.role === 'client') {
    if (req.body.companyName !== undefined) updateData['clientProfile.companyName'] = req.body.companyName;
    if (req.body.industry !== undefined) updateData['clientProfile.industry'] = req.body.industry;
  }

  // 4) Update user document
  const updatedUser = await User.findByIdAndUpdate(req.user.id, updateData, {
    new: true,
    runValidators: true,
  });

  res.status(200).json({
    status: 'success',
    data: {
      user: updatedUser,
    },
  });
});

// Upload resume/CV
exports.uploadResume = catchAsync(async (req, res, next) => {
  if (!req.file) {
    return next(new AppError('Please upload a file', 400));
  }

  // Only allow students to upload resumes
  if (req.user.role !== 'student') {
    return next(new AppError('Only students can upload resumes', 403));
  }

  // Get the file path (relative to server root for storage)
  const filePath = `/uploads/resumes/${req.file.filename}`;

  // Update user's student profile with resume information
  const updatedUser = await User.findByIdAndUpdate(
    req.user.id,
    {
      'studentProfile.resume': {
        filename: req.file.originalname,
        url: filePath,
        uploadedAt: Date.now(),
      },
    },
    {
      new: true,
      runValidators: true,
    }
  );

  res.status(200).json({
    status: 'success',
    message: 'Resume uploaded successfully',
    data: {
      resume: updatedUser.studentProfile.resume,
    },
  });
});

// Delete resume/CV
exports.deleteResume = catchAsync(async (req, res, next) => {
  // Only allow students to delete resumes
  if (req.user.role !== 'student') {
    return next(new AppError('Only students can delete resumes', 403));
  }

  const user = await User.findById(req.user.id);

  if (!user.studentProfile?.resume?.url) {
    return next(new AppError('No resume found to delete', 404));
  }

  // Delete the file from filesystem
  const fs = require('fs');
  const path = require('path');
  const filePath = path.join(__dirname, '..', user.studentProfile.resume.url);

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  // Update user's student profile to remove resume
  const updatedUser = await User.findByIdAndUpdate(
    req.user.id,
    {
      'studentProfile.resume': undefined,
    },
    {
      new: true,
      runValidators: true,
    }
  );

  res.status(200).json({
    status: 'success',
    message: 'Resume deleted successfully',
    data: {
      user: updatedUser,
    },
  });
});
