# FootFive Live Simulation - Frontend Integration Guide

## Base URL
```
Production: http://77.68.4.18:9001/api/live
Development: http://localhost:9001/api/live
```

## Overview

The live simulation runs continuously with hourly tournaments:
- **:55** - Tournament setup (teams shuffled)
- **:00** - Round of 16 (8 matches)
- **:15** - Quarter-finals (4 matches)
- **:30** - Semi-finals (2 matches)
- **:45** - Final (1 match)

Each match lasts ~9 minutes (4min half + 1min halftime + 4min half). Draws go to extra time + penalties.

---

## REST Endpoints

### GET /status
Full system status including simulation state and tournament info.

**Response:**
```json
{
  "simulation": {
    "isRunning": true,
    "isPaused": false,
    "tickCount": 1234,
    "speedMultiplier": 1,
    "activeMatches": 8
  },
  "eventBus": {
    "eventsEmitted": 456,
    "eventsPersisted": 456,
    "clientsConnected": 2,
    "bufferSize": 456,
    "currentSequence": 456
  },
  "tournament": {
    "state": "ROUND_OF_16",
    "tournamentId": 123456789,
    "currentRound": "Round of 16",
    "teamsRemaining": 16,
    "activeMatches": 8,
    "winner": null,
    "runnerUp": null
  }
}
```

---

### GET /tournament
Current tournament state snapshot.

**Response:**
```json
{
  "state": "QUARTER_FINALS",
  "tournamentId": 123456789,
  "currentRound": "Quarter-finals",
  "teamsRemaining": 8,
  "activeMatches": 4,
  "winner": null,
  "runnerUp": null
}
```

**Tournament States:**
- `IDLE` - No tournament running
- `SETUP` - Preparing next tournament
- `ROUND_OF_16` - R16 matches in progress
- `QF_BREAK` - Break before quarter-finals
- `QUARTER_FINALS` - QF matches in progress
- `SF_BREAK` - Break before semi-finals
- `SEMI_FINALS` - SF matches in progress
- `FINAL_BREAK` - Break before final
- `FINAL` - Final match in progress
- `RESULTS` - Tournament complete, showing results
- `COMPLETE` - Tournament finished

---

### GET /matches
All currently active matches.

**Response:**
```json
{
  "matches": [
    {
      "fixtureId": 123,
      "state": "FIRST_HALF",
      "minute": 23,
      "score": { "home": 1, "away": 0 },
      "penaltyScore": { "home": 0, "away": 0 },
      "homeTeam": { "id": 1, "name": "Metro City" },
      "awayTeam": { "id": 2, "name": "Port Hilo" },
      "isFinished": false
    }
  ],
  "count": 8
}
```

**Match States:**
- `SCHEDULED` - Not started
- `FIRST_HALF` - First half (0-45 min)
- `HALFTIME` - Halftime break
- `SECOND_HALF` - Second half (45-90 min)
- `EXTRA_TIME_1` - Extra time first half
- `ET_HALFTIME` - Extra time break
- `EXTRA_TIME_2` - Extra time second half
- `PENALTIES` - Penalty shootout
- `FINISHED` - Match complete

---

### GET /matches/:fixtureId
Single match detail with stats.

**Response:**
```json
{
  "fixtureId": 123,
  "state": "SECOND_HALF",
  "minute": 67,
  "score": { "home": 2, "away": 1 },
  "penaltyScore": { "home": 0, "away": 0 },
  "homeTeam": { "id": 1, "name": "Metro City" },
  "awayTeam": { "id": 2, "name": "Port Hilo" },
  "isFinished": false,
  "tickElapsed": 402,
  "stats": {
    "home": { "shots": 8, "shotsOnTarget": 4, "corners": 3, "fouls": 5, "xg": 1.45 },
    "away": { "shots": 5, "shotsOnTarget": 2, "corners": 1, "fouls": 7, "xg": 0.82 }
  }
}
```

---

### GET /events/recent
Recent events from memory buffer (last 1000 events).

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `fixtureId` | int | Filter by match |
| `tournamentId` | int | Filter by tournament |
| `type` | string | Filter by event type (e.g., `goal`) |
| `afterSeq` | int | Only events after this sequence number |
| `limit` | int | Max events to return (default: 100) |

