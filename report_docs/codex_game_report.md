# FootFive Game Engine Report (LLM-Oriented)

## Overview
- Purpose: Summarize how FootFive simulates matches, computes scores, and generates highlights.
- Core files: `Gamelogic/JCup.js` (tournament), `Gamelogic/MatchSimulator.js` (match engine), `models/TeamModel.js` (ratings from DB).

## Core Flow
- Tournament manager: `JCup` shuffles teams, builds fixtures, simulates rounds, advances winners.
- Match engine: `MatchSimulator` runs a 90-minute, minute-by-minute simulation; ties resolved via penalty shootout.
- Ratings source: `TeamModel` computes team ratings on demand from player stats.

## Team Ratings
- Attack rating: max `players.attack` with `is_goalkeeper = false`.
- Defense rating: max `players.defense` with `is_goalkeeper = false`.
- Goalkeeper rating: max `players.defense` with `is_goalkeeper = true`.
- Used via `Team.getRatingByTeamName(name)` right before each match.

## Tournament Handling
- Fixtures: teams are shuffled and paired; byes handled if odd team count.
- Round sim: for each fixture, run `MatchSimulator(team1, team2).simulate()` and collect results.
- Winner selection: compares final `result.score[team1.name]` vs `result.score[team2.name]`.
- Progression: winners form next round fixtures; after final, increments winner’s `jcups_won`.

## Match Engine
- State: `score` per team, `penaltyScore` per team (shootout only), `highlights` array, `minute` counter, `homeTeam/awayTeam` labels.
- Loop: minutes `1..90`. Each minute calls `simulateMinute()`; adds half-time (45) and full-time (90) highlights.
- Tie rule: if scores equal after 90, run penalty shootout; append shootout highlights and merge shootout tallies into final `score`.
- Return: `{ score, penaltyScore, highlights, finalResult }`.

## Event & Probability Model
- Attack chance per minute: `attackRating / 200`.
- Defense block chance: `defenseRating / 110`.
- Shot on target: `0.6`.
- Goalkeeper save: `goalkeeperRating / 90`.
- In-play penalty: `0.04` chance during an attack; conversion `0.5`.
- Penalty shootout: 5 kicks each, then sudden death until differentials; per-kick success `0.75`.

## Scoring Rules
- Regular time: goals increment `score[attackingTeam]` in shots/penalties.
- Shootout: per-kick goals tracked in `penaltyScore`; after resolution, both `penaltyScore` values are added into `score` and a winner highlight is pushed.
- Final string: `"Team1 X - Team2 Y"` or with shootout `"Team1 X(p1) - Team2 Y(p2)"`.

## Highlight Generation
- Types: `goal`, `shot`, `penalty`, `blocked`, `halfTime`, `fullTime`, `penaltyShootout`.
- Structure per event: `{ minute, type, team?, description, score: { home, away } }`.
- Emitted on: attacks (blocked/shot/goal), in-play penalties (scored/missed), half-time (45), full-time (90), shootout (each kick + winner summary).
- Score snapshot in each highlight uses `homeTeam=team1.name`, `awayTeam=team2.name`.

## Round Output Shape (per match)
- `score`: object keyed by team name (includes shootout tallies after shootout).
- `penaltyScore`: object keyed by team name (shootout-only totals).
- `highlights`: chronological array of event objects (types above).
- `finalResult`: formatted result string.
- `matchMetadata`: `{ homeTeam, awayTeam, venue, date, round }`.

## API Endpoints (Express)
- `GET /api/jcup/init`: resets state, loads teams, generates first-round fixtures.
- `GET /api/jcup/play`: simulates current round; returns round results and next fixtures.
- `POST /api/jcup/end`: increments `jcups_won` for the winner.

## Key Behaviors & Considerations
- Winner decision uses `score` after shootout tallies are added; this conflates regulation goals and shootout goals in the final `score` object.
- `score` keys are literal team names; uniqueness and consistency are required.
- `highlights.score` shows the in-play running total (not including separate `penaltyScore`), but after shootout, `score` is augmented.
- Ratings fetched at match time by team name; `getAll()` does not include ratings fields.

## File Pointers
- Tournament: `Gamelogic/JCup.js`
- Match engine: `Gamelogic/MatchSimulator.js`
- Ratings: `models/TeamModel.js`
- API: `controllers/jCupController.js`, `routes/jCupRoutes.js`, `listen.js`

