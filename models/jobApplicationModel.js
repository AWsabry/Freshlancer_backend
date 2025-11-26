const mongoose = require('mongoose');

const jobApplicationSchema = new mongoose.Schema({
  jobPost: {
    type: mongoose.Schema.ObjectId,
    ref: 'JobPost',
    required: [true, 'Application must be for a job post'],
  },
  student: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'Application must be from a student'],
  },
  // Structured proposal (no free-text as per requirements)
  // Students can only select from predefined options
  proposalType: {
    type: String,
    enum: [
      'standard',
      'express',
      'premium',
      'custom',
    ],
    default: 'standard',
  },
  // Optional proposal text for premium students
  proposalText: {
    type: String,
    trim: true,
    maxlength: [1000, 'Proposal text must be less than 1000 characters'],
  },
  proposedBudget: {
    amount: {
      type: Number,
      required: [true, 'Application must include a proposed budget'],
      min: [1, 'Proposed budget must be at least $1'],
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
  estimatedDuration: {
    type: String,
    required: [true, 'Application must include estimated duration'],
    enum: {
      values: [
        'Less than 1 week',
        '1-2 weeks',
        '2-4 weeks',
        '1-3 months',
        'More than 3 months',
      ],
      message: 'Invalid estimated duration',
    },
  },
  // Structured approach selections (no free-text allowed)
  approachSelections: {
    methodology: {
      type: String,
      enum: [
        'Agile',
        'Waterfall',
        'Iterative',
        'Prototype-First',
        'Standard',
      ],
    },
    deliveryFrequency: {
      type: String,
      enum: [
        'Daily updates',
        'Weekly updates',
        'Bi-weekly updates',
        'Monthly updates',
        'Upon completion',
      ],
    },
    revisions: {
      type: Number,
      min: 0,
      max: 10,
      default: 2,
    },
    communicationPreference: {
      type: String,
      enum: [
        'Email only',
        'Chat preferred',
        'Video calls available',
        'Flexible',
      ],
      default: 'Flexible',
    },
  },
  // Pre-selected availability options
  availabilityCommitment: {
    type: String,
    enum: [
      'Full-time (40+ hours/week)',
      'Part-time (20-40 hours/week)',
      'Part-time (10-20 hours/week)',
      'Weekends only',
      'Flexible hours',
    ],
    required: [true, 'Availability commitment is required'],
  },
  // Optional: Allow students to select relevant experience
  relevantExperienceLevel: {
    type: String,
    enum: [
      'This is my first project in this category',
      'I have 1-3 similar projects',
      'I have 3-5 similar projects',
      'I have 5+ similar projects',
      'I am an expert in this field',
    ],
  },
  portfolio: [
    {
      title: {
        type: String,
        required: [true, 'Portfolio item must have a title'],
        trim: true,
        maxlength: [100, 'Portfolio title must be less than 100 characters'],
      },
      description: {
        type: String,
        trim: true,
        maxlength: [
          500,
          'Portfolio description must be less than 500 characters',
        ],
      },
      url: {
        type: String,
        validate: {
          validator: function (val) {
            return !val || val.match(/^https?:\/\/.+\..+/);
          },
          message: 'Portfolio URL must be a valid URL',
        },
      },
      technologies: [String],
    },
  ],
  attachments: [
    {
      name: {
        type: String,
        required: [true, 'Attachment must have a name'],
      },
      url: {
        type: String,
        required: [true, 'Attachment must have a URL'],
      },
      type: {
        type: String,
        enum: ['document', 'image', 'video', 'other'],
        default: 'document',
      },
      size: Number, // in bytes
    },
  ],
  status: {
    type: String,
    default: 'pending',
    enum: {
      values: ['pending', 'reviewed', 'accepted', 'rejected', 'withdrawn'],
      message:
        'Status must be pending, reviewed, accepted, rejected, or withdrawn',
    },
  },
  clientFeedback: {
    message: {
      type: String,
      trim: true,
      maxlength: [500, 'Client feedback must be less than 500 characters'],
    },
    rating: {
      type: Number,
      min: [1, 'Rating must be at least 1'],
      max: [5, 'Rating must be at most 5'],
    },
    givenAt: Date,
  },
  applicationNumber: {
    type: String,
    unique: true,
  },
  priority: {
    type: String,
    default: 'normal',
    enum: ['low', 'normal', 'high'],
  },
  readByClient: {
    type: Boolean,
    default: false,
  },
  readByClientAt: Date,
  contactUnlockedByClient: {
    type: Boolean,
    default: false,
  },
  contactUnlockedAt: Date,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  withdrawnAt: Date,
  withdrawalReason: {
    type: String,
    trim: true,
    maxlength: [300, 'Withdrawal reason must be less than 300 characters'],
  },
});

