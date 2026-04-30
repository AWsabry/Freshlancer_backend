const multer = require('multer');
const AppError = require('../utils/AppError');

const memoryStorage = multer.memoryStorage();

// Allow common attachment types: pdf/docs/images/zip/plain
const emailFileFilter = (req, file, cb) => {
  const allowedMimeTypes = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
    'application/x-zip-compressed',
    'text/plain',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
  ]);

  if (allowedMimeTypes.has(file.mimetype)) {
    return cb(null, true);
  }

  return cb(
    new AppError(
      'Invalid file type. Allowed: PDF, DOC/DOCX, XLS/XLSX, ZIP, TXT, and common images (JPG/PNG/GIF/WEBP).',
      400
    ),
    false
  );
};

const uploadAdminEmail = multer({
  storage: memoryStorage,
  fileFilter: emailFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
    files: 20,
  },
}).fields([
  { name: 'attachments', maxCount: 10 },
  { name: 'inlineImages', maxCount: 10 },
]);

module.exports = {
  uploadAdminEmail,
};

