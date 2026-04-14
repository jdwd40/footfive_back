# FootFive Testing Guide

## Overview

This project uses **Jest** as the testing framework with **Supertest** for API endpoint testing. All tests are organized in the `__tests__/` directory following a clear structure.

## Test Structure

```
__tests__/
├── unit/                    # Unit tests (isolated component testing)
│   ├── models/             # Database model tests
│   │   ├── TeamModel.test.js
│   │   └── PlayerModel.test.js
│   └── gamelogic/          # Game logic tests
│       ├── MatchSimulator.test.js
│       └── JCup.test.js
├── integration/             # Integration tests
│   └── controllers/        # Controller tests (with database)
│       ├── teamController.test.js
│       ├── playerController.test.js
│       ├── jCupController.test.js
│       └── diagnosticController.test.js
├── api/                     # API/Route tests
│   └── routes/             # Route configuration tests
│       ├── index.test.js
│       ├── teamRoutes.test.js
│       ├── playerRoutes.test.js
│       ├── jCupRoutes.test.js
│       └── diagnosticRoutes.test.js
└── setup/                   # Test configuration and helpers
    ├── jest.setup.js
    ├── globalSetup.js
    ├── globalTeardown.js
    └── testHelpers.js
```

## Running Tests

### Run all tests
```bash
npm test
```

### Run tests in watch mode (auto-rerun on file changes)
```bash
npm run test:watch
```

### Run with coverage report
```bash
npm run test:coverage
```

### Run specific test suites
```bash
# Unit tests only
npm run test:unit

# Model tests only
npm run test:models

# Game logic tests only
npm run test:gamelogic

# Integration tests only
npm run test:integration

# Controller tests only
npm run test:controllers

# API/Route tests only
npm run test:routes

# Run with verbose output
npm run test:verbose
```

### Run specific test file
```bash
npx jest __tests__/unit/models/TeamModel.test.js
```

### Run tests matching a pattern
```bash
npx jest -t "TeamModel"
```

## Test Database Configuration

Tests use a separate test database to avoid affecting development data.

### Database Setup

1. **Create test database** (if not already created):
```bash
bash setup-test-database.sh
```

2. **Configure environment**:
Create a `.env.test` file:
```env
PGDATABASE=footfive_test
PGUSER=jd
PGPASSWORD=your_password
PGHOST=localhost
PGPORT=5432
NODE_ENV=test
```

### How Tests Use Database

- **Global Setup**: Creates database schema before all tests
- **Before Each**: Seeds minimal test data (4 teams) for fast tests
- **After Each**: Cleans database to ensure test isolation
- **Global Teardown**: Closes database connections after all tests

## Coverage Goals

- **Models**: 90%+ coverage
- **Controllers**: 85%+ coverage
- **Game Logic**: 90%+ coverage
- **Routes**: 80%+ coverage
- **Overall**: 70%+ minimum

View coverage report:
```bash
npm run test:coverage
open coverage/lcov-report/index.html
```

## Writing New Tests

### Unit Test Example

```javascript
// __tests__/unit/models/MyModel.test.js
const MyModel = require('../../../models/MyModel');
const { setupBeforeEach, cleanupAfterEach } = require('../../setup/testHelpers');

describe('MyModel', () => {
  beforeEach(async () => {
    await setupBeforeEach();
  });

  afterEach(async () => {
    await cleanupAfterEach();
  });

  it('should do something', async () => {
    const result = await MyModel.doSomething();
    expect(result).toBeDefined();
  });
});
```

### Controller Test Example

```javascript
// __tests__/integration/controllers/myController.test.js
const request = require('supertest');
const { setupBeforeEach, cleanupAfterEach, getTestApp } = require('../../setup/testHelpers');

describe('MyController', () => {
  let app;

  beforeAll(() => {
    app = getTestApp();
  });

  beforeEach(async () => {
    await setupBeforeEach();
  });

  afterEach(async () => {
    await cleanupAfterEach();
  });

  it('should return data', async () => {
    const response = await request(app)
      .get('/api/myendpoint')
      .expect(200);
    
    expect(response.body).toHaveProperty('data');
  });
});
```

## Test Helpers

### Available Helper Functions

