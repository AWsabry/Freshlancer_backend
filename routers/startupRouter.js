const express = require('express');
const router = express.Router();
const startupController = require('../controllers/startupController');
const authController = require('../controllers/auth/authController');
const { uploadStartupLogo } = require('../middleware/upload');

// Protect all routes
router.use(authController.protect);
// Require email verification
router.use(authController.requireEmailVerification);

// Client routes (must come before admin routes to avoid conflicts)
router.post('/', startupController.createStartup);
router.get('/me', startupController.getStartupsByClient);
router.patch('/:id', startupController.updateStartup);
router.post('/:id/logo', uploadStartupLogo.single('logo'), startupController.uploadLogo);
router.delete('/:id/logo', startupController.deleteLogo);
router.delete('/:id', startupController.deleteStartup);

// Admin routes (restricted to admin only)
router.use(authController.restrictTo('admin'));
router.get('/', startupController.getAllStartups);
router.get('/:id', startupController.getStartup);
// Note: DELETE /:id is already defined above for clients, but admins can also use it
// The deleteStartup function checks permissions

module.exports = router;

