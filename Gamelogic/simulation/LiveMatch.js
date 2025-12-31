const Fixture = require('../../models/FixtureModel');
const MatchEvent = require('../../models/MatchEventModel');
const MatchReport = require('../../models/MatchReportModel');
const Team = require('../../models/TeamModel');
const Player = require('../../models/PlayerModel');
const db = require('../../db/connection');

const MATCH_STATES = {
  SCHEDULED: 'SCHEDULED',
  FIRST_HALF: 'FIRST_HALF',
  HALFTIME: 'HALFTIME',
  SECOND_HALF: 'SECOND_HALF',
  EXTRA_TIME_1: 'EXTRA_TIME_1',
  ET_HALFTIME: 'ET_HALFTIME',
  EXTRA_TIME_2: 'EXTRA_TIME_2',
  PENALTIES: 'PENALTIES',
  FINISHED: 'FINISHED'
};

const EVENT_TYPES = {
  MATCH_START: 'match_start',
  KICKOFF: 'kickoff',
  GOAL: 'goal',
  SHOT_SAVED: 'shot_saved',
  SHOT_MISSED: 'shot_missed',
  SHOT_BLOCKED: 'shot_blocked',
  PENALTY_AWARDED: 'penalty_awarded',
  PENALTY_SCORED: 'penalty_scored',
  PENALTY_MISSED: 'penalty_missed',
  PENALTY_SAVED: 'penalty_saved',
  CORNER: 'corner',
  FOUL: 'foul',
  YELLOW_CARD: 'yellow_card',
  RED_CARD: 'red_card',
  HALFTIME: 'halftime',
  SECOND_HALF_START: 'second_half_start',
  FULLTIME: 'fulltime',
  EXTRA_TIME_START: 'extra_time_start',
  EXTRA_TIME_HALF: 'extra_time_half',
  EXTRA_TIME_END: 'extra_time_end',
  SHOOTOUT_START: 'shootout_start',
  SHOOTOUT_GOAL: 'shootout_goal',
  SHOOTOUT_MISS: 'shootout_miss',
  SHOOTOUT_SAVE: 'shootout_save',
  SHOOTOUT_END: 'shootout_end',
  MATCH_END: 'match_end'
};

// Key events that should be emitted even during fast-forward
const KEY_EVENTS = new Set([
  EVENT_TYPES.GOAL,
  EVENT_TYPES.PENALTY_SCORED,
  EVENT_TYPES.HALFTIME,
  EVENT_TYPES.SECOND_HALF_START,
  EVENT_TYPES.FULLTIME,
  EVENT_TYPES.EXTRA_TIME_START,
  EVENT_TYPES.EXTRA_TIME_HALF,
  EVENT_TYPES.EXTRA_TIME_END,
  EVENT_TYPES.SHOOTOUT_START,
  EVENT_TYPES.SHOOTOUT_GOAL,
  EVENT_TYPES.SHOOTOUT_MISS,
  EVENT_TYPES.SHOOTOUT_SAVE,
  EVENT_TYPES.SHOOTOUT_END,
  EVENT_TYPES.MATCH_END
]);

const DEFAULT_RULES = {
  knockout: true,
  halfDurationMs: 240000,      // 4 min real = 45 match minutes
  halftimeDurationMs: 60000,   // 1 min real
  extraTimeEnabled: true,
  etHalfDurationMs: 120000,    // 2 min real = 15 match minutes
  etHalftimeMs: 30000,         // 30s real
  penaltiesEnabled: true
};

/**
 * LiveMatch - Real-time match simulation driven by external ticks
 *
 * Time mapping (default rules):
 * - First half:   tick 0-239   -> match min 1-45
 * - Halftime:     tick 240-299 -> paused at 45
 * - Second half:  tick 300-539 -> match min 46-90
 * - ET 1st half:  tick 540-659 -> match min 91-105
 * - ET halftime:  tick 660-689 -> paused at 105
 * - ET 2nd half:  tick 690-809 -> match min 106-120
 * - Penalties:    tick 810+    -> until resolved
 */
