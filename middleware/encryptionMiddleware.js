const { encryptData, decryptData } = require('../utils/encryption');

// Routes that MUST have encrypted responses (always encrypted, regardless of request)
const FORCE_ENCRYPTED_ROUTES = [
  '/api/v1/applications',
  '/api/v1/jobs',
  '/api/v1/users/me',
  '/api/v1/notifications',
  '/api/v1/subscriptions',
  '/api/v1/packages',
];

/**
 * Check if a route should be force-encrypted
 */
const shouldForceEncrypt = (path) => {
  return FORCE_ENCRYPTED_ROUTES.some(route => path.startsWith(route));
};

/**
 * Middleware to decrypt incoming encrypted requests
 * Checks for X-Encrypted header and decrypts the payload
 */
const decryptRequest = (req, res, next) => {
  try {
    // Check if request is encrypted
    if (req.headers['x-encrypted'] === 'true' && req.body?.encryptedPayload) {
      const decryptedData = decryptData(req.body.encryptedPayload);
      req.body = decryptedData;
      req.isEncrypted = true; // Flag for response encryption
    }
    next();
  } catch (error) {
    console.error('Decryption middleware error:', error);
    return res.status(400).json({
      status: 'fail',
      message: 'Failed to decrypt request data',
    });
  }
};

/**
 * Middleware to encrypt outgoing responses
 * Encrypts response if request was encrypted OR if route requires encryption
 */
const encryptResponse = (req, res, next) => {
  // Store original json method
  const originalJson = res.json.bind(res);

  // Override json method
  res.json = function (data) {
    try {
      // Check if this route must be encrypted
      const mustEncrypt = shouldForceEncrypt(req.path);

      // Encrypt if: route requires it, OR request was encrypted
      if (mustEncrypt || req.isEncrypted || req.headers['x-encrypted'] === 'true') {
        const encryptedData = encryptData(data);
        res.setHeader('X-Encrypted', 'true');
        return originalJson({ encryptedPayload: encryptedData });
      }

      // Send unencrypted for non-encrypted requests
      return originalJson(data);
    } catch (error) {
      console.error('Encryption middleware error:', error);
      // Fallback to unencrypted response on error
      return originalJson(data);
    }
  };

  next();
};

/**
 * Combined middleware that handles both encryption and decryption
 */
const encryptionMiddleware = [decryptRequest, encryptResponse];

module.exports = {
  decryptRequest,
  encryptResponse,
  encryptionMiddleware,
};
