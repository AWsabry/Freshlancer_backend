const User = require('../models/userModel');
const AdminEmailCampaign = require('../models/adminEmailCampaignModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { createTransporter, logEmailResult } = require('../utils/email/emailTransporter');
const { createEmailWrapper } = require('../utils/email/emailHelpers');
const { sendBrevoEmail } = require('../utils/email/brevoEmail');
const fs = require('fs').promises;
const path = require('path');

const MAX_RECIPIENTS = parseInt(process.env.ADMIN_EMAIL_MAX_RECIPIENTS || '2000', 10);
const BCC_CHUNK_SIZE = parseInt(process.env.ADMIN_EMAIL_BCC_CHUNK_SIZE || '50', 10);
const ADMIN_EMAIL_UPLOAD_DIR =
  process.env.ADMIN_EMAIL_UPLOAD_DIR || path.join(process.cwd(), 'uploads', 'admin-emails');

const parseBoolean = (val, defaultValue = false) => {
  if (val === undefined || val === null) return defaultValue;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') return val.toLowerCase() === 'true';
  return defaultValue;
};

const normalizeEmailList = (raw) => {
  if (!raw) return [];
  const parts = Array.isArray(raw) ? raw : String(raw).split(/[\n,; ]+/);
  return parts
    .map((s) => String(s).trim())
    .filter(Boolean)
    .map((s) => s.toLowerCase());
};

const buildRecipients = async ({
  audience,
  mode,
  emails,
  verificationStatus,
  includeName = false,
}) => {
  const aud = (audience || 'students').toLowerCase();
  const m = (mode || 'all').toLowerCase();
  const v = (verificationStatus || 'verified').toLowerCase(); // verified | unverified | all

  const roles =
    aud === 'both' ? ['student', 'client'] : aud === 'clients' ? ['client'] : ['student'];

  const verificationFilter =
    v === 'all' ? {} : { emailVerified: v === 'verified' ? true : false };

  if (m === 'emails') {
    const list = normalizeEmailList(emails);
    if (list.length === 0) {
      throw new AppError('Please provide at least one email address.', 400);
    }
    const users = await User.find({
      role: { $in: roles },
      active: { $ne: false },
      ...verificationFilter,
      email: { $in: list },
    })
      .select(includeName ? 'email name' : 'email')
      .lean();
    return users
      .map((u) => (includeName ? { email: u.email, name: u.name } : { email: u.email }))
      .filter((u) => u.email);
  }

  const users = await User.find({
    role: { $in: roles },
    active: { $ne: false },
    ...verificationFilter,
  })
    .select(includeName ? 'email name' : 'email')
    .lean();
  return users
    .map((u) => (includeName ? { email: u.email, name: u.name } : { email: u.email }))
    .filter((u) => u.email);
};

const escapeHtml = (str) =>
  String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const textToHtml = (plain) => {
  const raw = String(plain || '').replace(/\r\n/g, '\n');
  const lines = raw.split('\n');
  const paragraphs = [];
  let buf = [];
  const flush = () => {
    if (buf.length === 0) return;
    const joined = buf.join('<br/>');
    paragraphs.push(`<p style="margin: 0 0 14px 0; line-height: 1.8;">${joined}</p>`);
    buf = [];
  };
  lines.forEach((line) => {
    const t = line.trimEnd();
    if (!t) {
      flush();
      return;
    }
    buf.push(escapeHtml(t));
  });
  flush();
  return paragraphs.join('');
};

const buildWrappedHtml = ({ subject, htmlBody, textBody, wrap }) => {
  const body =
    htmlBody && String(htmlBody).trim()
      ? String(htmlBody)
      : textBody && String(textBody).trim()
        ? textToHtml(textBody)
        : '';
  if (!wrap) return body;

  const safeTitle = subject ? escapeHtml(subject) : 'Freshlancer';
  const content = `
    <div style="margin-bottom: 28px;">
      <h2 style="margin: 0; color: #0284c7; font-size: 22px; line-height: 1.3;">${safeTitle}</h2>
    </div>
    <div>${body}</div>
  `;
  return createEmailWrapper(content);
};

const applyTemplate = ({ html, text, variables, htmlEscape = true }) => {
  const vars = variables || {};
  const keys = Object.keys(vars);
  if (keys.length === 0) return { html, text };

  let h = html || '';
  let t = text || '';

  keys.forEach((k) => {
    const token = new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'g');
    const rawVal = vars[k] == null ? '' : String(vars[k]);
    const htmlVal = htmlEscape ? escapeHtml(rawVal) : rawVal;
    h = h.replace(token, htmlVal);
    t = t.replace(token, rawVal);
  });

  return { html: h, text: t };
};

