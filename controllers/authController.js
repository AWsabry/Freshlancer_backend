const { promisify } = require('util');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const validator = require('validator');
const User = require('../models/userModel');
const AppError = require('../utils/AppError');
const sendEmail = require('../utils/email');
const { getCurrencyByCountry } = require('../utils/currencyRates');

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
  // Check if email already exists
  let user = await User.find({ email: req.body.email });
  if (user.length > 0) {
    return next(new AppError('This email address is already registered. Please sign in or use a different email.', 400));
  }


  // Prepare user data with enhanced profile initialization
  const userData = {
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    passwordConfirm: req.body.passwordConfirm,
    passwordChangedAt: req.body.passwordChangedAt,
    role: req.body.role,
    emailVerified: false, // Email verification required - will be verified via email
    accountCreatedSource: 'Web', // Track how account was created
    profileCompletionPercentage: 20, // Basic info filled = 20%
  };

  // For students, phone and nationality are required
  if (req.body.role === 'student') {
    if (!req.body.phone) {
      return next(new AppError('Phone number is required for student registration', 400));
    }
    if (!req.body.nationality) {
      return next(new AppError('Nationality is required for student registration', 400));
    }
    userData.phone = req.body.phone;
    userData.nationality = req.body.nationality;
    
    // Store country of study in location.country if provided
    if (req.body.location && req.body.location.country) {
      userData.location = {
        country: req.body.location.country,
      };
    }
  } else {
    // For other roles, these are optional
    if (req.body.phone) {
      userData.phone = req.body.phone;
    }
    if (req.body.nationality) {
      userData.nationality = req.body.nationality;
    }
    // For other roles, location is optional
    if (req.body.location) {
      userData.location = req.body.location;
    }
  }

  // Add optional fields only if provided
  if (req.body.age !== undefined && req.body.age !== null) {
    userData.age = req.body.age;
  }
  if (req.body.gender) {
    userData.gender = req.body.gender;
  }

  // Initialize role-specific profile objects
  if (req.body.role === 'student') {
    userData.studentProfile = {
      skills: [],
      portfolio: [],
      socialLinks: {},
      languages: [],
      certifications: [],
      availability: 'Available',
    };

    // Set currency based on country of study if provided
    if (userData.location && userData.location.country) {
      const currency = getCurrencyByCountry(userData.location.country);
      userData.studentProfile.hourlyRate = {
        currency: currency,
      };
    }

    // Add student profile data from registration form if provided
    if (req.body.studentProfile) {
      if (req.body.studentProfile.university !== undefined && req.body.studentProfile.university !== null && req.body.studentProfile.university !== '') {
        userData.studentProfile.university = req.body.studentProfile.university.trim();
      }
      if (req.body.studentProfile.major !== undefined && req.body.studentProfile.major !== null && req.body.studentProfile.major !== '') {
        userData.studentProfile.major = req.body.studentProfile.major.trim();
      }
      if (req.body.studentProfile.graduationYear !== undefined && req.body.studentProfile.graduationYear !== null && req.body.studentProfile.graduationYear !== '') {
        const gradYear = parseInt(req.body.studentProfile.graduationYear);
        if (!isNaN(gradYear) && gradYear > 1900 && gradYear < 2100) {
          userData.studentProfile.graduationYear = gradYear;
        }
      }
      if (req.body.studentProfile.experienceLevel !== undefined && req.body.studentProfile.experienceLevel !== null && req.body.studentProfile.experienceLevel !== '') {
        userData.studentProfile.experienceLevel = req.body.studentProfile.experienceLevel;
      }
      // If hourlyRate is provided in request, merge it (but keep currency from country if set)
      if (req.body.studentProfile.hourlyRate) {
        if (!userData.studentProfile.hourlyRate) {
          userData.studentProfile.hourlyRate = {};
        }
        if (req.body.studentProfile.hourlyRate.min !== undefined) {
          userData.studentProfile.hourlyRate.min = req.body.studentProfile.hourlyRate.min;
        }
        if (req.body.studentProfile.hourlyRate.max !== undefined) {
          userData.studentProfile.hourlyRate.max = req.body.studentProfile.hourlyRate.max;
        }
        // Only set currency from request if country-based currency wasn't set
        if (req.body.studentProfile.hourlyRate.currency && !userData.studentProfile.hourlyRate.currency) {
          userData.studentProfile.hourlyRate.currency = req.body.studentProfile.hourlyRate.currency;
        }
      }
    }
  } else if (req.body.role === 'client') {
    userData.clientProfile = {
      paymentMethods: [],
      isVerified: false,
    };

    // Add client profile data from registration form if provided
    if (req.body.clientProfile) {
      if (req.body.clientProfile.companyName) {
        userData.clientProfile.companyName = req.body.clientProfile.companyName;
      }
      if (req.body.clientProfile.industry) {
        userData.clientProfile.industry = req.body.clientProfile.industry;
      }
      if (req.body.clientProfile.isStartup !== undefined) {
        userData.clientProfile.isStartup = req.body.clientProfile.isStartup;
      }
      if (req.body.clientProfile.yearsOfExperience !== undefined) {
        userData.clientProfile.yearsOfExperience = parseInt(req.body.clientProfile.yearsOfExperience);
      }
      if (req.body.clientProfile.howDidYouHear) {
        userData.clientProfile.howDidYouHear = req.body.clientProfile.howDidYouHear;
      }
    }
    
    // Add age if provided (at root level)
    if (req.body.age !== undefined) {
      userData.age = parseInt(req.body.age);
    }

    // Create startup if provided during registration
    if (req.body.startup && req.body.clientProfile?.isStartup) {
      const Startup = require('../models/startupModel');
      const startupData = {
        client: null, // Will be set after user is created
        startupName: req.body.startup.startupName,
        position: req.body.startup.position,
        numberOfEmployees: req.body.startup.numberOfEmployees,
        industry: req.body.startup.industry,
        stage: req.body.startup.stage,
      };
      if (req.body.startup.industryOther) {
        startupData.industryOther = req.body.startup.industryOther;
      }
      // Store startup data to create after user is created
      userData._startupData = startupData;
    }
  }

  const newUser = await User.create(userData);

  // Create startup if startup data was provided
  if (newUser.clientProfile?.isStartup && userData._startupData) {
    const Startup = require('../models/startupModel');
    userData._startupData.client = newUser._id;
    await Startup.create(userData._startupData);
    delete userData._startupData; // Clean up
  }
  
  // Generate email verification token
  const verificationToken = newUser.createEmailVerificationToken();
  await newUser.save({ validateBeforeSave: false });

  // Send verification email
  try {
    const verificationURL = `${process.env.FRONTEND_URL || req.protocol + '://' + req.get('host')}/verify-email/${verificationToken}`;

    // Get user role specific subject and message
    const welcomeMessage =
      newUser.role === 'student'
        ? 'Welcome to FreeStudent - Start Your Freelancing Journey!'
        : 'Welcome to FreeStudent - Find Amazing Student Talent!';

    await sendEmail({
      type: 'welcome',
      email: newUser.email,
      name: newUser.name,
      userRole: newUser.role,
      subject: welcomeMessage,
      verificationUrl: verificationURL,
      message: `Welcome to FreeStudent! Please verify your email address to get started.`,
    });

    // Send token and user data along with verification email confirmation
    createSendToken(newUser, 201, req, res, 'Registration successful! Please check your email to verify your account.');
  } catch (err) {
    // Log the error for debugging
    console.error('Error sending verification email during signup:', {
      error: err.message,
      stack: err.stack,
      userId: newUser._id,
    });
    
    // If email sending fails, remove the token but still allow registration
    newUser.emailVerificationToken = undefined;
    newUser.emailVerificationExpires = undefined;
    await newUser.save({ validateBeforeSave: false });

    // Still send token but with warning message
    createSendToken(newUser, 201, req, res, 'Registration successful! However, we could not send the verification email. Please use the resend verification email feature.');
  }
});

exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;
  
  // Validate input
  if (!email || !password) {
    return next(new AppError('Please provide both email and password', 400));
  }

  // Ensure email is a valid email format (not a name)
  if (!validator.isEmail(email)) {
    return next(new AppError('Please provide a valid email address. Login must be done using your email, not your name.', 400));
  }

  // Find user by email only (email is unique, name is not)
  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');
  
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

  // Check if email is verified
  if (!user.emailVerified) {
    return next(new AppError('Please verify your email address before logging in. Check your inbox for the verification email or request a new one.', 401));
  }

  // All checks passed - send token and user data
  createSendToken(user, 200, req, res, 'Login successful');
});

exports.logout = (req, res) => {
  // Clear JWT cookie by setting it to expired
  res.cookie('jwt', 'loggedOut', {
    expires: new Date(Date.now() - 1000), // Set to past date to immediately expire
    httpOnly: true,
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
    sameSite: 'lax',
    path: '/',
  });
  
  // Also try to clear cookie with different paths/domains to ensure complete removal
  res.clearCookie('jwt', {
    httpOnly: true,
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
    sameSite: 'lax',
    path: '/',
  });
  
  res.status(200).json({ 
    status: 'success',
    message: 'Logged out successfully. All sessions cleared.'
  });
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
  if (!currentUser) return next(new AppError('Your account no longer exists. Please contact support if you believe this is an error.', 401));

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
    // Use FRONTEND_URL if available, otherwise construct from request
    const frontendUrl = process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;
    const resetURL = `${frontendUrl}/reset-password/${resetToken}`;

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
    // Log the error for debugging
    console.error('Error sending password reset email:', {
      error: err.message,
      stack: err.stack,
      userId: user._id,
    });
    
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });

    return next(
      new AppError('There was an error sending the email. Try again later!', 500)
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
    const verificationURL = `${process.env.FRONTEND_URL || req.protocol + '://' + req.get('host')}/verify-email/${verificationToken}`;

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
    // Log the error for debugging
    console.error('Error sending verification email (sendVerificationEmail):', {
      error: err.message,
      stack: err.stack,
      userId: user._id,
    });
    
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save({ validateBeforeSave: false });

    return next(
      new AppError('There was an error sending the email. Try again later!', 500)
    );
  }
});