// Ensure a student can only apply once per job post
jobApplicationSchema.index({ jobPost: 1, student: 1 }, { unique: true });

// Index for better query performance
jobApplicationSchema.index({ status: 1 });
jobApplicationSchema.index({ createdAt: -1 });
jobApplicationSchema.index({ readByClient: 1 });
jobApplicationSchema.index({ priority: 1 });

// Generate unique application number
jobApplicationSchema.pre('save', async function (next) {
  if (this.isNew) {
    const count = await this.constructor.countDocuments();
    this.applicationNumber = `APP-${Date.now()}-${(count + 1)
      .toString()
      .padStart(4, '0')}`;
  }
  next();
});

// Update the updatedAt field
jobApplicationSchema.pre('save', function (next) {
  if (!this.isNew) {
    this.updatedAt = Date.now();
  }
  next();
});

// Set withdrawal timestamp when status changes to withdrawn
jobApplicationSchema.pre('save', function (next) {
  if (this.isModified('status') && this.status === 'withdrawn') {
    this.withdrawnAt = Date.now();
  }
  next();
});

// Update readByClientAt when readByClient changes to true
jobApplicationSchema.pre('save', function (next) {
  if (this.isModified('readByClient') && this.readByClient === true) {
    this.readByClientAt = Date.now();
  }
  next();
});

// Validate that only students can apply
jobApplicationSchema.pre('save', async function (next) {
  if (this.isNew) {
    const User = mongoose.model('User');
    const student = await User.findById(this.student);
    if (!student || student.role !== 'student') {
      return next(new Error('Only students can apply for jobs'));
    }
  }
  next();
});

// Validate that job post belongs to a client
jobApplicationSchema.pre('save', async function (next) {
  if (this.isNew) {
    const JobPost = mongoose.model('JobPost');
    const jobPost = await JobPost.findById(this.jobPost).populate('client');
    if (!jobPost) {
      return next(new Error('Job post not found'));
    }
    if (jobPost.client.role !== 'client') {
      return next(new Error('Job post must belong to a client'));
    }
    if (jobPost.status !== 'open') {
      return next(new Error('Cannot apply to a job that is not open'));
    }
  }
  next();
});

// Update job post applications count
jobApplicationSchema.post('save', async function () {
  if (this.isNew) {
    const JobPost = mongoose.model('JobPost');
    await JobPost.findByIdAndUpdate(this.jobPost, {
      $inc: { applicationsCount: 1 },
    });
  }
});

// Decrease job post applications count when application is removed
jobApplicationSchema.post('findOneAndDelete', async (doc) => {
  if (doc) {
    const JobPost = mongoose.model('JobPost');
    await JobPost.findByIdAndUpdate(doc.jobPost, {
      $inc: { applicationsCount: -1 },
    });
  }
});

// Populate job post and student information when querying
jobApplicationSchema.pre(/^find/, function (next) {
  this.populate({
    path: 'jobPost',
    select: 'title description budget deadline status client category location urgent skillsRequired duration createdAt',
    populate: {
      path: 'client',
      select: 'name email photo clientProfile',
    },
  }).populate({
    path: 'student',
    select: 'name email photo age nationality studentProfile',
  });
  next();
});

const JobApplication = mongoose.model('JobApplication', jobApplicationSchema);

module.exports = JobApplication;
