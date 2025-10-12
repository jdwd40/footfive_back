/**
 * JCupController Integration Tests
 * Tests for tournament API endpoints
 */

const request = require('supertest');
const { DatabaseTestHelper, setupWithFullData, cleanupAfterEach, getTestApp } = require('../../setup/testHelpers');
const jCupController = require('../../../controllers/jCupController');

describe('JCupController', () => {
  let app;

  beforeAll(() => {
    app = getTestApp();
  });

  beforeEach(async () => {
    await setupWithFullData(); // Need full team data for tournament
  });

  afterEach(async () => {
    await cleanupAfterEach();
    jCupController.resetJCup(); // Reset global jCup instance between tests
  });

  describe('GET /api/jcup/init', () => {
    it('should initialize tournament successfully', async () => {
      const response = await request(app)
        .get('/api/jcup/init')
        .expect(200);
      
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toBe('Tournament initialized successfully');
      expect(response.body).toHaveProperty('fixtures');
      expect(Array.isArray(response.body.fixtures)).toBe(true);
      expect(response.body.fixtures.length).toBeGreaterThan(0);
    });

    it('should generate tournament fixtures', async () => {
      const response = await request(app)
        .get('/api/jcup/init')
        .expect(200);
      
      const fixtures = response.body.fixtures;
      expect(fixtures[0]).toBeDefined();
      expect(Array.isArray(fixtures[0])).toBe(true);
      expect(fixtures[0].length).toBeGreaterThan(0);
    });

    it('should return proper content type', async () => {
      await request(app)
        .get('/api/jcup/init')
        .expect(200)
        .expect('Content-Type', /json/);
    });

    it('should handle multiple initializations', async () => {
      // Initialize first time
      await request(app).get('/api/jcup/init').expect(200);
      
      // Initialize second time should also work
      const response = await request(app)
        .get('/api/jcup/init')
        .expect(200);
      
      expect(response.body.message).toBe('Tournament initialized successfully');
    });
  });

  describe('GET /api/jcup/play', () => {
    it('should play a round successfully', async () => {
      // First initialize
      await request(app).get('/api/jcup/init').expect(200);
      
      // Then play a round
      const response = await request(app)
        .get('/api/jcup/play')
        .expect(200);
      
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('results');
      expect(Array.isArray(response.body.results)).toBe(true);
    });

    it('should return match results with required properties', async () => {
      await request(app).get('/api/jcup/init').expect(200);
      
      const response = await request(app)
        .get('/api/jcup/play')
        .expect(200);
      
      const results = response.body.results;
      expect(results.length).toBeGreaterThan(0);
      
      const firstResult = results[0];
      expect(firstResult).toHaveProperty('score');
      expect(firstResult).toHaveProperty('highlights');
      expect(firstResult).toHaveProperty('finalResult');
      expect(firstResult).toHaveProperty('matchMetadata');
    });

    it('should return 400 when no tournament initialized', async () => {
      const response = await request(app)
        .get('/api/jcup/play')
        .expect(400);
      
      expect(response.body).toHaveProperty('message');
    });

    it('should advance rounds correctly', async () => {
      await request(app).get('/api/jcup/init').expect(200);
      
      // Play first round
      const response1 = await request(app)
        .get('/api/jcup/play')
        .expect(200);
      
      expect(response1.body.message).toContain('Round');
      
      // Play second round
      const response2 = await request(app)
        .get('/api/jcup/play')
        .expect(200);
      
      expect(response2.body.message).toContain('Round');
    });

    it('should handle final round', async () => {
      await request(app).get('/api/jcup/init').expect(200);
      
      let response;
      let roundCount = 0;
      const maxRounds = 10;
      
      // Play until final or max rounds
      while (roundCount < maxRounds) {
        response = await request(app).get('/api/jcup/play').expect(res => {
          expect([200, 400]).toContain(res.status);
        });
        
        roundCount++;
        
        if (response.status === 400 || response.body.message?.includes('Final')) {
          break;
        }
      }
      
      expect(roundCount).toBeLessThanOrEqual(maxRounds);
    }, 30000); // Increase timeout

    it('should include match metadata', async () => {
      await request(app).get('/api/jcup/init').expect(200);
      
      const response = await request(app)
        .get('/api/jcup/play')
        .expect(200);
      
      const result = response.body.results[0];
      expect(result.matchMetadata).toHaveProperty('homeTeam');
      expect(result.matchMetadata).toHaveProperty('awayTeam');
      expect(result.matchMetadata).toHaveProperty('round');
    });
  });

  describe('POST /api/jcup/end', () => {
    it('should update winner statistics', async () => {
      const teams = await DatabaseTestHelper.getAllTeams();
      const winnerId = teams[0].team_id;
      const runnerId = teams[1].team_id;
      
      const response = await request(app)
        .post('/api/jcup/end')
        .send({ winner_id: winnerId, runner_id: runnerId })
        .expect(200);
      
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toBe('jCupWon updated successfully');
    });

    it('should accept winner and runner-up IDs', async () => {
      const teams = await DatabaseTestHelper.getAllTeams();
      
      const response = await request(app)
        .post('/api/jcup/end')
        .send({ 
          winner_id: teams[0].team_id, 
          runner_id: teams[1].team_id 
        })
        .expect(200);
      
      expect(response.body).toHaveProperty('jCupWon');
    });

    it('should update database correctly', async () => {
      const teams = await DatabaseTestHelper.getAllTeams();
      const winnerId = teams[0].team_id;
      
      // Get initial stats
      const initialStats = await DatabaseTestHelper.query(
        'SELECT jcups_won FROM teams WHERE team_id = $1',
        [winnerId]
      );
      const initialCups = initialStats.rows[0].jcups_won;
      
      // Update via API
      await request(app)
        .post('/api/jcup/end')
        .send({ winner_id: winnerId, runner_id: teams[1].team_id })
        .expect(200);
      
      // Verify update
      const finalStats = await DatabaseTestHelper.query(
        'SELECT jcups_won FROM teams WHERE team_id = $1',
        [winnerId]
      );
      const finalCups = finalStats.rows[0].jcups_won;
      
      expect(finalCups).toBe(initialCups + 1);
    });

    it('should return proper content type', async () => {
      const teams = await DatabaseTestHelper.getAllTeams();
      
      await request(app)
        .post('/api/jcup/end')
        .send({ winner_id: teams[0].team_id, runner_id: teams[1].team_id })
        .expect(200)
        .expect('Content-Type', /json/);
    });

    it('should handle missing request body gracefully', async () => {
      const response = await request(app)
        .post('/api/jcup/end')
        .send({})
        .expect(500);
      
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Error handling', () => {
    it('should return 404 for invalid endpoints', async () => {
      await request(app)
        .get('/api/jcup/invalid')
        .expect(404);
    });

    it('should handle errors gracefully', async () => {
      const response = await request(app)
        .post('/api/jcup/end')
        .send({ winner_id: 99999, runner_id: 99998 })
        .expect(500);
      
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Tournament flow', () => {
    it('should complete full tournament flow', async () => {
      // Initialize
      const initResponse = await request(app)
        .get('/api/jcup/init')
        .expect(200);
      
      expect(initResponse.body.message).toBe('Tournament initialized successfully');
      
      // Play rounds
      let roundCount = 0;
      const maxRounds = 10;
      
      while (roundCount < maxRounds) {
        const playResponse = await request(app).get('/api/jcup/play');
        
        roundCount++;
        
        if (playResponse.status === 400) {
          // No more rounds
          break;
        }
        
        expect(playResponse.status).toBe(200);
        expect(playResponse.body).toHaveProperty('results');
      }
      
      expect(roundCount).toBeGreaterThan(0);
      expect(roundCount).toBeLessThanOrEqual(maxRounds);
    }, 30000);

    it('should maintain consistent tournament state', async () => {
      await request(app).get('/api/jcup/init').expect(200);
      
      // Play first round
      const round1 = await request(app).get('/api/jcup/play').expect(200);
      const firstRoundMatches = round1.body.results.length;
      
      // Play second round
      const round2 = await request(app).get('/api/jcup/play').expect(200);
      const secondRoundMatches = round2.body.results.length;
      
      // Second round should have fewer or equal matches (winners advance)
      expect(secondRoundMatches).toBeLessThanOrEqual(firstRoundMatches);
    });
  });

  describe('Response format consistency', () => {
    it('should have consistent response structure', async () => {
      const response = await request(app)
        .get('/api/jcup/init')
        .expect(200);
      
      expect(response.body).toHaveProperty('message');
      expect(typeof response.body.message).toBe('string');
    });

    it('should include proper success messages', async () => {
      await request(app).get('/api/jcup/init').expect(200);
      
      const response = await request(app)
        .get('/api/jcup/play')
        .expect(200);
      
      expect(response.body.message).toContain('successfully');
    });
  });
});

