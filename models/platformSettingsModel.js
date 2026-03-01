const mongoose = require('mongoose');

const PLATFORM_SETTINGS_ID = 'platform';

const platformSettingsSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: PLATFORM_SETTINGS_ID,
    },
    platformFeeRate: {
      type: Number,
      default: 0.1,
      min: [0, 'Platform fee rate cannot be negative'],
      max: [1, 'Platform fee rate cannot exceed 100%'],
    },
    transactionFeeRate: {
      type: Number,
      default: 0.03,
      min: [0, 'Transaction fee rate cannot be negative'],
      max: [1, 'Transaction fee rate cannot exceed 100%'],
    },
  },
  { timestamps: true }
);

const PlatformSettings = mongoose.model('PlatformSettings', platformSettingsSchema);
PlatformSettings.PLATFORM_SETTINGS_ID = PLATFORM_SETTINGS_ID;

module.exports = PlatformSettings;
