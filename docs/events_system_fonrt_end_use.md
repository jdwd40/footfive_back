# Live Events System - Frontend Integration Guide

This document explains how frontend applications can consume live match events from the FootFive backend.

## Overview

The backend provides two methods for receiving live events:
1. **Server-Sent Events (SSE)** - Real-time streaming (recommended)
2. **REST API** - Polling/snapshots

## Event Categories

Events are grouped into categories for easy filtering:

| Category | Event Types | Use Case |
|----------|-------------|----------|
| `highlights` | `goal`, `penalty_scored`, `extra_time_start`, `extra_time_half`, `extra_time_end`, `shootout_start`, `shootout_goal`, `shootout_miss`, `shootout_save`, `shootout_end`, `fulltime`, `match_end` | Live ticker, score updates |
| `goals` | `goal`, `penalty_scored`, `shootout_goal` | Goal notifications only |
| `shootout` | `shootout_start`, `shootout_goal`, `shootout_miss`, `shootout_save`, `shootout_end` | Penalty shootout tracking |
| `cards` | `yellow_card`, `red_card` | Disciplinary events |
| `flow` | `match_start`, `halftime`, `second_half_start`, `fulltime`, `extra_time_start`, `extra_time_half`, `extra_time_end`, `match_end` | Match state changes |

## SSE Streaming (Real-time)

### Endpoint
```
GET /api/live/events
```

### Query Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| `tournamentId` | number | Filter events by tournament |
| `fixtureId` | number | Filter events by specific match |
| `category` | string | Filter by category: `highlights`, `goals`, `shootout`, `cards`, `flow` |
| `afterSeq` | number | Reconnection catchup - receive events after this sequence number |

### JavaScript Example

```javascript
// Connect to highlights only
const eventSource = new EventSource('/api/live/events?category=highlights');

// Handle connection
eventSource.addEventListener('connected', (e) => {
  const data = JSON.parse(e.data);
  console.log('Connected with client ID:', data.clientId);
  // Store data.seq for reconnection
  localStorage.setItem('lastSeq', data.seq);
});

// Handle goals
eventSource.addEventListener('goal', (e) => {
  const goal = JSON.parse(e.data);
  console.log(`GOAL! ${goal.displayName} scores for ${goal.teamId}`);
  console.log(`Score: ${goal.score.home} - ${goal.score.away}`);
});

// Handle shootout events
eventSource.addEventListener('shootout_goal', (e) => {
  const data = JSON.parse(e.data);
  console.log(`Shootout goal by ${data.displayName}`);
});

eventSource.addEventListener('shootout_miss', (e) => {
  const data = JSON.parse(e.data);
  console.log(`Shootout miss by ${data.displayName}`);
});

// Handle match end (final score)
eventSource.addEventListener('match_end', (e) => {
  const data = JSON.parse(e.data);
  console.log(`Final: ${data.score.home} - ${data.score.away}`);
  if (data.penaltyScore) {
    console.log(`Penalties: ${data.penaltyScore.home} - ${data.penaltyScore.away}`);
  }
});

// Handle errors
eventSource.onerror = (e) => {
  console.error('SSE connection error');
  eventSource.close();
  // Reconnect with lastSeq for catchup
  const lastSeq = localStorage.getItem('lastSeq');
  reconnect(lastSeq);
};
```

### Reconnection with Catchup

When reconnecting after a disconnect, use `afterSeq` to receive missed events:

```javascript
function reconnect(lastSeq) {
  const url = `/api/live/events?category=highlights&afterSeq=${lastSeq}`;
  const eventSource = new EventSource(url);
  // ... setup listeners
}
```

## REST API (Polling)

### Endpoint
```
GET /api/live/events/recent
```

### Query Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| `tournamentId` | number | Filter by tournament |
| `fixtureId` | number | Filter by specific match |
| `type` | string | Filter by specific event type (e.g., `goal`) |
| `category` | string | Filter by category: `highlights`, `goals`, `shootout`, `cards`, `flow` |
| `afterSeq` | number | Only return events after this sequence number |
| `limit` | number | Max events to return (default: 100) |

### JavaScript Example

```javascript
// Fetch recent highlights
async function getHighlights() {
  const response = await fetch('/api/live/events/recent?category=highlights');
  const { events, count } = await response.json();
  return events;
}

// Fetch highlights for specific match
async function getMatchHighlights(fixtureId) {
  const response = await fetch(`/api/live/events/recent?category=highlights&fixtureId=${fixtureId}`);
  const { events } = await response.json();
  return events;
}

// Poll for new events since last check
let lastSeq = 0;
async function pollForUpdates() {
  const response = await fetch(`/api/live/events/recent?category=highlights&afterSeq=${lastSeq}`);
  const { events } = await response.json();

  if (events.length > 0) {
    lastSeq = events[events.length - 1].seq;
    events.forEach(handleEvent);
  }
}

setInterval(pollForUpdates, 5000); // Poll every 5 seconds
```

## Event Object Structure

All events share a common structure:

```javascript
{
  "type": "goal",              // Event type
  "fixtureId": 123,            // Match ID
  "tournamentId": 1,           // Tournament ID
  "minute": 45,                // Match minute
  "second": 23,                // Second within minute
  "seq": 142,                  // Sequence number (for ordering/catchup)
  "serverTimestamp": 1704067200000,

  // Score at time of event
  "score": {
    "home": 1,
    "away": 0
  },

  // Team info
  "teamId": 5,
  "homeTeam": { "id": 5, "name": "Team A" },
  "awayTeam": { "id": 8, "name": "Team B" },

  // Player info (for player events)
  "playerId": 42,
  "displayName": "John Smith",
  "assistPlayerId": 15,
  "assistName": "Jane Doe",

  // Event-specific
  "description": "GOAL! John Smith scores from close range!",
  "xg": 0.45
}
```

### Shootout Events

Shootout events include additional scoring:

```javascript
{
  "type": "shootout_goal",
  "shootoutScore": {
    "home": 3,
    "away": 2
  },
  "round": 4,  // Which round of penalties
  // ... other common fields
}
```

## Other Useful Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/live/status` | Simulation status, tournament state |
| `GET /api/live/matches` | All active matches with current scores |
| `GET /api/live/matches/:fixtureId` | Single match state |
| `GET /api/live/fixtures` | All fixtures with bracket info |
| `GET /api/live/tournament` | Tournament state (current round, etc.) |

## React Example

```jsx
import { useEffect, useState } from 'react';

function LiveHighlights() {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    const es = new EventSource('/api/live/events?category=highlights');

    const handleEvent = (e) => {
      const event = JSON.parse(e.data);
      setEvents(prev => [...prev, event]);
    };

    // Listen to all highlight event types
    ['goal', 'penalty_scored', 'shootout_goal', 'shootout_miss',
     'shootout_save', 'match_end', 'fulltime'].forEach(type => {
      es.addEventListener(type, handleEvent);
    });

    return () => es.close();
  }, []);

  return (
    <ul>
      {events.map((event, i) => (
        <li key={event.seq}>
          {event.minute}' - {event.type}: {event.description}
        </li>
      ))}
    </ul>
  );
}
```