const containsToken = (value, tokenName) => {
  const v = String(value || '');
  const re = new RegExp(`\\{\\{\\s*${tokenName}\\s*\\}\\}`, 'i');
  return re.test(v);
};

const processInlineImages = ({ html, inlineImages = [], mode }) => {
  if (!html || inlineImages.length === 0) {
    return { html: html || '', inlineAttachments: [] };
  }

  const inlineAttachments = [];
  let processed = html;

  inlineImages.forEach((file, idx) => {
    const original = file.originalname || `image-${idx + 1}`;
    const token = `{{inline:${original}}}`;
    const cid = `inline-${idx + 1}-${Date.now()}@freshlancer`;

    if (mode === 'preview') {
      const base64 = file.buffer.toString('base64');
      const dataUrl = `data:${file.mimetype};base64,${base64}`;
      processed = processed.split(token).join(`<img src="${dataUrl}" alt="${escapeHtml(original)}" style="max-width: 100%; height: auto;" />`);
    } else if (mode === 'sendEmbed') {
      // For providers that don't support CID attachments reliably (e.g., API sends),
      // embed as data URLs to keep content consistent.
      const base64 = file.buffer.toString('base64');
      const dataUrl = `data:${file.mimetype};base64,${base64}`;
      processed = processed.split(token).join(`<img src="${dataUrl}" alt="${escapeHtml(original)}" style="max-width: 100%; height: auto;" />`);
    } else {
      processed = processed.split(token).join(`cid:${cid}`);
      inlineAttachments.push({
        filename: original,
        content: file.buffer,
        contentType: file.mimetype,
        cid,
      });
    }
  });

  return { html: processed, inlineAttachments };
};

const filesToAttachments = (files = []) => {
  return (files || []).map((f) => ({
    filename: f.originalname,
    content: f.buffer,
    contentType: f.mimetype,
  }));
};

const ensureDir = async (dir) => {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (e) {
    // ignore
  }
};

const safeBasename = (name) => {
  const base = String(name || 'file')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return base.length > 120 ? base.slice(-120) : base;
};

const persistUploadedFiles = async ({ files = [], subdir }) => {
  if (!files || files.length === 0) return [];
  const dir = path.join(ADMIN_EMAIL_UPLOAD_DIR, subdir);
  await ensureDir(dir);

  const saved = [];
  for (const f of files) {
    const base = safeBasename(f.originalname);
    const stamp = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const filename = `${stamp}-${base}`;
    const filePath = path.join(dir, filename);
    await fs.writeFile(filePath, f.buffer);
    saved.push({
      originalName: f.originalname,
      mimeType: f.mimetype,
      size: f.size || f.buffer?.length || 0,
      path: filePath,
    });
  }
  return saved;
};

