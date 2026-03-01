function isEmptyValue(val) {
  if (val === undefined || val === null) return true;
  if (typeof val === 'string' && val.trim() === '') return true;
  if (Array.isArray(val) && val.length === 0) return true;
  return false;
}

function normalizeSpecValuesInput(input) {
  if (!input) return {};
  if (input instanceof Map) {
    return Object.fromEntries(input.entries());
  }
  if (typeof input === 'object' && !Array.isArray(input)) {
    return { ...input };
  }
  return {};
}

function coerceAndValidateSpecValue(def, rawValue) {
  const key = def.key;

  if (def.type === 'boolean') {
    if (typeof rawValue === 'boolean') return rawValue;
    if (rawValue === 'true') return true;
    if (rawValue === 'false') return false;
    throw new Error(`Spec "${key}" must be a boolean`);
  }

  if (def.type === 'number') {
    const num =
      typeof rawValue === 'number'
        ? rawValue
        : typeof rawValue === 'string'
          ? Number(rawValue)
          : NaN;
    if (Number.isNaN(num)) {
      throw new Error(`Spec "${key}" must be a number`);
    }
    if (def.min !== undefined && num < def.min) {
      throw new Error(`Spec "${key}" must be >= ${def.min}`);
    }
    if (def.max !== undefined && num > def.max) {
      throw new Error(`Spec "${key}" must be <= ${def.max}`);
    }
    return num;
  }

  if (def.type === 'select') {
    const val =
      typeof rawValue === 'string' ? rawValue.trim() : String(rawValue).trim();
    if (!val) throw new Error(`Spec "${key}" must be a non-empty string`);
    const options = Array.isArray(def.options) ? def.options : [];
    if (!options.includes(val)) {
      throw new Error(`Spec "${key}" must be one of: ${options.join(', ')}`);
    }
    return val;
  }

  if (def.type === 'multi_select') {
    if (!Array.isArray(rawValue)) {
      throw new Error(`Spec "${key}" must be an array`);
    }
    const options = Array.isArray(def.options) ? def.options : [];
    const normalized = rawValue
      .map((v) => (typeof v === 'string' ? v.trim() : String(v).trim()))
      .filter(Boolean);
    const unique = Array.from(new Set(normalized));
    for (const v of unique) {
      if (!options.includes(v)) {
        throw new Error(`Spec "${key}" contains invalid option "${v}"`);
      }
    }
    return unique;
  }

  throw new Error(`Spec "${key}" has unsupported type "${def.type}"`);
}

function validateCategorySpecValues(category, valuesInput, context) {
  const values = normalizeSpecValuesInput(valuesInput);
  const specs = Array.isArray(category?.specs) ? category.specs : [];

  // Include inactive definitions too (still "known"), but required/default only apply to active.
  const knownSpecsIncludingInactive = specs.filter((s) => {
    if (!s) return false;
    if (context === 'job') return s.useInJobPost === true;
    if (context === 'application') return s.useInApplication === true;
    return false;
  });

  const defByKey = new Map(knownSpecsIncludingInactive.map((s) => [s.key, s]));

  // Reject unknown keys
  for (const key of Object.keys(values)) {
    if (!defByKey.has(key)) {
      throw new Error(`Unknown category spec key "${key}"`);
    }
  }

  const cleaned = {};
  for (const def of knownSpecsIncludingInactive) {
    const key = def.key;
    const raw = values[key];

    // Inactive specs are optional but still validated if present (preserve legacy data)
    if (def.isActive === false) {
      if (!isEmptyValue(raw)) {
        cleaned[key] = coerceAndValidateSpecValue(def, raw);
      }
      continue;
    }

    const required =
      context === 'job' ? def.requiredInJobPost : def.requiredInApplication;

    if (isEmptyValue(raw)) {
      if (required) {
        if (def.defaultValue !== undefined) {
          cleaned[key] = coerceAndValidateSpecValue(def, def.defaultValue);
        } else {
          throw new Error(`Spec "${key}" is required`);
        }
      }
      continue;
    }

    cleaned[key] = coerceAndValidateSpecValue(def, raw);
  }

  return cleaned;
}

module.exports = {
  validateCategorySpecValues,
  normalizeSpecValuesInput,
  coerceAndValidateSpecValue,
  enforceCompatibilityWithJobRequirements: function (
    category,
    jobRequirementsInput,
    applicationAnswersInput
  ) {
    const requirements = normalizeSpecValuesInput(jobRequirementsInput);
    const answers = normalizeSpecValuesInput(applicationAnswersInput);

    const specs = Array.isArray(category?.specs) ? category.specs : [];
    const bothSpecs = specs.filter(
      (s) =>
        s &&
        s.isActive !== false &&
        s.useInJobPost === true &&
        s.useInApplication === true
    );

    for (const def of bothSpecs) {
      const key = def.key;
      if (!(key in requirements)) continue;
      const reqValRaw = requirements[key];

      // If job specifies a requirement, auto-fill missing answer (locks in UI).
      if (isEmptyValue(answers[key])) {
        answers[key] = reqValRaw;
      }

      const reqVal = coerceAndValidateSpecValue(def, reqValRaw);
      const ansVal = coerceAndValidateSpecValue(def, answers[key]);

      if (def.type === 'select' || def.type === 'boolean') {
        if (ansVal !== reqVal) {
          throw new Error(`Spec "${key}" must match the job requirement`);
        }
      } else if (def.type === 'number') {
        // Treat job requirement as max value
        if (ansVal > reqVal) {
          throw new Error(`Spec "${key}" must be <= ${reqVal}`);
        }
      } else if (def.type === 'multi_select') {
        const reqArr = Array.isArray(reqVal) ? reqVal : [];
        const ansArr = Array.isArray(ansVal) ? ansVal : [];
        const reqSet = new Set(reqArr);
        for (const v of ansArr) {
          if (!reqSet.has(v)) {
            throw new Error(
              `Spec "${key}" must be a subset of the job requirement options`
            );
          }
        }
      }
    }

    return answers;
  },
};

