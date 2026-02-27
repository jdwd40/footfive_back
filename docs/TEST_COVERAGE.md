# Test coverage summary

What the automated tests cover and what they test for. All tests use the real app or real modules unless noted (mocks used only where needed for isolation).

---

## 1. Main API routes (`__tests__/api/routes/index.test.js`)

- **Root:** GET `/api` returns 200 and body `msg:` / `ok`.
- **Mounting:** `/api/teams`, `/api/players`, `/api/jcup/init`, `/api/diagnostic` are mounted and return 200 (jcup/init also has `message` and `fixtures` in body).
- **Invalid routes:** 404 for `/api/invalid`, `/teams` (no /api), `/api/teams/.../nested` invalid path.
- **Content-Type:** All of `/api`, `/api/teams`, `/api/players`, `/api/diagnostic`, `/api/jcup/init` return JSON (single shared test).
- **Versioning:** Path contains `/api/` for future versioning.

---

## 2. Admin + live integration (`__tests__/integration/adminLiveIntegration.test.js`)

Real Express app, real SimulationLoop and EventBus; loop/eventBus reset between tests.

- **startSimulation:** POST `/api/admin/simulation/start` → 200; then GET `/api/admin/state` shows `loop.isRunning === true`.
- **forceScore:** After start + POST `/api/admin/tournament/start`, GET `/api/live/matches` for a fixture id; POST force-score for that id; GET `/api/live/matches/:id` shows the set score (skips if tournament_state table missing).
- **pause/resume:** POST pause → GET `/api/live/status` has `simulation.isPaused === true`; POST resume → `isPaused === false`.
- **streamEvents SSE:** Start simulation, open SSE to `/api/live/events`; at least one event received and one has `type === 'connected'`.

---

## 3. Player API integration (`__tests__/integration/controllers/playerController.test.js`)

- **GET /api/players:** 200, body has `message` and `players` (length > 0), correct shape (playerId, teamId, name, attack, defense, isGoalkeeper), goalkeepers and outfield, valid stat ranges.
- **GET /api/players/team/:teamName:** Returns players for that team, correct properties, empty array for unknown team, URL-encoded names, mix of GK and outfield.
- **GET /api/players/:playerId:** Returns player by id, correct properties; 500 for non-existent or invalid id.
- **Errors:** 404 for invalid path; 500 for non-existent player returns message + error.
- **Consistency:** Response structure and message; empty DB → empty `players` array.
- **Validation:** Numeric stats, boolean isGoalkeeper, valid team associations.

---

## 4. Team API integration (`__tests__/integration/controllers/teamController.test.js`)

- **GET /api/teams:** 200, `message` and `teams`, correct structure (id, name, wins, losses, goalsFor/Against, jcups_won, runner_ups, ratings), consistent across requests, rating values present.
- **GET /api/teams/3jcup:** Top cup winners, ordered by `jcups_won` descending, name and jcups_won on each.
- **Errors:** 404 for invalid path; GET `/api/teams/` with trailing slash returns 200 and `teams` (same handler).
- **Consistency:** Message and structure; empty DB → empty `teams` array.

---

## 5. Diagnostic API integration (`__tests__/integration/controllers/diagnosticController.test.js`)

- **GET /api/diagnostic:** 200, database status, correct DB name and environment, expected tables (teams, players), table counts, sample data (team + player with ratings), empty DB → counts 0.
- **POST /api/diagnostic/seed:** 200, success message, DB populated, correct environment, multiple seeds OK.
- **Errors:** 404 for invalid path; POST to `/api/diagnostic` (no /seed) → 404.
- **Consistency:** Response structure and metadata; accurate team/player counts and sample from test DB.

---

## 6. Player routes (`__tests__/api/routes/playerRoutes.test.js`)

- GET `/api/players`, `/api/players/:id`, `/api/players/team/:teamName` available and return 200.
- Correct HTTP methods (GET accepted; POST etc. not allowed where applicable).
- Mounting under `/api` and 404 without `/api`.

---

## 7. Team routes (`__tests__/api/routes/teamRoutes.test.js`)

- GET `/api/teams`, `/api/teams/3jcup` available and 200.
- GET accepted; POST to /teams → 404.
- Mounting and /api prefix.

---

## 8. Diagnostic routes (`__tests__/api/routes/diagnosticRoutes.test.js`)

- GET `/api/diagnostic`, POST `/api/diagnostic/seed` available and 200.
- GET/POST where expected; POST to /diagnostic root → 404.
- Mounting and /api prefix.

---

## 9. Admin controller unit (`__tests__/unit/controllers/adminController.test.js`)

