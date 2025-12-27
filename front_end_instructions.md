# Front End Integration Guide

## Tournament Flow

### 1. Initialize Tournament
```bash
GET /api/jcup/init
```

Returns all teams shuffled into Round of 16 fixtures with odds:
```json
{
  "message": "Tournament initialized successfully",
  "fixtures": [[
    {
      "team1": { "id": 1, "name": "Metro City", "attackRating": 87, ... },
      "team2": { "id": 6, "name": "Green Bay", ... },
      "fixtureId": 12,
      "odds": { "homeWin": 1.71, "awayWin": 2.15, "homeProb": 0.5564, "awayProb": 0.4436 }
    },
    ...
  ]]
}
```

### 2. Play Next Round
```bash
GET /api/jcup/play
```

Simulates all matches in current round. Returns results with highlights:
```json
{
  "message": "Round 2 played successfully.",
  "results": [{
    "fixtureId": 20,
    "score": { "Port Hilo": 9, "Metro Bay": 2 },
    "penaltyScore": {},
    "finalResult": "Port Hilo 9 - Metro Bay 2",
    "highlights": [
      { "minute": 19, "type": "goal", "team": "Port Hilo", "player": "F Hollywood", "description": "19': GOAL! Port Hilo score! 1-1" },
      ...
    ],
    "stats": {
      "home": { "possession": 0, "shots": 24, "shotsOnTarget": 15, "xG": 5.28, "corners": 0, "fouls": 3, "yellowCards": 1, "redCards": 0 },
      "away": { "possession": 0, "shots": 5, "shotsOnTarget": 4, "xG": 1.36, "corners": 3, "fouls": 1, "yellowCards": 0, "redCards": 0 }
    },
    "matchMetadata": {
      "homeTeam": "Port Hilo",
      "awayTeam": "Metro Bay",
      "round": "Quarter-finals",
      "odds": { "homeWin": 1.5, "awayWin": 2.61 }
    }
  }],
  "nextRoundFixtures": [{ "homeTeam": "...", "awayTeam": "...", "fixtureId": 24, "odds": {...} }]
}
```

### 3. Tournament Winner
When final is played, response includes:
```json
{
  "message": "Final played successfully.",
  "roundResults": [...],
  "winner": { "id": 1, "name": "Metro City" },
  "runner": { "id": 7, "name": "Orlean City" }
}
```

### 4. Reset Tournament
```bash
GET /api/jcup/reset
```

---

## Fixture API

### Get All Fixtures
```bash
GET /api/fixtures?status=completed&limit=10
```

Query params: `status`, `teamId`, `tournamentId`, `round`, `limit`

### Get Single Fixture
```bash
GET /api/fixtures/:id
```

Returns fixture details + odds.

### Get Match Events
```bash
GET /api/fixtures/:id/events
GET /api/fixtures/:id/events?type=goal
GET /api/fixtures/:id/events?afterEventId=50  # for polling
```

### Get Goals Only
```bash
GET /api/fixtures/:id/goals
```

### Get Match Report
```bash
GET /api/fixtures/:id/report
```

Returns full stats: possession, shots, xG, corners, fouls, cards.

---

## Standalone Fixture Simulation

### Create Fixture
```bash
POST /api/fixtures
Content-Type: application/json

{ "homeTeamId": 1, "awayTeamId": 2, "round": "Friendly" }
```

### Simulate Fixture
```bash
POST /api/fixtures/:id/simulate
```

---

## Event Types

| Type | Description |
|------|-------------|
| kickoff | Match/half start |
| goal | Goal scored |
| own_goal | Own goal |
| shot_saved | Shot on target saved |
| shot_missed | Shot off target |
| blocked | Shot blocked |
| penalty_awarded | Penalty given |
| penalty_scored | Penalty converted |
| penalty_missed | Penalty missed |
| penalty_saved | Penalty saved |
| pressure | Team pressure phase |
| corner | Corner kick |
| foul | Foul committed |
| yellow_card | Yellow card |
| red_card | Red card |
| halftime | Half time |
| fulltime | Full time |
| extra_time_start | Extra time begins |
| shootout_start | Penalty shootout begins |
| shootout_goal | Shootout pen scored |
| shootout_miss | Shootout pen missed |
| shootout_save | Shootout pen saved |

---

## Typical Front End Flow

1. Call `/api/jcup/init` - display bracket with odds
2. User clicks "Play Round" - call `/api/jcup/play`
3. Display results with highlights, animate goals
4. Show `nextRoundFixtures` for upcoming matches
5. Repeat until `winner` appears in response
6. Display trophy ceremony with winner/runner-up
