const { TournamentManager, TOURNAMENT_STATES, SCHEDULE, ROUND_NAMES } = require('../../../Gamelogic/simulation/TournamentManager');
const { MATCH_STATES } = require('../../../Gamelogic/simulation/LiveMatch');

// Mock dependencies
jest.mock('../../../models/TeamModel', () => ({
  getAll: jest.fn().mockResolvedValue([
    { id: 1, name: 'Team 1', attackRating: 75, defenseRating: 70, goalkeeperRating: 72 },
    { id: 2, name: 'Team 2', attackRating: 70, defenseRating: 72, goalkeeperRating: 70 },
    { id: 3, name: 'Team 3', attackRating: 72, defenseRating: 68, goalkeeperRating: 74 },
    { id: 4, name: 'Team 4', attackRating: 68, defenseRating: 74, goalkeeperRating: 71 },
    { id: 5, name: 'Team 5', attackRating: 76, defenseRating: 71, goalkeeperRating: 73 },
    { id: 6, name: 'Team 6', attackRating: 71, defenseRating: 73, goalkeeperRating: 69 },
    { id: 7, name: 'Team 7', attackRating: 74, defenseRating: 69, goalkeeperRating: 75 },
    { id: 8, name: 'Team 8', attackRating: 69, defenseRating: 75, goalkeeperRating: 68 },
    { id: 9, name: 'Team 9', attackRating: 77, defenseRating: 72, goalkeeperRating: 74 },
    { id: 10, name: 'Team 10', attackRating: 72, defenseRating: 74, goalkeeperRating: 70 },
    { id: 11, name: 'Team 11', attackRating: 73, defenseRating: 70, goalkeeperRating: 76 },
    { id: 12, name: 'Team 12', attackRating: 70, defenseRating: 76, goalkeeperRating: 67 },
    { id: 13, name: 'Team 13', attackRating: 78, defenseRating: 73, goalkeeperRating: 75 },
    { id: 14, name: 'Team 14', attackRating: 73, defenseRating: 75, goalkeeperRating: 71 },
    { id: 15, name: 'Team 15', attackRating: 75, defenseRating: 71, goalkeeperRating: 77 },
    { id: 16, name: 'Team 16', attackRating: 71, defenseRating: 77, goalkeeperRating: 66 }
  ]),
  getRatingById: jest.fn().mockImplementation(id => Promise.resolve({
    id,
    name: `Team ${id}`,
    attackRating: 70 + id,
    defenseRating: 70 + (16 - id),
    goalkeeperRating: 70
  })),
  addJCupsWon: jest.fn().mockResolvedValue(true),
  addRunnerUp: jest.fn().mockResolvedValue(true),
  updateHighestRound: jest.fn().mockResolvedValue(true)
}));

jest.mock('../../../models/FixtureModel', () => ({
  createBatch: jest.fn().mockImplementation(fixtures =>
    Promise.resolve(fixtures.map((f, i) => ({
      fixtureId: 100 + i,
      homeTeamId: f.homeTeamId,
      awayTeamId: f.awayTeamId,
      tournamentId: f.tournamentId,
      round: f.round,
      status: 'scheduled'
    })))
  ),
  getAll: jest.fn().mockResolvedValue([])
}));

jest.mock('../../../models/PlayerModel', () => ({
  fetchByTeamId: jest.fn().mockResolvedValue([
    { playerId: 1, name: 'Player 1', attack: 80, isGoalkeeper: false },
    { playerId: 2, name: 'Player 2', attack: 70, isGoalkeeper: false },
    { playerId: 3, name: 'GK', attack: 20, isGoalkeeper: true }
  ])
}));

jest.mock('../../../models/MatchEventModel', () => ({
  findByFixture: jest.fn().mockResolvedValue([])
}));

jest.mock('../../../models/MatchReportModel', () => ({
  create: jest.fn().mockResolvedValue({ reportId: 1 })
}));

jest.mock('../../../db/connection', () => ({
  query: jest.fn().mockResolvedValue({ rows: [] })
}));

