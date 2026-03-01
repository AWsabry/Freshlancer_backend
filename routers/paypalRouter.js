const express = require('express');
const paypalController = require('../controllers/paypalController');
const authController = require('../controllers/auth/authController');

const router = express.Router();

// Public capture endpoint (PayPal redirect)
router.get('/capture', paypalController.capture);

// Authenticated endpoints
router.use(authController.protect);
router.use(authController.requireEmailVerification);

router.post('/orders', paypalController.createOrder);

module.exports = router;

