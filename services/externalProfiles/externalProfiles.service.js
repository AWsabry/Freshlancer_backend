const logger = require('../../utils/logger');
const User = require('../../models/userModel');
const { PROVIDERS, DEFAULT_SYNC_TTL_MS } = require('./externalProfiles.constants');
const { shouldSyncProvider } = require('./externalProfiles.utils');

const { syncLeetCode } = require('./providers/leetcode');
const { syncCodeforces } = require('./providers/codeforces');
const { syncGitHub } = require('./providers/github');
const { syncHackerRank } = require('./providers/hackerrank');

const providerSyncers = {
  leetcode: syncLeetCode,
  codeforces: syncCodeforces,
  github: syncGitHub,
  hackerrank: syncHackerRank,
};

async function syncExternalProfilesForStudent(studentId, { provider, force = false, ttlMs = DEFAULT_SYNC_TTL_MS } = {}) {
  const user = await User.findById(studentId).select('role studentProfile.externalProfiles');
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }
  if (user.role !== 'student') {
    const err = new Error('Only students can sync external profiles');
    err.statusCode = 403;
    throw err;
  }

  const requestedProviders = provider ? [provider] : PROVIDERS;

  const externalProfiles = user.studentProfile?.externalProfiles || {};
  const providersDoc = externalProfiles.providers || {};
  const currentBadges = Array.isArray(externalProfiles.badges) ? externalProfiles.badges : [];
  const currentStats = externalProfiles.stats && typeof externalProfiles.stats === 'object'
    ? externalProfiles.stats
    : {};

  const nextBadgesByProvider = new Map();
  currentBadges.forEach((b) => {
    if (!b?.provider) return;
    if (!nextBadgesByProvider.has(b.provider)) nextBadgesByProvider.set(b.provider, []);
    nextBadgesByProvider.get(b.provider).push(b);
  });

  const nextStats = { ...currentStats };
  const results = [];

  for (const p of requestedProviders) {
    if (!providerSyncers[p]) continue;

    const providerDoc = providersDoc[p] || {};
    const username = providerDoc.username;

    // If not connected, keep as-is.
    if (!username) {
      results.push({ provider: p, skipped: true, reason: 'notConnected' });
      continue;
    }

    if (!shouldSyncProvider(providerDoc, { force, ttlMs })) {
      results.push({ provider: p, skipped: true, reason: 'cached' });
      continue;
    }

    try {
      const syncer = providerSyncers[p];
      const data = await syncer({ username });

      // Update cached badges + stats
      nextBadgesByProvider.set(p, data.badges || []);
      nextStats[p] = data.stats || {};

      // Update provider sync metadata
      user.studentProfile.externalProfiles.providers[p].lastSyncedAt = new Date();
      user.studentProfile.externalProfiles.providers[p].syncStatus = p === 'hackerrank' ? 'linkOnly' : 'synced';
      user.studentProfile.externalProfiles.providers[p].syncError = undefined;

      results.push({ provider: p, synced: true });
    } catch (e) {
      const msg = e?.message || 'Sync failed';
      logger.error('External profile sync failed', { provider: p, studentId, error: msg });
      user.studentProfile.externalProfiles.providers[p].lastSyncedAt = new Date();
      user.studentProfile.externalProfiles.providers[p].syncStatus = 'error';
      user.studentProfile.externalProfiles.providers[p].syncError = msg.slice(0, 500);
      results.push({ provider: p, synced: false, error: msg });
    }
  }

  // Rebuild badge list in a stable order.
  const mergedBadges = [];
  for (const p of PROVIDERS) {
    const list = nextBadgesByProvider.get(p);
    if (Array.isArray(list) && list.length) mergedBadges.push(...list);
  }
  user.studentProfile.externalProfiles.badges = mergedBadges;
  user.studentProfile.externalProfiles.stats = nextStats;

  await user.save({ validateBeforeSave: false });

  return {
    externalProfiles: user.studentProfile.externalProfiles,
    results,
  };
}

module.exports = {
  syncExternalProfilesForStudent,
};

