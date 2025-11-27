const mongoose = require('mongoose');
const validator = require('validator');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'user must have a name'],
    trim: true,
    maxlength: [40, 'a user name must have less or equal then 40 characters'],
    minlength: [5, 'a user name must have more or equal then 5 characters'],
  },
  email: {
    type: String,
    required: [true, 'user must have an email'],
    unique: true,
    trim: true,
    lowercase: true,
    validate: [validator.isEmail, 'please provide a valid email'],
  },
  photo: {
    type: String,
    default:
      'https://firebasestorage.googleapis.com/v0/b/my-trips-66039.appspot.com/o/images%2Fdefault.jpg?alt=media&token=b1ef31be-d806-4f23-a14f-0ada9100dd2b',
  },
  role: {
    type: String,
    enum: ['student', 'client', 'admin'],
    required: [true, 'user must have a role'],
  },
  password: {
    type: String,
    required: [true, 'user must have a password'],
    minlength: [8, 'password must have more or equal then 8 characters'],
    select: false,
  },
  passwordConfirm: {
    type: String,
    required: [true, 'user must have a password'],
    minlength: [8, 'password must have more or equal then 8 characters'],
    select: false,
    validate: {
      validator: function (val) {
        return val === this.password;
      },
      message: 'passwords are not the same',
    },
  },
  emailVerified: {
    type: Boolean,
    default: false,
  },
  active: {
    type: Boolean,
    default: true,
  },
  suspended: {
    type: Boolean,
    default: false,
  },
  suspendedAt: Date,
  suspendedBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
  },
  suspensionReason: {
    type: String,
    maxlength: [500, 'Suspension reason must be less than 500 characters'],
  },
  gender: {
    type: String,
    required: false,
    enum: {
      values: ['Male', 'Female'],
      message: 'Gender must be either: Male or Female',
    },
  },
  age: {
    type: Number,
    required: false,
    validate: {
      validator: function (val) {
        // Only validate if age is provided
        if (val === undefined || val === null) return true;
        return val >= 18;
      },
      message: 'user must be 18 years or older',
    },
  },
  nationality: {
    type: String,
    required: false,
    trim: true,
    maxlength: [50, 'nationality must have less or equal to 50 characters'],
    validate: {
      validator: function (val) {
        // Only validate length if nationality is provided
        if (!val || val === '') return true;
        return val.length >= 2 && val.length <= 50;
      },
      message: 'nationality must have between 2 and 50 characters',
    },
  },

  // Location and Contact Information
  phone: {
    type: String,
    trim: true,
    validate: {
      validator: function (val) {
        return !val || validator.isMobilePhone(val);
      },
      message: 'Please provide a valid phone number',
    },
  },
  location: {
    country: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
    timezone: {
      type: String,
      default: 'UTC',
    },
  },

  // Student-specific fields (only filled if role is 'student')
  studentProfile: {
    // Skills and expertise
    skills: [
      {
        name: String,
        level: {
          type: String,
          enum: ['Beginner', 'Intermediate', 'Advanced', 'Expert'],
        },
      },
    ],

    // Education information
    education: [
      {
        institution: String,
        degree: String,
        fieldOfStudy: String,
        graduationYear: Number,
        gpa: Number,
        isCurrentlyStudying: {
          type: Boolean,
          default: false,
        },
      },
    ],

    // Experience and rates
    experienceLevel: {
      type: String,
      enum: ['Beginner', 'Intermediate', 'Advanced', 'Expert'],
    },
    yearsOfExperience: {
      type: Number,
      min: 0,
      max: 50,
    },
    hourlyRate: {
      min: Number,
      max: Number,
      currency: {
        type: String,
        enum: [
          // Major Currencies
          'USD', 'EUR', 'EGP', 'GBP',
          // Middle East
          'AED', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR', 'JOD', 'LBP', 'ILS', 'TRY',
          // Africa
          'ZAR', 'MAD', 'TND', 'DZD', 'NGN', 'KES', 'GHS', 'UGX', 'TZS', 'ETB',
          // Europe
          'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'HRK', 'RUB', 'UAH'
        ],
        default: 'USD',
      },
    },

    // Portfolio and professional links
    portfolio: [
      {
        title: String,
        description: String,
        url: String,
        technologies: [String],
        completedDate: Date,
      },
    ],
    socialLinks: {
      github: String,
      linkedin: String,
      website: String,
      behance: String,
    },

    // Bio and availability
    bio: {
      type: String,
      maxlength: [1000, 'Bio must be less than 1000 characters'],
    },
    availability: {
      type: String,
      enum: ['Available', 'Busy', 'Not Available'],
      default: 'Available',
    },
    languages: [
      {
        language: String,
        proficiency: {
          type: String,
          enum: ['Basic', 'Conversational', 'Fluent', 'Native'],
        },
      },
    ],

    // Certifications
    certifications: [
      {
        name: String,
        issuingOrganization: String,
        issueDate: Date,
        expirationDate: Date,
        credentialId: String,
        credentialUrl: String,
      },
    ],

    // Resume/CV
    resume: {
      filename: String,
      url: String,
      uploadedAt: Date,
    },

    // Student verification
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationStatus: {
      type: String,
      enum: ['unverified', 'pending', 'verified', 'rejected'],
      default: 'unverified',
    },
    verificationSubmittedAt: Date,
    verificationApprovedAt: Date,

    // Intro video
    introVideo: {
      filename: String,
      url: String,
      uploadedAt: Date,
      duration: Number, // in seconds
    },

    // Subscription tracking
    subscriptionTier: {
      type: String,
      enum: ['free', 'premium'],
      default: 'free',
    },
    applicationsUsedThisMonth: {
      type: Number,
      default: 0,
    },
    applicationLimitResetDate: {
      type: Date,
      default: function () {
        const date = new Date();
        date.setMonth(date.getMonth() + 1);
        date.setDate(1);
        date.setHours(0, 0, 0, 0);
        return date;
      },
    },

    // Applied jobs tracking
    appliedJobs: [
      {
        jobId: {
          type: mongoose.Schema.ObjectId,
          ref: 'JobPost',
        },
        title: String,
        appliedAt: {
          type: Date,
          default: Date.now,
        },
        status: {
          type: String,
          enum: ['pending', 'accepted', 'rejected', 'withdrawn'],
          default: 'pending',
        },
      },
    ],
  },

  // Client-specific fields (only filled if role is 'client')
  clientProfile: {
    // Company information
    companyName: {
      type: String,
      trim: true,
    },
    companySize: {
      type: String,
      enum: ['1-10', '11-50', '51-200', '201-1000', '1000+'],
    },
    industry: {
      type: String,
      enum: [
        'Technology',
        'E-commerce',
        'Healthcare',
        'Finance',
        'Education',
        'Marketing',
        'Real Estate',
        'Manufacturing',
        'Consulting',
        'Non-profit',
        'Other',
      ],
    },
    isStartup: {
      type: Boolean,
      default: false,
    },
    companyWebsite: String,
    companyDescription: {
      type: String,
      maxlength: [
        1000,
        'Company description must be less than 1000 characters',
      ],
    },

    // Business details
    businessRegistrationNumber: String,
    taxId: String,
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationDocuments: [
      {
        type: String,
        url: String,
        uploadedAt: Date,
        status: {
          type: String,
          enum: ['pending', 'approved', 'rejected'],
          default: 'pending',
        },
      },
    ],

    // Payment and billing
    billingAddress: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: String,
    },
    paymentMethods: [
      {
        type: {
          type: String,
          enum: ['credit_card', 'paypal', 'bank_transfer'],
        },
        isDefault: {
          type: Boolean,
          default: false,
        },
        lastFour: String,
        expiryDate: String,
      },
    ],

    // Project preferences
    typicalBudgetRange: {
      min: Number,
      max: Number,
      currency: {
        type: String,
        enum: ['USD', 'EUR', 'GBP', 'EGP'],
        default: 'USD',
      },
    },
    preferredCommunication: [
      {
        type: String,
        enum: ['email', 'phone', 'video_call', 'chat'],
      },
    ],
    workingHours: {
      timezone: String,
      start: String, // e.g., "09:00"
      end: String, // e.g., "17:00"
      workingDays: [String], // e.g., ["Monday", "Tuesday", "Wednesday"]
    },

    // Points-based system (direct, no packages)
    pointsRemaining: {
      type: Number,
      default: 30, // Free tier gets 30 points
    },
    pointsUsed: {
      type: Number,
      default: 0,
    },
    pointsResetDate: {
      type: Date,
      default: function () {
        const date = new Date();
        date.setMonth(date.getMonth() + 1);
        date.setDate(1);
        date.setHours(0, 0, 0, 0);
        return date;
      },
    },

    // Track unlocked students
    unlockedStudents: [
      {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
      },
    ],
  },

  // Platform metrics and activity
  rating: {
    average: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    count: {
      type: Number,
      default: 0,
    },
  },
  completedProjects: {
    type: Number,
    default: 0,
  },
  totalEarnings: {
    type: Number,
    default: 0,
  },
  profileCompletionPercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  lastLoginAt: Date,
  accountCreatedSource: {
    type: String,
    enum: ['web', 'mobile', 'api'],
    default: 'web',
  },

  // Preferences and settings
  preferences: {
    emailNotifications: {
      newMessages: {
        type: Boolean,
        default: true,
      },
      jobAlerts: {
        type: Boolean,
        default: true,
      },
      applicationUpdates: {
        type: Boolean,
        default: true,
      },
      marketingEmails: {
        type: Boolean,
        default: false,
      },
    },
    privacy: {
      profileVisibility: {
        type: String,
        enum: ['public', 'limited', 'private'],
        default: 'public',
      },
      showEmail: {
        type: Boolean,
        default: false,
      },
      showPhone: {
        type: Boolean,
        default: false,
      },
    },
    language: {
      type: String,
      default: 'en',
    },
  },

  passwordChangedAt: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,
  emailVerificationToken: String,
  emailVerificationExpires: Date,
  joinedAt: {
    type: Date,
    default: Date.now,
  },
});

//check if password is modified and hash it
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  this.passwordConfirm = undefined;
  next();
});

//update passwordChangedAt when password is changed
userSchema.pre('save', function (next) {
  if (!this.isModified('password') || this.isNew) return next();
  this.passwordChangedAt = Date.now() - 1000;
  next();
});

//check if the password is the same as enc or not
userSchema.methods.checkPassword = async (encPass, userPass) =>
  await bcrypt.compare(encPass, userPass);

userSchema.methods.changePasswordAfter = function (JWTTimeStamp) {
  if (this.passwordChangedAt) {
    const changedTimeStamp = parseInt(
      this.passwordChangedAt.getTime() / 1000,
      10
    );
    return JWTTimeStamp < changedTimeStamp;
  }
  return false;
};

userSchema.methods.createPasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  this.passwordResetExpires = Date.now() + 10 * 60 * 1000;
  return resetToken;
};

userSchema.methods.createEmailVerificationToken = function () {
  //create the random token
  const verificationToken = crypto.randomBytes(32).toString('hex');
  this.emailVerificationToken = crypto
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex');
  this.emailVerificationExpires = Date.now() + 10 * 60 * 1000;
  return verificationToken;
};

const User = mongoose.model('User', userSchema);

module.exports = User;
