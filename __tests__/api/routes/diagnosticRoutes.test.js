/**
 * DiagnosticRoutes Tests
 * Tests for diagnostic route configuration
 */

const request = require('supertest');
const { setupBeforeEach, cleanupAfterEach, getTestApp } = require('../../setup/testHelpers');

describe('Diagnostic Routes', () => {
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
    it('GET /api/diagnostic should be available', async () => {
      await request(app)
        .get('/api/diagnostic')
        .expect(200);
    });

    it('POST /api/diagnostic/seed should be available', async () => {
      await request(app)
        .post('/api/diagnostic/seed')
        .expect(200);
    });
  });

  describe('HTTP methods', () => {
    it('should accept GET requests on /api/diagnostic', async () => {
      await request(app)
        .get('/api/diagnostic')
        .expect(200);
    });

    it('should not accept POST requests on /api/diagnostic root', async () => {
      await request(app)
        .post('/api/diagnostic')
        .expect(404);
    });

    it('should accept POST requests on /api/diagnostic/seed', async () => {
      await request(app)
        .post('/api/diagnostic/seed')
        .expect(200);
    });

    it('should not accept GET requests on /api/diagnostic/seed', async () => {
      await request(app)
        .get('/api/diagnostic/seed')
        .expect(404);
    });

    it('should not accept PUT or DELETE requests', async () => {
      await request(app)
        .put('/api/diagnostic')
        .expect(404);
      
      await request(app)
        .delete('/api/diagnostic')
        .expect(404);
    });
  });

  describe('Route mounting', () => {
    it('should be mounted under /api prefix', async () => {
      await request(app)
        .get('/api/diagnostic')
        .expect(200);
    });

    it('should not be available without /api prefix', async () => {
      await request(app)
        .get('/diagnostic')
        .expect(404);
    });
  });

  describe('Invalid routes', () => {
    it('should return 404 for invalid sub-routes', async () => {
      await request(app)
        .get('/api/diagnostic/invalid')
        .expect(404);
    });

    it('should return 404 for undefined POST routes', async () => {
      await request(app)
        .post('/api/diagnostic/invalid')
        .expect(404);
    });
  });

  describe('Route functionality', () => {
    it('should allow multiple diagnostic checks', async () => {
      await request(app).get('/api/diagnostic').expect(200);
      await request(app).get('/api/diagnostic').expect(200);
    });

    it('should allow multiple seed operations', async () => {
      await request(app).post('/api/diagnostic/seed').expect(200);
      await request(app).post('/api/diagnostic/seed').expect(200);
    });
  });
});

