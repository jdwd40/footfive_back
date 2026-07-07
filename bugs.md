# Bugs

Tracked simulation / live-match bugs. Newest first.

## Open

### Decisive shootout kick's chain has no terminal step (2026-07-04)

**Symptom:** The kick that wins a shootout is marked `chain_terminal: false`
(because `_shouldEmitReaction` returns true for a decider), but the shootout
finishes on that same tick, so the terminal `shootout_reaction` never fires —
leaving that bundle with zero terminal steps. Display-only; scores and
progression are unaffected. Found while smoke-testing commentary changes;
pre-existing in `PenaltyShootout.processTick`.

## Fixed

### Admin force-score accepted any body and silently set undefined scores (2026-07-07)

**Symptom:** `POST /api/admin/match/:id/force-score` read `{ home, away }`
from the body with no validation. Sending wrong keys (e.g. `{ homeScore,
awayScore }`) responded `{"success":true,"score":{}}` and set the live
match score to `undefined`/`undefined`, which then read as a draw at full
time (forced penalties on force-end). Admin/dev only; found while
E2E-testing the Cyborg Garage.

**Fix:** `adminController.forceScore` now requires both values to be
integers ≥ 0 and returns 400 otherwise (unit-tested).

### Corner awarded immediately after a same-team possession-loss (2026-06-29)

**Symptom:** A corner could be shown directly after a message saying the same
team had just lost the ball / been shut down, e.g.

```
Airway City lose the ball.
Corner kick to Airway City.
```

**Cause:** In `EventGenerator._handleAttack`, the defensive-block branch always
emitted an `attack_breakdown` ("… shut down …'s attack", a turnover) and then,
when a corner was rolled, a standalone `corner` event for the same attacking
team. The turnover read as a possession loss immediately before the same team
was handed the corner.

**Fix:** When a block wins a corner, emit a coherent sequence instead of the
turnover:

```
Airway City force the issue.        (goal_build_up, phase=force_issue)
Tripper City block it behind.       (defensive_action, chain terminal)
Corner kick to Airway City.         (corner, standalone)
```

The `attack_breakdown` turnover is now only emitted when the block is a genuine
turnover (no corner). See `gamelogic/simulation/EventGenerator.js` and the
"Issue 1" tests in `__tests__/unit/gamelogic/EventGenerator.test.js`.