Mocks: SimulationLoop, EventBus, TournamentManager.

- **devAdminOnly:** Allows when DEV_ADMIN=true or valid X-Admin-Secret; denies with 404 when neither; denies wrong secret.
- **startSimulation:** Init and start called; response `success` + `state`.
- **stopSimulation:** Stop called; response `success`, `isRunning: false`.
- **forceTournamentStart:** 400 with hint when simulation not initialized; success and state when TM present.
- **cancelTournament:** Cancel called, matches cleared; 200 success.
- **skipToRound:** Forwards round to TM; 400 when `round` missing.
- **forceScore:** 200 and score on success; 400 when match not found (error mapping).
- **forceEndMatch:** Forwards to loop; success response.
- **pauseSimulation:** Pause called; response `isPaused: true`.
- **resumeSimulation:** Resume called; response `isPaused: false`.
- **setSpeed:** Forwards multiplier; 400 for invalid or negative multiplier.
- **getFullState:** Response shape (loop, tournament, matches, eventBus, recentEvents).
- **clearEvents:** Buffer and sequence reset; success.

---

## 10. Live controller unit (`__tests__/unit/controllers/liveController.test.js`)

Mocks: EventBus, SimulationLoop (with TM and matches).

- **streamEvents:** Registers client with parsed filters (tournamentId, fixtureId) and afterSeq → sendCatchup; empty filters when no query.
- **getTournamentState:** Returns TM state (state, tournamentId, currentRound, lastCompleted).
- **getActiveMatches:** Returns matches array and count with fixtureId, state, minute, score, teams, isFinished.
- **getMatchState:** Valid fixture → objectContaining fixtureId, state, minute, score; unknown fixture → 404 and error message.
- **getRecentEvents:** Returns events array and count; filters passed to eventBus (fixtureId, type, limit).
- **getStatus:** Returns simulation, eventBus, tournament, lastCompleted shape.

---

## 11. TournamentManager unit (`__tests__/unit/gamelogic/TournamentManager.test.js`)

Mocks: TeamModel, FixtureModel, PlayerModel, MatchEventModel, MatchReportModel, db.

- **Constructor:** IDLE state, null tournamentId, empty teams; custom match minutes.
- **tick:** Inter-round delay expiry → next round starts.
- **_handleSetup:** tournamentId numeric and > 0, 16 teams, 16 roundWinners; tournament_setup event; shuffle changes order (deterministic RNG).
- **_startRound:** Fixtures created (R16 count), matches_created and round_start events; correct match counts per round (R16→QF→SF→FINAL).
- **_collectWinnersAndAdvance:** Collects winners from finished matches, completedResults populated.
- **onMatchFinalized:** Marks fixture completed.
- **getState:** State, tournamentId, round, teamsRemaining, activeMatches, winner, etc.; round info when active.
- **getLiveMatches:** Only non-finished matches returned.
- **forceStart:** State ROUND_ACTIVE, tournamentId set, 8 live matches; throws if already in progress.
- **cancel:** IDLE, no live matches, tournament_cancelled emitted.
- **skipToRound:** State and currentRoundKey; throws for invalid round.
- **Constants:** ROUND_ORDER, INTER_ROUND_DELAY_MS, ROUND_NAMES.
- **_allMatchesFinished:** True when no matches; false when any match not finished.

---

## 12. EventBus unit (`__tests__/unit/gamelogic/EventBus.test.js`)

Mock: MatchEventModel.

- **Singleton:** getEventBus same instance; reset creates new instance.
- **emit:** Sequence numbers, server timestamp, EventEmitter and typed events, stats updated.
- **Buffer:** Events stored; buffer trimmed at max size.
- **getRecentEvents:** No filters, filter by fixtureId/type/afterSeq, limit respected.
- **addClient:** SSE headers, client ID, connected event, close handler, client count.
- **removeClient:** Client removed, stats updated.
- **Broadcast:** All clients; filter by fixtureId and tournamentId.
- **sendCatchup:** Missed events sent; client filters respected.
- **Persistence:** Goal/halftime persisted; non-match / no fixtureId not persisted; persistedEvents stat.
- **getStats:** Current stats.
- **clear:** State reset; client connections closed.
- **_isPersistableEvent:** Match events true; others false.

---

## 13. SimulationLoop unit (`__tests__/unit/gamelogic/SimulationLoop.test.js`)

- **Singleton:** getSimulationLoop same instance; reset gives new instance.
- **Lifecycle:** Start emits started; no double start; stop emits stopped; pause/resume.
- **Speed:** Multiplier set; clamped 0.1–100.
- **tick:** Tick count increments; no tick when paused.
- **Match management:** Register/unregister matches; multiple matches; clear finished.
- **State:** getState returns current state and match states.
- **Events:** Match events emitted through event bus when configured.
- **Match completion:** Tournament manager notified when match completes; only once per match.

