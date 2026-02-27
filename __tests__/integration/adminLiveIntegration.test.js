/**
 * Integration tests for admin and live endpoints.
 * Uses real SimulationLoop and EventBus; resets them between tests to avoid state leakage.
 * Success-path behaviour is asserted via observable state (GET state/status/matches), not mocks.
 */

const request = require('supertest');
const { resetSimulationLoop, resetEventBus } = require('../../Gamelogic/simulation');
const { createTestApp, setupBeforeEach, cleanupAfterEach, sseClient } = require('../setup/testHelpers');

describe('Admin and Live integration', () => {
  let app;
  const originalEnv = process.env;

  beforeAll(() => {
    process.env.DEV_ADMIN = 'true';
    app = createTestApp({ devAdmin: true });
  });

  beforeEach(async () => {
    resetSimulationLoop();
    resetEventBus();
    await setupBeforeEach();
  });

  afterEach(async () => {
    await cleanupAfterEach();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('startSimulation changes state', () => {
    it('POST start then GET state shows simulation running', async () => {
      await request(app)
        .post('/api/admin/simulation/start')
        .send({})
        .expect(200)
        .expect((res) => {
          expect(res.body).toMatchObject({ success: true, state: expect.any(Object) });
        });

      const stateRes = await request(app).get('/api/admin/state').expect(200);
      expect(stateRes.body.loop).toBeDefined();
      expect(stateRes.body.loop.isRunning).toBe(true);
    });
  });

  describe('forceScore updates match state', () => {
    it('after start and tournament start, force-score updates match and GET match shows score', async () => {
      await request(app).post('/api/admin/simulation/start').send({}).expect(200);
      await request(app).post('/api/admin/tournament/start').send({}).expect(200);

      const matchesRes = await request(app).get('/api/live/matches').expect(200);
      expect(matchesRes.body.matches.length).toBeGreaterThan(0);
      const fixtureId = matchesRes.body.matches[0].fixtureId;

      await request(app)
        .post(`/api/admin/match/${fixtureId}/force-score`)
        .send({ home: 2, away: 1 })
        .expect(200)
        .expect((res) => {
          expect(res.body).toMatchObject({ success: true, score: { home: 2, away: 1 } });
        });

      const matchRes = await request(app).get(`/api/live/matches/${fixtureId}`).expect(200);
      expect(matchRes.body).toMatchObject({
        fixtureId,
        score: { home: 2, away: 1 }
      });
    });
  });

  describe('pauseSimulation and resumeSimulation', () => {
    it('pause sets isPaused in status, resume clears it', async () => {
      await request(app).post('/api/admin/simulation/start').send({}).expect(200);

      await request(app).post('/api/admin/clock/pause').expect(200);
      const statusAfterPause = await request(app).get('/api/live/status').expect(200);
      expect(statusAfterPause.body.simulation.isPaused).toBe(true);

      await request(app).post('/api/admin/clock/resume').expect(200);
      const statusAfterResume = await request(app).get('/api/live/status').expect(200);
      expect(statusAfterResume.body.simulation.isPaused).toBe(false);
    });
  });

  describe('streamEvents SSE', () => {
    it('delivers connected event when subscribing to /api/live/events', async () => {
      await request(app).post('/api/admin/simulation/start').send({}).expect(200);

      const server = app.listen(0);
      const port = server.address().port;
      const baseUrl = `http://127.0.0.1:${port}`;

      try {
        const { events } = await sseClient(baseUrl, '/api/live/events', { timeoutMs: 2500 });
        expect(events.length).toBeGreaterThanOrEqual(1);
        expect(events.some((e) => e.type === 'connected')).toBe(true);
      } finally {
        server.close();
      }
    });

    it('delivers score_update over SSE when forceScore is triggered', async () => {
      await request(app).post('/api/admin/simulation/start').send({}).expect(200);
      await request(app).post('/api/admin/tournament/start').send({}).expect(200);
      const matchesRes = await request(app).get('/api/live/matches').expect(200);
      expect(matchesRes.body.matches.length).toBeGreaterThan(0);
      const fixtureId = matchesRes.body.matches[0].fixtureId;

      const server = app.listen(0);
      const port = server.address().port;
      const baseUrl = `http://127.0.0.1:${port}`;

      try {
        const ssePromise = sseClient(baseUrl, '/api/live/events', { timeoutMs: 4000, fixtureId });
        await new Promise((r) => setTimeout(r, 100));
        await request(app)
          .post(`/api/admin/match/${fixtureId}/force-score`)
          .send({ home: 2, away: 1 })
          .expect(200);
        const { events } = await ssePromise;
        expect(events.some((e) => e.type === 'connected')).toBe(true);
        const scoreEvent = events.find((e) => e.type === 'score_update' && e.fixtureId === fixtureId);
        expect(scoreEvent).toBeDefined();
        expect(scoreEvent.score).toEqual({ home: 2, away: 1 });
      } finally {
        server.close();
      }
    });

    it('afterSeq returns catchup events from buffer', async () => {
      await request(app).post('/api/admin/simulation/start').send({}).expect(200);
      await request(app).post('/api/admin/tournament/start').send({}).expect(200);
      const matchesRes = await request(app).get('/api/live/matches').expect(200);
      const fixtureId = matchesRes.body.matches[0].fixtureId;
      await request(app)
        .post(`/api/admin/match/${fixtureId}/force-score`)
        .send({ home: 1, away: 0 })
        .expect(200);

      const server = app.listen(0);
      const port = server.address().port;
      const baseUrl = `http://127.0.0.1:${port}`;

      try {
        // afterSeq=-1 means "send all buffered events" (seq > -1)
        const { events } = await sseClient(baseUrl, '/api/live/events', { afterSeq: -1, timeoutMs: 3500 });
        expect(events.some((e) => e.type === 'connected')).toBe(true);
        const catchupScore = events.find(
          (e) => e.type === 'score_update' && (e.fixtureId === fixtureId || e.fixtureId === Number(fixtureId))
        );
        expect(catchupScore).toBeDefined();
        expect(catchupScore.score).toEqual({ home: 1, away: 0 });
      } finally {
        server.close();
      }
    });

    it('fixtureId filter only delivers events for that fixture', async () => {
      await request(app).post('/api/admin/simulation/start').send({}).expect(200);
      await request(app).post('/api/admin/tournament/start').send({}).expect(200);
      const matchesRes = await request(app).get('/api/live/matches').expect(200);
      const [fixtureA, fixtureB] = matchesRes.body.matches.slice(0, 2).map((m) => m.fixtureId);

      const server = app.listen(0);
      const port = server.address().port;
      const baseUrl = `http://127.0.0.1:${port}`;

      try {
        const clientForB = sseClient(baseUrl, '/api/live/events', { timeoutMs: 3500, fixtureId: fixtureB });
        await new Promise((r) => setTimeout(r, 50));
        await request(app)
          .post(`/api/admin/match/${fixtureA}/force-score`)
          .send({ home: 3, away: 0 })
          .expect(200);
        const { events: eventsForB } = await clientForB;
        const connectedOnly = eventsForB.filter((e) => e.type === 'connected');
        const scoreEvents = eventsForB.filter((e) => e.type === 'score_update');
        expect(connectedOnly.length).toBeGreaterThanOrEqual(1);
        expect(scoreEvents.every((e) => e.fixtureId === fixtureB)).toBe(true);
        expect(scoreEvents.some((e) => e.fixtureId === fixtureA)).toBe(false);
      } finally {
        server.close();
      }
    });
  });
});
