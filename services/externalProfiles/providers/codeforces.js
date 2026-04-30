const httpClient = require('../../../utils/httpClient');

async function syncCodeforces({ username }) {
  const url = `https://codeforces.com/api/user.info?handles=${encodeURIComponent(username)}`;
  const res = await httpClient.get(url, {
    headers: {
      'User-Agent': 'Freshlancer/1.0 (+https://freshlancer.online)',
    },
  });

  const body = res?.data;
  if (!body || body.status !== 'OK' || !Array.isArray(body.result) || !body.result[0]) {
    const err = new Error('Codeforces user not found');
    err.code = 'CF_USER_NOT_FOUND';
    throw err;
  }

  const u = body.result[0];

  return {
    provider: 'codeforces',
    badges: [],
    stats: {
      handle: u.handle,
      rank: u.rank,
      rating: u.rating,
      maxRank: u.maxRank,
      maxRating: u.maxRating,
      contribution: u.contribution,
      friendOfCount: u.friendOfCount,
      avatar: u.avatar,
      titlePhoto: u.titlePhoto,
      organization: u.organization,
    },
  };
}

module.exports = {
  syncCodeforces,
};

