# Critical Bug #01: Knockout Match Draw Bug

**Status:** FIXED (pending verification)
**Severity:** Critical
**First Reported:** ~January 4, 2026
**Last Updated:** January 6, 2026
**Root Cause Found:** January 6, 2026

---

## Bug Description

In a knockout tournament simulation, matches should **never end in a draw**. Every match must have a winner - if regular time (90 mins) ends in a draw, the match should proceed to extra time (120 mins), and if still drawn, to a penalty shootout. However, the backend occasionally reports draws from knockout matches, which breaks the tournament bracket progression.

### Symptoms

- Match ends with equal scores (e.g., 2-2) and no winner declared
- `winner_team_id` in database is NULL for completed fixtures
- Frontend displays match as "drawn" when it should show a winner
- Tournament bracket progression breaks (next round has missing/null teams)
- `match_end` event sent without `winnerId`

### Impact

- **Tournament breaks completely** - cannot advance to next round
- **Data integrity issues** - NULL winners in database
- **User experience** - confusing/broken bracket display

---

## Root Cause Analysis

The bug has multiple potential entry points, which is why it has been difficult to fully resolve:

### 1. Rule Configuration Issues
The `rules` object passed to `LiveMatch` may have `knockout`, `extraTimeEnabled`, or `penaltiesEnabled` set to falsy values (`false`, `undefined`, `null`), causing the match to skip extra time/penalties.

### 2. State Transition Race Conditions
Wall-clock based scheduling in `TournamentManager` can trigger round transitions before matches in extra time or penalties have finished, causing matches to appear as draws.

### 3. Penalty Score Tracking Bug
The `0 || null` JavaScript truthy check issue - when penalty scores are `0-0` and neither team has taken penalties, the check `this.penaltyScore.home || null` incorrectly evaluates to `null`.

### 4. Match Never Started
Matches stuck in `SCHEDULED` state (never received first tick) are counted as "complete" when checking round transitions.

### 5. forceEnd() Without Resolution
Admin `forceEnd()` command could end knockout matches without ensuring a winner exists.

---

## Attempted Fixes

### Fix #1: Block Round Transition Until All Matches Finish
**Commit:** `268cac1` (Jan 4, 2026)
**Files:** `TournamentManager.js`

Added logic to block tournament state transitions from playing rounds to break states if any matches are still in progress (extra time/penalties).

```javascript
// _isTransitionToBreak() - detects playing -> break transitions
// _allMatchesFinished() - checks all LiveMatch instances are FINISHED with a winner
if (this._isTransitionToBreak(this.state, targetState) && !this._allMatchesFinished()) {
  console.log(`Blocking transition: matches still in progress`);
  return;
}
```

**Result:** Partially fixed - helped with wall-clock scheduling but didn't catch all cases.

---

### Fix #2: Defensive Checks for Knockout Draws
**Commit:** `35abff6` (Jan 4, 2026)
**Files:** `LiveMatch.js`

Changed rule checks from truthy evaluation to explicit `!== false`, so undefined/missing rules default to knockout behavior. Added failsafe to force penalties if somehow a knockout draw reaches fulltime with no ET/penalties.

```javascript
// BEFORE:
if (isDraw && this.rules.knockout && this.rules.extraTimeEnabled) { ... }

// AFTER:
const isKnockout = this.rules.knockout !== false;  // undefined = true
const hasExtraTime = this.rules.extraTimeEnabled !== false;
if (isDraw && isKnockout && hasExtraTime) { ... }

// FAILSAFE: Force penalties anyway
if (isDraw && isKnockout) {
  console.error(`CRITICAL: Knockout draw but no ET/penalties! Forcing PENALTIES`);
  this.state = MATCH_STATES.PENALTIES;
}
```

**Result:** Fixed configuration edge cases but bug still occurred in other scenarios.

---

### Fix #3: Detect SCHEDULED (Never-Started) Matches
**Commit:** `d05d901` (Jan 4, 2026)
**Files:** `TournamentManager.js`

