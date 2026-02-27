# AGENTS.md

## Cursor Cloud specific instructions

### Overview

FootFive is a Node.js/Express.js REST API backend for a football knockout cup tournament simulator. Single service, PostgreSQL-backed, port 9001.

### Critical: PG environment variable conflict

The VM has pre-injected `PGUSER`, `PGDATABASE`, `PGPASSWORD`, `PGHOST`, `PGPORT` environment variables. Because `dotenv` does **not** override existing env vars, you must prefix all `node` / `npm` commands with:

```bash
env -u PGUSER -u PGDATABASE -u PGPASSWORD -u PGHOST -u PGPORT <command>
```

Examples:
- `env -u PGUSER -u PGDATABASE -u PGPASSWORD -u PGHOST -u PGPORT npm start`
- `env -u PGUSER -u PGDATABASE -u PGPASSWORD -u PGHOST -u PGPORT npm test`
- `env -u PGUSER -u PGDATABASE -u PGPASSWORD -u PGHOST -u PGPORT npm run seed`

### PostgreSQL

PostgreSQL 16 must be running. Start it with:
```bash
sudo pg_ctlcluster 16 main start
```

Database names and credentials are configured in `.env.development` and `.env.test` (gitignored). If these files are missing, create them with `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `PGHOST`, `PGPORT` — see `docs/INSTALLATION.md` for the expected format.

### Running the app

```bash
env -u PGUSER -u PGDATABASE -u PGPASSWORD -u PGHOST -u PGPORT npm start
```
Starts on port 9001. API root: `http://localhost:9001/api`.

### Running tests

```bash
env -u PGUSER -u PGDATABASE -u PGPASSWORD -u PGHOST -u PGPORT npm test
```

All test scripts from `package.json` work (e.g., `test:unit`, `test:integration`, `test:api`, `test:coverage`). See `package.json` `scripts` section for the full list.

### No lint tooling configured

This project has no ESLint or lint scripts.

### Database seeding / migrations

- `npm run seed` — drops and recreates all tables, seeds teams + players (development DB)
- `npm run migrate` — runs a single SQL migration file (default: `001_match_system.sql`; pass filename as arg for others)
- Migration `004_tournament_state.sql` creates the `tournament_state` table required by the simulation system. Run it after seeding if the table doesn't exist.

### Key architecture notes

- `listen.js` is the entry point; exports the Express app for testing
- `db/connection.js` loads `.env.{NODE_ENV}` via dotenv; throws if `PGDATABASE` is unset
- `db/test-connection.js` is used by Jest; enforces the test database name for safety
- The seed script (`db/seed.js`) creates all core tables (teams, players, fixtures, match_events, match_reports, fixture_odds) plus indexes and triggers
- See `LIVING_ARCHITECTURE.md` for the full file map and dependency graph
