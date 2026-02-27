# Claude VPS instructions: Fix tournament_state and verify app

**Goal:** Ensure the backend on the VPS has the `tournament_state` table in the **same database** the running app uses, so `POST /api/admin/tournament/start` stops returning 500 with `relation "tournament_state" does not exist`.

**Why this is needed:** The app loads DB config from `.env.${NODE_ENV}` (e.g. `.env.production`). If migrations were run with a different NODE_ENV or env file, they ran against a different database. The running app then still hits a DB where the table was never created.

---

## 1. SSH into the VPS

```bash
ssh jd@77.68.4.18 -p 4020
```

Use the user's SSH key or password as appropriate.

---

## 2. Locate the backend app directory

Find where `footfive_back` is deployed (e.g. `/home/jd/footfive_back`, `/home/jd/projects/footfive_back`, or `/var/www/...`). Set it for the rest of the steps:

```bash
# Example; adjust to actual path
export APP_DIR=/home/jd/footfive_back
cd "$APP_DIR"
```

---

## 3. See how the app is run and which env it uses

- **If using pm2:**  
  `pm2 list` then `pm2 env <id>` (or `pm2 show <name>`) and note `NODE_ENV` and any `PG*` vars.
- **If using systemd:**  
  `systemctl cat <service-name>` and check `Environment=` or `EnvironmentFile=`.
- **Check for env files:**  
  `ls -la "$APP_DIR/.env"*`  
  The app uses `.env.${NODE_ENV}` (e.g. `.env.production` when `NODE_ENV=production`). The running process must be using the same `PGDATABASE` (and host/user/password) as we use for the migration.

---

## 4. Run the migration with the same env as the app

Use the **same NODE_ENV** as the running app (usually `production` on a VPS):

```bash
cd "$APP_DIR"
NODE_ENV=production npm run migrate 004_tournament_state.sql
```

If the app runs with `NODE_ENV=development` on the VPS, use that instead:

```bash
NODE_ENV=development npm run migrate 004_tournament_state.sql
```

- If you get "PGDATABASE not set", the app's env isn't loaded. Ensure there is an `.env.production` (or `.env.development`) in `$APP_DIR` with `PGDATABASE`, `PGHOST`, `PGUSER`, `PGPASSWORD` (and `PGPORT` if needed), matching the running app's config. Then run the same command again.
- Migration should print "Migration completed successfully!".

---

## 5. Confirm the table exists in the app's database

**Option A – From the server (if `psql` and env are available):**

```bash
cd "$APP_DIR"
# Load the same env the app uses (adjust filename if needed)
set -a; [ -f .env.production ] && source .env.production; set +a
psql -d "${PGDATABASE}" -c "\dt public.tournament_state"
```

You should see a row for `public.tournament_state`.

**Option B – From the API (after app is running):**

```bash
curl -s https://jwd1.xyz/api/diagnostic | jq '.database, .environment, .tournament_state_exists'
```

Expect `tournament_state_exists: true` and `database` / `environment` matching what the app uses.

---

## 6. Restart the app so it picks up the DB

- **pm2:** `pm2 restart all` (or restart the specific app process).
- **systemd:** `sudo systemctl restart <service-name>`.

---

## 7. Quick test

```bash
curl -s -X POST https://jwd1.xyz/api/admin/simulation/start
curl -s -X POST https://jwd1.xyz/api/admin/tournament/start
```

The second request should return 200 with `success: true` and a `state` object, not 500 with `relation "tournament_state" does not exist`.

---

## Summary

| Step | Action |
|------|--------|
| 1 | SSH: `ssh jd@77.68.4.18 -p 4020` |
| 2 | Set `APP_DIR` to the deployed `footfive_back` path and `cd` there |
| 3 | Confirm how the app is started and which NODE_ENV / .env it uses |
| 4 | Run `NODE_ENV=production npm run migrate 004_tournament_state.sql` (or `development` if that's what the app uses) |
| 5 | Verify `tournament_state` exists (psql or `GET /api/diagnostic`) |
| 6 | Restart the app (pm2 or systemd) |
| 7 | Test `POST /api/admin/tournament/start` |

**Important:** The migration must run against the **same database** (same `PGDATABASE` and connection details) as the running Node app. Using the same NODE_ENV and the same `.env.${NODE_ENV}` file on the VPS ensures that.
