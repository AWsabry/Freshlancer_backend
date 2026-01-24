const mongoose = require('mongoose');
const crypto = require('crypto');
const AppError = require('../utils/AppError');

const CONTRACT_STATUSES = [
  'draft',
  'pending_signatures',
  'signed',
  'active',
  'completed',
  'cancelled',
];

const MILESTONE_STATUSES = [
  'unfunded',
  'funded',
  'submitted',
  'approved',
  'released',
];

// Reuse the same duration options used across job posts/applications
const DURATION_OPTIONS = [
  'Less than 1 week',
  '1-2 weeks',
  '2-4 weeks',
  '1-3 months',
  'More than 3 months',
];

function roundMoney(val) {
  if (val === undefined || val === null) return val;
  const num = typeof val === 'string' ? Number(val) : val;
  if (!Number.isFinite(num)) return val;
  return Math.round(num * 100) / 100;
}

function stableStringify(value) {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

function computeContractHash(contractDoc) {
  const payload = {
    version: contractDoc.version || 0,
    projectDescription: contractDoc.projectDescription || '',
    paymentMethod: contractDoc.paymentMethod || '',
    expectedDuration: contractDoc.expectedDuration || '',
    currency: contractDoc.currency || '',
    totalAmount: roundMoney(contractDoc.totalAmount || 0),
    milestones: Array.isArray(contractDoc.milestones)
      ? contractDoc.milestones.map((m) => ({
          title: m?.plan?.title || '',
          description: m?.plan?.description || '',
          percent: m?.plan?.percent,
          expectedDuration: m?.plan?.expectedDuration || '',
        }))
      : [],
  };

  return crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');
}

const signatureSchema = new mongoose.Schema(
  {
    typedName: {
      type: String,
      trim: true,
      maxlength: [120, 'Typed signature name must be 120 characters or less'],
    },
    drawnSignatureDataUrl: {
      type: String,
      trim: true,
      // data URLs can be large; keep a reasonable cap
      maxlength: [500000, 'Drawn signature is too large'],
    },
    signedAt: Date,
    ipAddress: String,
    userAgent: String,
    contractHash: {
      type: String,
      trim: true,
    },
    contractVersion: Number,
  },
  { _id: false }
);

const milestoneSchema = new mongoose.Schema(
  {
    plan: {
      title: {
        type: String,
        required: [true, 'Milestone title is required'],
        trim: true,
        maxlength: [120, 'Milestone title must be 120 characters or less'],
      },
      description: {
        type: String,
        trim: true,
        maxlength: [2000, 'Milestone description must be 2000 characters or less'],
      },
      percent: {
        type: Number,
        required: [true, 'Milestone percent is required'],
        min: [0.01, 'Milestone percent must be > 0'],
        max: [100, 'Milestone percent must be <= 100'],
      },
      expectedDuration: {
        type: String,
        enum: DURATION_OPTIONS,
        default: undefined,
      },
    },
    state: {
      amount: {
        type: Number,
        default: 0,
      },
      status: {
        type: String,
        enum: MILESTONE_STATUSES,
        default: 'unfunded',
      },
      fundedAmount: {
        type: Number,
        default: 0,
        min: [0, 'Funded amount cannot be negative'],
      },
      fundedAt: Date,
      submittedAt: Date,
      approvedAt: Date,
      releasedAt: Date,
    },
  },
  { _id: true }
);

const contractChangeSchema = new mongoose.Schema(
  {
    field: { type: String, trim: true },
    label: { type: String, trim: true },
    before: { type: String },
    after: { type: String },
  },
  { _id: false }
);

const pendingConfirmationSchema = new mongoose.Schema(
  {
    required: { type: Boolean, default: false },
    updatedBy: { type: mongoose.Schema.ObjectId, ref: 'User' },
    updatedAt: Date,
    changes: { type: [contractChangeSchema], default: [] },
    confirmedBy: { type: mongoose.Schema.ObjectId, ref: 'User' },
    confirmedAt: Date,
  },
  { _id: false }
);

const contractChangeLogEntrySchema = new mongoose.Schema(
  {
    version: { type: Number, default: 0 },
    updatedBy: { type: mongoose.Schema.ObjectId, ref: 'User' },
    updatedAt: Date,
    changes: { type: [contractChangeSchema], default: [] },
    confirmedBy: { type: mongoose.Schema.ObjectId, ref: 'User' },
    confirmedAt: Date,
  },
  { _id: true }
);

const contractSchema = new mongoose.Schema(
  {
    jobPost: {
      type: mongoose.Schema.ObjectId,
      ref: 'JobPost',
      required: [true, 'Contract must belong to a job post'],
    },
    jobApplication: {
      type: mongoose.Schema.ObjectId,
      ref: 'JobApplication',
      required: [true, 'Contract must belong to a job application'],
      // Not unique: client may create a new contract after cancelling a previous one
    },
    client: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: [true, 'Contract must have a client'],
    },
    student: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: [true, 'Contract must have a student'],
    },

    // Terms
    projectDescription: {
      type: String,
      required: [true, 'Project description is required'],
      trim: true,
      maxlength: [10000, 'Project description must be 10000 characters or less'],
    },
    expectedDuration: {
      type: String,
      enum: DURATION_OPTIONS,
      default: '1-2 weeks',
    },
    paymentMethod: {
      type: String,
      required: [true, 'Payment method is required'],
      enum: {
        values: ['escrow_milestones'],
        message: 'Invalid payment method',
      },
      default: 'escrow_milestones',
    },
    currency: {
      type: String,
      required: [true, 'Currency is required'],
      enum: ['USD', 'EGP'],
      default: 'EGP',
    },
    totalAmount: {
      type: Number,
      required: [true, 'Total amount is required'],
      min: [0.01, 'Total amount must be > 0'],
    },

    milestones: {
      type: [milestoneSchema],
      default: [],
    },

    // Parties snapshot (captured on signing)
    clientSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    studentSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // Signatures
    clientSignature: {
      type: signatureSchema,
      default: null,
    },
    studentSignature: {
      type: signatureSchema,
      default: null,
    },
    signedAt: Date,

    // Versioning/hash
    version: {
      type: Number,
      default: 0,
    },
    pendingConfirmation: {
      type: pendingConfirmationSchema,
      default: () => ({ required: false, changes: [] }),
    },
    changeLog: {
      type: [contractChangeLogEntrySchema],
      default: [],
    },
    currentContractHash: {
      type: String,
      trim: true,
    },

    status: {
      type: String,
      enum: CONTRACT_STATUSES,
      default: 'draft',
    },

    activeAppeal: {
      type: mongoose.Schema.ObjectId,
      ref: 'Appeal',
      default: null,
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
    lastEditedAt: Date,
  },
  {
    timestamps: false,
  }
);

