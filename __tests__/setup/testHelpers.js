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
 * Get test app for API testing (real routes, no mocking of loop/eventBus).
 * Same as createTestApp() with no options.
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

/**
 * Build Express app with real routes and minimal/real dependencies for integration tests.
 * Use resetSimulationLoop() and resetEventBus() in beforeEach/afterEach when testing
 * admin/live endpoints to avoid cross-test state leakage.
 *
 * @param {Object} [options]
 * @param {boolean} [options.devAdmin=true] - If true, callers should set process.env.DEV_ADMIN='true' so admin routes accept requests.
 * @returns {import('express').Application}
 */
const createTestApp = (options = {}) => {
  const app = getTestApp();
  if (options.devAdmin !== false) {
    process.env.DEV_ADMIN = 'true';
  }
  return app;
};

/**
 * Parse SSE data lines from chunk; returns { parsed: object[], buffer: string }.
 * Handles multiline and incomplete lines safely.
 */
function parseSSELines(buffer, chunk) {
  const str = buffer + chunk.toString();
  const lines = str.split('\n');
  const remainder = lines.pop() || '';
  const parsed = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('data: ')) {
      const payload = line.slice(6).trim();
      if (payload === '') continue;
      try {
        parsed.push(JSON.parse(payload));
      } catch (_) {
        // skip non-JSON data lines
      }
    }
  }
  return { parsed, buffer: remainder };
}

/**
 * Connect to an SSE endpoint, collect events until timeout, and return parsed payloads.
 * Uses native http so the app must be listening (e.g. app.listen(0)).
 *
 * @param {string} baseUrl - e.g. 'http://127.0.0.1:3456'
 * @param {string} path - e.g. '/api/live/events'
 * @param {{ timeoutMs?: number, afterSeq?: number, fixtureId?: number, tournamentId?: number }} [opts]
 * @returns {Promise<{ events: Array<object>, close: function }>}
 */
function sseClient(baseUrl, path, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 3000;
  const params = new URLSearchParams();
  if (opts.afterSeq != null) params.set('afterSeq', String(opts.afterSeq));
  if (opts.fixtureId != null) params.set('fixtureId', String(opts.fixtureId));
  if (opts.tournamentId != null) params.set('tournamentId', String(opts.tournamentId));
  const search = params.toString();
  const pathWithQuery = search ? `${path}${path.includes('?') ? '&' : '?'}${search}` : path;

  const url = new URL(pathWithQuery, baseUrl);
  const http = require('http');
  const events = [];

  return new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      req.destroy();
      resolve(result);
    };
    const req = http.get(
      { hostname: url.hostname, port: url.port || 80, path: url.pathname + url.search, headers: { Accept: 'text/event-stream' } },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return finish({ events: [], close: () => {} });
        }
        let buffer = '';
        timeoutId = setTimeout(() => finish({ events, close: () => {} }), timeoutMs);
        res.on('data', (chunk) => {
          const { parsed, buffer: nextBuffer } = parseSSELines(buffer, chunk);
          buffer = nextBuffer;
          events.push(...parsed);
        });
        res.on('end', () => finish({ events, close: () => {} }));
        res.on('error', (err) => {
          if (!settled) { settled = true; if (timeoutId) clearTimeout(timeoutId); req.destroy(); reject(err); }
        });
      }
    );
    req.on('error', (err) => {
      if (!settled) { settled = true; reject(err); }
    });
  });
}

module.exports = {
  DatabaseTestHelper,
  setupBeforeEach,
  cleanupAfterEach,
  setupWithFullData,
  createTestTeam,
  createTestPlayer,
  getTestApp,
  createTestApp,
  sseClient
};