**Response:**
```json
{
  "events": [
    {
      "seq": 456,
      "type": "goal",
      "fixtureId": 123,
      "minute": 23,
      "timestamp": 1703789012345,
      "score": { "home": 1, "away": 0 },
      "homeTeam": { "id": 1, "name": "Metro City" },
      "awayTeam": { "id": 2, "name": "Port Hilo" },
      "teamId": 1,
      "playerId": 45,
      "displayName": "J. Smith",
      "assistPlayerId": 32,
      "assistName": "M. Jones"
    }
  ],
  "count": 1
}
```

---

## SSE Stream (Real-time Events)

### GET /events
Server-Sent Events stream for real-time updates.

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `fixtureId` | int | Only events for this match |
| `tournamentId` | int | Only events for this tournament |
| `afterSeq` | int | Catchup: send missed events after this sequence |

**JavaScript Example:**
```javascript
// Connect to SSE stream
const eventSource = new EventSource('/api/live/events');

// Or with filters
const eventSource = new EventSource('/api/live/events?fixtureId=123');

// Handle events
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Event:', data.type, data);

  switch (data.type) {
    case 'goal':
      showGoalNotification(data);
      break;
    case 'halftime':
    case 'fulltime':
      updateMatchState(data);
      break;
    case 'match_start':
      addMatchToUI(data);
      break;
    case 'match_end':
      finalizeMatch(data);
      break;
  }
};

eventSource.onerror = (err) => {
  console.error('SSE error:', err);
  // Reconnect logic here
};

// Cleanup on unmount
eventSource.close();
```

**Reconnection with Catchup:**
```javascript
let lastSeq = 0;

function connect() {
  const url = lastSeq > 0
    ? `/api/live/events?afterSeq=${lastSeq}`
    : '/api/live/events';

  const es = new EventSource(url);

  es.onmessage = (event) => {
    const data = JSON.parse(event.data);
    lastSeq = data.seq; // Track sequence for reconnection
    handleEvent(data);
  };

  es.onerror = () => {
    es.close();
    setTimeout(connect, 3000); // Reconnect after 3s
  };
}
```

---

## Event Types

| Type | Description | Key Fields |
|------|-------------|------------|
| `match_start` | Match kicked off | `homeTeam`, `awayTeam` |
| `goal` | Goal scored | `displayName`, `teamId`, `assistName` |
| `halftime` | Half-time reached | `score` |
| `second_half_start` | Second half begins | - |
| `fulltime` | 90 mins complete | `score` |
| `penalty_scored` | Penalty converted | `displayName`, `teamId` |
| `penalty_missed` | Penalty missed | `displayName`, `teamId` |
| `penalty_saved` | Penalty saved | `displayName`, `teamId` |
| `extra_time_start` | Extra time begins | - |
| `shootout_start` | Shootout begins | - |
| `shootout_goal` | Shootout goal | `displayName`, `teamId` |
| `shootout_miss` | Shootout miss | `displayName`, `teamId` |
| `shootout_save` | Shootout save | `displayName`, `teamId` |
| `match_end` | Match finished | `score`, `penaltyScore` |
| `round_start` | Tournament round begins | `round`, `fixtures` |
| `round_complete` | Round finished | `round`, `winners` |
| `tournament_end` | Tournament complete | `winner`, `runnerUp` |

---

## Typical Frontend Flow

1. **On page load:** `GET /status` to check if simulation running
2. **If tournament active:** `GET /matches` to get current matches
3. **Connect SSE:** `GET /events` for real-time updates
4. **On reconnect:** Use `afterSeq` param to catch up on missed events
5. **Poll backup:** If SSE fails, poll `/matches` every 5-10 seconds

---

## Example: React Hook

```javascript
import { useState, useEffect } from 'react';

function useLiveMatches() {
  const [matches, setMatches] = useState([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // Initial fetch
    fetch('/api/live/matches')
      .then(res => res.json())
      .then(data => setMatches(data.matches));

    // SSE connection
    const es = new EventSource('/api/live/events');

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.onmessage = (event) => {
      const evt = JSON.parse(event.data);

      if (evt.type === 'goal' || evt.type === 'match_start' || evt.type === 'match_end') {
        // Refetch matches on key events
        fetch('/api/live/matches')
          .then(res => res.json())
          .then(data => setMatches(data.matches));
      }
    };

    return () => es.close();
  }, []);

  return { matches, connected };
}
```
