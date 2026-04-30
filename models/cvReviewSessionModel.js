const mongoose = require('mongoose');

const storedFileSchema = new mongoose.Schema(
  {
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    path: { type: String, required: true }, // absolute path on disk
  },
  { _id: false }
);

const cvReviewSessionSchema = new mongoose.Schema(
  {
    uploadId: { type: String, required: true, unique: true, index: true },
    user: { type: mongoose.Schema.ObjectId, ref: 'User', default: null, index: true },

    status: {
      type: String,
      enum: ['uploaded', 'pending_verification', 'processing', 'completed', 'failed'],
      default: 'uploaded',
      required: true,
    },

    file: { type: storedFileSchema, required: true },
    targetFields: { type: [String], default: [] },

    analysisEngine: {
      provider: { type: String, default: 'internal' },
      version: { type: String, default: 'v1' },
    },

    extractedText: { type: String, default: '' },
    structure: { type: mongoose.Schema.Types.Mixed, default: null },
    analysis: { type: mongoose.Schema.Types.Mixed, default: null },

    errorMessage: { type: String, default: null },

    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

// TTL cleanup after expiry (Mongo deletes automatically)
cvReviewSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const CvReviewSession = mongoose.model('CvReviewSession', cvReviewSessionSchema);

module.exports = CvReviewSession;

