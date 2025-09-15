# Soccer Game Simulation System Report

## System Architecture

**Core Components:**
- `JCup.js`: Tournament management and orchestration
- `MatchSimulator.js`: Individual match simulation engine
- `TeamModel.js`: Team data and rating management

## Team Rating System

**Rating Sources:** Teams have three core attributes derived from their best players:
- `attackRating`: Maximum attack stat from non-goalkeeper players
- `defenseRating`: Maximum defense stat from non-goalkeeper players
- `goalkeeperRating`: Maximum defense stat from goalkeeper players

**Dynamic Loading:** Ratings are fetched fresh for each match via `Team.getRatingByTeamName()` at JCup.js:55-56

## Match Simulation Engine

**Time-based Simulation:** Each match simulates 90 minutes sequentially (MatchSimulator.js:24-44)

**Attack Probability:** `chanceOfAttack(team) = team.attackRating / 200` (MatchSimulator.js:76)

**Defense Mechanics:** `defenseBlocks() = defendingTeam.defenseRating / 110` (MatchSimulator.js:98)

**Shot Resolution:**
- 60% chance shot is on target (MatchSimulator.js:102)
- If on target: `goalkeeperSaves() = goalkeeperRating / 90` (MatchSimulator.js:135)
- 4% chance of penalty during attack (MatchSimulator.js:81)
- Penalty success rate: 50% (MatchSimulator.js:139)

## Scoring System

**Regular Time:** Goals increment team score in `this.score` object (MatchSimulator.js:104)

**Penalty Shootouts:**
- Triggered when scores tied after 90 minutes (MatchSimulator.js:46)
- Initial 5 penalties each, sudden death if tied
- 75% success rate per penalty (MatchSimulator.js:179)
- Separate `penaltyScore` tracking (MatchSimulator.js:173-174)

## Highlight Generation System

**Event Types:** 8 distinct highlight categories defined in HIGHLIGHT_TYPES (MatchSimulator.js:1-9)

**Automatic Events:**
- Half-time message at minute 45 (MatchSimulator.js:26-34)
- Full-time message at minute 90 (MatchSimulator.js:35-43)

**Dynamic Events:** Generated during simulation for:
- Goals (with updated score)
- Shots (on/off target, saved)
- Penalties (scored/missed)
- Blocked attacks
- Penalty shootout events

**Highlight Structure:**
```javascript
{
  minute: number,
  type: string,
  team: string,
  description: string,
  score: { home: number, away: number }
}
```

## Tournament Flow

**Match Resolution:** Winner determined by higher score, penalty shootout if tied (JCup.js:58)

**Tournament Progression:** Winners advance to next round until single winner remains (JCup.js:78-93)

**Result Output:** Each match returns score, penaltyScore, highlights, finalResult, and matchMetadata (JCup.js:60-72)