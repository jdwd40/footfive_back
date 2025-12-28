const { EventBus, getEventBus, resetEventBus } = require('../../../Gamelogic/simulation/EventBus');

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

  describe('SSE clients', () => {
    let mockRes;

    beforeEach(() => {
      mockRes = {
        writeHead: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        on: jest.fn()
      };
    });

    describe('addClient', () => {
      it('should setup SSE headers', () => {
        eventBus.addClient(mockRes);

        expect(mockRes.writeHead).toHaveBeenCalledWith(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no'
        });
      });

      it('should return client ID', () => {
        const clientId = eventBus.addClient(mockRes);
        expect(clientId).toMatch(/^client_\d+$/);
      });

      it('should send connected event', () => {
        eventBus.addClient(mockRes);

        expect(mockRes.write).toHaveBeenCalledWith('event: connected\n');
        expect(mockRes.write).toHaveBeenCalledWith(expect.stringContaining('data: '));
      });

      it('should register close handler', () => {
        eventBus.addClient(mockRes);
        expect(mockRes.on).toHaveBeenCalledWith('close', expect.any(Function));
      });

      it('should track client count', () => {
        eventBus.addClient(mockRes);
        expect(eventBus.stats.clientsConnected).toBe(1);

        const mockRes2 = { ...mockRes, on: jest.fn() };
        eventBus.addClient(mockRes2);
        expect(eventBus.stats.clientsConnected).toBe(2);
      });
    });

    describe('removeClient', () => {
      it('should remove client', () => {
        const clientId = eventBus.addClient(mockRes);
        expect(eventBus.clients.size).toBe(1);

        eventBus.removeClient(clientId);
        expect(eventBus.clients.size).toBe(0);
      });

      it('should update stats', () => {
        const clientId = eventBus.addClient(mockRes);
        eventBus.removeClient(clientId);

        expect(eventBus.stats.clientsConnected).toBe(0);
      });
    });

    describe('broadcast', () => {
      it('should broadcast to all clients', () => {
        const mockRes2 = { writeHead: jest.fn(), write: jest.fn(), on: jest.fn() };

        eventBus.addClient(mockRes);
        eventBus.addClient(mockRes2);

        // Clear initial connection writes
        mockRes.write.mockClear();
        mockRes2.write.mockClear();

        eventBus.emit({ type: 'goal', fixtureId: 1 });

        expect(mockRes.write).toHaveBeenCalled();
        expect(mockRes2.write).toHaveBeenCalled();
      });

      it('should filter by fixtureId', () => {
        const mockRes2 = { writeHead: jest.fn(), write: jest.fn(), on: jest.fn() };

        eventBus.addClient(mockRes, { fixtureId: 1 });
        eventBus.addClient(mockRes2, { fixtureId: 2 });

        mockRes.write.mockClear();
        mockRes2.write.mockClear();

        eventBus.emit({ type: 'goal', fixtureId: 1 });

        expect(mockRes.write).toHaveBeenCalled();
        expect(mockRes2.write).not.toHaveBeenCalled();
      });

      it('should filter by tournamentId', () => {
        const mockRes2 = { writeHead: jest.fn(), write: jest.fn(), on: jest.fn() };

        eventBus.addClient(mockRes, { tournamentId: 100 });
        eventBus.addClient(mockRes2, { tournamentId: 200 });

        mockRes.write.mockClear();
        mockRes2.write.mockClear();

        eventBus.emit({ type: 'round_start', tournamentId: 100 });

        expect(mockRes.write).toHaveBeenCalled();
        expect(mockRes2.write).not.toHaveBeenCalled();
      });
    });

    describe('sendCatchup', () => {
      it('should send missed events', () => {
        eventBus.emit({ type: 'goal', fixtureId: 1 });
        eventBus.emit({ type: 'foul', fixtureId: 1 });
        eventBus.emit({ type: 'goal', fixtureId: 1 });

        const clientId = eventBus.addClient(mockRes);
        mockRes.write.mockClear();

        eventBus.sendCatchup(clientId, 0); // Get events after seq 0

        // Should receive 2 events (seq 1 and 2)
        expect(mockRes.write).toHaveBeenCalledTimes(4); // 2 events * 2 writes each
      });

      it('should respect client filters in catchup', () => {
        eventBus.emit({ type: 'goal', fixtureId: 1 });
        eventBus.emit({ type: 'goal', fixtureId: 2 });

        const clientId = eventBus.addClient(mockRes, { fixtureId: 1 });
        mockRes.write.mockClear();

        eventBus.sendCatchup(clientId, -1);

        // Should only receive fixture 1 event
        expect(mockRes.write).toHaveBeenCalledTimes(2); // 1 event * 2 writes
      });
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
    it('should reset all state', () => {
      eventBus.emit({ type: 'test' });
      eventBus.emit({ type: 'test' });

      const mockRes = {
        writeHead: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        on: jest.fn()
      };
      eventBus.addClient(mockRes);

      eventBus.clear();

      expect(eventBus.eventBuffer.length).toBe(0);
      expect(eventBus.clients.size).toBe(0);
      expect(eventBus.sequence).toBe(0);
      expect(eventBus.stats.eventsEmitted).toBe(0);
    });

    it('should close client connections', () => {
      const mockRes = {
        writeHead: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        on: jest.fn()
      };

      eventBus.addClient(mockRes);
      eventBus.clear();

      expect(mockRes.end).toHaveBeenCalled();
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
