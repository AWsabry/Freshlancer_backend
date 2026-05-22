const express = require('express');
const educationBadgeController = require('../controllers/educationBadgeController');
const authController = require('../controllers/auth/authController');
const {
  uploadEducationAwardProof,
  uploadEducationRequestProof,
} = require('../middleware/upload');
const { uploadWithErrorHandling } = require('../middleware/uploadErrorHandler');

const router = express.Router();

router.use(authController.protect);
router.use(authController.requireEmailVerification);

router.get('/entities', educationBadgeController.getCatalog);

router.use(authController.restrictTo('student'));
router.get('/me', educationBadgeController.getMyAwards);
router.get('/me/entities/:entityId', educationBadgeController.getMyEntityAwards);
router.get('/requests/me', educationBadgeController.getMyRequests);
router.post(
  '/requests',
  uploadWithErrorHandling(uploadEducationRequestProof.single('proof')),
  educationBadgeController.createRequest
);
router.post(
  '/me/awards/:awardId/proof',
  uploadWithErrorHandling(uploadEducationAwardProof.single('proof')),
  educationBadgeController.uploadAwardProof
);
router.delete('/me/awards/:awardId/proof', educationBadgeController.deleteAwardProof);

module.exports = router;
