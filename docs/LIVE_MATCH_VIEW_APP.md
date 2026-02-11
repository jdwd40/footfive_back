# Live Match View App - Integration Guide

This document provides all the information needed to build a separate live match viewing application (React + Vite) that consumes data from the FootFive API.

## Table of Contents

1. [System Overview](#system-overview)
2. [API Base URL](#api-base-url)
3. [Real-Time Events (SSE)](#real-time-events-sse)
4. [REST API Endpoints](#rest-api-endpoints)
5. [Event Types](#event-types)
6. [Match States](#match-states)
7. [Data Structures](#data-structures)
8. [Timing System](#timing-system)
9. [React Implementation Guide](#react-implementation-guide)

---

## System Overview

The FootFive backend simulates football matches in real-time using a tick-based engine. The simulation runs continuously with:

- **1 tick = 1 real-world second**
- **4 minutes real time = 45 match minutes** (first/second half)
- **1 minute real time = halftime break**
- **2 minutes real time = 15 match minutes** (extra time halves)

### Architecture

```
┌─────────────────────┐
│  SimulationLoop     │ ← Main orchestrator, ticks every second
├─────────────────────┤
│  TournamentManager  │ ← Manages tournament rounds and breaks
├─────────────────────┤
│  LiveMatch (x4)     │ ← Individual match simulation instances
├─────────────────────┤
│  EventBus           │ ← Event hub: broadcasts via SSE, persists to DB
└─────────────────────┘
           │
           ▼
    ┌──────────────┐
    │  SSE Stream  │ ──► React App (real-time)
    │  REST API    │ ──► React App (polling/snapshots)
    └──────────────┘
```

---

## API Base URL

```
Production:  https://jwd1.xyz/api
```

---

## Real-Time Events (SSE)

The primary method for receiving live match updates is Server-Sent Events (SSE).

### Endpoint

```
GET /api/live/events
```

### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `tournamentId` | number | Filter events by tournament ID |
| `fixtureId` | number | Filter events by fixture ID |
| `afterSeq` | number | Get events after this sequence number (for reconnection catchup) |

### Connection Example

```javascript
const eventSource = new EventSource('http://localhost:9001/api/live/events');

eventSource.onopen = () => {
  console.log('Connected to live events stream');
};

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Event received:', data);
};

eventSource.onerror = (error) => {
  console.error('SSE Error:', error);
  // EventSource will auto-reconnect
};

// Listen for specific event types
eventSource.addEventListener('goal', (event) => {
  const data = JSON.parse(event.data);
  console.log('GOAL!', data);
});

eventSource.addEventListener('yellow_card', (event) => {
  const data = JSON.parse(event.data);
  console.log('Yellow card:', data);
});
```

### Event Format

Each SSE event is sent with an event type and JSON data:

```
event: goal
data: {"type":"goal","fixtureId":1,"minute":23,"second":45,"teamId":1,"playerId":5,"assistPlayerId":8,"description":"Goal scored by Player Name. Assisted by Assister Name.","xg":0.45,"seq":42,"serverTimestamp":1704067200000}

event: yellow_card
data: {"type":"yellow_card","fixtureId":1,"minute":35,"second":12,"teamId":2,"playerId":10,"description":"Yellow card shown to Player Name","seq":43,"serverTimestamp":1704067201000}
```

### Reconnection with Catchup

When reconnecting after a disconnect, use `afterSeq` to get missed events:

```javascript
let lastSeq = 0;

function connect() {
  const url = lastSeq > 0
    ? `http://localhost:9001/api/live/events?afterSeq=${lastSeq}`
    : 'http://localhost:9001/api/live/events';

  const eventSource = new EventSource(url);

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    lastSeq = data.seq; // Track sequence for reconnection
    handleEvent(data);
  };
}
```

---

## REST API Endpoints

### Live Match Endpoints

#### Get System Status
```
GET /api/live/status
```

**Response:**
```json
{
  "simulation": {
    "isRunning": true,
    "isPaused": false,
    "tickCount": 12345,
    "speedMultiplier": 1,
    "activeMatches": 4
  },
  "eventBus": {
    "eventsEmitted": 1543,
    "eventsPersisted": 943,
    "clientsConnected": 5,
    "bufferSize": 100,
    "currentSequence": 1543
  },
  "tournament": {
    "tournamentId": 123456789,
    "currentRound": "Quarter-finals",
    "teamsRemaining": 4,
    "activeMatches": 4,
    "winner": null,
    "runnerUp": null
  }
}
```

#### Get Current Tournament State
```
GET /api/live/tournament
```

**Response:**
```json
{
  "tournamentId": 123456789,
  "currentRound": "Quarter-finals",
  "teamsRemaining": 4,
  "activeMatches": 4,
  "state": "QUARTER_FINALS",
  "winner": null,
  "runnerUp": null
}
```

#### Get All Active Matches
```
GET /api/live/matches
```

**Response:**
```json
{
  "matches": [
    {
      "fixtureId": 1,
      "state": "SECOND_HALF",
      "minute": 67,
      "score": { "home": 1, "away": 1 },
      "penaltyScore": null,
      "homeTeam": { "id": 1, "name": "Manchester United" },
      "awayTeam": { "id": 2, "name": "Liverpool" },
      "isFinished": false,
      "tickElapsed": 450,
      "stats": {
        "possession": { "home": 55, "away": 45 },
        "shots": { "home": 8, "away": 6 },
        "shotsOnTarget": { "home": 4, "away": 3 },
        "corners": { "home": 3, "away": 2 },
        "fouls": { "home": 10, "away": 12 }
      }
    }
  ],
  "count": 4
}
```

#### Get Single Match State
```
GET /api/live/matches/:fixtureId
```

**Response:** Same structure as individual match in array above.

#### Get All Tournament Fixtures (with bracket info)
```
GET /api/live/fixtures
```

**Response:**
```json
{
  "tournamentId": 123456789,
  "currentRound": "Quarter-finals",
  "nextRound": "Semi-finals",
  "fixtures": [
    {
      "fixtureId": 1,
      "round": "Quarter-finals",
      "bracketSlot": "QF1",
      "feedsInto": "SF1",
      "homeTeam": { "id": 1, "name": "Manchester United" },
      "awayTeam": { "id": 2, "name": "Liverpool" },
      "state": "SECOND_HALF",
      "isFinished": false,
      "minute": 67,
      "score": { "home": 1, "away": 1 },
      "penaltyScore": { "home": 0, "away": 0 },
      "winnerId": null
    }
  ],
  "upcomingFixtures": [
    {
      "fixtureId": 5,
      "round": "Semi-finals",
      "bracketSlot": "SF1",
      "state": "SCHEDULED",
      "minute": 0,
      "score": { "home": 0, "away": 0 }
    }
  ]
}
```

### Match Events Endpoints

#### Get Recent Events (Polling Alternative)
```
GET /api/live/events/recent
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `fixtureId` | number | Filter by fixture |
| `tournamentId` | number | Filter by tournament |
| `type` | string | Filter by event type (e.g., `goal`) |
| `afterSeq` | number | Get events after this sequence |
| `limit` | number | Max events (default: 100) |

**Response:**
```json
{
  "events": [
    {
      "eventId": 42,
      "fixtureId": 1,
      "minute": 23,
      "second": 45,
      "addedTime": null,
      "displayTime": "23'",
      "type": "goal",
      "team": "Manchester United",
      "player": "Player Name",
      "assist": "Assister Name",
      "description": "Goal scored by Player Name. Assisted by Assister Name.",
      "xg": 0.45,
      "outcome": "scored",
      "metadata": {
        "displayName": "Player Name",
        "assistName": "Assister Name",
        "score": { "home": 1, "away": 0 },
        "seq": 42
      }
    }
  ],
  "count": 1
}
```

#### Get All Events for a Fixture
```
GET /api/fixtures/:id/events
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string | Filter by event type |
| `afterEventId` | number | Get events after this ID |

#### Get Match Goals Only
```
GET /api/fixtures/:id/goals
```

#### Get Match Report (Final Statistics)
```
GET /api/fixtures/:id/report
```

**Response:**
```json
{
  "fixture": {
    "homeScore": 2,
    "awayScore": 1,
    "homePenaltyScore": null,
    "awayPenaltyScore": null,
    "homeTeamName": "Manchester United",
    "awayTeamName": "Liverpool",
    "round": "Quarter-finals",
    "completedAt": "2024-01-02T15:30:00Z"
  },
  "report": {
    "fixtureId": 1,
    "possession": { "home": 55, "away": 45 },
    "shots": { "home": 12, "away": 8 },
    "shotsOnTarget": { "home": 5, "away": 3 },
    "xG": { "home": 1.85, "away": 0.95 },
    "corners": { "home": 6, "away": 3 },
    "fouls": { "home": 10, "away": 12 },
    "yellowCards": { "home": 2, "away": 1 },
    "redCards": { "home": 0, "away": 0 },
    "extraTimePlayed": false,
    "penaltiesPlayed": false
  }
}
```

### Fixture Endpoints

#### Get All Fixtures
```
GET /api/fixtures
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | `scheduled`, `live`, `completed` |
| `teamId` | number | Filter by team |
| `tournamentId` | number | Filter by tournament |
| `round` | string | Filter by round name |
| `limit` | number | Max results (default: 100) |

#### Get Single Fixture
```
GET /api/fixtures/:id
```

---

## Event Types

### Match Flow Events

| Event Type | Description |
|------------|-------------|
| `match_start` | Match begins |
| `kickoff` | Kickoff after anthems |
| `halftime` | First half ended |
| `second_half_start` | Second half started |
| `fulltime` | 90 minutes ended |
| `extra_time_start` | Extra time began |
| `extra_time_half` | ET first half ended |
| `extra_time_end` | ET ended |
| `shootout_start` | Penalty shootout started |
| `shootout_end` | Shootout ended |
| `match_end` | Match fully completed |

### Action Events

| Event Type | Description |
|------------|-------------|
| `goal` | Goal scored in regular play |
| `own_goal` | Own goal |
| `shot_saved` | Shot saved by goalkeeper |
| `shot_missed` | Shot missed (off target) |
| `shot_blocked` | Shot blocked by defender |
| `penalty_awarded` | Penalty kick awarded |
| `penalty_scored` | Penalty converted |
| `penalty_missed` | Penalty missed |
| `penalty_saved` | Penalty saved by goalkeeper |
| `corner` | Corner kick awarded |
| `foul` | Foul committed |
| `yellow_card` | Yellow card shown |
| `red_card` | Red card shown |

### Shootout Events

| Event Type | Description |
|------------|-------------|
| `shootout_goal` | Shootout penalty scored |
| `shootout_miss` | Shootout penalty missed |
| `shootout_save` | Shootout penalty saved |

---

## Match States

```
SCHEDULED       → Match not yet started
FIRST_HALF      → Minutes 1-45
HALFTIME        → Half-time break (1 min real time)
SECOND_HALF     → Minutes 46-90
EXTRA_TIME_1    → Minutes 91-105 (if tied)
ET_HALFTIME     → Extra time break
EXTRA_TIME_2    → Minutes 106-120
PENALTIES       → Penalty shootout
FINISHED        → Match completed
```

### State Transitions

```
SCHEDULED → FIRST_HALF → HALFTIME → SECOND_HALF → FINISHED (if winner)
                                                → EXTRA_TIME_1 (if tied)

EXTRA_TIME_1 → ET_HALFTIME → EXTRA_TIME_2 → FINISHED (if winner)
                                          → PENALTIES (if still tied)

PENALTIES → FINISHED
```

---

## Data Structures

### Event Object

```typescript
interface MatchEvent {
  type: string;           // Event type (see Event Types)
  fixtureId: number;      // Fixture ID
  minute: number;         // Match minute (1-120)
  second: number;         // Second within minute (0-59)
  addedTime?: number;     // Injury time minutes
  displayTime: string;    // Formatted time (e.g., "45+2'")
  teamId?: number;        // Team ID (for team-specific events)
  playerId?: number;      // Player ID
  assistPlayerId?: number; // Assist player ID (for goals)
  description: string;    // Human-readable description
  xg?: number;            // Expected goals value (0-1)
  outcome?: string;       // Event outcome (scored/saved/missed)
  seq: number;            // Sequence number for ordering
  serverTimestamp: number; // Server timestamp (ms)
  bundleId?: string;      // Groups related events
  bundleStep?: number;    // Order within bundle
  metadata?: {
    displayName?: string;
    assistName?: string;
    score?: { home: number; away: number };
  };
}
```

### Match State Object

```typescript
interface LiveMatch {
  fixtureId: number;
  state: MatchState;
  minute: number;
  score: {
    home: number;
    away: number;
  };
  penaltyScore?: {
    home: number;
    away: number;
  };
  homeTeam: {
    id: number;
    name: string;
  };
  awayTeam: {
    id: number;
    name: string;
  };
  isFinished: boolean;
  tickElapsed: number;
  stats: {
    possession: { home: number; away: number };
    shots: { home: number; away: number };
    shotsOnTarget: { home: number; away: number };
    xg?: { home: number; away: number };
    corners: { home: number; away: number };
    fouls: { home: number; away: number };
    yellowCards?: { home: number; away: number };
    redCards?: { home: number; away: number };
  };
}
```

### Tournament Bracket Slot

```typescript
interface BracketSlot {
  slot: string;         // e.g., "QF1", "SF1", "FINAL"
  round: string;        // e.g., "Quarter-finals"
  feedsInto?: string;   // Next round slot (e.g., "SF1")
  homeTeam?: Team;      // null if TBD
  awayTeam?: Team;      // null if TBD
  fixtureId?: number;
}
```

---

## Timing System

### Real-Time to Match-Time Mapping

| Real Time | Match Period | Match Minutes |
|-----------|--------------|---------------|
| 0-240 sec (4 min) | First Half | 1-45 |
| 240-300 sec (1 min) | Halftime | 45 (paused) |
| 300-540 sec (4 min) | Second Half | 46-90 |
| 540-660 sec (2 min) | Extra Time 1 | 91-105 |
| 660-690 sec (30 sec) | ET Halftime | 105 (paused) |
| 690-810 sec (2 min) | Extra Time 2 | 106-120 |
| 810+ sec | Penalties | 120 (paused) |

### Calculating Match Minute from Ticks

```javascript
function getMatchMinute(tickElapsed, state) {
  const HALF_DURATION_TICKS = 240;    // 4 minutes
  const HALFTIME_DURATION = 60;        // 1 minute
  const ET_HALF_DURATION_TICKS = 120;  // 2 minutes

  switch (state) {
    case 'FIRST_HALF':
      return Math.ceil((tickElapsed / HALF_DURATION_TICKS) * 45);

    case 'HALFTIME':
      return 45;

    case 'SECOND_HALF': {
      const secondHalfTicks = tickElapsed - HALF_DURATION_TICKS - HALFTIME_DURATION;
      return 45 + Math.ceil((secondHalfTicks / HALF_DURATION_TICKS) * 45);
    }

    case 'EXTRA_TIME_1': {
      const etTicks = tickElapsed - 540;
      return 90 + Math.ceil((etTicks / ET_HALF_DURATION_TICKS) * 15);
    }

    case 'ET_HALFTIME':
      return 105;

    case 'EXTRA_TIME_2': {
      const et2Ticks = tickElapsed - 690;
      return 105 + Math.ceil((et2Ticks / ET_HALF_DURATION_TICKS) * 15);
    }

    case 'PENALTIES':
    case 'FINISHED':
      return 120;

    default:
      return 0;
  }
}
```

---

## React Implementation Guide

### Recommended Project Structure

```
src/
├── api/
│   ├── client.ts           # Axios/fetch client
│   ├── liveApi.ts          # Live match API calls
│   └── eventSource.ts      # SSE connection manager
├── hooks/
│   ├── useLiveEvents.ts    # SSE subscription hook
│   ├── useLiveMatches.ts   # Live matches polling hook
│   └── useMatchState.ts    # Single match state hook
├── components/
│   ├── MatchCard/          # Single match display
│   ├── ScoreBoard/         # Score display
│   ├── EventFeed/          # Live events list
│   ├── MatchStats/         # Stats visualization
│   ├── TournamentBracket/  # Bracket display
│   └── MatchClock/         # Live clock display
├── store/
│   └── matchStore.ts       # Zustand/Redux store
└── types/
    └── match.ts            # TypeScript interfaces
```

### SSE Hook Example

```typescript
// hooks/useLiveEvents.ts
import { useEffect, useCallback, useRef } from 'react';
import { useMatchStore } from '../store/matchStore';

interface UseLiveEventsOptions {
  fixtureId?: number;
  tournamentId?: number;
}

export function useLiveEvents(options: UseLiveEventsOptions = {}) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const lastSeqRef = useRef<number>(0);
  const { addEvent, updateMatchState } = useMatchStore();

  const connect = useCallback(() => {
    const params = new URLSearchParams();
    if (options.fixtureId) params.set('fixtureId', String(options.fixtureId));
    if (options.tournamentId) params.set('tournamentId', String(options.tournamentId));
    if (lastSeqRef.current > 0) params.set('afterSeq', String(lastSeqRef.current));

    const url = `${API_BASE}/api/live/events?${params}`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (e) => {
      const event = JSON.parse(e.data);
      lastSeqRef.current = event.seq;
      addEvent(event);
    };

    // Listen for specific event types
    const eventTypes = ['goal', 'yellow_card', 'red_card', 'halftime', 'fulltime', 'match_end'];
    eventTypes.forEach(type => {
      eventSource.addEventListener(type, (e) => {
        const event = JSON.parse((e as MessageEvent).data);
        lastSeqRef.current = event.seq;
        addEvent(event);
      });
    });

    eventSource.onerror = () => {
      eventSource.close();
      // Reconnect after 3 seconds
      setTimeout(connect, 3000);
    };
  }, [options.fixtureId, options.tournamentId, addEvent]);

  useEffect(() => {
    connect();
    return () => {
      eventSourceRef.current?.close();
    };
  }, [connect]);
}
```

### Zustand Store Example

```typescript
// store/matchStore.ts
import { create } from 'zustand';
import type { MatchEvent, LiveMatch } from '../types/match';

interface MatchStore {
  matches: Record<number, LiveMatch>;
  events: MatchEvent[];

  addEvent: (event: MatchEvent) => void;
  setMatches: (matches: LiveMatch[]) => void;
  updateMatch: (fixtureId: number, update: Partial<LiveMatch>) => void;
}

export const useMatchStore = create<MatchStore>((set) => ({
  matches: {},
  events: [],

  addEvent: (event) => set((state) => {
    // Update match state based on event
    const matchUpdate: Partial<LiveMatch> = {};

    if (event.type === 'goal') {
      const isHome = event.teamId === state.matches[event.fixtureId]?.homeTeam.id;
      // Score update would come from the event metadata
    }

    return {
      events: [...state.events.slice(-99), event], // Keep last 100 events
      matches: event.fixtureId ? {
        ...state.matches,
        [event.fixtureId]: {
          ...state.matches[event.fixtureId],
          ...matchUpdate,
        }
      } : state.matches,
    };
  }),

  setMatches: (matches) => set({
    matches: matches.reduce((acc, m) => ({ ...acc, [m.fixtureId]: m }), {}),
  }),

  updateMatch: (fixtureId, update) => set((state) => ({
    matches: {
      ...state.matches,
      [fixtureId]: { ...state.matches[fixtureId], ...update },
    },
  })),
}));
```

### Match Card Component Example

```tsx
// components/MatchCard/MatchCard.tsx
import { useLiveEvents } from '../../hooks/useLiveEvents';
import { useMatchStore } from '../../store/matchStore';

interface MatchCardProps {
  fixtureId: number;
}

export function MatchCard({ fixtureId }: MatchCardProps) {
  useLiveEvents({ fixtureId });
  const match = useMatchStore((s) => s.matches[fixtureId]);

  if (!match) return <div>Loading...</div>;

  return (
    <div className="match-card">
      <div className="match-status">
        <span className={`state ${match.state.toLowerCase()}`}>
          {formatState(match.state)}
        </span>
        <span className="minute">{match.minute}'</span>
      </div>

      <div className="teams">
        <div className="team home">
          <span className="name">{match.homeTeam.name}</span>
          <span className="score">{match.score.home}</span>
        </div>
        <div className="team away">
          <span className="score">{match.score.away}</span>
          <span className="name">{match.awayTeam.name}</span>
        </div>
      </div>

      {match.penaltyScore && (
        <div className="penalties">
          ({match.penaltyScore.home} - {match.penaltyScore.away})
        </div>
      )}

      <div className="stats">
        <StatBar label="Possession" home={match.stats.possession.home} away={match.stats.possession.away} />
        <StatBar label="Shots" home={match.stats.shots.home} away={match.stats.shots.away} />
      </div>
    </div>
  );
}

function formatState(state: string): string {
  const stateLabels: Record<string, string> = {
    SCHEDULED: 'Scheduled',
    FIRST_HALF: '1st Half',
    HALFTIME: 'Half Time',
    SECOND_HALF: '2nd Half',
    EXTRA_TIME_1: 'Extra Time',
    ET_HALFTIME: 'ET Break',
    EXTRA_TIME_2: 'Extra Time',
    PENALTIES: 'Penalties',
    FINISHED: 'Full Time',
  };
  return stateLabels[state] || state;
}
```

### Event Feed Component Example

```tsx
// components/EventFeed/EventFeed.tsx
import { useMatchStore } from '../../store/matchStore';

interface EventFeedProps {
  fixtureId?: number;
}

export function EventFeed({ fixtureId }: EventFeedProps) {
  const events = useMatchStore((s) =>
    fixtureId
      ? s.events.filter(e => e.fixtureId === fixtureId)
      : s.events
  );

  return (
    <div className="event-feed">
      {events.slice().reverse().map((event) => (
        <EventItem key={event.seq} event={event} />
      ))}
    </div>
  );
}

function EventItem({ event }: { event: MatchEvent }) {
  const icon = getEventIcon(event.type);

  return (
    <div className={`event-item ${event.type}`}>
      <span className="time">{event.displayTime || `${event.minute}'`}</span>
      <span className="icon">{icon}</span>
      <span className="description">{event.description}</span>
    </div>
  );
}

function getEventIcon(type: string): string {
  const icons: Record<string, string> = {
    goal: '⚽',
    penalty_scored: '⚽',
    shootout_goal: '⚽',
    shot_saved: '🧤',
    shot_missed: '❌',
    yellow_card: '🟨',
    red_card: '🟥',
    foul: '⚠️',
    corner: '📐',
    halftime: '⏸️',
    fulltime: '🏁',
    match_end: '🏆',
  };
  return icons[type] || '📋';
}
```

### Polling Fallback (for environments without SSE)

```typescript
// hooks/useLiveMatchesPolling.ts
import { useEffect } from 'react';
import { useMatchStore } from '../store/matchStore';

export function useLiveMatchesPolling(intervalMs = 3000) {
  const setMatches = useMatchStore((s) => s.setMatches);

  useEffect(() => {
    let mounted = true;

    async function poll() {
      try {
        const res = await fetch(`${API_BASE}/api/live/matches`);
        const data = await res.json();
        if (mounted) {
          setMatches(data.matches);
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }

    poll(); // Initial fetch
    const interval = setInterval(poll, intervalMs);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [intervalMs, setMatches]);
}
```

---

## Tips for Building the App

1. **Use SSE for real-time updates** - It's the most efficient way to get live events
2. **Implement reconnection logic** - Network issues happen; use `afterSeq` for catchup
3. **Poll `/api/live/matches` periodically** - As a backup and to get full match state
4. **Cache team/player data** - These don't change during matches
5. **Handle all match states** - Including extra time and penalties
6. **Show loading states** - Matches may not exist yet (scheduled tournaments)
7. **Consider mobile** - Touch-friendly UI for mobile viewing

---

## Quick Start

```bash
# Create React + Vite project
npm create vite@latest live-match-viewer -- --template react-ts
cd live-match-viewer

# Install dependencies
npm install zustand axios

# Start development
npm run dev
```

Point your API calls to `http://localhost:9001/api` during development, or configure CORS on the backend if needed.
