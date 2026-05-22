const mongoose = require('mongoose');

const studentEducationAwardSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: true,
    },
    entity: {
      type: mongoose.Schema.ObjectId,
      ref: 'EducationEntity',
      required: true,
    },
    certificate: {
      type: mongoose.Schema.ObjectId,
      ref: 'EducationCertificate',
      required: true,
    },
    awardedAt: {
      type: Date,
      default: Date.now,
    },
    source: {
      type: String,
      enum: ['admin_grant', 'request_approved'],
      required: true,
    },
    grantedBy: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
    },
    request: {
      type: mongoose.Schema.ObjectId,
      ref: 'EducationBadgeRequest',
    },
    proofDocument: {
      filename: String,
      url: String,
      mimeType: String,
      uploadedAt: Date,
    },
  },
  { timestamps: true }
);

studentEducationAwardSchema.index({ student: 1, certificate: 1 }, { unique: true });
studentEducationAwardSchema.index({ student: 1, entity: 1 });

const StudentEducationAward = mongoose.model(
  'StudentEducationAward',
  studentEducationAwardSchema
);

module.exports = StudentEducationAward;
