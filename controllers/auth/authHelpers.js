const AppError = require('../../utils/AppError');
const { getCurrencyByCountry } = require('../../utils/payment/currencyRates');
const { getFrontendUrl, handleEmailError } = require('../../utils/helpers');
const sendEmail = require('../../utils/email');
const University = require('../../models/universityModel');

/**
 * Map country name to ISO country code (2 letters)
 * This matches the frontend COUNTRY_TO_ISO_CODE mapping
 */
const getCountryCodeFromName = (countryName) => {
  if (!countryName) return null;
  
  // If already a 2-letter code, return it uppercase
  if (countryName.length === 2) {
    return countryName.toUpperCase();
  }
  
  // Map country names to ISO codes (matching frontend mapping)
  const COUNTRY_TO_ISO_CODE = {
    'Afghanistan': 'AF', 'Albania': 'AL', 'Algeria': 'DZ', 'Argentina': 'AR',
    'Australia': 'AU', 'Austria': 'AT', 'Bahrain': 'BH', 'Bangladesh': 'BD',
    'Belgium': 'BE', 'Brazil': 'BR', 'Bulgaria': 'BG', 'Canada': 'CA',
    'Chile': 'CL', 'China': 'CN', 'Colombia': 'CO', 'Croatia': 'HR',
    'Czech Republic': 'CZ', 'Denmark': 'DK', 'Egypt': 'EG', 'Ethiopia': 'ET',
    'Finland': 'FI', 'France': 'FR', 'Germany': 'DE', 'Ghana': 'GH',
    'Greece': 'GR', 'Hungary': 'HU', 'India': 'IN', 'Indonesia': 'ID',
    'Ireland': 'IE', 'Italy': 'IT', 'Japan': 'JP', 'Jordan': 'JO',
    'Kenya': 'KE', 'Kuwait': 'KW', 'Lebanon': 'LB', 'Malaysia': 'MY',
    'Mexico': 'MX', 'Morocco': 'MA', 'Netherlands': 'NL', 'New Zealand': 'NZ',
    'Nigeria': 'NG', 'Norway': 'NO', 'Oman': 'OM', 'Pakistan': 'PK',
    'Palestine': 'PS', 'Peru': 'PE', 'Philippines': 'PH', 'Poland': 'PL',
    'Portugal': 'PT', 'Qatar': 'QA', 'Romania': 'RO', 'Russia': 'RU',
    'Saudi Arabia': 'SA', 'Singapore': 'SG', 'Slovakia': 'SK', 'South Africa': 'ZA',
    'South Korea': 'KR', 'Spain': 'ES', 'Sweden': 'SE', 'Switzerland': 'CH',
    'Tanzania': 'TZ', 'Thailand': 'TH', 'Tunisia': 'TN', 'Turkey': 'TR',
    'Uganda': 'UG', 'Ukraine': 'UA', 'United Arab Emirates': 'AE', 'United Kingdom': 'GB',
    'United States': 'US', 'Vietnam': 'VN',
  };
  
  return COUNTRY_TO_ISO_CODE[countryName] || null;
};

/**
 * Prepare base user data for registration
 */
const prepareBaseUserData = (req) => {
  return {
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    passwordConfirm: req.body.passwordConfirm,
    passwordChangedAt: req.body.passwordChangedAt,
    role: req.body.role,
    emailVerified: false,
    accountCreatedSource: 'Web',
    profileCompletionPercentage: 20,
    lastLoginAt: null, // Initialize lastLoginAt to null (will be set on first login)
  };
};

/**
 * Validate and prepare student-specific data
 */
