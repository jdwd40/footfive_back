# FootFive Test Suite Review

Date: 2026-05-29

Scope: current Jest test suite under `__tests__/`, test helpers, Jest setup, and measured coverage from the existing codebase. No test files were changed for this review.

## Executive verdict

The suite has useful coverage in several important areas, especially the live simulation units, event persistence, EventBus behavior, and basic model/controller integration. It is not yet a high-confidence safety net for the whole backend.

All 18 test suites and all 330 tests passed during the review run, but coverage failed the repository's own global thresholds. The biggest risk is not just low percentage coverage; it is uneven coverage. Some high-value systems are tested well, while fixture APIs, odds/report models, live fixture listing, TournamentManager state transitions, and some scheduler/recovery behavior are lightly tested or not directly tested.

There are also several tests that are low-value, redundant, or too tightly coupled to mocks. A few tests are effectively hard-coded to pass against the mock data rather than proving the real behavior. These should not all be deleted immediately, but they should be consolidated or replaced by stronger tests when the suite is improved.

## How this was assessed

I reviewed:

- `jest.config.js`
- all 18 `*.test.js` files under `__tests__/`
- shared test setup in `__tests__/setup/`
- shared DB helpers in `test-helpers/`
- current docs related to test coverage
- a coverage run using the existing test command

Coverage command used:

```bash
env -u PGUSER -u PGDATABASE -u PGPASSWORD -u PGHOST -u PGPORT npm test -- --coverage --coverageReporters=text --coverageDirectory=/tmp/footfive-test-coverage --runInBand
```

Result:

- Test suites: 18 passed, 18 total
- Tests: 330 passed, 330 total
- Snapshots: 0
- Runtime: about 48 seconds
- Command exit code: 1, because coverage thresholds failed

The failing exit code was caused by coverage thresholds, not by failing assertions.

## Measured coverage

Global coverage from the run:

| Metric | Actual | Configured global threshold | Status |
|--------|--------|-----------------------------|--------|
| Statements | 60.42% | 70% | Fails |
| Branches | 51.39% | 70% | Fails |
| Functions | 59.61% | 70% | Fails |
| Lines | 61.10% | 70% | Fails |

Important module-level coverage:

| Area | Statement coverage | Branch coverage | Notes |
|------|--------------------|-----------------|-------|
| Routes | 100% | 100% | Misleading; mostly proves route modules mount, not full behavior. |
| Controllers | 55.08% | 36.57% | `fixtureController.js` and parts of `liveController.js` are major gaps. |
| Models | 41.27% | 40.37% | `PlayerModel` is excellent, `TeamModel` is decent, fixture/odds/report models are weak. |
| `gamelogic/simulation` | 72.46% | 65.33% | Good core unit coverage, but `TournamentManager` and `TournamentScheduler` lag behind. |
| legacy/core `gamelogic` | 11.23% | 0% | `OddsEngine.js` and `SimulationEngine.js` are barely exercised. |

Notable low-coverage files:

| File | Coverage signal | Risk |
|------|-----------------|------|
| `controllers/fixtureController.js` | 15.62% statements, 0% functions | Fixture API behavior is largely unprotected. |
| `controllers/liveController.js` | 50% statements | `getLiveFixtures` and several paths need direct coverage. |
| `models/FixtureModel.js` | 33.65% statements | Core tournament persistence behavior needs stronger tests. |
| `models/MatchReportModel.js` | 3.70% statements | Match reports are effectively untested. |
| `models/OddsModel.js` | 5.55% statements | Odds persistence is effectively untested. |
| `models/UserModel.js` | 0% | Placeholder or dead code; decide whether to test or remove from coverage scope. |
| `gamelogic/OddsEngine.js` | 14.70% statements | Odds generation is not meaningfully verified. |
| `gamelogic/SimulationEngine.js` | 3.70% statements | Legacy simulator is not meaningfully verified. |
| `gamelogic/simulation/TournamentManager.js` | 38.88% statements, 22.48% branches | Tournament orchestration is under-tested relative to its importance. |
| `gamelogic/simulation/TournamentScheduler.js` | 26.92% statements, 0% branches | Scheduling decisions are under-tested. |

## What is good and useful

### EventBus tests

`__tests__/unit/gamelogic/EventBus.test.js` is one of the strongest parts of the suite.

It covers:

- event normalization
- replay buffer behavior
- category filtering
- SSE client filtering
- catch-up delivery
- persistence handoff
- persistence failure safety
- richer match-state and tournament-state payloads

