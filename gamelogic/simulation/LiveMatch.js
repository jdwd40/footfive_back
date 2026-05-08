const Fixture = require('../../models/FixtureModel');
const MatchEvent = require('../../models/MatchEventModel');
const MatchReport = require('../../models/MatchReportModel');
const Team = require('../../models/TeamModel');
const Player = require('../../models/PlayerModel');
const db = require('../../db/connection');

const {
  MATCH_STATES,
  EVENT_TYPES,
  KEY_EVENTS,
  DEFAULT_RULES,
  BRACKET_STRUCTURE,
  MATCH_MINUTES,
  SIM,
  FLOW_EVENT_TYPES
} = require('../constants');

const { EventGenerator } = require('./EventGenerator');
const { PenaltyShootout } = require('./PenaltyShootout');

// Stage 1: friendly phase string per MATCH_STATE for snapshot consumers
// that prefer a normalised, lower-case label over the raw enum.
const STATE_TO_PHASE = {
  [MATCH_STATES.SCHEDULED]: 'pre_match',
  [MATCH_STATES.FIRST_HALF]: 'first_half',
  [MATCH_STATES.HALFTIME]: 'halftime',
  [MATCH_STATES.SECOND_HALF]: 'second_half',
  [MATCH_STATES.EXTRA_TIME_1]: 'extra_time_first_half',
  [MATCH_STATES.ET_HALFTIME]: 'extra_time_halftime',
  [MATCH_STATES.EXTRA_TIME_2]: 'extra_time_second_half',
  [MATCH_STATES.PENALTIES]: 'penalty_shootout',
  [MATCH_STATES.FINISHED]: 'finished'
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
class LiveMatch {
  constructor(fixtureId, homeTeam, awayTeam, startTime, rules = {}) {
    this.fixtureId = fixtureId;
    this.homeTeam = homeTeam;
    this.awayTeam = awayTeam;
    this.startTime = startTime; // Wall-clock epoch ms
    this.rules = { ...DEFAULT_RULES, ...rules };

    console.log(`[LiveMatch ${fixtureId}] Created with rules: knockout=${this.rules.knockout}, extraTimeEnabled=${this.rules.extraTimeEnabled}, penaltiesEnabled=${this.rules.penaltiesEnabled}`);

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
    this.processedMinutes = new Set();
    this.emittedTransitions = new Set();
    this.completionNotified = false;

    // Last-event observability (Stage 1: read-only, no behaviour change).
    // Updated after each tick() based on events that actually reach the
    // returned event list (i.e. the live feed). Internal/filtered events do
    // not move these fields.
    this.lastEventTickAt = null;       // tickElapsed value when the last event was emitted
    this.lastEventMatchMinute = null;  // match minute carried by the last event
    this.lastEventType = null;         // EVENT_TYPES value of the last emitted event
    this.lastMajorEventTickAt = null;  // tickElapsed when the last KEY_EVENTS event fired

    // Stage 2: max-silence flow filler bookkeeping. Avoids back-to-back
    // identical flow events.
    this.lastFlowEventType = null;
    this.lastFlowDescription = null;

    // Stats
    this.stats = {
      home: { possession: 0, shots: 0, shotsOnTarget: 0, xg: 0, corners: 0, fouls: 0, yellowCards: 0, redCards: 0 },
      away: { possession: 0, shots: 0, shotsOnTarget: 0, xg: 0, corners: 0, fouls: 0, yellowCards: 0, redCards: 0 }
    };
    this.possessionTicks = { home: 0, away: 0 };

    // Penalty shootout state
    this.shootoutRound = 0;
    this.shootoutScores = { home: 0, away: 0 };
    this.currentShooter = 'home';

    // Finalization tracking (for race condition prevention)
    this._finalizationPromise = null;
    this.shootoutTaken = { home: 0, away: 0 };

    // Fast-forward mode
    this.isFastForwarding = false;

    // Precompute timing boundaries
    this._computeTimings();

    // Initialize sub-modules
    this._eventGenerator = new EventGenerator(
      this._getEventContext(),
      this._createEvent.bind(this),
      this._persistScore.bind(this)
    );

    this._shootout = new PenaltyShootout(
      this._getShootoutContext(),
      this._createEvent.bind(this),
      this._eventGenerator._selectScorer.bind(this._eventGenerator)
    );
  }

  _getEventContext() {
    return {
      homeTeam: this.homeTeam,
      awayTeam: this.awayTeam,
      get homePlayers() { return this._owner.homePlayers; },
      get awayPlayers() { return this._owner.awayPlayers; },
      stats: this.stats,
      score: this.score,
      possessionTicks: this.possessionTicks,
      _owner: this
    };
  }

  _getShootoutContext() {
    return {
      homeTeam: this.homeTeam,
      awayTeam: this.awayTeam,
      get homePlayers() { return this._owner.homePlayers; },
      get awayPlayers() { return this._owner.awayPlayers; },
      score: this.score,
      penaltyScore: this.penaltyScore,
      shootoutScores: this.shootoutScores,
      shootoutTaken: this.shootoutTaken,
      _owner: this
    };
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
      const fromMinute = this.getMatchMinute();
      const recap = {
        goals: 0,
        shots: 0,
        bigChances: 0,
        cards: 0,
        corners: 0
      };
      while (this.tickElapsed < expectedTick && this.state !== MATCH_STATES.FINISHED) {
        const tickEvents = this._processTick();
        this._collectRecapStats(recap, tickEvents);
        // Only emit key events during fast-forward
        for (const evt of tickEvents) {
          if (KEY_EVENTS.has(evt.type)) {
            events.push(evt);
          }
        }
        this.tickElapsed++;
      }
      const toMinute = this.getMatchMinute();
      if (toMinute - fromMinute >= 3) {
        events.unshift(this._createFastForwardRecap(fromMinute, toMinute, recap));
      }
      this.isFastForwarding = false;
    } else {
      // Normal tick
      const tickEvents = this._processTick();
      events.push(...tickEvents);
      this.tickElapsed++;
    }

    this._recordLastEventStats(events);

    return events;
  }

  /**
   * Stage 1: refresh last-event tracking from the events the live feed will
   * see this tick. Read-only side effect on observability fields only —
   * never mutates score, state, or match flow.
   */
  _recordLastEventStats(events) {
    if (!events || events.length === 0) return;

    for (const evt of events) {
      if (!evt || typeof evt.type !== 'string') continue;
      this.lastEventTickAt = this.tickElapsed;
      this.lastEventMatchMinute = evt.minute ?? this.lastEventMatchMinute;
      this.lastEventType = evt.type;
      if (KEY_EVENTS.has(evt.type)) {
        this.lastMajorEventTickAt = this.tickElapsed;
      }
    }
  }

  // === Stage 2: max-silence flow filler ===

  /**
   * Decide whether the live feed has been quiet long enough to deserve a
   * single ambient flow event. Returns the event object or null. Pure
   * read-then-construct: never mutates score or state, only updates the
   * flow-filler bookkeeping fields used to avoid back-to-back repeats.
   *
   * Caller in _processTick already gates on:
   *   - events.length === 0 (no other event fired this tick)
   *   - !isFastForwarding   (no filler during catch-up)
   *   - _isPlayState()      (skip HALFTIME / ET_HALFTIME / PENALTIES / etc.)
   */
  _maybeEmitFlowEvent() {
    if (this.lastEventMatchMinute == null) return null;

    const currentMinute = this.getMatchMinute();
    const minutesSinceLast = currentMinute - this.lastEventMatchMinute;
    if (minutesSinceLast < SIM.MAX_SILENCE_MATCH_MINUTES) return null;

    // Cooldown after a major event (goal, halftime, fulltime, etc.).
    // Convert match-minute cooldown to ticks using the tick-per-match-minute
    // ratio that's baked into _computeTimings.
    if (this.lastMajorEventTickAt != null) {
      const ticksPerMatchMinute =
        this.timings.firstHalfEnd / MATCH_MINUTES.FIRST_HALF_END;
      const cooldownTicks =
        SIM.FLOW_COOLDOWN_AFTER_MAJOR_MATCH_MINUTES * ticksPerMatchMinute;
      const ticksSinceMajor = this.tickElapsed - this.lastMajorEventTickAt;
      if (ticksSinceMajor < cooldownTicks) return null;
    }

    const subjectSide = this._chooseFlowSide();
    const type = this._chooseFlowType();
    const description = this._buildFlowDescription(type, subjectSide);

    this.lastFlowEventType = type;
    this.lastFlowDescription = description;

    // For defensive_action, the "subject" of the event is the defending team
    // (the one without the ball). Other types are about the team in
    // possession. Flip the side so teamId / side identify the correct team.
    const eventSide = type === EVENT_TYPES.DEFENSIVE_ACTION
      ? (subjectSide === 'home' ? 'away' : 'home')
      : subjectSide;
    const team = eventSide === 'home' ? this.homeTeam : this.awayTeam;

    const PHASE_BY_TYPE = {
      [EVENT_TYPES.POSSESSION]: 'possession',
      [EVENT_TYPES.BUILD_UP]: 'build_up',
      [EVENT_TYPES.KEEPER_DISTRIBUTION]: 'build_up',
      [EVENT_TYPES.DEFENSIVE_ACTION]: 'defence'
    };
    const INTENSITY_BY_TYPE = {
      [EVENT_TYPES.POSSESSION]: 1,
      [EVENT_TYPES.BUILD_UP]: 2,
      [EVENT_TYPES.KEEPER_DISTRIBUTION]: 1,
      [EVENT_TYPES.DEFENSIVE_ACTION]: 2
    };

    return this._createEvent(type, currentMinute, {
      teamId: team.id,
      side: eventSide,
      description,
      importance: 'minor',
      phase: PHASE_BY_TYPE[type],
      intensity: INTENSITY_BY_TYPE[type]
    });
  }

  /**
   * Pick which team the flow event is about, weighted by tracked possession
   * if available, else 50/50.
   */
  _chooseFlowSide() {
    const total = this.possessionTicks.home + this.possessionTicks.away;
    if (total === 0) return Math.random() < 0.5 ? 'home' : 'away';
    const homeRatio = this.possessionTicks.home / total;
    return Math.random() < homeRatio ? 'home' : 'away';
  }

  /**
   * Pick a flow event type. Weighted toward possession/build_up; avoids
   * picking the same type as the previous flow event when alternatives exist.
   */
  _chooseFlowType() {
    const candidates = [
      { type: EVENT_TYPES.POSSESSION, weight: 40 },
      { type: EVENT_TYPES.BUILD_UP, weight: 30 },
      { type: EVENT_TYPES.DEFENSIVE_ACTION, weight: 15 },
      { type: EVENT_TYPES.KEEPER_DISTRIBUTION, weight: 15 }
    ];
    const filtered = candidates.filter(c => c.type !== this.lastFlowEventType);
    const pool = filtered.length > 0 ? filtered : candidates;
    const total = pool.reduce((s, c) => s + c.weight, 0);
    let r = Math.random() * total;
    for (const c of pool) {
      r -= c.weight;
      if (r <= 0) return c.type;
    }
    return pool[pool.length - 1].type;
  }

  /**
   * Pick a description from the type-specific bank, avoiding the immediately
   * previous description when the bank has more than one entry.
   *
   * For POSSESSION / BUILD_UP / KEEPER_DISTRIBUTION the subject team has the
   * ball. For DEFENSIVE_ACTION the subject team is the defender, so
   * `${team}` in those templates is the defender and `${opponent}` is the
   * attacker — matching the eventSide flip in _maybeEmitFlowEvent.
   */
  _buildFlowDescription(type, subjectSide) {
    const isDefensive = type === EVENT_TYPES.DEFENSIVE_ACTION;
    const defenderName = (isDefensive
      ? (subjectSide === 'home' ? this.awayTeam : this.homeTeam)
      : (subjectSide === 'home' ? this.homeTeam : this.awayTeam)).name;
    const attackerName = (isDefensive
      ? (subjectSide === 'home' ? this.homeTeam : this.awayTeam)
      : (subjectSide === 'home' ? this.awayTeam : this.homeTeam)).name;

    const team = isDefensive ? defenderName : attackerName;
    const opponent = isDefensive ? attackerName : defenderName;

    const banks = {
      [EVENT_TYPES.POSSESSION]: [
        `${team} are keeping the ball well.`,
        `${team} circulate it patiently.`,
        `${team} hold possession in midfield.`
      ],
      [EVENT_TYPES.BUILD_UP]: [
        `${team} work it patiently through midfield.`,
        `${team} try to build down the flank.`,
        `${team} switch the play looking for space.`
      ],
      [EVENT_TYPES.KEEPER_DISTRIBUTION]: [
        `${team} send it long from the back.`,
        `${team} keeper plays it short to start a move.`,
        `${team} reset with a goal kick.`
      ],
      [EVENT_TYPES.DEFENSIVE_ACTION]: [
        `${opponent} shut the move down.`,
        `${team} clear their lines and reset.`,
        `${opponent} press to win it back.`
      ]
    };

    const bank = banks[type] || [];
    if (bank.length === 0) return `${team} keep the tempo steady.`;
    const filtered = bank.filter(d => d !== this.lastFlowDescription);
    const pool = filtered.length > 0 ? filtered : bank;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /**
   * Process a single tick
   */
  _processTick() {
    const events = [];
    const prevState = this.state;

    // Update state based on tick elapsed
    this._updateState();

    // Handle state transitions from _updateState
    const transitionEvents = this._handleStateTransition(prevState);
    events.push(...transitionEvents);

    // Only simulate during play states
    if (this._isPlayState()) {
      const matchMinute = this.getMatchMinute();

      // Only generate events once per match minute
      if (!this.processedMinutes.has(matchMinute)) {
        const playEvents = this._eventGenerator.simulateMinute(matchMinute);
        events.push(...playEvents);
        this.processedMinutes.add(matchMinute);
      }

      // Track possession every tick
      this._eventGenerator.trackPossession();
    }

    // Handle penalties (special case - not minute-based)
    if (this.state === MATCH_STATES.PENALTIES) {
      const stateBeforePenalties = this.state;
      const { events: penaltyEvents, finished } = this._shootout.processTick(
        this.tickElapsed,
        this.timings.et2End
      );
      events.push(...penaltyEvents);

      if (finished) {
        this.state = MATCH_STATES.FINISHED;
        const shootoutTransitionEvents = this._handleStateTransition(stateBeforePenalties);
        events.push(...shootoutTransitionEvents);
      }
    }

    // Stage 2: emit a single flow filler when the live feed has gone quiet.
    // Only runs when nothing else fired this tick, we're in active play, and
    // we're not catching up via fast-forward. This intentionally does not
    // touch score, state, or any other simulation field.
    if (events.length === 0 &&
        !this.isFastForwarding &&
        this._isPlayState()) {
      const flow = this._maybeEmitFlowEvent();
      if (flow) events.push(flow);
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
    const isKnockout = this.rules.knockout !== false;
    const hasExtraTime = this.rules.extraTimeEnabled !== false;
    const hasPenalties = this.rules.penaltiesEnabled !== false;

    console.log(`[LiveMatch ${this.fixtureId}] _handleFulltime: score=${this.score.home}-${this.score.away}, isDraw=${isDraw}, knockout=${isKnockout}, extraTimeEnabled=${hasExtraTime}, penaltiesEnabled=${hasPenalties}`);

    if (isDraw && isKnockout && hasExtraTime) {
      console.log(`[LiveMatch ${this.fixtureId}] Knockout draw - going to EXTRA_TIME_1`);
      this.state = MATCH_STATES.EXTRA_TIME_1;
    } else if (isDraw && isKnockout && hasPenalties) {
      console.log(`[LiveMatch ${this.fixtureId}] Knockout draw (no ET) - going to PENALTIES`);
      this.state = MATCH_STATES.PENALTIES;
    } else if (isDraw && isKnockout) {
      console.error(`[LiveMatch ${this.fixtureId}] CRITICAL: Knockout draw but no ET/penalties! Forcing PENALTIES`);
      this.state = MATCH_STATES.PENALTIES;
    } else {
      console.log(`[LiveMatch ${this.fixtureId}] Match ending: isDraw=${isDraw}, knockout=${isKnockout}`);
      this.state = MATCH_STATES.FINISHED;
    }
  }

  _handleExtraTimeEnd() {
    const isDraw = this.score.home === this.score.away;
    const isKnockout = this.rules.knockout !== false;
    const hasPenalties = this.rules.penaltiesEnabled !== false;

    console.log(`[LiveMatch ${this.fixtureId}] _handleExtraTimeEnd: score=${this.score.home}-${this.score.away}, isDraw=${isDraw}, knockout=${isKnockout}, penaltiesEnabled=${hasPenalties}`);

    if (isDraw && isKnockout && hasPenalties) {
      console.log(`[LiveMatch ${this.fixtureId}] ET draw - going to PENALTIES`);
      this.state = MATCH_STATES.PENALTIES;
    } else if (isDraw && isKnockout) {
      console.error(`[LiveMatch ${this.fixtureId}] CRITICAL: ET draw but penalties disabled! Forcing PENALTIES`);
      this.state = MATCH_STATES.PENALTIES;
    } else {
      console.log(`[LiveMatch ${this.fixtureId}] Match ending after ET: isDraw=${isDraw}`);
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
        events.push(this._createEvent(EVENT_TYPES.HALFTIME, MATCH_MINUTES.FIRST_HALF_END, {
          description: `Half time: ${this.homeTeam.name} ${this.score.home}-${this.score.away} ${this.awayTeam.name}`
        }));
        break;

      case MATCH_STATES.SECOND_HALF:
        events.push(this._createEvent(EVENT_TYPES.SECOND_HALF_START, MATCH_MINUTES.SECOND_HALF_START, {
          description: 'Second half begins'
        }));
        break;

      case MATCH_STATES.EXTRA_TIME_1:
        events.push(this._createEvent(EVENT_TYPES.EXTRA_TIME_START, MATCH_MINUTES.ET_FIRST_HALF_START, {
          description: 'Extra time begins'
        }));
        break;

      case MATCH_STATES.ET_HALFTIME:
        events.push(this._createEvent(EVENT_TYPES.EXTRA_TIME_HALF, MATCH_MINUTES.ET_FIRST_HALF_END, {
          description: `ET Half: ${this.homeTeam.name} ${this.score.home}-${this.score.away} ${this.awayTeam.name}`
        }));
        break;

      case MATCH_STATES.EXTRA_TIME_2:
        events.push(this._createEvent(EVENT_TYPES.KICKOFF, MATCH_MINUTES.ET_SECOND_HALF_START, {
          description: 'Extra time second half begins'
        }));
        break;

      case MATCH_STATES.PENALTIES:
        events.push(this._createEvent(EVENT_TYPES.SHOOTOUT_START, MATCH_MINUTES.ET_SECOND_HALF_END, {
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

    // CRITICAL DEFENSIVE CHECK: Ensure knockout matches always have a winner
    const isDraw = this.score.home === this.score.away;
    const isKnockout = this.rules.knockout !== false;

    if (isDraw && isKnockout && (this.penaltyScore.home === 0 && this.penaltyScore.away === 0)) {
      console.error(`[LiveMatch ${this.fixtureId}] CRITICAL: Knockout match ending as draw without penalties! Fixing...`);
      PenaltyShootout.simulateInstant(this.shootoutScores, this.shootoutTaken, this.penaltyScore);
    }

    const winnerId = this.getWinnerId();

    // Emit fulltime or ET end if not already emitted
    if (!this.emittedTransitions.has('fulltime_emitted')) {
      if (this.penaltyScore.home > 0 || this.penaltyScore.away > 0) {
        events.push(this._createEvent(EVENT_TYPES.SHOOTOUT_END, MATCH_MINUTES.ET_SECOND_HALF_END, {
          description: `Shootout: ${this.homeTeam.name} ${this.shootoutScores.home}-${this.shootoutScores.away} ${this.awayTeam.name}`,
          winnerId
        }));
      } else if (this.tickElapsed >= this.timings.secondHalfEnd) {
        const minute = this.timings.et2End && this.tickElapsed >= this.timings.et2End ? MATCH_MINUTES.ET_SECOND_HALF_END : MATCH_MINUTES.SECOND_HALF_END;
        const eventType = minute > MATCH_MINUTES.SECOND_HALF_END ? EVENT_TYPES.EXTRA_TIME_END : EVENT_TYPES.FULLTIME;
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

  // === Helper Methods ===

  _isPlayState() {
    return [
      MATCH_STATES.FIRST_HALF,
      MATCH_STATES.SECOND_HALF,
      MATCH_STATES.EXTRA_TIME_1,
      MATCH_STATES.EXTRA_TIME_2
    ].includes(this.state);
  }

  _createEvent(type, minute, data = {}) {
    return {
      type,
      fixtureId: this.fixtureId,
      tournamentId: this.tournamentId,
      minute,
      timestamp: Date.now(),
      score: { ...this.score },
      homeTeam: { id: this.homeTeam.id, name: this.homeTeam.name },
      awayTeam: { id: this.awayTeam.id, name: this.awayTeam.name },
      ...data
    };
  }

  _collectRecapStats(recap, events) {
    for (const evt of events) {
      if ([EVENT_TYPES.GOAL, EVENT_TYPES.PENALTY_SCORED].includes(evt.type)) recap.goals++;
      if ([EVENT_TYPES.SHOT_SAVED, EVENT_TYPES.SHOT_MISSED].includes(evt.type)) recap.shots++;
      if (evt.type === EVENT_TYPES.CHANCE_CREATED) recap.bigChances++;
      if ([EVENT_TYPES.YELLOW_CARD, EVENT_TYPES.RED_CARD].includes(evt.type)) recap.cards++;
      if (evt.type === EVENT_TYPES.CORNER) recap.corners++;
    }
  }

  _createFastForwardRecap(fromMinute, toMinute, recap) {
    const summary = `${fromMinute}'-${toMinute}' recap: ${recap.goals} goals, ${recap.shots} shots, ${recap.bigChances} big chances, ${recap.cards} cards, ${recap.corners} corners.`;
    return this._createEvent(EVENT_TYPES.MATCH_RECAP, toMinute, {
      fromMinute,
      toMinute,
      recap,
      description: summary
    });
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

    // Determine if penalties were played
    const penaltiesPlayed = this.penaltyScore.home > 0 || this.penaltyScore.away > 0 ||
                            this.shootoutTaken.home > 0 || this.shootoutTaken.away > 0;

    // Complete fixture
    await Fixture.complete(this.fixtureId, {
      homeScore: this.score.home,
      awayScore: this.score.away,
      homePenaltyScore: penaltiesPlayed ? this.penaltyScore.home : null,
      awayPenaltyScore: penaltiesPlayed ? this.penaltyScore.away : null,
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
      penaltiesPlayed: penaltiesPlayed
    });

    // Update team stats
    try {
      const homeWon = winnerId === this.homeTeam.id;

      await Team.updateMatchStats(this.homeTeam.id, homeWon, this.score.home, this.score.away);
      await Team.updateMatchStats(this.awayTeam.id, !homeWon, this.score.away, this.score.home);
    } catch (err) {
      console.error('[LiveMatch] Failed to update team stats:', err);
    }

    // Advance winner to next round fixture immediately (if bracket match)
    if (this.bracketSlot && this.feedsInto && this.tournamentId) {
      await this._advanceWinnerToNextRound(winnerId);
    }
  }

  async _advanceWinnerToNextRound(winnerId) {
    const bracketInfo = BRACKET_STRUCTURE[this.bracketSlot];
    if (!bracketInfo) return;

    const position = bracketInfo.position;

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
      return 1 + Math.floor(t * MATCH_MINUTES.FIRST_HALF_END / tm.firstHalfEnd);
    }
    if (t < tm.halftimeEnd) {
      return MATCH_MINUTES.FIRST_HALF_END;
    }
    if (t < tm.secondHalfEnd) {
      return MATCH_MINUTES.SECOND_HALF_START + Math.floor((t - tm.halftimeEnd) * MATCH_MINUTES.FIRST_HALF_END / (tm.secondHalfEnd - tm.halftimeEnd));
    }

    if (!tm.et1End) return MATCH_MINUTES.SECOND_HALF_END;

    const etHalfMinutes = MATCH_MINUTES.ET_FIRST_HALF_END - MATCH_MINUTES.SECOND_HALF_END; // 15

    if (t < tm.et1End) {
      return MATCH_MINUTES.ET_FIRST_HALF_START + Math.floor((t - tm.secondHalfEnd) * etHalfMinutes / (tm.et1End - tm.secondHalfEnd));
    }
    if (t < tm.etHalftimeEnd) {
      return MATCH_MINUTES.ET_FIRST_HALF_END;
    }
    if (t < tm.et2End) {
      return MATCH_MINUTES.ET_SECOND_HALF_START + Math.floor((t - tm.etHalftimeEnd) * etHalfMinutes / (tm.et2End - tm.etHalftimeEnd));
    }

    return MATCH_MINUTES.ET_SECOND_HALF_END;
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
   * Stage 1: read-only match state snapshot.
   *
   * Returns the safe subset of LiveMatch state for live observability
   * (admin tooling, future max-silence detection, frontend read endpoints).
   * Deliberately excludes player arrays, full stats, timings, and any
   * mutable internal collections.
   */
  getMatchStateSnapshot() {
    const currentMinute = this.getMatchMinute();
    const lastTick = this.lastEventTickAt;
    const secondsSinceLastEvent = lastTick == null
      ? null
      : Math.max(0, this.tickElapsed - lastTick); // 1 tick = 1 real second
    const matchMinutesSinceLastEvent = this.lastEventMatchMinute == null
      ? null
      : Math.max(0, currentMinute - this.lastEventMatchMinute);

    return {
      fixtureId: this.fixtureId,
      state: this.state,
      phase: STATE_TO_PHASE[this.state] || null,
      currentMinute,
      tickElapsed: this.tickElapsed,
      homeTeam: { id: this.homeTeam.id, name: this.homeTeam.name },
      awayTeam: { id: this.awayTeam.id, name: this.awayTeam.name },
      score: { ...this.score },
      penaltyScore: this.getPenaltyScore(),
      winnerId: this.isFinished() ? this.getWinnerId() : null,
      isFinished: this.isFinished(),
      lastEventTickAt: this.lastEventTickAt,
      lastEventMatchMinute: this.lastEventMatchMinute,
      lastEventType: this.lastEventType,
      lastMajorEventTickAt: this.lastMajorEventTickAt,
      secondsSinceLastEvent,
      matchMinutesSinceLastEvent
    };
  }

  async awaitFinalization() {
    if (this._finalizationPromise) {
      await this._finalizationPromise;
    }
  }

  // === Admin Controls ===

  forceEnd() {
    const isDraw = this.score.home === this.score.away;
    const isKnockout = this.rules.knockout !== false;

    if (isDraw && isKnockout) {
      if (this.penaltyScore.home === 0 && this.penaltyScore.away === 0) {
        console.log(`[LiveMatch ${this.fixtureId}] forceEnd: Knockout draw - simulating instant penalties`);
        PenaltyShootout.simulateInstant(this.shootoutScores, this.shootoutTaken, this.penaltyScore);
      }
    }

    this.state = MATCH_STATES.FINISHED;

    this._finalizationPromise = this._finalizeMatch().catch(err => {
      console.error(`[LiveMatch ${this.fixtureId}] forceEnd finalize error:`, err);
    });
  }

  forceSetScore(home, away) {
    this.score.home = home;
    this.score.away = away;
    this._persistScore();
  }

  /**
   * Process one shootout tick (backward-compatible proxy)
   */
  _processShootoutTick() {
    // Sync state to sub-module before processing (test code may reassign these objects)
    this._shootout.ctx.shootoutScores = this.shootoutScores;
    this._shootout.ctx.shootoutTaken = this.shootoutTaken;
    this._shootout.ctx.penaltyScore = this.penaltyScore;
    this._shootout.currentShooter = this.currentShooter;

    const { events, finished } = this._shootout.processTick(
      this.tickElapsed,
      this.timings.et2End || this.tickElapsed
    );

    // Sync state back from sub-module
    this.currentShooter = this._shootout.currentShooter;
    this.shootoutScores = this._shootout.ctx.shootoutScores;
    this.shootoutTaken = this._shootout.ctx.shootoutTaken;
    this.penaltyScore = this._shootout.ctx.penaltyScore;

    if (finished) {
      this.state = MATCH_STATES.FINISHED;
    }
    return events;
  }

  // === Recovery ===

  static async recover(fixtureId, startTime, rules = {}) {
    const fixture = await Fixture.getById(fixtureId);
    const homeTeam = await Team.getRatingById(fixture.homeTeamId);
    const awayTeam = await Team.getRatingById(fixture.awayTeamId);

    const match = new LiveMatch(fixtureId, homeTeam, awayTeam, startTime, rules);
    await match.loadPlayers();

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
