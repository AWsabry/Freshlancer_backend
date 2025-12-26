// Currency conversion rates (base: USD)
// These rates should ideally be fetched from an API in production
// For now, using approximate rates as of 2025

const CURRENCY_RATES = {
  // Major Currencies
  USD: 1.00,
  EUR: 0.92,
  EGP: 49.50,
  GBP: 0.79,

  // Middle East
  AED: 3.67,
  SAR: 3.75,
  QAR: 3.64,
  KWD: 0.31,
  BHD: 0.38,
  OMR: 0.38,
  JOD: 0.71,
  LBP: 89500.00,
  ILS: 3.60,
  TRY: 34.50,

  // Africa
  ZAR: 18.50,
  MAD: 10.10,
  TND: 3.15,
  DZD: 135.00,
  NGN: 1550.00,
  KES: 129.00,
  GHS: 15.50,
  UGX: 3750.00,
  TZS: 2550.00,
  ETB: 125.00,

  // Europe
  CHF: 0.88,
  SEK: 10.80,
  NOK: 10.90,
  DKK: 6.85,
  PLN: 4.05,
  CZK: 23.50,
  HUF: 365.00,
  RON: 4.58,
  BGN: 1.80,
  HRK: 6.93,
  RUB: 91.00,
  UAH: 41.50,
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
 * Detect user's currency based on their location/country
 * @param {string} country - Country name or code
 * @returns {string} Currency code
 */
const getCurrencyByCountry = (country) => {
  const countryToCurrency = {
    // Major Countries
    'United States': 'USD',
    'US': 'USD',
    'USA': 'USD',
    'United Kingdom': 'GBP',
    'UK': 'GBP',
    'Egypt': 'EGP',
    'France': 'EUR',
    'Germany': 'EUR',
    'Italy': 'EUR',
    'Spain': 'EUR',

    // Middle East
    'UAE': 'AED',
    'United Arab Emirates': 'AED',
    'Saudi Arabia': 'SAR',
    'Qatar': 'QAR',
    'Kuwait': 'KWD',
    'Bahrain': 'BHD',
    'Oman': 'OMR',
    'Jordan': 'JOD',
    'Lebanon': 'LBP',
    'Israel': 'ILS',
    'Turkey': 'TRY',

    // Africa
    'South Africa': 'ZAR',
    'Morocco': 'MAD',
    'Tunisia': 'TND',
    'Algeria': 'DZD',
    'Nigeria': 'NGN',
    'Kenya': 'KES',
    'Ghana': 'GHS',
    'Uganda': 'UGX',
    'Tanzania': 'TZS',
    'Ethiopia': 'ETB',

    // Europe
    'Switzerland': 'CHF',
    'Sweden': 'SEK',
    'Norway': 'NOK',
    'Denmark': 'DKK',
    'Poland': 'PLN',
    'Czech Republic': 'CZK',
    'Czechia': 'CZK',
    'Hungary': 'HUF',
    'Romania': 'RON',
    'Bulgaria': 'BGN',
    'Croatia': 'HRK',
    'Russia': 'RUB',
    'Ukraine': 'UAH',
  };

  return countryToCurrency[country] || 'USD'; // Default to USD
};

module.exports = {
  CURRENCY_RATES,
  BASE_PREMIUM_PRICES,
  convertFromUSD,
  getPremiumPrices,
  getPriceForCurrency,
  getCurrencyByCountry,
};
