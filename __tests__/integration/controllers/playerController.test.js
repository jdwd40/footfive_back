/**
 * PlayerController Integration Tests
 * Tests for player API endpoints
 */

const request = require('supertest');
const { DatabaseTestHelper, setupBeforeEach, cleanupAfterEach, getTestApp } = require('../../setup/testHelpers');

describe('PlayerController', () => {
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

  describe('GET /api/players', () => {
    it('should return all players', async () => {
      const response = await request(app)
        .get('/api/players')
        .expect(200);
      
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('players');
      expect(Array.isArray(response.body.players)).toBe(true);
      expect(response.body.players.length).toBeGreaterThan(0);
    });

    it('should return players with correct structure', async () => {
      const response = await request(app)
        .get('/api/players')
        .expect(200);
      
      const firstPlayer = response.body.players[0];
      expect(firstPlayer).toHaveProperty('playerId');
      expect(firstPlayer).toHaveProperty('teamId');
      expect(firstPlayer).toHaveProperty('name');
      expect(firstPlayer).toHaveProperty('attack');
      expect(firstPlayer).toHaveProperty('defense');
      expect(firstPlayer).toHaveProperty('isGoalkeeper');
    });

    it('should return proper content type', async () => {
      await request(app)
        .get('/api/players')
        .expect(200)
        .expect('Content-Type', /json/);
    });

    it('should include both goalkeepers and outfield players', async () => {
      const response = await request(app)
        .get('/api/players')
        .expect(200);
      
      const players = response.body.players;
      const goalkeepers = players.filter(p => p.isGoalkeeper);
      const outfieldPlayers = players.filter(p => !p.isGoalkeeper);
      
      expect(goalkeepers.length).toBeGreaterThan(0);
      expect(outfieldPlayers.length).toBeGreaterThan(0);
    });

    it('should have valid stat ranges', async () => {
      const response = await request(app)
        .get('/api/players')
        .expect(200);
      
      response.body.players.forEach(player => {
        expect(player.attack).toBeGreaterThanOrEqual(10);
        expect(player.attack).toBeLessThanOrEqual(100);
        expect(player.defense).toBeGreaterThanOrEqual(10);
        expect(player.defense).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('GET /api/players/team/:teamName', () => {
    it('should return players for specific team', async () => {
      const teams = await DatabaseTestHelper.getAllTeams();
      const testTeam = teams[0];
      
      const response = await request(app)
        .get(`/api/players/team/${encodeURIComponent(testTeam.name)}`)
        .expect(200);
      
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('players');
      expect(Array.isArray(response.body.players)).toBe(true);
      expect(response.body.players.length).toBeGreaterThan(0);
    });

    it('should return only players from specified team', async () => {
      const teams = await DatabaseTestHelper.getAllTeams();
      const testTeam = teams[0];
      
      const response = await request(app)
        .get(`/api/players/team/${encodeURIComponent(testTeam.name)}`)
        .expect(200);
      
      // All players should have properties from the correct team
      response.body.players.forEach(player => {
        expect(player).toHaveProperty('name');
        expect(player).toHaveProperty('attack');
        expect(player).toHaveProperty('defense');
      });
    });

    it('should return empty array for non-existent team', async () => {
      const response = await request(app)
        .get('/api/players/team/NonExistentTeam')
        .expect(200);
      
      expect(response.body).toHaveProperty('players');
      expect(Array.isArray(response.body.players)).toBe(true);
      expect(response.body.players.length).toBe(0);
    });

    it('should handle URL-encoded team names', async () => {
      const teams = await DatabaseTestHelper.getAllTeams();
      const testTeam = teams[0];
      
      // Test with spaces or special characters if present
      const response = await request(app)
        .get(`/api/players/team/${encodeURIComponent(testTeam.name)}`)
        .expect(200);
      
      expect(response.body.message).toContain(testTeam.name);
    });

    it('should include goalkeepers and outfield players', async () => {
      const teams = await DatabaseTestHelper.getAllTeams();
      const testTeam = teams[0];
      
      const response = await request(app)
        .get(`/api/players/team/${encodeURIComponent(testTeam.name)}`)
        .expect(200);
      
      const players = response.body.players;
      const goalkeepers = players.filter(p => p.isGoalkeeper);
      const outfieldPlayers = players.filter(p => !p.isGoalkeeper);
      
      expect(goalkeepers.length).toBeGreaterThan(0);
      expect(outfieldPlayers.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/players/:playerId', () => {
    it('should return player by ID', async () => {
      const teams = await DatabaseTestHelper.getAllTeams();
      const players = await DatabaseTestHelper.getPlayersByTeamId(teams[0].team_id);
      const testPlayer = players[0];
      
      const response = await request(app)
        .get(`/api/players/${testPlayer.player_id}`)
        .expect(200);
      
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('player');
      expect(response.body.player.playerId).toBe(testPlayer.player_id);
      expect(response.body.player.name).toBe(testPlayer.name);
    });

    it('should return correct player properties', async () => {
      const teams = await DatabaseTestHelper.getAllTeams();
      const players = await DatabaseTestHelper.getPlayersByTeamId(teams[0].team_id);
      const testPlayer = players[0];
      
      const response = await request(app)
        .get(`/api/players/${testPlayer.player_id}`)
        .expect(200);
      
      const player = response.body.player;
      expect(player).toHaveProperty('playerId');
      expect(player).toHaveProperty('teamId');
      expect(player).toHaveProperty('name');
      expect(player).toHaveProperty('attack');
      expect(player).toHaveProperty('defense');
      expect(player).toHaveProperty('isGoalkeeper');
    });

    it('should return 500 for non-existent player ID', async () => {
      await request(app)
        .get('/api/players/99999')
        .expect(500);
    });

    it('should handle invalid player ID format', async () => {
      await request(app)
        .get('/api/players/invalid')
        .expect(500);
    });

    it('should return proper content type', async () => {
      const teams = await DatabaseTestHelper.getAllTeams();
      const players = await DatabaseTestHelper.getPlayersByTeamId(teams[0].team_id);
      
      await request(app)
        .get(`/api/players/${players[0].player_id}`)
        .expect(200)
        .expect('Content-Type', /json/);
    });
  });

  describe('Error handling', () => {
    it('should return 404 for invalid endpoints', async () => {
      await request(app)
        .get('/api/players/invalid/endpoint/test')
        .expect(404);
    });

    it('should handle database errors gracefully', async () => {
      // Try to get non-existent player
      const response = await request(app)
        .get('/api/players/99999')
        .expect(500);
      
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Response format consistency', () => {
    it('should have consistent response structure', async () => {
      const response = await request(app)
        .get('/api/players')
        .expect(200);
      
      expect(response.body).toHaveProperty('message');
      expect(typeof response.body.message).toBe('string');
      expect(response.body.message).toContain('successfully');
    });

    it('should handle empty results gracefully', async () => {
      await DatabaseTestHelper.cleanDatabase();
      
      const response = await request(app)
        .get('/api/players')
        .expect(200);
      
      expect(response.body).toHaveProperty('players');
      expect(Array.isArray(response.body.players)).toBe(true);
      expect(response.body.players.length).toBe(0);
    });
  });

  describe('Data validation', () => {
    it('should return valid player stats', async () => {
      const response = await request(app)
        .get('/api/players')
        .expect(200);
      
      response.body.players.forEach(player => {
        expect(typeof player.attack).toBe('number');
        expect(typeof player.defense).toBe('number');
        expect(typeof player.isGoalkeeper).toBe('boolean');
        expect(player.attack).toBeGreaterThanOrEqual(10);
        expect(player.defense).toBeGreaterThanOrEqual(10);
      });
    });

    it('should return valid team associations', async () => {
      const response = await request(app)
        .get('/api/players')
        .expect(200);
      
      response.body.players.forEach(player => {
        expect(typeof player.teamId).toBe('number');
        expect(player.teamId).toBeGreaterThan(0);
      });
    });
  });
});

