const express = require('express');
const authController = require('../controllers/auth/authController');
const cvReviewController = require('../controllers/cvReviewController');
const { uploadCvForReview } = require('../middleware/cvReviewUpload');
const { uploadWithErrorHandling } = require('../middleware/uploadErrorHandler');

const router = express.Router();

// Guest init: upload CV + target fields, returns uploadId
router.post(
  '/guest/init',
  uploadWithErrorHandling(uploadCvForReview.single('cv')),
  cvReviewController.guestInit
);

// Auth-required routes
router.use(authController.protect);

router.post('/attach', cvReviewController.attachToUser);

// Process requires email verification
router.post('/process', authController.requireEmailVerification, cvReviewController.process);

router.get('/:uploadId', cvReviewController.getSession);

module.exports = router;

