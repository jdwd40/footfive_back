# Getting Started

A quick guide to get FootFive backend running locally.

## Prerequisites

- Node.js 18+
- PostgreSQL 12+
- Git

## Quick Setup

### 1. Clone and Install

```bash
git clone https://github.com/jdwd40/footfive_back.git
cd footfive_back
npm install
```

### 2. Configure Environment

Create `.env.development`:

```env
PGDATABASE=footfive
PGUSER=your_username
PGPASSWORD=your_password
PGHOST=localhost
PGPORT=5432
SIMULATION_AUTO_START=true
```

### 3. Setup Database

```bash
# Create database
psql -U your_username -c "CREATE DATABASE footfive;"

# Run migrations
npm run migrate

# Seed data
npm run seed
```

### 4. Start Server

```bash
npm start
```

Server runs at `http://localhost:9001`

## Verify Installation

```bash
# Check API is responding
curl http://localhost:9001/api

# Should return: {"msg:": "ok"}

# Check teams are loaded
curl http://localhost:9001/api/teams

# Check simulation status
curl http://localhost:9001/api/live/status
```

## Understanding the Application

### What It Does

FootFive simulates 5-a-side football tournaments in real-time:

1. **Hourly Tournaments**: Every hour, 16 teams compete in a knockout tournament
2. **Real-Time Simulation**: Matches play out over ~9 minutes with live events
3. **SSE Streaming**: Clients can subscribe to live match events
4. **Persistent Stats**: Team wins, losses, cups won are tracked across tournaments

### Tournament Schedule

Each hour follows this schedule:

| Minute | Phase |
|--------|-------|
| :55-:00 | Setup - Teams shuffled, bracket created |
| :00-:09 | Round of 16 (8 matches) |
| :15-:24 | Quarter Finals (4 matches) |
| :30-:39 | Semi Finals (2 matches) |
| :45-:54 | Final (1 match) |

### Key Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/live/status` | Current tournament state |
| `GET /api/live/matches` | Active match details |
| `GET /api/live/events` | SSE stream of match events |
| `GET /api/teams` | All teams with stats |
| `GET /api/fixtures` | Match fixtures |

## Development Workflow

### Running in Development

```bash
# Start with auto-restart on file changes (requires nodemon)
npx nodemon listen.js

# Or use node directly
node listen.js
```

### Running Tests

```bash
# All tests
npm test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage
```

### Simulation Controls

With `SIMULATION_AUTO_START=true`, tournaments run automatically.

For manual control (development):

```bash
# Force start tournament (skips schedule)
curl -X POST http://localhost:9001/api/admin/tournament/start

# Pause simulation
curl -X POST http://localhost:9001/api/admin/clock/pause

# Speed up (10x)
curl -X POST http://localhost:9001/api/admin/clock/set-speed \
  -H "Content-Type: application/json" \
  -d '{"speed": 10}'
```

## Project Structure Overview

```
footfive_back/
├── listen.js              # Entry point
├── routes/                # API route definitions
├── controllers/           # Request handlers
├── models/               # Database models
├── Gamelogic/
│   └── simulation/       # Real-time simulation
│       ├── SimulationLoop.js
│       ├── TournamentManager.js
│       └── LiveMatch.js
├── db/
│   ├── connection.js     # PostgreSQL pool
│   └── migrations/       # Schema changes
└── __tests__/           # Test suite
```

## Common Tasks

### Watch a Tournament

1. Open SSE stream in terminal:
```bash
curl -N http://localhost:9001/api/live/events
```

2. Or check status periodically:
```bash
watch -n 5 'curl -s http://localhost:9001/api/live/status | jq'
```

### View Match Details

```bash
# Get active matches
curl http://localhost:9001/api/live/matches | jq

# Get specific match
curl http://localhost:9001/api/live/matches/123 | jq
```

### Check Team Rankings

```bash
curl http://localhost:9001/api/teams/stats | jq '.stats | sort_by(-.jcups_won) | .[0:5]'
```

## Next Steps

- **API Reference**: See `docs/API_REFERENCE.md` for full endpoint documentation
- **Architecture**: See `docs/ARCHITECTURE.md` for system design
- **Deployment**: See `docs/DEPLOYMENT.md` for production setup
- **Testing**: See `docs/TESTING.md` for test guide

## Troubleshooting

### Server won't start

```bash
# Check if port is in use
lsof -i :9001

# Kill existing process
kill $(lsof -t -i :9001)
```

### Database connection fails

```bash
# Verify PostgreSQL is running
pg_isready

# Test connection
psql -U your_username -d footfive -c "SELECT 1;"
```

### No teams in database

```bash
# Re-run seed
npm run seed
```

### Simulation not starting

Check environment variable:
```bash
export SIMULATION_AUTO_START=true
npm start
```

Or start manually via admin endpoint:
```bash
curl -X POST http://localhost:9001/api/admin/simulation/start
```

For detailed installation steps, see `docs/INSTALLATION.md`.
