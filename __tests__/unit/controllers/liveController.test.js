const {
  streamEvents,
  getTournamentState,
  getActiveMatches,
  getMatchState,
  getRecentEvents,
  getStatus
} = require('../../../controllers/liveController');

// Create mock eventBus that persists across tests
const mockEventBus = {
  addClient: jest.fn().mockReturnValue('client_1'),
  sendCatchup: jest.fn(),
  getRecentEvents: jest.fn().mockReturnValue([
    { type: 'goal', fixtureId: 1, seq: 0 },
    { type: 'halftime', fixtureId: 1, seq: 1 }
  ]),
  getStats: jest.fn().mockReturnValue({
    eventsEmitted: 10,
    clientsConnected: 2
  })
};

// Mock simulation modules
jest.mock('../../../gamelogic/simulation/EventBus', () => ({
  getEventBus: jest.fn(() => mockEventBus)
}));

jest.mock('../../../gamelogic/simulation/SimulationLoop', () => ({
  getSimulationLoop: jest.fn(() => ({
    isRunning: true,
    isPaused: false,
    tickCount: 100,
    speedMultiplier: 1,
    matches: new Map([
      [1, {
        fixtureId: 1,
        state: 'FIRST_HALF',
        tickElapsed: 50,
        homeTeam: { id: 1, name: 'Home FC' },
        awayTeam: { id: 2, name: 'Away United' },
        getMatchMinute: () => 23,
        getScore: () => ({ home: 1, away: 0 }),
        getPenaltyScore: () => null,
        isFinished: () => false,
        stats: { home: {}, away: {} }
      }]
    ]),
    getMatch: jest.fn((id) => {
      if (id === 1) {
        return {
          state: 'FIRST_HALF',
          tickElapsed: 50,
          homeTeam: { id: 1, name: 'Home FC' },
          awayTeam: { id: 2, name: 'Away United' },
          getMatchMinute: () => 23,
          getScore: () => ({ home: 1, away: 0 }),
          getPenaltyScore: () => null,
          isFinished: () => false,
          stats: { home: {}, away: {} }
        };
      }
      return null;
    }),
    tournamentManager: {
      getState: jest.fn().mockReturnValue({
        state: 'ROUND_OF_16',
        tournamentId: 12345,
        currentRound: 'Round of 16',
        lastCompleted: null
      })
    }
  }))
}));

describe('liveController', () => {
  let mockReq;
  let mockRes;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReq = {
      query: {},
      params: {}
    };
    mockRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
      writeHead: jest.fn(),
      write: jest.fn(),
      on: jest.fn()
    };
  });

  describe('streamEvents', () => {
    it('registers client with parsed filters and sends catchup when afterSeq provided', () => {
      mockReq.query = { tournamentId: '100', fixtureId: '1', afterSeq: '5' };
      streamEvents(mockReq, mockRes);
      expect(mockEventBus.addClient).toHaveBeenCalledWith(mockRes, {
        tournamentId: 100,
        fixtureId: 1
      });
      expect(mockEventBus.sendCatchup).toHaveBeenCalledWith('client_1', 5);
    });

    it('registers client with empty filters when no query params', () => {
      streamEvents(mockReq, mockRes);
      expect(mockEventBus.addClient).toHaveBeenCalledWith(mockRes, {});
    });
  });

  describe('getTournamentState', () => {
    it('returns state, tournamentId, currentRound, lastCompleted', () => {
      getTournamentState(mockReq, mockRes);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          state: expect.any(String),
          tournamentId: expect.any(Number),
          currentRound: expect.any(String)
        })
      );
    });
  });

  describe('getActiveMatches', () => {
    it('returns matches array and count', () => {
      getActiveMatches(mockReq, mockRes);
      expect(mockRes.json).toHaveBeenCalledWith({
        matches: expect.any(Array),
        count: expect.any(Number)
      });
    });
  });

  describe('getMatchState', () => {
    it('returns match with fixtureId, state, minute, score for valid fixture', () => {
      mockReq.params = { fixtureId: '1' };
      getMatchState(mockReq, mockRes);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        fixtureId: 1,
        state: expect.any(String),
        minute: expect.any(Number),
        score: expect.any(Object)
      }));
    });

    it('returns 404 for unknown fixture', () => {
      mockReq.params = { fixtureId: '999' };
      getMatchState(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Match not found or not active' });
    });
  });

  describe('getRecentEvents', () => {
    it('returns events array and count', () => {
      getRecentEvents(mockReq, mockRes);
      expect(mockRes.json).toHaveBeenCalledWith({
        events: expect.any(Array),
        count: expect.any(Number)
      });
    });

    it('passes parsed filters and limit to eventBus', () => {
      mockReq.query = { fixtureId: '1', type: 'goal', limit: '50' };
      getRecentEvents(mockReq, mockRes);
      expect(mockEventBus.getRecentEvents).toHaveBeenCalledWith(
        { fixtureId: 1, type: 'goal' },
        50
      );
    });
  });

  describe('getStatus', () => {
    it('returns simulation, eventBus, tournament, lastCompleted', () => {
      getStatus(mockReq, mockRes);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          simulation: expect.any(Object),
          eventBus: expect.any(Object),
          tournament: expect.any(Object)
        })
      );
    });
  });
});
