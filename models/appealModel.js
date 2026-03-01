const mongoose = require('mongoose');

const APPEAL_REASONS = ['non_payment', 'poor_quality', 'contract_violation', 'missed_deadline', 'other'];
const APPEAL_STATUSES = ['open', 'in_review', 'resolved', 'closed_by_opener', 'cancelled'];
const ADMIN_DECISIONS = ['favor_opener', 'favor_respondent', 'partial', 'dismissed'];

const appealDocumentSchema = new mongoose.Schema(
  {
    filename: {
      type: String,
      required: [true, 'Document filename is required'],
      trim: true,
    },
    url: {
      type: String,
      required: [true, 'Document URL is required'],
      trim: true,
    },
    uploadedBy: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: true,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Document description must be less than 500 characters'],
    },
  },
  { _id: true }
);

const appealMessageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: [true, 'Message sender is required'],
    },
    content: {
      type: String,
      required: [true, 'Message content is required'],
      trim: true,
      maxlength: [2000, 'Message content must be less than 2000 characters'],
    },
    attachments: {
      type: [String],
      default: [],
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: Date,
  },
  { _id: true }
);

const appealSchema = new mongoose.Schema(
  {
    contract: {
      type: mongoose.Schema.ObjectId,
      ref: 'Contract',
      required: [true, 'Appeal must belong to a contract'],
      index: true,
    },
    opener: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: [true, 'Appeal must have an opener'],
      index: true,
    },
    respondent: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: [true, 'Appeal must have a respondent'],
      index: true,
    },
    reason: {
      type: String,
      required: [true, 'Appeal reason is required'],
      enum: {
        values: APPEAL_REASONS,
        message: 'Invalid appeal reason',
      },
    },
    description: {
      type: String,
      required: [true, 'Appeal description is required'],
      trim: true,
      maxlength: [5000, 'Appeal description must be less than 5000 characters'],
    },
    status: {
      type: String,
      required: true,
      enum: {
        values: APPEAL_STATUSES,
        message: 'Invalid appeal status',
      },
      default: 'open',
      index: true,
    },
    adminDecision: {
      type: String,
      enum: {
        values: ADMIN_DECISIONS,
        message: 'Invalid admin decision',
      },
    },
    adminNotes: {
      type: String,
      trim: true,
      maxlength: [2000, 'Admin notes must be less than 2000 characters'],
    },
    resolvedAt: Date,
    resolvedBy: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
    },
    documents: {
      type: [appealDocumentSchema],
      default: [],
      validate: {
        validator: function (docs) {
          return docs.length <= 10;
        },
        message: 'Maximum 10 documents allowed per appeal',
      },
    },
    messages: {
      type: [appealMessageSchema],
      default: [],
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
  }
);

// Indexes
appealSchema.index({ contract: 1, status: 1 });
appealSchema.index({ opener: 1, createdAt: -1 });
appealSchema.index({ respondent: 1, createdAt: -1 });
appealSchema.index({ status: 1, createdAt: -1 });

// Pre-save hook to update updatedAt
appealSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Populate opener and respondent on find
appealSchema.pre(/^find/, function (next) {
  this.populate({
    path: 'opener',
    select: 'name email photo role',
  })
    .populate({
      path: 'respondent',
      select: 'name email photo role',
    })
    .populate({
      path: 'contract',
      select: 'status totalAmount currency projectDescription',
      populate: [
        { path: 'client', select: 'name email' },
        { path: 'student', select: 'name email' },
      ],
    })
    .populate({
      path: 'messages.sender',
      select: 'name email photo role',
    })
    .populate({
      path: 'documents.uploadedBy',
      select: 'name email photo role',
    })
    .populate({
      path: 'resolvedBy',
      select: 'name email role',
    });
  next();
});

// Static method to check if contract has active appeal
appealSchema.statics.hasActiveAppeal = async function (contractId) {
  const activeAppeal = await this.findOne({
    contract: contractId,
    status: { $in: ['open', 'in_review'] },
  });
  return !!activeAppeal;
};

// Instance method to check if user is party to appeal
appealSchema.methods.isParty = function (userId) {
  return (
    String(this.opener._id || this.opener) === String(userId) ||
    String(this.respondent._id || this.respondent) === String(userId)
  );
};

const Appeal = mongoose.model('Appeal', appealSchema);

module.exports = Appeal;