function didTermsChange(doc) {
  const paths = doc.modifiedPaths ? doc.modifiedPaths() : [];
  const termPaths = new Set([
    'projectDescription',
    'expectedDuration',
    'paymentMethod',
    'currency',
    'totalAmount',
  ]);

  for (const p of paths) {
    if (termPaths.has(p)) return true;
    // Detect milestone plan changes (ignore state changes)
    if (p === 'milestones') return true;
    if (p.startsWith('milestones.') && p.includes('.plan.')) return true;
    // When replacing a single milestone object, mongoose may mark 'milestones.0.plan'
    if (p.startsWith('milestones.') && p.endsWith('.plan')) return true;
  }
  return false;
}

// Validation + derived fields
contractSchema.pre('validate', function (next) {
  try {
    // Ensure at least one milestone exists (default single milestone = 100%)
    if (!Array.isArray(this.milestones) || this.milestones.length === 0) {
      this.milestones = [
        {
          plan: {
            title: 'Final delivery',
            description: '',
            percent: 100,
            expectedDuration: this.expectedDuration || '1-2 weeks',
          },
          state: { status: 'unfunded', fundedAmount: 0 },
        },
      ];
    }

    // Percent totals must equal 100
    const percents = this.milestones.map((m) => Number(m?.plan?.percent || 0));
    const sum = percents.reduce((a, b) => a + b, 0);
    const roundedSum = Math.round(sum * 100) / 100;
    if (roundedSum !== 100) {
      return next(
        AppError.badRequest(
          `Milestone percents must total 100. Current total is ${roundedSum}`,
          'CONTRACT_MILESTONE_PERCENT_TOTAL_INVALID'
        )
      );
    }

    // Enforce unique milestone titles (case-insensitive) for clarity
    const titleSet = new Set();
    for (const m of this.milestones) {
      const title = (m?.plan?.title || '').trim().toLowerCase();
      if (!title) {
        return next(
          AppError.badRequest(
            'Milestone title is required',
            'CONTRACT_MILESTONE_TITLE_REQUIRED'
          )
        );
      }
      if (titleSet.has(title)) {
        return next(
          AppError.badRequest(
            `Duplicate milestone title "${m.plan.title}"`,
            'CONTRACT_MILESTONE_DUPLICATE_TITLE'
          )
        );
      }
      titleSet.add(title);
    }

    // Compute milestone amounts from percents
    const total = roundMoney(this.totalAmount);
    this.totalAmount = total;
    for (const m of this.milestones) {
      // Default milestone duration to contract duration if missing
      if (!m.plan) m.plan = {};
      if (!m.plan.expectedDuration) {
        m.plan.expectedDuration = this.expectedDuration || '1-2 weeks';
      }
      if (m.plan.expectedDuration && !DURATION_OPTIONS.includes(m.plan.expectedDuration)) {
        return next(
          AppError.badRequest(
            `Milestone "${m.plan.title}" has invalid expected duration`,
            'CONTRACT_MILESTONE_DURATION_INVALID'
          )
        );
      }

      const pct = Number(m?.plan?.percent || 0);
      const amount = roundMoney((total * pct) / 100);
      if (!m.state) m.state = {};
      m.state.amount = amount;
      m.state.fundedAmount = roundMoney(m.state.fundedAmount || 0);
      if (m.state.fundedAmount > amount + 0.0001) {
        return next(
          AppError.badRequest(
            `Milestone "${m.plan.title}" funded amount cannot exceed its amount`,
            'CONTRACT_MILESTONE_FUNDED_EXCEEDS_AMOUNT'
          )
        );
      }
    }

    // Keep an up-to-date contract hash of current terms
    this.currentContractHash = computeContractHash(this);

    next();
  } catch (err) {
    next(err);
  }
});

