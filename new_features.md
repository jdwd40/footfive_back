# New Features

Live-match commentary / event-generation improvements. Newest first.

## Shot build-up before every shot result (2026-06-29)

Every normal in-match shot now emits a short build-up event immediately before
its result so outcomes no longer appear abruptly:

```
P. Blue takes the shot for Airway City!   (goal_build_up, phase=shot_attempt)
GOAL! P. Blue finds the net for Airway City!
```

- Reuses the existing `goal_build_up` event type (already in the live stream),
  tagged `phase: 'shot_attempt'`, so existing frontends keep rendering it.
- Emitted before `goal`, `shot_saved`, `shot_missed`, and `shot_blocked`.
- Part of the same chain bundle as the result (shared `bundleId`, previous
  `bundleStep`, non-terminal, with `pacing`), so the frontend can reveal the
  build-up and result as one readable chain.
- Never updates the score; only the actual result event does.
- Uses the shooter's name where available, with team-only fallbacks
  ("Airway City take a shot!").

## Missed-shot variety incl. "hit the post" (2026-06-29)

Missed shots now vary their wording and can read as a post strike:

```
Airway City hit the post!
P. Blue drags it wide.
Airway City blaze it over!
```

- Still emitted as `shot_missed` (no new event type, no score change). A
  `metadata.missVariant` (`miss` | `wide` | `over` | `post`) lets the frontend
  optionally flavour a post differently while still treating it as a miss.