const loadStoredFilesAsBuffers = async (storedFiles = []) => {
  const results = [];
  for (const sf of storedFiles || []) {
    try {
      const buf = await fs.readFile(sf.path);
      results.push({
        originalname: sf.originalName,
        mimetype: sf.mimeType,
        buffer: buf,
      });
    } catch (e) {
      // If a file is missing, skip it to avoid breaking resend.
      // Admin can re-upload if needed.
    }
  }
  return results;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

exports.previewAdminEmail = catchAsync(async (req, res, next) => {
  const subject = req.body.subject || '';
  const htmlBody = req.body.htmlBody || '';
  const textBody = req.body.textBody || '';
  const actionUrl = req.body.actionUrl || req.body.dashboardUrl || '';
  const previewName = req.body.previewName || 'Freshlancer';

  const attachments = (req.files && req.files.attachments) || [];
  const inlineImages = (req.files && req.files.inlineImages) || [];

  // Admin emails are always wrapped for consistent branding.
  const wrap = true;
  let html = buildWrappedHtml({ subject, htmlBody, textBody, wrap });
  html = applyTemplate({
    html,
    text: '',
    variables: { name: previewName, actionUrl, dashboardUrl: actionUrl },
    htmlEscape: true,
  }).html;
  const previewInline = processInlineImages({ html, inlineImages, mode: 'preview' });
  html = previewInline.html;

  res.status(200).json({
    status: 'success',
    data: {
      subject,
      html,
      counts: {
        attachments: attachments.length,
        inlineImages: inlineImages.length,
      },
      hints: {
        inlineTokenFormat: '{{inline:filename}}',
      },
    },
  });
});

exports.sendAdminEmail = catchAsync(async (req, res, next) => {
  const campaignId = req.body.campaignId || null;
  const subject = (req.body.subject || '').trim();
  const htmlBody = req.body.htmlBody || '';
  const textBody = req.body.textBody || '';
  const audience = req.body.audience;
  const mode = req.body.mode;
  const emails = req.body.emails;
  const verificationStatus = req.body.verificationStatus || 'verified';
  const actionUrl = req.body.actionUrl || req.body.dashboardUrl || '';

  if (!subject) return next(new AppError('Subject is required.', 400));
  if (!String(htmlBody || '').trim() && !String(textBody || '').trim()) {
    return next(new AppError('Please provide an email body (HTML or text).', 400));
  }

  // Admin emails are always wrapped for consistent branding.
  const wrap = true;
  const needsPersonalization = containsToken(htmlBody, 'name') || containsToken(textBody, 'name');
  const recipientUsers = await buildRecipients({
    audience,
    mode,
    emails,
    verificationStatus,
    includeName: needsPersonalization,
  });
  if (recipientUsers.length === 0) {
    return next(new AppError('No recipients matched your selection.', 400));
  }
  if (recipientUsers.length > MAX_RECIPIENTS) {
    return next(
      new AppError(
        `Recipient count (${recipientUsers.length}) exceeds the limit (${MAX_RECIPIENTS}). Please narrow your selection.`,
        400
      )
    );
  }

  let attachments = (req.files && req.files.attachments) || [];
  let inlineImages = (req.files && req.files.inlineImages) || [];

  // If resending from a stored campaign and no new files were uploaded, reuse stored files.
  let basedOn = null;
  let reusedStored = null;
  if (campaignId) {
    const stored = await AdminEmailCampaign.findById(campaignId).lean();
    if (stored) {
      basedOn = stored._id;
      reusedStored = stored;
      if ((!attachments || attachments.length === 0) && stored.attachments?.length) {
        attachments = await loadStoredFilesAsBuffers(stored.attachments);
      }
      if ((!inlineImages || inlineImages.length === 0) && stored.inlineImages?.length) {
        inlineImages = await loadStoredFilesAsBuffers(stored.inlineImages);
      }
    }
  }

  const baseWrappedHtml = buildWrappedHtml({ subject, htmlBody, textBody, wrap });
  const emailProvider = (process.env.EMAIL_PROVIDER || '').toLowerCase(); // 'brevo' or ''(smtp)
  const useBrevo = emailProvider === 'brevo' || !!process.env.BREVO_API_KEY;
  const transporter = useBrevo ? null : await createTransporter();
  logger.info(`📨 Admin email provider: ${useBrevo ? 'Brevo' : 'SMTP'}`, {
    subject,
    needsPersonalization,
    audience: (audience || 'students').toLowerCase(),
    mode: (mode || 'all').toLowerCase(),
  });

  const allAttachments = [
    ...filesToAttachments(attachments),
    // Inline attachments are added per send after token replacement
  ];

  const fromEmail = process.env.EMAIL_FROM || process.env.SMTP_USER || 'noreply@freshlancer.online';
  const fromName = process.env.EMAIL_FROM_NAME || 'Freshlancer Team';
  const from = `${fromName}<${fromEmail}>`;

  const sendDelayMs = parseInt(process.env.ADMIN_EMAIL_SEND_DELAY_MS || '0', 10);

  const results = [];
  let sentCount = 0;
  let failedCount = 0;

  if (needsPersonalization) {
    for (const u of recipientUsers) {
      const vars = {
        name: u.name || 'Student',
        actionUrl,
        dashboardUrl: actionUrl,
      };

      let html = applyTemplate({ html: baseWrappedHtml, text: '', variables: vars }).html;
      const processedInline = processInlineImages({
        html,
        inlineImages,
        mode: useBrevo ? 'sendEmbed' : 'send',
      });
      html = processedInline.html;

      const text = applyTemplate({
        html: '',
        text: textBody || '',
        variables: vars,
        htmlEscape: false,
      }).text;

      try {
        if (useBrevo) {
          const resp = await sendBrevoEmail({
            apiKey: process.env.BREVO_API_KEY,
            fromEmail,
            fromName,
            to: [u.email],
            subject,
            htmlContent: html,
            textContent: text || 'Please view this email in an HTML-capable email client.',
            // Brevo supports attachments, but not CID inline attachments reliably.
            attachments: allAttachments,
          });
          logger.info('✅ Brevo email sent', { to: u.email, messageId: resp?.messageId });
          results.push({ messageId: resp?.messageId, chunkSize: 1 });
        } else {
          const mailOptions = {
            from,
            to: u.email,
            subject,
            text: text || 'Please view this email in an HTML-capable email client.',
            html,
            attachments:
              allAttachments.length > 0 || processedInline.inlineAttachments.length > 0
                ? [...allAttachments, ...processedInline.inlineAttachments]
                : undefined,
          };
          const info = await transporter.sendMail(mailOptions);
          logEmailResult(info, u.email);
          results.push({ messageId: info.messageId, chunkSize: 1 });
        }
        sentCount += 1;
      } catch (e) {
        if (useBrevo) {
          logger.error('❌ Brevo send failed', { to: u.email, message: e?.message });
        }
        failedCount += 1;
      }

      if (sendDelayMs > 0) {
        await sleep(sendDelayMs);
      }
    }
  } else {
    const recipients = recipientUsers.map((u) => u.email);
    const chunks = [];
    for (let i = 0; i < recipients.length; i += BCC_CHUNK_SIZE) {
      chunks.push(recipients.slice(i, i + BCC_CHUNK_SIZE));
    }

    let html = applyTemplate({
      html: baseWrappedHtml,
      text: '',
      variables: { actionUrl, dashboardUrl: actionUrl },
    }).html;
    const processedInline = processInlineImages({
      html,
      inlineImages,
      mode: useBrevo ? 'sendEmbed' : 'send',
    });
    html = processedInline.html;

    const text = applyTemplate({
      html: '',
      text: textBody || '',
      variables: { actionUrl, dashboardUrl: actionUrl },
      htmlEscape: false,
    }).text;

    for (const bccChunk of chunks) {
      if (useBrevo) {
        const resp = await sendBrevoEmail({
          apiKey: process.env.BREVO_API_KEY,
          fromEmail,
          fromName,
          to: [process.env.ADMIN_EMAIL_TO_FALLBACK || fromEmail],
          bcc: bccChunk,
          subject,
          htmlContent: html,
          textContent: text || 'Please view this email in an HTML-capable email client.',
          attachments: allAttachments,
        });
        logger.info('✅ Brevo email sent (BCC chunk)', {
          bccCount: bccChunk.length,
          messageId: resp?.messageId,
        });
        results.push({ messageId: resp?.messageId, chunkSize: bccChunk.length });
      } else {
        const mailOptions = {
          from,
          to: process.env.ADMIN_EMAIL_TO_FALLBACK || from,
          bcc: bccChunk,
          subject,
          text: text || 'Please view this email in an HTML-capable email client.',
          html,
          attachments:
            allAttachments.length > 0 || processedInline.inlineAttachments.length > 0
              ? [...allAttachments, ...processedInline.inlineAttachments]
              : undefined,
        };

        const info = await transporter.sendMail(mailOptions);
        logEmailResult(info, `(bcc x${bccChunk.length})`);
        results.push({ messageId: info.messageId, chunkSize: bccChunk.length });
      }
      sentCount += bccChunk.length;

      if (sendDelayMs > 0) {
        await sleep(sendDelayMs);
      }
    }
  }

  // Persist uploaded assets so this campaign can be reused later.
  // Only persist actual uploads (buffer-based). If we reused stored campaign assets, we keep their stored references.
  const persistedAttachments =
    reusedStored && (!req.files?.attachments || req.files.attachments.length === 0)
      ? reusedStored.attachments || []
      : await persistUploadedFiles({ files: attachments, subdir: 'attachments' });
  const persistedInlineImages =
    reusedStored && (!req.files?.inlineImages || req.files.inlineImages.length === 0)
      ? reusedStored.inlineImages || []
      : await persistUploadedFiles({ files: inlineImages, subdir: 'inline-images' });

  const messageIds = results.map((r) => r.messageId).filter(Boolean);
  await AdminEmailCampaign.create({
    subject,
    audience: (audience || 'students').toLowerCase(),
    verificationStatus: (verificationStatus || 'verified').toLowerCase(),
    mode: (mode || 'all').toLowerCase(),
    emails: mode === 'emails' ? normalizeEmailList(emails) : [],
    htmlBody,
    textBody,
    variables: { actionUrl, dashboardUrl: actionUrl },
    attachments: persistedAttachments,
    inlineImages: persistedInlineImages,
    sentBy: req.user._id || req.user.id,
    sentAt: Date.now(),
    recipientCount: recipientUsers.length,
    chunkCount: results.length,
    messageIds,
    basedOn,
  });

  logger.info('✅ Admin email sent', {
    subject,
    recipients: recipientUsers.length,
    chunks: results.length,
    needsPersonalization,
    sentCount,
    failedCount,
    attachments: attachments.length,
    inlineImages: inlineImages.length,
    adminId: req.user?._id?.toString?.() || req.user?.id,
  });

  res.status(200).json({
    status: 'success',
    data: {
      subject,
      recipients: recipientUsers.length,
      chunks: results.length,
      sentCount,
      failedCount,
      results,
    },
  });
});

exports.getAdminEmailCampaigns = catchAsync(async (req, res, next) => {
  const page = parseInt(req.query.page || '1', 10);
  const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    AdminEmailCampaign.find()
      .sort({ sentAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('subject audience verificationStatus mode sentAt recipientCount chunkCount basedOn createdAt updatedAt')
      .lean(),
    AdminEmailCampaign.countDocuments(),
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

exports.getAdminEmailCampaign = catchAsync(async (req, res, next) => {
  const campaign = await AdminEmailCampaign.findById(req.params.id).lean();
  if (!campaign) return next(new AppError('Email campaign not found.', 404));

  res.status(200).json({
    status: 'success',
    data: {
      campaign,
    },
  });
});

