const multer = require('multer');
const path = require('path');
const fs = require('fs');
const AppError = require('../utils/AppError');

// Ensure upload directories exist
const ensureUploadDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// Create upload directories if they don't exist
ensureUploadDir('uploads/resumes');
ensureUploadDir('uploads/verification-documents');
ensureUploadDir('uploads/additional-documents');
ensureUploadDir('uploads/startup-logos');
ensureUploadDir('uploads/photos');

// Configure multer storage for resumes
const resumeStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Store files in uploads directory
    cb(null, 'uploads/resumes');
  },
  filename: function (req, file, cb) {
    // Generate unique filename: userId-timestamp.extension
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `resume-${req.user.id}-${uniqueSuffix}${ext}`);
  },
});

// Configure multer storage for verification documents
const verificationStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/verification-documents');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `verification-${req.user.id}-${uniqueSuffix}${ext}`);
  },
});

// Configure multer storage for additional documents
const additionalDocumentStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/additional-documents');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `document-${req.user.id}-${uniqueSuffix}${ext}`);
  },
});

// Configure multer storage for startup logos
const startupLogoStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/startup-logos');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `logo-${req.user.id}-${uniqueSuffix}${ext}`);
  },
});

// Configure multer storage for user photos
const photoStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/photos');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `photo-${req.user.id}-${uniqueSuffix}${ext}`);
  },
});

// File filter for resumes - PDF and DOC files
const resumeFileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new AppError(
        'Invalid file type. Only PDF, DOC, and DOCX files are allowed.',
        400
      ),
      false
    );
  }
};

// File filter for verification documents - PDF and images
const verificationFileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new AppError(
        'Invalid file type. Only PDF, JPG, and PNG files are allowed.',
        400
      ),
      false
    );
  }
};

// File filter for additional documents - PDF, DOC, DOCX, and images
const additionalDocumentFileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/jpg',
    'image/png',
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new AppError(
        'Invalid file type. Only PDF, DOC, DOCX, JPG, and PNG files are allowed.',
        400
      ),
      false
    );
  }
};

// File filter for startup logos - images only
const startupLogoFileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new AppError(
        'Invalid file type. Only JPG, PNG, GIF, and WEBP images are allowed.',
        400
      ),
      false
    );
  }
};

// File filter for user photos - images only
const photoFileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new AppError(
        'Invalid file type. Only JPG, PNG, GIF, and WEBP images are allowed.',
        400
      ),
      false
    );
  }
};

// Create multer upload instance for resumes
const uploadResume = multer({
  storage: resumeStorage,
  fileFilter: resumeFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max file size
  },
});

// Create multer upload instance for verification documents
const uploadVerificationDocument = multer({
  storage: verificationStorage,
  fileFilter: verificationFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
  },
});

// Create multer upload instance for additional documents
const uploadAdditionalDocument = multer({
  storage: additionalDocumentStorage,
  fileFilter: additionalDocumentFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
  },
});

// Create multer upload instance for startup logos
const uploadStartupLogo = multer({
  storage: startupLogoStorage,
  fileFilter: startupLogoFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max file size
  },
});

// Create multer upload instance for user photos
const uploadPhoto = multer({
  storage: photoStorage,
  fileFilter: photoFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max file size
  },
});

module.exports = {
  uploadResume,
  uploadVerificationDocument,
  uploadAdditionalDocument,
  uploadStartupLogo,
  uploadPhoto,
};