exports.resendVerificationEmail = catchAsync(async (req, res, next) => {
  // If user is authenticated (optional), use their email, otherwise use email from body
  let user;
  if (req.user && req.user._id) {
    // User is authenticated - use current user
    user = await User.findById(req.user._id);
  } else if (req.body.email) {
    // User is not authenticated - find by email
    user = await User.findOne({ email: req.body.email });
  } else {
    return next(new AppError('Email address is required', 400));
  }

  if (!user) return next(new AppError('User not found', 404));
  if (user.emailVerified) {
    return res.status(200).json({
      status: 'success',
      message: 'Your email is already verified!',
    });
  }

  //2)generate user token
  const verificationToken = user.createEmailVerificationToken();
  await user.save({ validateBeforeSave: false }); //save the changes and leave the unchanged fields

  //3)send it to user email
  try {
    const verificationURL = `${process.env.FRONTEND_URL || req.protocol + '://' + req.get('host')}/verify-email/${verificationToken}`;

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
      message: 'New verification email sent! Please check your inbox.',
    });
  } catch (err) {
    // Log the error for debugging
    console.error('Error sending verification email (resendVerificationEmail):', {
      error: err.message,
      stack: err.stack,
      userId: user._id,
    });
    
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save({ validateBeforeSave: false });

    return next(
      new AppError('There was an error sending the email. Try again later!', 500)
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
    const frontendURL = process.env.FRONTEND_URL || 'http://localhost:3000';
    // If request is from browser (has Accept: text/html), redirect to frontend
    if (req.headers.accept && req.headers.accept.includes('text/html')) {
      return res.redirect(`${frontendURL}/verify-email/error?message=Token is invalid or has expired. Your email may already be verified.`);
    }
    // Otherwise return JSON response
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

  const frontendURL = process.env.FRONTEND_URL || 'http://localhost:3000';
  // If request is from browser (has Accept: text/html), redirect to frontend
  if (req.headers.accept && req.headers.accept.includes('text/html')) {
    return res.redirect(`${frontendURL}/verify-email/success?message=Email verified successfully! You can now log in.`);
  }
  // Otherwise return JSON response
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
  const restrictedFields = ['email', 'role', 'emailVerified', 'active', 'suspended', 'nationality'];
  restrictedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      delete req.body[field];
    }
  });

  // 3) Build update object for allowed fields
  const updateData = {};

  // Personal information fields (nationality is restricted and cannot be changed)
  const allowedPersonalFields = ['name', 'photo', 'phone', 'age'];
  allowedPersonalFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      updateData[field] = req.body[field];
    }
  });
  
  // Handle gender separately - convert empty strings to undefined for enum fields
  if (req.body.gender !== undefined) {
    updateData.gender = req.body.gender === '' ? undefined : req.body.gender;
  }

  // Location fields - country cannot be changed, only city and timezone
  if (req.body.location) {
    updateData.location = {};
    // Country is restricted and cannot be changed after registration
    // Only allow city and timezone to be updated
    if (req.body.location.city !== undefined) updateData.location.city = req.body.location.city;
    if (req.body.location.timezone !== undefined) updateData.location.timezone = req.body.location.timezone;
  }

  // Student profile fields (only for students)
  if (req.user.role === 'student' && req.body.studentProfile) {
    const sp = req.body.studentProfile;

    // University
    if (sp.university !== undefined) updateData['studentProfile.university'] = sp.university;
    if (sp.universityLink !== undefined) updateData['studentProfile.universityLink'] = sp.universityLink;

    // Skills
    if (sp.skills !== undefined) updateData['studentProfile.skills'] = sp.skills;

    // Experience - convert empty strings to undefined for enum fields
    if (sp.experienceLevel !== undefined) {
      updateData['studentProfile.experienceLevel'] = sp.experienceLevel === '' ? undefined : sp.experienceLevel;
    }
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

    // Social links - handle individual fields or entire object
    if (sp.socialLinks !== undefined) {
      if (typeof sp.socialLinks === 'object' && !Array.isArray(sp.socialLinks)) {
        // If individual fields are provided, update them individually
        if (sp.socialLinks.github !== undefined) updateData['studentProfile.socialLinks.github'] = sp.socialLinks.github;
        if (sp.socialLinks.linkedin !== undefined) updateData['studentProfile.socialLinks.linkedin'] = sp.socialLinks.linkedin;
        if (sp.socialLinks.website !== undefined) updateData['studentProfile.socialLinks.website'] = sp.socialLinks.website;
        if (sp.socialLinks.behance !== undefined) updateData['studentProfile.socialLinks.behance'] = sp.socialLinks.behance;
        if (sp.socialLinks.telegram !== undefined) updateData['studentProfile.socialLinks.telegram'] = sp.socialLinks.telegram;
        if (sp.socialLinks.whatsapp !== undefined) updateData['studentProfile.socialLinks.whatsapp'] = sp.socialLinks.whatsapp;
      } else {
        // If entire object is provided, replace it
        updateData['studentProfile.socialLinks'] = sp.socialLinks;
      }
    }

    // Bio and availability - convert empty strings to undefined for enum fields
    if (sp.bio !== undefined) updateData['studentProfile.bio'] = sp.bio;
    if (sp.availability !== undefined) {
      updateData['studentProfile.availability'] = sp.availability === '' ? undefined : sp.availability;
    }

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

    // Social links - handle individual fields or entire object
    if (cp.socialLinks !== undefined) {
      if (typeof cp.socialLinks === 'object' && !Array.isArray(cp.socialLinks)) {
        // If individual fields are provided, update them individually
        if (cp.socialLinks.linkedin !== undefined) updateData['clientProfile.socialLinks.linkedin'] = cp.socialLinks.linkedin;
        if (cp.socialLinks.website !== undefined) updateData['clientProfile.socialLinks.website'] = cp.socialLinks.website;
        if (cp.socialLinks.telegram !== undefined) updateData['clientProfile.socialLinks.telegram'] = cp.socialLinks.telegram;
        if (cp.socialLinks.whatsapp !== undefined) updateData['clientProfile.socialLinks.whatsapp'] = cp.socialLinks.whatsapp;
      } else {
        // If entire object is provided, replace it
        updateData['clientProfile.socialLinks'] = cp.socialLinks;
      }
    }
  }

  // Support direct clientProfile fields for backwards compatibility
  if (req.user.role === 'client') {
    if (req.body.companyName !== undefined) updateData['clientProfile.companyName'] = req.body.companyName;
    if (req.body.industry !== undefined) updateData['clientProfile.industry'] = req.body.industry;
  }

  // 4) Update user document
  try {
    // Use $set operator for nested fields
    const setData = {};
    Object.keys(updateData).forEach(key => {
      if (key.includes('.')) {
        // Handle nested fields with $set
        const parts = key.split('.');
        let current = setData;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!current[parts[i]]) {
            current[parts[i]] = {};
          }
          current = current[parts[i]];
        }
        current[parts[parts.length - 1]] = updateData[key];
      } else {
        setData[key] = updateData[key];
      }
    });

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { $set: setData },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!updatedUser) {
      return next(new AppError('User not found', 404));
    }

    res.status(200).json({
      status: 'success',
      message: 'Profile updated successfully',
      data: {
        user: updatedUser,
      },
    });
  } catch (error) {
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return next(new AppError(`Validation error: ${errors.join(', ')}`, 400));
    }
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return next(new AppError(`This ${field} is already in use. Please use a different one.`, 400));
    }
    
    // Log unexpected errors
    console.error('Error updating profile:', {
      error: error.message,
      stack: error.stack,
      userId: req.user.id,
      updateData: Object.keys(updateData),
    });
    
    // Return user-friendly error
    return next(new AppError('Failed to update profile. Please check your input and try again.', 500));
  }
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

