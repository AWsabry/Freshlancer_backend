const httpClient = require('../../../utils/httpClient');

async function syncGitHub({ username }) {
  const res = await httpClient.get(
    `https://api.github.com/users/${encodeURIComponent(username)}`,
    {
      headers: {
        'User-Agent': 'Freshlancer/1.0 (+https://freshlancer.online)',
        Accept: 'application/vnd.github+json',
      },
    }
  );

  const u = res?.data;
  if (!u || !u.login) {
    const err = new Error('GitHub user not found');
    err.code = 'GH_USER_NOT_FOUND';
    throw err;
  }

  return {
    provider: 'github',
    badges: [],
    stats: {
      login: u.login,
      name: u.name,
      company: u.company,
      blog: u.blog,
      location: u.location,
      bio: u.bio,
      twitterUsername: u.twitter_username,
      publicRepos: u.public_repos,
      publicGists: u.public_gists,
      followers: u.followers,
      following: u.following,
      createdAt: u.created_at,
      updatedAt: u.updated_at,
      avatarUrl: u.avatar_url,
      profileUrl: u.html_url,
    },
  };
}

module.exports = {
  syncGitHub,
};

