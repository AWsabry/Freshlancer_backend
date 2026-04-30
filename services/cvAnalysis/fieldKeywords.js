/**
 * Minimal curated keyword seeds per field.
 * Keys are normalized (lowercase). We match against both category names and common aliases.
 *
 * This is intentionally small to keep output predictable.
 * You can expand over time (or move to DB + admin UI later).
 */

const FIELD_KEYWORDS = {
  'frontend': [
    'javascript',
    'typescript',
    'react',
    'vue',
    'angular',
    'html',
    'css',
    'tailwind',
    'redux',
    'vite',
    'webpack',
    'responsive',
    'accessibility',
  ],
  'backend': [
    'node',
    'express',
    'python',
    'django',
    'flask',
    'java',
    'spring',
    'api',
    'rest',
    'graphql',
    'postgresql',
    'mongodb',
    'redis',
    'docker',
    'authentication',
  ],
  'data': [
    'python',
    'sql',
    'pandas',
    'numpy',
    'excel',
    'power bi',
    'tableau',
    'statistics',
    'etl',
    'data visualization',
  ],
  'ui/ux': [
    'figma',
    'wireframe',
    'prototype',
    'design system',
    'ux research',
    'user flows',
    'usability',
    'information architecture',
  ],
  'mobile': [
    'flutter',
    'dart',
    'react native',
    'android',
    'kotlin',
    'ios',
    'swift',
  ],
  'devops': [
    'docker',
    'kubernetes',
    'ci/cd',
    'github actions',
    'aws',
    'gcp',
    'azure',
    'linux',
    'terraform',
    'monitoring',
  ],
};

const FIELD_JOB_TITLES = {
  frontend: [
    'Frontend Developer',
    'React Developer',
    'UI Developer',
    'Web Developer',
    'Junior Frontend Developer',
  ],
  backend: [
    'Backend Developer',
    'Node.js Developer',
    'API Developer',
    'Junior Backend Developer',
    'Software Engineer (Backend)',
  ],
  data: [
    'Data Analyst',
    'Junior Data Analyst',
    'Business Intelligence Analyst',
    'Data Scientist (Junior)',
    'Reporting Analyst',
  ],
  'ui/ux': [
    'UI/UX Designer',
    'Product Designer (Junior)',
    'UX Research Assistant',
    'UX Designer',
  ],
  mobile: [
    'Mobile Developer',
    'Flutter Developer',
    'React Native Developer',
    'Android Developer (Junior)',
    'iOS Developer (Junior)',
  ],
  devops: [
    'DevOps Engineer (Junior)',
    'Cloud Engineer (Junior)',
    'Site Reliability Engineer (Junior)',
    'Infrastructure Engineer',
  ],
};

const normalize = (s) => String(s || '').toLowerCase().trim();

const resolveFieldKey = (fieldName) => {
  const f = normalize(fieldName);
  if (!f) return null;
  if (FIELD_KEYWORDS[f]) return f;

  // aliases
  if (/(front\s*end|frontend|ui)/.test(f)) return 'frontend';
  if (/(back\s*end|backend|server)/.test(f)) return 'backend';
  if (/(data|analytics|analysis)/.test(f)) return 'data';
  if (/(ux|ui\/ux|design)/.test(f)) return 'ui/ux';
  if (/(mobile|flutter|react\s*native|android|ios)/.test(f)) return 'mobile';
  if (/(devops|cloud|infra)/.test(f)) return 'devops';
  return null;
};

const getKeywordsForFields = (fields) => {
  const set = new Set();
  (fields || []).forEach((f) => {
    const k = resolveFieldKey(f);
    if (!k) return;
    (FIELD_KEYWORDS[k] || []).forEach((kw) => set.add(kw));
  });
  return Array.from(set);
};

const getJobTitlesForFields = (fields) => {
  const set = new Set();
  (fields || []).forEach((f) => {
    const k = resolveFieldKey(f);
    if (!k) return;
    (FIELD_JOB_TITLES[k] || []).forEach((t) => set.add(t));
  });
  return Array.from(set);
};

module.exports = {
  getKeywordsForFields,
  getJobTitlesForFields,
  resolveFieldKey,
  FIELD_KEYWORDS,
  FIELD_JOB_TITLES,
};

