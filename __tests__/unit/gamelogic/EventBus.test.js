const { EventBus, getEventBus, resetEventBus } = require('../../../gamelogic/simulation/EventBus');

// Mock MatchEvent model
jest.mock('../../../models/MatchEventModel', () => ({
  create: jest.fn().mockResolvedValue({ eventId: 1 })
}));

describe('EventBus', () => {
  let eventBus;

  beforeEach(() => {
    resetEventBus();
    eventBus = new EventBus();
  });

  afterEach(() => {
    eventBus.clear();
  });

  describe('singleton', () => {
    it('should return same instance from getEventBus', () => {
      const instance1 = getEventBus();
      const instance2 = getEventBus();
      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = getEventBus();
      resetEventBus();
      const instance2 = getEventBus();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('emit', () => {
    it('should add sequence number to events', () => {
      const event1 = eventBus.emit({ type: 'test', data: 'first' });
      const event2 = eventBus.emit({ type: 'test', data: 'second' });

      expect(event1.seq).toBe(0);
      expect(event2.seq).toBe(1);
    });

    it('should add server timestamp', () => {
      const before = Date.now();
      const event = eventBus.emit({ type: 'test' });
      const after = Date.now();

      expect(event.serverTimestamp).toBeGreaterThanOrEqual(before);
      expect(event.serverTimestamp).toBeLessThanOrEqual(after);
    });

    it('should emit on EventEmitter', () => {
      const handler = jest.fn();
      eventBus.on('event', handler);

      eventBus.emit({ type: 'goal', fixtureId: 1 });

      expect(handler).toHaveBeenCalled();
    });

    it('should emit typed events', () => {
      const goalHandler = jest.fn();
      eventBus.on('goal', goalHandler);

      eventBus.emit({ type: 'goal', fixtureId: 1 });

      expect(goalHandler).toHaveBeenCalled();
    });

    it('should update stats', () => {
      eventBus.emit({ type: 'test' });
      eventBus.emit({ type: 'test' });

      expect(eventBus.stats.eventsEmitted).toBe(2);
    });
  });

  describe('event buffer', () => {
    it('should store events in buffer', () => {
      eventBus.emit({ type: 'event1' });
      eventBus.emit({ type: 'event2' });
      eventBus.emit({ type: 'event3' });

      expect(eventBus.eventBuffer.length).toBe(3);
    });

    it('should trim buffer when exceeding max size', () => {
      eventBus.maxBufferSize = 5;

      for (let i = 0; i < 10; i++) {
        eventBus.emit({ type: 'test', index: i });
      }

      expect(eventBus.eventBuffer.length).toBe(5);
      expect(eventBus.eventBuffer[0].index).toBe(5); // First 5 should be trimmed
    });
  });

  describe('getRecentEvents', () => {
    beforeEach(() => {
      eventBus.emit({ type: 'goal', fixtureId: 1, tournamentId: 100 });
      eventBus.emit({ type: 'foul', fixtureId: 1, tournamentId: 100 });
      eventBus.emit({ type: 'goal', fixtureId: 2, tournamentId: 100 });
      eventBus.emit({ type: 'halftime', fixtureId: 1, tournamentId: 100 });
    });

    it('should return all events without filters', () => {
      const events = eventBus.getRecentEvents();
      expect(events.length).toBe(4);
    });

    it('should filter by fixtureId', () => {
      const events = eventBus.getRecentEvents({ fixtureId: 1 });
      expect(events.length).toBe(3);
    });

    it('should filter by type', () => {
      const events = eventBus.getRecentEvents({ type: 'goal' });
      expect(events.length).toBe(2);
    });

    it('should filter by afterSeq', () => {
      const events = eventBus.getRecentEvents({ afterSeq: 1 });
      expect(events.length).toBe(2);
      expect(events[0].seq).toBe(2);
    });

    it('should respect limit', () => {
      const events = eventBus.getRecentEvents({}, 2);
      expect(events.length).toBe(2);
    });
  });

  describe('persistence', () => {
    const MatchEvent = require('../../../models/MatchEventModel');

    beforeEach(() => {
      MatchEvent.create.mockClear();
    });

    it('should persist goal events', async () => {
      eventBus.emit({
        type: 'goal',
        fixtureId: 1,
        minute: 23,
        teamId: 5,
        playerId: 10,
        displayName: 'Test Player'
      });

      // Wait for async persistence
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(MatchEvent.create).toHaveBeenCalled();
    });

    it('should persist halftime events', async () => {
      eventBus.emit({
        type: 'halftime',
        fixtureId: 1,
        minute: 45
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(MatchEvent.create).toHaveBeenCalled();
    });

    it('should not persist non-match events', async () => {
      eventBus.emit({
        type: 'tournament_setup',
        tournamentId: 100
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(MatchEvent.create).not.toHaveBeenCalled();
    });

    it('should not persist events without fixtureId', async () => {
      eventBus.emit({
        type: 'goal',
        minute: 23
        // No fixtureId
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(MatchEvent.create).not.toHaveBeenCalled();
    });

    it('should update persistedEvents stat', async () => {
      eventBus.emit({ type: 'goal', fixtureId: 1 });
      eventBus.emit({ type: 'goal', fixtureId: 1 });

      await new Promise(resolve => setTimeout(resolve, 20));

      expect(eventBus.stats.eventsPersisted).toBe(2);
    });
  });

  describe('getStats', () => {
    it('should return current stats', () => {
      eventBus.emit({ type: 'test' });
      eventBus.emit({ type: 'test' });

      const stats = eventBus.getStats();

      expect(stats.eventsEmitted).toBe(2);
      expect(stats.bufferSize).toBe(2);
      expect(stats.currentSequence).toBe(2);
      expect(stats.clientsConnected).toBe(0);
    });
  });

  describe('clear', () => {
    it('should reset event buffer and sequence', () => {
      eventBus.emit({ type: 'test' });
      eventBus.emit({ type: 'test' });

      eventBus.clear();

      expect(eventBus.eventBuffer.length).toBe(0);
      expect(eventBus.sequence).toBe(0);
      expect(eventBus.stats.eventsEmitted).toBe(0);
    });
  });

  describe('_isPersistableEvent', () => {
    it('should return true for match events', () => {
      const persistableTypes = [
        'goal', 'penalty_scored', 'halftime', 'fulltime',
        'shootout_goal', 'match_start', 'match_end'
      ];

      for (const type of persistableTypes) {
        expect(eventBus._isPersistableEvent({ type })).toBe(true);
      }
    });

    it('should return false for non-match events', () => {
      const nonPersistableTypes = [
        'tournament_setup', 'round_start', 'round_complete',
        'connected', 'test'
      ];

      for (const type of nonPersistableTypes) {
        expect(eventBus._isPersistableEvent({ type })).toBe(false);
      }
    });
  });
});
