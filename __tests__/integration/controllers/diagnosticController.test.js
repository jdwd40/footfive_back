/**
 * DiagnosticController Integration Tests
 * Tests for diagnostic API endpoints
 */

const request = require('supertest');
const { DatabaseTestHelper, setupBeforeEach, cleanupAfterEach, getTestApp } = require('../../setup/testHelpers');

describe('DiagnosticController', () => {
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

  describe('GET /api/diagnostic', () => {
    it('should return database status', async () => {
      const response = await request(app)
        .get('/api/diagnostic')
        .expect(200);
      
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('database');
      expect(response.body).toHaveProperty('environment');
      expect(response.body).toHaveProperty('tables');
      expect(response.body).toHaveProperty('counts');
    });

    it('should show correct database name', async () => {
      const response = await request(app)
        .get('/api/diagnostic')
        .expect(200);
      
      expect(response.body.database).toBe('footfive_test');
      expect(response.body.environment).toBe('test');
    });

    it('should list expected tables', async () => {
      const response = await request(app)
        .get('/api/diagnostic')
        .expect(200);
      
      expect(Array.isArray(response.body.tables)).toBe(true);
      expect(response.body.tables).toContain('teams');
      expect(response.body.tables).toContain('players');
    });

    it('should show table counts', async () => {
      const response = await request(app)
        .get('/api/diagnostic')
        .expect(200);
      
      expect(response.body.counts).toHaveProperty('teams');
      expect(response.body.counts).toHaveProperty('players');
      expect(typeof response.body.counts.teams).toBe('number');
      expect(typeof response.body.counts.players).toBe('number');
    });

    it('should include sample data', async () => {
      const response = await request(app)
        .get('/api/diagnostic')
        .expect(200);
      
      expect(response.body).toHaveProperty('samples');
      expect(response.body.samples).toHaveProperty('team');
      expect(response.body.samples).toHaveProperty('player');
    });

    it('should show sample team with ratings', async () => {
      const response = await request(app)
        .get('/api/diagnostic')
        .expect(200);
      
      if (response.body.samples.team) {
        const sampleTeam = response.body.samples.team;
        expect(sampleTeam).toHaveProperty('team_id');
        expect(sampleTeam).toHaveProperty('name');
        expect(sampleTeam).toHaveProperty('attack_rating');
        expect(sampleTeam).toHaveProperty('defense_rating');
        expect(sampleTeam).toHaveProperty('goalkeeper_rating');
      }
    });

    it('should show sample player with team info', async () => {
      const response = await request(app)
        .get('/api/diagnostic')
        .expect(200);
      
      if (response.body.samples.player) {
        const samplePlayer = response.body.samples.player;
        expect(samplePlayer).toHaveProperty('player_id');
        expect(samplePlayer).toHaveProperty('name');
        expect(samplePlayer).toHaveProperty('team_name');
        expect(samplePlayer).toHaveProperty('attack');
        expect(samplePlayer).toHaveProperty('defense');
      }
    });

    it('should return proper content type', async () => {
      await request(app)
        .get('/api/diagnostic')
        .expect(200)
        .expect('Content-Type', /json/);
    });

    it('should handle empty database gracefully', async () => {
      await DatabaseTestHelper.cleanDatabase();
      
      const response = await request(app)
        .get('/api/diagnostic')
        .expect(200);
      
      expect(response.body.counts.teams).toBe(0);
      expect(response.body.counts.players).toBe(0);
    });
  });

  describe('POST /api/diagnostic/seed', () => {
    it('should seed database successfully', async () => {
      // Clean first
      await DatabaseTestHelper.cleanDatabase();
      
      const response = await request(app)
        .post('/api/diagnostic/seed')
        .expect(200);
      
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('successfully');
      expect(response.body).toHaveProperty('environment');
      expect(response.body).toHaveProperty('database');
    });

    it('should populate database with data', async () => {
      await DatabaseTestHelper.cleanDatabase();
      
      // Seed
      await request(app)
        .post('/api/diagnostic/seed')
        .expect(200);
      
      // Verify data exists
      const teams = await DatabaseTestHelper.getAllTeams();
      expect(teams.length).toBeGreaterThan(0);
    });

    it('should show correct environment', async () => {
      const response = await request(app)
        .post('/api/diagnostic/seed')
        .expect(200);
      
      expect(response.body.environment).toBe('test');
      expect(response.body.database).toBe('footfive_test');
    });

    it('should return proper content type', async () => {
      await request(app)
        .post('/api/diagnostic/seed')
        .expect(200)
        .expect('Content-Type', /json/);
    });

    it('should handle multiple seed requests', async () => {
      // First seed
      await request(app).post('/api/diagnostic/seed').expect(200);
      
      // Second seed should also work
      const response = await request(app)
        .post('/api/diagnostic/seed')
        .expect(200);
      
      expect(response.body.message).toContain('successfully');
    });
  });

  describe('Error handling', () => {
    it('should return 404 for invalid endpoints', async () => {
      await request(app)
        .get('/api/diagnostic/invalid')
        .expect(404);
    });

    it('should handle malformed requests gracefully', async () => {
      await request(app)
        .post('/api/diagnostic')
        .expect(404);
    });
  });

  describe('Response format consistency', () => {
    it('should have consistent response structure', async () => {
      const response = await request(app)
        .get('/api/diagnostic')
        .expect(200);
      
      expect(response.body).toHaveProperty('message');
      expect(typeof response.body.message).toBe('string');
    });

    it('should include diagnostic metadata', async () => {
      const response = await request(app)
        .get('/api/diagnostic')
        .expect(200);
      
      expect(response.body.database).toBeDefined();
      expect(response.body.environment).toBeDefined();
      expect(typeof response.body.database).toBe('string');
      expect(typeof response.body.environment).toBe('string');
    });
  });

  describe('Data accuracy', () => {
    it('should show accurate team counts', async () => {
      const response = await request(app)
        .get('/api/diagnostic')
        .expect(200);
      
      const teams = await DatabaseTestHelper.getAllTeams();
      expect(response.body.counts.teams).toBe(teams.length);
    });

    it('should show accurate player counts', async () => {
      const response = await request(app)
        .get('/api/diagnostic')
        .expect(200);
      
      const result = await DatabaseTestHelper.query('SELECT COUNT(*) FROM players');
      const actualCount = parseInt(result.rows[0].count);
      
      expect(response.body.counts.players).toBe(actualCount);
    });

    it('should verify sample data is from test database', async () => {
      const response = await request(app)
        .get('/api/diagnostic')
        .expect(200);
      
      // Verify we're using test database
      expect(response.body.database).toBe('footfive_test');
      
      // If we have sample data, verify it exists in database
      if (response.body.samples.team) {
        const teamId = response.body.samples.team.team_id;
        const result = await DatabaseTestHelper.query(
          'SELECT * FROM teams WHERE team_id = $1',
          [teamId]
        );
        expect(result.rows.length).toBe(1);
      }
    });
  });
});

