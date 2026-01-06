# Highlights System Documentation

## Overview
The FootFive app creates match highlights through a sophisticated simulation system that generates real-time commentary and event descriptions during football matches.

## How Highlights Are Created

### 1. Match Simulation Process
- The `MatchSimulator` class simulates a 90-minute football match minute by minute
- For each minute, it determines if teams have attacking opportunities based on their attack ratings
- When attacks occur, various events can happen that generate highlights

### 2. Types of Highlights Generated

#### Regular Match Events:
- **Goals**: When a shot is on target and the goalkeeper doesn't save it
- **Saved Shots**: When a shot is on target but saved by the goalkeeper  
- **Missed Shots**: When a shot is off target
- **Penalties**: When a penalty is awarded (4% chance per attack)
- **Blocked Attacks**: When the defending team successfully blocks an attack

#### Special Events:
- **Half-time**: Score update at minute 45
- **Full-time**: Final score at minute 90
- **Penalty Shootout**: If the match ends in a draw

### 3. Structured Highlights
The system generates structured highlight objects that contain all necessary information for frontend display:

- **`highlights`**: Array of structured objects with minute, type, team, description, and score information

## API Format

Highlights are sent over the API through the `/jcup/play` endpoint.

### API Response Structure:
```json
{
  "message": "Round X played successfully.",
  "results": {
    "roundResults": [
      {
        "score": { "Team1": 2, "Team2": 1 },
        "penaltyScore": { "Team1": 0, "Team2": 0 },
        "matchMetadata": {
          "homeTeam": "Team1",
          "awayTeam": "Team2",
          "venue": "Stadium Name",
          "date": "2024-01-15T10:00:00Z",
          "round": "Round 1"
        },
        "highlights": [
          {
            "minute": 15,
            "type": "goal",
            "team": "Team1",
            "description": "15': GOAL by Team1! Score is now 1-0",
            "score": { "home": 1, "away": 0 }
          },
          {
            "minute": 45,
            "type": "halfTime",
            "description": "Half time: The score is Team1 1-0 Team2",
            "score": { "home": 1, "away": 0 }
          },
          {
            "minute": 67,
            "type": "goal",
            "team": "Team1",
            "description": "67': GOAL by Team1! Score is now 2-0",
            "score": { "home": 2, "away": 0 }
          },
          {
            "minute": 90,
            "type": "fullTime",
            "description": "Full time: The score is Team1 2-1 Team2",
            "score": { "home": 2, "away": 1 }
          }
        ],
        "finalResult": "Team1 2 - Team2 1"
      }
    ],
    "nextRoundFixtures": "Tournament finished, initializing new tournament."
  }
}
```

### Key Points:
1. **Structured Objects**: Highlights are structured objects with consistent properties
2. **Type Safety**: Each highlight has a specific type (goal, shot, penalty, etc.)
3. **Chronological Order**: Highlights are generated in chronological order during the match simulation
4. **Team Information**: Team names are included as separate properties
5. **Score Tracking**: Current score is included in every highlight object
6. **Metadata**: Match metadata includes home/away teams, venue, date, and round information

## Technical Implementation

### Files Involved:
- `Gamelogic/MatchSimulator.js` - Core highlight generation logic
- `controllers/jCupController.js` - API endpoint handling
- `routes/jCupRoutes.js` - Route definitions

### Highlight Generation Methods:
- `handleAttack()` - Generates attack-related highlights
- `handleShot()` - Creates goal and shot highlights
- `handlePenalty()` - Generates penalty event highlights
- `handlePenaltyShootout()` - Creates shootout highlights
- `simulate()` - Main simulation loop that orchestrates highlight creation

The highlights provide a complete narrative of the match, from individual events to score updates and final results, making it easy for frontend applications to display match commentary or summaries. The structured format eliminates the need for string parsing and provides direct access to highlight properties. 