// Bracket slot definitions with feedsInto relationships
const BRACKET_STRUCTURE = {
  R16_1: { round: 'Round of 16', feedsInto: 'QF1', position: 'home' },
  R16_2: { round: 'Round of 16', feedsInto: 'QF1', position: 'away' },
  R16_3: { round: 'Round of 16', feedsInto: 'QF2', position: 'home' },
  R16_4: { round: 'Round of 16', feedsInto: 'QF2', position: 'away' },
  R16_5: { round: 'Round of 16', feedsInto: 'QF3', position: 'home' },
  R16_6: { round: 'Round of 16', feedsInto: 'QF3', position: 'away' },
  R16_7: { round: 'Round of 16', feedsInto: 'QF4', position: 'home' },
  R16_8: { round: 'Round of 16', feedsInto: 'QF4', position: 'away' },
  QF1: { round: 'Quarter-finals', feedsInto: 'SF1', position: 'home' },
  QF2: { round: 'Quarter-finals', feedsInto: 'SF1', position: 'away' },
  QF3: { round: 'Quarter-finals', feedsInto: 'SF2', position: 'home' },
  QF4: { round: 'Quarter-finals', feedsInto: 'SF2', position: 'away' },
  SF1: { round: 'Semi-finals', feedsInto: 'FINAL', position: 'home' },
  SF2: { round: 'Semi-finals', feedsInto: 'FINAL', position: 'away' },
  FINAL: { round: 'Final', feedsInto: null, position: null }
};

class LiveMatch {
  constructor(fixtureId, homeTeam, awayTeam, startTime, rules = {}) {
    this.fixtureId = fixtureId;
    this.homeTeam = homeTeam;
    this.awayTeam = awayTeam;
    this.startTime = startTime; // Wall-clock epoch ms
    this.rules = { ...DEFAULT_RULES, ...rules };

    // Bracket info (set by TournamentManager after construction)
    this.bracketSlot = null;
    this.feedsInto = null;
    this.tournamentId = null;

    // State
    this.state = MATCH_STATES.SCHEDULED;
    this.tickElapsed = 0;
    this.lastMatchMinute = 0;

    // Score
    this.score = { home: 0, away: 0 };
    this.penaltyScore = { home: 0, away: 0 };

    // Players (loaded async)
    this.homePlayers = [];
    this.awayPlayers = [];
    this.playersLoaded = false;

    // Event tracking
    this.bundleCounter = 0;
    this.processedMinutes = new Set();
    this.emittedTransitions = new Set();
    this.completionNotified = false;

    // Stats
    this.stats = {
      home: { possession: 0, shots: 0, shotsOnTarget: 0, xg: 0, corners: 0, fouls: 0, yellowCards: 0, redCards: 0 },
      away: { possession: 0, shots: 0, shotsOnTarget: 0, xg: 0, corners: 0, fouls: 0, yellowCards: 0, redCards: 0 }
    };
    this.possessionTicks = { home: 0, away: 0 };

    // Penalty shootout state
    this.shootoutRound = 0;
    this.shootoutScores = { home: 0, away: 0 };

    // Finalization tracking (for race condition prevention)
    this._finalizationPromise = null;
    this.shootoutTaken = { home: 0, away: 0 };
    this.currentShooter = 'home';

    // Fast-forward mode
    this.isFastForwarding = false;

    // Precompute timing boundaries
    this._computeTimings();
  }

  _computeTimings() {
    const r = this.rules;
    const tickMs = 1000; // 1 tick = 1 second

    this.timings = {
      firstHalfEnd: r.halfDurationMs / tickMs,                    // 240
      halftimeEnd: (r.halfDurationMs + r.halftimeDurationMs) / tickMs,  // 300
      secondHalfEnd: (r.halfDurationMs * 2 + r.halftimeDurationMs) / tickMs, // 540
      et1End: null,
      etHalftimeEnd: null,
      et2End: null
    };

    if (r.extraTimeEnabled) {
      const base = this.timings.secondHalfEnd;
      this.timings.et1End = base + r.etHalfDurationMs / tickMs;          // 660
      this.timings.etHalftimeEnd = this.timings.et1End + r.etHalftimeMs / tickMs; // 690
      this.timings.et2End = this.timings.etHalftimeEnd + r.etHalfDurationMs / tickMs; // 810
    }
  }

  /**
   * Load players from DB (call before first tick)
   */
  async loadPlayers() {
    if (this.playersLoaded) return;

    this.homePlayers = await Player.fetchByTeamId(this.homeTeam.id);
    this.awayPlayers = await Player.fetchByTeamId(this.awayTeam.id);
    this.playersLoaded = true;
  }

