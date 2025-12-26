const AppError = require('./AppError');

/**
 * Get frontend URL based on environment
 * @returns {string} Frontend URL
 */
const getFrontendUrl = () => {
  return process.env.FRONTEND_URL || 
    (process.env.NODE_ENV === 'production' 
      ? 'https://freshlancer.online' 
      : 'http://localhost:3000');
};

/**
 * Handle email sending errors
 * @param {Object} user - User object
 * @param {Error} error - Error object
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next middleware
 * @param {string} message - Custom error message
 */
const handleEmailError = async (user, error, req, res, next, message) => {
  console.error('Error sending email:', {
    error: error.message,
    stack: error.stack,
    userId: user._id,
  });
  
  // Clear tokens
  if (user.emailVerificationToken !== undefined) {
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
  }
  if (user.passwordResetToken !== undefined) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
  }
  
  await user.save({ validateBeforeSave: false });

  return next(new AppError(
    message || 'There was an error sending the email. Try again later!', 
    500
  ));
};

/**
 * Delete file from filesystem (synchronous - legacy)
 * @param {string} filePath - Relative file path
 * @returns {boolean} Success status
 */
const deleteFile = (filePath) => {
  const fs = require('fs');
  const path = require('path');
  const fullPath = path.join(__dirname, '..', filePath);
  
  if (fs.existsSync(fullPath)) {
    try {
      fs.unlinkSync(fullPath);
      return true;
    } catch (error) {
      console.error('Error deleting file:', error);
      return false;
    }
  }
  return false;
};

/**
 * Safely delete a file with error handling and path validation (async)
 * @param {string} fileUrl - File URL from database (e.g., "/uploads/photos/photo-123.jpg")
 * @returns {Promise<boolean>} True if deleted, false if error or file doesn't exist
 */
const safeDeleteFile = async (fileUrl) => {
  if (!fileUrl) return false;

  const fs = require('fs').promises;
  const path = require('path');
  const logger = require('./logger');

  try {
    const filePath = path.join(__dirname, '..', fileUrl);
    const normalizedPath = path.normalize(filePath);
    const uploadsDir = path.join(__dirname, '..', 'uploads');

    // Validate path to prevent directory traversal
    if (!normalizedPath.startsWith(uploadsDir)) {
      logger.warn('Invalid file path detected, skipping deletion:', fileUrl);
      return false;
    }

    await fs.unlink(normalizedPath);
    return true;
  } catch (error) {
    // Don't crash if file doesn't exist
    if (error.code === 'ENOENT') {
      return false;
    }
    logger.error('Error deleting file:', { fileUrl, error: error.message });
    return false;
  }
};

/**
 * Check student verification status
 * @param {Object} student - Student user object
 * @returns {Object} Verification status object
 */
const checkStudentVerification = (student) => {
  return {
    isVerified: student.studentProfile?.isVerified === true,
    status: student.studentProfile?.verificationStatus || 'unverified',
    allowApplications: student.studentProfile?.allowJobApplications !== false
  };
};

/**
 * Capitalize first letter of string
 * @param {string} str - String to capitalize
 * @returns {string} Capitalized string
 */
const capitalizeFirst = (str) => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
};

/**
 * Clean and validate email
 * @param {string} email - Email to validate
 * @returns {string|null} Cleaned email or null if invalid
 */
const cleanEmail = (email) => {
  if (!email) return null;
  const cleaned = email.toLowerCase().trim();
  const validator = require('validator');
  return validator.isEmail(cleaned) ? cleaned : null;
};

module.exports = {
  getFrontendUrl,
  handleEmailError,
  deleteFile,
  safeDeleteFile,
  checkStudentVerification,
  capitalizeFirst,
  cleanEmail,
};

