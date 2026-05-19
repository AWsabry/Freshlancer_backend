const fs = require('fs').promises;
const path = require('path');
const AppError = require('../../utils/AppError');

function loadPdfParser() {
  try {
    const pdfParseModule = require('pdf-parse');
    return pdfParseModule?.PDFParse;
  } catch (err) {
    throw new AppError(
      'PDF support is not installed on the server. Run: npm install pdf-parse mammoth',
      500
    );
  }
}

function loadMammoth() {
  try {
    return require('mammoth');
  } catch (err) {
    throw new AppError(
      'DOCX support is not installed on the server. Run: npm install pdf-parse mammoth',
      500
    );
  }
}

const normalizeWhitespace = (s) =>
  String(s || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const truncate = (text, maxChars) => {
  if (!text) return '';
  if (!maxChars || text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[TRUNCATED]`;
};

async function extractTextFromCv({ filePath, mimeType, originalName, maxChars = 45000 }) {
  const ext = path.extname(originalName || filePath || '').toLowerCase();
  const buf = await fs.readFile(filePath);

  let raw = '';

  // Prefer MIME when available; fall back to extension.
  const isPdf = mimeType === 'application/pdf' || ext === '.pdf';
  const isDocx =
    mimeType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === '.docx';
  const isDoc = mimeType === 'application/msword' || ext === '.doc';

  if (isPdf) {
    const PDFParseClass = loadPdfParser();
    if (typeof PDFParseClass !== 'function') {
      throw new AppError('PDF parser is not available on the server.', 500);
    }
    const parser = new PDFParseClass({ data: buf });
    try {
      const out = await parser.getText();
      raw = out?.text || '';
    } finally {
      await parser.destroy().catch(() => {});
    }
  } else if (isDocx) {
    const mammoth = loadMammoth();
    const out = await mammoth.extractRawText({ buffer: buf });
    raw = out.value || '';
  } else if (isDoc) {
    // DOC (legacy) is unreliable without system converters; keep deterministic behavior for now.
    throw new AppError('DOC files are not supported yet. Please upload a PDF or DOCX.', 400);
  } else {
    throw new AppError('Unsupported CV file type. Please upload a PDF or DOCX.', 400);
  }

  const normalized = normalizeWhitespace(raw);
  return truncate(normalized, maxChars);
}

module.exports = {
  extractTextFromCv,
};

