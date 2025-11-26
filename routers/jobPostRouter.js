const express = require('express');
const jobPostController = require('../controllers/jobPostController');
const authController = require('../controllers/authController');

const router = express.Router();

// Protect all routes after this middleware
router.use(authController.protect);

// Public routes (for authenticated users)
router
  .route('/')
  .get(jobPostController.getAllJobPosts)
  .post(authController.restrictTo('client'), jobPostController.createJobPost);

router.get('/featured', jobPostController.getFeaturedJobPosts);
router.get('/search', jobPostController.searchJobPosts);
router.get('/stats', jobPostController.getJobPostStats);

router
  .route('/:id')
  .get(jobPostController.getJobPost)
  .patch(authController.restrictTo('client'), jobPostController.updateJobPost)
  .delete(authController.restrictTo('client'), jobPostController.deleteJobPost);

router.patch(
  '/:id/close',
  authController.restrictTo('client'),
  jobPostController.closeJobPost
);

module.exports = router;