  /**
   * Main tick - called by SimulationLoop every second
   * @param {number} now - Current wall-clock time (ms)
   * @returns {Array} Events to emit
   */
  tick(now) {
    if (this.state === MATCH_STATES.FINISHED) return [];
    if (now < this.startTime) return [];

    const events = [];
    const expectedTick = Math.floor((now - this.startTime) / 1000);

    // Fast-forward if we're behind
    if (expectedTick > this.tickElapsed + 1) {
      this.isFastForwarding = true;
      while (this.tickElapsed < expectedTick && this.state !== MATCH_STATES.FINISHED) {
        const tickEvents = this._processTick();
        // Only emit key events during fast-forward
        for (const evt of tickEvents) {
          if (KEY_EVENTS.has(evt.type)) {
            events.push(evt);
          }
        }
        this.tickElapsed++;
      }
      this.isFastForwarding = false;
    } else {
      // Normal tick
      const tickEvents = this._processTick();
      events.push(...tickEvents);
      this.tickElapsed++;
    }

    return events;
  }

  /**
   * Process a single tick
   */
  _processTick() {
    const events = [];
    const prevState = this.state;

    // Update state based on tick elapsed
    this._updateState();

    // Handle state transitions
    const transitionEvents = this._handleStateTransition(prevState);
    events.push(...transitionEvents);

    // Only simulate during play states
    if (this._isPlayState()) {
      const matchMinute = this.getMatchMinute();

      // Only generate events once per match minute
      if (!this.processedMinutes.has(matchMinute)) {
        const playEvents = this._simulateMinute(matchMinute);
        events.push(...playEvents);
        this.processedMinutes.add(matchMinute);
      }

      // Track possession every tick
      this._trackPossession();
    }

    // Handle penalties (special case - not minute-based)
    if (this.state === MATCH_STATES.PENALTIES) {
      const penaltyEvents = this._processShootoutTick();
      events.push(...penaltyEvents);
    }

    return events;
  }

  /**
   * Update state based on tick elapsed
   */
  _updateState() {
    const t = this.tickElapsed;
    const tm = this.timings;

    if (this.state === MATCH_STATES.SCHEDULED && t >= 0) {
      this.state = MATCH_STATES.FIRST_HALF;
    } else if (this.state === MATCH_STATES.FIRST_HALF && t >= tm.firstHalfEnd) {
      this.state = MATCH_STATES.HALFTIME;
    } else if (this.state === MATCH_STATES.HALFTIME && t >= tm.halftimeEnd) {
      this.state = MATCH_STATES.SECOND_HALF;
    } else if (this.state === MATCH_STATES.SECOND_HALF && t >= tm.secondHalfEnd) {
      this._handleFulltime();
    } else if (this.state === MATCH_STATES.EXTRA_TIME_1 && tm.et1End && t >= tm.et1End) {
      this.state = MATCH_STATES.ET_HALFTIME;
    } else if (this.state === MATCH_STATES.ET_HALFTIME && tm.etHalftimeEnd && t >= tm.etHalftimeEnd) {
      this.state = MATCH_STATES.EXTRA_TIME_2;
    } else if (this.state === MATCH_STATES.EXTRA_TIME_2 && tm.et2End && t >= tm.et2End) {
      this._handleExtraTimeEnd();
    }
  }

  _handleFulltime() {
    const isDraw = this.score.home === this.score.away;

    if (isDraw && this.rules.knockout && this.rules.extraTimeEnabled) {
      this.state = MATCH_STATES.EXTRA_TIME_1;
    } else if (isDraw && this.rules.knockout && this.rules.penaltiesEnabled) {
      this.state = MATCH_STATES.PENALTIES;
    } else {
      this.state = MATCH_STATES.FINISHED;
    }
  }

  _handleExtraTimeEnd() {
    const isDraw = this.score.home === this.score.away;

    if (isDraw && this.rules.knockout && this.rules.penaltiesEnabled) {
      this.state = MATCH_STATES.PENALTIES;
    } else {
      this.state = MATCH_STATES.FINISHED;
    }
  }

