const { PROVIDERS, DEFAULT_SYNC_TTL_MS } = require('./externalProfiles.constants');

function normalizeUsername(username) {
  if (username === null) return null;
  if (username === undefined) return undefined;
  if (typeof username !== 'string') return undefined;
  const trimmed = username.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
}

function getProviderProfileUrl(provider, username) {
  if (!username) return null;

  switch (provider) {
    case 'leetcode':
      return `https://leetcode.com/${username}/`;
    case 'hackerrank':
      return `https://www.hackerrank.com/profile/${username}`;
    case 'codeforces':
      return `https://codeforces.com/profile/${username}`;
    case 'github':
      return `https://github.com/${username}`;
    default:
      return null;
  }
}

function shouldSyncProvider(providerDoc, { force = false, ttlMs = DEFAULT_SYNC_TTL_MS } = {}) {
  if (force) return true;
  if (!providerDoc?.username) return false;
  if (!providerDoc?.lastSyncedAt) return true;
  const last = new Date(providerDoc.lastSyncedAt).getTime();
  if (!Number.isFinite(last)) return true;
  return Date.now() - last > ttlMs;
}

function isSupportedProvider(provider) {
  return PROVIDERS.includes(provider);
}

module.exports = {
  normalizeUsername,
  getProviderProfileUrl,
  shouldSyncProvider,
  isSupportedProvider,
};

