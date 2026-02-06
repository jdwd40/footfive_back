const { SimulationLoop, getSimulationLoop, resetSimulationLoop } = require('../../../Gamelogic/simulation/SimulationLoop');

describe('SimulationLoop', () => {
  let loop;

  beforeEach(() => {
    resetSimulationLoop();
    loop = new SimulationLoop();
  });

  afterEach(() => {
    loop.stop();
  });

  describe('singleton', () => {
    it('should return same instance from getSimulationLoop', () => {
      const instance1 = getSimulationLoop();
      const instance2 = getSimulationLoop();
      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = getSimulationLoop();
      resetSimulationLoop();
      const instance2 = getSimulationLoop();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('lifecycle', () => {
    it('should start and emit started event', async () => {
      const startedHandler = jest.fn();
      loop.on('started', startedHandler);

      await loop.start();

      expect(loop.isRunning).toBe(true);
      expect(loop.isPaused).toBe(false);
      expect(startedHandler).toHaveBeenCalled();
    });

    it('should not start twice', async () => {
      await loop.start();
      const firstStartedAt = loop.startedAt;

      await loop.start();

      expect(loop.startedAt).toBe(firstStartedAt);
    });

    it('should stop and emit stopped event', async () => {
      const stoppedHandler = jest.fn();
      loop.on('stopped', stoppedHandler);

      await loop.start();
      loop.stop();

      expect(loop.isRunning).toBe(false);
      expect(stoppedHandler).toHaveBeenCalled();
    });

    it('should pause and resume', async () => {
      const pausedHandler = jest.fn();
      const resumedHandler = jest.fn();
      loop.on('paused', pausedHandler);
      loop.on('resumed', resumedHandler);

      await loop.start();

      loop.pause();
      expect(loop.isPaused).toBe(true);
      expect(pausedHandler).toHaveBeenCalled();

      loop.resume();
      expect(loop.isPaused).toBe(false);
      expect(resumedHandler).toHaveBeenCalled();
    });
  });

  describe('speed control', () => {
    it('should set speed multiplier', () => {
      loop.setSpeed(10);
      expect(loop.speedMultiplier).toBe(10);
      expect(loop.tickIntervalMs).toBe(100);
    });

    it('should clamp speed between 0.1 and 100', () => {
      loop.setSpeed(0.01);
      expect(loop.speedMultiplier).toBe(0.1);

      loop.setSpeed(1000);
      expect(loop.speedMultiplier).toBe(100);
    });
  });

  describe('tick', () => {
    it('should increment tick count', async () => {
      await loop.start();

      // Manually call tick
      loop.tick();
      loop.tick();
      loop.tick();

      expect(loop.tickCount).toBe(3);
    });

    it('should not tick when paused', async () => {
      await loop.start();

      loop.pause();
      const tickCountBefore = loop.tickCount;

      loop.tick();
      loop.tick();

      expect(loop.tickCount).toBe(tickCountBefore);
    });
  });

  describe('match management', () => {
    it('should register and unregister matches', () => {
      const mockMatch = {
        fixtureId: 123,
        isFinished: () => false
      };

      loop.registerMatch(mockMatch);
      expect(loop.matches.size).toBe(1);
      expect(loop.getMatch(123)).toBe(mockMatch);

      loop.unregisterMatch(123);
      expect(loop.matches.size).toBe(0);
    });

    it('should register multiple matches', () => {
      const mockMatches = [
        { fixtureId: 1, isFinished: () => false },
        { fixtureId: 2, isFinished: () => false },
        { fixtureId: 3, isFinished: () => false }
      ];

      loop.registerMatches(mockMatches);
      expect(loop.matches.size).toBe(3);
    });

    it('should clear finished matches', async () => {
      const matches = [
        { fixtureId: 1, isFinished: () => false, awaitFinalization: async () => {} },
        { fixtureId: 2, isFinished: () => true, awaitFinalization: async () => {} },
        { fixtureId: 3, isFinished: () => false, awaitFinalization: async () => {} }
      ];

      loop.registerMatches(matches);
      await loop.clearFinishedMatches();

      expect(loop.matches.size).toBe(2);
      expect(loop.getMatch(2)).toBeUndefined();
    });
  });

  describe('state', () => {
    it('should return current state', async () => {
      await loop.start();

      const state = loop.getState();

      expect(state.isRunning).toBe(true);
      expect(state.isPaused).toBe(false);
      expect(state.tickCount).toBe(0);
      expect(state.speedMultiplier).toBe(1);
      expect(state.activeMatches).toEqual([]);
    });

    it('should include match states', () => {
      const mockMatch = {
        fixtureId: 42,
        state: 'FIRST_HALF',
        tickElapsed: 100,
        getMatchMinute: () => 23,
        getScore: () => ({ home: 1, away: 0 }),
        isFinished: () => false
      };

      loop.registerMatch(mockMatch);
      const state = loop.getState();

      expect(state.activeMatches).toHaveLength(1);
      expect(state.activeMatches[0]).toEqual({
        fixtureId: 42,
        state: 'FIRST_HALF',
        minute: 23,
        score: { home: 1, away: 0 },
        tickElapsed: 100
      });
    });
  });

  describe('events', () => {
    it('should emit events from matches through event bus', async () => {
      const eventHandler = jest.fn();
      loop.on('event', eventHandler);

      const mockMatch = {
        fixtureId: 1,
        isFinished: () => false,
        tick: () => [{ type: 'goal', minute: 15 }]
      };

      loop.registerMatch(mockMatch);
      await loop.start();
      loop.tick();

      expect(eventHandler).toHaveBeenCalledWith({ type: 'goal', minute: 15 });
    });

    it('should emit through event bus if configured', async () => {
      const mockEventBus = { emit: jest.fn() };
      loop.init({ eventBus: mockEventBus });

      const mockMatch = {
        fixtureId: 1,
        isFinished: () => false,
        tick: () => [{ type: 'goal' }]
      };

      loop.registerMatch(mockMatch);
      await loop.start();
      loop.tick();

      expect(mockEventBus.emit).toHaveBeenCalledWith({ type: 'goal' });
    });
  });

  describe('match completion', () => {
    it('should notify tournament manager when matches complete', async () => {
      const mockTournamentManager = {
        on: jest.fn(),
        tick: jest.fn(),
        onMatchFinalized: jest.fn().mockResolvedValue(undefined),
        recover: jest.fn().mockResolvedValue(false)
      };

      loop.init({ tournamentManager: mockTournamentManager });

      const mockMatch = {
        fixtureId: 1,
        isFinished: () => true,
        completionNotified: false,
        getWinnerId: () => 5,
        getScore: () => ({ home: 2, away: 1 }),
        getPenaltyScore: () => null,
        tick: () => []
      };

      loop.registerMatch(mockMatch);
      await loop.start();
      loop.tick();

      expect(mockTournamentManager.onMatchFinalized).toHaveBeenCalledWith({
        fixtureId: 1,
        winnerId: 5,
        score: { home: 2, away: 1 },
        penaltyScore: null
      });
    });

    it('should only notify once per match', async () => {
      const mockTournamentManager = {
        on: jest.fn(),
        tick: jest.fn(),
        onMatchFinalized: jest.fn().mockResolvedValue(undefined),
        recover: jest.fn().mockResolvedValue(false)
      };

      loop.init({ tournamentManager: mockTournamentManager });

      const mockMatch = {
        fixtureId: 1,
        isFinished: () => true,
        completionNotified: false,
        getWinnerId: () => 5,
        getScore: () => ({ home: 2, away: 1 }),
        getPenaltyScore: () => null,
        tick: () => []
      };

      loop.registerMatch(mockMatch);
      await loop.start();

      loop.tick();
      loop.tick();
      loop.tick();

      expect(mockTournamentManager.onMatchFinalized).toHaveBeenCalledTimes(1);
    });
  });
});
