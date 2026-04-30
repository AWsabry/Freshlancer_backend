# Freshlancer API

Express/MongoDB backend for Freshlancer. Configuration is loaded via [`utils/loadEnv.js`](utils/loadEnv.js).

**Runtime:** Node **18.18+** (recommended: 20 LTS). The stack uses **Mongoose 9** with the **MongoDB Node driver 7** (no `useNewUrlParser` / `useUnifiedTopology` / `useFindAndModify` in `mongoose.connect`). Your Atlas or self-hosted MongoDB server should run a **currently supported MongoDB release** (6.x–8.x is typical with this driver).

## Environment

| File | When |
|------|------|
| `config.development.env` | `NODE_ENV` is not `production` (e.g. `npm run dev`) |
| `config.production.env` | `NODE_ENV=production` (e.g. `npm run start:prod`, PM2 `--env production`) |

**Templates (safe to commit):** `config.development.env.example`, `config.production.env.example` — copy to the filenames above and fill in secrets. Both local env files are gitignored.

**Override path (CI or one-off):** set `DOTENV_CONFIG_PATH` or `ENV_FILE` to an absolute or cwd-relative path; that file is loaded instead of the table above.

**Legacy:** if the resolved file is missing and `config.env` exists, it is used once with a deprecation warning. Prefer splitting into development vs production files.

**Commands**

- **Local development (test/staging database):** `npm run dev` — sets `NODE_ENV=development` and loads `config.development.env`.
- **Production mode locally (uses production file):** `npm run start:prod` — use only on machines that should use production data.
- **Default `npm start`:** `node server.js` — if `NODE_ENV` is unset, the non-production file is used (`config.development.env` or legacy `config.env`).

**PM2:** `pm2 start ecosystem.config.js --env production` so `NODE_ENV=production` and the server loads `config.production.env` on the host.

## Branches and releases

- **`master`** — code deployed to **production** (production MongoDB and URLs on the server only).
- **`dev`** — integration branch; deploy with **development** env and test database.
- **Feature / `demo/*` branches** — branch from `dev`, open PRs into `dev`. When ready to release, merge `dev` → `master` and deploy with production configuration.

## Scripts and migrations

One-off scripts and migrations in `scripts/` and `migrations/` use the same `loadEnv` rules. For a migration against **production**, run with `NODE_ENV=production` (or set `DOTENV_CONFIG_PATH` to your production file).