  /**
   * Handle state transition events
   */
  _handleStateTransition(prevState) {
    const events = [];
    const transitionKey = `${prevState}->${this.state}`;

    if (prevState === this.state) return events;
    if (this.emittedTransitions.has(transitionKey)) return events;

    this.emittedTransitions.add(transitionKey);

    switch (this.state) {
      case MATCH_STATES.FIRST_HALF:
        events.push(this._createEvent(EVENT_TYPES.MATCH_START, 1, {
          description: `Match started: ${this.homeTeam.name} vs ${this.awayTeam.name}`
        }));
        this._persistFixtureStatus('live');
        break;

      case MATCH_STATES.HALFTIME:
        events.push(this._createEvent(EVENT_TYPES.HALFTIME, 45, {
          description: `Half time: ${this.homeTeam.name} ${this.score.home}-${this.score.away} ${this.awayTeam.name}`
        }));
        break;

      case MATCH_STATES.SECOND_HALF:
        events.push(this._createEvent(EVENT_TYPES.SECOND_HALF_START, 46, {
          description: 'Second half begins'
        }));
        break;

      case MATCH_STATES.EXTRA_TIME_1:
        events.push(this._createEvent(EVENT_TYPES.EXTRA_TIME_START, 91, {
          description: 'Extra time begins'
        }));
        break;

      case MATCH_STATES.ET_HALFTIME:
        events.push(this._createEvent(EVENT_TYPES.EXTRA_TIME_HALF, 105, {
          description: `ET Half: ${this.homeTeam.name} ${this.score.home}-${this.score.away} ${this.awayTeam.name}`
        }));
        break;

      case MATCH_STATES.EXTRA_TIME_2:
        events.push(this._createEvent(EVENT_TYPES.KICKOFF, 106, {
          description: 'Extra time second half begins'
        }));
        break;

      case MATCH_STATES.PENALTIES:
        events.push(this._createEvent(EVENT_TYPES.SHOOTOUT_START, 120, {
          description: 'Penalty shootout begins'
        }));
        break;

      case MATCH_STATES.FINISHED:
        events.push(...this._handleMatchEnd());
        break;
    }

    return events;
  }

  _handleMatchEnd() {
    const events = [];
    const winnerId = this.getWinnerId();

    // Emit fulltime or ET end if not already emitted
    if (!this.emittedTransitions.has('fulltime_emitted')) {
      if (this.penaltyScore.home > 0 || this.penaltyScore.away > 0) {
        events.push(this._createEvent(EVENT_TYPES.SHOOTOUT_END, 120, {
          description: `Shootout: ${this.homeTeam.name} ${this.shootoutScores.home}-${this.shootoutScores.away} ${this.awayTeam.name}`,
          winnerId
        }));
      } else if (this.tickElapsed >= this.timings.secondHalfEnd) {
        const minute = this.timings.et2End && this.tickElapsed >= this.timings.et2End ? 120 : 90;
        const eventType = minute > 90 ? EVENT_TYPES.EXTRA_TIME_END : EVENT_TYPES.FULLTIME;
        events.push(this._createEvent(eventType, minute, {
          description: `Full time: ${this.homeTeam.name} ${this.score.home}-${this.score.away} ${this.awayTeam.name}`
        }));
      }
      this.emittedTransitions.add('fulltime_emitted');
    }

    events.push(this._createEvent(EVENT_TYPES.MATCH_END, this.getMatchMinute(), {
      description: `Match ended`,
      winnerId,
      finalScore: { ...this.score },
      penaltyScore: this.penaltyScore.home > 0 ? { ...this.penaltyScore } : null
    }));

    // Finalize in DB (async, but tracked for race condition prevention)
    this._finalizationPromise = this._finalizeMatch().catch(err => {
      console.error('[LiveMatch] Finalize error:', err);
    });

    return events;
  }

  /**
   * Simulate a single match minute
   */
  _simulateMinute(minute) {
    const events = [];

    // 5% foul chance
    if (Math.random() < 0.05) {
      const foulEvents = this._handleFoul(minute);
      events.push(...foulEvents);
    }

    // Attack chances (~35% per minute that something happens)
    const homeAttackChance = this.homeTeam.attackRating / 200;
    const awayAttackChance = this.awayTeam.attackRating / 200;

    if (Math.random() < homeAttackChance) {
      const attackEvents = this._handleAttack(this.homeTeam, this.awayTeam, 'home', minute);
      events.push(...attackEvents);
    } else if (Math.random() < awayAttackChance) {
      const attackEvents = this._handleAttack(this.awayTeam, this.homeTeam, 'away', minute);
      events.push(...attackEvents);
    }

    return events;
  }

