const path = require('path');
const crypto = require('crypto');
const CvReviewSession = require('../models/cvReviewSessionModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { extractTextFromCv } = require('../services/cvAnalysis/extractTextFromCv');
const { inferCvStructure } = require('../services/cvAnalysis/inferCvStructure');
const { analyzeCvRules } = require('../services/cvAnalysis/analyzeCvRules');

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const normalizeTargetFields = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).map((s) => s.trim()).filter(Boolean);
  // Accept JSON array or comma separated
  const str = String(raw).trim();
  if (!str) return [];
  try {
    const parsed = JSON.parse(str);
    if (Array.isArray(parsed)) return parsed.map(String).map((s) => s.trim()).filter(Boolean);
  } catch (_) {
    // ignore
  }
  return str
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};

exports.guestInit = catchAsync(async (req, res, next) => {
  if (!req.file) return next(new AppError('Please upload a CV file.', 400));

  const uploadId = crypto.randomBytes(16).toString('hex');
  const targetFields = normalizeTargetFields(req.body.targetFields);

  const session = await CvReviewSession.create({
    uploadId,
    user: null,
    status: 'uploaded',
    file: {
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      path: path.resolve(req.file.path),
    },
    targetFields,
    expiresAt: new Date(Date.now() + THIRTY_DAYS_MS),
  });

  res.status(201).json({
    status: 'success',
    data: {
      uploadId: session.uploadId,
    },
  });
});

exports.attachToUser = catchAsync(async (req, res, next) => {
  const uploadId = String(req.body.uploadId || '').trim();
  if (!uploadId) return next(new AppError('uploadId is required.', 400));

  const session = await CvReviewSession.findOne({ uploadId });
  if (!session) return next(new AppError('CV review session not found.', 404));

  // If already claimed by someone else, block.
  if (session.user && session.user.toString() !== req.user._id.toString()) {
    return next(new AppError('This CV review session belongs to another user.', 403));
  }

  session.user = req.user._id;
  session.status = req.user.emailVerified ? session.status : 'pending_verification';
  await session.save();

  res.status(200).json({
    status: 'success',
    data: {
      uploadId: session.uploadId,
      status: session.status,
    },
  });
});

exports.process = catchAsync(async (req, res, next) => {
  const uploadId = String(req.body.uploadId || '').trim();
  if (!uploadId) return next(new AppError('uploadId is required.', 400));

  const session = await CvReviewSession.findOne({ uploadId });
  if (!session) return next(new AppError('CV review session not found.', 404));
  if (!session.user || session.user.toString() !== req.user._id.toString()) {
    return next(new AppError('You do not have access to this CV review session.', 403));
  }

  // Email verification is enforced by middleware, but keep a defensive check.
  if (!req.user.emailVerified) {
    session.status = 'pending_verification';
    await session.save();
    return next(new AppError('Please verify your email to process CV review.', 403));
  }

  try {
    session.status = 'processing';
    session.errorMessage = null;
    await session.save();

    const extractedText = await extractTextFromCv({
      filePath: session.file.path,
      mimeType: session.file.mimeType,
      originalName: session.file.originalName,
      maxChars: 45000,
    });

    const structure = inferCvStructure({ rawText: extractedText });
    const analysis = analyzeCvRules({
      rawText: extractedText,
      structure,
      targetFields: session.targetFields,
      locale: 'en',
    });

    session.extractedText = extractedText;
    session.structure = structure;
    session.analysis = analysis;
    session.status = 'completed';
    await session.save();

    res.status(200).json({
      status: 'success',
      data: {
        uploadId: session.uploadId,
        status: session.status,
        targetFields: session.targetFields,
        analysis: session.analysis,
      },
    });
  } catch (e) {
    logger.error('CV review processing failed', { error: e.message, uploadId });
    session.status = 'failed';
    session.errorMessage = e.message;
    await session.save();
    // In development, return the upstream error message to make debugging easy.
    const devHint =
      process.env.NODE_ENV === 'development' ? ` (${e.message})` : '';
    return next(new AppError(`Failed to process CV review. Please try again later.${devHint}`, 500));
  }
});

exports.getSession = catchAsync(async (req, res, next) => {
  const uploadId = String(req.params.uploadId || '').trim();
  const session = await CvReviewSession.findOne({ uploadId }).lean();
  if (!session) return next(new AppError('CV review session not found.', 404));

  if (!session.user || session.user.toString() !== req.user._id.toString()) {
    return next(new AppError('You do not have access to this CV review session.', 403));
  }

  res.status(200).json({
    status: 'success',
    data: {
      session,
    },
  });
});

