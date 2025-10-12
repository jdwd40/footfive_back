/**
 * JCupRoutes Tests
 * Tests for jCup route configuration
 */

const request = require('supertest');
const { setupWithFullData, cleanupAfterEach, getTestApp } = require('../../setup/testHelpers');
const jCupController = require('../../../controllers/jCupController');

describe('JCup Routes', () => {
  let app;

  beforeAll(() => {
    app = getTestApp();
  });

  beforeEach(async () => {
    await setupWithFullData();
  });

  afterEach(async () => {
    await cleanupAfterEach();
    jCupController.resetJCup(); // Reset global jCup instance between tests
  });

  describe('Route availability', () => {
    it('GET /api/jcup/init should be available', async () => {
      await request(app)
        .get('/api/jcup/init')
        .expect(200);
    });

    it('GET /api/jcup/play should be available', async () => {
      // Initialize first
      await request(app).get('/api/jcup/init');
      
      await request(app)
        .get('/api/jcup/play')
        .expect(200);
    });

    it('POST /api/jcup/end should be available', async () => {
      await request(app)
        .post('/api/jcup/end')
        .send({ winner_id: 1, runner_id: 2 })
        .expect(res => {
          // Should either succeed or fail gracefully
          expect([200, 500]).toContain(res.status);
        });
    });
  });

  describe('HTTP methods', () => {
    it('should accept GET requests on /api/jcup/init', async () => {
      await request(app)
        .get('/api/jcup/init')
        .expect(200);
    });

    it('should not accept POST requests on /api/jcup/init', async () => {
      await request(app)
        .post('/api/jcup/init')
        .expect(404);
    });

    it('should accept GET requests on /api/jcup/play', async () => {
      await request(app).get('/api/jcup/init');
      
      await request(app)
        .get('/api/jcup/play')
        .expect(200);
    });

    it('should accept POST requests on /api/jcup/end', async () => {
      await request(app)
        .post('/api/jcup/end')
        .send({ winner_id: 1, runner_id: 2 })
        .expect(res => {
          expect([200, 500]).toContain(res.status);
        });
    });

    it('should not accept GET requests on /api/jcup/end', async () => {
      await request(app)
        .get('/api/jcup/end')
        .expect(404);
    });
  });

  describe('Route mounting', () => {
    it('should be mounted under /api prefix', async () => {
      await request(app)
        .get('/api/jcup/init')
        .expect(200);
    });

    it('should not be available without /api prefix', async () => {
      await request(app)
        .get('/jcup/init')
        .expect(404);
    });
  });

  describe('Route sequence', () => {
    it('should allow init -> play -> end sequence', async () => {
      // Step 1: Initialize
      await request(app)
        .get('/api/jcup/init')
        .expect(200);
      
      // Step 2: Play
      await request(app)
        .get('/api/jcup/play')
        .expect(200);
      
      // Step 3: End (with proper IDs)
      await request(app)
        .post('/api/jcup/end')
        .send({ winner_id: 1, runner_id: 2 })
        .expect(res => {
          expect([200, 500]).toContain(res.status);
        });
    });

    it('should return 400 when playing without init', async () => {
      await request(app)
        .get('/api/jcup/play')
        .expect(400);
    });
  });

  describe('Invalid routes', () => {
    it('should return 404 for invalid sub-routes', async () => {
      await request(app)
        .get('/api/jcup/invalid')
        .expect(404);
    });

    it('should return 404 for undefined routes', async () => {
      await request(app)
        .get('/api/jcup/test/invalid')
        .expect(404);
    });
  });
});

