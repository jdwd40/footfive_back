# Latest Changes - Match Simulation System

## Overview
Added full match simulation with minute-by-minute events, betting odds, and DB persistence.

---

## New Files

### Gamelogic/OddsEngine.js
Calculates win probabilities and decimal odds.
- Uses team ratings, recent form (last 10 matches), goal difference
- Applies sigmoid function for probability normalization
- Converts to bookmaker-style odds with 5% margin
- No draw odds (knockout format only)

### Gamelogic/SimulationEngine.js
Full match simulation engine.
- Minute-by-minute event generation (1-90+)
- Possession phases, pressure events, shots, goals
- xG calculation per shot based on chance quality
- Player selection weighted by attack rating
- Scorer + assist tracking with player IDs
- Extra time (91-120) when drawn
- Penalty shootout with sudden death
- Real-time event persistence to DB
- Match report generation (shots, xG, corners, fouls, cards)

### models/FixtureModel.js
- CRUD operations for fixtures table
- Batch create for tournament rounds
- Team form queries (last N results)
- Status updates (scheduled → live → completed)

### models/OddsModel.js
- Odds CRUD with upsert support
- Query by fixture ID

### models/MatchEventModel.js
- Batch insert events during simulation
- Query by fixture, type, bundle
- `getAfter(fixtureId, eventId)` for live polling
- Goals-only query

### models/MatchReportModel.js
- Stats persistence (possession, shots, xG, corners, fouls, cards)
- Query with fixture details

### controllers/fixtureController.js
11 endpoint handlers:
- `createFixture` - single fixture + odds calc
- `createFixtures` - batch create for rounds
- `getFixtures` - list with filters
- `getFixture` - single with odds
- `getFixtureOdds` - odds only
- `recalculateOdds` - refresh odds
- `simulateFixture` - run simulation
- `getMatchReport` - full stats
- `getMatchEvents` - all events or filtered
- `getMatchGoals` - goals only
- `deleteFixture` - remove fixture

### routes/fixtureRoutes.js
```
POST   /api/fixtures
POST   /api/fixtures/batch
GET    /api/fixtures
GET    /api/fixtures/:id
DELETE /api/fixtures/:id
GET    /api/fixtures/:id/odds
POST   /api/fixtures/:id/odds/calculate
POST   /api/fixtures/:id/simulate
GET    /api/fixtures/:id/report
GET    /api/fixtures/:id/events
GET    /api/fixtures/:id/goals
```

### db/migrations/001_match_system.sql
Schema changes:
```sql
-- Extended teams table
ALTER TABLE teams ADD COLUMN recent_form VARCHAR(10);
ALTER TABLE teams ADD COLUMN goal_diff INTEGER;

-- New tables
CREATE TABLE fixtures (
  fixture_id SERIAL PRIMARY KEY,
  home_team_id, away_team_id, tournament_id, round,
  status ('scheduled'|'live'|'completed'),
  home_score, away_score,
  home_penalty_score, away_penalty_score,
  winner_team_id, scheduled_at, completed_at
);

CREATE TABLE match_reports (
  fixture_id UNIQUE,
  home/away: possession, shots, shots_on_target, xg,
  corners, fouls, yellow_cards, red_cards
);

CREATE TABLE match_events (
  fixture_id, minute, second, added_time,
  event_type, team_id, player_id, assist_player_id,
  description, xg, bundle_id, bundle_step
);

CREATE TABLE fixture_odds (
  fixture_id UNIQUE,
  home_win_prob, away_win_prob,
  home_win_odds, away_win_odds,
  margin, factors JSONB
);
```

### db/migrations/run-migration.js
Simple migration runner script.

### new_endpoints.md
API documentation for all fixture endpoints.

### front_end_instructions.md
Front-end integration guide with examples.

---

## Modified Files

### Gamelogic/JCup.js
- Added `useNewSimulation` flag (default true)
- Added `fixtureIds` array to track DB fixture IDs per round
- `generateFixtures()` now creates fixtures in DB + calculates odds
- `simulateRound()` uses SimulationEngine instead of legacy MatchSimulator
- `simulateSingleMatch()` updated for new engine
- Match results include fixtureId, odds, stats, highlights
- Backward compatible with legacy mode via flag

### routes/index.js
- Added fixture routes: `router.use('/fixtures', fixtureRoutes)`

### package.json
- No new dependencies added

---

## Database Tables Created

| Table | Purpose |
|-------|---------|
| fixtures | Match scheduling and results |
| match_events | Minute-by-minute events |
| match_reports | Full match statistics |
| fixture_odds | Win probabilities and decimal odds |

---

## Event Types Supported

kickoff, goal, own_goal, shot_saved, shot_missed, blocked,
penalty_awarded, penalty_scored, penalty_missed, penalty_saved,
pressure, corner, foul, yellow_card, red_card, halftime, fulltime,
extra_time_start, extra_time_half, shootout_start, shootout_goal,
shootout_miss, shootout_save

---

## Testing Performed

1. Created fixtures via API - odds calculated correctly
2. Simulated fixtures - events persisted in real-time
3. Full JCup tournament (16 teams, 15 matches)
4. Extra time triggered on draw (St Marri 3-4 Orlean City)
5. Penalty shootout worked (Mega City Two 0-0 Orlean City, pens 2-5)
6. Winner crowned (Metro City 5-2 Orlean City in final)
7. Verified DB: fixtures, events (87 per match), reports, odds

---

## Commit

```
2d399e9 add match simulation system + betting odds
15 files changed, 2798 insertions(+), 152 deletions(-)
```