const prepareStudentData = async (baseData, req, next) => {
  const required = ['phone', 'nationality', 'gender'];
  for (const field of required) {
    if (!req.body[field]) {
      return next(new AppError(`${field} is required for student registration`, 400));
    }
  }

  baseData.phone = req.body.phone;
  baseData.nationality = req.body.nationality;
  baseData.gender = req.body.gender;
  baseData.country = req.body.countryOfStudy || req.body.country;

  // Location handling
  if (req.body.location?.city) {
    baseData.location = { city: req.body.location.city };
    if (req.body.location.timezone) {
      baseData.location.timezone = req.body.location.timezone;
    }
  }

  // Initialize student profile
  baseData.studentProfile = {
    skills: [],
    portfolio: [],
    socialLinks: {},
    languages: [],
    certifications: [],
    availability: 'Available',
  };

  // Set currency based on country
  if (baseData.country) {
    const currency = getCurrencyByCountry(baseData.country);
    baseData.studentProfile.hourlyRate = { currency };
  }

  // Add student profile fields
  if (req.body.studentProfile) {
    const sp = req.body.studentProfile;
    
    // Handle university - can be either ID or name
    if (sp.university) {
      // Check if it's a valid MongoDB ObjectId (24 hex characters)
      const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(sp.university);
      
      if (isValidObjectId) {
        // It's an ID - verify it exists
        const university = await University.findById(sp.university);
        if (university) {
          baseData.studentProfile.university = university._id;
        } else {
          // Invalid ID, set to null
          baseData.studentProfile.university = null;
        }
      } else if (typeof sp.university === 'string' && sp.university.trim()) {
        // It's a name - find or store for later creation
        const universityName = sp.university.trim();
        // Try to find existing university by name (case-insensitive)
        const university = await University.findOne({
          name: { $regex: new RegExp(`^${universityName}$`, 'i') },
        });
        
        if (university) {
          // University exists, save its ID
          baseData.studentProfile.university = university._id;
        } else {
          // University doesn't exist - store name for later creation
          // Store in a temporary field to be handled after user creation
          baseData._pendingUniversityName = universityName;
          // Try to get country code from country field
          if (baseData.country) {
            baseData._pendingUniversityCountryCode = getCountryCodeFromName(baseData.country);
          } else {
            baseData._pendingUniversityCountryCode = null;
          }
          baseData.studentProfile.university = null;
        }
      }
    }
    if (sp.major?.trim()) {
      baseData.studentProfile.major = sp.major.trim();
    }
    if (sp.graduationYear) {
      const gradYear = parseInt(sp.graduationYear);
      if (!isNaN(gradYear) && gradYear > 1900 && gradYear <= 2034) {
        baseData.studentProfile.graduationYear = gradYear;
      } else if (gradYear > 2034) {
        return next(new AppError('Graduation year must not exceed 2034', 400));
      }
    }

    // Experience level is required
    const experienceLevel = sp.experienceLevel || req.body.experienceLevel;
    if (!experienceLevel) {
      return next(new AppError('Experience level is required for student registration', 400));
    }
    baseData.studentProfile.experienceLevel = experienceLevel;

    // Hourly rate
    if (sp.hourlyRate) {
      if (!baseData.studentProfile.hourlyRate) {
        baseData.studentProfile.hourlyRate = {};
      }
      if (sp.hourlyRate.min !== undefined) {
        baseData.studentProfile.hourlyRate.min = sp.hourlyRate.min;
      }
      if (sp.hourlyRate.max !== undefined) {
        baseData.studentProfile.hourlyRate.max = sp.hourlyRate.max;
      }
      if (sp.hourlyRate.currency && !baseData.studentProfile.hourlyRate.currency) {
        baseData.studentProfile.hourlyRate.currency = sp.hourlyRate.currency;
      }
    }
  } else if (!req.body.experienceLevel) {
    return next(new AppError('Experience level is required for student registration', 400));
  } else {
    baseData.studentProfile.experienceLevel = req.body.experienceLevel;
  }

  return baseData;
};

/**
 * Prepare client-specific data
 */