// Auto-bump version + clear signatures if terms changed pre-sign
contractSchema.pre('save', function (next) {
  try {
    this.updatedAt = Date.now();
    if (didTermsChange(this)) {
      this.lastEditedAt = Date.now();

      // Only allow edits pre-signature; if already signed, controller should block
      if (this.status === 'draft' || this.status === 'pending_signatures') {
        const hadAnySignature = !!(this.clientSignature?.signedAt || this.studentSignature?.signedAt);
        this.version = (this.version || 0) + 1;

        // Changing terms invalidates signatures
        this.clientSignature = null;
        this.studentSignature = null;
        this.signedAt = null;

        // Keep status pending if it was already shared
        if (hadAnySignature && this.status === 'draft') {
          this.status = 'pending_signatures';
        }
      }
    }
    next();
  } catch (err) {
    next(err);
  }
});

// Populate for convenience
contractSchema.pre(/^find/, function (next) {
  this.populate([
    { path: 'client', select: 'name email phone role clientProfile location' },
    { path: 'student', select: 'name email phone role studentProfile location' },
    { path: 'jobPost', select: 'title category budget deadline status client categorySpecRequirements' },
    { path: 'pendingConfirmation.updatedBy', select: 'name email role' },
    { path: 'pendingConfirmation.confirmedBy', select: 'name email role' },
    { path: 'changeLog.updatedBy', select: 'name email role' },
    { path: 'changeLog.confirmedBy', select: 'name email role' },
  ]);
  next();
});

// Indexes
contractSchema.index({ client: 1, createdAt: -1 });
contractSchema.index({ student: 1, createdAt: -1 });
contractSchema.index({ jobPost: 1 });
contractSchema.index({ status: 1 });

const Contract = mongoose.model('Contract', contractSchema);

module.exports = {
  Contract,
  CONTRACT_STATUSES,
  MILESTONE_STATUSES,
  computeContractHash,
};

