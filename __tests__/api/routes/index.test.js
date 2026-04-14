/**
 * Main Routes Tests
 * Tests for main API router configuration
 */

const request = require('supertest');
const { setupBeforeEach, cleanupAfterEach, getTestApp } = require('../../setup/testHelpers');

describe('Main API Routes', () => {
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

  describe('Root endpoint', () => {
    it('GET /api returns 200 and ok message', async () => {
      const response = await request(app)
        .get('/api')
        .expect(200);
      expect(response.body).toHaveProperty('msg');
      expect(response.body.msg).toBe('ok');
    });
  });

  describe('Sub-route mounting', () => {
    it('should mount /teams sub-routes', async () => {
      await request(app)
        .get('/api/teams')
        .expect(200);
    });

    it('should mount /players sub-routes', async () => {
      await request(app)
        .get('/api/players')
        .expect(200);
    });

    it('should mount /diagnostic sub-routes', async () => {
      await request(app)
        .get('/api/diagnostic')
        .expect(200);
    });
  });

  describe('Invalid routes', () => {
    it('should return 404 for invalid API routes', async () => {
      await request(app)
        .get('/api/invalid')
        .expect(404);
    });

    it('should return 404 for routes without /api prefix', async () => {
      await request(app)
        .get('/teams')
        .expect(404);
    });

    it('should return 404 for deeply nested invalid routes', async () => {
      await request(app)
        .get('/api/teams/invalid/nested/route')
        .expect(404);
    });
  });

  describe('Content-Type', () => {
    it('should return JSON for documented GET endpoints', async () => {
      const jsonRoutes = ['/api', '/api/teams', '/api/players', '/api/diagnostic'];
      for (const route of jsonRoutes) {
        const res = await request(app).get(route);
        expect(res.headers['content-type']).toMatch(/json/);
      }
    });
  });

  describe('API versioning readiness', () => {
    it('should use /api prefix for potential versioning', async () => {
      // Current: /api/teams
      // Future could be: /api/v1/teams, /api/v2/teams
      
      const response = await request(app)
        .get('/api/teams')
        .expect(200);
      
      expect(response.req.path).toContain('/api/');
    });
  });
});

