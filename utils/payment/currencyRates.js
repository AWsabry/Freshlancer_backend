// Currency conversion rates (base: USD)
// These rates should ideally be fetched from an API in production
// For now, using approximate rates as of 2025

const CURRENCY_RATES = {
  USD: 1.00,
  EGP: 49.50,
};

// Base premium plan price in USD
// Note: Prices are optimized for student market (competitive pricing)
const BASE_PREMIUM_PRICES = {
  monthly: 4.99,   // ~247 EGP - affordable for students
  quarterly: 12.99, // ~643 EGP - save 13% vs monthly
  yearly: 49.99,   // ~2,474 EGP - save 16% vs monthly
};

/**
 * Convert USD price to target currency
 * @param {number} usdAmount - Amount in USD
 * @param {string} targetCurrency - Target currency code
 * @returns {number} Converted amount
 */
const convertFromUSD = (usdAmount, targetCurrency) => {
  const rate = CURRENCY_RATES[targetCurrency];
  if (!rate) {
    throw new Error(`Currency ${targetCurrency} not supported`);
  }
  return Math.round(usdAmount * rate * 100) / 100; // Round to 2 decimal places
};

/**
 * Get premium plan prices in all currencies
 * @param {string} billingCycle - 'monthly', 'quarterly', or 'yearly'
 * @returns {Object} Prices in all currencies
 */
const getPremiumPrices = (billingCycle = 'monthly') => {
  const basePrice = BASE_PREMIUM_PRICES[billingCycle];
  if (!basePrice) {
    throw new Error(`Invalid billing cycle: ${billingCycle}`);
  }

  const prices = {};
  Object.keys(CURRENCY_RATES).forEach((currency) => {
    prices[currency] = convertFromUSD(basePrice, currency);
  });

  return prices;
};

/**
 * Get premium plan price for a specific currency
 * @param {string} currency - Currency code
 * @param {string} billingCycle - 'monthly', 'quarterly', or 'yearly'
 * @returns {number} Price in the specified currency
 */
const getPriceForCurrency = (currency, billingCycle = 'monthly') => {
  const basePrice = BASE_PREMIUM_PRICES[billingCycle];
  if (!basePrice) {
    throw new Error(`Invalid billing cycle: ${billingCycle}`);
  }

  return convertFromUSD(basePrice, currency);
};

/**
 * Detect user's currency based on their location/country.
 * Only USD and EGP are supported; Egypt maps to EGP, all others to USD.
 * @param {string} country - Country name or code
 * @returns {string} Currency code ('USD' or 'EGP')
 */
const getCurrencyByCountry = (country) => {
  if (!country) return 'USD';
  const c = String(country).trim();
  if (c === 'Egypt' || c === 'EG' || c === 'EGY') return 'EGP';
  return 'USD';
};

module.exports = {
  CURRENCY_RATES,
  BASE_PREMIUM_PRICES,
  convertFromUSD,
  getPremiumPrices,
  getPriceForCurrency,
  getCurrencyByCountry,
};
