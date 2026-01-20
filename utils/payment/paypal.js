const httpClient = require('../httpClient');
const { withRetry } = require('../networkErrorHandler');
const AppError = require('../AppError');
const logger = require('../logger');

function getBaseUrl() {
  const env = (process.env.PAYPAL_ENV || 'sandbox').toLowerCase();
  return env === 'live' || env === 'production'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

class PaypalService {
  constructor() {
    this.clientId = process.env.PAYPAL_CLIENT_ID;
    this.clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    if (!this.clientId || !this.clientSecret) {
      logger.warn('PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are not set');
    }
  }

  async getAccessToken() {
    if (!this.clientId || !this.clientSecret) {
      throw AppError.serviceUnavailable(
        'PayPal is not configured on the server',
        'PAYPAL_NOT_CONFIGURED'
      );
    }

    const baseUrl = getBaseUrl();
    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    const response = await withRetry(
      async () => {
        return await httpClient.post(
          `${baseUrl}/v1/oauth2/token`,
          'grant_type=client_credentials',
          {
            headers: {
              Authorization: `Basic ${auth}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          }
        );
      },
      { maxRetries: 2, retryDelay: 1000, context: 'PayPal OAuth Token' }
    );

    const token = response.data?.access_token;
    if (!token) {
      throw AppError.serverError('Failed to obtain PayPal access token', 'PAYPAL_TOKEN_FAILED');
    }
    return token;
  }

  async createOrder({
    amount,
    currency = 'USD',
    description = 'Freshlancer Contract Escrow Deposit',
    returnUrl,
    cancelUrl,
    customId,
  }) {
    const baseUrl = getBaseUrl();
    const token = await this.getAccessToken();

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      throw AppError.badRequest('Invalid PayPal amount', 'PAYPAL_AMOUNT_INVALID');
    }

    const body = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          amount: {
            currency_code: currency,
            value: amt.toFixed(2),
          },
          description,
          custom_id: customId,
        },
      ],
      application_context: {
        return_url: returnUrl,
        cancel_url: cancelUrl,
        user_action: 'PAY_NOW',
        shipping_preference: 'NO_SHIPPING',
      },
    };

    const response = await withRetry(
      async () => {
        return await httpClient.post(`${baseUrl}/v2/checkout/orders`, body, {
          headers: { Authorization: `Bearer ${token}` },
        });
      },
      { maxRetries: 2, retryDelay: 1000, context: 'PayPal Create Order' }
    );

    const orderId = response.data?.id;
    const approveLink = Array.isArray(response.data?.links)
      ? response.data.links.find((l) => l.rel === 'approve')?.href
      : null;

    if (!orderId || !approveLink) {
      logger.error('PayPal order create response missing fields', { data: response.data });
      throw AppError.serverError('Failed to create PayPal order', 'PAYPAL_ORDER_CREATE_FAILED');
    }

    return {
      orderId,
      approvalUrl: approveLink,
      raw: response.data,
    };
  }

  async captureOrder(orderId) {
    const baseUrl = getBaseUrl();
    const token = await this.getAccessToken();

    const response = await withRetry(
      async () => {
        return await httpClient.post(
          `${baseUrl}/v2/checkout/orders/${orderId}/capture`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
      },
      { maxRetries: 2, retryDelay: 1000, context: 'PayPal Capture Order' }
    );

    const status = response.data?.status;
    if (status !== 'COMPLETED') {
      logger.warn('PayPal capture not completed', { orderId, status, data: response.data });
    }

    return { status, raw: response.data };
  }
}

module.exports = new PaypalService();

