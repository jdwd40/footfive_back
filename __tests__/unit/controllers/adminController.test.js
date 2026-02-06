const {
  devAdminOnly,
  startSimulation,
  stopSimulation,
  forceTournamentStart,
  cancelTournament,
  skipToRound,
  forceScore,
  forceEndMatch,
  pauseSimulation,
  resumeSimulation,
  setSpeed,
  getFullState,
  clearEvents
} = require('../../../controllers/adminController');

// Store original env
const originalEnv = process.env;

// Mock simulation modules
const mockLoop = {
  isRunning: false,
  isPaused: false,
  tickCount: 0,
  speedMultiplier: 1,
  tickIntervalMs: 1000,
  matches: new Map(),
  init: jest.fn().mockReturnThis(),
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn(),
  pause: jest.fn(),
  resume: jest.fn(),
  setSpeed: jest.fn(),
  getState: jest.fn().mockReturnValue({ isRunning: true }),
  getMatch: jest.fn(),
  forceSetScore: jest.fn(),
  forceEndMatch: jest.fn(),
  registerMatches: jest.fn(),
  tournamentManager: null
};

const mockEventBus = {
  eventBuffer: [],
  sequence: 0,
  getStats: jest.fn().mockReturnValue({ eventsEmitted: 0 }),
  getRecentEvents: jest.fn().mockReturnValue([])
};

jest.mock('../../../Gamelogic/simulation/SimulationLoop', () => ({
  getSimulationLoop: jest.fn(() => mockLoop)
}));

jest.mock('../../../Gamelogic/simulation/EventBus', () => ({
  getEventBus: jest.fn(() => mockEventBus)
}));

jest.mock('../../../Gamelogic/simulation/TournamentManager', () => ({
  TournamentManager: jest.fn().mockImplementation(() => ({
    getState: jest.fn().mockReturnValue({ state: 'IDLE' }),
    forceStart: jest.fn().mockResolvedValue({ state: 'ROUND_OF_16' }),
    cancel: jest.fn(),
    skipToRound: jest.fn().mockResolvedValue({ state: 'FINAL' }),
    getLiveMatches: jest.fn().mockReturnValue([])
  }))
}));

