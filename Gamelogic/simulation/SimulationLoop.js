const EventEmitter = require('events');

// Will be implemented in separate files
// const TournamentManager = require('./TournamentManager');
// const LiveMatch = require('./LiveMatch');
// const EventBus = require('./EventBus');

const DEFAULT_TICK_INTERVAL = 1000; // 1 second

/**
 * SimulationLoop - Singleton that drives the entire live simulation
 *
 * Responsibilities:
 * - 1-second tick loop
 * - Coordinate TournamentManager state transitions
 * - Tick all active LiveMatch instances
 * - Handle recovery on startup
 * - Provide admin controls (pause, speed, force actions)
 */
class SimulationLoop extends EventEmitter {
  constructor() {
    super();

    // Singleton state
    this.isRunning = false;
    this.isPaused = false;
    this.tickInterval = null;
    this.tickCount = 0;

    // Time control
    this.speedMultiplier = 1;
    this.tickIntervalMs = DEFAULT_TICK_INTERVAL;

    // Components (injected or created)
    this.tournamentManager = null;
    this.matches = new Map(); // fixtureId -> LiveMatch
    this.eventBus = null;

    // Recovery tracking
    this.lastTickTime = null;
    this.startedAt = null;
  }

  /**
   * Initialize with dependencies
   */
  init({ tournamentManager, eventBus }) {
    this.tournamentManager = tournamentManager;
    this.eventBus = eventBus;

    // Wire up tournament manager events
    if (this.tournamentManager) {
      this.tournamentManager.on('matches_created', (matches) => {
        this.registerMatches(matches);
      });

      this.tournamentManager.on('round_complete', () => {
        this.clearFinishedMatches();
      });
    }

    return this;
  }

  /**
   * Start the simulation loop
   */
  async start() {
    if (this.isRunning) {
      console.log('[SimulationLoop] Already running');
      return;
    }

    console.log('[SimulationLoop] Starting...');

    // Attempt recovery of any live state
    await this.recover();

    this.isRunning = true;
    this.isPaused = false;
    this.startedAt = Date.now();
    this.lastTickTime = Date.now();

    // Start the tick loop
    this.scheduleNextTick();

    this.emit('started', { startedAt: this.startedAt });
    console.log('[SimulationLoop] Started');
  }

  /**
   * Stop the simulation loop
   */
  stop() {
    if (!this.isRunning) return;

    console.log('[SimulationLoop] Stopping...');

    if (this.tickInterval) {
      clearTimeout(this.tickInterval);
      this.tickInterval = null;
    }

    this.isRunning = false;
    this.emit('stopped');
    console.log('[SimulationLoop] Stopped');
  }

  /**
   * Pause without stopping (matches freeze)
   */
  pause() {
    if (this.isPaused) return;

    this.isPaused = true;
    this.emit('paused');
    console.log('[SimulationLoop] Paused');
  }

  /**
   * Resume from pause
   */
  resume() {
    if (!this.isPaused) return;

    this.isPaused = false;
    this.lastTickTime = Date.now(); // Reset to avoid fast-forward
    this.emit('resumed');
    console.log('[SimulationLoop] Resumed');
  }

  /**
   * Set simulation speed (for dev/testing)
   * @param {number} multiplier - 1 = normal, 10 = 10x faster
   */
  setSpeed(multiplier) {
    this.speedMultiplier = Math.max(0.1, Math.min(100, multiplier));
    this.tickIntervalMs = DEFAULT_TICK_INTERVAL / this.speedMultiplier;
    console.log(`[SimulationLoop] Speed set to ${this.speedMultiplier}x (${this.tickIntervalMs}ms per tick)`);
  }

  /**
   * Schedule the next tick with current speed
   */
  scheduleNextTick() {
    if (!this.isRunning) return;

    this.tickInterval = setTimeout(() => {
      this.tick();
      this.scheduleNextTick();
    }, this.tickIntervalMs);
  }

  /**
   * Main tick - called every tickIntervalMs
   */
  tick() {
    if (this.isPaused) return;

    const now = Date.now();
    this.tickCount++;

    try {
      // 1. Tick tournament manager (handles scheduling, round transitions)
      if (this.tournamentManager) {
        this.tournamentManager.tick(now);
      }

      // 2. Tick all active matches
      for (const [fixtureId, match] of this.matches) {
        if (match.isFinished()) {
          continue;
        }

        const events = match.tick(now);

        // Emit any events produced
        if (events && events.length > 0) {
          for (const event of events) {
            this.emitEvent(event);
          }
        }
      }

      // 3. Check for finished matches
      this.checkMatchCompletion();

      this.lastTickTime = now;

    } catch (err) {
      console.error('[SimulationLoop] Tick error:', err);
      this.emit('error', err);
    }
  }

