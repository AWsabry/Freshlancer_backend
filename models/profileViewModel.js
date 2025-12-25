const mongoose = require('mongoose');

const profileViewSchema = new mongoose.Schema({
  client: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'Profile view must have a client'],
  },
  student: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'Profile view must have a student'],
  },
  jobPost: {
    type: mongoose.Schema.ObjectId,
    ref: 'JobPost',
    required: [true, 'Profile view must be associated with a job post'],
  },
  application: {
    type: mongoose.Schema.ObjectId,
    ref: 'JobApplication',
  },
  viewType: {
    type: String,
    required: [true, 'View type is required'],
    enum: {
      values: ['anonymized', 'full', 'preview'],
      message: 'View type must be anonymized, full, or preview',
    },
  },
  // Points tracking
  pointsSpent: {
    type: Number,
    default: 0,
    min: [0, 'Points spent cannot be negative'],
  },
  package: {
    type: mongoose.Schema.ObjectId,
    ref: 'ClientPackage',
  },
  // View details
  viewedAt: {
    type: Date,
    default: Date.now,
  },
  viewDuration: {
    type: Number, // in seconds
  },
  // What was accessed
  sectionsViewed: [
    {
      type: String,
      enum: [
        'basic_info',
        'contact_details',
        'skills',
        'education',
        'portfolio',
        'certifications',
        'resume',
        'intro_video',
        'reviews',
      ],
    },
  ],
  // Actions taken after viewing
  actionTaken: {
    type: String,
    enum: ['none', 'invited', 'messaged', 'shortlisted', 'rejected'],
    default: 'none',
  },
  actionTakenAt: Date,
  // Tracking
  ipAddress: String,
  userAgent: String,
  deviceType: {
    type: String,
    enum: ['desktop', 'mobile', 'tablet'],
  },
  // Notes from client
  clientNotes: {
    type: String,
    maxlength: [1000, 'Client notes must be less than 1000 characters'],
  },
  // Shortlist/favorite
  isShortlisted: {
    type: Boolean,
    default: false,
  },
  shortlistedAt: Date,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Ensure unique tracking per client-student-job combination
profileViewSchema.index({ client: 1, student: 1, jobPost: 1 }, { unique: true });

// Index for better query performance
profileViewSchema.index({ client: 1, viewedAt: -1 });
profileViewSchema.index({ student: 1, viewedAt: -1 });
profileViewSchema.index({ jobPost: 1 });
profileViewSchema.index({ viewType: 1 });
profileViewSchema.index({ isShortlisted: 1 });

// Update action taken timestamp
profileViewSchema.pre('save', function (next) {
  if (this.isModified('actionTaken') && this.actionTaken !== 'none') {
    this.actionTakenAt = Date.now();
  }
  next();
});

// Update shortlisted timestamp
profileViewSchema.pre('save', function (next) {
  if (this.isModified('isShortlisted') && this.isShortlisted === true) {
    this.shortlistedAt = Date.now();
  }
  next();
});

// Populate related documents when querying
profileViewSchema.pre(/^find/, function (next) {
  this.populate({
    path: 'client',
    select: 'name email photo clientProfile.companyName',
  })
    .populate({
      path: 'student',
      select: 'name email photo studentProfile.skills rating',
    })
    .populate({
      path: 'jobPost',
      select: 'title category budget',
    })
    .populate({
      path: 'package',
      select: 'packageName packageType',
    });
  next();
});

// Static method to check if client has viewed a student's full profile
profileViewSchema.statics.hasViewedFullProfile = async function (
  clientId,
  studentId,
  jobPostId
) {
  const view = await this.findOne({
    client: clientId,
    student: studentId,
    jobPost: jobPostId,
    viewType: 'full',
  });
  return !!view;
};

// Static method to get anonymized profile data
profileViewSchema.statics.getAnonymizedProfile = function (studentProfile) {
  return {
    skills: studentProfile.skills || [],
    experienceLevel: studentProfile.experienceLevel,
    availability: studentProfile.availability,
    rating: studentProfile.rating,
    completedProjects: studentProfile.completedProjects,
    // Hide personal details
    name: 'Anonymous Student',
    email: null,
    phone: null,
    location: studentProfile.location && studentProfile.location.city
      ? { country: studentProfile.country || null, city: studentProfile.location.city }
      : studentProfile.country
      ? { country: studentProfile.country, city: null }
      : null,
  };
};

const ProfileView = mongoose.model('ProfileView', profileViewSchema);

module.exports = ProfileView;
