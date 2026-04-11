const httpClient = require('../httpClient');
const { withRetry } = require('../networkErrorHandler');
const logger = require('../logger');

const PAYMOB_BASE_URL = 'https://accept.paymob.com/v1';

class PaymobService {
  constructor() {
    this.apiKey = process.env.PAYMOB_TOKEN;
    if (!this.apiKey) {
      logger.error('PAYMOB_TOKEN is not set in environment variables');
    }
  }

  getDefaultIntegrationIds() {
    const card = process.env.PAYMOB_INTEGRATION_ID_CARD
      ? Number(process.env.PAYMOB_INTEGRATION_ID_CARD)
      : null;
    const wallet = process.env.PAYMOB_INTEGRATION_ID_WALLET
      ? Number(process.env.PAYMOB_INTEGRATION_ID_WALLET)
      : null;

    const ids = [card, wallet].filter((v) => Number.isFinite(v) && v > 0);
    if (!ids.length) {
      logger.warn(
        'PAYMOB_INTEGRATION_ID_CARD / PAYMOB_INTEGRATION_ID_WALLET are not set; Paymob intentions may fail depending on your account config'
      );
    }
    return ids;
  }

  /**
   * Create a payment intention with Paymob
   * @param {Object} paymentData - Payment details
   * @returns {Promise<Object>} Payment intention response
   */
  async createPaymentIntention(paymentData) {
    try {
      const {
        amount,
        currency = 'EGP',
        items = [],
        billingData,
        customer,
        integrationId = null,
      } = paymentData;

      const paymentMethods = this.getDefaultIntegrationIds();
      if (integrationId) paymentMethods.push(integrationId);

      const safeBillingData = billingData || {};
      const safeCustomer = customer || {};

      const requestBody = {
        amount: Math.round(amount * 100), // Paymob expects amount in cents
        currency,
        payment_methods: paymentMethods,
        items: items.map((item) => ({
          name: item.name,
          amount: Math.round(item.amount * 100),
          description: item.description || '',
          quantity: item.quantity || 1,
        })),
        billing_data: {
          apartment: safeBillingData.apartment || 'NA',
          first_name:
            safeBillingData.firstName || safeCustomer.firstName || 'Guest',
          last_name:
            safeBillingData.lastName || safeCustomer.lastName || 'User',
          street: safeBillingData.street || 'NA',
          building: safeBillingData.building || 'NA',
          phone_number:
            safeBillingData.phoneNumber ||
            safeCustomer.phone ||
            '+201000000000',
          country: safeBillingData.country || 'EGY',
          email: safeBillingData.email || safeCustomer.email,
          floor: safeBillingData.floor || 'NA',
          state: safeBillingData.state || 'NA',
        },
        customer: {
          first_name: safeCustomer.firstName || 'Guest',
          last_name: safeCustomer.lastName || 'User',
          email: safeCustomer.email,
          extras: safeCustomer.extras || {},
        },
        extras: (paymentData && paymentData.extras) || {},
      };

      logger.debug('Creating Paymob payment intention:', {
        url: `${PAYMOB_BASE_URL}/intention/`,
        amount,
        currency,
      });

      // Use retry wrapper for network operations
      const response = await withRetry(
        async () =>
          httpClient.post(`${PAYMOB_BASE_URL}/intention/`, requestBody, {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
          }),
        {
          maxRetries: 3,
          retryDelay: 1000,
          context: 'Paymob Payment Intention',
        }
      );

      logger.info('Paymob payment intention created:', {
        intentionId: response.data.id,
        status: response.data.status,
      });

      return {
        success: true,
        data: response.data,
        intentionId: response.data.id,
        clientSecret: response.data.client_secret,
        paymentUrl: response.data.payment_url || null,
      };
    } catch (error) {
      // Error is already handled by httpClient interceptor and networkErrorHandler
      // Just rethrow it (it's already an AppError)
      logger.error('Paymob payment intention failed:', {
        error: error.message,
        errorCode: error.errorCode,
      });
      throw error;
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
      const response = await withRetry(
        async () =>
          httpClient.get(`${PAYMOB_BASE_URL}/intention/${intentionId}`, {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
            },
          }),
        {
          maxRetries: 2,
          retryDelay: 1000,
          context: 'Paymob Payment Verification',
        }
      );

      logger.debug('Paymob payment verified:', {
        intentionId: response.data.id,
        status: response.data.status,
      });

      return {
        success: true,
        status: response.data.status,
        isPaid: response.data.status === 'PROCESSED',
        data: response.data,
      };
    } catch (error) {
      // Error is already handled by httpClient interceptor
      logger.error('Paymob verification failed:', {
        intentionId,
        error: error.message,
        errorCode: error.errorCode,
      });
      throw error;
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
    const order = transaction && transaction.order ? transaction.order : null;
    const source =
      transaction && transaction.source_data ? transaction.source_data : null;

    return {
      intentionId: (order && order.id) || (webhookData && webhookData.id),
      transactionId: transaction.id,
      status: transaction.success ? 'PROCESSED' : 'FAILED',
      isPaid: transaction.success === true && transaction.pending === false,
      amount: transaction.amount_cents / 100, // Convert from cents
      currency: transaction.currency,
      orderId: (order && order.id) || null,
      isRefunded: transaction.is_refunded || false,
      isVoided: transaction.is_voided || false,
      paymentMethod: (source && source.type) || 'unknown',
      cardType: (source && source.sub_type) || null,
      cardLastFour: (source && source.pan) || null,
    };
  }
}

module.exports = new PaymobService();