The test uses a mocked persistence boundary while exercising real EventBus behavior. That is a good balance for this unit.

### LiveMatch tests

`__tests__/unit/gamelogic/LiveMatch.test.js` covers a broad range of simulation behavior:

- initial match state
- match timing
- phase transitions
- event generation
- score updates
- half-time and full-time behavior
- extra time and penalties
- snapshots
- max-silence behavior
- substitutions and cards

This is relevant and useful because `LiveMatch` contains a large amount of user-visible match behavior.

The main weakness is that some tests rely on repeated random attempts until a desired event appears. That is not hard-coded to pass, but it does make those cases more probabilistic than ideal.

### Event persistence integration

`__tests__/integration/persistence/matchEventTypes.test.js` is highly valuable.

It verifies:

- every `PERSISTABLE_MATCH_EVENT_TYPES` value inserts cleanly
- chain narrative event types are accepted by the database constraint
- `seq` round-trips
- `server_timestamp` is generated
- `createBatch` works for chain events
- non-persistable pacing events are intentionally excluded

This test protects against a real class of production breakage: application event types drifting away from the `match_events` database CHECK constraint.

### Admin/live integration tests

`__tests__/integration/adminLiveIntegration.test.js` is conceptually valuable because it exercises the app through HTTP and SSE with the real simulation components.

It covers user-visible behavior that pure unit tests cannot:

- admin start/status controls
- live state endpoint behavior
- SSE connection behavior
- event emission after simulation start
- event history replay

However, this file also has the most serious test infrastructure problem: the real simulation loop can continue running after tests finish. See "Async leakage and teardown risk" below.

### PlayerModel and TeamModel tests

`__tests__/unit/models/PlayerModel.test.js` and `__tests__/unit/models/TeamModel.test.js` are useful DB-backed model tests.

They test real queries against the test database and cover many normal and error cases. `PlayerModel` reaches 100% coverage, and `TeamModel` is one of the better-covered model files.

## Relevant but weaker tests

### Controller integration tests

The team, player, and diagnostic controller integration tests are relevant because they verify Express routing through real controllers and a real test database.

Weaknesses:

- several tests hit the same endpoint repeatedly to assert small shape fragments that could be checked in one stronger test
- many assertions only prove that a property exists, not that the data relationship is correct
- error-path coverage is uneven

Example: `__tests__/integration/controllers/playerController.test.js` has several separate `GET /api/players` tests that could be consolidated into one test with stronger assertions.

The test named "should return only players from specified team" is weak because the returned player object does not include enough team identity to prove the filter from the response alone. It verifies that players are returned and have player-like properties, but not that every returned player belongs to the requested team.

### Route smoke tests

The route tests under `__tests__/api/routes/` are relevant as smoke tests, but they are overrepresented.

They mostly prove:

- the route is mounted
- GET is accepted
- unsupported methods return 404
- `/api` prefix behavior works

Those checks have some value, but many are duplicated across team/player/diagnostic routes. They also inflate route coverage to 100% while leaving important controller and model behavior untested.

## Unnecessary or low-value tests

These tests are not harmful by themselves, but they add maintenance cost without much confidence.

### Repeated route availability checks

Examples:

- `__tests__/api/routes/teamRoutes.test.js`
- `__tests__/api/routes/playerRoutes.test.js`
- `__tests__/api/routes/diagnosticRoutes.test.js`
- `__tests__/api/routes/index.test.js`

Patterns that could be reduced:

- repeated "route should be accessible" checks
- repeated "GET method should be accepted" checks
- repeated "POST/PUT/DELETE should return 404" checks when no behavior is attached
- repeated `/api` prefix checks

Recommendation: keep a small route smoke suite, but move most confidence into controller/API behavior tests that assert real outputs and error cases.

### Overly shallow shape assertions

Examples across the suite include:

- `toHaveProperty('message')`
- `toBeDefined()`
- `Array.isArray(...)`
- checking only that status is `200` without checking the state transition that made it correct

These are fine as secondary checks, but many are not useful as standalone assertions. Prefer assertions that prove a business rule, relationship, or state transition.

### Repetitive controller shape tests

Some controller integration tests make multiple requests to the same endpoint and check one field at a time. These could be consolidated into fewer tests with richer assertions.

This would make the suite faster and easier to maintain without reducing confidence.

## Hard-coded or mocked-to-pass risks

This does not mean the whole suite is fake. It means some tests prove that mocks return their own fixture data, rather than proving the production behavior.

### Admin controller speed test

File: `__tests__/unit/controllers/adminController.test.js`

