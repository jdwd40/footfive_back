# API Reference

Base URL: `http://localhost:9001/api` (development) or `https://jwd1.xyz/api` (production)

## Teams

### Get All Teams
```http
GET /api/teams
```

**Response**
```json
{
  "message": "Teams fetched successfully",
  "teams": [
    {
      "id": 1,
      "name": "Manchester United",
      "attackRating": 85,
      "defenseRating": 82,
      "goalkeeperRating": 80,
      "wins": 15,
      "losses": 3,
      "goalsFor": 45,
      "goalsAgainst": 12,
      "jcups_won": 5,
      "runner_ups": 2,
      "highest_round_reached": "Winner"
    }
  ]
}
```

### Get Top JCup Winners
```http
GET /api/teams/3jcup
```

**Response**
```json
{
  "message": "Top 16 teams fetched successfully",
  "teams": [
    { "name": "Manchester United", "jcups_won": 5 },
    { "name": "Liverpool", "jcups_won": 4 }
  ]
}
```

### Get All Team Stats
```http
GET /api/teams/stats
```

**Response**
```json
{
  "message": "Team stats fetched successfully",
  "stats": [
    {
      "team_id": 1,
      "name": "Manchester United",
      "wins": 15,
      "losses": 3,
      "goals_for": 45,
      "goals_against": 12,
      "goal_diff": 33,
      "jcups_won": 5,
      "runner_ups": 2,
      "highest_round_reached": "Winner",
      "recent_form": "WWWLWWWWWW"
    }
  ]
}
```

---

## Players

### Get All Players
```http
GET /api/players
```

**Response**
```json
{
  "message": "Players fetched successfully",
  "players": [
    {
      "playerId": 1,
      "teamId": 1,
      "name": "Player Name",
      "attack": 85,
      "defense": 70,
      "isGoalkeeper": false
    }
  ]
}
```

### Get Player by ID
```http
GET /api/players/:playerId
```

**Response**
```json
{
  "message": "Player fetched successfully",
  "player": {
    "playerId": 1,
    "teamId": 1,
    "name": "Player Name",
    "attack": 85,
    "defense": 70,
    "isGoalkeeper": false
  }
}
```

### Get Players by Team Name
```http
GET /api/players/team/:teamName
```

**Example**: `GET /api/players/team/Manchester%20United`

**Response**
```json
{
  "message": "Players fetched successfully",
  "players": [...]
}
```

---

## Fixtures

### Get Fixtures
```http
GET /api/fixtures
```

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| status | string | Filter by status: `scheduled`, `live`, `completed` |
| teamId | number | Filter by team ID |
| round | string | Filter by round name |
| tournamentId | number | Filter by tournament ID |
| limit | number | Max results (default: 100) |

**Response**
```json
{
  "fixtures": [
    {
      "fixtureId": 1,
      "homeTeamId": 1,
      "awayTeamId": 2,
      "homeTeamName": "Manchester United",
      "awayTeamName": "Liverpool",
      "tournamentId": 123456789,
      "round": "Quarter-finals",
      "status": "completed",
      "homeScore": 2,
      "awayScore": 1,
      "homePenaltyScore": null,
      "awayPenaltyScore": null,
      "winnerTeamId": 1,
      "bracketSlot": "QF1",
      "feedsInto": "SF1"
    }
  ]
}
```

### Get Single Fixture
```http
GET /api/fixtures/:id
```

### Get Fixture Odds
```http
GET /api/fixtures/:id/odds
```

**Response**
```json
{
  "fixture": {
    "fixtureId": 1,
    "homeTeamName": "Manchester United",
    "awayTeamName": "Liverpool"
  },
  "odds": {
    "homeWinProb": 0.55,
    "awayWinProb": 0.45,
    "homeWinOdds": 1.82,
    "awayWinOdds": 2.22,
    "margin": 0.05
  }
}
```

### Get Match Report
```http
GET /api/fixtures/:id/report
```

