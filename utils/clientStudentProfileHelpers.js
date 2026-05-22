const PROVIDER_KEYS = ['leetcode', 'hackerrank', 'codeforces', 'github'];

function sanitizeExternalProfilesPublic(externalProfiles) {
  if (!externalProfiles || typeof externalProfiles !== 'object') {
    return { providers: {}, badges: [], stats: {} };
  }

  const providers = {};
  const rawProviders = externalProfiles.providers || {};
  for (const key of PROVIDER_KEYS) {
    const p = rawProviders[key];
    if (!p || typeof p !== 'object') continue;
    providers[key] = {
      username: p.username || null,
      profileUrl: p.profileUrl || null,
      syncStatus: p.syncStatus || null,
      lastSyncedAt: p.lastSyncedAt || null,
    };
  }

  const badges = Array.isArray(externalProfiles.badges)
    ? externalProfiles.badges.map((b) => ({
        provider: b.provider,
        name: b.name,
        level: b.level,
        iconUrl: b.iconUrl,
        earnedAt: b.earnedAt,
      }))
    : [];

  const stats = {};
  if (externalProfiles.stats && typeof externalProfiles.stats === 'object') {
    for (const key of PROVIDER_KEYS) {
      if (externalProfiles.stats[key]) {
        stats[key] = externalProfiles.stats[key];
      }
    }
  }

  return { providers, badges, stats };
}

function truncateText(text, maxLen) {
  const s = String(text || '').trim();
  if (!s) return '';
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen)}…`;
}

function normalizeSkillName(skill) {
  if (typeof skill === 'string') return skill.trim();
  if (skill && typeof skill === 'object') return String(skill.name || skill).trim();
  return '';
}

module.exports = {
  sanitizeExternalProfilesPublic,
  truncateText,
  normalizeSkillName,
  PROVIDER_KEYS,
};
