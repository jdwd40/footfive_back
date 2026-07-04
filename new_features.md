# New Features

Live-match commentary / event-generation improvements. Newest first.

## More varied event messages (2026-07-04)

Generic flow-chain commentary is now varied, player-aware and more
football-like. `CommentaryEngine.decorate` gained template pools for
`midfield_battle`, `goal_build_up` (per chain phase: `push_forward` /
`beat_defender` / `force_issue`), `attack_breakdown`, `counter_attack`,
`counter_breakdown`, `kickoff_restart` and the pre-corner block-behind
`defensive_action`, plus extra variants for `shot_saved` / `shot_missed` /
`shot_blocked`.

```
D. Kaimana surges forward for Port Hilo.        (goal_build_up, push_forward)
R. Okoye leaves a defender chasing shadows.     (goal_build_up, beat_defender)
Virgin slam the door shut on Port Hilo.         (attack_breakdown)
E. Quill leads the break for Virgin!            (counter_attack)
Virgin kick off again, looking for a response.  (kickoff_restart)
```

- Player-less build-up / counter steps may get an attack-weighted outfield
  player stamped (`playerId` / `displayName`) so lines can name a player;
  chance tuned via `COMMENTARY.FLOW_PLAYER_LINE_CHANCE`. Team-only fallbacks
  apply when no player data exists — no "undefined" ever.
- Breakdown lines keep the defender as the event's team (`teamId` / `side`
  unchanged); the frontend resolves parties from structured `side`, so the
  legacy description regexes are unaffected (fallback for old events only).
- Chain metadata (`bundleId`, `bundleStep`, `chain_type`, `chain_terminal`,
  `pacing`), score handling and event ordering are untouched.
- Frontend `EventFeed` no longer discards flow-event descriptions that name
  the player instead of the team, so player-led lines display as headlines.

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
