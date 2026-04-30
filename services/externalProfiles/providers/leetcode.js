const httpClient = require('../../../utils/httpClient');

async function fetchLeetCodeBadges(username) {
  const query = `
    query userBadges($username: String!) {
      matchedUser(username: $username) {
        badges {
          id
          name
          shortName
          displayName
          icon
          hoverText
          creationDate
          category
        }
        upcomingBadges {
          name
          icon
          progress
        }
      }
    }
  `;

  const res = await httpClient.post('https://leetcode.com/graphql', {
    operationName: 'userBadges',
    variables: { username },
    query,
  }, {
    headers: {
      // Avoid being blocked as a bot; keep it simple.
      'User-Agent': 'Freshlancer/1.0 (+https://freshlancer.online)',
    },
  });

  const matchedUser = res?.data?.data?.matchedUser;
  if (!matchedUser) {
    const err = new Error('LeetCode user not found');
    err.code = 'LC_USER_NOT_FOUND';
    throw err;
  }

  const badges = Array.isArray(matchedUser.badges) ? matchedUser.badges : [];
  const upcomingBadges = Array.isArray(matchedUser.upcomingBadges)
    ? matchedUser.upcomingBadges
    : [];

  return { badges, upcomingBadges };
}

function normalizeLeetCodeBadges(rawBadges = []) {
  return rawBadges.map((b) => ({
    provider: 'leetcode',
    id: b.id || b.name || b.shortName || undefined,
    name: b.name || b.shortName || b.displayName,
    displayName: b.displayName || b.name || b.shortName,
    iconUrl: b.icon || undefined,
    earnedAt: b.creationDate ? new Date(b.creationDate * 1000) : undefined,
    meta: {
      shortName: b.shortName,
      hoverText: b.hoverText,
      category: b.category,
    },
  }));
}

async function syncLeetCode({ username }) {
  const { badges, upcomingBadges } = await fetchLeetCodeBadges(username);

  return {
    provider: 'leetcode',
    badges: normalizeLeetCodeBadges(badges),
    stats: {
      upcomingBadges: upcomingBadges.map((b) => ({
        name: b.name,
        iconUrl: b.icon,
        progress: b.progress,
      })),
    },
  };
}

module.exports = {
  syncLeetCode,
};

