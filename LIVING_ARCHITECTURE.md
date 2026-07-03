# FootFive Living Architecture

> **READ THIS AT THE START OF EVERY CONVERSATION.**  
> This file maps every file in the project. Update it before committing when adding, removing, or renaming files.

---

## Entry Points & Configuration

| File | Purpose | Depends On |
|------|---------|------------|
| `listen.js` | Express app entry point. Mounts routes, CORS, auto-starts simulation when `SIMULATION_AUTO_START=true`. Graceful shutdown. | routes, SimulationLoop, TournamentManager, EventBus |
| `monitor.js` | Standalone HTTPS health-check/monitor utility. | https, readline |
| `package.json` | NPM manifest: scripts (test, start, migrate, seed), dependencies. | — |
| `package-lock.json` | Locked dependency versions. | package.json |
| `jest.config.js` | Jest test runner config. Test paths, coverage, setup files. | — |
| `.env.development` | Dev environment variables. | — |
| `.env.test` | Test environment variables. | — |
| `setup-https.sh` | HTTPS/SSL setup script. | — |
| `.claude/settings.local.json` | Claude/Anthropic local settings. | — |

---

## Routes Layer

| File | Purpose | Depends On |
|------|---------|------------|
| `routes/index.js` | Route aggregator. Mounts all API sub-routes under `/api`. | teamRoutes, playerRoutes, diagnosticRoutes, fixtureRoutes, liveRoutes, adminRoutes |
| `routes/teamRoutes.js` | `/api/teams/*` — team CRUD. | teamController |
| `routes/playerRoutes.js` | `/api/players/*` — player queries. | playerController |
| `routes/diagnosticRoutes.js` | `/api/diagnostic/*` — DB health, row counts. | diagnosticController |
| `routes/fixtureRoutes.js` | `/api/fixtures/*` — fixtures CRUD, simulation trigger. | fixtureController |
| `routes/liveRoutes.js` | `/api/live/*` — SSE stream, live state, event history. | liveController |
| `routes/adminRoutes.js` | `/api/admin/*` — simulation controls, pause, speed, force actions. | adminController |

---

## Controllers Layer

| File | Purpose | Depends On |
|------|---------|------------|
| `controllers/teamController.js` | Team list, by ID. | TeamModel, PlayerModel |
| `controllers/playerController.js` | Player list, by ID. | PlayerModel, TeamModel |
| `controllers/diagnosticController.js` | Database diagnostics, table counts. | db/connection |
| `controllers/fixtureController.js` | Fixture CRUD, odds, simulate match (legacy). | FixtureModel, OddsModel, MatchEventModel, MatchReportModel, TeamModel, OddsEngine, SimulationEngine |
| `controllers/liveController.js` | SSE stream, live matches, event history, fixture list. | EventBus, SimulationLoop, FixtureModel |
| `controllers/adminController.js` | Pause, resume, speed, force next round, reset. | SimulationLoop, EventBus, TournamentManager, AdminService |

---

## Services Layer

| File | Purpose | Depends On |
|------|---------|------------|
| `services/FixtureService.js` | Fixture creation, odds, events, reports. Used by simulation. | FixtureModel, OddsModel, MatchEventModel, MatchReportModel, TeamModel, OddsEngine |
| `services/LiveService.js` | Live fixture queries for frontend. | FixtureModel |
| `services/AdminService.js` | Admin actions: reset, force actions. | SimulationLoop, EventBus, TournamentManager |

---

## Models Layer

| File | Purpose | Depends On |
|------|---------|------------|
| `models/TeamModel.js` | teams table CRUD. | db/connection |
| `models/PlayerModel.js` | players table CRUD. | db/connection |
| `models/FixtureModel.js` | fixtures table CRUD. | db/connection |
| `models/MatchEventModel.js` | match_events table. Insert events, bulk insert. | db/connection, pg-format |
| `models/MatchReportModel.js` | match_reports table. | db/connection |
| `models/OddsModel.js` | fixture_odds table. | db/connection |
| `models/UserModel.js` | User model placeholder. | db/connection |

---

## Game Logic — Core

| File | Purpose | Depends On |
|------|---------|------------|
| `gamelogic/constants.js` | EVENT_TYPES, MATCH_STATES, TOURNAMENT_STATES, SCHEDULE, SIM params, BRACKET_STRUCTURE. | — |
| `gamelogic/OddsEngine.js` | Pre-match odds from team ratings. | FixtureModel, OddsModel |
| `gamelogic/SimulationEngine.js` | Legacy sync tournament simulation. | db, FixtureModel, MatchEventModel, MatchReportModel, TeamModel, PlayerModel |

---

## Game Logic — Simulation (Real-Time)

