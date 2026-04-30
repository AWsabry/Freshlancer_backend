async function syncHackerRank({ username }) {
  // HackerRank does not provide a stable public API for badges/stats.
  // We keep it link-only and rely on profileUrl + username display.
  return {
    provider: 'hackerrank',
    badges: [],
    stats: {
      linkOnly: true,
      username,
    },
  };
}

module.exports = {
  syncHackerRank,
};

