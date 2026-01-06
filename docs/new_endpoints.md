# New API Endpoints

## Fixtures API

### Create & Manage Fixtures

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/fixtures` | Create single fixture + calculate odds |
| POST | `/api/fixtures/batch` | Create multiple fixtures |
| GET | `/api/fixtures` | List fixtures (with filters) |
| GET | `/api/fixtures/:id` | Get fixture with odds |
| DELETE | `/api/fixtures/:id` | Delete fixture |

### Query Parameters for GET /api/fixtures

| Param | Type | Description |
|-------|------|-------------|
| status | string | Filter by: scheduled, live, completed |
| teamId | int | Filter by team (home or away) |
| tournamentId | int | Filter by tournament |
| round | string | Filter by round name |
| limit | int | Max results (default 100) |

### Odds

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/fixtures/:id/odds` | Get betting odds |
| POST | `/api/fixtures/:id/odds/calculate` | Recalculate odds |

### Simulation

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/fixtures/:id/simulate` | Run full match simulation |

### Match Data (after simulation)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/fixtures/:id/report` | Get match stats report |
| GET | `/api/fixtures/:id/events` | Get all match events |
| GET | `/api/fixtures/:id/goals` | Get goals only |

### Query Parameters for GET /api/fixtures/:id/events

| Param | Type | Description |
|-------|------|-------------|
| type | string | Filter by event type (goal, shot_saved, etc) |
| afterEventId | int | Get events after ID (for live streaming) |

---

## Example Requests

### Create Fixture
```bash
curl -X POST http://localhost:9001/api/fixtures \
  -H "Content-Type: application/json" \
  -d '{"homeTeamId": 1, "awayTeamId": 2, "round": "Quarter-final"}'
```

### Response
```json
{
  "message": "Fixture created",
  "fixture": {
    "fixtureId": 1,
    "homeTeam": { "id": 1, "name": "Metro City" },
    "awayTeam": { "id": 2, "name": "Mega City One" },
    "round": "Quarter-final",
    "status": "scheduled"
  },
  "odds": {
    "fixtureId": 1,
    "probabilities": { "homeWin": 0.5533, "awayWin": 0.4467 },
    "odds": { "homeWin": 1.72, "awayWin": 2.13 },
    "margin": 0.05
  }
}
```

### Batch Create Fixtures
```bash
curl -X POST http://localhost:9001/api/fixtures/batch \
  -H "Content-Type: application/json" \
  -d '{
    "fixtures": [
      { "homeTeamId": 1, "awayTeamId": 2, "round": "Round 1" },
      { "homeTeamId": 3, "awayTeamId": 4, "round": "Round 1" }
    ]
  }'
```

### Get Fixture with Odds
```bash
curl http://localhost:9001/api/fixtures/1
```

### Get Match Events (for live streaming)
```bash
# Get all events
curl http://localhost:9001/api/fixtures/1/events

# Get events after a certain point (polling)
curl http://localhost:9001/api/fixtures/1/events?afterEventId=50

# Get only goals
curl http://localhost:9001/api/fixtures/1/goals
```

---

## Event Types

| Type | Description |
|------|-------------|
| kickoff | Match/half start |
| goal | Goal scored |
| own_goal | Own goal |
| shot_saved | Shot on target, saved |
| shot_missed | Shot off target |
| shot_blocked | Shot blocked by defender |
| penalty_awarded | Penalty given |
| penalty_scored | Penalty converted |
| penalty_missed | Penalty missed |
| penalty_saved | Penalty saved |
| corner | Corner kick |
| foul | Foul committed |
| yellow_card | Yellow card shown |
| red_card | Red card shown |
| halftime | Half time |
| fulltime | Full time |
| extra_time_start | Extra time begins |
| shootout_start | Penalty shootout begins |
| shootout_goal | Shootout penalty scored |
| shootout_miss | Shootout penalty missed |
| shootout_save | Shootout penalty saved |
