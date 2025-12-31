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
jest.mock('../../../Gamelogic/simulation/EventBus', () => ({
  getEventBus: jest.fn(() => mockEventBus)
}));

jest.mock('../../../Gamelogic/simulation/SimulationLoop', () => ({
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
    it('should setup SSE connection', () => {
      streamEvents(mockReq, mockRes);

      expect(mockEventBus.addClient).toHaveBeenCalledWith(mockRes, {});
    });

    it('should pass filters from query params', () => {
      mockReq.query = { tournamentId: '100', fixtureId: '1' };
      streamEvents(mockReq, mockRes);

      expect(mockEventBus.addClient).toHaveBeenCalledWith(mockRes, {
        tournamentId: 100,
        fixtureId: 1
      });
    });

    it('should send catchup if afterSeq provided', () => {
      mockReq.query = { afterSeq: '5' };
      streamEvents(mockReq, mockRes);

      expect(mockEventBus.sendCatchup).toHaveBeenCalledWith('client_1', 5);
    });
  });

  describe('getTournamentState', () => {
    it('should return tournament state', () => {
      getTournamentState(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        state: 'ROUND_OF_16',
        tournamentId: 12345,
        currentRound: 'Round of 16',
        lastCompleted: null
      });
    });
  });

  describe('getActiveMatches', () => {
    it('should return all active matches', () => {
      getActiveMatches(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        matches: [{
          fixtureId: 1,
          state: 'FIRST_HALF',
          minute: 23,
          score: { home: 1, away: 0 },
          penaltyScore: null,
          homeTeam: { id: 1, name: 'Home FC' },
          awayTeam: { id: 2, name: 'Away United' },
          isFinished: false
        }],
        count: 1
      });
    });
  });

  describe('getMatchState', () => {
    it('should return match state for valid fixture', () => {
      mockReq.params = { fixtureId: '1' };

      getMatchState(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        fixtureId: 1,
        state: 'FIRST_HALF',
        minute: 23,
        score: { home: 1, away: 0 }
      }));
    });

    it('should return 404 for unknown fixture', () => {
      mockReq.params = { fixtureId: '999' };

      getMatchState(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Match not found or not active' });
    });
  });

  describe('getRecentEvents', () => {
    it('should return recent events', () => {
      getRecentEvents(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        events: expect.any(Array),
        count: 2
      });
    });

    it('should pass filters to eventBus', () => {
      mockReq.query = { fixtureId: '1', type: 'goal', limit: '50' };
      getRecentEvents(mockReq, mockRes);

      expect(mockEventBus.getRecentEvents).toHaveBeenCalledWith(
        { fixtureId: 1, type: 'goal' },
        50
      );
    });
  });

  describe('getStatus', () => {
    it('should return full status', () => {
      getStatus(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        simulation: {
          isRunning: true,
          isPaused: false,
          tickCount: 100,
          speedMultiplier: 1,
          activeMatches: 1
        },
        eventBus: {
          eventsEmitted: 10,
          clientsConnected: 2
        },
        tournament: {
          state: 'ROUND_OF_16',
          tournamentId: 12345,
          currentRound: 'Round of 16',
          lastCompleted: null
        },
        lastCompleted: null
      });
    });
  });
});
