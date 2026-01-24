const mongoose = require('mongoose');
const slugify = require('slugify');

const jobPostSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please enter a job title'],
    trim: true,
    maxlength: [100, 'Job title must be 100 characters or less'],
    minlength: [5, 'Job title must be at least 5 characters'],
  },
  slug: {
    type: String,
    unique: true,
  },
  description: {
    type: String,
    required: [true, 'Please describe the job and what you need'],
    trim: true,
    maxlength: [
      50000,
      'Job description must be 50,000 characters or less',
    ],
    minlength: [20, 'Job description must be at least 20 characters'],
  },
  budget: {
    min: {
      type: Number,
      required: [true, 'Please enter a minimum budget'],
      min: [1, 'Minimum budget must be at least 1'],
    },
    max: {
      type: Number,
      required: [true, 'Please enter a maximum budget'],
      min: [1, 'Maximum budget must be at least 1'],
    },
    currency: {
      type: String,
      default: 'USD',
      enum: ['USD', 'EGP'],
    },
  },
  deadline: {
    type: Date,
    required: false,
    validate: {
      validator: function (val) {
        // Only validate if deadline is provided and is a valid date
        if (!val || val === '' || val === null || val === undefined) return true;
        // Check if it's a valid date
        const date = new Date(val);
        if (isNaN(date.getTime())) return true; // Invalid date, let it pass (will be handled elsewhere)
        return date > Date.now();
      },
      message: 'If you set a deadline, it must be in the future',
    },
  },
  skillsRequired: {
    type: [String],
    required: [true, 'Please add at least one required skill for this job'],
    validate: {
      validator: function (val) {
        return val.length > 0 && val.length <= 10;
      },
      message: 'Please add between 1 and 10 skills',
    },
  },
  category: {
    type: String,
    required: [true, 'Please select a job category'],
    trim: true,
  },
  // Per-category custom requirements selected by the client at job-post time.
  // Keys correspond to Category.specs[].key
  categorySpecRequirements: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {},
  },
  experienceLevel: {
    type: String,
    required: [true, 'Please select the required experience level'],
    enum: {
      values: ['Beginner', 'Intermediate', 'Advanced', 'Expert'],
      message: 'Please select a valid experience level (Beginner, Intermediate, Advanced, or Expert)',
    },
  },
  projectDuration: {
    type: String,
    required: [true, 'Please select the expected project duration'],
    enum: {
      values: [
        'Less than 1 week',
        '1-2 weeks',
        '2-4 weeks',
        '1-3 months',
        'More than 3 months',
      ],
      message: 'Please select a valid project duration',
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
  startup: {
    type: mongoose.Schema.ObjectId,
    ref: 'Startup',
    required: false,
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

// Create slug from title with error handling
jobPostSchema.pre('save', async function (next) {
  if (this.isModified('title') && this.title) {
    try {
      // Clean the title first - remove extra whitespace and special characters
      let cleanTitle = this.title.trim();
      
      // Remove emojis and special unicode characters that might cause issues
      cleanTitle = cleanTitle.replace(/[\u{1F600}-\u{1F64F}]/gu, ''); // Emoticons
      cleanTitle = cleanTitle.replace(/[\u{1F300}-\u{1F5FF}]/gu, ''); // Misc Symbols
      cleanTitle = cleanTitle.replace(/[\u{1F680}-\u{1F6FF}]/gu, ''); // Transport
      cleanTitle = cleanTitle.replace(/[\u{2600}-\u{26FF}]/gu, ''); // Misc symbols
      cleanTitle = cleanTitle.replace(/[\u{2700}-\u{27BF}]/gu, ''); // Dingbats
      
      // Generate slug with more permissive options
      let slug = slugify(cleanTitle, {
        lower: true,
        strict: false, // Changed from true to false to be more permissive
        remove: /[*+~.()'"!:@]/g, // Remove problematic characters
        replacement: '-',
        locale: 'en', // Use English locale
        trim: true
      });
      
      // If slug is empty or too short after processing, create a fallback
      if (!slug || slug.length < 3) {
        // Create a fallback slug from the first few characters and timestamp
        const timestamp = Date.now().toString().slice(-6);
        const fallback = cleanTitle.substring(0, 20).replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
        slug = `${fallback || 'job'}-${timestamp}`;
      }
      
      // Ensure slug is not too long (max 100 characters for MongoDB index limits)
      if (slug.length > 100) {
        slug = slug.substring(0, 100);
      }
      
      // Check for uniqueness and append number if needed
      const JobPost = mongoose.model('JobPost');
      let uniqueSlug = slug;
      let counter = 1;
      const maxAttempts = 100; // Prevent infinite loops
      
      // Always check uniqueness to ensure no conflicts
      let existing = await JobPost.findOne({ slug: uniqueSlug, _id: { $ne: this._id } });
      while (existing && counter < maxAttempts) {
        uniqueSlug = `${slug}-${counter}`;
        // Ensure unique slug doesn't exceed length limit
        if (uniqueSlug.length > 100) {
          uniqueSlug = `${slug.substring(0, 95)}-${counter}`;
        }
        existing = await JobPost.findOne({ slug: uniqueSlug, _id: { $ne: this._id } });
        if (!existing) break;
        counter++;
      }
      
      // If we hit max attempts, use timestamp as fallback
      if (counter >= maxAttempts) {
        const timestamp = Date.now().toString().slice(-8);
        uniqueSlug = `${slug.substring(0, 90)}-${timestamp}`;
      }
      
      this.slug = uniqueSlug;
    } catch (error) {
      // Fallback: create slug from timestamp and random string if slugify fails
      console.error('Error creating slug:', error);
      const timestamp = Date.now().toString().slice(-8);
      const randomStr = Math.random().toString(36).substring(2, 6);
      this.slug = `job-${timestamp}-${randomStr}`;
    }
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

// Populate client information when querying
jobPostSchema.pre(/^find/, function (next) {
  this.populate({
    path: 'client',
    select: 'name email photo role',
  });
  this.populate({
    path: 'startup',
    select: 'startupName',
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
// Note: slug already has unique: true in schema, so unique index is created automatically

const JobPost = mongoose.model('JobPost', jobPostSchema);

module.exports = JobPost;
