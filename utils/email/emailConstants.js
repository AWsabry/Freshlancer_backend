// Brand colors - matching Freshlancer frontend
const BRAND_COLORS = {
  primary: '#0284c7', // primary-600
  primaryLight: '#0ea5e9', // primary-500
  primaryDark: '#0369a1', // primary-700
  secondary: '#e5e7eb', // gray-200
  text: '#111827', // gray-900
  textLight: '#6b7280', // gray-500
  background: '#f9fafb', // gray-50
  white: '#ffffff',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#0284c7',
};

// Logo URL - Loaded from environment variable in config.env
const LOGO_URL = (process.env.EMAIL_LOGO_URL && process.env.EMAIL_LOGO_URL.trim()) || 
  'https://via.placeholder.com/200x60/0284c7/ffffff?text=Freshlancer';

// Email domain - Loaded from environment variable in config.env
const EMAIL_DOMAIN = (process.env.EMAIL_DOMAIN && process.env.EMAIL_DOMAIN.trim()) || 'freshlancer.com';

module.exports = {
  BRAND_COLORS,
  LOGO_URL,
  EMAIL_DOMAIN,
};

