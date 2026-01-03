const EventEmitter = require('events');
const MatchEvent = require('../../models/MatchEventModel');

/**
 * EventBus - Central event hub for live simulation
 *
 * Responsibilities:
 * - Receive events from LiveMatch and TournamentManager
 * - Persist match events to database
 * - Broadcast to SSE-connected clients
 * - Maintain event sequence ordering
 */
class EventBus extends EventEmitter {
  constructor() {
    super();

    // SSE client connections: Map<clientId, { res, filters }>
    this.clients = new Map();
    this.clientIdCounter = 0;

    // Event sequence for ordering
    this.sequence = 0;

    // Event history buffer (for replay/catchup)
    this.eventBuffer = [];
    this.maxBufferSize = 1000;

    // Stats
    this.stats = {
      eventsEmitted: 0,
      eventsPersisted: 0,
      clientsConnected: 0
    };
  }

  /**
   * Emit an event to all listeners and SSE clients
   * @param {Object} event - Event object from LiveMatch or TournamentManager
   */
  emit(event) {
    // Add sequence and timestamp
    const enrichedEvent = {
      ...event,
      seq: this.sequence++,
      serverTimestamp: Date.now()
    };

    this.stats.eventsEmitted++;

    // Add to buffer
    this._addToBuffer(enrichedEvent);

    // Persist to DB if it's a match event
    if (event.fixtureId && this._isPersistableEvent(event)) {
      this._persistEvent(enrichedEvent);
    }

    // Broadcast to SSE clients
    this._broadcastToClients(enrichedEvent);

    // Emit on EventEmitter for internal listeners
    super.emit('event', enrichedEvent);
    super.emit(event.type, enrichedEvent);

    return enrichedEvent;
  }

