const multer = require('multer');
const path = require('path');
const fs = require('fs');
const AppError = require('../utils/AppError');

const ensureUploadDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'cv-review');
ensureUploadDir(UPLOAD_DIR);

const safeBasename = (name) => {
  const base = String(name || 'cv')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return base.length > 120 ? base.slice(-120) : base;
};

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const stamp = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname || '') || '';
    const base = safeBasename(path.basename(file.originalname || 'cv', ext));
    cb(null, `cv-${stamp}-${base}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]);
  if (allowed.has(file.mimetype)) return cb(null, true);
  return cb(
    new AppError('Invalid CV file type. Allowed: PDF, DOC, DOCX.', 400),
    false
  );
};

const uploadCvForReview = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

module.exports = {
  uploadCvForReview,
  CV_REVIEW_UPLOAD_DIR: UPLOAD_DIR,
};

