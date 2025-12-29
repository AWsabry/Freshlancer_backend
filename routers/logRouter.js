const express = require('express');
const logController = require('../controllers/logController');

const router = express.Router();

// Log frontend errors
// This endpoint doesn't require authentication to allow error logging even when auth fails
router.post('/', logController.logFrontendError);

module.exports = router;

