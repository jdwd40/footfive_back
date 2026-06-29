# Bugs

Tracked simulation / live-match bugs. Newest first.

## Open

_None._

## Fixed

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
