const path = require('path');
const { extractTextFromCv } = require('./cvAnalysis/extractTextFromCv');
const {
  truncateText,
  normalizeSkillName,
  PROVIDER_KEYS,
} = require('../utils/clientStudentProfileHelpers');

const PROVIDER_LABELS = {
  leetcode: 'LeetCode',
  hackerrank: 'HackerRank',
  codeforces: 'Codeforces',
  github: 'GitHub',
};

function skillNames(student) {
  const raw = student?.studentProfile?.skills || [];
  return raw.map(normalizeSkillName).filter(Boolean);
}

function universityName(student) {
  const u = student?.studentProfile?.university;
  if (!u) return null;
  if (typeof u === 'string') return u;
  return u.name || null;
}

async function extractCvBullets(student, maxChars = 3000) {
  const resume = student?.studentProfile?.resume;
  if (!resume?.url) {
    return { available: false, bullets: ['No resume uploaded on profile.'] };
  }

  const relative = resume.url.replace(/^\//, '');
  const filePath = path.join(process.cwd(), relative);

  try {
    const ext = path.extname(resume.filename || filePath).toLowerCase();
    const mime =
      ext === '.pdf'
        ? 'application/pdf'
        : ext === '.docx'
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : undefined;

    const text = await extractTextFromCv({
      filePath,
      mimeType: mime,
      originalName: resume.filename,
      maxChars,
    });

    if (!text) {
      return { available: true, bullets: ['Resume file is empty or could not be parsed.'] };
    }

    const lines = text
      .split(/\n+/)
      .map((l) => l.trim())
      .filter((l) => l.length > 20)
      .slice(0, 5);

    const bullets =
      lines.length > 0
        ? lines.map((l) => truncateText(l, 160))
        : [truncateText(text, 200)];

    return { available: true, bullets };
  } catch {
    return {
      available: true,
      bullets: ['Resume on file but text extraction failed (unsupported format or corrupt file).'],
    };
  }
}

function buildExpertiseSection(student, applicationHistory) {
  const sp = student.studentProfile || {};
  const skills = skillNames(student);
  const bullets = [];

  if (sp.experienceLevel) {
    bullets.push(`Experience level: ${sp.experienceLevel}${sp.yearsOfExperience != null ? ` (${sp.yearsOfExperience} years)` : ''}.`);
  }
  if (sp.availability) bullets.push(`Availability: ${sp.availability}.`);
  if (universityName(student)) bullets.push(`University: ${universityName(student)}.`);
  if (skills.length) {
    bullets.push(`Skills: ${skills.slice(0, 12).join(', ')}${skills.length > 12 ? '…' : ''}.`);
  }

  const categories = [
    ...new Set(
      applicationHistory
        .map((a) => a.jobPost?.category)
        .filter(Boolean)
        .map((c) => String(c).replace(/-/g, ' '))
    ),
  ];
  if (categories.length) {
    bullets.push(`Applied to your jobs in: ${categories.join(', ')}.`);
  }

  const portfolio = sp.portfolio || [];
  if (portfolio.length) {
    bullets.push(
      `Portfolio: ${portfolio.length} project(s) — e.g. "${portfolio[0].title || 'Untitled'}".`
    );
  }

  if (sp.bio) {
    bullets.push(`Bio: ${truncateText(sp.bio, 220)}`);
  }

  if (bullets.length === 0) bullets.push('Limited profile details available.');

  return { title: 'Expertise & skills', bullets };
}

function buildApplicationsSection(applicationHistory) {
  if (!applicationHistory.length) {
    return {
      title: 'Applications to your jobs',
      bullets: ['This student has not applied to any of your job posts yet.'],
    };
  }

  const bullets = applicationHistory.map((app) => {
    const title = app.jobPost?.title || 'Job';
    const cat = app.jobPost?.category
      ? ` (${String(app.jobPost.category).replace(/-/g, ' ')})`
      : '';
    const date = app.createdAt
      ? new Date(app.createdAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : '';
    const status = app.status ? ` — ${app.status}` : '';
    let line = `${title}${cat}${status}, applied ${date}`;
    if (app.proposalText) {
      line += ` — "${truncateText(app.proposalText, 180)}"`;
    }
    return line;
  });

  return { title: 'Applications to your jobs', bullets };
}

function buildEducationSection(educationBadges) {
  const entities = educationBadges?.entities || educationBadges || [];
  if (!Array.isArray(entities) || entities.length === 0) {
    return {
      title: 'Education certificates',
      bullets: ['No partner education badges on profile.'],
    };
  }

  const bullets = [];
  for (const row of entities) {
    const name = row.entity?.name || 'Partner';
    const certs = row.certificates || [];
    if (certs.length === 0) {
      bullets.push(`${name}: certificates on file.`);
      continue;
    }
    for (const c of certs.slice(0, 3)) {
      const track = c.track ? ` (${c.track})` : '';
      const cat = c.category?.name ? ` [${c.category.name}]` : '';
      bullets.push(`${name}: ${c.title}${track}${cat}`);
    }
    if (certs.length > 3) {
      bullets.push(`${name}: +${certs.length - 3} more certificate(s).`);
    }
  }

  return { title: 'Education certificates', bullets };
}

function buildPlatformsSection(externalProfiles) {
  const providers = externalProfiles?.providers || {};
  const badges = Array.isArray(externalProfiles?.badges) ? externalProfiles.badges : [];
  const bullets = [];

  for (const key of PROVIDER_KEYS) {
    const p = providers[key];
    if (!p?.username) continue;
    const label = PROVIDER_LABELS[key] || key;
    const count = badges.filter((b) => b.provider === key).length;
    let line = `${label}: @${p.username}`;
    if (count) line += ` — ${count} badge(s) synced`;
    if (p.syncStatus === 'linkOnly') line += ' (profile link only)';
    bullets.push(line);
  }

  const stats = externalProfiles?.stats || {};
  for (const key of PROVIDER_KEYS) {
    const s = stats[key];
    if (!s || typeof s !== 'object') continue;
    if (key === 'github' && s.publicRepos != null) {
      bullets.push(`GitHub stats: ${s.publicRepos} public repos${s.followers != null ? `, ${s.followers} followers` : ''}.`);
    }
    if (key === 'leetcode' && s.totalSolved != null) {
      bullets.push(`LeetCode: ${s.totalSolved} problems solved.`);
    }
  }

  if (bullets.length === 0) {
    return {
      title: 'Coding platforms',
      bullets: ['No connected coding platforms on profile.'],
    };
  }

  return { title: 'Coding platforms', bullets };
}

async function buildStudentProfileSummary({
  student,
  educationBadges,
  applicationHistory,
  externalProfiles,
}) {
  const sp = student.studentProfile || {};
  const cv = await extractCvBullets(student);

  const sections = [
    buildExpertiseSection(student, applicationHistory),
    buildApplicationsSection(applicationHistory),
    buildEducationSection(educationBadges),
    buildPlatformsSection(externalProfiles),
    { title: 'CV highlights', bullets: cv.bullets },
  ];

  const headlineParts = [student.name || 'Student'];
  if (sp.experienceLevel) headlineParts.push(sp.experienceLevel);
  if (universityName(student)) headlineParts.push(universityName(student));

  return {
    headline: headlineParts.join(' · '),
    sections,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  buildStudentProfileSummary,
};
