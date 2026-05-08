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

---

## Unit Tests

| File | Purpose | Depends On |
|------|---------|------------|
| `__tests__/unit/controllers/adminController.test.js` | Admin controller (mocked). | adminController |
| `__tests__/unit/controllers/liveController.test.js` | Live controller (mocked). | liveController |
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
| `README.md` | Project overview, quick start. |
| `ARCHITECTURE.md` | System architecture, diagrams, data flow. |
| `PROJECT_STRUCTURE.md` | Directory layout, module dependencies. |
| `API_REFERENCE.md` | API endpoints documentation. |

---

## Documentation — docs/

| File | Purpose |
|------|---------|
| `docs/GETTING_STARTED.md` | Setup guide. |
| `docs/INSTALLATION.md` | Install instructions. |
| `docs/TROUBLESHOOTING.md` | Common issues. |
| `docs/backend_documentation.md` | Backend overview. |
| `docs/backend_changes.md` | Change log. |
| `docs/latest_changes.md` | Recent changes. |
| `docs/new_endpoints.md` | New endpoint docs. |
| `docs/bolt_endpoints.md` | Bolt-compatible endpoints. |
| `docs/bolt_prompt.md` | Bolt AI prompt context. |
| `docs/claude_instructions.md` | Claude-specific instructions. |
| `docs/claude_phase1_validation_prompt.md` | Phase 1 validation prompt. |
| `docs/events_system_fonrt_end_use.md` | Events system frontend usage. |
| `docs/LIVE_MATCH_VIEW_APP.md` | Live match view app docs. |
| `docs/match-events-enhancement.md` | Match events enhancement. |
| `docs/TOURNAMENT_SCHEDULING.md` | Tournament scheduling. |
| `docs/CODE_REVIEW_REPORT.md` | Code review notes. |
| `docs/fix-live-match-display.plan.md` | Fix plan for live match display. |

---

## Documentation — docs/old/

| File | Purpose |
|------|---------|
| `docs/old/DEPLOYMENT.md` | Legacy deployment docs. |
| `docs/old/TESTING.md` | Legacy testing docs. |
| `docs/old/highlight.md` | Highlight feature notes. |

---

## Documentation — docs/obsolete/

| File | Purpose |
|------|---------|
| `docs/obsolete/CODE_REVIEW_REPORT.md` | Code review notes. |
| `docs/obsolete/README.md` | Obsolete docs index. |
| `docs/obsolete/TEST_FAILURE_REPORT.md` | Test failure report. |
| `docs/obsolete/TEST_FIXES_SUMMARY.md` | Test fixes summary. |
| `docs/obsolete/TEST_MIGRATION_REPORT.md` | Test migration report. |
| `docs/obsolete/backend_changes.md` | Change log. |
| `docs/obsolete/claude_instructions.md` | Claude-specific instructions. |
| `docs/obsolete/claude_phase1_validation_prompt.md` | Phase 1 validation prompt. |
| `docs/obsolete/critical_bug_01_draw_bug.md` | Draw bug analysis. |
| `docs/obsolete/fix-live-match-display.plan.md` | Fix plan for live match display. |
| `docs/obsolete/highlights_problem.md` | Highlights problem. |
| `docs/obsolete/latest_changes.md` | Recent changes. |
| `docs/obsolete/sse_fix.md` | SSE fix notes. |

---

## LLM Opinions (Reference)

| File | Purpose |
|------|---------|
| `llm-opinions/round1_conclusions.md` | Round 1 conclusions. |
| `llm-opinions/auto_round1.md` | Auto round 1. |
| `llm-opinions/claude_round1.md` | Claude round 1. |
| `llm-opinions/gpt5_round1.md` | GPT-5 round 1. |
| `llm-opinions/old/claude_highlight_opinions.md` | Claude highlight opinions. |
| `llm-opinions/old/claude_highlight_opinion_round_2.md` | Claude round 2. |
| `llm-opinions/old/claude_highlight_opinion_round_2_CORRECTED.md` | Claude round 2 corrected. |
| `llm-opinions/old/claude_highlight_opinion_round_3.md` | Claude round 3. |
| `llm-opinions/old/claude_highlight_opinion_round_3_CORRECTED.md` | Claude round 3 corrected. |
| `llm-opinions/old/claude_highlight_opinion_round_4.md` | Claude round 4. |
| `llm-opinions/old/claude_highlight_opinion_round_4_CORRECTED.md` | Claude round 4 corrected. |
| `llm-opinions/old/codex_highlight_opinion.md` | Codex highlight opinion. |
| `llm-opinions/old/codex_highlight_opinion_round_2.md` | Codex round 2. |
| `llm-opinions/old/codex_highlight_opinion_round_3.md` | Codex round 3. |
| `llm-opinions/old/codex_highlight_opinion_round_4.md` | Codex round 4. |
| `llm-opinions/old/gemini_highlight_opinions.md` | Gemini highlight opinions. |
| `llm-opinions/old/gemini_highlight_opinion_round_2.md` | Gemini round 2. |
| `llm-opinions/old/gemini_highlight_opinion_round_3.md` | Gemini round 3. |
| `llm-opinions/old/gemini_highlight_opinion_round_4.md` | Gemini round 4. |
| `llm-opinions/old/llm_next_steps.md` | LLM next steps. |
| `llm-opinions/old/CORRECTION_SUMMARY.md` | Correction summary. |

---

## Report Docs

| File | Purpose |
|------|---------|
| `report_docs/claude_game_report.md` | Claude game report. |
| `report_docs/codex_game_report.md` | Codex game report. |
| `report_docs/cursor_game_report.md` | Cursor game report. |

---

## Validation & Sprints

| File | Purpose |
|------|---------|
| `validation/phase1_validation_test_plan.md` | Phase 1 validation plan. |
| `sprints/sprint_1.md` | Sprint 1 notes. |

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

*Last updated: 2025-02-12*
