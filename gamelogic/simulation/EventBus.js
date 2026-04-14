const EventEmitter = require('events');
const MatchEvent = require('../../models/MatchEventModel');
const {
  EVENT_TYPE_TO_CATEGORIES,
  PERSISTABLE_MATCH_EVENT_TYPES
} = require('../constants');

const CANONICAL_SCOPES = new Set(['match', 'tournament', 'system']);
const BASE_EVENT_KEYS = new Set([
  'scope',
  'tournamentId',
  'fixtureId',
  'minute',
  'type',
  'category',
  'payload',
  'seq',
  'serverTimestamp'
]);

const EVENT_CATEGORIES = Object.entries(EVENT_TYPE_TO_CATEGORIES).reduce((acc, [type, categories]) => {
  for (const category of categories) {
    if (!acc[category]) acc[category] = [];
    if (!acc[category].includes(type)) acc[category].push(type);
  }
  return acc;
}, {});

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
  emit(rawEvent) {
    const enrichedEvent = this._normalizeEvent(rawEvent);
    enrichedEvent.seq = this.sequence++;
    enrichedEvent.serverTimestamp = Date.now();

    this._validateEvent(enrichedEvent);

    this.stats.eventsEmitted++;

    // Add to buffer
    this._addToBuffer(enrichedEvent);

    // Persist to DB if it's a match event
    if (this._isPersistableEvent(enrichedEvent)) {
      this._persistEvent(enrichedEvent);
    }

    // Broadcast to SSE clients
    this._broadcastToClients(enrichedEvent);

    // Emit on EventEmitter for internal listeners
    super.emit('event', enrichedEvent);
    super.emit(enrichedEvent.type, enrichedEvent);

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
    const connectedEvent = this._normalizeEvent({
      type: 'connected',
      scope: 'system',
      payload: { clientId }
    });
    connectedEvent.seq = this.sequence;
    connectedEvent.serverTimestamp = Date.now();
    this._sendToClient(res, connectedEvent);

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
   * @param {number} [filters.fixtureId] - Filter by fixture
   * @param {number} [filters.tournamentId] - Filter by tournament
   * @param {number} [filters.afterSeq] - Only events after this sequence
   * @param {string} [filters.type] - Filter by specific event type
   * @param {string} [filters.category] - Filter by category (highlights, goals, shootout, cards, flow)
   * @param {number} limit - Max events to return
   */
  getRecentEvents(filters = {}, limit = 100) {
    let events = this.eventBuffer;

    // Apply afterSeq filter first (sequence-based)
    if (filters.afterSeq !== undefined) {
      events = events.filter(e => e.seq > filters.afterSeq);
    }

    // Apply remaining filters using _matchesFilters
    events = events.filter(e => this._matchesFilters(e, filters));

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
   * @param {Object} event - The event to check
   * @param {Object} filters - Filter criteria
   * @param {number} [filters.fixtureId] - Match specific fixture
   * @param {number} [filters.tournamentId] - Match specific tournament
   * @param {string} [filters.type] - Match specific event type
   * @param {string} [filters.category] - Match event category (highlights, goals, shootout, cards, flow)
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
    if (filters.type && event.type !== filters.type) {
      return false;
    }
    if (filters.category) {
      const categories = Array.isArray(event.category) ? event.category : [];
      if (!categories.includes(filters.category)) {
        return false;
      }
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
    return event.scope === 'match' &&
      event.fixtureId !== null &&
      PERSISTABLE_MATCH_EVENT_TYPES.has(event.type);
  }

  /**
   * Persist event to database
   */
  async _persistEvent(event) {
    try {
      const payload = event.payload || {};

      // Map event to DB schema
      const dbEvent = {
        fixtureId: event.fixtureId,
        minute: event.minute || 0,
        second: payload.second || 0,
        eventType: event.type,
        teamId: payload.teamId || null,
        playerId: payload.playerId || null,
        assistPlayerId: payload.assistPlayerId || null,
        description: payload.description || null,
        xg: payload.xg || null,
        outcome: payload.outcome || null,
        bundleId: payload.bundleId || null,
        bundleStep: payload.bundleStep || null,
        metadata: {
          ...payload,
          score: payload.score,
          shootoutScore: payload.shootoutScore,
          round: payload.round,
          seq: event.seq
        }
      };

      await MatchEvent.create(dbEvent);
      this.stats.eventsPersisted++;
    } catch (err) {
      console.error('[EventBus] Failed to persist event:', err.message);
    }
  }

  _normalizeEvent(rawEvent = {}) {
    const type = rawEvent.type || 'unknown';
    const tournamentId = rawEvent.tournamentId ?? null;
    const fixtureId = rawEvent.fixtureId ?? null;
    const scope = this._resolveScope(rawEvent.scope, type, fixtureId, tournamentId);
    const minute = scope === 'match' ? (rawEvent.minute ?? null) : null;
    const payload = this._extractPayload(rawEvent);

    return {
      seq: null,
      serverTimestamp: null,
      scope,
      tournamentId,
      fixtureId,
      minute,
      type,
      category: EVENT_TYPE_TO_CATEGORIES[type] ? [...EVENT_TYPE_TO_CATEGORIES[type]] : [],
      payload
    };
  }

  _resolveScope(scope, type, fixtureId, tournamentId) {
    if (CANONICAL_SCOPES.has(scope)) {
      return scope;
    }
    if (type === 'connected') return 'system';
    if (fixtureId !== null) return 'match';
    if (tournamentId !== null) return 'tournament';
    return 'system';
  }

  _extractPayload(rawEvent) {
    const payload = {};
    if (rawEvent.payload && typeof rawEvent.payload === 'object' && !Array.isArray(rawEvent.payload)) {
      Object.assign(payload, rawEvent.payload);
    }

    for (const [key, value] of Object.entries(rawEvent)) {
      if (!BASE_EVENT_KEYS.has(key)) {
        payload[key] = value;
      }
    }
    return payload;
  }

  _validateEvent(event) {
    if (process.env.NODE_ENV === 'production') return;

    if (typeof event.type !== 'string' || event.type.length === 0) {
      throw new Error('EventBus received invalid event.type');
    }
    if (!CANONICAL_SCOPES.has(event.scope)) {
      throw new Error(`EventBus received invalid event.scope: ${event.scope}`);
    }
    if (!Array.isArray(event.category)) {
      throw new Error('EventBus received invalid event.category');
    }
    if (event.payload === null || typeof event.payload !== 'object' || Array.isArray(event.payload)) {
      throw new Error('EventBus received invalid event.payload');
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
  resetEventBus,
  EVENT_CATEGORIES,
  EVENT_TYPE_TO_CATEGORIES
};
