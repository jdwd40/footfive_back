# New Features

Newest first.

## Virtual betting system (2026-07-04) — ACTIVE

Optional virtual betting layer across backend and frontend. Virtual/dummy
funds only ("Footfive Credits" / FC) — no real money, no payment providers.

Backend (`footfive_back`):

- User accounts: `POST /api/auth/register`, `POST /api/auth/login`,
  `GET /api/auth/profile` (bcrypt password hashing + JWT middleware).
- Virtual wallet: `GET /api/wallet`, `POST /api/wallet/add-funds` (dummy
  funds, capped per top-up), `GET /api/wallet/transactions`. New users start
  with 1,000 FC. Every balance change is recorded as a wallet transaction.
- Betting endpoints under `/api/betting`: fixture odds, live odds,
  championship odds (public); place pre-match / live / championship bets,
  list bets, betting summary (authenticated).
- Odds engine (`gamelogic/BettingOddsService.js`): deterministic formula from
  team ratings, cup wins, and J-Cups won; live odds fold in scoreline and
  match minute; championship odds use power share of remaining teams. Odds
  are clamped (1.05–21.0) and frozen on each bet at placement time.
- Rules enforced server-side: win-only bets, no backing both sides of one
  fixture (repeat bets must be same side), no live bets after full time, no
  championship bets once semi-finals begin, stake deducted atomically with
  row-level locking.
- Settlement (`services/SettlementService.js`): idempotent, backend-driven.
  Fixture bets settle when the fixture result is finalised (shootout winners
  count as winners); championship bets settle on `tournament_end`; bets are
  voided (stake refunded) if a tournament is cancelled. Startup + admin
  sweep (`POST /api/admin/settlement/sweep`) recover any missed settlements.
- Migration `008_betting_system.sql`: `users`, `user_wallets`,
  `wallet_transactions`, `bets`.

Frontend (`footfive_front`):

- Account page (`/account`): register/login/logout, balance, dummy fund
  top-ups, recent transactions. Navbar shows a wallet chip when logged in.
- Fixtures screen: pre-match odds + bet slip on scheduled fixture cards, and
  a championship winner odds board (closes at semi-finals, eliminated teams
  drop off).
- Live match screen: compact collapsible live betting panel with polled
  dynamic odds; separate from the event reveal queue so commentary pacing,
  score sync, and match controls are untouched.
- My Bets page (`/bets`): pending/won/lost/void bets with type, team, stake,
  odds, potential return, and summary totals.
- All money UI is labelled as virtual credits (FC).

Tests: backend Jest unit tests for the odds engine + full integration suite
(auth, wallet, bet rules, live/championship gating, idempotent settlement,
shootout settlement); frontend Vitest tests for betting utils. Full suites
green.

---

Live-match commentary / event-generation improvements below.

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
