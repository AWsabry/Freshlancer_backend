const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth/authController');
const appealController = require('../controllers/appealController');
const { uploadAppealDocument } = require('../middleware/upload');
const { uploadWithErrorHandling } = require('../middleware/uploadErrorHandler');

// Protect all routes
router.use(authController.protect);
router.use(authController.requireEmailVerification);

// User routes
router.post('/', appealController.createAppeal);
router.get('/me', appealController.getMyAppeals);
router.get('/:id', appealController.getAppeal);
router.post(
  '/:id/documents',
  uploadWithErrorHandling(uploadAppealDocument.single('document')),
  appealController.uploadDocument
);
router.post('/:id/messages', appealController.sendMessage);
router.post('/:id/close', appealController.closeAppeal);
router.post('/:id/cancel-contract', appealController.cancelContract);

module.exports = router;
