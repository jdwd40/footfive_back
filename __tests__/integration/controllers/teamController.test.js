/**
 * TeamController Integration Tests
 * Tests for team API endpoints
 */

const request = require('supertest');
const { DatabaseTestHelper, setupBeforeEach, cleanupAfterEach, getTestApp } = require('../../setup/testHelpers');

describe('TeamController', () => {
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

  describe('GET /api/teams', () => {
    it('should return all teams', async () => {
      const response = await request(app)
        .get('/api/teams')
        .expect(200);
      
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('teams');
      expect(Array.isArray(response.body.teams)).toBe(true);
      expect(response.body.teams.length).toBeGreaterThan(0);
    });

    it('should return teams with correct structure', async () => {
      const response = await request(app)
        .get('/api/teams')
        .expect(200);
      
      const firstTeam = response.body.teams[0];
      expect(firstTeam).toHaveProperty('id');
      expect(firstTeam).toHaveProperty('name');
      expect(firstTeam).toHaveProperty('wins');
      expect(firstTeam).toHaveProperty('losses');
      expect(firstTeam).toHaveProperty('goalsFor');
      expect(firstTeam).toHaveProperty('goalsAgainst');
      expect(firstTeam).toHaveProperty('jcups_won');
      expect(firstTeam).toHaveProperty('runner_ups');
    });

    it('should return proper content type', async () => {
      await request(app)
        .get('/api/teams')
        .expect(200)
        .expect('Content-Type', /json/);
    });

    it('should return consistent data across requests', async () => {
      const response1 = await request(app).get('/api/teams').expect(200);
      const response2 = await request(app).get('/api/teams').expect(200);
      
      expect(response1.body.teams.length).toBe(response2.body.teams.length);
      
      // Check that team IDs are consistent
      const team1Ids = response1.body.teams.map(t => t.id).sort();
      const team2Ids = response2.body.teams.map(t => t.id).sort();
      expect(team1Ids).toEqual(team2Ids);
    });

    it('should include team ratings', async () => {
      const response = await request(app)
        .get('/api/teams')
        .expect(200);
      
      const firstTeam = response.body.teams[0];
      expect(firstTeam).toHaveProperty('attackRating');
      expect(firstTeam).toHaveProperty('defenseRating');
      expect(firstTeam).toHaveProperty('goalkeeperRating');
      
      expect(typeof firstTeam.attackRating).toBe('number');
      expect(typeof firstTeam.defenseRating).toBe('number');
      expect(typeof firstTeam.goalkeeperRating).toBe('number');
    });
  });

  describe('GET /api/teams/3jcup', () => {
    it('should return top cup winners', async () => {
      // Set up some teams with cup wins
      const teams = await DatabaseTestHelper.getAllTeams();
      if (teams.length >= 3) {
        await DatabaseTestHelper.updateTeamStats(teams[0].team_id, { jcups_won: 5 });
        await DatabaseTestHelper.updateTeamStats(teams[1].team_id, { jcups_won: 3 });
        await DatabaseTestHelper.updateTeamStats(teams[2].team_id, { jcups_won: 1 });
      }
      
      const response = await request(app)
        .get('/api/teams/3jcup')
        .expect(200);
      
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('top3JCupWinners');
      expect(Array.isArray(response.body.top3JCupWinners)).toBe(true);
    });

    it('should order winners by jcups_won descending', async () => {
      const teams = await DatabaseTestHelper.getAllTeams();
      if (teams.length >= 3) {
        await DatabaseTestHelper.updateTeamStats(teams[0].team_id, { jcups_won: 10 });
        await DatabaseTestHelper.updateTeamStats(teams[1].team_id, { jcups_won: 5 });
        await DatabaseTestHelper.updateTeamStats(teams[2].team_id, { jcups_won: 2 });
      }
      
      const response = await request(app)
        .get('/api/teams/3jcup')
        .expect(200);
      
      const topWinners = response.body.top3JCupWinners;
      
      // Verify descending order
      for (let i = 1; i < topWinners.length; i++) {
        expect(topWinners[i - 1].jcups_won).toBeGreaterThanOrEqual(topWinners[i].jcups_won);
      }
    });

    it('should include team name and jcups_won', async () => {
      const response = await request(app)
        .get('/api/teams/3jcup')
        .expect(200);
      
      if (response.body.top3JCupWinners.length > 0) {
        const firstWinner = response.body.top3JCupWinners[0];
        expect(firstWinner).toHaveProperty('name');
        expect(firstWinner).toHaveProperty('jcups_won');
        expect(typeof firstWinner.jcups_won).toBe('number');
      }
    });

    it('should return proper content type', async () => {
      await request(app)
        .get('/api/teams/3jcup')
        .expect(200)
        .expect('Content-Type', /json/);
    });
  });

  describe('Error handling', () => {
    it('should return 404 for invalid endpoints', async () => {
      await request(app)
        .get('/api/teams/invalid-endpoint')
        .expect(404);
    });

    it('should handle malformed requests gracefully', async () => {
      // Test various malformed requests
      await request(app)
        .get('/api/teams/')
        .expect(res => {
          // Should either return 200 with teams or handle gracefully
          expect([200, 404]).toContain(res.status);
        });
    });
  });

  describe('Response format consistency', () => {
    it('should have consistent response structure', async () => {
      const response = await request(app)
        .get('/api/teams')
        .expect(200);
      
      expect(response.body).toHaveProperty('message');
      expect(typeof response.body.message).toBe('string');
      expect(response.body.message).toContain('successfully');
    });

    it('should handle empty results gracefully', async () => {
      // Clean database
      await DatabaseTestHelper.cleanDatabase();
      
      const response = await request(app)
        .get('/api/teams')
        .expect(200);
      
      expect(response.body).toHaveProperty('teams');
      expect(Array.isArray(response.body.teams)).toBe(true);
    });
  });
});

