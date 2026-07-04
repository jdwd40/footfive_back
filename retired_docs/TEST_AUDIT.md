# Test Suite Audit Report

Audit criteria: mocks-overuse, asserting the obvious, mirroring implementation, brittle snapshots, redundant tests, overly permissive assertions, test names that lie.

---

## 1. Mocks for everything → Only testing your mocks

**Severity: High (unit controllers); Low (gamelogic)**

### adminController.test.js
- **Issue:** SimulationLoop, EventBus, and TournamentManager are fully mocked. Many tests only verify that a mock method was called and that `res.json` received the mock’s return value.
- **Examples:**
  - `startSimulation`: Asserts `mockLoop.init()` and `mockLoop.start()` were called, then `res.json({ success: true, state: expect.any(Object) })`. The “state” is whatever `getState()` on the mock returns; no real behavior is tested.
  - `forceTournamentStart` (success path): Asserts `mockTM.startNow()` was called and `res.json` got `{ success: true, state: { state: 'ROUND_ACTIVE' } }`. That only checks the controller forwards the mock’s return value.
  - `forceScore`, `forceEndMatch`, `pauseSimulation`, `resumeSimulation`, `setSpeed`: Same pattern — assert the mock was called with specific args and `res.json` with a fixed shape.
- **Recommendation:** Keep a few unit tests for error paths and response shapes (e.g. “simulation not initialized” returns 400 + hint). For success paths, prefer integration tests that use a real or minimal SimulationLoop (or at least assert observable outcomes, not “this mock was called”).

### liveController.test.js
- **Issue:** EventBus and SimulationLoop are fully mocked. Responses are exactly what the mocks return.
- **Examples:**
  - `getTournamentState`: Asserts `res.json` equals the object returned by `tournamentManager.getState()`. You’re testing “controller forwards mock’s return value.”
  - `getActiveMatches`, `getMatchState`, `getStatus`: Same — response shape is dictated by the mock.
  - `streamEvents`: Asserts `mockEventBus.addClient(mockRes, filters)` and `sendCatchup(clientId, seq)`. That’s “did we call the mock?” not “did the client receive correct events?”
- **Recommendation:** Treat these as “controller wiring” tests and keep them minimal. Add integration or E2E tests that hit real (or less mocked) EventBus/SimulationLoop and assert observable client outcomes.

### Other files
- **EventBus.test.js:** Uses real EventBus; only MatchEventModel is mocked. Persistence tests still assert a real outcome (events stored, stats updated). **OK.**
- **TournamentManager.test.js, SimulationLoop.test.js, LiveMatch.test.js:** Use mocks for DB/external deps but exercise real game logic. **Acceptable.**

---

## 2. Asserting the obvious / “returns defined”

**Severity: Medium**

- **PlayerModel.test.js**
  - `expect(player).toBeDefined()` in `fetchById` and similar: redundant once you assert `player.playerId`, `player.name`, etc. Prefer removing `toBeDefined()` and keeping the concrete property assertions.
- **TeamModel.test.js**
  - `expect(team).toBeDefined()` in `getRatingById`: same as above.
- **PlayerController / TeamController / DiagnosticController**
  - Many tests do both `expect(response.body).toHaveProperty('message')` and then more specific checks. For “returns 200 and body has message + main payload,” one assertion that the payload exists and is used in later assertions is enough; no need to assert “message” in every test.
- **Array checks**
  - `expect(Array.isArray(players)).toBe(true)` followed by `expect(players.length).toBeGreaterThan(0)` or `forEach`: the `length` or `forEach` already implies an array. You can use `expect(players).toEqual(expect.any(Array))` or just assert on `length`/content and drop the redundant `Array.isArray`.

**Recommendation:** Remove redundant `toBeDefined()` and duplicate “has property message/players” assertions where a stronger assertion (exact shape or key fields) already exists.

---

## 3. Mirroring implementation (asserting internal method calls)

**Severity: High in controller unit tests**

- **adminController.test.js**
  - `startSimulation`: Asserts `mockLoop.init()` then `mockLoop.start()`. That’s implementation (call order). Better: “after startSimulation, a subsequent call to getFullState (or similar) shows simulation running,” or cover via integration test.
  - `cancelTournament`: Asserts `mockTM.cancel()` and `mockLoop.matches.size === 0`. The second is an outcome; the first is “did we call cancel?”. Outcome-focused would be “getFullState (or equivalent) no longer shows active matches.”
  - `forceScore`: `expect(mockLoop.forceSetScore).toHaveBeenCalledWith(1, 3, 2)` — pure implementation. Outcome: “score for fixture 1 is 3–2” (e.g. from getMatchState or getFullState).
  - Similar for `forceEndMatch`, `setSpeed`, `skipToRound` (calling `mockTM.skipToRound('FINAL')`), etc.
- **liveController.test.js**
  - `streamEvents`: Asserting `mockEventBus.addClient(mockRes, {})` and `sendCatchup('client_1', 5)` is implementation. Outcome would be “client receives connected event and catchup events when subscribing with afterSeq.”
- **SimulationLoop.test.js**
  - “should notify tournament manager when matches complete”: Asserts `onMatchFinalized` was called with a specific payload. That’s a contract test (correct payload to dependency). Reasonable to keep, but it’s still “internal method called”; consider one higher-level test that “when a match finishes, tournament state advances” if you have the wiring.

