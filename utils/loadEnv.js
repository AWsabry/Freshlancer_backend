const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const apiRoot = path.join(__dirname, '..');

/**
 * Resolves which .env file to load.
 * 1) DOTENV_CONFIG_PATH or ENV_FILE (absolute or relative to CWD) — for CI, PM2, manual override
 * 2) NODE_ENV === 'production' → config.production.env
 * 3) else → config.development.env
 * 4) If the chosen file is missing and config.env exists → config.env (deprecated, logs once)
 */
function resolveEnvPath() {
  const explicit =
    process.env.DOTENV_CONFIG_PATH || process.env.ENV_FILE;
  if (explicit) {
    return path.isAbsolute(explicit)
      ? explicit
      : path.resolve(process.cwd(), explicit);
  }

  const isProd = process.env.NODE_ENV === 'production';
  const primary = path.join(
    apiRoot,
    isProd ? 'config.production.env' : 'config.development.env'
  );

  if (fs.existsSync(primary)) {
    return primary;
  }

  const legacy = path.join(apiRoot, 'config.env');
  if (fs.existsSync(legacy)) {
    // eslint-disable-next-line no-console
    console.warn(
      `[loadEnv] Using legacy ${path.basename(legacy)}. Prefer config.development.env / config.production.env (copy from *.example).`
    );
    return legacy;
  }

  return primary;
}

/**
 * Load dotenv from the resolved path. Call before reading process.env.
 * @returns {{ path: string }} The file path that was used (or attempted).
 */
function loadEnv() {
  const envPath = resolveEnvPath();
  dotenv.config({ path: envPath });
  return { path: envPath };
}

module.exports = { loadEnv, resolveEnvPath, apiRoot };
