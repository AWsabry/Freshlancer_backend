const express = require('express');
const universityController = require('../controllers/universityController');
const authController = require('../controllers/auth/authController');

const router = express.Router();

// Public routes - get universities (with optional search and filters)
router.get('/', universityController.getAllUniversities);
router.get('/:id', universityController.getUniversity);

// Protected route - users can submit pending universities (no email verification required)
router.post(
  '/pending',
  authController.protect,
  universityController.createPendingUniversity
);

module.exports = router;

