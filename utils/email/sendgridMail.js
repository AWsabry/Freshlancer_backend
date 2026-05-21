const sgMail = require('@sendgrid/mail');
const logger = require('../logger');
const { createTransporter, logEmailResult } = require('./emailTransporter');

/**
 * Resolve SendGrid API key (explicit SENDGRID_API_KEY or SMTP_PASS when host is SendGrid).
 */
function getSendGridApiKey() {
  const explicit = process.env.SENDGRID_API_KEY && process.env.SENDGRID_API_KEY.trim();
  if (explicit) return explicit;
  const host = (process.env.SMTP_HOST || '').toLowerCase();
  if (host.includes('sendgrid') && process.env.SMTP_PASS) {
    return process.env.SMTP_PASS.trim();
  }
  return null;
}

/**
 * EMAIL_PROVIDER:
 * - sendgrid-api | sendgrid → SendGrid Web API
 * - smtp (default) → nodemailer SMTP relay (e.g. smtp.sendgrid.net)
 */
function useSendGridWebApi() {
  const provider = (process.env.EMAIL_PROVIDER || 'smtp').toLowerCase();
  if (provider === 'smtp' || provider === 'nodemailer') return false;
  if (provider === 'sendgrid-api' || provider === 'sendgrid') {
    return Boolean(getSendGridApiKey());
  }
  return false;
}

function parseFromAddress(from) {
  const raw = String(from || '').trim();
  const match = raw.match(/^(.+?)<([^>]+)>$/);
  if (match) {
    return { name: match[1].trim(), email: match[2].trim() };
  }
  return { email: raw };
}

function normalizeRecipients(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return [value];
}

function toSendGridAttachments(attachments = []) {
  return attachments.map((a) => {
    const content = Buffer.isBuffer(a.content)
      ? a.content.toString('base64')
      : typeof a.content === 'string'
        ? a.content
        : '';
    const item = {
      content,
      filename: a.filename || 'attachment',
      type: a.contentType || 'application/octet-stream',
    };
    if (a.cid) {
      return {
        ...item,
        disposition: 'inline',
        content_id: a.cid,
      };
    }
    return { ...item, disposition: 'attachment' };
  });
}

async function sendViaSendGridWebApi(mailOptions) {
  const apiKey = getSendGridApiKey();
  if (!apiKey) {
    throw new Error('SendGrid API key is not configured.');
  }

  sgMail.setApiKey(apiKey);

  const msg = {
    from: parseFromAddress(mailOptions.from),
    to: normalizeRecipients(mailOptions.to),
    subject: mailOptions.subject,
    text: mailOptions.text,
    html: mailOptions.html,
  };

  const bcc = normalizeRecipients(mailOptions.bcc);
  if (bcc.length > 0) {
    msg.bcc = bcc;
  }

  if (mailOptions.attachments && mailOptions.attachments.length > 0) {
    msg.attachments = toSendGridAttachments(mailOptions.attachments);
  }

  const [response] = await sgMail.send(msg);
  const messageId =
    response?.headers?.['x-message-id'] ||
    response?.headers?.['X-Message-Id'] ||
    'sendgrid';

  return { messageId, provider: 'sendgrid-api' };
}

async function sendViaSmtpRelay(mailOptions) {
  const transporter = await createTransporter();
  const info = await transporter.sendMail(mailOptions);
  return { messageId: info.messageId, provider: 'smtp' };
}

/**
 * Deliver a single campaign message via SendGrid Web API or SMTP relay.
 */
async function deliverMail(mailOptions, logRecipient) {
  let result;
  if (useSendGridWebApi()) {
    result = await sendViaSendGridWebApi(mailOptions);
    logger.info(`✅ Email sent via SendGrid API: ${result.messageId}`);
    if (logRecipient) logger.info('📧 To:', logRecipient);
  } else {
    result = await sendViaSmtpRelay(mailOptions);
    logEmailResult({ messageId: result.messageId }, logRecipient);
  }
  return result;
}

function getEmailDeliveryMode() {
  return useSendGridWebApi() ? 'sendgrid-api' : 'smtp';
}

module.exports = {
  deliverMail,
  getEmailDeliveryMode,
  useSendGridWebApi,
  getSendGridApiKey,
};