  /**
   * Register an SSE client connection
   * @param {Response} res - Express response object
   * @param {Object} filters - Optional filters { tournamentId, fixtureId }
   * @returns {string} Client ID
   */
  addClient(res, filters = {}) {
    const clientId = `client_${++this.clientIdCounter}`;

    // Setup SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // Disable nginx buffering
    });
    res.flushHeaders();

    // Disable Nagle algorithm for immediate sends
    if (res.socket) {
      res.socket.setNoDelay(true);
    }

    // Send initial connection event
    this._sendToClient(res, {
      type: 'connected',
      clientId,
      seq: this.sequence,
      serverTimestamp: Date.now()
    });

    // Store client
    this.clients.set(clientId, { res, filters });
    this.stats.clientsConnected = this.clients.size;

    // Handle client disconnect
    res.on('close', () => {
      this.removeClient(clientId);
    });

    console.log(`[EventBus] Client ${clientId} connected. Total: ${this.clients.size}`);

    return clientId;
  }

  /**
   * Remove a client connection
   */
  removeClient(clientId) {
    const client = this.clients.get(clientId);
    if (client) {
      this.clients.delete(clientId);
      this.stats.clientsConnected = this.clients.size;
      console.log(`[EventBus] Client ${clientId} disconnected. Total: ${this.clients.size}`);
    }
  }

  /**
   * Send catchup events to a client (for reconnection)
   * @param {string} clientId - Client ID
   * @param {number} afterSeq - Sequence number to start from
   */
  sendCatchup(clientId, afterSeq) {
    const client = this.clients.get(clientId);
    if (!client) return;

    const missedEvents = this.eventBuffer.filter(e => e.seq > afterSeq);

    for (const event of missedEvents) {
      if (this._matchesFilters(event, client.filters)) {
        this._sendToClient(client.res, event);
      }
    }
  }

  /**
   * Get recent events from buffer
   * @param {Object} filters - Optional filters
   * @param {number} limit - Max events to return
   */
  getRecentEvents(filters = {}, limit = 100) {
    let events = this.eventBuffer;

    if (filters.fixtureId) {
      events = events.filter(e => e.fixtureId === filters.fixtureId);
    }
    if (filters.tournamentId) {
      events = events.filter(e => e.tournamentId === filters.tournamentId);
    }
    if (filters.afterSeq !== undefined) {
      events = events.filter(e => e.seq > filters.afterSeq);
    }
    if (filters.type) {
      events = events.filter(e => e.type === filters.type);
    }

    return events.slice(-limit);
  }

  /**
   * Broadcast to all connected SSE clients
   */
  _broadcastToClients(event) {
    const clientCount = this.clients.size;
    if (clientCount > 0) {
      console.log(`[EventBus] Broadcasting ${event.type} (seq ${event.seq}) to ${clientCount} clients`);
    }
    for (const [clientId, client] of this.clients) {
      if (this._matchesFilters(event, client.filters)) {
        this._sendToClient(client.res, event);
      }
    }
  }

  /**
   * Check if event matches client filters
   */
  _matchesFilters(event, filters) {
    if (!filters || Object.keys(filters).length === 0) {
      return true;
    }

    if (filters.fixtureId && event.fixtureId !== filters.fixtureId) {
      return false;
    }
    if (filters.tournamentId && event.tournamentId !== filters.tournamentId) {
      return false;
    }

    return true;
  }

  /**
   * Send event to single client via SSE
   */
  _sendToClient(res, event) {
    try {
      if (!res.writable) {
        console.warn(`[EventBus] Response not writable for event ${event.type}`);
        return false;
      }
      const data = JSON.stringify(event);
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${data}\n\n`);
      // Flush to ensure SSE events are sent immediately
      if (res.flush) res.flush();
      return true;
    } catch (err) {
      // Client likely disconnected
      console.error('[EventBus] Error sending to client:', err.message);
      return false;
    }
  }

  /**
   * Add event to circular buffer
   */
  _addToBuffer(event) {
    this.eventBuffer.push(event);

    // Trim buffer if too large
    if (this.eventBuffer.length > this.maxBufferSize) {
      this.eventBuffer = this.eventBuffer.slice(-this.maxBufferSize);
    }
  }

  /**
   * Check if event should be persisted to DB
   */
  _isPersistableEvent(event) {
    const persistableTypes = [
      'goal', 'penalty_scored', 'penalty_missed', 'penalty_saved',
      'shot_saved', 'shot_missed', 'shot_blocked',
      'foul', 'yellow_card', 'red_card',
      'halftime', 'fulltime', 'second_half_start',
      'extra_time_start', 'extra_time_half', 'extra_time_end',
      'shootout_start', 'shootout_goal', 'shootout_miss', 'shootout_save', 'shootout_end',
      'match_start', 'match_end'
    ];

    return persistableTypes.includes(event.type);
  }

  /**
   * Persist event to database
   */
  async _persistEvent(event) {
    try {
      // Map event to DB schema
      const dbEvent = {
        fixtureId: event.fixtureId,
        minute: event.minute || 0,
        second: event.second || 0,
        eventType: event.type,
        teamId: event.teamId || null,
        playerId: event.playerId || null,
        assistPlayerId: event.assistPlayerId || null,
        description: event.description || null,
        xg: event.xg || null,
        outcome: event.outcome || null,
        bundleId: event.bundleId || null,
        bundleStep: event.bundleStep || null,
        metadata: {
          displayName: event.displayName,
          assistName: event.assistName,
          score: event.score,
          shootoutScore: event.shootoutScore,
          round: event.round,
          seq: event.seq
        }
      };

      await MatchEvent.create(dbEvent);
      this.stats.eventsPersisted++;
    } catch (err) {
      console.error('[EventBus] Failed to persist event:', err.message);
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      bufferSize: this.eventBuffer.length,
      currentSequence: this.sequence
    };
  }

  /**
   * Clear all state (for testing)
   */
  clear() {
    // Close all client connections
    for (const [clientId, client] of this.clients) {
      try {
        client.res.end();
      } catch (e) {
        // Ignore
      }
    }

    this.clients.clear();
    this.eventBuffer = [];
    this.sequence = 0;
    this.stats = {
      eventsEmitted: 0,
      eventsPersisted: 0,
      clientsConnected: 0
    };
  }
}

// Singleton instance
let instance = null;

function getEventBus() {
  if (!instance) {
    instance = new EventBus();
  }
  return instance;
}

function resetEventBus() {
  if (instance) {
    instance.clear();
    instance = null;
  }
}

module.exports = {
  EventBus,
  getEventBus,
  resetEventBus
};