---

## 14. LiveMatch unit (`__tests__/unit/gamelogic/LiveMatch.test.js`)

- **Constructor:** Defaults, custom rules merged, timings computed.
- **tick:** No tick before start time; FIRST_HALF on first tick; tickElapsed increments; no tick when finished.
- **State transitions:** HALFTIME at tick 240, SECOND_HALF at 300, finish at 540 (or extra time if draw in knockout); skip ET if disabled; draws allowed when not knockout.
- **getMatchMinute:** First half, 45 at halftime, second half, extra time.
- **Fast forward:** Key events only; catch up to current time.
- **Score:** Score and penalty score tracked; null penalty when no shootout.
- **Winner:** Home/away by score; null for draw; penalty score used when present.
- **Admin:** forceEndMatch, forceSetScore.
- **isFinished:** False/true as expected.
- **Event creation:** Event structure.
- **Penalty shootout:** Kicks processed, teams alternate, winner after 5 rounds.
- **Stats:** Initialized correctly.
- **KEY_EVENTS:** Set includes important events and excludes non-key.

---

## 15. MatchSimulator unit (`__tests__/unit/gamelogic/MatchSimulator.test.js`)

- **Constructor:** Initial state, team objects, score, minute, highlights array.
- **simulate():** Returns score, highlights, finalResult, penaltyScore; non-negative scores; realistic ranges; halftime/full-time highlights; highlight properties.
- **Team strength:** Strong team wins more often; weak team can still win sometimes.
- **Penalties:** Draw → shootout; winner after shootout; penalty highlights.
- **Edge cases:** Min and max rating values do not throw; same team name handled.
- **finalResult:** Format with and without penalties.

---

## 16. PlayerModel unit (`__tests__/unit/models/PlayerModel.test.js`)

Real DB (test seed).

- **fetchById:** Correct player fields; throws for non-existent id; valid stat ranges.
- **updateById:** Updates name/attack/defense; throws for non-existent; goalkeeper status unchanged.
- **fetchByTeamName:** All players for team, structure; empty for unknown team; GK and outfield.
- **fetchByTeamId:** By team id, same team; empty for unknown id; all properties.
- **Validation:** Stat ranges; at least one GK per team; outfield players present.

---

## 17. TeamModel unit (`__tests__/unit/models/TeamModel.test.js`)

Real DB (test seed).

- **getAll:** All teams, structure, valid rating values.
- **getRatingById:** By id, correct fields; throws for non-existent.
- **getRatingByTeamName:** Correct name and ratings; consistent for same team; throws for unknown name; ratings from best players.
- **addJCupsWon:** Increment and persist; throws for non-existent.
- **addRunnerUp:** Increment and persist; throws for non-existent.
- **getTop3JCupWinners:** Top winners, descending jcups_won, required fields.

---

## Summary

| Area | Type | Covers |
|------|------|--------|
| **Routes** | API + integration | Mounting, 404s, JSON, /api prefix, jcup/init, player/team/diagnostic route availability and methods |
| **Admin + live** | Integration | startSimulation → state visible; forceScore → match score; pause/resume → status; SSE connected event |
| **Players** | Integration + unit | CRUD behaviour, validation, errors, empty DB; model fetch/update and validation |
| **Teams** | Integration + unit | List, 3jcup, structure, errors; model getAll, ratings, jcups, runner-ups |
| **Diagnostic** | Integration | Status, seed, counts, samples, errors |
| **Admin controller** | Unit | devAdminOnly, validation, error mapping (400/404), response shapes |
| **Live controller** | Unit | streamEvents wiring, getTournamentState/getMatchState/getStatus/getRecentEvents, 404 for unknown fixture |
| **TournamentManager** | Unit | Setup, shuffle, rounds, fixtures, state, forceStart/cancel/skipToRound, getLiveMatches, _allMatchesFinished |
| **EventBus** | Unit | Singleton, emit, buffer, getRecentEvents, SSE addClient/removeClient/broadcast/sendCatchup, persistence, clear |
| **SimulationLoop** | Unit | Singleton, start/stop/pause/resume, speed, tick, match registration, state, events, match completion |
| **LiveMatch** | Unit | Tick, state transitions, getMatchMinute, score, winner, admin controls, events, shootout, stats |
| **MatchSimulator** | Unit | simulate() result shape, scores, highlights, strength, penalties, edge cases |