describe('adminController', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };

    mockReq = {
      body: {},
      params: {},
      headers: {}
    };
    mockRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };
    mockNext = jest.fn();

    // Reset mock loop state
    mockLoop.isRunning = false;
    mockLoop.isPaused = false;
    mockLoop.tournamentManager = null;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('devAdminOnly middleware', () => {
    it('should allow access when DEV_ADMIN=true', () => {
      process.env.DEV_ADMIN = 'true';

      devAdminOnly(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should allow access with valid X-Admin-Secret', () => {
      process.env.ADMIN_SECRET = 'secret123';
      mockReq.headers['x-admin-secret'] = 'secret123';

      devAdminOnly(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should deny access without dev mode or secret', () => {
      process.env.DEV_ADMIN = 'false';
      delete process.env.ADMIN_SECRET;

      devAdminOnly(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Not found' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should deny access with wrong secret', () => {
      process.env.ADMIN_SECRET = 'secret123';
      mockReq.headers['x-admin-secret'] = 'wrongsecret';

      devAdminOnly(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('startSimulation', () => {
    it('should initialize and start simulation loop', async () => {
      await startSimulation(mockReq, mockRes);

      expect(mockLoop.init).toHaveBeenCalled();
      expect(mockLoop.start).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        state: expect.any(Object)
      });
    });
  });

  describe('stopSimulation', () => {
    it('should stop simulation loop', () => {
      stopSimulation(mockReq, mockRes);

      expect(mockLoop.stop).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        isRunning: false
      });
    });
  });

  describe('forceTournamentStart', () => {
    it('should return error if simulation not initialized', async () => {
      mockLoop.tournamentManager = null;

      await forceTournamentStart(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Simulation not initialized'
      });
    });

    it('should force start tournament', async () => {
      const mockTM = {
        startNow: jest.fn().mockResolvedValue({ state: 'ROUND_ACTIVE' })
      };
      mockLoop.tournamentManager = mockTM;

      await forceTournamentStart(mockReq, mockRes);

      expect(mockTM.startNow).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        state: { state: 'ROUND_ACTIVE' }
      });
    });
  });

  describe('cancelTournament', () => {
    it('should cancel tournament and clear matches', async () => {
      const mockTM = { cancel: jest.fn().mockResolvedValue(undefined) };
      mockLoop.tournamentManager = mockTM;
      mockLoop.matches = new Map([[1, {}]]);

      await cancelTournament(mockReq, mockRes);

      expect(mockTM.cancel).toHaveBeenCalled();
      expect(mockLoop.matches.size).toBe(0);
      expect(mockRes.json).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('skipToRound', () => {
    it('should skip to specified round', async () => {
      const mockTM = {
        skipToRound: jest.fn().mockResolvedValue({ state: 'FINAL' }),
        getLiveMatches: jest.fn().mockReturnValue([])
      };
      mockLoop.tournamentManager = mockTM;
      mockReq.body = { round: 'FINAL' };

      await skipToRound(mockReq, mockRes);

      expect(mockTM.skipToRound).toHaveBeenCalledWith('FINAL');
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        state: { state: 'FINAL' }
      });
    });

    it('should return error if round not provided', async () => {
      mockLoop.tournamentManager = {};
      mockReq.body = {};

      await skipToRound(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'round is required' });
    });
  });

  describe('forceScore', () => {
    it('should force set score', () => {
      mockReq.params = { fixtureId: '1' };
      mockReq.body = { home: 3, away: 2 };

      forceScore(mockReq, mockRes);

      expect(mockLoop.forceSetScore).toHaveBeenCalledWith(1, 3, 2);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        score: { home: 3, away: 2 }
      });
    });
  });

  describe('forceEndMatch', () => {
    it('should force end match', () => {
      mockReq.params = { fixtureId: '1' };

      forceEndMatch(mockReq, mockRes);

      expect(mockLoop.forceEndMatch).toHaveBeenCalledWith(1);
      expect(mockRes.json).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('pauseSimulation', () => {
    it('should pause simulation', () => {
      pauseSimulation(mockReq, mockRes);

      expect(mockLoop.pause).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        isPaused: false
      });
    });
  });

  describe('resumeSimulation', () => {
    it('should resume simulation', () => {
      resumeSimulation(mockReq, mockRes);

      expect(mockLoop.resume).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        isPaused: false
      });
    });
  });

  describe('setSpeed', () => {
    it('should set simulation speed', () => {
      mockReq.body = { multiplier: 10 };

      setSpeed(mockReq, mockRes);

      expect(mockLoop.setSpeed).toHaveBeenCalledWith(10);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        speedMultiplier: 1,
        tickIntervalMs: 1000
      });
    });

    it('should reject invalid multiplier', () => {
      mockReq.body = { multiplier: 'fast' };

      setSpeed(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'multiplier must be a positive number'
      });
    });

    it('should reject negative multiplier', () => {
      mockReq.body = { multiplier: -5 };

      setSpeed(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('getFullState', () => {
    it('should return full internal state', () => {
      mockLoop.matches = new Map();

      getFullState(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        loop: expect.any(Object),
        tournament: null,
        matches: [],
        eventBus: expect.any(Object),
        recentEvents: []
      });
    });
  });

  describe('clearEvents', () => {
    it('should clear event buffer', () => {
      mockEventBus.eventBuffer = [1, 2, 3];
      mockEventBus.sequence = 100;

      clearEvents(mockReq, mockRes);

      expect(mockEventBus.eventBuffer).toEqual([]);
      expect(mockEventBus.sequence).toBe(0);
      expect(mockRes.json).toHaveBeenCalledWith({ success: true });
    });
  });
});