const prepareClientData = (baseData, req) => {
  if (req.body.country?.trim()) {
    baseData.country = req.body.country.trim();
  }
  if (req.body.phone) {
    baseData.phone = req.body.phone;
  }
  if (req.body.nationality) {
    baseData.nationality = req.body.nationality;
  }
  if (req.body.age !== undefined) {
    baseData.age = parseInt(req.body.age);
  }

  // Location handling
  if (req.body.location?.city) {
    baseData.location = { city: req.body.location.city };
    if (req.body.location.timezone) {
      baseData.location.timezone = req.body.location.timezone;
    }
  }

  // Initialize client profile
  baseData.clientProfile = {
    paymentMethods: [],
    isVerified: false,
  };

  if (req.body.clientProfile) {
    const cp = req.body.clientProfile;
    if (cp.companyName) baseData.clientProfile.companyName = cp.companyName;
    if (cp.industry) baseData.clientProfile.industry = cp.industry;
    if (cp.isStartup !== undefined) baseData.clientProfile.isStartup = cp.isStartup;
    if (cp.yearsOfExperience !== undefined) {
      baseData.clientProfile.yearsOfExperience = parseInt(cp.yearsOfExperience);
    }
    if (cp.howDidYouHear) baseData.clientProfile.howDidYouHear = cp.howDidYouHear;
  }

  // Handle startup creation
  if (req.body.startup && req.body.clientProfile?.isStartup) {
    baseData._startupData = {
      client: null, // Will be set after user creation
      startupName: req.body.startup.startupName,
      position: req.body.startup.position,
      numberOfEmployees: req.body.startup.numberOfEmployees,
      industry: req.body.startup.industry,
      stage: req.body.startup.stage,
    };
    if (req.body.startup.industryOther) {
      baseData._startupData.industryOther = req.body.startup.industryOther;
    }
  }

  return baseData;
};

/**
 * Prepare other role data (admin, etc.)
 */
const prepareOtherRoleData = (baseData, req) => {
  if (req.body.phone) baseData.phone = req.body.phone;
  if (req.body.nationality) baseData.nationality = req.body.nationality;
  if (req.body.country) baseData.country = req.body.country;
  if (req.body.age !== undefined && req.body.age !== null) {
    baseData.age = req.body.age;
  }
  if (req.body.gender) baseData.gender = req.body.gender;

  // Location handling
  if (req.body.location?.city) {
    baseData.location = { city: req.body.location.city };
    if (req.body.location.timezone) {
      baseData.location.timezone = req.body.location.timezone;
    }
  }

  return baseData;
};

/**
 * Prepare user data based on role
 */
const prepareUserData = async (req, next) => {
  const baseData = prepareBaseUserData(req);

  if (req.body.role === 'student') {
    return await prepareStudentData(baseData, req, next);
  } else if (req.body.role === 'client') {
    return prepareClientData(baseData, req);
  } else {
    return prepareOtherRoleData(baseData, req);
  }
};

/**
 * Create startup for user if needed
 */
const createStartupForUser = async (user, startupData) => {
  if (user.clientProfile?.isStartup && startupData) {
    const Startup = require('../../models/startupModel');
    startupData.client = user._id;
    await Startup.create(startupData);
  }
};

/**
 * Send verification email to new user
 * Returns result object with success status and message
 */
const sendVerificationEmail = async (user) => {
  try {
    const verificationToken = user.createEmailVerificationToken();
    await user.save({ validateBeforeSave: false });

    const frontendUrl = getFrontendUrl();
    const verificationURL = `${frontendUrl}/verify-email/${verificationToken}`;

    await sendEmail({
      type: 'welcome',
      email: user.email,
      name: user.name,
      userRole: user.role,
      verificationUrl: verificationURL,
    });

    return { 
      success: true, 
      message: 'Registration successful! Please check your email to verify your account.' 
    };
  } catch (err) {
    // Clear tokens on error
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save({ validateBeforeSave: false });

    return { 
      success: false, 
      message: 'Registration successful! However, we could not send the verification email. Please use the resend verification email feature.' 
    };
  }
};

module.exports = {
  prepareUserData,
  createStartupForUser,
  sendVerificationEmail,
  getCountryCodeFromName,
};

