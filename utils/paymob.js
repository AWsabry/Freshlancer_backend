const axios = require('axios');
const AppError = require('./AppError');

const PAYMOB_BASE_URL = 'https://accept.paymob.com/v1';

class PaymobService {
  constructor() {
    this.apiKey = process.env.PAYMOB_TOKEN;
    if (!this.apiKey) {
      console.error('PAYMOB_TOKEN is not set in environment variables');
    }
  }

  /**
   * Create a payment intention with Paymob
   * @param {Object} paymentData - Payment details
   * @returns {Promise<Object>} Payment intention response
   */
  async createPaymentIntention(paymentData) {
    console.log('Payment Created');
    try {
      const {
        amount,
        currency = 'EGP',
        items = [],
        billingData,
        customer,
        integrationId = null,
      } = paymentData;

      // Build payment methods array with static integration ID
      const paymentMethods = [
        5404367, // Static integration ID as provided
        'card',
      ];

      // If custom integration ID provided, add it
      if (integrationId) {
        paymentMethods.push(integrationId);
      }

      const requestBody = {
        amount: Math.round(amount * 100), // Paymob expects amount in cents
        currency,
        payment_methods: paymentMethods,
        items: items.map(item => ({
          name: item.name,
          amount: Math.round(item.amount * 100),
          description: item.description || '',
          quantity: item.quantity || 1,
        })),
        billing_data: {
          apartment: billingData?.apartment || 'NA',
          first_name: billingData?.firstName || customer?.firstName || 'Guest',
          last_name: billingData?.lastName || customer?.lastName || 'User',
          street: billingData?.street || 'NA',
          building: billingData?.building || 'NA',
          phone_number: billingData?.phoneNumber || customer?.phone || '+201000000000',
          country: billingData?.country || 'EGY',
          email: billingData?.email || customer?.email,
          floor: billingData?.floor || 'NA',
          state: billingData?.state || 'NA',
        },
        customer: {
          first_name: customer?.firstName || 'Guest',
          last_name: customer?.lastName || 'User',
          email: customer?.email,
          extras: customer?.extras || {},
        },
        extras: paymentData.extras || {},
        // Paymob will use default redirect URL configured in dashboard
      };

      // console.log('=== PAYMOB REQUEST ===');
      console.log('URL:', `${PAYMOB_BASE_URL}/intention/`);
      // console.log('Request Body:', JSON.stringify(requestBody, null, 2));
      console.log('Headers:', {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      });

      const response = await axios.post(
        `${PAYMOB_BASE_URL}/intention/`,
        requestBody,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log('=== PAYMOB RESPONSE ===');
      console.log('HTTP Status:', response.status);
      console.log('Payment Intention Status:', response.data.status);
      console.log('Intention ID:', response.data.id);
      console.log('Client Secret:', response.data.client_secret);

      // Explain payment status
      const statusExplanation = {
        'PENDING': '⏳ Payment intention created, waiting for user to complete payment',
        'PROCESSED': '✅ Payment completed successfully',
        'EXPIRED': '⏰ Payment intention expired',
        'FAILED': '❌ Payment failed',
        'VOIDED': '🚫 Payment voided',
        'REFUNDED': '💰 Payment refunded'
      };

      console.log('Status Meaning:', statusExplanation[response.data.status] || 'Unknown status');
      console.log('\nFull Response Data:', JSON.stringify(response.data, null, 2));

      return {
        success: true,
        data: response.data,
        intentionId: response.data.id,
        clientSecret: response.data.client_secret,
        paymentUrl: response.data.payment_url || null,
      };
    } catch (error) {
      console.error('=== PAYMOB ERROR ===');
      console.error('Error Response:', error.response?.data);
      console.error('Error Status:', error.response?.status);
      console.error('Error Message:', error.message);
      throw new AppError(
        error.response?.data?.message || 'Failed to create payment intention',
        error.response?.status || 500
      );
    }
  }

  /**
   * Verify payment status
   * @param {String} intentionId - Payment intention ID
   * @returns {Promise<Object>} Payment status
   * @deprecated Paymob API doesn't support GET method for this endpoint (405 error)
   * Payment status should be checked via webhooks and success callbacks instead
   */
  async verifyPayment(intentionId) {
    // NOTE: This method currently doesn't work as Paymob returns 405 Method Not Allowed
    // Payment verification should be done via webhooks and success callbacks
    // Keeping this method for potential future use if Paymob changes their API

    try {
      const response = await axios.get(
        `${PAYMOB_BASE_URL}/intention/${intentionId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
          },
        }
      );

      console.log('=== PAYMOB VERIFY RESPONSE ===');
      console.log('HTTP Status:', response.status);
      console.log('Payment Status:', response.data.status);
      console.log('Is Paid:', response.data.status === 'PROCESSED');
      console.log('Intention ID:', response.data.id);
      console.log('Full Response Data:', JSON.stringify(response.data, null, 2));

      return {
        success: true,
        status: response.data.status,
        isPaid: response.data.status === 'PROCESSED',
        data: response.data,
      };
    } catch (error) {
      console.error('Paymob Verification Error:', error.response?.data || error.message);
      throw new AppError(
        'Failed to verify payment',
        error.response?.status || 500
      );
    }
  }

  /**
   * Process webhook callback
   * @param {Object} webhookData - Webhook payload from Paymob
   * @returns {Object} Processed webhook data
   */
  processWebhook(webhookData) {
    // Paymob sends webhook in this format: { type: "TRANSACTION", obj: {...} }
    const transaction = webhookData.obj || webhookData;

    return {
      intentionId: transaction.order?.id || webhookData.id,
      transactionId: transaction.id,
      status: transaction.success ? 'PROCESSED' : 'FAILED',
      isPaid: transaction.success === true && transaction.pending === false,
      amount: transaction.amount_cents / 100, // Convert from cents
      currency: transaction.currency,
      orderId: transaction.order?.id || null,
      isRefunded: transaction.is_refunded || false,
      isVoided: transaction.is_voided || false,
      paymentMethod: transaction.source_data?.type || 'unknown',
      cardType: transaction.source_data?.sub_type || null,
      cardLastFour: transaction.source_data?.pan || null,
    };
  }
}

module.exports = new PaymobService();
