const httpClient = require('../httpClient');
const { withRetry } = require('../networkErrorHandler');
const AppError = require('../AppError');
const logger = require('../logger');

// Per-request timeout for PayPal API (fail fast instead of hanging)
const PAYPAL_REQUEST_TIMEOUT_MS = 15000;

// Reuse token until this many ms before expiry (5 min buffer)
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

function getBaseUrl() {
  const env = (process.env.PAYPAL_ENV || 'sandbox').toLowerCase().trim();
  const isLive = env === 'live' || env === 'production';
  const baseUrl = isLive
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
  logger.info(`PayPal API: PAYPAL_ENV=${process.env.PAYPAL_ENV ?? '(not set)'} → ${isLive ? 'LIVE' : 'SANDBOX'} (${baseUrl})`);
  return baseUrl;
}

class PaypalService {
  constructor() {
    this.clientId = process.env.PAYPAL_CLIENT_ID;
    this.clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    this._tokenCache = null; // { token, expiresAt }
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

    const now = Date.now();
    if (this._tokenCache && this._tokenCache.expiresAt > now + TOKEN_REFRESH_BUFFER_MS) {
      logger.info('PayPal access token reused from cache');
      return this._tokenCache.token;
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
            timeout: PAYPAL_REQUEST_TIMEOUT_MS,
          }
        );
      },
      { maxRetries: 1, retryDelay: 500, context: 'PayPal OAuth Token' }
    );

    const token = response.data?.access_token;
    const expiresIn = response.data?.expires_in;
    if (!token) {
      throw AppError.serverError('Failed to obtain PayPal access token', 'PAYPAL_TOKEN_FAILED');
    }

    const expiresAt = typeof expiresIn === 'number' && expiresIn > 0
      ? now + (expiresIn * 1000)
      : now + (8 * 60 * 60 * 1000); // default 8h if missing
    this._tokenCache = { token, expiresAt };
    logger.info('PayPal access token obtained and cached');
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
          timeout: PAYPAL_REQUEST_TIMEOUT_MS,
        });
      },
      { maxRetries: 1, retryDelay: 500, context: 'PayPal Create Order' }
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

    // Capture is critical (user already approved); use longer timeout and more retries
    const captureTimeoutMs = 25000;
    const response = await withRetry(
      async () => {
        return await httpClient.post(
          `${baseUrl}/v2/checkout/orders/${orderId}/capture`,
          {},
          { headers: { Authorization: `Bearer ${token}` }, timeout: captureTimeoutMs }
        );
      },
      { maxRetries: 3, retryDelay: 1000, context: 'PayPal Capture Order' }
    );

    const status = response.data?.status;
    if (status !== 'COMPLETED') {
      logger.warn('PayPal capture not completed', { orderId, status, data: response.data });
    }

    return { status, raw: response.data };
  }
}

module.exports = new PaypalService();