| File | Purpose | Depends On |
|------|---------|------------|
| `gamelogic/simulation/index.js` | Module exports: SimulationLoop, LiveMatch, TournamentManager, EventBus, EventGenerator, PenaltyShootout, BracketManager, TournamentScheduler. | All simulation/* |
| `gamelogic/simulation/SimulationLoop.js` | Singleton tick loop (1s). Ticks matches, coordinates tournament, admin controls. | EventEmitter |
| `gamelogic/simulation/TournamentManager.js` | Tournament state machine. Setup → R16 → QF → SF → Final → Complete. | TeamModel, FixtureModel, LiveMatch, db, BracketManager, TournamentScheduler, constants |
| `gamelogic/simulation/LiveMatch.js` | Per-match simulation. Phases, events, stats, extra time, penalties. | FixtureModel, MatchEventModel, MatchReportModel, TeamModel, PlayerModel, db, EventGenerator, PenaltyShootout, constants |
| `gamelogic/simulation/EventBus.js` | Event distribution. Persists events, pushes to SSE clients. | EventEmitter, MatchEventModel |
| `gamelogic/simulation/EventGenerator.js` | Generates match events (goals, shots, cards). | constants |
| `gamelogic/simulation/PenaltyShootout.js` | Penalty shootout logic. | constants |
| `gamelogic/simulation/BracketManager.js` | Bracket creation, winner advancement. | FixtureModel, TeamModel, PlayerModel, LiveMatch, constants |
| `gamelogic/simulation/TournamentScheduler.js` | Wall-clock scheduling. | constants |

---

## Database Layer

| File | Purpose | Depends On |
|------|---------|------------|
| `db/connection.js` | PostgreSQL connection pool. | pg |
| `db/seed.js` | Production seed. Seeds teams, players from data. | db/connection, db/data |
| `db/test-seed.js` | Test database seed. | db/connection, db/test-data |
| `db/run-seed.js` | Seed runner script. | db/data, db/seed |
| `db/test-connection.js` | Connection test utility. | db/connection |
| `db/data/index.js` | Data exports. | db/data/teams |
| `db/data/teams.js` | Team/player seed data. | — |
| `db/test-data/minimal-teams.js` | Minimal test teams. | — |
| `db/migrations/run-migration.js` | Runs SQL migrations in order. | fs, path, db/connection |
| `db/migrations/001_match_system.sql` | fixtures, match_events, match_reports, fixture_odds. | — |
| `db/migrations/002_add_event_types.sql` | Additional event type enums. | 001 |
| `db/migrations/003_bracket_system.sql` | Bracket positioning columns. | 001 |
| `db/migrations/004_tournament_state.sql` | Tournament state table for event-driven scheduling. | — |
| `db/migrations/005_expand_match_event_types.sql` | Expands match_events.valid_event_type CHECK; adds nullable seq + server_timestamp columns. | 001, 002 |
| `db/migrations/006_expand_match_event_types.sql` | Stage A of flow-chain work. Adds chain narrative types (midfield_battle, goal_build_up, attack_breakdown, counter_breakdown, kickoff_restart, penalty_walkup, penalty_run_up) to valid_event_type CHECK. | 001, 002, 005 |

---

## Test Infrastructure

| File | Purpose | Depends On |
|------|---------|------------|
| `test-helpers/database-helpers.js` | DB helpers for tests. | db/connection |
| `test-helpers/test-setup.js` | Test environment setup. | — |
| `__tests__/setup/globalSetup.js` | Runs once before all tests. | — |
| `__tests__/setup/globalTeardown.js` | Runs once after all tests. | — |
| `__tests__/setup/jest.setup.js` | Runs before each test file. | — |
| `__tests__/setup/testHelpers.js` | getTestApp, setupBeforeEach, cleanupAfterEach. | express, routes, db |

---

## API Route Tests

| File | Purpose | Depends On |
|------|---------|------------|
| `__tests__/api/routes/index.test.js` | Root API smoke test. | testHelpers |
| `__tests__/api/routes/teamRoutes.test.js` | Team routes. | testHelpers |
| `__tests__/api/routes/playerRoutes.test.js` | Player routes. | testHelpers |
| `__tests__/api/routes/diagnosticRoutes.test.js` | Diagnostic routes. | testHelpers |

---

## Integration Tests

| File | Purpose | Depends On |
|------|---------|------------|
| `__tests__/integration/controllers/teamController.test.js` | Team controller + DB. | teamController, db |
| `__tests__/integration/controllers/playerController.test.js` | Player controller + DB. | playerController, db |
| `__tests__/integration/controllers/diagnosticController.test.js` | Diagnostic controller. | diagnosticController |
| `__tests__/integration/persistence/matchEventTypes.test.js` | Asserts every PERSISTABLE_MATCH_EVENT_TYPES inserts cleanly; verifies seq/server_timestamp round-trip. | MatchEventModel, db |
| `__tests__/integration/adminLiveIntegration.test.js` | Integration tests for admin live controls and live match event behaviour. | adminController, liveController, LiveMatch |

---

## Unit Tests

| File | Purpose | Depends On |
|------|---------|------------|
| `__tests__/unit/controllers/adminController.test.js` | Admin controller (mocked). | adminController |
| `__tests__/unit/controllers/liveController.test.js` | Live controller (mocked). | liveController |
| `__tests__/unit/gamelogic/EventGenerator.test.js` | EventGenerator narrative/momentum sequence behavior. | EventGenerator |
| `__tests__/unit/gamelogic/PenaltyShootout.test.js` | PenaltyShootout chain metadata, reaction gating, winner/sudden-death guards. | PenaltyShootout |
| `__tests__/unit/gamelogic/EventBus.test.js` | EventBus. | EventBus, MatchEventModel |
| `__tests__/unit/gamelogic/LiveMatch.test.js` | LiveMatch simulation. | LiveMatch |
| `__tests__/unit/gamelogic/SimulationLoop.test.js` | SimulationLoop. | SimulationLoop |
| `__tests__/unit/gamelogic/TournamentManager.test.js` | TournamentManager. | TournamentManager, LiveMatch, FixtureModel |
| `__tests__/unit/models/PlayerModel.test.js` | PlayerModel. | PlayerModel |
| `__tests__/unit/models/TeamModel.test.js` | TeamModel. | TeamModel |

---

## CI/CD & Deployment

| File | Purpose | Depends On |
|------|---------|------------|
| `.github/workflows/deploy.yml` | GitHub Actions: deploy on push to master. SSH, pull, npm, migrate, PM2. | — |

---

## Documentation — Root

| File | Purpose |
|------|---------|
| `README.md` | Entry point: links to architecture map and docs index. |
| `AGENTS.md` | Agent / VM runbook (env vars, commands). |

---

## Documentation — docs/

| File | Purpose |
|------|---------|
| `docs/README.md` | Documentation index. |
| `docs/INSTALLATION.md` | Install instructions. |
| `docs/TROUBLESHOOTING.md` | Common issues (includes `tournament_state` / migration mismatch). |
| `docs/ARCHITECTURE.md` | System architecture, diagrams, simulation flow. |
| `docs/codebase-explained.html` | Standalone HTML walkthrough of runtime flow, file structure, API surface, database, simulation, events, tests, and operations. |
| `docs/API_REFERENCE.md` | HTTP API reference. |
| `docs/latest_changes.md` | Recent changes. |
| `docs/new_endpoints.md` | Fixtures-focused endpoint notes. |
| `docs/events_system_fonrt_end_use.md` | Events / SSE usage for frontends. |
| `docs/LIVE_MATCH_VIEW_APP.md` | Live match view app notes. |
| `docs/match-events-enhancement.md` | Match events enhancement. |
| `docs/SIMULATION_PHASE12_UPGRADE.md` | Phase 1-2 simulation narrative upgrade and frontend changes. |
| `docs/TOURNAMENT_SCHEDULING.md` | Tournament scheduling. |
| `docs/TEST_SUITE_REVIEW.md` | Current review of test coverage, usefulness, redundancy, and hard-coded/mock-driven risks. |
| `docs/TEST_AUDIT.md` | Test suite audit. |
| `docs/TEST_COVERAGE.md` | Test coverage notes. |

---

## Documentation — docs/old/

| File | Purpose |
|------|---------|
| `docs/old/DEPLOYMENT.md` | Legacy deployment docs. |
| `docs/old/TESTING.md` | Legacy testing docs. |
| `docs/old/highlight.md` | Highlight feature notes. |

---

## Documentation — db/

| File | Purpose |
|------|---------|
| `db/migrations/README.md` | How SQL migrations are run and ordered. |

---

## Request Flow Summary

```
HTTP Request → routes/index.js → *Routes.js → *Controller.js
                                    ↓
                    *Controller.js → *Model.js / *Service.js
                                    ↓
                    *Model.js → db/connection.js → PostgreSQL
```

## Simulation Flow Summary

```
listen.js → SimulationLoop.init() → TournamentManager
                    ↓
         SimulationLoop tick → LiveMatch.tick() → EventGenerator
                    ↓
         EventBus.emit() → MatchEventModel.insert() + SSE clients
```

---

## Event Chain Metadata Convention

Stage B of flow-chain work. Emitters (EventGenerator, PenaltyShootout) tie related events into ordered chains via six fields. The pipeline already passes them through unchanged — DB columns are reused, JSONB metadata is splatted from `payload`, SSE serializes the enriched event verbatim, and the replay buffer holds the same object. **No EventBus / MatchEventModel / liveController changes are required to add chains.**

### Where each field lives

| Field | Storage | Source on emit | Notes |
|-------|---------|----------------|-------|
| `chain_id` | DB column `bundle_id` (VARCHAR(50)) | `payload.bundleId` | Reuses existing `bundle_id`. Format: `<type>_<fixtureId>_<minute>_<seq>` e.g. `attack_42_34_1`. Indexed (`idx_events_bundle`). |
| `chain_step` | DB column `bundle_step` (INTEGER) | `payload.bundleStep` | Reuses existing `bundle_step`. 0-indexed within the chain. |
| `chain_type` | JSONB `metadata.chain_type` | `payload.chain_type` | One of: `midfield` \| `attack` \| `counter` \| `penalty`. |
| `chain_terminal` | JSONB `metadata.chain_terminal` | `payload.chain_terminal` | `true` on the final step (goal, miss/save, breakdown). Lets consumers close out the chain UI without waiting. |
| `pacing.delay_ms` | JSONB `metadata.pacing.delay_ms` | `payload.pacing.delay_ms` | Advisory ms the FE should wait before revealing this step. Defaults in `gamelogic/constants.js` `CHAIN_PACING`. |
| `pacing.hold_ms` | JSONB `metadata.pacing.hold_ms` | `payload.pacing.hold_ms` | Advisory ms the FE should hold this step on screen. Same source. |

### Pass-through guarantee

- `EventBus._extractPayload` splats `rawEvent.payload` into the canonical `payload` object and also copies any non-base top-level keys, so emitters may pass chain fields either nested or flat.
- `EventBus._persistEvent` writes `payload.bundleId` → `bundle_id`, `payload.bundleStep` → `bundle_step`, and `{ ...payload }` → `metadata` JSONB. `chain_type`, `chain_terminal`, `pacing` are stored as JSON keys with no schema change.
- `EventBus._sendToClient` JSON-stringifies the full enriched event. SSE consumers receive `payload.chain_type` etc. exactly as emitted.
- `EventBus.eventBuffer` holds the same enriched event used for replay (`sendCatchup`, `getRecentEvents`), so reconnecting clients receive identical chain metadata.
- `MatchEvent.toJSON` exposes `bundleId`, `bundleStep`, and the full `metadata` object to REST responses.

### Rules

1. Every event in a chain shares the same `chain_id` (= `bundle_id`).
2. `chain_step` is monotonically increasing per chain, starting at 0.
3. Exactly one event per chain has `chain_terminal: true`.
4. `chain_type` is constant across a chain.
5. `pacing` is advisory — backend never sleeps on it. Frontend may ignore it.
6. Existing non-chain events (`build_up_play`, lone `corner`, `foul`, etc.) MUST NOT set these fields. Absence ⇒ not part of a chain.
7. `bundle_id` namespacing avoids collisions across fixtures: include `fixtureId` in the ID string.

### Reserved chain types (Stage A migration 006)

| chain_type | Step types (in order) | Terminal candidates |
|------------|-----------------------|---------------------|
| `midfield` | `midfield_battle` (single step) | `midfield_battle` |
| `attack` | `goal_build_up` × 1–2, then `shot_saved`/`shot_missed`/`shot_blocked`/`goal`, optional `kickoff_restart` | `attack_breakdown`, terminal shot, `kickoff_restart` |
| `counter` | `counter_attack`, then `shot_*` or `goal`, optional `kickoff_restart` | `counter_breakdown`, terminal shot, `kickoff_restart` |
| `penalty` | `penalty_awarded`, `penalty_walkup`, `penalty_run_up`, `penalty_scored`/`penalty_missed`/`penalty_saved`, optional `kickoff_restart` | outcome event, `kickoff_restart` |

Behaviour wiring lives in Stages C–F. This stage only fixes the contract.

---

## Scripts

| File | Purpose | Depends On |
|------|---------|------------|
| `scripts/update-living-architecture.js` | Pre-commit validator. Ensures every project file is documented here. Exit 1 if any file is missing. | fs, path |

---

## How to Update This File

1. **Adding a file**: Add a row to the appropriate section (or create a section).
2. **Removing a file**: Remove its row.
3. **Renaming**: Update path and any references in Depends On.
4. **Before every commit**: The pre-commit hook runs `node scripts/update-living-architecture.js`. Fix any reported missing files.

---

*Last updated: 2026-05-17*
