# FootFive Backend Documentation

## Overview

FootFive is a REST Express.js backend for a football (soccer) management simulation. The application simulates knockout cup tournaments with realistic match simulation, providing detailed highlights and statistics to a frontend application.

## Table of Contents

- [Architecture](#architecture)
- [API Endpoints](#api-endpoints)
- [Database Schema](#database-schema)
- [Game Logic](#game-logic)
- [Match Simulation](#match-simulation)
- [Tournament System](#tournament-system)
- [Testing](#testing)
- [Setup & Installation](#setup--installation)
- [Usage Examples](#usage-examples)

## Architecture

### Tech Stack
- **Backend**: Node.js + Express.js
- **Database**: PostgreSQL
- **Database Driver**: `pg` (node-postgres)
- **Testing**: Jest + Supertest
- **Environment**: dotenv for configuration
- **CORS**: Enabled for frontend integration

### Project Structure
```
footfive_back/
├── controllers/          # Request handlers
│   ├── jCupController.js
│   └── teamController.js
├── db/                  # Database configuration and data
│   ├── connection.js
│   ├── data/
│   │   └── teams.js     # Team and player seed data
│   ├── run-seed.js
│   └── seed.js
├── Gamelogic/           # Core simulation logic
│   ├── JCup.js         # Tournament management
│   └── MatchSimulator.js # Match simulation engine
├── models/              # Database models
│   ├── PlayerModel.js
│   ├── TeamModel.js
│   └── UserModel.js
├── routes/              # API route definitions
│   ├── index.js
│   ├── jCupRoutes.js
│   └── teamRoutes.js
├── listen.js            # Server entry point
└── package.json
```

## API Endpoints

### Tournament Management

#### Initialize Tournament
```http
GET /api/jcup/init
```
**Description**: Initializes a new tournament, loads teams, and generates first round fixtures.

**Response**:
```json
{
  "message": "Tournament initialized successfully",
  "fixtures": [
    [
      {
        "team1": { "id": 1, "name": "Metro City", ... },
        "team2": { "id": 2, "name": "Mega City One", ... }
      }
    ]
  ]
}
```

#### Play Round
```http
GET /api/jcup/play
```
**Description**: Simulates the current round and advances winners to the next stage.

**Response**:
```json
{
  "message": "Round 1 played successfully.",
  "results": ["Metro City 2 - Mega City One 1", ...],
  "highlights": ["1': GOAL by Metro City!", ...],
  "nextRoundFixtures": [...]
}
```

#### Update Cup Winner
```http
POST /api/jcup/end
```
**Body**:
```json
{
  "winner_id": 1,
  "runner_id": 2
}
```
**Description**: Updates cup winner statistics in the database.

### Team Management

#### Get All Teams
```http
GET /api/teams
```
**Description**: Retrieves all teams with their statistics.

**Response**:
```json
{
  "message": "Teams fetched successfully",
  "teams": [
    {
      "id": 1,
      "name": "Metro City",
      "attackRating": 87,
      "defenseRating": 83,
      "goalkeeperRating": 75,
      "jcups_won": 2,
      "runner_ups": 1
    }
  ]
}
```

#### Get Top Cup Winners
```http
GET /api/teams/3jcup
```
**Description**: Retrieves the top 16 teams by cup wins.

## Database Schema

### Teams Table
```sql
CREATE TABLE teams (
    team_id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    wins INTEGER DEFAULT 0 NOT NULL,
    losses INTEGER DEFAULT 0 NOT NULL,
    goals_for INTEGER DEFAULT 0 NOT NULL,
    goals_against INTEGER DEFAULT 0 NOT NULL,
    jcups_won INTEGER DEFAULT 0 NOT NULL,
    runner_ups INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### Players Table
```sql
CREATE TABLE players (
    player_id SERIAL PRIMARY KEY,
    team_id INTEGER NOT NULL REFERENCES teams(team_id),
    name VARCHAR(255) NOT NULL,
    attack INTEGER NOT NULL,
    defense INTEGER NOT NULL,
    is_goalkeeper BOOLEAN NOT NULL
);
```

## Game Logic

### Team Ratings System

Team ratings are calculated from the best player stats in each category:

- **Attack Rating**: Maximum attack value from non-goalkeeper players
- **Defense Rating**: Maximum defense value from non-goalkeeper players  
- **Goalkeeper Rating**: Maximum defense value from goalkeeper players

### Player Statistics Range
- **Attack**: 10-88 points
- **Defense**: 10-83 points
- **Goalkeeper**: 30-80 points

## Match Simulation

### Match Flow
1. **90-Minute Simulation**: Each match is simulated minute-by-minute
2. **Attack Cycles**: Teams get attack opportunities based on their attack rating
3. **Defense Mechanics**: Defending team can block attacks based on defense rating
4. **Shot Accuracy**: 60% chance of shots being on target
5. **Goalkeeper Saves**: Based on goalkeeper rating
6. **Penalties**: 4% chance during attacks, 50% success rate
7. **Extra Time**: If tied after 90 minutes, penalty shootout occurs

### Penalty Shootout
- **5 Rounds**: Each team takes 5 penalties
- **Sudden Death**: If tied after 5 rounds, continues until one team wins
- **Success Rate**: 75% chance of scoring penalties

### Match Events
- **Goals**: Scored when shot beats goalkeeper
- **Saves**: Goalkeeper successfully blocks shot
- **Missed Shots**: Shot goes off target
- **Penalties**: Awarded during regular play
- **Half-time**: Score update at 45 minutes
- **Full-time**: Final score at 90 minutes

## Tournament System

### Cup Format
- **Type**: Single-elimination knockout tournament
- **Teams**: 16 teams
- **Rounds**: 4 rounds (Round of 16, Quarter-finals, Semi-finals, Final)
- **Byes**: Handled automatically for odd numbers of teams

### Tournament Flow
1. **Initialization**: Load teams and generate first round fixtures
2. **Round Simulation**: Play all matches in current round
3. **Winner Advancement**: Winners progress to next round
4. **Fixture Generation**: New fixtures created for next round
5. **Final**: Championship match with special handling
6. **Statistics Update**: Cup wins and runner-ups recorded

### Fixture Generation
- **Random Shuffling**: Teams are randomly paired each round
- **Fair Distribution**: Ensures no team gets multiple byes
- **Progressive Structure**: Winners advance to next stage

## Testing

FootFive uses **Jest** as the testing framework with comprehensive test coverage across all components.

### Test Structure
- **Unit Tests**: Models and game logic (`__tests__/unit/`)
- **Integration Tests**: Controllers with database (`__tests__/integration/`)
- **API Tests**: Route configuration (`__tests__/api/`)

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage report
npm run test:coverage

# Run in watch mode (auto-rerun on changes)
npm run test:watch

# Run specific test suites
npm run test:models        # Model tests only
npm run test:gamelogic     # Game logic tests only
npm run test:controllers   # Controller tests only
npm run test:routes        # Route tests only
```

### Test Database

Tests use a separate test database (`footfive_test`) to avoid affecting development data:

```bash
# Setup test database (first time only)
bash setup-test-database.sh
```

### Coverage Goals
- Models: 90%+ coverage
- Controllers: 85%+ coverage
- Game Logic: 90%+ coverage
- Routes: 80%+ coverage
- Overall: 70%+ minimum

**For detailed testing documentation, see [TESTING.md](./TESTING.md)**

## Setup & Installation

### Prerequisites
- Node.js (v14 or higher)
- PostgreSQL database
- npm or yarn package manager

### Installation Steps

1. **Clone Repository**
   ```bash
   git clone <repository-url>
   cd footfive_back
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Environment Configuration**
   Create `.env.development` file:
   ```env
   PGDATABASE=footfive_dev
   PGHOST=localhost
   PGUSER=your_username
   PGPASSWORD=your_password
   PGPORT=5432
   NODE_ENV=development
   ```

4. **Database Setup**
   ```bash
   # Create database
   createdb footfive_dev
   
   # Seed database
   npm run seed
   ```

5. **Start Server**
   ```bash
   npm start
   ```

### Available Scripts
- `npm start`: Start the server on port 9001
- `npm run seed`: Seed the database with team and player data
- `npm test`: Run test file

## Usage Examples

### Starting a Tournament
```javascript
// Frontend can call:
fetch('/api/jcup/init')
  .then(response => response.json())
  .then(data => {
    console.log('Tournament initialized:', data.fixtures);
  });
```

### Playing Rounds
```javascript
// Play each round sequentially:
fetch('/api/jcup/play')
  .then(response => response.json())
  .then(data => {
    console.log('Round results:', data.results);
    console.log('Highlights:', data.highlights);
  });
```

### Getting Team Statistics
```javascript
// Retrieve all teams:
fetch('/api/teams')
  .then(response => response.json())
  .then(data => {
    console.log('Teams:', data.teams);
  });

// Get top cup winners:
fetch('/api/teams/3jcup')
  .then(response => response.json())
  .then(data => {
    console.log('Top winners:', data.top3JCupWinners);
  });
```

## Frontend Integration

### CORS Configuration
The backend is configured to accept requests from:
- **Origin**: `http://127.0.0.1:5173`
- **Methods**: GET, POST, PUT, DELETE
- **Credentials**: Enabled

### Response Format
All API responses follow a consistent format:
```json
{
  "message": "Success/error message",
  "data": {...},
  "error": "Error details (if applicable)"
}
```

### Real-time Updates
- Each round provides fresh data for frontend display
- Match highlights can be displayed as live commentary
- Tournament progress is tracked and updated automatically

## Data Management

### Seeded Teams
The application comes with 16 pre-configured teams:
- Metro City, Mega City One, Mega City Two
- Outside City, Airway City, Green Bay
- Orlean City, St Marri, Doge City
- Atlan City, Port Hilo, Virgin City
- Tripper City, Metro Bay, Redstone City, Swirl City

Each team has 5 players with balanced attack/defense ratings.

### Statistics Tracking
- **Cup Wins**: Number of tournaments won
- **Runner-ups**: Number of second-place finishes
- **Match Statistics**: Goals scored/conceded, wins/losses

## Error Handling

The application includes comprehensive error handling:
- Database connection errors
- Invalid team/player lookups
- Tournament state validation
- API request validation

All errors are returned with appropriate HTTP status codes and descriptive messages.

---

This documentation provides a complete overview of the FootFive backend system. For additional support or questions, refer to the codebase or contact the development team.
