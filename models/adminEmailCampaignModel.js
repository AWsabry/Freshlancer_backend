const mongoose = require('mongoose');

const storedFileSchema = new mongoose.Schema(
  {
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    path: { type: String, required: true }, // absolute or server-relative path on disk
  },
  { _id: false }
);

const adminEmailCampaignSchema = new mongoose.Schema(
  {
    subject: { type: String, required: true, trim: true, maxlength: 200 },
    audience: {
      type: String,
      enum: ['students', 'clients', 'both'],
      default: 'students',
      required: true,
    },
    verificationStatus: {
      type: String,
      enum: ['verified', 'unverified', 'all'],
      default: 'verified',
      required: true,
    },
    mode: { type: String, enum: ['all', 'emails'], default: 'all', required: true },
    emails: [{ type: String, lowercase: true, trim: true }], // when mode=emails
    htmlBody: { type: String, default: '' },
    textBody: { type: String, default: '' },

    // Template variables used when sending (for re-send/edit)
    variables: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Uploaded assets saved for re-send
    attachments: [storedFileSchema],
    inlineImages: [storedFileSchema],

    // Send results summary
    sentBy: { type: mongoose.Schema.ObjectId, ref: 'User', required: true },
    sentAt: { type: Date, default: Date.now, index: true },
    recipientCount: { type: Number, default: 0 },
    chunkCount: { type: Number, default: 0 },
    messageIds: [{ type: String }],

    // Versioning (optional): if created from an older campaign
    basedOn: { type: mongoose.Schema.ObjectId, ref: 'AdminEmailCampaign', default: null },
  },
  { timestamps: true }
);

adminEmailCampaignSchema.index({ sentAt: -1 });
adminEmailCampaignSchema.index({ sentBy: 1, sentAt: -1 });
adminEmailCampaignSchema.index({ audience: 1, sentAt: -1 });

const AdminEmailCampaign = mongoose.model('AdminEmailCampaign', adminEmailCampaignSchema);

module.exports = AdminEmailCampaign;

