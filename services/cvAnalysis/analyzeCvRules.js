const { getKeywordsForFields, getJobTitlesForFields } = require('./fieldKeywords');

const normalize = (s) => String(s || '').toLowerCase();

const uniq = (arr) => Array.from(new Set((arr || []).filter(Boolean)));

const countMatches = (text, regex) => (String(text || '').match(regex) || []).length;

const inferFieldsFromText = (rawText) => {
  const t = normalize(rawText);
  const hits = [
    { field: 'frontend', kws: ['react', 'vue', 'angular', 'html', 'css', 'tailwind', 'typescript'] },
    { field: 'backend', kws: ['node', 'express', 'django', 'flask', 'spring', 'graphql', 'postgresql', 'mongodb', 'redis'] },
    { field: 'data', kws: ['sql', 'pandas', 'numpy', 'power bi', 'tableau', 'etl', 'statistics'] },
    { field: 'ui/ux', kws: ['figma', 'wireframe', 'prototype', 'usability', 'design system'] },
    { field: 'mobile', kws: ['flutter', 'react native', 'kotlin', 'swift', 'android', 'ios'] },
    { field: 'devops', kws: ['docker', 'kubernetes', 'ci/cd', 'terraform', 'aws', 'gcp', 'azure'] },
  ];
  const scored = hits
    .map((h) => ({
      field: h.field,
      score: h.kws.reduce((acc, kw) => acc + (t.includes(kw) ? 1 : 0), 0),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, 2).map((x) => x.field);
};

const extractKeywordsFromText = (text) => {
  const t = normalize(text);
  const candidates = t
    .replace(/[^a-z0-9+.#\s/-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && w.length <= 24);

  // remove very common stopwords (tiny list)
  const stop = new Set(['the', 'and', 'with', 'for', 'from', 'that', 'this', 'have', 'has', 'are', 'was']);
  return uniq(candidates.filter((w) => !stop.has(w))).slice(0, 2000);
};

const detectMissingSections = (structure) => {
  const s = structure?.sections || {};
  const has = (k) => Array.isArray(s[k]) && s[k].length > 0;

  const missing = [];
  if (!has('skills')) missing.push('Skills');
  if (!has('experience')) missing.push('Work experience');
  if (!has('education')) missing.push('Education');
  if (!has('projects')) missing.push('Projects');
  if (!has('summary')) missing.push('Summary');
  return missing;
};

const computeScore = ({ rawText, structure, missingSections }) => {
  let score = 100;
  const breakdown = {
    sections: 30,
    quantification: 25,
    clarity: 25,
    formatting: 20,
  };

  // Sections
  const missingPenalty = Math.min(30, missingSections.length * 6);
  breakdown.sections = Math.max(0, breakdown.sections - missingPenalty);

  // Quantification: numbers, %, metrics
  const numCount = countMatches(rawText, /\b\d+(\.\d+)?\b/g);
  const percCount = countMatches(rawText, /\b\d+%/g);
  const quantPoints = Math.min(25, Math.floor(numCount / 3) * 3 + Math.min(10, percCount * 2));
  breakdown.quantification = Math.max(0, Math.min(25, quantPoints));

  // Clarity: bullet usage + action verbs (simple)
  const bulletCount = (structure?.bullets || []).length;
  const verbCount = countMatches(rawText, /\b(built|implemented|created|designed|led|improved|optimized|developed|delivered|launched|analyzed|tested|deployed)\b/gi);
  const clarityPoints = Math.min(25, Math.floor(bulletCount / 4) * 3 + Math.min(10, Math.floor(verbCount / 3) * 2));
  breakdown.clarity = Math.max(0, Math.min(25, clarityPoints));

  // Formatting: links + line count sanity
  const hasLinks = (structure?.links || []).length > 0;
  const lineCount = structure?.lineCount || 0;
  let fmt = 20;
  if (!hasLinks) fmt -= 6;
  if (lineCount < 20) fmt -= 6;
  if (lineCount > 250) fmt -= 6;
  breakdown.formatting = Math.max(0, fmt);

  score = breakdown.sections + breakdown.quantification + breakdown.clarity + breakdown.formatting;
  score = Math.max(0, Math.min(100, score));

  return { score, scoreBreakdown: breakdown };
};

const computeFieldFit = ({ rawText, targetFields }) => {
  const keywords = getKeywordsForFields(targetFields);
  if (!keywords.length) {
    return {
      keywordsMissing: [],
      skillsToAdd: [],
      projectsToBuild: [],
    };
  }

  const t = normalize(rawText);
  const missing = keywords.filter((kw) => !t.includes(kw.toLowerCase()));

  // skillsToAdd = missing keywords (trim to 12)
  const skillsToAdd = missing.slice(0, 12);

  const projectsToBuild = [];
  if (targetFields && targetFields.length) {
    projectsToBuild.push(
      `Build 2–3 portfolio projects aligned with: ${targetFields.join(', ')} (focus on measurable outcomes).`
    );
  }
  if (missing.includes('react')) projectsToBuild.push('Build a React app that consumes a public REST API with authentication.');
  if (missing.includes('sql')) projectsToBuild.push('Create a small analytics project: dataset → SQL queries → dashboard (Power BI/Tableau).');
  if (missing.includes('docker')) projectsToBuild.push('Dockerize a project and document setup (README + docker-compose).');

  return {
    keywordsMissing: missing.slice(0, 20),
    skillsToAdd,
    projectsToBuild: uniq(projectsToBuild).slice(0, 6),
  };
};

const buildRewriteTemplates = ({ targetFields }) => {
  return {
    summaryTemplate:
      'Summary (2–3 lines): [Your role/field] student with [X] projects in [keywords]. Seeking opportunities in [target field]. Strengths: [top skills], [tooling], [impact].',
    bulletTemplates: [
      'Built/implemented [feature] using [tech], improving [metric] by [number/%].',
      'Designed and delivered [project] end-to-end: [scope], [stack], [deployment], resulting in [outcome].',
      `Tailored to ${targetFields?.length ? targetFields.join(', ') : 'your target field'}: highlight the most relevant tools and keywords in each bullet.`,
    ],
  };
};

const computeAtsKeywords = ({ rawText, targetFields }) => {
  const curated = getKeywordsForFields(targetFields);
  const extracted = extractKeywordsFromText(rawText);
  // intersection-ish: keywords that are curated OR present in CV
  const set = new Set();
  curated.forEach((k) => set.add(k));
  extracted.slice(0, 120).forEach((k) => set.add(k));
  return Array.from(set).slice(0, 60);
};

const computeRedFlags = ({ rawText, structure, missingSections }) => {
  const flags = [];
  const t = normalize(rawText);
  const bullets = structure?.bullets || [];

  if (missingSections.length >= 3) flags.push('Your CV is missing multiple important sections.');
  if ((structure?.links || []).length === 0) flags.push('Add links (LinkedIn, GitHub, portfolio) to improve credibility.');
  if (bullets.length < 6) flags.push('Add more bullet points describing impact and responsibilities (aim for 2–5 per role/project).');
  if (!/\b(20\d{2}|19\d{2})\b/.test(rawText)) flags.push('Add dates (years/months) for education and experience.');
  if (!/\b(email|@)\b/.test(t)) flags.push('Make sure your email is included in contact information.');
  if (countMatches(rawText, /\b(responsible for|worked on|helped with)\b/gi) > 3) {
    flags.push('Avoid vague phrases (e.g., “worked on”). Use action verbs + measurable impact.');
  }
  return uniq(flags).slice(0, 10);
};

const computeActionableRecommendations = ({
  missingSections,
  fieldFit,
  redFlags,
  structure,
  scoreBreakdown,
  targetFields,
}) => {
  const recs = [];

  // Missing sections
  missingSections.forEach((s) => recs.push(`Add a clear ${s} section.`));

  // Field-fit suggestions
  if (fieldFit?.skillsToAdd?.length) {
    recs.push(`Add/learn: ${fieldFit.skillsToAdd.slice(0, 8).join(', ')} (based on your target field).`);
  }
  if (fieldFit?.projectsToBuild?.length) {
    recs.push(`Portfolio idea: ${fieldFit.projectsToBuild[0]}`);
  }

  // Quality recommendations derived from red flags
  if (redFlags.some((f) => f.toLowerCase().includes('links'))) {
    recs.push('Add links (LinkedIn + GitHub + portfolio) near your contact info.');
  }
  if (redFlags.some((f) => f.toLowerCase().includes('dates'))) {
    recs.push('Add dates (months/years) for each role/project and education entry.');
  }
  if (redFlags.some((f) => f.toLowerCase().includes('vague'))) {
    recs.push('Rewrite vague bullets using action verb + scope + measurable result (numbers/%/time saved).');
  }

  // Quantification and clarity (based on breakdown)
  if (typeof scoreBreakdown?.quantification === 'number' && scoreBreakdown.quantification < 12) {
    recs.push('Add metrics: users, % improvement, time saved, revenue impact, performance gains.');
  }
  if (typeof scoreBreakdown?.clarity === 'number' && scoreBreakdown.clarity < 12) {
    recs.push('Increase bullet clarity: 2–5 bullets per role/project, each describing a concrete achievement.');
  }
  if (typeof scoreBreakdown?.formatting === 'number' && scoreBreakdown.formatting < 12) {
    recs.push('Improve formatting: consistent headings, spacing, and keep CV within 1–2 pages if possible.');
  }

  // Bullet count suggestion
  const bulletCount = (structure?.bullets || []).length;
  if (bulletCount > 0 && bulletCount < 8) {
    recs.push('Add more achievement bullets (aim for at least 8–12 across experience/projects).');
  }

  // If no target fields were selected, suggest selecting them
  if (!targetFields?.length) {
    recs.push('Select 1–3 target fields to get more precise keyword and job title recommendations.');
  }

  // Guarantee at least a couple of recommendations
  if (recs.length < 3) {
    recs.push('Add a strong 2–3 line summary tailored to your target role.');
    recs.push('Make sure each project includes: stack, your role, and the outcome/impact.');
  }

  return uniq(recs).slice(0, 14);
};

const computeJobTitleSuggestions = ({ rawText, targetFields }) => {
  const baseTitles = getJobTitlesForFields(targetFields);
  if (!baseTitles.length) return [];

  const t = normalize(rawText);
  const scored = baseTitles.map((title) => {
    let score = 1;
    const lt = title.toLowerCase();
    if (lt.includes('react') && t.includes('react')) score += 3;
    if (lt.includes('node') && (t.includes('node') || t.includes('express'))) score += 3;
    if (lt.includes('data') && (t.includes('sql') || t.includes('pandas') || t.includes('power bi'))) score += 3;
    if (lt.includes('flutter') && t.includes('flutter')) score += 3;
    if (lt.includes('devops') && (t.includes('docker') || t.includes('kubernetes') || t.includes('ci/cd'))) score += 3;
    return { title, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 8).map((x) => x.title);
};

const sanitizeForStudent = (analysis) => {
  // Don’t echo raw contact details in analysis fields.
  const a = JSON.parse(JSON.stringify(analysis || {}));
  if (a?.debug) delete a.debug;
  return a;
};

function analyzeCvRules({ rawText, structure, targetFields = [], locale = 'en' }) {
  const effectiveFields =
    targetFields && targetFields.length ? targetFields : inferFieldsFromText(rawText);
  const missingSections = detectMissingSections(structure);
  const { score, scoreBreakdown } = computeScore({ rawText, structure, missingSections });
  const fieldFit = computeFieldFit({ rawText, targetFields: effectiveFields });
  const rewrite = buildRewriteTemplates({ targetFields: effectiveFields });
  const atsKeywords = computeAtsKeywords({ rawText, targetFields: effectiveFields });
  const redFlags = computeRedFlags({ rawText, structure, missingSections });
  const jobTitleSuggestions = computeJobTitleSuggestions({ rawText, targetFields: effectiveFields });
  const recommendations = computeActionableRecommendations({
    missingSections,
    fieldFit,
    redFlags,
    structure,
    scoreBreakdown,
    targetFields,
  });

  const analysis = {
    locale,
    score,
    scoreBreakdown,
    missingSections,
    fieldFit,
    rewrite,
    atsKeywords,
    redFlags,
    jobTitleSuggestions,
    recommendations,
  };

  return sanitizeForStudent(analysis);
}

module.exports = {
  analyzeCvRules,
  sanitizeForStudent,
};

