# Changelog

## Unreleased

- **Added** virtual betting system (virtual/dummy funds only, no real money):
  user accounts (bcrypt + JWT), virtual wallets with dummy fund top-ups and
  transaction history, pre-match / live in-play / championship winner betting,
  deterministic odds engine (`gamelogic/BettingOddsService.js`), and
  idempotent backend settlement hooked into fixture completion and
  `tournament_end` (penalty-shootout winners count as match winners).
  Migration `008_betting_system.sql` adds `users`, `user_wallets`,
  `wallet_transactions`, `bets`. New routes: `/api/auth`, `/api/wallet`,
  `/api/betting`, plus `POST /api/admin/settlement/sweep`.
  (see `new_features.md`)
- **Added** frontend betting UI: Account page (register/login/wallet),
  My Bets page, navbar wallet chip, fixture-card odds + bet slip,
  championship odds board, and a collapsible live betting panel that polls
  odds independently of the event reveal queue. Mobile-first, virtual credits
  (FC) labelling throughout.
- **Fixed** `db/seed.js` inline `match_events` schema missing the
  `match_observation` event type added by migration 007 (re-seeding via the
  diagnostic endpoint would recreate the table without it).
- No changes to score/winner logic, event pacing, shootout score separation,
  or round progression; betting tests assert settlement uses confirmed
  backend results only. Backend suite: 498 tests green. Frontend: 179 tests
  green.

- **Added** varied, player-aware commentary for generic flow events
  (`midfield_battle`, `goal_build_up` phases, `attack_breakdown`,
  `counter_attack`, `counter_breakdown`, `kickoff_restart`, pre-corner
  block-behind, extra shot-result variants) via `CommentaryEngine` template
  pools; player-less build-up/counter steps may be stamped with a picked
  outfield player for player-led lines. (see `new_features.md`)
- **Changed** frontend `EventFeed` to accept flow-event descriptions that name
  the event's player (not just the team) so improved backend lines are not
  replaced by generic frontend templates.
- No changes to score/winner logic, round progression, shootout scoring, or
  chain metadata.

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