Enhanced `_allMatchesFinished()` to explicitly detect matches that were never started (still in `SCHEDULED` state). These are now logged as critical errors and block round transitions.

```javascript
// CRITICAL: Check for matches that never started
if (match.state === 'SCHEDULED') {
  scheduledCount++;
  console.error(`CRITICAL: Match ${match.fixtureId} never started!`);
  continue;
}
```

**Result:** Prevented round transitions with un-started matches, but didn't address draw bug directly.

---

### Fix #4: Ensure Knockout Matches Always Resolve with Penalties
**Commit:** `b392a77` (Jan 5, 2026)
**Files:** `LiveMatch.js`

Three key changes:

1. **forceEnd() fix**: When force-ending a knockout match that's still a draw, simulate instant penalties first:
```javascript
forceEnd() {
  const isDraw = this.score.home === this.score.away;
  const isKnockout = this.rules.knockout !== false;

  if (isDraw && isKnockout) {
    if (this.penaltyScore.home === 0 && this.penaltyScore.away === 0) {
      this._simulateInstantPenalties();
    }
  }
  this.state = MATCH_STATES.FINISHED;
}
```

2. **Defensive check in _handleMatchEnd()**: Catch edge case where knockout match somehow reaches FINISHED as a draw without penalties:
```javascript
if (isDraw && isKnockout && (this.penaltyScore.home === 0 && this.penaltyScore.away === 0)) {
  console.error(`CRITICAL: Knockout match ending as draw without penalties! Fixing...`);
  this._simulateInstantPenalties();
}
```

3. **Fixed penalty score handling**: The `0 || null` bug - changed to check if penalties were taken:
```javascript
const penaltiesPlayed = this.penaltyScore.home > 0 || this.penaltyScore.away > 0 ||
                        this.shootoutTaken.home > 0 || this.shootoutTaken.away > 0;
```

**Result:** Helped catch more edge cases but bug still reported.

---

### Fix #5: Latest Draw Bug Fix
**Commit:** `ef638ed` (Jan 6, 2026)
**Files:** `LiveMatch.js`

Additional defensive logic (details in code).

**Result:** Testing ongoing.

---

### Fix #6: forceEnd() Database Finalization (ROOT CAUSE FIX)
**Commit:** (Jan 6, 2026)
**Files:** `LiveMatch.js`

**ROOT CAUSE IDENTIFIED:** The `forceEnd()` method was setting `state = FINISHED` directly without calling `_finalizeMatch()`. This meant:

1. In-memory state was correct (winner calculated properly)
2. Database was NEVER updated (winner_team_id stayed NULL)
3. Tournament continued fine in memory, but DB showed draws

**The Problem:**
```javascript
// BEFORE - forceEnd() just set state directly
forceEnd() {
  // ... simulate penalties if needed ...
  this.state = MATCH_STATES.FINISHED;
  // NO DATABASE UPDATE! winner_team_id stays NULL
}
```

**Why This Happened:**
- Normal match flow: tick → state change → `_handleStateTransition()` → `_handleMatchEnd()` → `_finalizeMatch()`
- forceEnd() bypassed this entire chain by setting state directly
- DB finalization only happens in `_finalizeMatch()`, which was never called

**The Fix:**
```javascript
// AFTER - forceEnd() now calls _finalizeMatch()
forceEnd() {
  // ... simulate penalties if needed ...
  this.state = MATCH_STATES.FINISHED;

  // CRITICAL: Finalize match to database
  this._finalizationPromise = this._finalizeMatch().catch(err => {
    console.error(`[LiveMatch ${this.fixtureId}] forceEnd finalize error:`, err);
  });
}
```

**Result:** Database now properly updated when admin force-ends matches. Winner is correctly recorded.

---

## Current State of the Code

### LiveMatch.js Key Defensive Points

1. **_handleFulltime()** (line 304-329):
   - Checks `knockout !== false` (defaults to true)
   - Has failsafe to force PENALTIES if knockout draw with no ET/penalties

2. **_handleExtraTimeEnd()** (line 331-351):
   - Same failsafe for post-ET draws

