# Match Events Enhancement

## Overview

Enhanced the live match event system to emit more detailed, human-readable events for frontend match viewing. Previously, only key events (goals, match state changes) were emitted. Now all significant match moments are broadcast with engaging descriptions.

## Changes

### Files Modified

- `Gamelogic/simulation/LiveMatch.js`
- `Gamelogic/simulation/EventBus.js`

### New Events Emitted

| Event Type | When | Example Description |
|------------|------|---------------------|
| `shot_saved` | Goalkeeper saves a shot | "Save! Arsenal keeper denies Marcus Silva. Corner to Chelsea." |
| `shot_missed` | Shot goes off target | "Shot from Marcus Silva goes over the bar." |
| `foul` | Foul is committed | "Foul by Marcus Silva. Free kick to Arsenal." |
| `corner` | Corner is awarded (from blocks) | "Corner to Chelsea. Good defensive work from Arsenal." |

### Enhanced Descriptions

**Goals** now include player and assist information:
- Before: `"GOAL! Chelsea"`
- After: `"GOAL! Marcus Silva scores! Assisted by John Doe."`

**Saves** indicate if a corner was awarded:
- `"Save! Arsenal keeper denies Marcus Silva. Corner to Chelsea."`
- `"Save! Good stop by the Arsenal goalkeeper from Marcus Silva's effort."`

### Helper Methods Added

- `_getMissDescription(playerName, teamName)` - Returns varied miss descriptions
- `_getFoulDescription(playerName, teamName, opposingTeam)` - Returns varied foul descriptions

### EventBus Update

Added `corner` to the `persistableTypes` array so corner events are saved to the database.

## Event Structure

All events include:
```javascript
{
  type: 'shot_saved',           // Event type
  fixtureId: 123,               // Match ID
  tournamentId: 1,              // Tournament ID
  minute: 34,                   // Match minute
  timestamp: 1234567890,        // Server timestamp
  score: { home: 1, away: 0 },  // Current score
  homeTeam: { id: 1, name: 'Chelsea' },
  awayTeam: { id: 2, name: 'Arsenal' },
  teamId: 1,                    // Team involved
  playerId: 45,                 // Player involved (if applicable)
  displayName: 'Marcus Silva',  // Player name
  description: '...',           // Human-readable description
  xg: 0.12,                     // Expected goals value (shots only)
  outcome: 'saved',             // Event outcome
  bundleId: 'attack_34_1',      // Groups related events
  cornerAwarded: true           // Additional context (saves only)
}
```

## Expected Event Frequency

For a typical 12-minute match (6 min per half):
- 4-8 shot events (saves + misses)
- 2-4 foul events
- 2-4 corner events
- 0-3 goals (unchanged from before)
- Match state events (start, halftime, fulltime)

**Total: ~10-20 events per match** (previously 3-5)

## Frontend Integration

```javascript
const eventSource = new EventSource('/api/live/events?fixtureId=123');

// Listen to specific event types
eventSource.addEventListener('goal', (e) => {
  const event = JSON.parse(e.data);
  showGoalAnimation(event);
});

eventSource.addEventListener('shot_saved', (e) => {
  const event = JSON.parse(e.data);
  displayEvent(event.minute, event.description);
});

eventSource.addEventListener('foul', (e) => {
  const event = JSON.parse(e.data);
  displayEvent(event.minute, event.description);
});

// Or listen to all events
eventSource.onmessage = (e) => {
  const event = JSON.parse(e.data);
  displayEvent(event.minute, event.description);
};
```

## Simulation Unchanged

The match simulation logic remains identical:
- Goal probabilities unchanged
- Attack/defense calculations unchanged
- Penalty logic unchanged
- All existing functionality preserved

This enhancement only adds visibility to events that were already being simulated but not broadcast.
