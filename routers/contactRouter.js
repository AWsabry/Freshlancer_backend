const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contactController');
const authController = require('../controllers/authController');

// Public route - no authentication required
router.post('/', contactController.createContact);

// All routes below require authentication
router.use(authController.protect);

// Admin only routes
router.use(authController.restrictTo('admin'));
router.get('/', contactController.getAllContacts);
router.get('/stats', contactController.getContactStats);
router.get('/:id', contactController.getContact);
router.patch('/:id/status', contactController.updateContactStatus);
router.post('/:id/reply', contactController.replyToContact);
router.delete('/:id', contactController.deleteContact);

module.exports = router;

