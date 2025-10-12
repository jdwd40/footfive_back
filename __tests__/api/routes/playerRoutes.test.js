/**
 * PlayerRoutes Tests
 * Tests for player route configuration
 */

const request = require('supertest');
const { DatabaseTestHelper, setupBeforeEach, cleanupAfterEach, getTestApp } = require('../../setup/testHelpers');

describe('Player Routes', () => {
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

  describe('Route availability', () => {
    it('GET /api/players should be available', async () => {
      await request(app)
        .get('/api/players')
        .expect(200);
    });

    it('GET /api/players/:playerId should be available', async () => {
      const teams = await DatabaseTestHelper.getAllTeams();
      const players = await DatabaseTestHelper.getPlayersByTeamId(teams[0].team_id);
      
      await request(app)
        .get(`/api/players/${players[0].player_id}`)
        .expect(200);
    });

    it('GET /api/players/team/:teamName should be available', async () => {
      const teams = await DatabaseTestHelper.getAllTeams();
      
      await request(app)
        .get(`/api/players/team/${encodeURIComponent(teams[0].name)}`)
        .expect(200);
    });
  });

  describe('HTTP methods', () => {
    it('should accept GET requests on /api/players', async () => {
      await request(app)
        .get('/api/players')
        .expect(200);
    });

    it('should not accept POST requests on /api/players', async () => {
      await request(app)
        .post('/api/players')
        .expect(404);
    });

    it('should not accept PUT requests on /api/players', async () => {
      await request(app)
        .put('/api/players')
        .expect(404);
    });

    it('should not accept DELETE requests on /api/players', async () => {
      await request(app)
        .delete('/api/players')
        .expect(404);
    });
  });

  describe('Route parameters', () => {
    it('should extract playerId parameter correctly', async () => {
      const teams = await DatabaseTestHelper.getAllTeams();
      const players = await DatabaseTestHelper.getPlayersByTeamId(teams[0].team_id);
      const testPlayerId = players[0].player_id;
      
      const response = await request(app)
        .get(`/api/players/${testPlayerId}`)
        .expect(200);
      
      expect(response.body.player.playerId).toBe(testPlayerId);
    });

    it('should extract teamName parameter correctly', async () => {
      const teams = await DatabaseTestHelper.getAllTeams();
      const testTeamName = teams[0].name;
      
      const response = await request(app)
        .get(`/api/players/team/${encodeURIComponent(testTeamName)}`)
        .expect(200);
      
      expect(response.body.message).toContain(testTeamName);
    });

    it('should handle URL-encoded team names', async () => {
      const teams = await DatabaseTestHelper.getAllTeams();
      const testTeamName = teams[0].name;
      
      await request(app)
        .get(`/api/players/team/${encodeURIComponent(testTeamName)}`)
        .expect(200);
    });
  });

  describe('Route mounting', () => {
    it('should be mounted under /api prefix', async () => {
      await request(app)
        .get('/api/players')
        .expect(200);
    });

    it('should not be available without /api prefix', async () => {
      await request(app)
        .get('/players')
        .expect(404);
    });
  });

  describe('Route precedence', () => {
    it('should match /team/:teamName before /:playerId', async () => {
      const teams = await DatabaseTestHelper.getAllTeams();
      
      // This should match the /team/:teamName route, not /:playerId
      const response = await request(app)
        .get(`/api/players/team/${encodeURIComponent(teams[0].name)}`)
        .expect(200);
      
      expect(response.body).toHaveProperty('players');
    });
  });
});