// Upload additional document
exports.uploadAdditionalDocument = catchAsync(async (req, res, next) => {
  if (!req.file) {
    return next(new AppError('Please upload a file', 400));
  }

  // Only allow students to upload additional documents
  if (req.user.role !== 'student') {
    return next(new AppError('Only students can upload additional documents', 403));
  }

  // Get the file path (relative to server root for storage)
  const filePath = `/uploads/additional-documents/${req.file.filename}`;

  // Get description from request body (optional)
  const description = req.body.description || '';

  // Get current user to add document to array
  const user = await User.findById(req.user.id);

  if (!user.studentProfile) {
    user.studentProfile = {};
  }

  if (!user.studentProfile.additionalDocuments) {
    user.studentProfile.additionalDocuments = [];
  }

  // Add new document to array
  const newDocument = {
    filename: req.file.originalname,
    url: filePath,
    uploadedAt: Date.now(),
    description: description,
  };

  user.studentProfile.additionalDocuments.push(newDocument);
  await user.save({ validateBeforeSave: false });

  res.status(200).json({
    status: 'success',
    message: 'Document uploaded successfully',
    data: {
      document: newDocument,
      totalDocuments: user.studentProfile.additionalDocuments.length,
    },
  });
});

// Delete additional document
exports.deleteAdditionalDocument = catchAsync(async (req, res, next) => {
  // Only allow students to delete additional documents
  if (req.user.role !== 'student') {
    return next(new AppError('Only students can delete additional documents', 403));
  }

  const { documentIndex } = req.body;

  if (documentIndex === undefined || documentIndex === null) {
    return next(new AppError('Document index is required', 400));
  }

  const user = await User.findById(req.user.id);

  if (!user.studentProfile?.additionalDocuments || !Array.isArray(user.studentProfile.additionalDocuments)) {
    return next(new AppError('No additional documents found', 404));
  }

  if (documentIndex < 0 || documentIndex >= user.studentProfile.additionalDocuments.length) {
    return next(new AppError('Invalid document index', 400));
  }

  const documentToDelete = user.studentProfile.additionalDocuments[documentIndex];

  // Delete the file from filesystem
  const fs = require('fs');
  const path = require('path');
  const filePath = path.join(__dirname, '..', documentToDelete.url);

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  // Remove document from array
  user.studentProfile.additionalDocuments.splice(documentIndex, 1);
  await user.save({ validateBeforeSave: false });

  res.status(200).json({
    status: 'success',
    message: 'Document deleted successfully',
  });
});

