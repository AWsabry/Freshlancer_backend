const axios = require('axios');
const { handleNetworkError } = require('../networkErrorHandler');

const BREVO_API_BASE = 'https://api.brevo.com/v3';

function toBase64(buffer) {
  if (!buffer) return undefined;
  return Buffer.isBuffer(buffer) ? buffer.toString('base64') : Buffer.from(buffer).toString('base64');
}

function normalizeAttachments(attachments = []) {
  // Brevo expects: [{ name, content }] where content is base64
  return (attachments || [])
    .filter(Boolean)
    .map((a) => ({
      name: a.filename || a.name || 'file',
      content: toBase64(a.content),
    }))
    .filter((a) => a.name && a.content);
}

async function sendBrevoEmail({
  apiKey,
  fromEmail,
  fromName = 'Freshlancer Team',
  to = [],
  bcc = [],
  subject,
  htmlContent,
  textContent,
  attachments = [],
  headers,
}) {
  if (!apiKey) {
    throw new Error('BREVO_API_KEY is required to send via Brevo');
  }
  if (!fromEmail) {
    throw new Error('fromEmail is required to send via Brevo');
  }

  const payload = {
    sender: { email: fromEmail, name: fromName },
    to: (to || []).map((r) => (typeof r === 'string' ? { email: r } : r)).filter((r) => r?.email),
    bcc: (bcc || []).map((r) => (typeof r === 'string' ? { email: r } : r)).filter((r) => r?.email),
    subject,
    htmlContent,
    textContent,
    attachment: normalizeAttachments(attachments),
    headers: headers || undefined,
  };

  try {
    const resp = await axios.post(`${BREVO_API_BASE}/smtp/email`, payload, {
      headers: {
        accept: 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      timeout: 30000,
    });

    return resp.data; // typically { messageId: "..." }
  } catch (err) {
    throw handleNetworkError(err, 'Brevo Email API');
  }
}

module.exports = {
  sendBrevoEmail,
};

