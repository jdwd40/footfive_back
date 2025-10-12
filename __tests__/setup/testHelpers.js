/**
 * Jest Test Helpers
 * Utility functions for tests
 */

const DatabaseTestHelper = require('../../test-helpers/database-helpers');
const { seedTestData, cleanupTestDatabase } = require('../../db/test-seed');
const minimalTeams = require('../../db/test-data/minimal-teams');

/**
 * Setup function to run before each test suite
 * Seeds database with minimal data
 */
const setupBeforeEach = async () => {
  await cleanupTestDatabase();
  await seedTestData(minimalTeams);
};

/**
 * Cleanup function to run after each test suite
 */
const cleanupAfterEach = async () => {
  await cleanupTestDatabase();
};

/**
 * Setup with full tournament data (16 teams)
 */
const setupWithFullData = async () => {
  await cleanupTestDatabase();
  await seedTestData(); // Full data
};

/**
 * Create a test team with players
 */
const createTestTeam = async (overrides = {}) => {
  const defaultTeam = {
    name: `Test Team ${Date.now()}`,
    players: [
      { name: 'Forward 1', attack: 80, defense: 60, isGoalkeeper: false },
      { name: 'Forward 2', attack: 75, defense: 65, isGoalkeeper: false },
      { name: 'Defender 1', attack: 50, defense: 85, isGoalkeeper: false },
      { name: 'Defender 2', attack: 45, defense: 80, isGoalkeeper: false },
      { name: 'Goalkeeper', attack: 30, defense: 90, isGoalkeeper: true }
    ]
  };

  const teamData = { ...defaultTeam, ...overrides };
  const teamId = await DatabaseTestHelper.createTestTeam(teamData);
  
  return { teamId, ...teamData };
};

/**
 * Create a test player
 */
const createTestPlayer = async (teamId, overrides = {}) => {
  const defaultPlayer = {
    name: `Player ${Date.now()}`,
    attack: 70,
    defense: 70,
    isGoalkeeper: false
  };

  const playerData = { ...defaultPlayer, ...overrides };
  
  await DatabaseTestHelper.query(
    'INSERT INTO players (team_id, name, attack, defense, is_goalkeeper) VALUES ($1, $2, $3, $4, $5)',
    [teamId, playerData.name, playerData.attack, playerData.defense, playerData.isGoalkeeper]
  );

  return playerData;
};

/**
 * Get test app for API testing
 */
const getTestApp = () => {
  const express = require('express');
  const cors = require('cors');
  const routes = require('../../routes');

  const app = express();
  app.use(express.json());
  app.use(cors());
  app.use('/api', routes);

  return app;
};

module.exports = {
  DatabaseTestHelper,
  setupBeforeEach,
  cleanupAfterEach,
  setupWithFullData,
  createTestTeam,
  createTestPlayer,
  getTestApp
};