  _handleAttack(attackingTeam, defendingTeam, side, minute) {
    const events = [];
    const oppSide = side === 'home' ? 'away' : 'home';
    const bundleId = this._generateBundleId('attack', minute);

    // Defense blocks?
    if (this._defenseBlocks(defendingTeam)) {
      this.stats[oppSide].corners += Math.random() < 0.3 ? 1 : 0;
      // Don't emit block events (not key events)
      return events;
    }

    // Penalty chance (4-8%)
    const pressureLevel = this._calculatePressure(attackingTeam, defendingTeam);
    const penaltyChance = pressureLevel === 'high' ? 0.08 : 0.04;

    if (Math.random() < penaltyChance) {
      return this._handlePenalty(attackingTeam, defendingTeam, side, minute, bundleId);
    }

    // Shot
    return this._handleShot(attackingTeam, defendingTeam, side, minute, bundleId);
  }

  _handleShot(attackingTeam, defendingTeam, side, minute, bundleId) {
    const events = [];
    const oppSide = side === 'home' ? 'away' : 'home';
    const players = side === 'home' ? this.homePlayers : this.awayPlayers;

    this.stats[side].shots++;

    // xG calculation
    const baseXg = 0.08 + Math.random() * 0.12;
    const pressureMod = this._calculatePressure(attackingTeam, defendingTeam) === 'high' ? 1.3 : 1.0;
    const xg = Math.min(0.80, baseXg * pressureMod);
    this.stats[side].xg += xg;

    // On target? (60%)
    if (Math.random() < 0.6) {
      this.stats[side].shotsOnTarget++;

      // Goal or save?
      if (!this._goalkeeperSaves(defendingTeam)) {
        // GOAL!
        this.score[side]++;
        const scorer = this._selectScorer(players);
        const assister = this._selectAssister(players, scorer?.playerId);

        events.push(this._createEvent(EVENT_TYPES.GOAL, minute, {
          teamId: attackingTeam.id,
          playerId: scorer?.playerId,
          displayName: scorer?.name,
          assistPlayerId: assister?.playerId,
          assistName: assister?.name,
          description: `GOAL! ${attackingTeam.name}`,
          xg,
          outcome: 'scored',
          bundleId
        }));

        // Update fixture score immediately
        this._persistScore();
      } else {
        // Saved - not a key event, skip during fast-forward
        this.stats[oppSide].corners += Math.random() < 0.4 ? 1 : 0;
      }
    }
    // Missed shots - not key events

    return events;
  }

  _handlePenalty(attackingTeam, defendingTeam, side, minute, bundleId) {
    const events = [];
    const players = side === 'home' ? this.homePlayers : this.awayPlayers;
    const penXg = 0.76;

    this.stats[side].shots++;
    this.stats[side].xg += penXg;

    const outcome = this._determinePenaltyOutcome(defendingTeam);
    const taker = this._selectScorer(players);

    if (outcome === 'scored') {
      this.score[side]++;
      this.stats[side].shotsOnTarget++;

      events.push(this._createEvent(EVENT_TYPES.PENALTY_SCORED, minute, {
        teamId: attackingTeam.id,
        playerId: taker?.playerId,
        displayName: taker?.name,
        description: `PENALTY GOAL! ${attackingTeam.name}`,
        xg: penXg,
        outcome: 'scored',
        bundleId
      }));

      this._persistScore();
    }
    // Saved/missed penalties - not key events

    return events;
  }

  _handleFoul(minute) {
    const events = [];
    const isHomeFoul = Math.random() < 0.5;
    const side = isHomeFoul ? 'home' : 'away';
    const team = isHomeFoul ? this.homeTeam : this.awayTeam;

    this.stats[side].fouls++;

    // Card chance (15% yellow, 2% red)
    const cardRoll = Math.random();
    if (cardRoll < 0.02) {
      this.stats[side].redCards++;
      // Red cards are notable but not "key" for catchup
    } else if (cardRoll < 0.17) {
      this.stats[side].yellowCards++;
    }

    return events;
  }