The test suite fully mocks `SimulationLoop`, `EventBus`, and `TournamentManager`.

The clearest issue is the speed test:

- `mockLoop.setSpeed` is a no-op mock
- the test sends `{ multiplier: 10 }`
- the expected response still includes `speedMultiplier: 1` and `tickIntervalMs: 1000`

That means the test can pass even if the controller fails to apply the requested speed. It is asserting the mock's hard-coded state, not the real effect of the request.

This is the strongest example of a test that is effectively hard-coded to pass.

Recommendation: when changes are allowed, replace or supplement this with a test that verifies `setSpeed` is called with the requested multiplier and that the response reflects updated state from a stateful fake or real loop.

### Admin controller start/status tests

File: `__tests__/unit/controllers/adminController.test.js`

`mockLoop.getState` returns a hard-coded running state. Tests such as start simulation/status checks mainly assert that a response contains that mocked object.

These tests still have some value as controller wiring tests, but they do not prove the simulation loop actually starts or transitions state.

Recommendation: keep a small mocked controller test for HTTP shape, but rely on integration tests for real behavior.

### Live controller tests

File: `__tests__/unit/controllers/liveController.test.js`

The suite hard-codes EventBus state, tournament state, active match snapshots, and recent events in mocks.

This is useful for checking response formatting, but it does not prove:

- real EventBus replay behavior
- real SimulationLoop state behavior
- real live fixture retrieval
- behavior when fixture records are missing or inconsistent

The Stage 1 active match snapshot test is especially mock-driven: the expected fields are defined in the mock and then asserted in the response.

Recommendation: keep these as lightweight contract tests, but add integration tests for live endpoints that use real fixture and simulation state.

### TournamentManager tests

File: `__tests__/unit/gamelogic/TournamentManager.test.js`

This suite mocks `TeamModel`, `FixtureModel`, `PlayerModel`, `MatchReportModel`, and `db`. That makes it fast, but it also means many results are produced by the mocks.

The shuffle test has a specific bug:

- the test passes `new TournamentManager(8, fixedRandom)`
- the constructor does not accept that second argument as a random function
- the test therefore still uses normal randomness

This test is not deterministic and does not prove the intended seeded shuffle behavior.

Some fixture progression behavior is also based on mocked fixture IDs and teams, which may not reflect real bracket state.

Recommendation: introduce deterministic randomness through a supported seam only if the production code supports it, or test shuffle properties that do not depend on exact random order.

## Brittle or flaky tests

### Async leakage and teardown risk

The coverage run printed repeated Jest warnings:

```text
Cannot log after tests are done. Did you forget to wait for something async in your test?
```

The stack traces pointed into live simulation ticks, including `TournamentManager._allMatchesFinished` through `SimulationLoop.tick`.

The same run also showed late EventBus persistence errors after database cleanup, including:

- `relation "match_events" does not exist`
- foreign key failures on `match_events_fixture_id_fkey`

Likely cause:

- `__tests__/integration/adminLiveIntegration.test.js` starts the real simulation loop
- `beforeEach` resets the loop
- `afterEach` only runs DB cleanup
- there is no matching after-test loop stop/reset before the database is cleaned or dropped

This can allow scheduled ticks to keep firing into later tests or teardown, where the database has already been truncated or dropped.

Recommendation: when test changes are allowed, ensure the simulation loop and EventBus are stopped/reset in `afterEach` or `afterAll` before DB cleanup completes.

### Timing-sensitive SSE tests

`__tests__/integration/adminLiveIntegration.test.js` uses fixed waits and timeouts around SSE behavior.

These tests are valuable, but fixed sleeps such as 50 ms, 100 ms, 2500 ms, 3500 ms, and 4000 ms can become flaky under load.

Recommendation: prefer event-driven waits where possible: resolve when the expected event arrives, with a timeout only as a guard.

### Probabilistic LiveMatch tests

Some `LiveMatch` tests repeatedly tick or generate events until a desired event type appears.

These tests are understandable because match events are probabilistic, but they can still be brittle. If event weighting changes, the tests might fail even though behavior remains acceptable.

Recommendation: use seeded randomness, injectable event generation, or assert broader invariants where exact event selection is not the behavior under test.

## Major coverage gaps

### Fixture API

`controllers/fixtureController.js` is a major gap.

Missing or weak coverage includes:

- fixture creation
- fixture listing
- fixture by ID
- fixture update/delete behavior
- odds endpoints
- match events endpoint
- match report endpoint
- goal scorers endpoint
- legacy simulate endpoint
- error paths for missing teams, invalid IDs, and missing fixtures