**Response**
```json
{
  "report": {
    "fixtureId": 1,
    "homePossession": 55.5,
    "awayPossession": 44.5,
    "homeShots": 12,
    "awayShots": 8,
    "homeShotsOnTarget": 5,
    "awayShotsOnTarget": 3,
    "homeXg": 1.85,
    "awayXg": 0.95,
    "homeCorners": 6,
    "awayCorners": 3,
    "homeFouls": 10,
    "awayFouls": 12,
    "homeYellowCards": 2,
    "awayYellowCards": 1,
    "homeRedCards": 0,
    "awayRedCards": 0,
    "extraTimePlayed": false,
    "penaltiesPlayed": false
  }
}
```

### Get Match Events
```http
GET /api/fixtures/:id/events
```

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| type | string | Filter by event type (e.g., `goal`, `shot_saved`) |
| afterEventId | number | Get events after this ID |

**Response**
```json
{
  "events": [
    {
      "eventId": 1,
      "fixtureId": 1,
      "minute": 23,
      "second": 45,
      "eventType": "goal",
      "teamId": 1,
      "playerId": 5,
      "assistPlayerId": 8,
      "description": "Goal scored by Player Name",
      "xg": 0.45,
      "outcome": "scored"
    }
  ]
}
```

### Get Match Goals
```http
GET /api/fixtures/:id/goals
```

---

## Live / Real-Time

### Get Live Status
```http
GET /api/live/status
```

**Response**
```json
{
  "simulationRunning": true,
  "isPaused": false,
  "tickCount": 12345,
  "speedMultiplier": 1,
  "tournament": {
    "state": "QUARTER_FINALS",
    "tournamentId": 123456789,
    "currentRound": "Quarter-finals",
    "teamsRemaining": 4,
    "activeMatches": 4,
    "winner": null,
    "runnerUp": null,
    "lastCompleted": {
      "tournamentId": 123456788,
      "winner": { "id": 1, "name": "Manchester United" },
      "runnerUp": { "id": 2, "name": "Liverpool" }
    }
  },
  "schedule": {
    "currentMinute": 17,
    "nextRound": "Semi-finals",
    "nextRoundStartsAt": ":30"
  }
}
```

### Get Tournament State
```http
GET /api/live/tournament
```

**Response**
```json
{
  "state": "QUARTER_FINALS",
  "tournamentId": 123456789,
  "currentRound": "Quarter-finals",
  "teamsRemaining": 4,
  "activeMatches": 4,
  "winner": null,
  "runnerUp": null
}
```

### Get Active Matches
```http
GET /api/live/matches
```

**Response**
```json
{
  "matches": [
    {
      "fixtureId": 1,
      "state": "SECOND_HALF",
      "minute": 67,
      "score": { "home": 1, "away": 1 },
      "homeTeam": { "id": 1, "name": "Manchester United" },
      "awayTeam": { "id": 2, "name": "Liverpool" },
      "bracketSlot": "QF1"
    }
  ]
}
```

### Get Single Match State
```http
GET /api/live/matches/:fixtureId
```

**Response**
```json
{
  "fixtureId": 1,
  "state": "SECOND_HALF",
  "minute": 67,
  "score": { "home": 1, "away": 1 },
  "penaltyScore": null,
  "homeTeam": { "id": 1, "name": "Manchester United" },
  "awayTeam": { "id": 2, "name": "Liverpool" },
  "stats": {
    "possession": { "home": 55, "away": 45 },
    "shots": { "home": 8, "away": 6 },
    "shotsOnTarget": { "home": 4, "away": 3 }
  },
  "events": [
    { "minute": 23, "type": "goal", "team": "home", "player": "Player Name" }
  ]
}
```

### Get Live Fixtures
```http
GET /api/live/fixtures
```

Returns all fixtures for current tournament with bracket information.

### Server-Sent Events Stream
```http
GET /api/live/events
```

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| tournamentId | number | Filter events by tournament |
| fixtureId | number | Filter events by fixture |
| afterSeq | number | Get events after this sequence number |

