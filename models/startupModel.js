const mongoose = require('mongoose');

const startupSchema = new mongoose.Schema({
  client: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'Startup must be linked to a client'],
  },
  startupName: {
    type: String,
    required: [true, 'Startup name is required'],
    trim: true,
    maxlength: [100, 'Startup name must be less than 100 characters'],
  },
  position: {
    type: String,
    required: [true, 'Position is required'],
    trim: true,
    maxlength: [100, 'Position must be less than 100 characters'],
  },
  numberOfEmployees: {
    type: String,
    required: [true, 'Number of employees is required'],
    enum: {
      values: ['1-5', '6-10', '11-20', '21-50', '51-100', '100+'],
      message: 'Number of employees must be one of the predefined ranges',
    },
  },
  industry: {
    type: String,
    required: [true, 'Startup industry is required'],
    trim: true,
  },
  industryOther: {
    type: String,
    trim: true,
  },
  stage: {
    type: String,
    required: [true, 'Startup stage is required'],
    enum: {
      values: ['Idea', 'MVP', 'Early Stage', 'Growth', 'Scale'],
      message: 'Startup stage must be one of the predefined stages',
    },
  },
  logo: {
    type: String,
    trim: true,
  },
  website: {
    type: String,
    trim: true,
    validate: {
      validator: function (v) {
        if (!v) return true; // Optional field
        return /^https?:\/\/.+/.test(v);
      },
      message: 'Website must be a valid URL',
    },
  },
  socialLinks: {
    linkedin: {
      type: String,
      trim: true,
    },
    twitter: {
      type: String,
      trim: true,
    },
    facebook: {
      type: String,
      trim: true,
    },
    instagram: {
      type: String,
      trim: true,
    },
    github: {
      type: String,
      trim: true,
    },
    telegram: {
      type: String,
      trim: true,
    },
    whatsapp: {
      type: String,
      trim: true,
    },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update the updatedAt field before saving
startupSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Index for faster queries
startupSchema.index({ client: 1 });
startupSchema.index({ startupName: 1 });
startupSchema.index({ createdAt: -1 });

const Startup = mongoose.model('Startup', startupSchema);

module.exports = Startup;