  /**
   * Register matches to be ticked
   */
  registerMatches(matches) {
    for (const match of matches) {
      this.matches.set(match.fixtureId, match);
      console.log(`[SimulationLoop] Registered match ${match.fixtureId}`);
    }
  }

  /**
   * Register a single match
   */
  registerMatch(match) {
    this.matches.set(match.fixtureId, match);
    console.log(`[SimulationLoop] Registered match ${match.fixtureId}`);
  }

  /**
   * Remove a match from active tracking
   */
  unregisterMatch(fixtureId) {
    this.matches.delete(fixtureId);
    console.log(`[SimulationLoop] Unregistered match ${fixtureId}`);
  }

  /**
   * Clear all finished matches
   */
  clearFinishedMatches() {
    for (const [fixtureId, match] of this.matches) {
      if (match.isFinished()) {
        this.matches.delete(fixtureId);
      }
    }
  }

  /**
   * Check if matches have completed and notify tournament manager
   */
  checkMatchCompletion() {
    const justFinished = [];

    for (const [fixtureId, match] of this.matches) {
      if (match.isFinished() && !match.completionNotified) {
        match.completionNotified = true;
        justFinished.push({
          fixtureId,
          winnerId: match.getWinnerId(),
          score: match.getScore(),
          penaltyScore: match.getPenaltyScore()
        });
      }
    }

    if (justFinished.length > 0 && this.tournamentManager) {
      this.tournamentManager.onMatchesComplete(justFinished);
    }
  }

  /**
   * Emit event through event bus
   */
  emitEvent(event) {
    if (this.eventBus) {
      this.eventBus.emit(event);
    }
    this.emit('event', event);
  }

  /**
   * Recover state after restart
   */
  async recover() {
    console.log('[SimulationLoop] Checking for recovery...');

    try {
      // Delegate to tournament manager for tournament recovery
      if (this.tournamentManager) {
        const recovered = await this.tournamentManager.recover();

        if (recovered) {
          console.log('[SimulationLoop] Recovered tournament state');

          // Get any live matches that need resuming
          const liveMatches = await this.tournamentManager.getLiveMatches();

          for (const match of liveMatches) {
            this.registerMatch(match);
            console.log(`[SimulationLoop] Recovered match ${match.fixtureId}`);
          }
        }
      }
    } catch (err) {
      console.error('[SimulationLoop] Recovery error:', err);
    }
  }

  /**
   * Get current state (for admin/debug)
   */
  getState() {
    const matchStates = [];
    for (const [fixtureId, match] of this.matches) {
      matchStates.push({
        fixtureId,
        state: match.state,
        minute: match.getMatchMinute(),
        score: match.getScore(),
        tickElapsed: match.tickElapsed
      });
    }

    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      tickCount: this.tickCount,
      speedMultiplier: this.speedMultiplier,
      startedAt: this.startedAt,
      lastTickTime: this.lastTickTime,
      activeMatches: matchStates,
      tournament: this.tournamentManager?.getState() ?? null
    };
  }

  /**
   * Get a specific match by fixture ID
   */
  getMatch(fixtureId) {
    return this.matches.get(fixtureId);
  }

  /**
   * Force-end a match (admin)
   */
  forceEndMatch(fixtureId) {
    const match = this.matches.get(fixtureId);
    if (!match) {
      throw new Error(`Match ${fixtureId} not found`);
    }

    match.forceEnd();
    console.log(`[SimulationLoop] Force-ended match ${fixtureId}`);
  }

  /**
   * Force-set score (admin)
   */
  forceSetScore(fixtureId, homeScore, awayScore) {
    const match = this.matches.get(fixtureId);
    if (!match) {
      throw new Error(`Match ${fixtureId} not found`);
    }

    match.forceSetScore(homeScore, awayScore);
    console.log(`[SimulationLoop] Force-set score for match ${fixtureId}: ${homeScore}-${awayScore}`);
  }
}

// Singleton instance
let instance = null;

function getSimulationLoop() {
  if (!instance) {
    instance = new SimulationLoop();
  }
  return instance;
}

function resetSimulationLoop() {
  if (instance) {
    instance.stop();
    instance = null;
  }
}

module.exports = {
  SimulationLoop,
  getSimulationLoop,
  resetSimulationLoop
};