  /**
   * Process penalty shootout (one kick per tick in penalties state)
   */
  _processShootoutTick() {
    const events = [];

    // One penalty per 3 ticks (to spread them out)
    if ((this.tickElapsed - this.timings.et2End) % 3 !== 0) return events;

    const side = this.currentShooter;
    const team = side === 'home' ? this.homeTeam : this.awayTeam;
    const defendingTeam = side === 'home' ? this.awayTeam : this.homeTeam;
    const players = side === 'home' ? this.homePlayers : this.awayPlayers;
    const taker = this._selectScorer(players);

    // 75% success rate
    const onTarget = Math.random() < 0.85;
    const saved = onTarget && Math.random() < 0.12;
    const scored = onTarget && !saved;

    this.shootoutTaken[side]++;

    if (scored) {
      this.shootoutScores[side]++;
      events.push(this._createEvent(EVENT_TYPES.SHOOTOUT_GOAL, 120, {
        teamId: team.id,
        playerId: taker?.playerId,
        displayName: taker?.name,
        description: `Shootout: ${team.name} SCORES!`,
        outcome: 'scored',
        round: Math.ceil(this.shootoutTaken[side]),
        shootoutScore: { ...this.shootoutScores }
      }));
    } else if (saved) {
      events.push(this._createEvent(EVENT_TYPES.SHOOTOUT_SAVE, 120, {
        teamId: team.id,
        playerId: taker?.playerId,
        displayName: taker?.name,
        description: `Shootout: ${team.name} SAVED!`,
        outcome: 'saved',
        round: Math.ceil(this.shootoutTaken[side]),
        shootoutScore: { ...this.shootoutScores }
      }));
    } else {
      events.push(this._createEvent(EVENT_TYPES.SHOOTOUT_MISS, 120, {
        teamId: team.id,
        playerId: taker?.playerId,
        displayName: taker?.name,
        description: `Shootout: ${team.name} MISSES!`,
        outcome: 'missed',
        round: Math.ceil(this.shootoutTaken[side]),
        shootoutScore: { ...this.shootoutScores }
      }));
    }

    // Switch shooter
    this.currentShooter = side === 'home' ? 'away' : 'home';

    // Check for winner after both teams have taken equal kicks
    if (this.shootoutTaken.home === this.shootoutTaken.away) {
      const round = this.shootoutTaken.home;

      // After 5 rounds each, check for winner
      if (round >= 5) {
        if (this.shootoutScores.home !== this.shootoutScores.away) {
          this.penaltyScore = { ...this.shootoutScores };
          this.state = MATCH_STATES.FINISHED;
        }
      }

      // Check for mathematically decided (e.g., 3-0 after 3 kicks)
      const remaining = Math.max(5 - round, 0);
      if (Math.abs(this.shootoutScores.home - this.shootoutScores.away) > remaining) {
        this.penaltyScore = { ...this.shootoutScores };
        this.state = MATCH_STATES.FINISHED;
      }
    }

    return events;
  }

  // === Helper Methods ===

  _isPlayState() {
    return [
      MATCH_STATES.FIRST_HALF,
      MATCH_STATES.SECOND_HALF,
      MATCH_STATES.EXTRA_TIME_1,
      MATCH_STATES.EXTRA_TIME_2
    ].includes(this.state);
  }

  _trackPossession() {
    const homeChance = this.homeTeam.attackRating / (this.homeTeam.attackRating + this.awayTeam.attackRating);
    if (Math.random() < homeChance) {
      this.possessionTicks.home++;
    } else {
      this.possessionTicks.away++;
    }
  }

  _defenseBlocks(team) {
    return Math.random() < team.defenseRating / 110;
  }

  _goalkeeperSaves(team) {
    return Math.random() < team.goalkeeperRating / 90;
  }

  _calculatePressure(attacking, defending) {
    const diff = attacking.attackRating - defending.defenseRating;
    if (diff >= 15) return 'high';
    if (diff >= 5) return 'medium';
    return 'low';
  }

  _determinePenaltyOutcome(defendingTeam) {
    if (Math.random() < 0.7) {
      if (Math.random() < defendingTeam.goalkeeperRating / 120) return 'saved';
      return 'scored';
    }
    return 'missed';
  }

  _selectScorer(players) {
    const outfield = players.filter(p => !p.isGoalkeeper);
    if (!outfield.length) return null;

    const totalAttack = outfield.reduce((sum, p) => sum + p.attack, 0);
    let rand = Math.random() * totalAttack;

    for (const player of outfield) {
      rand -= player.attack;
      if (rand <= 0) return player;
    }
    return outfield[0];
  }

