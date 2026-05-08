const { LiveMatch, MATCH_STATES, EVENT_TYPES, KEY_EVENTS, DEFAULT_RULES } = require('../../../gamelogic/simulation/LiveMatch');

// Mock dependencies
jest.mock('../../../models/FixtureModel', () => ({
  updateStatus: jest.fn().mockResolvedValue(true),
  complete: jest.fn().mockResolvedValue(true),
  getById: jest.fn()
}));

jest.mock('../../../models/MatchEventModel', () => ({
  create: jest.fn().mockResolvedValue({ eventId: 1 }),
  findByFixture: jest.fn().mockResolvedValue([])
}));

jest.mock('../../../models/MatchReportModel', () => ({
  create: jest.fn().mockResolvedValue({ reportId: 1 })
}));

jest.mock('../../../models/TeamModel', () => ({
  updateMatchStats: jest.fn().mockResolvedValue(true),
  getRatingById: jest.fn()
}));

jest.mock('../../../models/PlayerModel', () => ({
  fetchByTeamId: jest.fn().mockResolvedValue([
    { playerId: 1, name: 'Player 1', attack: 80, isGoalkeeper: false },
    { playerId: 2, name: 'Player 2', attack: 70, isGoalkeeper: false },
    { playerId: 3, name: 'GK', attack: 20, isGoalkeeper: true }
  ])
}));

jest.mock('../../../db/connection', () => ({
  query: jest.fn().mockResolvedValue({ rows: [{ recent_form: 'WWLWL' }] })
}));