3. **_handleMatchEnd()** (line 417-462):
   - Final defensive check before DB write
   - Calls `_simulateInstantPenalties()` if knockout draw without penalties

4. **getWinnerId()** (line 951-959):
   - Checks penalty scores first
   - Returns null only if true draw (should never happen in knockout)

### TournamentManager.js Key Defensive Points

1. **_allMatchesFinished()** (line 244-285):
   - Blocks round transitions if any match not FINISHED
   - Detects SCHEDULED (never-started) matches
   - Detects finished matches without winnerId

2. **_isTransitionToBreak()** (line 229-237):
   - Identifies playing-to-break transitions to block

---

## Root Cause Found

**The primary cause of the draw bug was `forceEnd()` not calling `_finalizeMatch()`.**

When admin force-ended stuck matches (or if the system called forceEnd programmatically), the database was never updated with the winner. The in-memory state was correct, so the tournament progressed fine, but the database showed `winner_team_id = NULL`, which the frontend interpreted as a draw.

### Other Potential Issues (Lower Priority)

These issues were also identified during investigation but are less likely to be the primary cause:

1. **Shootout timing bug when `extraTimeEnabled: false`**: If match enters PENALTIES without going through extra time, `et2End` is null, causing shootout to never process. (Edge case - requires specific rule configuration)

2. **Equal penalty scores return wrong winner**: If `penaltyScore = { home: 3, away: 3 }` (shouldn't happen), returns away team instead of detecting invalid state.

---

## Logging Added

Extensive logging has been added to help diagnose:

```
[LiveMatch {id}] Created with rules: knockout={}, extraTimeEnabled={}, penaltiesEnabled={}
[LiveMatch {id}] _handleFulltime: score={}, isDraw={}, knockout={}, extraTimeEnabled={}, penaltiesEnabled={}
[LiveMatch {id}] Knockout draw - going to EXTRA_TIME_1
[LiveMatch {id}] _handleExtraTimeEnd: score={}, isDraw={}, knockout={}, penaltiesEnabled={}
[LiveMatch {id}] CRITICAL: Knockout match ending as draw without penalties! Fixing...
[LiveMatch {id}] Instant penalties result: {}-{}
[TournamentManager] Blocking {} -> {}: matches still in progress
[TournamentManager] CRITICAL: Match {} never started!
[TournamentManager] Round status: X/Y complete, Z never started, W in progress
```

---

## Reproduction Steps

The bug is intermittent and difficult to reproduce reliably. Conditions that seem to increase likelihood:

1. Multiple matches in a round ending close together
2. Matches that go to extra time
3. Server under load
4. Browser tab losing focus (may affect SSE connection)
5. Wall-clock time transitions (e.g., crossing :09, :15, :24 minute marks)

---

## Next Steps to Investigate

1. Add more logging around `getWinnerId()` calls
2. Add assertion/throw if `winnerId` is null in knockout match
3. Review async flow in `_finalizeMatch()`
4. Check if `_processShootoutTick()` can leave shootout unresolved
5. Add integration tests specifically for drawn matches going to ET/pens
6. Consider synchronous winner calculation before async DB writes

---

## Related Files

- `Gamelogic/simulation/LiveMatch.js` - Core match simulation
- `Gamelogic/simulation/TournamentManager.js` - Tournament state management
- `Gamelogic/simulation/SimulationLoop.js` - Tick driver
- `models/FixtureModel.js` - Database operations
- `docs/TROUBLESHOOTING.md` - General troubleshooting (section: "Matches End Without Winner")

---

## Related Commits

| Commit | Date | Description |
|--------|------|-------------|
| `ef638ed` | Jan 6, 2026 | fixed latest draw bug |
| `b392a77` | Jan 5, 2026 | Fix: Ensure knockout matches always resolve with penalties |
| `35abff6` | Jan 4, 2026 | Fix: Defensive checks for knockout draws |
| `d05d901` | Jan 4, 2026 | Fix: Detect SCHEDULED matches before round transition |
| `268cac1` | Jan 4, 2026 | Fix: Block round transition until all matches finish |
