# FootFive Soccer Game System Report

## System Overview
FootFive is a soccer simulation backend that runs knockout cup tournaments with realistic match simulation, detailed scoring mechanics, and comprehensive highlight generation.

## Core Architecture

### 1. Tournament Structure (JCup.js)
- **Format**: Single-elimination knockout tournament
- **Teams**: 16 teams maximum
- **Rounds**: 4 rounds (Round of 16 → Quarter-finals → Semi-finals → Final)
- **Team Management**: Random shuffling for fair fixture generation
- **Bye Handling**: Automatic handling for odd team numbers

### 2. Team Rating System (TeamModel.js)
**Rating Calculation Logic:**
```sql
-- Attack Rating: Best non-goalkeeper attack stat
SELECT MAX(attack) FROM players WHERE team_id = ? AND is_goalkeeper = false

-- Defense Rating: Best non-goalkeeper defense stat  
SELECT MAX(defense) FROM players WHERE team_id = ? AND is_goalkeeper = false

-- Goalkeeper Rating: Best goalkeeper defense stat
SELECT MAX(defense) FROM players WHERE team_id = ? AND is_goalkeeper = true
```

**Player Stat Ranges:**
- Attack: 10-88 points
- Defense: 10-83 points  
- Goalkeeper: 30-80 points

## Match Simulation Engine (MatchSimulator.js)

### 3. Game Flow Mechanics
**90-Minute Simulation:**
- Minute-by-minute simulation (1-90)
- Each team gets attack opportunities based on attack rating
- Probability formula: `Math.random() < team.attackRating / 200`

### 4. Attack Resolution Chain
```
Attack Opportunity → Defense Check → Shot/Penalty → Goal/Save/Miss
```

**Defense Blocking:**
- Probability: `Math.random() < defendingTeam.defenseRating / 110`
- If blocked: Attack fails, highlight generated

**Shot Mechanics:**
- 60% chance shot is on target
- If on target: Goalkeeper save check
- Goalkeeper save probability: `Math.random() < defendingTeam.goalkeeperRating / 90`

**Penalty System:**
- 4% chance during any attack
- 50% success rate if awarded
- Separate penalty score tracking

### 5. Scoring System
**Regular Goals:**
- Scored when shot beats goalkeeper
- Updates team score immediately
- Generates goal highlight with current score

**Penalty Shootout (if tied after 90 minutes):**
- 5 rounds of penalties per team
- 75% success rate per penalty
- Sudden death if still tied after 5 rounds
- Penalty scores tracked separately from regular goals

## Highlight Generation System

### 6. Highlight Types & Structure
**Highlight Object Format:**
```javascript
{
  minute: number,
  type: 'goal'|'shot'|'penalty'|'halfTime'|'fullTime'|'blocked'|'penaltyShootout',
  team: string,
  description: string,
  score: { home: number, away: number }
}
```

### 7. Event Types Generated
**Regular Match Events:**
- **Goals**: When shot beats goalkeeper
- **Saved Shots**: Goalkeeper saves on-target shot
- **Missed Shots**: Shot goes off target
- **Blocked Attacks**: Defense successfully blocks attack
- **Penalties**: Awarded (4% chance) and scored/missed

**Special Events:**
- **Half-time**: Score update at minute 45
- **Full-time**: Final score at minute 90
- **Penalty Shootout**: If match tied after 90 minutes

### 8. Highlight Generation Logic
**Per Minute Simulation:**
1. Check if each team gets attack opportunity
2. If attack occurs:
   - Check if defense blocks
   - If not blocked: Check for penalty (4%) or shot
   - Generate appropriate highlight based on outcome
3. Update score and create highlight with current score
4. Special highlights at minutes 45 and 90

## Tournament Execution Flow

### 9. Round Simulation Process
**JCup.simulateRound() Logic:**
1. Load team ratings from database for current round matches
2. For each match:
   - Create MatchSimulator instance
   - Run 90-minute simulation
   - Determine winner based on final score
   - Collect highlights and metadata
3. Advance winners to next round
4. Generate new fixtures for next round

### 10. Data Flow & API Response
**Match Result Structure:**
```javascript
{
  score: { team1: number, team2: number },
  penaltyScore: { team1: number, team2: number },
  highlights: [highlight_objects],
  finalResult: "Team1 2 - Team2 1",
  matchMetadata: {
    homeTeam: string,
    awayTeam: string,
    venue: string,
    date: ISO_string,
    round: string
  }
}
```

## Key Technical Details

### 11. Probability Calculations
- **Attack Chance**: `attackRating / 200` (max ~44% for 88 rating)
- **Defense Block**: `defenseRating / 110` (max ~75% for 83 rating)  
- **Goalkeeper Save**: `goalkeeperRating / 90` (max ~89% for 80 rating)
- **Shot Accuracy**: Fixed 60%
- **Penalty Award**: Fixed 4% per attack
- **Penalty Success**: Fixed 50% (regular), 75% (shootout)

### 12. Database Integration
- Team ratings calculated dynamically from player stats
- Tournament results stored in memory during execution
- Cup wins/runners-up updated in database after tournament completion
- 16 pre-seeded teams with balanced player distributions

### 13. Winner Determination
- Regular time: Higher score wins
- Penalty shootout: Higher penalty score wins
- Tournament progression: Winners advance, losers eliminated
- Final: Winner gets cup win recorded in database

## File Structure Reference

### Core Game Logic Files:
- `Gamelogic/JCup.js` - Tournament management and round simulation
- `Gamelogic/MatchSimulator.js` - Individual match simulation engine
- `models/TeamModel.js` - Team rating calculations and database operations
- `controllers/jCupController.js` - API endpoint handlers
- `routes/jCupRoutes.js` - Route definitions

### Key Methods:
- `JCup.simulateRound()` - Executes current round simulation
- `MatchSimulator.simulate()` - Runs 90-minute match simulation
- `Team.getRatingByTeamName()` - Calculates team ratings from player stats
- `MatchSimulator.handleAttack()` - Processes attack opportunities
- `MatchSimulator.handlePenaltyShootout()` - Manages penalty shootouts

This system provides realistic soccer simulation with detailed event tracking, making it suitable for frontend applications that need to display match commentary, statistics, and tournament progression.
