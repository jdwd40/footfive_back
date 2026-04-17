const {
  devAdminOnly,
  startSimulation,
  stopSimulation,
  startTournament,
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
  pause: jest.fn().mockImplementation(function () { this.isPaused = true; }),
  resume: jest.fn().mockImplementation(function () { this.isPaused = false; }),
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

jest.mock('../../../gamelogic/simulation/SimulationLoop', () => ({
  getSimulationLoop: jest.fn(() => mockLoop)
}));

jest.mock('../../../gamelogic/simulation/EventBus', () => ({
  getEventBus: jest.fn(() => mockEventBus)
}));

jest.mock('../../../gamelogic/simulation/TournamentManager', () => ({
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
    it('should allow access when NODE_ENV is not production (no credentials)', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.DEV_ADMIN;
      delete process.env.ADMIN_SECRET;

      devAdminOnly(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should allow access when DEV_ADMIN=true in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.DEV_ADMIN = 'true';

      devAdminOnly(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should allow access with valid X-Admin-Secret in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.DEV_ADMIN = 'false';
      process.env.ADMIN_SECRET = 'secret123';
      mockReq.headers['x-admin-secret'] = 'secret123';

      devAdminOnly(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should deny access in production without dev mode or secret', () => {
      process.env.NODE_ENV = 'production';
      process.env.DEV_ADMIN = 'false';
      delete process.env.ADMIN_SECRET;

      devAdminOnly(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Admin access required',
        hint: 'Set DEV_ADMIN=true in development or provide x-admin-secret header'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should deny access in production with wrong secret', () => {
      process.env.NODE_ENV = 'production';
      process.env.ADMIN_SECRET = 'secret123';
      mockReq.headers['x-admin-secret'] = 'wrongsecret';

      devAdminOnly(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Admin access required',
        hint: 'Set DEV_ADMIN=true in development or provide x-admin-secret header'
      });
    });
  });

  describe('startSimulation', () => {
    it('returns success and state object', async () => {
      await startSimulation(mockReq, mockRes);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        state: expect.any(Object)
      });
    });
  });

  describe('stopSimulation', () => {
    it('returns success and isRunning false', () => {
      stopSimulation(mockReq, mockRes);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        isRunning: false
      });
    });
  });

  describe('startTournament', () => {
    it('should return error if simulation not initialized', async () => {
      mockLoop.tournamentManager = null;

      await startTournament(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Simulation not initialized',
        hint: 'Call POST /api/admin/simulation/start first, then POST /api/admin/tournament/start'
      });
    });

    it('should start tournament', async () => {
      const mockTM = {
        startTournament: jest.fn().mockResolvedValue({ tournamentId: 123, state: 'ROUND_OF_16', teamsCount: 16 }),
        getLiveMatches: jest.fn().mockReturnValue([{ fixtureId: 1 }])
      };
      mockLoop.tournamentManager = mockTM;

      await startTournament(mockReq, mockRes);

      expect(mockTM.startTournament).toHaveBeenCalled();
      expect(mockLoop.registerMatches).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: 'Tournament started',
        tournamentId: 123,
        state: 'ROUND_OF_16',
        teamsCount: 16
      });
    });

    it('returns 400 for tournament already in progress validation error', async () => {
      const mockTM = {
        startTournament: jest.fn().mockRejectedValue(new Error('Cannot start tournament: already in state ROUND_OF_16')),
        getLiveMatches: jest.fn().mockReturnValue([])
      };
      mockLoop.tournamentManager = mockTM;

      await startTournament(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Cannot start tournament: already in state ROUND_OF_16'
      });
    });
  });

  describe('cancelTournament', () => {
    it('returns success', async () => {
      const mockTM = { cancel: jest.fn().mockResolvedValue(undefined) };
      mockLoop.tournamentManager = mockTM;
      mockLoop.matches = new Map([[1, {}]]);

      await cancelTournament(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('skipToRound', () => {
    it('returns success and state when round provided', async () => {
      const mockTM = {
        skipToRound: jest.fn().mockResolvedValue({ state: 'FINAL' }),
        getLiveMatches: jest.fn().mockReturnValue([])
      };
      mockLoop.tournamentManager = mockTM;
      mockReq.body = { round: 'FINAL' };

      await skipToRound(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        state: { state: 'FINAL' }
      });
    });

    it('returns 400 when round not provided', async () => {
      mockLoop.tournamentManager = {};
      mockReq.body = {};

      await skipToRound(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'round is required' });
    });

    it('returns 400 for invalid round validation error', async () => {
      const mockTM = {
        skipToRound: jest.fn().mockRejectedValue(new Error('Invalid round: INVALID')),
        getLiveMatches: jest.fn().mockReturnValue([])
      };
      mockLoop.tournamentManager = mockTM;
      mockReq.body = { round: 'INVALID' };

      await skipToRound(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid round: INVALID' });
    });
  });

  describe('forceScore', () => {
    it('returns success and score on valid request', () => {
      mockReq.params = { fixtureId: '1' };
      mockReq.body = { home: 3, away: 2 };
      forceScore(mockReq, mockRes);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        score: { home: 3, away: 2 }
      });
    });

    it('returns 400 and error when match not found', () => {
      mockReq.params = { fixtureId: '999' };
      mockReq.body = { home: 1, away: 0 };
      mockLoop.forceSetScore.mockImplementationOnce(() => {
        throw new Error('Match 999 not found');
      });
      forceScore(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Match 999 not found' });
    });
  });

  describe('forceEndMatch', () => {
    it('returns success', () => {
      mockReq.params = { fixtureId: '1' };
      forceEndMatch(mockReq, mockRes);
      expect(mockRes.json).toHaveBeenCalledWith({ success: true });
    });

    it('returns 400 and error when match not found', () => {
      mockReq.params = { fixtureId: '999' };
      mockLoop.forceEndMatch.mockImplementationOnce(() => {
        throw new Error('Match 999 not found');
      });
      forceEndMatch(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Match 999 not found' });
    });
  });

  describe('pauseSimulation', () => {
    it('returns success and isPaused true', () => {
      pauseSimulation(mockReq, mockRes);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        isPaused: true
      });
    });
  });

  describe('resumeSimulation', () => {
    it('returns success and isPaused false', () => {
      mockLoop.isPaused = true;
      resumeSimulation(mockReq, mockRes);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        isPaused: false
      });
    });
  });

  describe('setSpeed', () => {
    it('returns success and speed fields for valid multiplier', () => {
      mockReq.body = { multiplier: 10 };
      setSpeed(mockReq, mockRes);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        speedMultiplier: 1,
        tickIntervalMs: 1000
      });
    });

    it('returns 400 for invalid multiplier', () => {
      mockReq.body = { multiplier: 'fast' };

      setSpeed(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'multiplier must be a positive number'
      });
    });

    it('returns 400 for negative multiplier', () => {
      mockReq.body = { multiplier: -5 };
      setSpeed(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('getFullState', () => {
    it('returns loop, tournament, matches, eventBus, recentEvents', () => {
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
    it('returns success', () => {
      mockEventBus.eventBuffer = [1, 2, 3];
      mockEventBus.sequence = 100;
      clearEvents(mockReq, mockRes);
      expect(mockRes.json).toHaveBeenCalledWith({ success: true });
    });
  });
});
