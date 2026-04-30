const COMMON_SECTION_HEADERS = [
  { key: 'summary', patterns: [/summary/i, /profile/i, /about\s+me/i, /objective/i] },
  { key: 'skills', patterns: [/skills/i, /technical\s+skills/i, /tools/i, /technologies/i] },
  { key: 'experience', patterns: [/experience/i, /work\s+history/i, /employment/i, /professional\s+experience/i] },
  { key: 'projects', patterns: [/projects/i, /portfolio/i] },
  { key: 'education', patterns: [/education/i, /academic/i] },
  { key: 'certifications', patterns: [/certifications/i, /certificates/i, /courses/i] },
  { key: 'languages', patterns: [/languages/i] },
  { key: 'links', patterns: [/links/i, /contact/i] },
];

const splitLines = (text) =>
  String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

const looksLikeHeader = (line) => {
  if (!line) return false;
  if (line.length > 60) return false;
  // mostly uppercase or ends with colon
  const upper = line.toUpperCase();
  const alphaCount = (line.match(/[A-Za-z]/g) || []).length;
  const upperCount = (line.match(/[A-Z]/g) || []).length;
  const isMostlyUpper = alphaCount > 0 && upperCount / alphaCount > 0.8 && line.length >= 3;
  return isMostlyUpper || /:$/.test(line);
};

function inferCvStructure({ rawText }) {
  const lines = splitLines(rawText);
  const sections = {};

  let currentKey = 'unknown';
  sections[currentKey] = [];

  for (const line of lines) {
    const header = COMMON_SECTION_HEADERS.find((h) =>
      h.patterns.some((p) => p.test(line))
    );
    if (header && looksLikeHeader(line)) {
      currentKey = header.key;
      if (!sections[currentKey]) sections[currentKey] = [];
      continue;
    }
    sections[currentKey].push(line);
  }

  // crude bullet extraction
  const bullets = lines
    .filter((l) => /^[-*•]\s+/.test(l) || /^\d+\.\s+/.test(l))
    .map((l) => l.replace(/^([-*•]|\d+\.)\s+/, '').trim())
    .filter(Boolean);

  // links detection
  const links = (rawText.match(/https?:\/\/\S+/gi) || []).slice(0, 20);

  return {
    sections,
    bullets,
    links,
    lineCount: lines.length,
  };
}

module.exports = {
  inferCvStructure,
};