**Event Types**
```
event: match_event
data: {"type":"goal","fixtureId":1,"minute":23,"team":"home",...}

event: tournament_event
data: {"type":"round_start","round":"Quarter-finals",...}

event: heartbeat
data: {"timestamp":1704067200000}
```

### Get Recent Events
```http
GET /api/live/events/recent
```

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| fixtureId | number | Filter by fixture |
| type | string | Filter by event type |
| limit | number | Max events (default: 50) |

---

## JCup (Legacy)

### Initialize Tournament
```http
GET /api/jcup/init
```

### Play Round
```http
GET /api/jcup/play
```

### End Tournament
```http
POST /api/jcup/end
```

---

## Admin (Development Only)

All admin routes require `NODE_ENV !== 'production'`.

### Simulation Controls

```http
POST /api/admin/simulation/start
POST /api/admin/simulation/stop
```

### Tournament Controls

```http
POST /api/admin/tournament/start     # Force start tournament
POST /api/admin/tournament/cancel    # Cancel current tournament
POST /api/admin/tournament/skip-to-round
```

**Skip to Round Body**
```json
{
  "round": "QUARTER_FINALS"  // or SEMI_FINALS, FINAL
}
```

### Match Controls

```http
POST /api/admin/match/:fixtureId/force-score
POST /api/admin/match/:fixtureId/force-end
```

**Force Score Body**
```json
{
  "homeScore": 2,
  "awayScore": 1
}
```

### Clock Controls

```http
POST /api/admin/clock/pause
POST /api/admin/clock/resume
POST /api/admin/clock/set-speed
```

**Set Speed Body**
```json
{
  "speed": 10  // 1-100, multiplier for simulation speed
}
```

### Debug

```http
GET /api/admin/state           # Get full simulation state
POST /api/admin/events/clear   # Clear event history
```

---

## Diagnostic

### Get Database Status
```http
GET /api/diagnostic
```

**Response**
```json
{
  "status": "ok",
  "database": "connected",
  "teamCount": 16,
  "playerCount": 80
}
```

### Seed Database
```http
POST /api/diagnostic/seed
```

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "error": "Error message description"
}
```

**HTTP Status Codes**
| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad Request - Invalid parameters |
| 404 | Not Found - Resource doesn't exist |
| 500 | Internal Server Error |

---

## Event Types Reference

Events generated during match simulation:

| Event Type | Description |
|------------|-------------|
| `kickoff` | Match started |
| `goal` | Goal scored |
| `own_goal` | Own goal |
| `shot_saved` | Shot saved by goalkeeper |
| `shot_missed` | Shot missed target |
| `shot_blocked` | Shot blocked by defender |
| `penalty_awarded` | Penalty kick awarded |
| `penalty_scored` | Penalty converted |
| `penalty_missed` | Penalty missed |
| `penalty_saved` | Penalty saved |
| `corner` | Corner kick awarded |
| `foul` | Foul committed |
| `yellow_card` | Yellow card shown |
| `red_card` | Red card shown |
| `substitution` | Player substituted |
| `halftime` | First half ended |
| `fulltime` | Match ended (or to extra time) |
| `extra_time_start` | Extra time started |
| `extra_time_half` | First half of extra time ended |
| `extra_time_end` | Extra time ended |
| `shootout_start` | Penalty shootout started |
| `shootout_goal` | Shootout penalty scored |
| `shootout_miss` | Shootout penalty missed |
| `shootout_save` | Shootout penalty saved |
| `shootout_end` | Penalty shootout ended |

---

## Tournament Schedule

Tournaments run every hour on a fixed schedule:

| Time | Phase |
|------|-------|
| :55-:00 | Setup (team shuffle, bracket generation) |
| :00-:09 | Round of 16 (8 matches) |
| :09-:15 | Break |
| :15-:24 | Quarter Finals (4 matches) |
| :24-:30 | Break |
| :30-:39 | Semi Finals (2 matches) |
| :39-:45 | Break |
| :45-:54 | Final (1 match) |
| :54-:55 | Results |

Match duration: ~9 minutes real-time (90 game minutes + extra time/penalties if needed)
