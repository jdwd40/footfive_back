/**
 * TeamRoutes Tests
 * Tests for team route configuration
 */

const request = require('supertest');
const { setupBeforeEach, cleanupAfterEach, getTestApp } = require('../../setup/testHelpers');

describe('Team Routes', () => {
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
    it('GET /api/teams should be available', async () => {
      await request(app)
        .get('/api/teams')
        .expect(200);
    });

    it('GET /api/teams/3jcup should be available', async () => {
      await request(app)
        .get('/api/teams/3jcup')
        .expect(200);
    });
  });

  describe('HTTP methods', () => {
    it('should accept GET requests on /api/teams', async () => {
      await request(app)
        .get('/api/teams')
        .expect(200);
    });

    it('should not accept POST requests on /api/teams', async () => {
      await request(app)
        .post('/api/teams')
        .expect(404);
    });

    it('should not accept PUT requests on /api/teams', async () => {
      await request(app)
        .put('/api/teams')
        .expect(404);
    });

    it('should not accept DELETE requests on /api/teams', async () => {
      await request(app)
        .delete('/api/teams')
        .expect(404);
    });
  });

  describe('Route parameters', () => {
    it('should handle /api/teams/3jcup route correctly', async () => {
      const response = await request(app)
        .get('/api/teams/3jcup')
        .expect(200);
      
      expect(response.body).toHaveProperty('top3JCupWinners');
    });

    it('should return 404 for invalid sub-routes', async () => {
      await request(app)
        .get('/api/teams/invalid')
        .expect(404);
    });
  });

  describe('Route mounting', () => {
    it('should be mounted under /api prefix', async () => {
      await request(app)
        .get('/api/teams')
        .expect(200);
    });

    it('should not be available without /api prefix', async () => {
      await request(app)
        .get('/teams')
        .expect(404);
    });
  });
});