```javascript
const {
  DatabaseTestHelper,      // Direct database access
  setupBeforeEach,         // Seed minimal data (fast)
  cleanupAfterEach,        // Clean database
  setupWithFullData,       // Seed full tournament data (16 teams)
  createTestTeam,          // Create custom test team
  createTestPlayer,        // Create custom test player
  getTestApp               // Get Express app for testing
} = require('../../setup/testHelpers');
```

### DatabaseTestHelper Methods

```javascript
// Query database directly
await DatabaseTestHelper.query('SELECT * FROM teams');

// Get all teams
await DatabaseTestHelper.getAllTeams();

// Get players by team
await DatabaseTestHelper.getPlayersByTeamId(teamId);

// Create custom test team
await DatabaseTestHelper.createTestTeam({ name: 'Test Team', players: [...] });

// Update team stats
await DatabaseTestHelper.updateTeamStats(teamId, { jcups_won: 5 });

// Reset all team stats
await DatabaseTestHelper.resetAllTeamStats();
```

## Common Test Patterns

### Testing API Endpoints

```javascript
it('should return proper status and structure', async () => {
  const response = await request(app)
    .get('/api/teams')
    .expect(200)
    .expect('Content-Type', /json/);
  
  expect(response.body).toHaveProperty('message');
  expect(response.body).toHaveProperty('teams');
});
```

### Testing Database Models

```javascript
it('should fetch data from database', async () => {
  const teams = await Team.getAll();
  
  expect(Array.isArray(teams)).toBe(true);
  expect(teams.length).toBeGreaterThan(0);
  expect(teams[0]).toHaveProperty('id');
  expect(teams[0]).toHaveProperty('name');
});
```

### Testing Error Handling

```javascript
it('should handle errors gracefully', async () => {
  await expect(Team.getRatingById(99999))
    .rejects.toThrow('not found');
});

it('should return 500 for invalid data', async () => {
  const response = await request(app)
    .get('/api/players/invalid')
    .expect(500);
  
  expect(response.body).toHaveProperty('error');
});
```

## Debugging Tests

### Run single test in debug mode
```bash
node --inspect-brk node_modules/.bin/jest __tests__/unit/models/TeamModel.test.js
```

### View detailed output
```bash
npm run test:verbose
```

### Check for open handles (hanging connections)
```bash
npx jest --detectOpenHandles
```

## Continuous Integration

Jest can be integrated with CI/CD pipelines:

```yaml
# Example GitHub Actions
- name: Run tests
  run: npm test

- name: Check coverage
  run: npm run test:coverage
```

## Troubleshooting

### Tests hang or timeout
- Check database connections are properly closed
- Increase timeout: `jest.setTimeout(10000)` in test file
- Use `--detectOpenHandles` to find open connections

### Database errors
- Ensure test database exists: `bash setup-test-database.sh`
- Check `.env.test` file is configured
- Verify `NODE_ENV=test` is set

### Tests pass individually but fail together
- Ensure proper cleanup in `afterEach`
- Check for shared state between tests
- Use test isolation techniques

### Coverage not accurate
- Check `collectCoverageFrom` in `jest.config.js`
- Ensure all source files are included
- Exclude test files and configs

## Best Practices

1. **Test Isolation**: Each test should be independent
2. **Descriptive Names**: Use clear, descriptive test names
3. **Arrange-Act-Assert**: Structure tests clearly
4. **Fast Tests**: Keep unit tests fast (< 1 second each)
5. **Clean Database**: Always clean up test data
6. **Mock External Services**: Don't call real external APIs in tests
7. **Test Error Cases**: Test both success and failure paths
8. **Meaningful Assertions**: Test behavior, not implementation

## Migration Notes

This project was migrated from a custom test runner to Jest. The following changes were made:

### Fixed Bugs During Migration
1. ✅ Fixed MatchSimulator penalty bug (line 145)
2. ✅ Added missing `PlayerModel.fetchByTeamId()` method
3. ✅ Fixed JCup winner/runner-up tracking
4. ✅ Added UserModel placeholder documentation

### Test Coverage Added
- ✅ All Model tests (Team, Player)
- ✅ All Game Logic tests (MatchSimulator, JCup)
- ✅ All Controller tests (Team, Player, JCup, Diagnostic)
- ✅ All Route tests (comprehensive route configuration)

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Jest Matchers](https://jestjs.io/docs/expect)
- [Testing Best Practices](https://testingjavascript.com/)