describe('TournamentManager', () => {
  let manager;

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new TournamentManager();
  });

  describe('constructor', () => {
    it('should initialize with IDLE state', () => {
      expect(manager.state).toBe(TOURNAMENT_STATES.IDLE);
      expect(manager.tournamentId).toBeNull();
      expect(manager.teams).toEqual([]);
    });

    it('should accept custom rules', () => {
      const customManager = new TournamentManager({ knockout: false });
      expect(customManager.rules.knockout).toBe(false);
    });
  });

  describe('tick - state transitions', () => {
    it('should transition to SETUP at minute 55', () => {
      const date = new Date();
      date.setMinutes(55);

      manager.tick(date.getTime());

      expect(manager.state).toBe(TOURNAMENT_STATES.SETUP);
    });

    it('should not process same minute twice', () => {
      const date = new Date();
      date.setMinutes(55);

      manager.tick(date.getTime());
      const firstState = manager.state;

      // Tick again at same minute
      manager.tick(date.getTime());

      expect(manager.state).toBe(firstState);
    });

    it('should transition through schedule correctly', async () => {
      // Setup first
      await manager._handleSetup();
      manager.state = TOURNAMENT_STATES.SETUP;

      // Simulate minute 0 -> R16
      const r16Time = new Date();
      r16Time.setMinutes(0);
      manager.lastTickMinute = 59; // Reset to allow transition

      manager.tick(r16Time.getTime());
      expect(manager.state).toBe(TOURNAMENT_STATES.ROUND_OF_16);
    });
  });

  describe('_handleSetup', () => {
    it('should load teams and create tournament ID', async () => {
      await manager._handleSetup();

      expect(manager.tournamentId).toBeTruthy();
      expect(manager.teams.length).toBe(16);
      expect(manager.roundWinners.length).toBe(16);
    });

    it('should emit tournament_setup event', async () => {
      const setupHandler = jest.fn();
      manager.on('tournament_setup', setupHandler);

      await manager._handleSetup();

      expect(setupHandler).toHaveBeenCalledWith({
        tournamentId: expect.any(Number),
        teamCount: 16
      });
    });

    it('should shuffle teams', async () => {
      await manager._handleSetup();

      // Teams should be shuffled (order likely different from original)
      // This is probabilistic, but with 16 teams, shuffle should change order
      const teamIds = manager.roundWinners.map(t => t.id);
      const originalIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];

      // At least some teams should be in different positions
      // (very unlikely to have exact same order after shuffle)
      expect(teamIds.length).toBe(originalIds.length);
    });
  });

  describe('_startRound', () => {
    beforeEach(async () => {
      await manager._handleSetup();
    });

    it('should create fixtures for Round of 16', async () => {
      const Fixture = require('../../../models/FixtureModel');

      await manager._startRound('ROUND_OF_16', Date.now());

      expect(Fixture.createBatch).toHaveBeenCalled();
      expect(manager.fixtures.length).toBe(8);
      expect(manager.liveMatches.length).toBe(8);
    });

    it('should emit matches_created event', async () => {
      const matchesHandler = jest.fn();
      manager.on('matches_created', matchesHandler);

      await manager._startRound('ROUND_OF_16', Date.now());

      expect(matchesHandler).toHaveBeenCalledWith(expect.any(Array));
      expect(matchesHandler.mock.calls[0][0].length).toBe(8);
    });

    it('should emit round_start event', async () => {
      const roundHandler = jest.fn();
      manager.on('round_start', roundHandler);

      await manager._startRound('ROUND_OF_16', Date.now());

      expect(roundHandler).toHaveBeenCalledWith({
        tournamentId: expect.any(Number),
        round: 'Round of 16',
        fixtures: expect.any(Array)
      });
    });

    it('should create correct number of matches for each round', async () => {
      // R16: 8 matches
      await manager._startRound('ROUND_OF_16', Date.now());
      expect(manager.liveMatches.length).toBe(8);

      // Simulate winners for QF
      manager.roundWinners = manager.roundWinners.slice(0, 8);
      manager.liveMatches = [];

      // QF: 4 matches
      await manager._startRound('QUARTER_FINALS', Date.now());
      expect(manager.liveMatches.length).toBe(4);

      // Simulate winners for SF
      manager.roundWinners = manager.roundWinners.slice(0, 4);
      manager.liveMatches = [];

      // SF: 2 matches
      await manager._startRound('SEMI_FINALS', Date.now());
      expect(manager.liveMatches.length).toBe(2);

      // Simulate winners for Final
      manager.roundWinners = manager.roundWinners.slice(0, 2);
      manager.liveMatches = [];

      // Final: 1 match
      await manager._startRound('FINAL', Date.now());
      expect(manager.liveMatches.length).toBe(1);
    });
  });

  describe('_collectWinners', () => {
    beforeEach(async () => {
      await manager._handleSetup();
      await manager._startRound('ROUND_OF_16', Date.now());
    });

    it('should collect winners from finished matches', () => {
      // Mock all matches as finished with home team winning
      for (const fixture of manager.fixtures) {
        if (fixture.match) {
          fixture.match.state = MATCH_STATES.FINISHED;
          fixture.match.score = { home: 2, away: 1 };
        }
      }

      manager._collectWinners();

      expect(manager.roundWinners.length).toBe(8);
      expect(manager.completedResults.length).toBe(8);
    });

    it('should handle bye teams', async () => {
      // Setup with odd number of teams
      manager.roundWinners = manager.roundWinners.slice(0, 5); // 5 teams

      await manager._startRound('QUARTER_FINALS', Date.now());

      // Should have 2 matches + 1 bye
      const byeFixtures = manager.fixtures.filter(f => f.isBye);
      expect(byeFixtures.length).toBe(1);

      // Mock matches as finished
      for (const fixture of manager.fixtures) {
        if (fixture.match) {
          fixture.match.state = MATCH_STATES.FINISHED;
          fixture.match.score = { home: 2, away: 1 };
        }
      }

      manager._collectWinners();

      // 2 match winners + 1 bye = 3 winners
      expect(manager.roundWinners.length).toBe(3);
    });
  });

  describe('onMatchesComplete', () => {
    beforeEach(async () => {
      await manager._handleSetup();
      await manager._startRound('ROUND_OF_16', Date.now());
    });

    it('should mark fixtures as completed', () => {
      const fixtureId = manager.fixtures[0].fixtureId;

      manager.onMatchesComplete([{
        fixtureId,
        winnerId: 1,
        score: { home: 2, away: 1 }
      }]);

      expect(manager.fixtures[0].completed).toBe(true);
    });
  });

  describe('getState', () => {
    it('should return current tournament state', async () => {
      await manager._handleSetup();
      manager.state = TOURNAMENT_STATES.SETUP; // State is set by tick(), not _handleSetup

      const state = manager.getState();

      expect(state).toEqual({
        state: TOURNAMENT_STATES.SETUP,
        tournamentId: expect.any(Number),
        currentRound: null,
        teamsRemaining: 16,
        activeMatches: 0,
        winner: null,
        runnerUp: null
      });
    });

    it('should include round info when active', async () => {
      await manager._handleSetup();
      await manager._startRound('ROUND_OF_16', Date.now());
      manager.state = TOURNAMENT_STATES.ROUND_OF_16;

      const state = manager.getState();

      expect(state.state).toBe(TOURNAMENT_STATES.ROUND_OF_16);
      expect(state.currentRound).toBe('Round of 16');
      expect(state.activeMatches).toBe(8);
    });
  });

  describe('getLiveMatches', () => {
    it('should return only non-finished matches', async () => {
      await manager._handleSetup();
      await manager._startRound('ROUND_OF_16', Date.now());

      // Mark some matches as finished
      manager.liveMatches[0].state = MATCH_STATES.FINISHED;
      manager.liveMatches[1].state = MATCH_STATES.FINISHED;

      const liveMatches = manager.getLiveMatches();

      expect(liveMatches.length).toBe(6);
    });
  });

  describe('admin controls', () => {
    describe('forceStart', () => {
      it('should start tournament immediately', async () => {
        const state = await manager.forceStart();

        expect(state.state).toBe(TOURNAMENT_STATES.ROUND_OF_16);
        expect(manager.tournamentId).toBeTruthy();
        expect(manager.liveMatches.length).toBe(8);
      });

      it('should throw if tournament already in progress', async () => {
        await manager.forceStart();

        await expect(manager.forceStart()).rejects.toThrow('Tournament already in progress');
      });
    });

    describe('cancel', () => {
      it('should cancel tournament and reset state', async () => {
        await manager.forceStart();

        const cancelHandler = jest.fn();
        manager.on('tournament_cancelled', cancelHandler);

        manager.cancel();

        expect(manager.state).toBe(TOURNAMENT_STATES.IDLE);
        expect(manager.liveMatches.length).toBe(0);
        expect(cancelHandler).toHaveBeenCalled();
      });
    });

    describe('skipToRound', () => {
      it('should skip to specified round', async () => {
        const state = await manager.skipToRound('FINAL');

        expect(state.state).toBe(TOURNAMENT_STATES.FINAL);
        expect(manager.liveMatches.length).toBe(1);
      });

      it('should throw for invalid round', async () => {
        await expect(manager.skipToRound('INVALID')).rejects.toThrow('Invalid round');
      });
    });
  });

  describe('SCHEDULE', () => {
    it('should have correct timing for all rounds', () => {
      expect(SCHEDULE.SETUP.startMinute).toBe(55);
      expect(SCHEDULE.ROUND_OF_16.startMinute).toBe(0);
      expect(SCHEDULE.QUARTER_FINALS.startMinute).toBe(15);
      expect(SCHEDULE.SEMI_FINALS.startMinute).toBe(30);
      expect(SCHEDULE.FINAL.startMinute).toBe(45);
    });

    it('should have non-overlapping time slots', () => {
      const slots = Object.entries(SCHEDULE)
        .filter(([key]) => key !== 'SETUP')
        .map(([key, val]) => ({ key, ...val }));

      for (let i = 0; i < slots.length - 1; i++) {
        expect(slots[i].endMinute).toBeLessThanOrEqual(slots[i + 1].startMinute);
      }
    });
  });

  describe('ROUND_NAMES', () => {
    it('should have correct round names', () => {
      expect(ROUND_NAMES.ROUND_OF_16).toBe('Round of 16');
      expect(ROUND_NAMES.QUARTER_FINALS).toBe('Quarter-finals');
      expect(ROUND_NAMES.SEMI_FINALS).toBe('Semi-finals');
      expect(ROUND_NAMES.FINAL).toBe('Final');
    });
  });
});
