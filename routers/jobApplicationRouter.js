const express = require('express');
const jobApplicationController = require('../controllers/jobApplicationController');
const authController = require('../controllers/auth/authController');

const router = express.Router();

// Protect all routes after this middleware
router.use(authController.protect);
// Require email verification
router.use(authController.requireEmailVerification);

// Routes for job applications
router.route('/').get(jobApplicationController.getMyApplications);

router.get('/stats', jobApplicationController.getApplicationStats);

router
  .route('/:id')
  .get(jobApplicationController.getApplication)
  .patch(
    authController.restrictTo('client'),
    jobApplicationController.updateApplicationStatus
  )
  .delete(
    authController.restrictTo('student'),
    jobApplicationController.deleteApplication
  );

router.patch(
  '/:id/withdraw',
  authController.restrictTo('student'),
  jobApplicationController.withdrawApplication
);

// Accept application (client only)
router.patch(
  '/:id/accept',
  authController.restrictTo('client'),
  jobApplicationController.acceptApplication
);

// Reject application (client only)
router.patch(
  '/:id/reject',
  authController.restrictTo('client'),
  jobApplicationController.rejectApplication
);

// Check if student has already applied to a specific job
router.get(
  '/check/:jobId',
  authController.restrictTo('student'),
  jobApplicationController.checkApplicationStatus
);

// Apply for a specific job post
router.post(
  '/apply/:jobId',
  authController.restrictTo('student'),
  jobApplicationController.applyForJob
);

// Get applications for a specific job post with filters (for clients)
router.get(
  '/job/:jobId',
  authController.restrictTo('client'),
  jobApplicationController.getJobApplications
);

// Unlock student contact (for clients, costs 10 points)
router.patch(
  '/:id/unlock-contact',
  authController.restrictTo('client'),
  jobApplicationController.unlockStudentContact
);

module.exports = router;
