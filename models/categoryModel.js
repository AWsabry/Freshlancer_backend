const mongoose = require('mongoose');
const AppError = require('../utils/AppError');

const CATEGORY_SPEC_TYPES = ['select', 'multi_select', 'number', 'boolean'];

const categorySpecSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: [true, 'Spec key is required'],
      trim: true,
      minlength: [2, 'Spec key must be at least 2 characters'],
      maxlength: [40, 'Spec key must be 40 characters or less'],
      validate: {
        validator: function (val) {
          // lower_snake_case keys, starts with letter
          return /^[a-z][a-z0-9_]*$/.test(val);
        },
        message:
          'Spec key must be lower_snake_case and start with a letter (a-z)',
      },
    },
    label: {
      type: String,
      required: [true, 'Spec label is required'],
      trim: true,
      maxlength: [80, 'Spec label must be 80 characters or less'],
    },
    type: {
      type: String,
      required: [true, 'Spec type is required'],
      enum: {
        values: CATEGORY_SPEC_TYPES,
        message: `Spec type must be one of: ${CATEGORY_SPEC_TYPES.join(', ')}`,
      },
    },
    options: {
      type: [String],
      default: undefined,
    },
    useInJobPost: {
      type: Boolean,
      default: false,
    },
    useInApplication: {
      type: Boolean,
      default: false,
    },
    requiredInJobPost: {
      type: Boolean,
      default: false,
    },
    requiredInApplication: {
      type: Boolean,
      default: false,
    },
    min: {
      type: Number,
    },
    max: {
      type: Number,
    },
    defaultValue: {
      type: mongoose.Schema.Types.Mixed,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  {
    _id: true,
  }
);

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Category name is required'],
    trim: true,
    unique: true,
    maxlength: [50, 'Category name must be less than 50 characters'],
  },
  description: {
    type: String,
    trim: true,
    maxlength: [200, 'Description must be less than 200 characters'],
  },
  icon: {
    type: String,
    trim: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  createdBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
  },
  specs: {
    type: [categorySpecSchema],
    default: [],
  },
});

// Validate specs (no free-text, consistent options/ranges, unique keys)
categorySchema.pre('validate', function (next) {
  try {
    const specs = Array.isArray(this.specs) ? this.specs : [];

    // Unique keys within a category (case-sensitive by design)
    const keySet = new Set();
    for (const spec of specs) {
      if (!spec) continue;
      const key = spec.key;
      if (!key) continue;
      if (keySet.has(key)) {
        return next(AppError.badRequest(`Duplicate spec key "${key}" in category specs`, 'CATEGORY_SPEC_DUPLICATE_KEY'));
      }
      keySet.add(key);

      // Must be used somewhere if defined
      if (!spec.useInJobPost && !spec.useInApplication) {
        return next(
          AppError.badRequest(
            `Spec "${key}" must be enabled for job posting and/or application`,
            'CATEGORY_SPEC_NOT_USED'
          )
        );
      }

      // Required flags only make sense if used in that flow
      if (spec.requiredInJobPost && !spec.useInJobPost) {
        return next(
          AppError.badRequest(
            `Spec "${key}" cannot be required in job post if disabled`,
            'CATEGORY_SPEC_INVALID_REQUIRED_FLAG'
          )
        );
      }
      if (spec.requiredInApplication && !spec.useInApplication) {
        return next(
          AppError.badRequest(
            `Spec "${key}" cannot be required in application if disabled`,
            'CATEGORY_SPEC_INVALID_REQUIRED_FLAG'
          )
        );
      }

      // Type-specific validation
      if (spec.type === 'select' || spec.type === 'multi_select') {
        if (!Array.isArray(spec.options) || spec.options.length === 0) {
          return next(
            AppError.badRequest(
              `Spec "${key}" of type "${spec.type}" must have non-empty options`,
              'CATEGORY_SPEC_OPTIONS_REQUIRED'
            )
          );
        }
        const normalized = spec.options
          .map((o) => (typeof o === 'string' ? o.trim() : ''))
          .filter(Boolean);
        const unique = Array.from(new Set(normalized));
        if (unique.length === 0) {
          return next(
            AppError.badRequest(
              `Spec "${key}" of type "${spec.type}" must have valid options`,
              'CATEGORY_SPEC_OPTIONS_INVALID'
            )
          );
        }
        spec.options = unique;
      } else {
        // Ensure options are not accidentally persisted for non-option types
        if (Array.isArray(spec.options) && spec.options.length > 0) {
          spec.options = undefined;
        }
      }

      if (spec.type === 'number') {
        if (
          spec.min !== undefined &&
          spec.max !== undefined &&
          spec.max < spec.min
        ) {
          return next(
            AppError.badRequest(
              `Spec "${key}" number range is invalid (max < min)`,
              'CATEGORY_SPEC_NUMBER_RANGE_INVALID'
            )
          );
        }
      }
    }

    next();
  } catch (err) {
    next(err);
  }
});

// Update the updatedAt field before saving
categorySchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Index for faster queries
// Note: name already has unique: true, which automatically creates an index, so we don't need to add it again
categorySchema.index({ isActive: 1 });

const Category = mongoose.model('Category', categorySchema);

module.exports = Category;

