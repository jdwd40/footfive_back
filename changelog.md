# Changelog

## 2026-06-29 — Live-match attacking event polish

Backend live-match event generation (`gamelogic/simulation/EventGenerator.js`):

- **Fixed** corner contradiction: a corner won off a defensive block is no
  longer preceded by a same-team "lost possession" / "attack breaks down"
  event. It now reads as `force the issue → block it behind → corner kick`.
  Genuine turnovers (no corner) still emit `attack_breakdown`. (see `bugs.md`)
- **Added** a shot build-up event immediately before every in-match shot
  result (`goal` / `shot_saved` / `shot_missed` / `shot_blocked`), chained to
  the result and score-neutral. (see `new_features.md`)
- **Added** missed-shot message variety, including "hit the post"; still a
  `shot_missed` with no score change, plus a `missVariant` metadata hint.

No changes to score handling, penalty-shootout score separation, round
progression, or existing event ordering / chain metadata. Tests added/updated
in `__tests__/unit/gamelogic/EventGenerator.test.js`; full suite green
(402 tests).
