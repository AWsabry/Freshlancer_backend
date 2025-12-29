const express = require('express');
const paymobController = require('../controllers/paymobController');

const router = express.Router();

// Public webhook endpoint (no authentication required for Paymob callbacks)
router.post('/webhook', paymobController.handleWebhook);

// Public success callback endpoint (no authentication required - user redirected from Paymob)
router.get('/success', paymobController.paymentSuccess);

// Handle callback URL pattern with variable (e.g., /api/v1/paymob/:id/payment/success)
// This handles cases where Paymob dashboard is configured with a callback URL that includes a variable
router.get('/:id/payment/success', paymobController.paymentSuccess);

// Complete payment success endpoint - updates everything (no authentication required)
router.get('/complete-success', paymobController.completePaymentSuccess);

// Payment status callback from Paymob (GET/POST) - handles redirect based on payment result
router.get('/payment-status', paymobController.getPaymentStatus);
router.post('/payment-status', paymobController.getPaymentStatus);

module.exports = router;