Because fixtures connect teams, odds, events, reports, and simulation results, this should be one of the next areas improved.

### Fixture, odds, event, and report models

The model suite is uneven:

- `PlayerModel` is excellent
- `TeamModel` is decent
- `FixtureModel` is weak
- `OddsModel` is almost untested
- `MatchReportModel` is almost untested
- `MatchEventModel` has valuable integration coverage for insertion/types, but retrieval/query behavior still needs more direct tests

Recommended additions:

- `FixtureModel.create`, `fetchAll`, `fetchById`, `fetchByStatus`, update score/status, bracket queries
- `OddsModel` create/fetch/update behavior
- `MatchReportModel` create/fetch behavior
- `MatchEventModel` retrieval order, fixture filtering, batch insert edge cases

### OddsEngine

`gamelogic/OddsEngine.js` has very low coverage.

This matters because odds are user-visible and are likely to be sensitive to team ratings and fixture state.

Recommended additions:

- deterministic odds from known team ratings
- home/away or neutral fixture handling, if applicable
- edge cases for missing teams or ratings
- persistence into `fixture_odds`

### Live fixtures endpoint

`controllers/liveController.js` has only partial coverage. The uncovered `getLiveFixtures` path is important because it is likely consumed by frontend live views.

Recommended additions:

- no live fixtures
- one live fixture
- multiple fixtures in different states
- malformed/missing fixture data
- expected response ordering and shape

### TournamentManager and scheduler

`TournamentManager` is central to the product, but coverage is low relative to its importance.

Missing or weak behavior includes:

- setup and recovery from existing tournament state
- round transitions
- bracket advancement using real fixture records
- final completion
- continuous mode
- scheduled breaks
- recent form/stat updates
- handling missing or inconsistent DB state

`TournamentScheduler` also needs direct tests for schedule decisions, break windows, and round timing.

### Legacy SimulationEngine

`gamelogic/SimulationEngine.js` has almost no coverage. Decide whether this is still part of supported behavior.

Recommendation:

- if it is legacy/deprecated, move it out of coverage scope or document it as legacy
- if it is still supported, add targeted tests for match simulation and tournament generation

## Test infrastructure quality

### Good infrastructure choices

The suite has several good foundations:

- separate Jest global setup and teardown
- test database safety checks
- reusable Express test app helper
- DB cleanup helpers
- environment-specific `.env.test` loading
- the AGENTS.md warning about clearing injected PG environment variables

These make the suite practical to run locally.

### Infrastructure concerns

The main infrastructure concern is lifecycle cleanup for long-running simulation components.

Any test that starts:

- `SimulationLoop`
- SSE clients
- timers
- intervals
- DB-persisting event emitters

must also stop them before DB cleanup or global teardown.

The current warnings indicate that at least one test leaves asynchronous work running.

## Existing test docs are stale

The repository keeps these superseded historical docs in `retired_docs/`:

- `retired_docs/TEST_AUDIT.md`
- `retired_docs/TEST_COVERAGE.md`

Those files are stale in places. They reference older endpoints and test files that do not match the current route and test inventory.

They are retained for context only. Use this file as the current test-suite review.

## File-by-file assessment

