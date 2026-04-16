# Tournament Scheduling

## Overview

Tournaments are started manually via API and run with dynamic round progression. There are no wall-clock dependencies - rounds advance automatically when all matches complete, with configurable breaks between rounds.

## Starting a Tournament

### Endpoint

```
POST /api/admin/tournament/start
```

### Example

```bash
curl -X POST http://localhost:9001/api/admin/tournament/start
```

### Response

```json
{
  "success": true,
  "message": "Tournament started",
  "tournamentId": 123456789,
  "state": "ROUND_OF_16",
  "teamsCount": 16
}
```

### Error Response

```json
{
  "error": "Cannot start tournament: already in state ROUND_OF_16"
}
```

## Tournament Flow

```
Manual Start
     │
     ▼
┌─────────────┐
│   SETUP     │  Generate fixtures, shuffle teams
└─────────────┘
     │
     ▼
┌─────────────┐
│ ROUND OF 16 │  8 matches play simultaneously
└─────────────┘
     │ All matches complete
     ▼
┌─────────────┐
│  QF_BREAK   │  5 minute break
└─────────────┘
     │
     ▼
┌─────────────┐
│QUARTER-FINAL│  4 matches play simultaneously
└─────────────┘
     │ All matches complete
     ▼
┌─────────────┐
│  SF_BREAK   │  5 minute break
└─────────────┘
     │
     ▼
┌─────────────┐
│ SEMI-FINALS │  2 matches play simultaneously
└─────────────┘
     │ All matches complete
     ▼
┌─────────────┐
│ FINAL_BREAK │  5 minute break
└─────────────┘
     │
     ▼
┌─────────────┐
│   FINAL     │  1 match
└─────────────┘
     │ Match complete
     ▼
┌─────────────┐
│  RESULTS    │  Update championship stats
└─────────────┘
     │
     ▼
┌─────────────┐
│    IDLE     │  Waiting for next manual start
└─────────────┘
```

## Configuration

Break duration is configured in `Gamelogic/simulation/TournamentManager.js`:

```javascript
const SCHEDULE = {
  BREAK_DURATION_MS: 5 * 60 * 1000 // 5 minutes between rounds
};
```

## Match Timing

Each match runs in real-time with the following durations:

| Phase | Duration |
|-------|----------|
| First Half | 4 minutes |
| Halftime | 1 minute |
| Second Half | 4 minutes |
| **Regular Time Total** | **9 minutes** |
| Extra Time 1st Half | 2 minutes |
| ET Halftime | 30 seconds |
| Extra Time 2nd Half | 2 minutes |
| **With Extra Time** | **~13.5 minutes** |
| Penalties | ~1-2 minutes |
| **Worst Case** | **~15.5 minutes** |

Match timing is configured in `Gamelogic/simulation/LiveMatch.js`:

```javascript
const DEFAULT_RULES = {
  knockout: true,
  halfDurationMs: 240000,      // 4 min real = 45 match minutes
  halftimeDurationMs: 60000,   // 1 min real
  extraTimeEnabled: true,
  etHalfDurationMs: 120000,    // 2 min real = 15 match minutes
  etHalftimeMs: 30000,         // 30s real
  penaltiesEnabled: true
};
```

## Typical Tournament Duration

| Scenario | Duration |
|----------|----------|
| All normal time | ~40-45 minutes |
| Some overtime/penalties | ~50-60 minutes |
| Many overtime/penalties | ~70 minutes |

Plus 15 minutes of breaks (5 min × 3 breaks).

## API Endpoints

### Tournament Control

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/tournament/start` | Start a new tournament |
| POST | `/api/admin/tournament/manual-start` | Backward-compatible start alias |
| POST | `/api/admin/start-tournament` | Backward-compatible start alias |
| POST | `/api/admin/tournament/cancel` | Cancel current tournament |
| GET | `/api/admin/state` | Get current tournament state |

### Match Control

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/match/:fixtureId/force-end` | Force end a match |
| POST | `/api/admin/match/:fixtureId/force-score` | Set match score |

## State Transitions

### Valid States

- `IDLE` - No tournament running, waiting for manual start
- `SETUP` - Generating fixtures and shuffling teams
- `ROUND_OF_16` - Round of 16 matches in progress
- `QF_BREAK` - Break before Quarter-finals
- `QUARTER_FINALS` - Quarter-final matches in progress
- `SF_BREAK` - Break before Semi-finals
- `SEMI_FINALS` - Semi-final matches in progress
- `FINAL_BREAK` - Break before Final
- `FINAL` - Final match in progress
- `RESULTS` - Processing tournament results
- `COMPLETE` - Tournament finished (transitions to IDLE)

### Checking State

```bash
curl http://localhost:9001/api/admin/state
```

Response:
```json
{
  "loop": {
    "isRunning": true,
    "isPaused": false
  },
  "tournament": {
    "state": "QUARTER_FINALS",
    "tournamentId": 123456789,
    "currentRound": "Quarter-finals",
    "teamsRemaining": 4,
    "activeMatches": 4
  }
}
```

## Recovery

If the server restarts during a tournament:

1. The simulation loop attempts to recover the tournament state from the database
2. Active matches are recovered and resumed
3. The tournament continues from where it left off

If recovery fails or no active tournament is found, the state returns to `IDLE`.

## Previous Behavior (Deprecated)

Previously, tournaments used wall-clock scheduling:
- Tournaments auto-started at minute :55 of each hour
- Rounds had fixed time slots (R16 at :00, QF at :15, etc.)
- This caused issues when matches ran into overtime/penalties

The new dynamic scheduling eliminates these timing conflicts.
