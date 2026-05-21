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

// Logo URL - Loaded from environment variable
const LOGO_URL =
  (process.env.EMAIL_LOGO_URL && process.env.EMAIL_LOGO_URL.trim()) ||
  'https://freshlancer.online/assets/01-B_YTi7cW.png';

// Email domain - Loaded from environment variable
const EMAIL_DOMAIN = (process.env.EMAIL_DOMAIN && process.env.EMAIL_DOMAIN.trim()) || 'freshlancer.com';

/**
 * Build the From header for outbound mail.
 * EMAIL_FROM is required for SendGrid SMTP (SMTP_USER is "apikey").
 */
function getEmailFrom() {
  const address =
    (process.env.EMAIL_FROM && process.env.EMAIL_FROM.trim()) ||
    process.env.SMTP_USER ||
    `noreply@${EMAIL_DOMAIN}`;
  const name = (process.env.EMAIL_FROM_NAME && process.env.EMAIL_FROM_NAME.trim()) || 'Freshlancer Team';
  return `${name}<${address}>`;
}

module.exports = {
  BRAND_COLORS,
  LOGO_URL,
  EMAIL_DOMAIN,
  getEmailFrom,
};