| Test file | Current value | Issues | Recommendation |
|-----------|---------------|--------|----------------|
| `__tests__/api/routes/index.test.js` | Basic API smoke coverage. | Low behavioral depth. | Keep small. Avoid expanding route-only smoke tests. |
| `__tests__/api/routes/teamRoutes.test.js` | Confirms team routes mount. | Duplicates method/prefix checks. | Consolidate later. Prefer controller/API assertions. |
| `__tests__/api/routes/playerRoutes.test.js` | Confirms player routes mount. | Duplicates method/prefix checks. | Consolidate later. Prefer controller/API assertions. |
| `__tests__/api/routes/diagnosticRoutes.test.js` | Confirms diagnostic routes mount. | Duplicates method/prefix checks. | Consolidate later. |
| `__tests__/integration/controllers/teamController.test.js` | Useful real controller + DB coverage. | Could assert relationships/error cases more strongly. | Keep and strengthen. |
| `__tests__/integration/controllers/playerController.test.js` | Useful real controller + DB coverage. | Some repeated endpoint checks; team filter assertion is weak. | Keep, consolidate, strengthen filter proof. |
| `__tests__/integration/controllers/diagnosticController.test.js` | Useful health/count endpoint coverage. | Mostly straightforward. | Keep. |
| `__tests__/integration/adminLiveIntegration.test.js` | Very valuable end-to-end live/admin coverage. | Leaves async simulation work running; timing-sensitive SSE waits. | Keep, but fix teardown before relying on it. |
| `__tests__/integration/persistence/matchEventTypes.test.js` | High-value DB constraint and event persistence coverage. | None significant. | Keep. |
| `__tests__/unit/controllers/adminController.test.js` | Useful controller wiring coverage. | Heavy mocks; some tests assert mock state instead of behavior. | Keep only as light contract coverage; add real/stateful tests later. |
| `__tests__/unit/controllers/liveController.test.js` | Useful response-shape coverage. | Heavy hard-coded mocks; does not prove real live data behavior. | Keep as contract tests; add integration coverage. |
| `__tests__/unit/gamelogic/EventBus.test.js` | Strong unit coverage. | None significant. | Keep. |
| `__tests__/unit/gamelogic/EventGenerator.test.js` | Useful event generation coverage. | Randomness may need deterministic controls as behavior grows. | Keep and extend carefully. |
| `__tests__/unit/gamelogic/LiveMatch.test.js` | Broad and relevant simulation coverage. | Some probabilistic tests. | Keep; reduce randomness over time. |
| `__tests__/unit/gamelogic/SimulationLoop.test.js` | Useful loop control coverage. | Needs confidence around real integration/lifecycle. | Keep; pair with integration cleanup fixes. |
| `__tests__/unit/gamelogic/TournamentManager.test.js` | Covers some orchestration paths. | Heavy mocks; low real-state confidence; one random injection assumption is invalid. | Keep but rewrite/augment critical paths. |
| `__tests__/unit/models/PlayerModel.test.js` | Strong DB-backed model coverage. | None significant. | Keep. |
| `__tests__/unit/models/TeamModel.test.js` | Good DB-backed model coverage. | Some missing edge cases remain. | Keep and extend. |

## Priority recommendations

### Priority 1: fix test lifecycle leakage

Before adding many more tests, fix the live simulation teardown problem. The current suite passes, but late async logs and DB errors after tests are a reliability warning.

Best target:

- `__tests__/integration/adminLiveIntegration.test.js`

Expected improvement:

- no Jest "Cannot log after tests are done" warnings
- no EventBus persistence attempts after DB cleanup
- less flaky CI behavior

### Priority 2: add fixture API coverage

Add integration tests for `routes/fixtureRoutes.js` and `controllers/fixtureController.js`.

This is the largest functional hole in the current API test suite.

### Priority 3: add missing model tests

Add DB-backed tests for:

- `FixtureModel`
- `OddsModel`
- `MatchReportModel`
- remaining `MatchEventModel` query behavior

This will improve both coverage and confidence in simulation persistence.

### Priority 4: replace hard-coded controller mock assertions

Start with `adminController.setSpeed`.

The current test should not expect unchanged mock state after requesting a speed change. It should prove either:

- `setSpeed(10)` was called and the response reflects updated state, or
- an integration endpoint actually changes loop speed

### Priority 5: improve TournamentManager confidence

Add tests for real tournament progression and recovery paths. Use mocks where they isolate expensive dependencies, but avoid mocks that manufacture the behavior being tested.

### Priority 6: reduce redundant route tests

After stronger API/controller tests exist, remove or consolidate repetitive route smoke tests.

This should be done after adding better coverage, not before.

## Direct answers to the review questions

### Do the tests have good coverage?

Partially. Some areas are well covered, but overall coverage is below the configured threshold and important backend areas are weakly covered. The answer is "not yet" for the codebase as a whole.

### Are the tests relevant and useful?

Mostly yes. The suite is generally aimed at relevant behavior. The most useful tests are the EventBus tests, LiveMatch tests, event persistence integration tests, model tests for players/teams, and admin/live integration tests.

### Are there unnecessary tests?

Yes. The most unnecessary tests are repetitive route availability/method/prefix checks and shallow shape assertions that duplicate stronger tests. These should be consolidated after better fixture/controller/model coverage exists.

### Are any tests hard-coded to pass?

Yes, some are at risk of being hard-coded or mock-driven to pass. The clearest example is the admin controller speed test, where the test sends a new speed multiplier but expects the mock loop's unchanged hard-coded state. Several live/admin controller unit tests also primarily assert hard-coded mock payloads.

### Should tests be changed now?

No test changes were made as part of this review. The next change should be deliberate: first fix async cleanup in the admin/live integration tests, then add missing fixture/model coverage, then consolidate low-value route tests.