describe('LiveMatch', () => {
  let match;
  const homeTeam = { id: 1, name: 'Home FC', attackRating: 75, defenseRating: 70, goalkeeperRating: 72 };
  const awayTeam = { id: 2, name: 'Away United', attackRating: 70, defenseRating: 72, goalkeeperRating: 70 };
  const fixtureId = 123;
  const startTime = Date.now();

  beforeEach(() => {
    jest.clearAllMocks();
    match = new LiveMatch(fixtureId, homeTeam, awayTeam, startTime);
  });

  describe('constructor', () => {
    it('should initialize with correct defaults', () => {
      expect(match.fixtureId).toBe(fixtureId);
      expect(match.state).toBe(MATCH_STATES.SCHEDULED);
      expect(match.score).toEqual({ home: 0, away: 0 });
      expect(match.penaltyScore).toEqual({ home: 0, away: 0 });
      expect(match.tickElapsed).toBe(0);
    });

    it('should merge custom rules with defaults', () => {
      const customRules = { halfDurationMs: 300000, knockout: false };
      const customMatch = new LiveMatch(fixtureId, homeTeam, awayTeam, startTime, customRules);

      expect(customMatch.rules.halfDurationMs).toBe(300000);
      expect(customMatch.rules.knockout).toBe(false);
      expect(customMatch.rules.halftimeDurationMs).toBe(DEFAULT_RULES.halftimeDurationMs);
    });

    it('should compute correct timings', () => {
      expect(match.timings.firstHalfEnd).toBe(240);
      expect(match.timings.halftimeEnd).toBe(300);
      expect(match.timings.secondHalfEnd).toBe(540);
      expect(match.timings.et1End).toBe(660);
      expect(match.timings.etHalftimeEnd).toBe(690);
      expect(match.timings.et2End).toBe(810);
    });
  });

  describe('tick', () => {
    it('should not process ticks before start time', () => {
      const events = match.tick(startTime - 1000);
      expect(events).toEqual([]);
      expect(match.state).toBe(MATCH_STATES.SCHEDULED);
    });

    it('should transition to FIRST_HALF on first tick', () => {
      const events = match.tick(startTime);

      expect(match.state).toBe(MATCH_STATES.FIRST_HALF);
      expect(events.some(e => e.type === EVENT_TYPES.MATCH_START)).toBe(true);
    });

    it('should increment tickElapsed', () => {
      match.tick(startTime);
      expect(match.tickElapsed).toBe(1);

      match.tick(startTime + 1000);
      expect(match.tickElapsed).toBe(2);
    });

    it('should not tick when finished', () => {
      match.state = MATCH_STATES.FINISHED;
      const events = match.tick(startTime + 1000);

      expect(events).toEqual([]);
    });
  });

  describe('state transitions', () => {
    it('should transition to HALFTIME at tick 240', () => {
      // Simulate up to halftime
      for (let i = 0; i < 240; i++) {
        match.tick(startTime + i * 1000);
      }

      const events = match.tick(startTime + 240 * 1000);

      expect(match.state).toBe(MATCH_STATES.HALFTIME);
      expect(events.some(e => e.type === EVENT_TYPES.HALFTIME)).toBe(true);
    });

    it('should transition to SECOND_HALF at tick 300', () => {
      match.tickElapsed = 300;
      match.state = MATCH_STATES.HALFTIME;
      match.emittedTransitions.add('SCHEDULED->FIRST_HALF');
      match.emittedTransitions.add('FIRST_HALF->HALFTIME');

      const events = match.tick(startTime + 301 * 1000);

      expect(match.state).toBe(MATCH_STATES.SECOND_HALF);
      expect(events.some(e => e.type === EVENT_TYPES.SECOND_HALF_START)).toBe(true);
    });

    it('should finish at tick 540 if not a draw', () => {
      // State transitions check tickElapsed at start of _processTick
      // So set tickElapsed to the boundary value
      match.tickElapsed = 540;
      match.state = MATCH_STATES.SECOND_HALF;
      match.score = { home: 2, away: 1 };
      match.emittedTransitions.add('SCHEDULED->FIRST_HALF');
      match.emittedTransitions.add('FIRST_HALF->HALFTIME');
      match.emittedTransitions.add('HALFTIME->SECOND_HALF');

      match.tick(startTime + 541 * 1000);

      expect(match.state).toBe(MATCH_STATES.FINISHED);
    });

    it('should go to extra time at tick 540 if draw in knockout', () => {
      match.tickElapsed = 540;
      match.state = MATCH_STATES.SECOND_HALF;
      match.score = { home: 1, away: 1 };
      match.emittedTransitions.add('SCHEDULED->FIRST_HALF');
      match.emittedTransitions.add('FIRST_HALF->HALFTIME');
      match.emittedTransitions.add('HALFTIME->SECOND_HALF');

      const events = match.tick(startTime + 541 * 1000);

      expect(match.state).toBe(MATCH_STATES.EXTRA_TIME_1);
      expect(events.some(e => e.type === EVENT_TYPES.EXTRA_TIME_START)).toBe(true);
    });

    it('should skip extra time if rules disable it', () => {
      const noETMatch = new LiveMatch(fixtureId, homeTeam, awayTeam, startTime, {
        knockout: true,
        extraTimeEnabled: false,
        penaltiesEnabled: true
      });

      noETMatch.tickElapsed = 540;
      noETMatch.state = MATCH_STATES.SECOND_HALF;
      noETMatch.score = { home: 1, away: 1 };
      noETMatch.emittedTransitions.add('SCHEDULED->FIRST_HALF');
      noETMatch.emittedTransitions.add('FIRST_HALF->HALFTIME');
      noETMatch.emittedTransitions.add('HALFTIME->SECOND_HALF');

      noETMatch.tick(startTime + 541 * 1000);

      expect(noETMatch.state).toBe(MATCH_STATES.PENALTIES);
    });

    it('should allow draws if not knockout', () => {
      const leagueMatch = new LiveMatch(fixtureId, homeTeam, awayTeam, startTime, {
        knockout: false
      });

      leagueMatch.tickElapsed = 540;
      leagueMatch.state = MATCH_STATES.SECOND_HALF;
      leagueMatch.score = { home: 1, away: 1 };
      leagueMatch.emittedTransitions.add('SCHEDULED->FIRST_HALF');
      leagueMatch.emittedTransitions.add('FIRST_HALF->HALFTIME');
      leagueMatch.emittedTransitions.add('HALFTIME->SECOND_HALF');

      leagueMatch.tick(startTime + 541 * 1000);

      expect(leagueMatch.state).toBe(MATCH_STATES.FINISHED);
      expect(leagueMatch.getWinnerId()).toBeNull();
    });
  });

  describe('getMatchMinute', () => {
    it('should return correct minute in first half', () => {
      match.tickElapsed = 0;
      expect(match.getMatchMinute()).toBe(1);

      match.tickElapsed = 120;
      expect(match.getMatchMinute()).toBe(23);

      match.tickElapsed = 239;
      expect(match.getMatchMinute()).toBe(45);
    });

    it('should return 45 during halftime', () => {
      match.tickElapsed = 250;
      expect(match.getMatchMinute()).toBe(45);
    });

    it('should return correct minute in second half', () => {
      match.tickElapsed = 300;
      expect(match.getMatchMinute()).toBe(46);

      match.tickElapsed = 420;
      expect(match.getMatchMinute()).toBe(68);

      match.tickElapsed = 539;
      expect(match.getMatchMinute()).toBe(90);
    });

    it('should return correct minute in extra time', () => {
      match.tickElapsed = 540;
      expect(match.getMatchMinute()).toBe(91);

      match.tickElapsed = 659;
      expect(match.getMatchMinute()).toBe(105);

      match.tickElapsed = 690;
      expect(match.getMatchMinute()).toBe(106);

      match.tickElapsed = 809;
      expect(match.getMatchMinute()).toBe(120);
    });
  });

  describe('fast forward', () => {
    it('should fast-forward and only emit key events', () => {
      // Simulate being 100 ticks behind
      const events = match.tick(startTime + 100 * 1000);

      expect(match.tickElapsed).toBe(100);

      // Should only have key events (match_start at minimum)
      for (const evt of events) {
        expect(KEY_EVENTS.has(evt.type) || evt.type === EVENT_TYPES.MATCH_START).toBe(true);
      }
    });

    it('should catch up to current time', () => {
      match.tick(startTime + 500 * 1000);
      expect(match.tickElapsed).toBe(500);
    });

    it('should emit match_recap when skipping multiple minutes', () => {
      const events = match.tick(startTime + 300 * 1000);
      expect(events.some(e => e.type === EVENT_TYPES.MATCH_RECAP)).toBe(true);
    });
  });

  describe('score tracking', () => {
    it('should track score correctly', () => {
      match.score = { home: 2, away: 1 };

      expect(match.getScore()).toEqual({ home: 2, away: 1 });
    });

    it('should track penalty score', () => {
      match.penaltyScore = { home: 4, away: 3 };

      expect(match.getPenaltyScore()).toEqual({ home: 4, away: 3 });
    });

    it('should return null for penalty score if no shootout', () => {
      expect(match.getPenaltyScore()).toBeNull();
    });
  });

  describe('winner determination', () => {
    it('should return home team if home score higher', () => {
      match.score = { home: 2, away: 1 };
      expect(match.getWinnerId()).toBe(homeTeam.id);
    });

    it('should return away team if away score higher', () => {
      match.score = { home: 1, away: 3 };
      expect(match.getWinnerId()).toBe(awayTeam.id);
    });

    it('should return null for draw', () => {
      match.score = { home: 1, away: 1 };
      expect(match.getWinnerId()).toBeNull();
    });

    it('should use penalty score if present', () => {
      match.score = { home: 1, away: 1 };
      match.penaltyScore = { home: 3, away: 4 };

      expect(match.getWinnerId()).toBe(awayTeam.id);
    });
  });

  describe('admin controls', () => {
    it('should force end match', () => {
      match.state = MATCH_STATES.FIRST_HALF;
      match.forceEnd();

      expect(match.state).toBe(MATCH_STATES.FINISHED);
      expect(match.isFinished()).toBe(true);
    });

    it('should force set score', () => {
      match.forceSetScore(5, 3);

      expect(match.score).toEqual({ home: 5, away: 3 });
    });
  });

  describe('isFinished', () => {
    it('should return false when not finished', () => {
      match.state = MATCH_STATES.FIRST_HALF;
      expect(match.isFinished()).toBe(false);
    });

    it('should return true when finished', () => {
      match.state = MATCH_STATES.FINISHED;
      expect(match.isFinished()).toBe(true);
    });
  });

  describe('event creation', () => {
    it('should create events with correct structure', () => {
      match.state = MATCH_STATES.FIRST_HALF;
      match.tickElapsed = 50;
      match.score = { home: 1, away: 0 };

      const event = match._createEvent(EVENT_TYPES.GOAL, 23, {
        teamId: homeTeam.id,
        playerId: 1,
        displayName: 'Test Player'
      });

      expect(event.type).toBe(EVENT_TYPES.GOAL);
      expect(event.fixtureId).toBe(fixtureId);
      expect(event.minute).toBe(23);
      expect(event.score).toEqual({ home: 1, away: 0 });
      expect(event.homeTeam).toEqual({ id: homeTeam.id, name: homeTeam.name });
      expect(event.awayTeam).toEqual({ id: awayTeam.id, name: awayTeam.name });
      expect(event.teamId).toBe(homeTeam.id);
      expect(event.playerId).toBe(1);
      expect(event.displayName).toBe('Test Player');
    });
  });

  describe('penalty shootout', () => {
    beforeEach(() => {
      match.state = MATCH_STATES.PENALTIES;
      match.tickElapsed = 810;
      match.timings.et2End = 810;
    });

    it('should process shootout kicks', () => {
      // First kick at tick that's divisible by 3 offset
      match.tickElapsed = 810;
      const events = match._processShootoutTick();

      // Should have one shootout event
      expect(events.length).toBe(1);
      expect([EVENT_TYPES.SHOOTOUT_GOAL, EVENT_TYPES.SHOOTOUT_MISS, EVENT_TYPES.SHOOTOUT_SAVE])
        .toContain(events[0].type);
      expect(events[0]).toEqual(expect.objectContaining({
        shootoutRound: 1,
        kickIndex: 1,
        isSuddenDeath: false
      }));
    });

    it('should emit walkup micro-event before kick outcome tick', () => {
      match.tickElapsed = 812; // et2End=810, interval=3 => walkup tick
      const events = match._processShootoutTick();
      expect(events[0].type).toBe(EVENT_TYPES.SHOOTOUT_WALKUP);
    });

    it('should alternate between teams', () => {
      expect(match.currentShooter).toBe('home');

      match._processShootoutTick();
      expect(match.currentShooter).toBe('away');

      match.tickElapsed += 3;
      match._processShootoutTick();
      expect(match.currentShooter).toBe('home');
    });

    it('should end shootout when winner determined after 5 rounds', () => {
      // Simulate 5 rounds with home leading 5-2
      // Winner check happens after both teams have taken equal kicks
      // So we set it up as if away just took their 5th kick
      match.shootoutScores = { home: 5, away: 2 };
      match.shootoutTaken = { home: 5, away: 4 }; // Away about to take 5th
      match.currentShooter = 'away';

      // This will be away's 5th kick, after which winner is checked
      match._processShootoutTick();

      // After 5 kicks each, 5-2 or 5-3 means home wins
      expect(match.state).toBe(MATCH_STATES.FINISHED);
      expect(match.penaltyScore.home).toBeGreaterThan(match.penaltyScore.away);
    });
  });

  describe('stats tracking', () => {
    it('should initialize stats correctly', () => {
      expect(match.stats.home.shots).toBe(0);
      expect(match.stats.away.xg).toBe(0);
      expect(match.possessionTicks).toEqual({ home: 0, away: 0 });
    });
  });

  describe('KEY_EVENTS', () => {
    it('should include all important events', () => {
      expect(KEY_EVENTS.has(EVENT_TYPES.GOAL)).toBe(true);
      expect(KEY_EVENTS.has(EVENT_TYPES.HALFTIME)).toBe(true);
      expect(KEY_EVENTS.has(EVENT_TYPES.FULLTIME)).toBe(true);
      expect(KEY_EVENTS.has(EVENT_TYPES.SHOOTOUT_GOAL)).toBe(true);
      expect(KEY_EVENTS.has(EVENT_TYPES.MATCH_END)).toBe(true);
    });

    it('should not include non-key events', () => {
      expect(KEY_EVENTS.has(EVENT_TYPES.SHOT_SAVED)).toBe(false);
      expect(KEY_EVENTS.has(EVENT_TYPES.FOUL)).toBe(false);
      expect(KEY_EVENTS.has(EVENT_TYPES.CORNER)).toBe(false);
    });
  });

  describe('Stage 1: last-event tracking', () => {
    it('initialises last-event fields to null', () => {
      expect(match.lastEventTickAt).toBeNull();
      expect(match.lastEventMatchMinute).toBeNull();
      expect(match.lastEventType).toBeNull();
      expect(match.lastMajorEventTickAt).toBeNull();
    });

    it('updates last-event fields when tick() returns events', () => {
      // First tick on a SCHEDULED match always emits MATCH_START. The same
      // tick may also emit play events (foul, shot, etc.) from
      // EventGenerator.simulateMinute(1) depending on RNG, so we assert that
      // tracking is *populated and consistent*, not that the last event is
      // specifically MATCH_START.
      const events = match.tick(startTime);
      expect(events.length).toBeGreaterThan(0);

      const last = events[events.length - 1];
      expect(match.lastEventTickAt).toBe(match.tickElapsed);
      expect(match.lastEventType).toBe(last.type);
      expect(match.lastEventMatchMinute).toBe(last.minute);
      expect(typeof match.lastEventMatchMinute).toBe('number');
    });

    it('records lastMajorEventTickAt only for KEY_EVENTS', () => {
      // FOUL is not a key event; manually feed it through the recorder.
      match.tickElapsed = 30;
      match._recordLastEventStats([{ type: EVENT_TYPES.FOUL, minute: 5 }]);

      expect(match.lastEventTickAt).toBe(30);
      expect(match.lastEventType).toBe(EVENT_TYPES.FOUL);
      expect(match.lastMajorEventTickAt).toBeNull();

      // GOAL is a key event.
      match.tickElapsed = 31;
      match._recordLastEventStats([{ type: EVENT_TYPES.GOAL, minute: 6 }]);

      expect(match.lastMajorEventTickAt).toBe(31);
      expect(match.lastEventType).toBe(EVENT_TYPES.GOAL);
      expect(match.lastEventMatchMinute).toBe(6);
    });

    it('does not change last-event fields when tick produces no events', () => {
      // Force a paused-ish state: HALFTIME ticks generate no play events
      // until the halftime->second_half transition, but KEY_EVENTS already
      // emit on transition. Use _recordLastEventStats with an empty array
      // to confirm the no-op path.
      match.tickElapsed = 10;
      match._recordLastEventStats([{ type: EVENT_TYPES.GOAL, minute: 5 }]);
      const snapshot = {
        tick: match.lastEventTickAt,
        type: match.lastEventType,
        major: match.lastMajorEventTickAt
      };

      match._recordLastEventStats([]);
      match._recordLastEventStats(undefined);
      match._recordLastEventStats(null);

      expect(match.lastEventTickAt).toBe(snapshot.tick);
      expect(match.lastEventType).toBe(snapshot.type);
      expect(match.lastMajorEventTickAt).toBe(snapshot.major);
    });

    it('does not affect score, state, or finalization', () => {
      const initialScore = { ...match.score };
      const initialState = match.state;

      // Drive purely the recorder with arbitrary events.
      match._recordLastEventStats([
        { type: EVENT_TYPES.GOAL, minute: 12 },
        { type: EVENT_TYPES.SHOT_MISSED, minute: 13 }
      ]);

      expect(match.score).toEqual(initialScore);
      expect(match.state).toBe(initialState);
      expect(match.completionNotified).toBe(false);
    });
  });

  describe('Stage 2: max-silence flow events', () => {
    const { SIM, FLOW_EVENT_TYPES } = require('../../../gamelogic/constants');

    // Helper: put the match in a play state with given silence (in ticks).
    const armSilence = (m, { ticksSinceLast }) => {
      m.state = MATCH_STATES.FIRST_HALF;
      m.tickElapsed = 200; // ~minute 38 in default rules
      // _maybeEmitFlowEvent compares match-minutes, not ticks — so derive
      // lastEventMatchMinute from ticksSinceLast via the engine's ratio.
      const ticksPerMinute = m.timings.firstHalfEnd / 45;
      const minutesSinceLast = ticksSinceLast / ticksPerMinute;
      m.lastEventMatchMinute = m.getMatchMinute() - minutesSinceLast;
      m.lastEventTickAt = m.tickElapsed - ticksSinceLast;
      m.lastEventType = EVENT_TYPES.FOUL; // not a key event
      m.lastMajorEventTickAt = null;
    };

    it('does not emit a flow event before the silence threshold', () => {
      // 1 match-minute of silence; threshold is 2 -> no flow.
      const ticksPerMinute = match.timings.firstHalfEnd / 45;
      armSilence(match, { ticksSinceLast: Math.floor(ticksPerMinute * 1) });

      expect(match._maybeEmitFlowEvent()).toBeNull();
    });

    it('emits a single flow event after the silence threshold', () => {
      const ticksPerMinute = match.timings.firstHalfEnd / 45;
      armSilence(match, { ticksSinceLast: Math.ceil(ticksPerMinute * (SIM.MAX_SILENCE_MATCH_MINUTES + 1)) });

      const evt = match._maybeEmitFlowEvent();
      expect(evt).not.toBeNull();
      expect(FLOW_EVENT_TYPES.has(evt.type)).toBe(true);
      expect(evt.fixtureId).toBe(fixtureId);
      expect(typeof evt.minute).toBe('number');
      expect(['home', 'away']).toContain(evt.side);
      expect(evt.teamId === homeTeam.id || evt.teamId === awayTeam.id).toBe(true);
      expect(typeof evt.description).toBe('string');
      expect(evt.description.length).toBeGreaterThan(0);
      expect(evt.importance).toBe('minor');
      expect(['possession', 'build_up', 'defence']).toContain(evt.phase);
      expect(evt.intensity).toBeGreaterThanOrEqual(1);
      expect(evt.intensity).toBeLessThanOrEqual(4);
      expect(evt.score).toEqual({ home: 0, away: 0 });
    });

    it('does not emit during non-play states (HALFTIME, FINISHED, SCHEDULED, PENALTIES)', () => {
      const ticksPerMinute = match.timings.firstHalfEnd / 45;
      const farPastThreshold = Math.ceil(ticksPerMinute * (SIM.MAX_SILENCE_MATCH_MINUTES + 5));

      for (const nonPlay of [
        MATCH_STATES.SCHEDULED,
        MATCH_STATES.HALFTIME,
        MATCH_STATES.ET_HALFTIME,
        MATCH_STATES.PENALTIES,
        MATCH_STATES.FINISHED
      ]) {
        armSilence(match, { ticksSinceLast: farPastThreshold });
        match.state = nonPlay;
        const events = match._processTick();
        const flowEvents = events.filter(e => FLOW_EVENT_TYPES.has(e.type));
        expect(flowEvents).toEqual([]);
      }
    });

    it('does not change score when emitting a flow event', () => {
      const ticksPerMinute = match.timings.firstHalfEnd / 45;
      armSilence(match, { ticksSinceLast: Math.ceil(ticksPerMinute * (SIM.MAX_SILENCE_MATCH_MINUTES + 1)) });
      const before = { ...match.score };

      const evt = match._maybeEmitFlowEvent();
      expect(evt).not.toBeNull();
      expect(match.score).toEqual(before);
    });

    it('updates last-event tracking after a flow event reaches the feed', () => {
      // Run through a full tick so _recordLastEventStats fires too.
      const ticksPerMinute = match.timings.firstHalfEnd / 45;
      armSilence(match, { ticksSinceLast: Math.ceil(ticksPerMinute * (SIM.MAX_SILENCE_MATCH_MINUTES + 2)) });

      // Mark this minute as already processed so EventGenerator won't add
      // additional play events to the same tick (keeps the test focused).
      match.processedMinutes.add(match.getMatchMinute());

      const events = match.tick(startTime + match.tickElapsed * 1000);
      const flow = events.find(e => FLOW_EVENT_TYPES.has(e.type));
      expect(flow).toBeDefined();
      expect(match.lastEventType).toBe(flow.type);
      expect(match.lastEventTickAt).toBe(match.tickElapsed);
    });

    it('does not emit two flow events with the same type back-to-back when an alternative exists', () => {
      const ticksPerMinute = match.timings.firstHalfEnd / 45;
      const silentTicks = Math.ceil(ticksPerMinute * (SIM.MAX_SILENCE_MATCH_MINUTES + 1));

      armSilence(match, { ticksSinceLast: silentTicks });
      const first = match._maybeEmitFlowEvent();
      expect(first).not.toBeNull();

      // Reset silence so a second flow can fire, but keep lastFlowEventType.
      armSilence(match, { ticksSinceLast: silentTicks });
      const second = match._maybeEmitFlowEvent();
      expect(second).not.toBeNull();
      expect(second.type).not.toBe(first.type);
    });

    it('respects the cooldown after a major event', () => {
      const ticksPerMinute = match.timings.firstHalfEnd / 45;
      armSilence(match, { ticksSinceLast: Math.ceil(ticksPerMinute * (SIM.MAX_SILENCE_MATCH_MINUTES + 5)) });

      // Pretend a goal just fired half a match-minute ago (< 1-min cooldown).
      const cooldownTicks = SIM.FLOW_COOLDOWN_AFTER_MAJOR_MATCH_MINUTES * ticksPerMinute;
      match.lastMajorEventTickAt = match.tickElapsed - Math.floor(cooldownTicks / 2);

      expect(match._maybeEmitFlowEvent()).toBeNull();
    });

    it('does not emit during fast-forward catch-up', () => {
      // tick() with `now` far in the future enters the fast-forward branch.
      // None of the events in the returned array should be flow events,
      // because they aren't in KEY_EVENTS (filtered out by tick()).
      const events = match.tick(startTime + 200 * 1000);
      for (const e of events) {
        expect(FLOW_EVENT_TYPES.has(e.type)).toBe(false);
      }
    });

    it('flow event types are intentionally NOT in KEY_EVENTS', () => {
      // Documented decision: flow filler is real-time-only and must not
      // survive fast-forward — match_recap covers gaps instead.
      for (const type of FLOW_EVENT_TYPES) {
        expect(KEY_EVENTS.has(type)).toBe(false);
      }
    });
  });

  describe('Stage 1: getMatchStateSnapshot', () => {
    it('returns the documented shape with no leaked internals', () => {
      const snap = match.getMatchStateSnapshot();

      expect(snap).toEqual(expect.objectContaining({
        fixtureId,
        state: MATCH_STATES.SCHEDULED,
        phase: 'pre_match',
        currentMinute: expect.any(Number),
        tickElapsed: 0,
        homeTeam: { id: homeTeam.id, name: homeTeam.name },
        awayTeam: { id: awayTeam.id, name: awayTeam.name },
        score: { home: 0, away: 0 },
        penaltyScore: null,
        winnerId: null,
        isFinished: false,
        lastEventTickAt: null,
        lastEventMatchMinute: null,
        lastEventType: null,
        lastMajorEventTickAt: null,
        secondsSinceLastEvent: null,
        matchMinutesSinceLastEvent: null
      }));

      // Should not leak players / full stats / timings.
      expect(snap).not.toHaveProperty('homePlayers');
      expect(snap).not.toHaveProperty('awayPlayers');
      expect(snap).not.toHaveProperty('stats');
      expect(snap).not.toHaveProperty('timings');
      expect(snap).not.toHaveProperty('processedMinutes');
    });

    it('reports phase by MATCH_STATES', () => {
      match.state = MATCH_STATES.FIRST_HALF;
      expect(match.getMatchStateSnapshot().phase).toBe('first_half');

      match.state = MATCH_STATES.HALFTIME;
      expect(match.getMatchStateSnapshot().phase).toBe('halftime');

      match.state = MATCH_STATES.PENALTIES;
      expect(match.getMatchStateSnapshot().phase).toBe('penalty_shootout');

      match.state = MATCH_STATES.FINISHED;
      expect(match.getMatchStateSnapshot().phase).toBe('finished');
    });

    it('computes secondsSinceLastEvent and matchMinutesSinceLastEvent once events have fired', () => {
      match.state = MATCH_STATES.FIRST_HALF;
      match.tickElapsed = 100;
      match._recordLastEventStats([{ type: EVENT_TYPES.GOAL, minute: 18 }]);

      // Move time forward without emitting anything.
      match.tickElapsed = 130;

      const snap = match.getMatchStateSnapshot();
      expect(snap.lastEventType).toBe(EVENT_TYPES.GOAL);
      expect(snap.lastEventMatchMinute).toBe(18);
      expect(snap.secondsSinceLastEvent).toBe(30); // 130 - 100
      // currentMinute at tick=130 is computed by getMatchMinute()
      expect(snap.matchMinutesSinceLastEvent).toBe(snap.currentMinute - 18);
    });

    it('reports winnerId only after the match is finished', () => {
      match.score = { home: 2, away: 1 };
      match.state = MATCH_STATES.SECOND_HALF;
      expect(match.getMatchStateSnapshot().winnerId).toBeNull();

      match.state = MATCH_STATES.FINISHED;
      expect(match.getMatchStateSnapshot().winnerId).toBe(homeTeam.id);
    });
  });
});
