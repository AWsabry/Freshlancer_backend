const mongoose = require('mongoose');

const educationEntitySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Partner name is required'],
      trim: true,
      maxlength: [200, 'Name must be less than 200 characters'],
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    logoUrl: {
      type: String,
      default: '',
    },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, 'Description must be less than 2000 characters'],
    },
    website: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

educationEntitySchema.index({ isActive: 1, sortOrder: 1 });

const EducationEntity = mongoose.model('EducationEntity', educationEntitySchema);

module.exports = EducationEntity;
