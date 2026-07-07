# New Features

Newest first.

## Cyborg Garage (2026-07-07) — COMPLETE

Light, casual arcade-management layer around the existing 16-team knockout
cup (explicitly approved scope change — see `project_plan.md` §3). One shared
user-controlled lower-tier team (Swirl City), virtual Garage Credits only.

Backend (`footfive_back`):

- Migration `009_cyborg_garage.sql`: `teams.stadium_size`, `garage` (single
  row: team + balance), `garage_players` (is_active, mode, speed, condition,
  energy), `garage_match_results` (PK fixture_id = idempotent rewards),
  `garage_transactions` (money audit). Seed + test-seed kept in sync.
- `GarageService.ensureInitialized()` at server startup: creates the garage
  with ₵500 starting funds, tops the squad up to 7 players (2 spares),
  stamps stadium sizes on all teams from strength (C small → A+/A++ mega).
- Squad: 7 players, exactly 5 active (validated), 2 spares, rotation only
  between matches. Modes: Passive / Balanced / Aggressive (attack/defence/
  speed modifiers + energy drain 12/20/30 + foul-risk + damage-risk).
- Match integration (no sim rewrite): garage overrides the user team's
  input ratings from the active 5's effective stats (mode × energy ×
  condition effectiveness), filters commentary players to the active 5,
  and biases foul-side selection by `foulRiskMultiplier` (defaults keep
  every other match byte-identical). Applied at round creation and recovery.
- Post-match processing hooked next to bet settlement in `SimulationLoop`
  (plus a startup sweep): drains energy + damages condition for the active
  5 (win or lose), credits win rewards inside one DB transaction.
  Idempotent — a fixture can never pay twice.
- Rewards: round base (R16 200 / QF 350 / SF 600 / Final 1000) + tier bonus
  (A- 100 … A++ 400) + upset bonus (150) + away stadium bonus (large 75 /
  mega 150) + opponent history bonus (wins + 25×championships, capped 200).
- Money sinks (all balance-validated, transactional, never negative):
  small energy pack (+25, ₵40), full squad recharge (₵150), repair
  (₵2/condition point), stat upgrade `cost = 20 + stat² × 0.15` (attack/
  defence in `players`, speed in `garage_players`; cap 99).
- Routes under `/api/garage`: state, team switch (`PUT /team` — balance
  kept, new team garage-readied, old team's state stays dormant), lineup,
  mode, energy, repair, upgrade, reward summaries (`/rewards/latest`,
  `/rewards/:fixtureId`), idempotent `/rewards/:fixtureId/process`,
  transactions.
- Squad energy resets to 100 at every new tournament setup (hooked on
  `tournament_setup`); condition is NOT reset so repairs matter across
  cup runs.
- All tunables in `gamelogic/garage/garageConfig.js`; pure calculations in
  `gamelogic/garage/garageCalc.js`.

Frontend (`footfive_front`):

- New `/garage` page (navbar "Garage"): team picker dropdown (confirm
  before switching), bank balance, 7 player cards with
  attack/defence/speed (tap to upgrade, price shown), energy/condition bars,
  mode chips, active/spare toggle with confirm-lineup flow, small pack /
  full recharge / repair buttons, pre-match panel (opponent, round,
  home/away, stadium, low energy/condition warnings), post-match reward
  breakdown + squad wear summary. Mobile-first.

Tests: 17 unit (reward/cost/mode/energy calcs) + 19 integration (API,
lineup validation, money validation, idempotent rewards, sim overrides).
Full backend suite 534 green; frontend 187 green.

## Pre-match & post-match navigation (2026-07-07) — COMPLETE

Countdown-driven waiting states between fixtures screen and live match view.

- Fixtures screen (Live Dashboard + Fixtures page): real kickoff countdown
  during round/tournament breaks ("Next round kicks off in MM:SS", "New cup
  drops in MM:SS"), fed by new `nextRoundStartAt` / `nextTournamentStartAt`
  in tournament status. Fallback copy ("Preparing next fixture…") when no
  timestamp yet.
- Live View pre-kickoff: opens normally for SCHEDULED fixtures; shows teams,
  "Kickoff Soon" badge, countdown, "Players entering the neon cage…"
  placeholder. No 0-0 active score, no 0' minute, no empty feed. Match
  starts via existing SSE `match_start` / poll flow when countdown ends.
- Backend stops fabricating 0-0 for SCHEDULED fixtures in
  `GET /api/live/fixtures` (null score/minute).
- Auto-return: 60s after `match_end`/`shootout_end` message is visible,
  navigate back to fixtures screen. Never during play/ET/shootout/reveal
  queue; never for matches opened already finished; manual back cancels.

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
