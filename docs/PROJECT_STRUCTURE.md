# Project Structure

```
footfive_back/
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Actions deployment workflow
│
├── __tests__/                  # Test suite
│   ├── api/
│   │   └── routes/             # Route integration tests
│   │       ├── diagnosticRoutes.test.js
│   │       ├── index.test.js
│   │       ├── jCupRoutes.test.js
│   │       ├── playerRoutes.test.js
│   │       └── teamRoutes.test.js
│   │
│   ├── integration/
│   │   └── controllers/        # Controller integration tests
│   │       ├── diagnosticController.test.js
│   │       ├── jCupController.test.js
│   │       ├── playerController.test.js
│   │       └── teamController.test.js
│   │
│   ├── unit/
│   │   ├── controllers/        # Controller unit tests
│   │   │   ├── adminController.test.js
│   │   │   └── liveController.test.js
│   │   │
│   │   ├── gamelogic/          # Game logic unit tests
│   │   │   ├── EventBus.test.js
│   │   │   ├── JCup.test.js
│   │   │   ├── LiveMatch.test.js
│   │   │   ├── MatchSimulator.test.js
│   │   │   ├── SimulationLoop.test.js
│   │   │   └── TournamentManager.test.js
│   │   │
│   │   └── models/             # Model unit tests
│   │       ├── PlayerModel.test.js
│   │       └── TeamModel.test.js
│   │
│   └── setup/                  # Test configuration
│       ├── globalSetup.js      # Runs once before all tests
│       ├── globalTeardown.js   # Runs once after all tests
│       ├── jest.setup.js       # Runs before each test file
│       └── testHelpers.js      # Shared test utilities
│
├── controllers/                # Request handlers
│   ├── adminController.js      # Admin/dev controls
│   ├── diagnosticController.js # Database diagnostics
│   ├── fixtureController.js    # Fixture CRUD and simulation
│   ├── jCupController.js       # Legacy tournament endpoints
│   ├── liveController.js       # Real-time/SSE endpoints
│   ├── playerController.js     # Player data endpoints
│   └── teamController.js       # Team data endpoints
│
├── db/                         # Database layer
│   ├── connection.js           # PostgreSQL connection pool
│   ├── test-connection.js      # Test database connection
│   ├── seed.js                 # Production seed script
│   ├── test-seed.js            # Test database seeder
│   ├── run-seed.js             # Seed runner
│   │
│   ├── data/                   # Seed data
│   │   ├── index.js            # Data exports
│   │   └── teams.js            # Team definitions
│   │
│   ├── test-data/              # Test-specific data
│   │   └── minimal-teams.js    # Minimal dataset for tests
│   │
│   └── migrations/             # Database migrations
│       ├── run-migration.js    # Migration runner
│       ├── 001_match_system.sql      # Fixtures, events, reports tables
│       ├── 002_add_event_types.sql   # Additional event types
│       └── 003_bracket_system.sql    # Bracket positioning columns
│
├── Gamelogic/                  # Core game simulation
│   ├── JCup.js                 # Legacy tournament logic
│   ├── MatchSimulator.js       # Match outcome calculation
│   ├── OddsEngine.js           # Betting odds calculation
│   ├── SimulationEngine.js     # High-level simulation control
│   │
│   └── simulation/             # Real-time simulation system
│       ├── index.js            # Module exports
│       ├── EventBus.js         # Event distribution
│       ├── LiveMatch.js        # Individual match simulation
│       ├── SimulationLoop.js   # Main tick loop (singleton)
│       └── TournamentManager.js # Tournament state machine
│
├── models/                     # Data models
│   ├── FixtureModel.js         # Fixture CRUD operations
│   ├── MatchEventModel.js      # Match event operations
│   ├── MatchReportModel.js     # Match report operations
│   ├── OddsModel.js            # Odds calculations
│   ├── PlayerModel.js          # Player data access
│   ├── TeamModel.js            # Team data access
│   └── UserModel.js            # User model (placeholder)
│
├── routes/                     # Express route definitions
│   ├── index.js                # Route aggregator
│   ├── adminRoutes.js          # /api/admin/*
│   ├── diagnosticRoutes.js     # /api/diagnostic/*
│   ├── fixtureRoutes.js        # /api/fixtures/*
│   ├── jCupRoutes.js           # /api/jcup/*
│   ├── liveRoutes.js           # /api/live/*
│   ├── playerRoutes.js         # /api/players/*
│   └── teamRoutes.js           # /api/teams/*
│
├── test-helpers/               # Test utilities
│   ├── database-helpers.js     # Database test utilities
│   └── test-setup.js           # Test environment setup
│
├── docs/                       # Documentation
│   ├── ARCHITECTURE.md         # System architecture
│   ├── PROJECT_STRUCTURE.md    # This file
│   ├── TESTING.md              # Testing guide
│   ├── API_REFERENCE.md        # API documentation
│   ├── GETTING_STARTED.md      # Setup guide
│   ├── TROUBLESHOOTING.md      # Common issues
│   └── DEPLOYMENT.md           # Deployment guide
│
├── listen.js                   # Application entry point
├── monitor.js                  # Monitoring utilities
├── package.json                # Dependencies and scripts
├── package-lock.json           # Locked dependencies
│
├── .env.development            # Development environment
├── .env.test                   # Test environment
└── .env.production             # Production environment (not in repo)
```