**Recommendation:** In controller unit tests, reduce “X was called with Y” assertions. Prefer “response status/body and (where possible) observable state” so refactors (e.g. extracting a service) don’t break tests that only checked call order.

---

## 4. Brittle snapshots

**Severity: None**

- No `toMatchSnapshot()` or large `toEqual(fullObject)` on entire API responses.
- Some tests assert “response has these keys” with `expect.any(Object)` (e.g. adminController `getFullState`). If the API grows more keys, you might want to narrow to “at least these keys” (e.g. `expect.objectContaining`) so adding fields doesn’t force unrelated test updates.

---

## 5. Redundant tests (same behavior, only data differs)

**Severity: Medium**

- **Content-Type**
  - “should return proper content type” (or “JSON”) is repeated in: playerController (GET /api/players, GET /api/players/:id), teamController (GET /api/teams, GET /api/teams/3jcup), diagnosticController (GET and POST), index.test.js (Content-Type block). Same assertion, different routes.
  - **Recommendation:** One shared test “API returns JSON for documented GET endpoints” that loops over a list of routes, or keep a single test per suite and drop the rest.
- **Route availability / mounting**
  - diagnosticRoutes, playerRoutes, teamRoutes all have: “GET /api/… should be available”, “mounted under /api prefix”, “not available without /api”. Same idea, duplicated.
  - **Recommendation:** Centralize in main routes test (e.g. index.test.js) or a single “route mounting” test file that checks all mounted paths and methods.
- **PlayerController**
  - GET /api/players: “should return all players”, “should return players with correct structure”, “should include both goalkeepers and outfield players”, “should have valid stat ranges” — same request, multiple describes. Could be one test: “returns 200, array of players with required fields, valid stats, and at least one GK and one outfield.”
  - GET /api/players/team/:teamName: “should return only players from specified team” (checks name, attack, defense) and “should include goalkeepers and outfield players” — overlap; can merge.
- **PlayerModel / TeamModel**
  - “should return player with valid stat ranges” vs “should have valid stat ranges for all players” (and similar for teams) — same “stats in range” logic, different scope. Consider one parameterized or single “all returned entities have valid ranges” test.
- **MatchSimulator**
  - “should handle minimum rating values” and “should handle maximum rating values” — same “does not throw” behavior, different bounds. One test with two inputs is enough unless you have separate logic for min vs max.

**Recommendation:** Merge tests that only differ by route or by input value and don’t add a new behavior; use parameterized tests or a single test with multiple assertions where appropriate.

---

## 6. Overly permissive assertions

**Severity: Medium**

- **TournamentManager.test.js**
  - `expect(manager.tournamentId).toBeTruthy()` — could be `expect(typeof manager.tournamentId).toBe('number')` and `expect(manager.tournamentId).toBeGreaterThan(0)`.
  - “should shuffle teams”: comment says “at least some teams should be in different positions,” but the test only does `expect(teamIds.length).toBe(originalIds.length)`. So we never assert that order changed. Either assert that `teamIds` is not equal to `[1,2,...,16]` (or that at least one index differs), or remove/reword the test.
- **TeamModel.test.js**
  - getTop3JCupWinners: `expect(topWinners.length).toBeGreaterThan(0)` — with seeded data you might assert `topWinners.length === 3` (or ≤ 3) and that the first has the highest `jcups_won`.
- **index.test.js**
  - GET /api/jcup/init: `expect([200, 400]).toContain(res.status)` — too permissive; decide expected status for “init when not ready” vs “init when ready” and assert the exact status (and optionally body) per scenario.
- **teamController.test.js**
  - “should handle malformed requests gracefully”: `expect([200, 404]).toContain(res.status)` for GET /api/teams/ — either define “malformed” and assert the correct status (e.g. 404 for trailing slash if that’s the spec), or remove the test.

**Recommendation:** Replace `toBeTruthy()` and “status in [200, 404]” with exact expectations (type, value, or status per scenario).

---

## 7. Test names that lie

**Severity: None**

- No cases found where the name claims “throws on invalid input” (or similar) but the test doesn’t assert the throw.
- Throw tests (e.g. PlayerModel/TeamModel “non-existent ID”, TournamentManager “invalid round”) correctly use `rejects.toThrow(...)`.

---

## 8. Other notes

- **routes/index.js** sends `{ "msg:": "ok" }` (key is the string `"msg:"`). The tests correctly expect `response.body['msg:']`. Consider renaming the key to `msg` for a more conventional API.
- **adminController** “pause simulation” / “resume simulation”: both assert `isPaused: false` in the response. If the controller is supposed to reflect current pause state, one of these might be wrong; worth checking the implementation.

---

## Summary

| Category                    | Severity | Action |
|----------------------------|----------|--------|
| Mocks for everything       | High     | Reduce controller unit tests that only assert mocks; add outcome/integration tests for admin + live. |
| Asserting the obvious      | Medium   | Remove redundant toBeDefined / toHaveProperty('message') / Array.isArray where stronger assertions exist. |
| Mirroring implementation  | High     | Prefer response/state outcomes over “mock X was called with Y” in controller tests. |
| Brittle snapshots          | None     | No change. Optionally use objectContaining for partial response checks. |
| Redundant tests            | Medium   | Merge duplicate Content-Type, route availability, and “same endpoint different assertion” tests. |
| Overly permissive          | Medium   | Replace toBeTruthy and status-in-array with exact assertions; fix shuffle test to assert order change. |
| Test names that lie        | None     | No change. |
