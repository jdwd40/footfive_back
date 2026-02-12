# Latest Changes: Event-Driven Tournament Scheduling

**Date:** 2026-02-06
**Scope:** TournamentManager rewrite, SimulationLoop update, admin API alignment

---

## Summary

Replaced the wall-clock and force-mode tournament scheduling with a fully event-driven, persistent-state model. Round progression is now driven by match completion events and persisted timestamps — no `setTimeout`/`setInterval` for transitions, no minute-of-hour scheduling.

---

## New Migration

### `db/migrations/004_tournament_state.sql`

Created `tournament_state` table for persisting tournament lifecycle state across restarts:

- `tournament_id` INTEGER PRIMARY KEY
- `state` VARCHAR(30) — CHECK-constrained to: IDLE, SETUP, ROUND_ACTIVE, ROUND_COMPLETE, INTER_ROUND_DELAY, RESULTS, COMPLETE
- `current_round` VARCHAR(50) — CHECK-constrained to valid round names or NULL
- `round_started_at`, `delay_started_at`, `next_round_start_at` — TIMESTAMPTZ columns for timing
- `total_match_minutes` INTEGER — even-integer constraint (2..20), default 8

---

## File Changes

### `Gamelogic/simulation/TournamentManager.js` — Full rewrite

**State machine replaced:**

| Before (11 states) | After (7 states) |
|---|---|
| IDLE, SETUP, ROUND_OF_16, QF_BREAK, QUARTER_FINALS, SF_BREAK, SEMI_FINALS, FINAL_BREAK, FINAL, RESULTS, COMPLETE | IDLE, SETUP, ROUND_ACTIVE, ROUND_COMPLETE, INTER_ROUND_DELAY, RESULTS, COMPLETE |

Round identity (R16, QF, SF, Final) is now tracked as data (`currentRoundKey` / `currentRoundName`), not encoded into state names.

**Removed:**

- `SCHEDULE` constant (minute-of-hour -> state mapping)
- `_updateState(minute)` — wall-clock state transitions
- `_isTransitionToBreak()` — wall-clock guard
- `_checkForceModeTick()` — force-mode advancement
- `forceMode` flag
- `lastTickMinute` tracking
- `startNewTournament()` reference
- All break states: QF_BREAK, SF_BREAK, FINAL_BREAK

**Added:**

- `deriveMatchTimings(totalMatchMinutes)` — pure function that produces match rules from a single even-integer config value. Half duration = `(minutes/2) * 60000` (exact). Halftime scales linearly from 1 min (at 2 min match) to 5 min (at 20 min match). ET/penalties unchanged.
- `onMatchFinalized(result)` — replaces `onMatchesComplete()`. Called once per finished match. Updates the fixture's completed flag, then calls `_allMatchesFinished()`. When all matches are done, triggers round completion.
- `_transitionToInterRoundDelay(now)` — single DB transaction: idempotent winner advancement to next-round fixtures + persist INTER_ROUND_DELAY state with timestamps. SSE events emitted only after COMMIT.
- `_persistState()` — UPSERT to `tournament_state` on every state transition. `total_match_minutes` is immutable after initial INSERT.
- `recover()` — reads from `tournament_state` table. Handles inconsistent states:
  - ROUND_ACTIVE with no live fixtures -> promotes to ROUND_COMPLETE
  - INTER_ROUND_DELAY with missing next-round fixture teams -> idempotent regeneration
- `_ensureNextRoundFixturesPopulated()` — idempotent check/fill for next-round fixture teams (only writes NULL slots)
- `startNow(totalMatchMinutes)` — replaces `forceStart()`. Starts tournament immediately with event-driven flow and 5-minute inter-round delays.
- `setTotalMatchMinutes(minutes)` — validates even int 2..20, rejects if tournament is active.
- `skipToRound(targetRound)` — preserved for admin/testing, updated for new state model.
- `cancel()` — now async, persists COMPLETE state to DB.
- `forceStart()` — kept as deprecated alias for `startNow()`.

**`tick(now)` simplified:**

Now does exactly one thing: if `state === INTER_ROUND_DELAY` and `now >= this.nextRoundStartAt`, start the next round. No wall-clock reads.

**New constants:**

- `ROUND_ORDER` — ordered array of round keys
- `ROUND_SLOT_MAP` — round key -> bracket slot arrays
- `INTER_ROUND_DELAY_MS` — 5 minutes (300000 ms)
- `DEFAULT_TOTAL_MATCH_MINUTES` — 8

**New exports:** `BRACKET_STRUCTURE`, `ROUND_ORDER`, `ROUND_SLOT_MAP`, `INTER_ROUND_DELAY_MS`, `deriveMatchTimings`

**Removed exports:** `SCHEDULE`

---

### `Gamelogic/simulation/SimulationLoop.js` — Minor update

`checkMatchCompletion()` changed from batching finished matches into an array and calling `onMatchesComplete(array)` to calling `onMatchFinalized(result)` individually per finished match, with `.catch()` error handling on each async call.

---

### `Gamelogic/simulation/index.js` — Export update

Removed `SCHEDULE` export. Added `BRACKET_STRUCTURE`, `ROUND_ORDER`, `ROUND_SLOT_MAP`, `INTER_ROUND_DELAY_MS`, `deriveMatchTimings`.

---

### `controllers/adminController.js` — API alignment

- `startSimulation`: now passes `req.body.totalMatchMinutes` to `TournamentManager` constructor.
- `forceTournamentStart`: uses `startNow(totalMatchMinutes)` instead of `forceStart()`. Removed manual match registration (handled by `matches_created` event).
- `cancelTournament`: now async to support DB persistence of cancellation.
- `skipToRound`: removed manual match registration (handled by event).

---

## Architecture: Before vs After

### Before

```
tick() -> read wall-clock minute -> _updateState(minute) -> state transition
          OR
tick() -> forceMode -> _checkForceModeTick() -> immediate advancement (no delay)
```

### After

```
tick() -> only checks: INTER_ROUND_DELAY expired? (persisted timestamp)

SimulationLoop.checkMatchCompletion()
  -> onMatchFinalized() per match
    -> _allMatchesFinished()?
      -> yes: _collectWinnersAndAdvance() + _transitionToInterRoundDelay() [txn]
```

Round progression is event-driven. The only time-based check is the inter-round delay expiry, which compares `Date.now()` against a persisted `TIMESTAMPTZ`.

---

## What Was NOT Changed

- `LiveMatch.js` — no modifications (receives derived rules via constructor as before)
- `EventBus.js` — no modifications
- Database schema for `fixtures`, `match_events`, `match_reports` — untouched
- Match simulation logic — untouched
- SSE broadcasting — untouched (emission timing now controlled by caller)
- Test files — not updated yet (will need updating for new state names and `onMatchFinalized` signature)