## Directory Details

### `/controllers`

Controllers handle HTTP requests and responses. They:
- Parse request parameters
- Call model methods
- Format and return responses
- Handle errors

### `/models`

Models encapsulate database operations:
- SQL query construction
- Data transformation
- Business logic validation

### `/routes`

Route files define:
- URL patterns
- HTTP methods
- Controller mappings
- Middleware chains

### `/Gamelogic`

Core simulation logic:
- **JCup.js**: Legacy synchronous tournament simulation
- **MatchSimulator.js**: Calculates match outcomes based on team ratings
- **OddsEngine.js**: Generates betting odds from team statistics

### `/Gamelogic/simulation`

Real-time simulation components:
- **SimulationLoop.js**: Singleton tick-based loop
- **TournamentManager.js**: Tournament state machine
- **LiveMatch.js**: Individual match simulation
- **EventBus.js**: Event broadcasting

### `/db`

Database management:
- **connection.js**: PostgreSQL pool configuration
- **migrations/**: Schema changes
- **data/**: Seed data for teams/players

### `/__tests__`

Test organization:
- **unit/**: Isolated component tests
- **integration/**: Multi-component tests
- **api/**: Full HTTP request tests
- **setup/**: Test configuration

## Key Files

### `listen.js`
Application entry point:
- Creates Express app
- Configures middleware (CORS, JSON parsing)
- Mounts routes
- Starts HTTP server
- Auto-starts simulation if `SIMULATION_AUTO_START=true`
- Handles graceful shutdown

### `package.json`
Project configuration:
- **name**: footfive
- **main**: index.js
- **scripts**: npm commands
- **dependencies**: Runtime packages
- **devDependencies**: Test packages

### `.github/workflows/deploy.yml`
GitHub Actions workflow:
- Triggers on push to master
- SSH into VPS
- Pull latest code
- Install dependencies
- Run migrations
- Restart PM2 process

## Module Dependencies

```
listen.js
    ├── routes/index.js
    │   ├── routes/*Routes.js
    │   │   └── controllers/*Controller.js
    │   │       └── models/*Model.js
    │   │           └── db/connection.js
    │   │
    │   └── Gamelogic/simulation/
    │       ├── SimulationLoop.js
    │       ├── TournamentManager.js
    │       ├── LiveMatch.js
    │       └── EventBus.js
    │
    └── Gamelogic/simulation/SimulationLoop.js
```
