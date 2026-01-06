# Architecture

## Overview

FootFive is a real-time football (5-a-side) tournament simulation backend built with Node.js and Express. The system runs continuous hourly tournaments where 16 teams compete in a knockout format, with matches simulated in real-time and results streamed to clients via Server-Sent Events (SSE).

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client (Frontend)                         │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │ HTTP / SSE
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Express Application                         │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Routes Layer                          │    │
│  │  /api/teams  /api/players  /api/fixtures  /api/live     │    │
│  │  /api/jcup   /api/admin    /api/diagnostic              │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  Controllers Layer                       │    │
│  │  teamController, playerController, fixtureController    │    │
│  │  liveController, adminController, jCupController        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Models Layer                          │    │
│  │  Team, Player, Fixture, MatchReport, MatchEvent, Odds   │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │ SQL
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     PostgreSQL Database                          │
│  teams, players, fixtures, match_events, match_reports, odds    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    Simulation System                             │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │               SimulationLoop (Singleton)                 │    │
│  │  - 1-second tick interval                               │    │
│  │  - Coordinates all match simulations                    │    │
│  │  - Handles pause/resume/speed controls                  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              TournamentManager                           │    │
│  │  - Manages tournament lifecycle                         │    │
│  │  - Schedules rounds by wall-clock time                  │    │
│  │  - Handles bracket advancement                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   LiveMatch                              │    │
│  │  - Simulates individual match                           │    │
│  │  - Generates events (goals, shots, cards)               │    │
│  │  - Handles extra time and penalties                     │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    EventBus                              │    │
│  │  - Broadcasts events to SSE clients                     │    │
│  │  - Event persistence and replay                         │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. SimulationLoop

The `SimulationLoop` is a singleton that drives the entire simulation:

- **Tick Loop**: Runs every 1 second (configurable via speed multiplier)
- **Match Coordination**: Ticks all active `LiveMatch` instances
- **Tournament Coordination**: Delegates state transitions to `TournamentManager`
- **Recovery**: Handles state recovery after server restart
- **Admin Controls**: Pause, resume, speed adjustment, force actions

### 2. TournamentManager

Manages the hourly tournament lifecycle:

- **State Machine**: IDLE → SETUP → ROUND_OF_16 → QF_BREAK → QUARTER_FINALS → ... → FINAL → RESULTS → COMPLETE
- **Wall-Clock Scheduling**: Matches start at fixed minutes of each hour:
  - `:00` - Round of 16
  - `:15` - Quarter Finals
  - `:30` - Semi Finals
  - `:45` - Final
- **Bracket System**: Pre-generates all fixtures at tournament start with TBD teams
- **Winner Advancement**: Updates next-round fixtures when matches complete

### 3. LiveMatch

Simulates individual matches tick-by-tick:

- **Match Phases**: SCHEDULED → FIRST_HALF → HALFTIME → SECOND_HALF → FULLTIME → (EXTRA_TIME_1 → EXTRA_TIME_2 →) PENALTIES → FINISHED
- **Event Generation**: Goals, shots, saves, fouls, cards
- **Stats Tracking**: Possession, xG, shots on target
- **Knockout Rules**: Extra time and penalty shootouts for draws

### 4. EventBus

Handles real-time event distribution:

- **Event Types**: kickoff, goal, shot_saved, penalty_awarded, halftime, fulltime, etc.
- **SSE Streaming**: Pushes events to connected clients
- **Event History**: Stores events for replay and catch-up

## Data Flow

### Tournament Lifecycle

```
1. Setup Phase (:55-:00)
   └── Load teams from DB
   └── Shuffle and create bracket fixtures
   └── Generate all fixtures (R16 with teams, QF/SF/Final as TBD)

2. Round of 16 (:00-:09)
   └── Load fixtures for round
   └── Create LiveMatch instances
   └── Run match simulation
   └── Generate events and update DB

3. Break Period (:09-:15)
   └── Collect winners
   └── Update next round fixtures with winners
   └── Emit round_complete event

4. [Repeat for QF, SF, Final]

5. Results Phase (:54-:55)
   └── Record winner/runner-up
   └── Update team statistics (jcups_won, runner_ups, highest_round)
```

### Real-Time Event Flow

```
LiveMatch generates event
        │
        ▼
SimulationLoop.emitEvent()
        │
        ▼
EventBus.emit()
        │
        ├──► Persist to match_events table
        │
        └──► Push to SSE connections
                │
                ▼
        Connected clients receive event
```

## Database Schema

### Core Tables

- **teams**: Team data with ratings and statistics
- **players**: Player data with attack/defense ratings
- **fixtures**: Match scheduling and results
- **match_events**: Minute-by-minute event log
- **match_reports**: Aggregate match statistics
- **fixture_odds**: Pre-match betting odds

### Key Relationships

```
teams ──┬── players (1:N)
        │
        ├── fixtures.home_team_id (N:1)
        ├── fixtures.away_team_id (N:1)
        └── fixtures.winner_team_id (N:1)

fixtures ──┬── match_events (1:N)
           ├── match_reports (1:1)
           └── fixture_odds (1:1)
```

## Design Decisions

### Wall-Clock Scheduling
Tournaments run on a fixed hourly schedule to ensure predictable match times for users. This allows:
- Consistent user experience
- Easy frontend countdown timers
- Simple state recovery after restart

### Pre-Generated Bracket
All 15 fixtures (8 R16 + 4 QF + 2 SF + 1 Final) are created at tournament start:
- R16 fixtures have assigned teams
- Later rounds have NULL teams (TBD)
- Winners are inserted into next-round fixtures as matches complete

### Singleton Simulation
The `SimulationLoop` uses singleton pattern to ensure:
- Single source of truth for simulation state
- Coordinated tick timing across all matches
- Easy admin control over entire simulation

### Event-Driven Architecture
Components communicate via events:
- `matches_created`: SimulationLoop registers new matches
- `round_complete`: TournamentManager signals round end
- Match events: Broadcast to clients via SSE

## Scalability Considerations

Current design supports single-server deployment. For scaling:

1. **Horizontal Scaling**: Would require shared state (Redis) for SimulationLoop
2. **Database**: PostgreSQL can handle significantly more load
3. **SSE Connections**: Currently in-process; could be moved to dedicated service
4. **Event Bus**: Could be replaced with Redis Pub/Sub for multi-server

## Security

- **Admin Routes**: Protected by `devAdminOnly` middleware (dev environment only)
- **CORS**: Configured for allowed origins (localhost, VPS IP, domain)
- **Input Validation**: Parameterized SQL queries prevent injection
- **No Authentication**: Public read access (appropriate for game stats)
