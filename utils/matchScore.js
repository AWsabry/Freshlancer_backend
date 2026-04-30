function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function toNumber(val) {
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  if (typeof val === 'string' && val.trim() !== '') {
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizeStringArray(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((s) => (typeof s === 'string' ? s.trim().toLowerCase() : ''))
    .filter(Boolean);
}

function normalizeMapLike(val) {
  if (!val) return {};
  if (val instanceof Map) {
    try {
      return Object.fromEntries(val.entries());
    } catch {
      return {};
    }
  }
  if (typeof val === 'object' && !Array.isArray(val)) return val;
  return {};
}

function scoreCategorySpecs({ answers, requirements }) {
  const ans = normalizeMapLike(answers);
  const req = normalizeMapLike(requirements);
  const keys = Object.keys(req);
  if (keys.length === 0) return { points: 0, maxPoints: 4, considered: 0, matched: 0 };

  let considered = 0;
  let matched = 0;

  for (const key of keys) {
    const r = req[key];
    if (r === undefined || r === null || r === '') continue;
    if (Array.isArray(r) && r.length === 0) continue;

    const a = ans[key];
    if (a === undefined || a === null || a === '') {
      considered += 1;
      continue;
    }

    considered += 1;

    // number requirement: answer must be <= requirement
    const rNum = toNumber(r);
    const aNum = toNumber(a);
    if (rNum !== null && aNum !== null) {
      if (aNum <= rNum) matched += 1;
      continue;
    }

    // boolean/string/array compatibility
    if (typeof r === 'boolean') {
      if (typeof a === 'boolean' && a === r) matched += 1;
      continue;
    }

    if (Array.isArray(r)) {
      if (Array.isArray(a)) {
        const aSet = new Set(a.map((v) => String(v)));
        const ok = Array.from(aSet).every((v) => r.includes(v));
        if (ok) matched += 1;
      } else {
        if (r.includes(a)) matched += 1;
      }
      continue;
    }

    if (Array.isArray(a)) {
      if (a.includes(r)) matched += 1;
      continue;
    }

    if (String(a) === String(r)) matched += 1;
  }

  if (considered === 0) return { points: 0, maxPoints: 4, considered: 0, matched: 0 };
  const ratio = matched / considered;
  return { points: ratio * 4, maxPoints: 4, considered, matched };
}

function scoreSkills({ jobSkills, studentSkills }) {
  const required = normalizeStringArray(jobSkills);
  if (required.length === 0) return { points: 0, maxPoints: 3, matched: 0, total: 0 };
  const student = new Set(normalizeStringArray(studentSkills));
  let matched = 0;
  for (const s of required) if (student.has(s)) matched += 1;
  const ratio = matched / required.length;
  return { points: ratio * 3, maxPoints: 3, matched, total: required.length };
}

function scoreExperience({ jobLevel, studentLevel }) {
  const order = {
    Beginner: 1,
    Intermediate: 2,
    Advanced: 3,
    Expert: 4,
  };
  const j = order[jobLevel] || null;
  const s = order[studentLevel] || null;
  if (!j || !s) return { points: 0, maxPoints: 2, diff: null };
  const diff = Math.abs(j - s);
  const points = diff === 0 ? 2 : diff === 1 ? 1 : 0;
  return { points, maxPoints: 2, diff };
}

function scoreBudget({ jobBudget, proposedBudget }) {
  const min = toNumber(jobBudget?.min);
  const max = toNumber(jobBudget?.max);
  const amt = toNumber(proposedBudget?.amount);
  if (min === null || max === null || amt === null) {
    return { points: 0, maxPoints: 1, within: null };
  }
  const within = amt >= min && amt <= max;
  return { points: within ? 1 : 0, maxPoints: 1, within };
}

/**
 * Compute 0–10 match score for a job application.
 * Returns integer score plus a safe breakdown.
 */
function computeApplicationMatchScore({ jobPost, application, student }) {
  const category = scoreCategorySpecs({
    answers: application?.categorySpecAnswers,
    requirements: jobPost?.categorySpecRequirements,
  });

  const skills = scoreSkills({
    jobSkills: jobPost?.skillsRequired,
    studentSkills: student?.studentProfile?.skills,
  });

  const experience = scoreExperience({
    jobLevel: jobPost?.experienceLevel,
    studentLevel: student?.studentProfile?.experienceLevel,
  });

  const budget = scoreBudget({
    jobBudget: jobPost?.budget,
    proposedBudget: application?.proposedBudget,
  });

  const totalRaw = category.points + skills.points + experience.points + budget.points;
  const score = clamp(Math.round(totalRaw), 0, 10);

  return {
    score,
    breakdown: {
      categorySpecs: {
        points: clamp(Math.round(category.points * 10) / 10, 0, 4),
        maxPoints: 4,
        considered: category.considered,
        matched: category.matched,
      },
      skills: {
        points: clamp(Math.round(skills.points * 10) / 10, 0, 3),
        maxPoints: 3,
        matched: skills.matched,
        total: skills.total,
      },
      experience: {
        points: clamp(experience.points, 0, 2),
        maxPoints: 2,
        diff: experience.diff,
      },
      budget: {
        points: clamp(budget.points, 0, 1),
        maxPoints: 1,
        within: budget.within,
      },
    },
  };
}

module.exports = { computeApplicationMatchScore };

