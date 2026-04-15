# Database migrations

## Running migrations on your VPS

The app connects using **the same env as when it starts**: `NODE_ENV` and `.env.{NODE_ENV}` (e.g. `.env.production`). If you run the migration with a different env or different env file, you may be writing to a **different database** than the one the running app uses. That causes errors like `relation "tournament_state" does not exist` even after “running the migration.”

### 1. Use the same env as the running app

On the VPS, run the migration with the **same** `NODE_ENV` (and same env vars) as your running process:

```bash
cd /path/to/footfive_back

# If your app runs with NODE_ENV=production (e.g. pm2):
NODE_ENV=production npm run migrate 004_tournament_state.sql

# If your app runs with NODE_ENV=development:
NODE_ENV=development npm run migrate 004_tournament_state.sql
```

If you use a process manager (pm2, systemd), check how the app is started and what `NODE_ENV` and `PGDATABASE` it uses, then run the migration with the same values (e.g. create `.env.production` with the same `PGDATABASE`, `PGHOST`, etc., and run with `NODE_ENV=production`).

### 2. Verify from the API

After deploying, call your diagnostic endpoint (same origin as the running app):

```http
GET https://jwd1.xyz/api/diagnostic
```

In the response, check:

- `database` – database the app is connected to
- `environment` – NODE_ENV
- `tournament_state_exists` – should be `true` if the table exists in that database

If `tournament_state_exists` is `false`, the app is using a database where the migration was not run. Run the migration again with the env that matches `environment` and the DB that matches `database`.

### 3. Run all migrations (fresh or missing tables)

To apply every migration in order:

```bash
NODE_ENV=production npm run migrate 001_match_system.sql
NODE_ENV=production npm run migrate 002_add_event_types.sql
NODE_ENV=production npm run migrate 003_bracket_system.sql
NODE_ENV=production npm run migrate 004_tournament_state.sql
```

(Use the same `NODE_ENV` as your running app.)
