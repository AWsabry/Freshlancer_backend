const express = require('express');
const contractController = require('../controllers/contractController');
const authController = require('../controllers/auth/authController');

const router = express.Router();

// Protect all routes after this middleware
router.use(authController.protect);
// Require email verification
router.use(authController.requireEmailVerification);

router.get('/me', contractController.getMyContracts);

router.post(
  '/from-application/:applicationId',
  authController.restrictTo('client'),
  contractController.createFromApplication
);

router
  .route('/:id')
  .get(contractController.getContract)
  .patch(contractController.updateContract);

router.post('/:id/sign', contractController.signContract);
router.post('/:id/confirm-changes', contractController.confirmContractChanges);

router.post(
  '/:id/milestones/:milestoneId/fund',
  authController.restrictTo('client'),
  contractController.fundMilestone
);
router.post(
  '/:id/milestones/:milestoneId/submit',
  authController.restrictTo('student'),
  contractController.submitMilestone
);
router.post(
  '/:id/milestones/:milestoneId/approve',
  authController.restrictTo('client'),
  contractController.approveMilestone
);

router.post(
  '/:id/complete-after-appeal',
  authController.restrictTo('client'),
  contractController.completeContractAfterAppeal
);

router.post(
  '/:id/cancel-after-appeal',
  authController.restrictTo('client'),
  contractController.cancelContractAfterAppeal
);

module.exports = router;

