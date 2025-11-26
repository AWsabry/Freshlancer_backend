const mongoose = require('mongoose');
const slugify = require('slugify');

const jobPostSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Job post must have a title'],
    trim: true,
    maxlength: [100, 'Job title must have less or equal to 100 characters'],
    minlength: [5, 'Job title must have more or equal to 5 characters'],
  },
  slug: {
    type: String,
    unique: true,
  },
  description: {
    type: String,
    required: [true, 'Job post must have a description'],
    trim: true,
    maxlength: [
      50000,
      'Job description must have less or equal to 50000 characters',
    ],
    minlength: [20, 'Job description must have more or equal to 20 characters'],
  },
  budget: {
    min: {
      type: Number,
      required: [true, 'Job post must have a minimum budget'],
      min: [1, 'Minimum budget must be at least $1'],
    },
    max: {
      type: Number,
      required: [true, 'Job post must have a maximum budget'],
      min: [1, 'Maximum budget must be at least $1'],
    },
    currency: {
      type: String,
      default: 'USD',
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
    },
  },
  deadline: {
    type: Date,
    required: [true, 'Job post must have a deadline'],
    validate: {
      validator: function (val) {
        return val > Date.now();
      },
      message: 'Deadline must be in the future',
    },
  },
  skillsRequired: {
    type: [String],
    required: [true, 'Job post must specify required skills'],
    validate: {
      validator: function (val) {
        return val.length > 0 && val.length <= 10;
      },
      message: 'Job post must have between 1 and 10 skills',
    },
  },
  category: {
    type: String,
    required: [true, 'Job post must have a category'],
    enum: {
      values: [
        'Web Development',
        'Mobile Development',
        'Data Science',
        'Machine Learning',
        'UI/UX Design',
        'Content Writing',
        'Digital Marketing',
        'Graphic Design',
        'Video Editing',
        'Translation',
        'Research',
        'Other',
      ],
      message: 'Invalid category selected',
    },
  },
  experienceLevel: {
    type: String,
    required: [true, 'Job post must specify experience level'],
    enum: {
      values: ['Beginner', 'Intermediate', 'Advanced', 'Expert'],
      message: 'Experience level must be Beginner, Intermediate, Advanced, or Expert',
    },
  },
  projectDuration: {
    type: String,
    required: [true, 'Job post must specify project duration'],
    enum: {
      values: [
        'Less than 1 week',
        '1-2 weeks',
        '2-4 weeks',
        '1-3 months',
        'More than 3 months',
      ],
      message: 'Invalid project duration',
    },
  },
  status: {
    type: String,
    default: 'open',
    enum: {
      values: ['open', 'in_progress', 'completed', 'cancelled'],
      message: 'Status must be open, in_progress, completed, or cancelled',
    },
  },
  client: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'Job post must belong to a client'],
  },
  attachments: [
    {
      name: String,
      url: String,
      type: String,
    },
  ],
  applicationsCount: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  featured: {
    type: Boolean,
    default: false,
  },
  urgent: {
    type: Boolean,
    default: false,
  },
  // Invite-only or open application mode
  applicationType: {
    type: String,
    enum: {
      values: ['open', 'invite-only'],
      message: 'Application type must be open or invite-only',
    },
    default: 'open',
  },
  invitedStudents: [
    {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
    },
  ],
  invitesSent: {
    type: Number,
    default: 0,
  },
});

// Validate budget range
jobPostSchema.pre('save', function (next) {
  if (this.budget.max < this.budget.min) {
    return next(
      new Error(
        'Maximum budget must be greater than or equal to minimum budget'
      )
    );
  }
  next();
});

// Create slug from title
jobPostSchema.pre('save', function (next) {
  if (this.isModified('title')) {
    this.slug = slugify(this.title, { lower: true, strict: true });
  }
  next();
});

// Update the updatedAt field
jobPostSchema.pre('save', function (next) {
  if (!this.isNew) {
    this.updatedAt = Date.now();
  }
  next();
});

// Populate client and invited students information when querying
jobPostSchema.pre(/^find/, function (next) {
  this.populate({
    path: 'client',
    select: 'name email photo role',
  }).populate({
    path: 'invitedStudents',
    select: 'name email photo studentProfile.skills rating',
  });
  next();
});

// Index for better query performance
jobPostSchema.index({ status: 1 });
jobPostSchema.index({ category: 1 });
jobPostSchema.index({ skillsRequired: 1 });
jobPostSchema.index({ createdAt: -1 });
jobPostSchema.index({ deadline: 1 });
jobPostSchema.index({ 'budget.min': 1, 'budget.max': 1 });

const JobPost = mongoose.model('JobPost', jobPostSchema);

module.exports = JobPost;