  _selectAssister(players, scorerId) {
    const candidates = players.filter(p => !p.isGoalkeeper && p.playerId !== scorerId);
    if (!candidates.length || Math.random() < 0.3) return null;

    const totalAttack = candidates.reduce((sum, p) => sum + p.attack, 0);
    let rand = Math.random() * totalAttack;

    for (const player of candidates) {
      rand -= player.attack;
      if (rand <= 0) return player;
    }
    return candidates[0];
  }

  _generateBundleId(eventType, minute) {
    this.bundleCounter++;
    return `${eventType}_${minute}_${this.bundleCounter}`;
  }

  _createEvent(type, minute, data = {}) {
    return {
      type,
      fixtureId: this.fixtureId,
      minute,
      timestamp: Date.now(),
      score: { ...this.score },
      homeTeam: { id: this.homeTeam.id, name: this.homeTeam.name },
      awayTeam: { id: this.awayTeam.id, name: this.awayTeam.name },
      ...data
    };
  }

  // === Persistence ===

  async _persistFixtureStatus(status) {
    try {
      await Fixture.updateStatus(this.fixtureId, status);
    } catch (err) {
      console.error('[LiveMatch] Failed to update fixture status:', err);
    }
  }

  async _persistScore() {
    try {
      await db.query(
        'UPDATE fixtures SET home_score = $1, away_score = $2 WHERE fixture_id = $3',
        [this.score.home, this.score.away, this.fixtureId]
      );
    } catch (err) {
      console.error('[LiveMatch] Failed to persist score:', err);
    }
  }

  async _finalizeMatch() {
    const winnerId = this.getWinnerId();

    // Calculate possession
    const totalTicks = this.possessionTicks.home + this.possessionTicks.away;
    const homePossession = totalTicks > 0 ? (this.possessionTicks.home / totalTicks * 100) : 50;
    const awayPossession = 100 - homePossession;

    // Complete fixture
    await Fixture.complete(this.fixtureId, {
      homeScore: this.score.home,
      awayScore: this.score.away,
      homePenaltyScore: this.penaltyScore.home || null,
      awayPenaltyScore: this.penaltyScore.away || null,
      winnerTeamId: winnerId
    });

    // Create match report
    await MatchReport.create({
      fixtureId: this.fixtureId,
      homePossession: Math.round(homePossession * 100) / 100,
      awayPossession: Math.round(awayPossession * 100) / 100,
      homeShots: this.stats.home.shots,
      awayShots: this.stats.away.shots,
      homeShotsOnTarget: this.stats.home.shotsOnTarget,
      awayShotsOnTarget: this.stats.away.shotsOnTarget,
      homeXg: Math.round(this.stats.home.xg * 100) / 100,
      awayXg: Math.round(this.stats.away.xg * 100) / 100,
      homeCorners: this.stats.home.corners,
      awayCorners: this.stats.away.corners,
      homeFouls: this.stats.home.fouls,
      awayFouls: this.stats.away.fouls,
      homeYellowCards: this.stats.home.yellowCards,
      awayYellowCards: this.stats.away.yellowCards,
      homeRedCards: this.stats.home.redCards,
      awayRedCards: this.stats.away.redCards,
      extraTimePlayed: this.tickElapsed > this.timings.secondHalfEnd,
      penaltiesPlayed: this.penaltyScore.home > 0 || this.penaltyScore.away > 0
    });

    // NOTE: Team stats (wins, losses, goals) are now updated here immediately
    // TournamentManager should NOT update these stats again
    try {
      const homeWon = winnerId === this.homeTeam.id;

      // Update stats for home team
      await Team.updateMatchStats(
        this.homeTeam.id,
        homeWon,
        this.score.home,
        this.score.away
      );

      // Update stats for away team
      await Team.updateMatchStats(
        this.awayTeam.id,
        !homeWon,
        this.score.away,
        this.score.home
      );

    } catch (err) {
      console.error('[LiveMatch] Failed to update team stats:', err);
    }

    // Advance winner to next round fixture immediately (if bracket match)
    if (this.bracketSlot && this.feedsInto && this.tournamentId) {
      await this._advanceWinnerToNextRound(winnerId);
    }
  }

