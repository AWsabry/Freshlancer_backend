const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const apiRoot = path.join(__dirname, '..');

const ENV_CANDIDATES = {
  production: [
    '.config.production.env',
    'config.production.env',
    '.env.production',
    '.env',
  ],
  development: [
    '.config.development.env',
    'config.development.env',
    '.env.development',
    '.env',
  ],
};

const LEGACY_ENV = 'config.env';

function resolveExplicitPath(explicit) {
  if (path.isAbsolute(explicit)) {
    return explicit;
  }
  const fromApiRoot = path.resolve(apiRoot, explicit);
  if (fs.existsSync(fromApiRoot)) {
    return fromApiRoot;
  }
  return path.resolve(process.cwd(), explicit);
}

function resolveEnvPath() {
  const explicit = process.env.DOTENV_CONFIG_PATH || process.env.ENV_FILE;
  if (explicit) {
    return resolveExplicitPath(explicit);
  }

  const isProd = process.env.NODE_ENV === 'production';
  const names = isProd ? ENV_CANDIDATES.production : ENV_CANDIDATES.development;

  for (const name of names) {
    const candidate = path.join(apiRoot, name);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  const legacy = path.join(apiRoot, LEGACY_ENV);
  if (fs.existsSync(legacy)) {
    return legacy;
  }

  return path.join(apiRoot, names[0]);
}

function formatExpectedPaths() {
  const isProd = process.env.NODE_ENV === 'production';
  const names = isProd ? ENV_CANDIDATES.production : ENV_CANDIDATES.development;
  return [...names.map((n) => path.join(apiRoot, n)), path.join(apiRoot, LEGACY_ENV)];
}

function loadEnv(options = {}) {
  const required = options.required !== false;
  const envPath = resolveEnvPath();

  if (!fs.existsSync(envPath)) {
    const hint =
      process.env.NODE_ENV === 'production'
        ? 'On the server, create .config.production.env in the API folder.'
        : 'Create .config.development.env in the API folder.';
    const msg = `[loadEnv] Env file not found: ${envPath}\n[loadEnv] Checked:\n${formatExpectedPaths()
      .map((p) => `  - ${p}`)
      .join('\n')}\n[loadEnv] ${hint}`;

    if (required) {
      console.error(msg);
      process.exit(1);
    }
    console.warn(msg);
    return { path: envPath, loaded: false };
  }

  const result = dotenv.config({ path: envPath });
  if (result.error) {
    console.error(`[loadEnv] Failed to parse ${envPath}:`, result.error.message);
    process.exit(1);
  }

  const count = result.parsed ? Object.keys(result.parsed).length : 0;
  console.log(`[loadEnv] Loaded ${envPath} (${count} variables)`);
  return { path: envPath, loaded: true };
}

module.exports = { loadEnv, resolveEnvPath, formatExpectedPaths, apiRoot };
