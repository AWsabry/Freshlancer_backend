const fs = require('fs').promises;
const path = require('path');
const EducationEntity = require('../models/educationEntityModel');
const EducationCertificate = require('../models/educationCertificateModel');
const Category = require('../models/categoryModel');
const StudentEducationAward = require('../models/studentEducationAwardModel');
const EducationBadgeRequest = require('../models/educationBadgeRequestModel');
const User = require('../models/userModel');
const Notification = require('../models/notificationModel');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const sendEmail = require('../utils/email');
const logger = require('../utils/logger');
const { getFrontendUrl } = require('../utils/helpers');
const {
  buildEducationAssetUrl,
  slugify,
  groupAwardsByEntity,
  serializeProofDocument,
} = require('../utils/educationBadgeHelpers');

async function removeProofFileFromDisk(proof) {
  if (!proof?.url) return;
  const relative = proof.url.replace(/^\//, '');
  const fullPath = path.join(process.cwd(), relative);
  try {
    await fs.unlink(fullPath);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

function formatBadgeRequest(row) {
  const obj = row.toObject ? row.toObject() : row;
  return {
    ...obj,
    proofDocument: serializeProofDocument(obj.proofDocument),
    hasProof: !!(obj.proofDocument && obj.proofDocument.url),
  };
}

async function loadStudentAward(awardId, studentId) {
  const award = await StudentEducationAward.findOne({
    _id: awardId,
    student: studentId,
  });
  return award;
}

const certificatePopulate = {
  path: 'certificate',
  select: 'title track imageUrl description entity category',
  populate: { path: 'category', select: 'name' },
};

const populateAwardQuery = (query) =>
  query.populate('entity', 'name slug logoUrl description website').populate(certificatePopulate).sort('-awardedAt');

async function resolveOptionalCategoryId(raw) {
  if (raw === undefined) return undefined;
  const id = String(raw || '').trim();
  if (!id || id === 'null' || id === 'none') return null;
  const cat = await Category.findById(id);
  if (!cat) throw new AppError('Category not found', 404);
  return cat._id;
}

async function loadCertificateForGrant(certificateId) {
  const cert = await EducationCertificate.findById(certificateId).populate(
    'entity',
    'name isActive'
  );
  if (!cert) {
    throw new AppError('Certificate not found', 404);
  }
  if (!cert.isActive || !cert.entity?.isActive) {
    throw new AppError('Certificate or partner is not active', 400);
  }
  return cert;
}

async function resolveStudentRecipient(studentOrId) {
  if (studentOrId && typeof studentOrId === 'object' && studentOrId.email) {
    return studentOrId;
  }
  if (!studentOrId) return null;
  return User.findById(studentOrId).select('name email');
}

function sendEducationBadgeGrantedEmail(student, entityName, certificateTitle, track) {
  const dashboardUrl = `${getFrontendUrl()}/student/education-badges`;
  sendEmail({
    type: 'education-badge-granted',
    email: student.email,
    name: student.name,
    entityName,
    certificateTitle,
    track: track || '',
    dashboardUrl,
  }).catch((err) => {
    logger.error('Failed to send education badge granted email', {
      error: err.message,
      email: student.email,
    });
  });
}

function sendEducationBadgeRevokedEmail(student, entityName, certificateTitle, track) {
  const dashboardUrl = `${getFrontendUrl()}/student/profile`;
  sendEmail({
    type: 'education-badge-revoked',
    email: student.email,
    name: student.name,
    entityName,
    certificateTitle,
    track: track || '',
    dashboardUrl,
  }).catch((err) => {
    logger.error('Failed to send education badge revoked email', {
      error: err.message,
      email: student.email,
    });
  });
}

async function notifyStudentBadgeGranted(
  studentOrId,
  entityName,
  certificateTitle,
  track,
  awardId
) {
  const student = await resolveStudentRecipient(studentOrId);
  if (!student) return;

  try {
    await Notification.create({
      user: student._id,
      type: 'education_badge_granted',
      title: 'Education badge awarded',
      message: `You received "${certificateTitle}" from ${entityName}.`,
      relatedId: awardId || undefined,
      relatedType: awardId ? 'StudentEducationAward' : undefined,
      priority: 'high',
      icon: 'success',
      channels: { inApp: true, email: true },
    });
  } catch (err) {
    logger.error('Failed to create education badge granted notification', {
      error: err.message,
      studentId: student._id,
    });
  }

  sendEducationBadgeGrantedEmail(student, entityName, certificateTitle, track);
}

async function notifyStudentBadgeRevoked(studentOrId, entityName, certificateTitle, track) {
  const student = await resolveStudentRecipient(studentOrId);
  if (!student) return;

  await Notification.create({
    user: student._id,
    type: 'education_badge_revoked',
    title: 'Education badge removed',
    message: `"${certificateTitle}" from ${entityName} was removed from your profile.`,
    relatedType: 'StudentEducationAward',
    priority: 'high',
    icon: 'warning',
    channels: { inApp: true, email: true },
  });

  sendEducationBadgeRevokedEmail(student, entityName, certificateTitle, track);
}

// ——— Admin: entities ———

exports.getAllEntities = catchAsync(async (req, res) => {
  const filter = {};
  if (req.query.isActive !== undefined) {
    filter.isActive = req.query.isActive === 'true';
  }

  const entities = await EducationEntity.find(filter).sort({ sortOrder: 1, name: 1 });

  const certCounts = await EducationCertificate.aggregate([
    { $match: { entity: { $in: entities.map((e) => e._id) } } },
    { $group: { _id: '$entity', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(certCounts.map((c) => [c._id.toString(), c.count]));

  const data = entities.map((e) => ({
    ...e.toObject(),
    certificateCount: countMap.get(e._id.toString()) || 0,
  }));

  res.status(200).json({
    status: 'success',
    results: data.length,
    data: { entities: data },
  });
});

exports.getEntity = catchAsync(async (req, res, next) => {
  const entity = await EducationEntity.findById(req.params.id);
  if (!entity) return next(new AppError('Education entity not found', 404));

  const certificates = await EducationCertificate.find({ entity: entity._id })
    .populate('category', 'name description isActive')
    .sort({
      sortOrder: 1,
      title: 1,
    });

  res.status(200).json({
    status: 'success',
    data: { entity, certificates },
  });
});

exports.createEntity = catchAsync(async (req, res, next) => {
  const name = req.body.name?.trim();
  if (!name) return next(new AppError('Partner name is required', 400));

  let slug = slugify(req.body.slug || name);
  const existing = await EducationEntity.findOne({ slug });
  if (existing) {
    slug = `${slug}-${Date.now()}`;
  }

  let logoUrl = req.body.logoUrl || '';
  if (req.file) {
    logoUrl = buildEducationAssetUrl(req, 'education-logos', req.file.filename);
  }

  const entity = await EducationEntity.create({
    name,
    slug,
    logoUrl,
    description: req.body.description,
    website: req.body.website,
    isActive: req.body.isActive !== 'false' && req.body.isActive !== false,
    sortOrder: Number(req.body.sortOrder) || 0,
    createdBy: req.user._id,
  });

  res.status(201).json({ status: 'success', data: { entity } });
});

exports.updateEntity = catchAsync(async (req, res, next) => {
  const entity = await EducationEntity.findById(req.params.id);
  if (!entity) return next(new AppError('Education entity not found', 404));

  if (req.body.name) entity.name = req.body.name.trim();
  if (req.body.description !== undefined) entity.description = req.body.description;
  if (req.body.website !== undefined) entity.website = req.body.website;
  if (req.body.sortOrder !== undefined) entity.sortOrder = Number(req.body.sortOrder) || 0;
  if (req.body.isActive !== undefined) {
    entity.isActive = req.body.isActive !== 'false' && req.body.isActive !== false;
  }
  if (req.body.slug) {
    const slug = slugify(req.body.slug);
    const clash = await EducationEntity.findOne({ slug, _id: { $ne: entity._id } });
    if (clash) return next(new AppError('Slug already in use', 400));
    entity.slug = slug;
  }
  if (req.file) {
    entity.logoUrl = buildEducationAssetUrl(req, 'education-logos', req.file.filename);
  } else if (req.body.logoUrl !== undefined) {
    entity.logoUrl = req.body.logoUrl;
  }

  await entity.save();

  res.status(200).json({ status: 'success', data: { entity } });
});

exports.deleteEntity = catchAsync(async (req, res, next) => {
  const entity = await EducationEntity.findById(req.params.id);
  if (!entity) return next(new AppError('Education entity not found', 404));

  const awardCount = await StudentEducationAward.countDocuments({ entity: entity._id });
  if (awardCount > 0) {
    return next(
      new AppError(
        'Cannot delete entity with existing student awards. Deactivate it instead.',
        400
      )
    );
  }

  await EducationCertificate.deleteMany({ entity: entity._id });
  await EducationEntity.findByIdAndDelete(entity._id);

  res.status(204).json({ status: 'success', data: null });
});

// ——— Admin: certificates ———

exports.createCertificate = catchAsync(async (req, res, next) => {
  const entity = await EducationEntity.findById(req.params.id);
  if (!entity) return next(new AppError('Education entity not found', 404));

  const title = req.body.title?.trim();
  const track = req.body.track?.trim();
  if (!title || !track) {
    return next(new AppError('Title and track are required', 400));
  }

  let imageUrl = req.body.imageUrl || '';
  if (req.file) {
    imageUrl = buildEducationAssetUrl(req, 'education-certificates', req.file.filename);
  }

  const categoryId = await resolveOptionalCategoryId(req.body.categoryId ?? '');

  const certificate = await EducationCertificate.create({
    entity: entity._id,
    title,
    track,
    imageUrl,
    description: req.body.description,
    category: categoryId,
    isActive: req.body.isActive !== 'false' && req.body.isActive !== false,
    sortOrder: Number(req.body.sortOrder) || 0,
  });

  await certificate.populate('category', 'name description isActive');

  res.status(201).json({ status: 'success', data: { certificate } });
});

exports.updateCertificate = catchAsync(async (req, res, next) => {
  const certificate = await EducationCertificate.findById(req.params.id);
  if (!certificate) return next(new AppError('Certificate not found', 404));

  if (req.body.title) certificate.title = req.body.title.trim();
  if (req.body.track) certificate.track = req.body.track.trim();
  if (req.body.description !== undefined) certificate.description = req.body.description;
  if (req.body.sortOrder !== undefined) certificate.sortOrder = Number(req.body.sortOrder) || 0;
  if (req.body.isActive !== undefined) {
    certificate.isActive = req.body.isActive !== 'false' && req.body.isActive !== false;
  }
  if (req.body.categoryId !== undefined) {
    certificate.category = await resolveOptionalCategoryId(req.body.categoryId);
  }
  if (req.file) {
    certificate.imageUrl = buildEducationAssetUrl(
      req,
      'education-certificates',
      req.file.filename
    );
  } else if (req.body.imageUrl !== undefined) {
    certificate.imageUrl = req.body.imageUrl;
  }

  await certificate.save();
  await certificate.populate('category', 'name description isActive');

  res.status(200).json({ status: 'success', data: { certificate } });
});

exports.deleteCertificate = catchAsync(async (req, res, next) => {
  const certificate = await EducationCertificate.findById(req.params.id);
  if (!certificate) return next(new AppError('Certificate not found', 404));

  const awardCount = await StudentEducationAward.countDocuments({
    certificate: certificate._id,
  });
  if (awardCount > 0) {
    return next(
      new AppError(
        'Cannot delete certificate with existing awards. Deactivate it instead.',
        400
      )
    );
  }

  await EducationCertificate.findByIdAndDelete(certificate._id);

  res.status(204).json({ status: 'success', data: null });
});

// ——— Admin: bulk grant ———

exports.grantBulk = catchAsync(async (req, res, next) => {
  const { emails, certificateId, awardedAt } = req.body;

  if (!certificateId) return next(new AppError('certificateId is required', 400));
  if (!Array.isArray(emails) || emails.length === 0) {
    return next(new AppError('emails array is required', 400));
  }

  const cert = await loadCertificateForGrant(certificateId);
  const normalized = [
    ...new Set(
      emails
        .map((e) => String(e).trim().toLowerCase())
        .filter(Boolean)
    ),
  ];

  const results = [];

  const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  for (const email of normalized) {
    const student = await User.findOne({
      email: { $regex: new RegExp(`^${escapeRegex(email)}$`, 'i') },
      role: 'student',
      active: { $ne: false },
    });

    if (!student) {
      results.push({ email, status: 'not_found' });
      continue;
    }

    const existing = await StudentEducationAward.findOne({
      student: student._id,
      certificate: cert._id,
    });

    if (existing) {
      results.push({ email, status: 'already_awarded', studentId: student._id });
      continue;
    }

    try {
      const award = await StudentEducationAward.create({
        student: student._id,
        entity: cert.entity._id,
        certificate: cert._id,
        awardedAt: awardedAt ? new Date(awardedAt) : new Date(),
        source: 'admin_grant',
        grantedBy: req.user._id,
      });

      await notifyStudentBadgeGranted(
        student,
        cert.entity.name,
        cert.title,
        cert.track,
        award._id
      );

      results.push({ email, status: 'granted', studentId: student._id, awardId: award._id });
    } catch (err) {
      if (err.code === 11000) {
        results.push({ email, status: 'already_awarded', studentId: student._id });
      } else {
        results.push({ email, status: 'error', message: err.message });
      }
    }
  }

  res.status(200).json({
    status: 'success',
    data: {
      summary: {
        total: normalized.length,
        granted: results.filter((r) => r.status === 'granted').length,
        not_found: results.filter((r) => r.status === 'not_found').length,
        already_awarded: results.filter((r) => r.status === 'already_awarded').length,
        errors: results.filter((r) => r.status === 'error').length,
      },
      results,
    },
  });
});

exports.searchStudents = catchAsync(async (req, res) => {
  const filter = { role: 'student', active: { $ne: false } };

  if (req.query.search) {
    const q = req.query.search.trim();
    filter.$or = [
      { name: { $regex: q, $options: 'i' } },
      { email: { $regex: q, $options: 'i' } },
    ];
  }

  const students = await User.find(filter)
    .select('name email photo studentProfile.isVerified')
    .limit(30)
    .sort({ name: 1 });

  res.status(200).json({
    status: 'success',
    results: students.length,
    data: { students },
  });
});

// ——— Admin: requests ———

exports.getAdminRequests = catchAsync(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;

  const requests = await EducationBadgeRequest.find(filter)
    .populate('student', 'name email photo')
    .populate('entity', 'name logoUrl slug')
    .populate('certificate', 'title track imageUrl')
    .populate('reviewedBy', 'name email')
    .sort('-createdAt')
    .limit(100);

  res.status(200).json({
    status: 'success',
    results: requests.length,
    data: { requests: requests.map(formatBadgeRequest) },
  });
});

exports.approveRequest = catchAsync(async (req, res, next) => {
  const request = await EducationBadgeRequest.findById(req.params.id)
    .populate('entity', 'name')
    .populate('certificate', 'title track entity');

  if (!request) return next(new AppError('Request not found', 404));
  if (request.status !== 'pending') {
    return next(new AppError(`Request is already ${request.status}`, 400));
  }

  const existing = await StudentEducationAward.findOne({
    student: request.student,
    certificate: request.certificate._id,
  });
  if (existing) {
    request.status = 'approved';
    request.reviewedBy = req.user._id;
    request.reviewedAt = Date.now();
    request.adminNotes = req.body.adminNotes;
    await request.save();
    return res.status(200).json({
      status: 'success',
      message: 'Student already has this certificate; request marked approved',
      data: { request },
    });
  }

  const awardPayload = {
    student: request.student,
    entity: request.entity._id,
    certificate: request.certificate._id,
    awardedAt: new Date(),
    source: 'request_approved',
    grantedBy: req.user._id,
    request: request._id,
  };

  if (request.proofDocument?.url) {
    awardPayload.proofDocument = {
      filename: request.proofDocument.filename,
      url: request.proofDocument.url,
      mimeType: request.proofDocument.mimeType,
      uploadedAt: request.proofDocument.uploadedAt || new Date(),
    };
  }

  const award = await StudentEducationAward.create(awardPayload);

  request.status = 'approved';
  request.reviewedBy = req.user._id;
  request.reviewedAt = Date.now();
  request.adminNotes = req.body.adminNotes;
  await request.save();

  const student = await User.findById(request.student).select('name email');
  if (student) {
    await notifyStudentBadgeGranted(
      student,
      request.entity.name,
      request.certificate.title,
      request.certificate.track,
      award._id
    );
  }

  res.status(200).json({ status: 'success', data: { request, award } });
});

exports.rejectRequest = catchAsync(async (req, res, next) => {
  const request = await EducationBadgeRequest.findById(req.params.id)
    .populate('entity', 'name')
    .populate('certificate', 'title');

  if (!request) return next(new AppError('Request not found', 404));
  if (request.status !== 'pending') {
    return next(new AppError(`Request is already ${request.status}`, 400));
  }

  if (!req.body.rejectionReason?.trim()) {
    return next(new AppError('Rejection reason is required', 400));
  }

  request.status = 'rejected';
  request.rejectionReason = req.body.rejectionReason.trim();
  request.adminNotes = req.body.adminNotes;
  request.reviewedBy = req.user._id;
  request.reviewedAt = Date.now();
  await request.save();

  await Notification.create({
    user: request.student,
    type: 'education_badge_request_rejected',
    title: 'Badge request rejected',
    message: `Your request for "${request.certificate.title}" was rejected: ${request.rejectionReason}`,
    relatedId: request._id,
    relatedType: 'EducationBadgeRequest',
    priority: 'high',
    icon: 'error',
    channels: { inApp: true, email: false },
  });

  res.status(200).json({ status: 'success', data: { request } });
});

// ——— Student ———

exports.getCatalog = catchAsync(async (req, res) => {
  const entities = await EducationEntity.find({ isActive: true }).sort({
    sortOrder: 1,
    name: 1,
  });

  const entityIds = entities.map((e) => e._id);
  const certificates = await EducationCertificate.find({
    entity: { $in: entityIds },
    isActive: true,
  })
    .populate('category', 'name')
    .sort({ sortOrder: 1, title: 1 });

  const byEntity = entities.map((entity) => ({
    ...entity.toObject(),
    certificates: certificates
      .filter((c) => c.entity.toString() === entity._id.toString())
      .map((c) => ({
        _id: c._id,
        title: c.title,
        track: c.track,
        imageUrl: c.imageUrl,
        description: c.description,
        category: c.category
          ? { _id: c.category._id, name: c.category.name }
          : null,
      })),
  }));

  res.status(200).json({
    status: 'success',
    data: { entities: byEntity },
  });
});

exports.getMyAwards = catchAsync(async (req, res) => {
  const awards = await populateAwardQuery(
    StudentEducationAward.find({ student: req.user._id })
  );

  const entities = groupAwardsByEntity(awards);

  res.status(200).json({
    status: 'success',
    results: entities.length,
    data: { entities },
  });
});

exports.getMyEntityAwards = catchAsync(async (req, res, next) => {
  const entity = await EducationEntity.findById(req.params.entityId);
  if (!entity) return next(new AppError('Education entity not found', 404));

  const awards = await populateAwardQuery(
    StudentEducationAward.find({
      student: req.user._id,
      entity: entity._id,
    })
  );

  if (awards.length === 0) {
    return next(new AppError('You have no badges from this partner', 404));
  }

  const grouped = groupAwardsByEntity(awards);

  res.status(200).json({
    status: 'success',
    data: grouped[0],
  });
});

exports.createRequest = catchAsync(async (req, res, next) => {
  const entityId = req.body.entityId;
  const certificateId = req.body.certificateId;
  const studentNote = req.body.studentNote;
  if (!entityId || !certificateId) {
    return next(new AppError('entityId and certificateId are required', 400));
  }

  const cert = await EducationCertificate.findById(certificateId).populate('entity');
  if (!cert || !cert.isActive || !cert.entity?.isActive) {
    return next(new AppError('Certificate not available', 404));
  }
  if (cert.entity._id.toString() !== entityId) {
    return next(new AppError('Certificate does not belong to this entity', 400));
  }

  const existingAward = await StudentEducationAward.findOne({
    student: req.user._id,
    certificate: cert._id,
  });
  if (existingAward) {
    return next(new AppError('You already have this certificate', 400));
  }

  const pending = await EducationBadgeRequest.findOne({
    student: req.user._id,
    certificate: cert._id,
    status: 'pending',
  });
  if (pending) {
    return next(new AppError('You already have a pending request for this certificate', 400));
  }

  const requestPayload = {
    student: req.user._id,
    entity: cert.entity._id,
    certificate: cert._id,
    studentNote: studentNote?.trim() || undefined,
    status: 'pending',
  };

  if (req.file) {
    requestPayload.proofDocument = {
      filename: req.file.originalname,
      url: `/uploads/education-request-proofs/${req.file.filename}`,
      mimeType: req.file.mimetype,
      uploadedAt: new Date(),
    };
  }

  const request = await EducationBadgeRequest.create(requestPayload);

  const populated = await EducationBadgeRequest.findById(request._id)
    .populate('entity', 'name logoUrl')
    .populate('certificate', 'title track imageUrl');

  res.status(201).json({
    status: 'success',
    data: { request: formatBadgeRequest(populated) },
  });
});

exports.getMyRequests = catchAsync(async (req, res, next) => {
  const requests = await EducationBadgeRequest.find({ student: req.user._id })
    .populate('entity', 'name logoUrl slug')
    .populate('certificate', 'title track imageUrl')
    .sort('-createdAt');

  res.status(200).json({
    status: 'success',
    results: requests.length,
    data: { requests: requests.map(formatBadgeRequest) },
  });
});

// ——— Student: certificate proof ———

exports.uploadAwardProof = catchAsync(async (req, res, next) => {
  if (!req.file) return next(new AppError('Please upload a proof document', 400));

  const award = await loadStudentAward(req.params.awardId, req.user._id);
  if (!award) return next(new AppError('Award not found', 404));

  if (award.proofDocument?.url) {
    await removeProofFileFromDisk(award.proofDocument);
  }

  const filePath = `/uploads/education-certificate-proofs/${req.file.filename}`;
  award.proofDocument = {
    filename: req.file.originalname,
    url: filePath,
    mimeType: req.file.mimetype,
    uploadedAt: new Date(),
  };
  await award.save();

  res.status(200).json({
    status: 'success',
    data: {
      awardId: award._id,
      proofDocument: serializeProofDocument(award.proofDocument),
      hasProof: true,
    },
  });
});

exports.deleteAwardProof = catchAsync(async (req, res, next) => {
  const award = await loadStudentAward(req.params.awardId, req.user._id);
  if (!award) return next(new AppError('Award not found', 404));

  if (award.proofDocument?.url) {
    await removeProofFileFromDisk(award.proofDocument);
  }

  award.proofDocument = undefined;
  award.markModified('proofDocument');
  await award.save();

  res.status(200).json({
    status: 'success',
    data: { awardId: award._id, proofDocument: null, hasProof: false },
  });
});

// ——— Admin: awards & proof ———

exports.getAdminAwards = catchAsync(async (req, res) => {
  const filter = {};

  if (req.query.entityId) filter.entity = req.query.entityId;
  if (req.query.certificateId) filter.certificate = req.query.certificateId;
  if (req.query.hasProof === 'true') filter['proofDocument.url'] = { $exists: true, $ne: '' };
  if (req.query.hasProof === 'false') {
    filter.$or = [
      { proofDocument: { $exists: false } },
      { 'proofDocument.url': { $exists: false } },
      { 'proofDocument.url': '' },
      { 'proofDocument.url': null },
    ];
  }

  let awards = await StudentEducationAward.find(filter)
    .populate('student', 'name email photo')
    .populate('entity', 'name slug logoUrl')
    .populate('certificate', 'title track imageUrl')
    .sort('-awardedAt')
    .limit(Math.min(Number(req.query.limit) || 100, 200));

  if (req.query.search) {
    const q = req.query.search.trim().toLowerCase();
    awards = awards.filter((row) => {
      const email = row.student?.email?.toLowerCase() || '';
      const name = row.student?.name?.toLowerCase() || '';
      return email.includes(q) || name.includes(q);
    });
  }

  const data = awards.map((row) => ({
    _id: row._id,
    awardedAt: row.awardedAt,
    source: row.source,
    student: row.student,
    entity: row.entity,
    certificate: row.certificate,
    proofDocument: serializeProofDocument(row.proofDocument),
    hasProof: !!(row.proofDocument && row.proofDocument.url),
  }));

  res.status(200).json({
    status: 'success',
    results: data.length,
    data: { awards: data },
  });
});

exports.deleteAdminAwardProof = catchAsync(async (req, res, next) => {
  const award = await StudentEducationAward.findById(req.params.id);
  if (!award) return next(new AppError('Award not found', 404));

  if (award.proofDocument?.url) {
    await removeProofFileFromDisk(award.proofDocument);
  }

  award.proofDocument = undefined;
  award.markModified('proofDocument');
  await award.save();

  res.status(200).json({
    status: 'success',
    data: { awardId: award._id, proofDocument: null, hasProof: false },
  });
});

exports.revokeAward = catchAsync(async (req, res, next) => {
  const award = await StudentEducationAward.findById(req.params.id)
    .populate('student', 'name email')
    .populate('entity', 'name')
    .populate('certificate', 'title track');
  if (!award) return next(new AppError('Award not found', 404));

  const student = award.student;
  const entityName = award.entity?.name || 'Education partner';
  const certificateTitle = award.certificate?.title || 'Certificate';
  const track = award.certificate?.track;

  if (award.proofDocument?.url) {
    await removeProofFileFromDisk(award.proofDocument);
  }

  await StudentEducationAward.findByIdAndDelete(award._id);

  if (student) {
    await notifyStudentBadgeRevoked(student, entityName, certificateTitle, track);
  }

  res.status(200).json({
    status: 'success',
    message: 'Badge revoked and removed from student profile',
    data: null,
  });
});
