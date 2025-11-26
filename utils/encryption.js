const crypto = require('crypto');

// IMPORTANT: In production, use environment variables and rotate keys regularly
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'your-secret-encryption-key-change-in-production-32chars!!';
const ENCRYPTION_ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // For AES, this is always 16

// Ensure key is exactly 32 bytes for AES-256
const getKey = () => {
  const key = Buffer.from(ENCRYPTION_KEY);
  if (key.length !== 32) {
    return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
  }
  return key;
};

/**
 * Encrypt data using AES-256-CBC
 * @param {any} data - Data to encrypt (will be stringified if object)
 * @returns {string} Encrypted string in format: iv:encryptedData
 */
const encryptData = (data) => {
  try {
    const stringData = typeof data === 'string' ? data : JSON.stringify(data);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, getKey(), iv);

    let encrypted = cipher.update(stringData, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Return IV + encrypted data (IV is needed for decryption)
    return iv.toString('hex') + ':' + encrypted;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
};

/**
 * Decrypt data using AES-256-CBC
 * @param {string} encryptedData - Encrypted string in format: iv:encryptedData
 * @param {boolean} parseJSON - Whether to parse the result as JSON (default: true)
 * @returns {any} Decrypted data
 */
const decryptData = (encryptedData, parseJSON = true) => {
  try {
    const parts = encryptedData.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted data format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];

    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, getKey(), iv);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return parseJSON ? JSON.parse(decrypted) : decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
};

/**
 * Encrypt data for cookies (includes timestamp for expiry validation)
 * @param {any} data - Data to encrypt
 * @param {number} expiryHours - Hours until expiry (default: 24)
 * @returns {string} Encrypted string with timestamp
 */
const encryptCookie = (data, expiryHours = 24) => {
  try {
    const payload = {
      data,
      timestamp: Date.now(),
      expiry: Date.now() + (expiryHours * 60 * 60 * 1000),
    };
    return encryptData(payload);
  } catch (error) {
    console.error('Cookie encryption error:', error);
    throw new Error('Failed to encrypt cookie data');
  }
};

/**
 * Decrypt cookie data and validate expiry
 * @param {string} encryptedData - Encrypted cookie string
 * @returns {any} Decrypted data or null if expired
 */
const decryptCookie = (encryptedData) => {
  try {
    const payload = decryptData(encryptedData);

    // Check if expired
    if (payload.expiry && Date.now() > payload.expiry) {
      console.warn('Cookie data has expired');
      return null;
    }

    return payload.data;
  } catch (error) {
    console.error('Cookie decryption error:', error);
    return null;
  }
};

/**
 * Hash sensitive data (one-way, cannot be decrypted)
 * @param {string} data - Data to hash
 * @returns {string} Hashed string
 */
const hashData = (data) => {
  try {
    return crypto.createHash('sha256').update(data).digest('hex');
  } catch (error) {
    console.error('Hashing error:', error);
    throw new Error('Failed to hash data');
  }
};

/**
 * Generate a random secure token
 * @param {number} length - Length of token in bytes (default: 32)
 * @returns {string} Random token
 */
const generateToken = (length = 32) => {
  try {
    return crypto.randomBytes(length).toString('hex');
  } catch (error) {
    console.error('Token generation error:', error);
    throw new Error('Failed to generate token');
  }
};

/**
 * Compare a plain text password with a hashed password
 * @param {string} plainText - Plain text to compare
 * @param {string} hashed - Hashed string to compare against
 * @returns {boolean} True if match
 */
const compareHash = (plainText, hashed) => {
  try {
    return hashData(plainText) === hashed;
  } catch (error) {
    console.error('Hash comparison error:', error);
    return false;
  }
};

module.exports = {
  encryptData,
  decryptData,
  encryptCookie,
  decryptCookie,
  hashData,
  generateToken,
  compareHash,
};