// @desc    Get platform statistics
// @route   GET /api/v1/auth/platform-stats
// @access  Public (authenticated)
// Get client dashboard statistics
exports.getClientDashboardStats = catchAsync(async (req, res, next) => {
  if (req.user.role !== 'client') {
    return next(new AppError('Only clients can access this endpoint', 403));
  }

  const JobPost = require('../models/jobPostModel');
  const JobApplication = require('../models/jobApplicationModel');

  const clientId = req.user._id;

  // Get client's job post IDs
  const clientJobPosts = await JobPost.find({ client: clientId }).select('_id');
  const jobPostIds = clientJobPosts.map(job => job._id);

  // Count total applications for client's jobs
  const totalApplications = await JobApplication.countDocuments({
    jobPost: { $in: jobPostIds }
  });

  // Count total jobs posted by client
  const totalJobs = await JobPost.countDocuments({ client: clientId });

  // Count total unlocked profiles (applications where contactUnlockedByClient is true)
  const totalUnlockedProfiles = await JobApplication.countDocuments({
    jobPost: { $in: jobPostIds },
    contactUnlockedByClient: true
  });

  res.status(200).json({
    status: 'success',
    data: {
      totalApplications,
      totalJobs,
      totalUnlockedProfiles,
    },
  });
});

exports.getPlatformStats = catchAsync(async (req, res, next) => {
  // Count total students
  const totalStudents = await User.countDocuments({ role: 'student', active: true });

  // Count total clients
  const totalClients = await User.countDocuments({ role: 'client', active: true });

  // Count verified students
  const verifiedStudents = await User.countDocuments({
    role: 'student',
    active: true,
    'studentProfile.isVerified': true
  });

  res.status(200).json({
    status: 'success',
    data: {
      totalStudents,
      totalClients,
      verifiedStudents,
    },
  });
});