  /**
   * Update next round fixture with winner (fills TBD slot)
   */
  async _advanceWinnerToNextRound(winnerId) {
    const bracketInfo = BRACKET_STRUCTURE[this.bracketSlot];
    if (!bracketInfo) return;

    const position = bracketInfo.position; // 'home' or 'away'

    try {
      const nextFixture = await Fixture.getByBracketSlot(this.tournamentId, this.feedsInto);
      if (!nextFixture) {
        console.warn(`[LiveMatch] No fixture found for bracket slot ${this.feedsInto}`);
        return;
      }

      if (position === 'home') {
        await Fixture.updateHomeTeam(nextFixture.fixtureId, winnerId);
      } else if (position === 'away') {
        await Fixture.updateAwayTeam(nextFixture.fixtureId, winnerId);
      }
      console.log(`[LiveMatch] Advanced winner ${winnerId} from ${this.bracketSlot} to ${this.feedsInto} (${position})`);
    } catch (err) {
      console.error(`[LiveMatch] Failed to advance winner to ${this.feedsInto}:`, err.message);
    }
  }

  // === Public API ===

  getMatchMinute() {
    const t = this.tickElapsed;
    const tm = this.timings;

    if (t < tm.firstHalfEnd) {
      return 1 + Math.floor(t * 45 / tm.firstHalfEnd);
    }
    if (t < tm.halftimeEnd) {
      return 45;
    }
    if (t < tm.secondHalfEnd) {
      return 46 + Math.floor((t - tm.halftimeEnd) * 45 / (tm.secondHalfEnd - tm.halftimeEnd));
    }

    if (!tm.et1End) return 90;

    if (t < tm.et1End) {
      return 91 + Math.floor((t - tm.secondHalfEnd) * 15 / (tm.et1End - tm.secondHalfEnd));
    }
    if (t < tm.etHalftimeEnd) {
      return 105;
    }
    if (t < tm.et2End) {
      return 106 + Math.floor((t - tm.etHalftimeEnd) * 15 / (tm.et2End - tm.etHalftimeEnd));
    }

    return 120;
  }

  getScore() {
    return { ...this.score };
  }

  getPenaltyScore() {
    if (this.penaltyScore.home > 0 || this.penaltyScore.away > 0) {
      return { ...this.penaltyScore };
    }
    return null;
  }

  getWinnerId() {
    if (this.penaltyScore.home > 0 || this.penaltyScore.away > 0) {
      return this.penaltyScore.home > this.penaltyScore.away ? this.homeTeam.id : this.awayTeam.id;
    }
    if (this.score.home !== this.score.away) {
      return this.score.home > this.score.away ? this.homeTeam.id : this.awayTeam.id;
    }
    return null; // Draw
  }

  isFinished() {
    return this.state === MATCH_STATES.FINISHED;
  }

  getState() {
    return this.state;
  }

  /**
   * Wait for DB finalization to complete (prevents race condition)
   */
  async awaitFinalization() {
    if (this._finalizationPromise) {
      await this._finalizationPromise;
    }
  }

  // === Admin Controls ===

  forceEnd() {
    this.state = MATCH_STATES.FINISHED;
  }

  forceSetScore(home, away) {
    this.score.home = home;
    this.score.away = away;
    this._persistScore();
  }

  // === Recovery ===

  static async recover(fixtureId, startTime, rules = {}) {
    // Load fixture data
    const fixture = await Fixture.getById(fixtureId);
    const homeTeam = await Team.getRatingById(fixture.homeTeamId);
    const awayTeam = await Team.getRatingById(fixture.awayTeamId);

    const match = new LiveMatch(fixtureId, homeTeam, awayTeam, startTime, rules);
    await match.loadPlayers();

    // Rebuild score from events
    const events = await MatchEvent.getByFixtureId(fixtureId);
    for (const evt of events) {
      if (evt.eventType === 'goal' || evt.eventType === 'penalty_scored') {
        if (evt.teamId === homeTeam.id) {
          match.score.home++;
        } else {
          match.score.away++;
        }
        match.processedMinutes.add(evt.minute);
      }
    }

    return match;
  }
}

module.exports = {
  LiveMatch,
  MATCH_STATES,
  EVENT_TYPES,
  KEY_EVENTS,
  DEFAULT_RULES
};
