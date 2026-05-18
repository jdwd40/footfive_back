const { EventGenerator } = require('../../../gamelogic/simulation/EventGenerator');
const { EVENT_TYPES, PERSISTABLE_MATCH_EVENT_TYPES } = require('../../../gamelogic/constants');

describe('EventGenerator', () => {
  const homeTeam = { id: 1, name: 'Home FC', attackRating: 80, defenseRating: 75, goalkeeperRating: 74 };
  const awayTeam = { id: 2, name: 'Away FC', attackRating: 72, defenseRating: 70, goalkeeperRating: 71 };

  const buildContext = () => ({
    fixtureId: 42,
    homeTeam,
    awayTeam,
    homePlayers: [
      { playerId: 1, name: 'Home Striker', attack: 85, isGoalkeeper: false },
      { playerId: 2, name: 'Home Mid', attack: 72, isGoalkeeper: false },
      { playerId: 3, name: 'Home GK', attack: 10, isGoalkeeper: true }
    ],
    awayPlayers: [
      { playerId: 4, name: 'Away Striker', attack: 82, isGoalkeeper: false },
      { playerId: 5, name: 'Away Mid', attack: 70, isGoalkeeper: false },
      { playerId: 6, name: 'Away GK', attack: 10, isGoalkeeper: true }
    ],
    stats: {
      home: { possession: 0, shots: 0, shotsOnTarget: 0, xg: 0, corners: 0, fouls: 0, yellowCards: 0, redCards: 0 },
      away: { possession: 0, shots: 0, shotsOnTarget: 0, xg: 0, corners: 0, fouls: 0, yellowCards: 0, redCards: 0 }
    },
    score: { home: 0, away: 0 },
    possessionTicks: { home: 0, away: 0 }
  });

  const createEvent = (type, minute, payload = {}) => ({ type, minute, ...payload });

  const baseSequenceContext = {
    startZone: 55,
    possessionState: 'build_up',
    possessionSide: 'home',
    emitBuildUp: true
  };

  afterEach(() => {
    if (Math.random.mockRestore) Math.random.mockRestore();
  });

  it('initializes phase context state', () => {
    const generator = new EventGenerator(buildContext(), createEvent, jest.fn());
    expect(generator.phaseState).toEqual({
      momentum: { home: 0, away: 0 },
      fieldZone: 50,
      possessionSide: null,
      possessionState: 'neutral',
      sustainedPressure: { home: 0, away: 0 }
    });
  });

  it('clamps momentum to configured limits', () => {
    const generator = new EventGenerator(buildContext(), createEvent, jest.fn());
    generator.phaseState.momentum.home = 95;
    generator._updateMomentum('home', 'goal');
    expect(generator.phaseState.momentum.home).toBe(100);
    expect(generator.phaseState.momentum.away).toBeLessThanOrEqual(0);
  });

  describe('Stage C: chained attack flow', () => {
    const setupGenerator = (ctx = buildContext()) => {
      const generator = new EventGenerator(ctx, createEvent, jest.fn());
      // Suppress midfield opener so the attack chain starts clean unless the
      // test re-enables it.
      generator.lastMidfieldEmittedMinute = 99;
      return { generator, ctx };
    };

    it('emits an ordered attack chain with shared bundleId and monotonic bundleStep', () => {
      const { generator } = setupGenerator();
      jest.spyOn(generator, '_defenseBlocks').mockReturnValue(false);
      // 0.9 disables: midfield opener (n/a, already throttled), penalty roll,
      // shot_blocked roll, on_target (so we get shot_missed → simple terminal).
      jest.spyOn(Math, 'random').mockReturnValue(0.9);

      const events = generator._handleAttack(homeTeam, awayTeam, 'home', 12, { ...baseSequenceContext, startZone: 50 });

      const chainEvents = events.filter((e) => e.chain_type === 'attack');
      expect(chainEvents.map((e) => e.type)).toEqual([
        EVENT_TYPES.GOAL_BUILD_UP,
        EVENT_TYPES.GOAL_BUILD_UP,
        EVENT_TYPES.SHOT_MISSED
      ]);
      expect(chainEvents[0].phase).toBe('push_forward');
      expect(chainEvents[1].phase).toBe('beat_defender');

      const bundleIds = new Set(chainEvents.map((e) => e.bundleId));
      expect(bundleIds.size).toBe(1);

      for (let i = 1; i < chainEvents.length; i++) {
        expect(chainEvents[i].bundleStep).toBeGreaterThan(chainEvents[i - 1].bundleStep);
      }
    });

    it('marks exactly one event in the attack chain as terminal', () => {
      const { generator } = setupGenerator();
      jest.spyOn(generator, '_defenseBlocks').mockReturnValue(false);
      jest.spyOn(Math, 'random').mockReturnValue(0.9);

      const events = generator._handleAttack(homeTeam, awayTeam, 'home', 12, baseSequenceContext);
      const chain = events.filter((e) => e.chain_type === 'attack');
      const terminals = chain.filter((e) => e.chain_terminal === true);
      expect(terminals).toHaveLength(1);
      expect(terminals[0].type).toBe(EVENT_TYPES.SHOT_MISSED);
    });

    it('attaches pacing metadata to every chain step', () => {
      const { generator } = setupGenerator();
      jest.spyOn(generator, '_defenseBlocks').mockReturnValue(false);
      jest.spyOn(Math, 'random').mockReturnValue(0.9);

      const events = generator._handleAttack(homeTeam, awayTeam, 'home', 12, baseSequenceContext);
      const chain = events.filter((e) => e.chain_type === 'attack');
      for (const evt of chain) {
        expect(evt.pacing).toBeDefined();
        expect(typeof evt.pacing.delay_ms).toBe('number');
        expect(typeof evt.pacing.hold_ms).toBe('number');
      }
    });

    it('emits attack_breakdown terminal and a non-chain corner when defense blocks', () => {
      const { generator } = setupGenerator();
      jest.spyOn(generator, '_defenseBlocks').mockReturnValue(true);
      // 0.05 < 0.5 (reason), 0.05 < 0.3 (corner), 0.05 < 0.35 (counter follow-up triggers)
      jest.spyOn(Math, 'random').mockReturnValue(0.05);

      const events = generator._handleAttack(homeTeam, awayTeam, 'home', 12, baseSequenceContext);
      const breakdown = events.find((e) => e.type === EVENT_TYPES.ATTACK_BREAKDOWN);
      expect(breakdown).toBeDefined();
      expect(breakdown.chain_type).toBe('attack');
      expect(breakdown.chain_terminal).toBe(true);
      expect(['defender_block', 'shut_down']).toContain(breakdown.reason);

      const corner = events.find((e) => e.type === EVENT_TYPES.CORNER);
      expect(corner).toBeDefined();
      expect(corner.chain_type).toBeUndefined();
      expect(corner.chain_terminal).toBeUndefined();
    });

    it('persists score only on the goal event', () => {
      const persistScore = jest.fn();
      const ctx = buildContext();
      const generator = new EventGenerator(ctx, createEvent, persistScore);
      generator.lastMidfieldEmittedMinute = 99;
      jest.spyOn(generator, '_defenseBlocks').mockReturnValue(false);
      jest.spyOn(generator, '_goalkeeperSaves').mockReturnValue(false);
      // 0.5 → no penalty, no shot_blocked, on_target=true; keeper save mocked false → GOAL.
      jest.spyOn(Math, 'random').mockReturnValue(0.5);

      const events = generator._handleAttack(homeTeam, awayTeam, 'home', 30, baseSequenceContext);
      const goalEvents = events.filter((e) => e.type === EVENT_TYPES.GOAL);
      expect(goalEvents).toHaveLength(1);
      expect(ctx.score.home).toBe(1);
      expect(ctx.score.away).toBe(0);
      expect(persistScore).toHaveBeenCalledTimes(1);

      // The non-goal events that share the chain must not also have outcome 'scored'.
      const otherScored = events.filter((e) => e.type !== EVENT_TYPES.GOAL && e.outcome === 'scored');
      expect(otherScored).toHaveLength(0);
    });

    it('shot_saved does not change the score', () => {
      const ctx = buildContext();
      const generator = new EventGenerator(ctx, createEvent, jest.fn());
      generator.lastMidfieldEmittedMinute = 99;
      jest.spyOn(generator, '_defenseBlocks').mockReturnValue(false);
      jest.spyOn(generator, '_goalkeeperSaves').mockReturnValue(true);
      jest.spyOn(Math, 'random').mockReturnValue(0.5);

      const events = generator._handleAttack(homeTeam, awayTeam, 'home', 30, baseSequenceContext);
      expect(events.some((e) => e.type === EVENT_TYPES.SHOT_SAVED)).toBe(true);
      expect(ctx.score).toEqual({ home: 0, away: 0 });
    });

    it('shot_missed does not change the score', () => {
      const ctx = buildContext();
      const generator = new EventGenerator(ctx, createEvent, jest.fn());
      generator.lastMidfieldEmittedMinute = 99;
      jest.spyOn(generator, '_defenseBlocks').mockReturnValue(false);
      // 0.9 makes on_target_check fail → shot_missed.
      jest.spyOn(Math, 'random').mockReturnValue(0.9);

      const events = generator._handleAttack(homeTeam, awayTeam, 'home', 30, baseSequenceContext);
      expect(events.some((e) => e.type === EVENT_TYPES.SHOT_MISSED)).toBe(true);
      expect(ctx.score).toEqual({ home: 0, away: 0 });
    });

    it('shot_blocked does not change the score', () => {
      const ctx = buildContext();
      const generator = new EventGenerator(ctx, createEvent, jest.fn());
      generator.lastMidfieldEmittedMinute = 99;
      jest.spyOn(generator, '_defenseBlocks').mockReturnValue(false);
      const rand = jest.spyOn(Math, 'random');
      // Sequence in _handleAttack → _handleShot:
      //   1: penalty check (want >0.08 → 0.9)
      //   2: baseXg multiplier (any → 0.5)
      //   3: shot_blocked roll (<0.12 → 0.05)
      //   4+: _selectScorer / momentum / etc.
      rand
        .mockReturnValueOnce(0.9)
        .mockReturnValueOnce(0.5)
        .mockReturnValueOnce(0.05)
        .mockReturnValue(0.5);

      const events = generator._handleAttack(homeTeam, awayTeam, 'home', 30, baseSequenceContext);
      const blocked = events.find((e) => e.type === EVENT_TYPES.SHOT_BLOCKED);
      expect(blocked).toBeDefined();
      expect(blocked.chain_type).toBe('attack');
      expect(blocked.chain_terminal).toBe(true);
      expect(ctx.score).toEqual({ home: 0, away: 0 });
    });
  });

  describe('Stage C: penalty events stay legacy (no partial chain metadata)', () => {
    const forcePenalty = () => {
      const ctx = buildContext();
      const generator = new EventGenerator(ctx, createEvent, jest.fn());
      generator.lastMidfieldEmittedMinute = 99;
      jest.spyOn(generator, '_defenseBlocks').mockReturnValue(false);
      // 'high' pressure tier so penaltyChance = HIGH_PRESSURE_PENALTY_CHANCE (0.08).
      jest.spyOn(generator, '_calculatePressure').mockReturnValue('high');
      // 0 < 0.08 forces the penalty diversion; rest of Math.random calls
      // resolve the penalty outcome deterministically.
      jest.spyOn(Math, 'random').mockReturnValue(0);
      return { ctx, generator };
    };

    it('penalty diversion returns a single legacy event with no chain metadata', () => {
      const { generator } = forcePenalty();
      const events = generator._handleAttack(homeTeam, awayTeam, 'home', 50, baseSequenceContext);

      expect(events).toHaveLength(1);
      const penalty = events[0];
      expect([
        EVENT_TYPES.PENALTY_SCORED,
        EVENT_TYPES.PENALTY_SAVED,
        EVENT_TYPES.PENALTY_MISSED
      ]).toContain(penalty.type);

      // No attack-chain bundle id / step leak through.
      expect(penalty.bundleId).toBeUndefined();
      expect(penalty.bundleStep).toBeUndefined();
      // No Stage C chain metadata.
      expect(penalty.chain_type).toBeUndefined();
      expect(penalty.chain_terminal).toBeUndefined();
      expect(penalty.pacing).toBeUndefined();
    });

    it('penalty diversion never emits attack chain steps alongside the penalty', () => {
      const { generator } = forcePenalty();
      const events = generator._handleAttack(homeTeam, awayTeam, 'home', 50, baseSequenceContext);

      const chainStepTypes = [
        EVENT_TYPES.MIDFIELD_BATTLE,
        EVENT_TYPES.GOAL_BUILD_UP,
        EVENT_TYPES.ATTACK_BREAKDOWN,
        EVENT_TYPES.SHOT_SAVED,
        EVENT_TYPES.SHOT_MISSED,
        EVENT_TYPES.SHOT_BLOCKED,
        EVENT_TYPES.GOAL,
        EVENT_TYPES.COUNTER_ATTACK,
        EVENT_TYPES.COUNTER_BREAKDOWN
      ];
      for (const evt of events) {
        expect(chainStepTypes).not.toContain(evt.type);
      }

      // Defensive sweep: no event in the penalty branch carries any chain field.
      for (const evt of events) {
        expect(evt.chain_type).toBeUndefined();
        expect(evt.chain_terminal).toBeUndefined();
        expect(evt.pacing).toBeUndefined();
        expect(evt.bundleId).toBeUndefined();
        expect(evt.bundleStep).toBeUndefined();
      }
    });
  });

  describe('Stage C: counter chain', () => {
    it('emits an ordered counter chain with a single terminal', () => {
      const generator = new EventGenerator(buildContext(), createEvent, jest.fn());
      // _defenseBlocks=true → counter_breakdown is the terminal step.
      jest.spyOn(generator, '_defenseBlocks').mockReturnValue(true);
      jest.spyOn(Math, 'random').mockReturnValue(0.5);

      const events = generator._runCounterChain(awayTeam, homeTeam, 'away', 33);

      expect(events.map((e) => e.type)).toEqual([
        EVENT_TYPES.COUNTER_ATTACK,
        EVENT_TYPES.COUNTER_BREAKDOWN
      ]);

      const bundleIds = new Set(events.map((e) => e.bundleId));
      expect(bundleIds.size).toBe(1);

      const steps = events.map((e) => e.bundleStep);
      expect(steps).toEqual([0, 1]);

      const terminals = events.filter((e) => e.chain_terminal === true);
      expect(terminals).toHaveLength(1);
      expect(terminals[0].type).toBe(EVENT_TYPES.COUNTER_BREAKDOWN);

      for (const evt of events) {
        expect(evt.chain_type).toBe('counter');
        expect(evt.pacing).toBeDefined();
      }
    });

    it('terminates the counter chain on a shot when defense does not block', () => {
      const generator = new EventGenerator(buildContext(), createEvent, jest.fn());
      jest.spyOn(generator, '_defenseBlocks').mockReturnValue(false);
      // 0.9 → no shot_blocked, no on_target → shot_missed.
      jest.spyOn(Math, 'random').mockReturnValue(0.9);

      const events = generator._runCounterChain(awayTeam, homeTeam, 'away', 33);
      const last = events[events.length - 1];
      expect(last.chain_terminal).toBe(true);
      expect([
        EVENT_TYPES.SHOT_MISSED,
        EVENT_TYPES.SHOT_SAVED,
        EVENT_TYPES.SHOT_BLOCKED,
        EVENT_TYPES.GOAL
      ]).toContain(last.type);
    });
  });

  describe('Stage C: midfield_battle throttling', () => {
    it('is not emitted every match minute', () => {
      const generator = new EventGenerator(buildContext(), createEvent, jest.fn());
      // 0.5 > COUNTER_FROM_MIDFIELD_CHANCE (0.15) so no counter follow-up
      // events sneak in and skew the count.
      jest.spyOn(Math, 'random').mockReturnValue(0.5);

      const seqCtx = { startZone: 50, possessionSide: 'home' };

      const e1 = generator._maybeEmitMidfieldBattle(1, seqCtx);
      expect(e1.filter((e) => e.type === EVENT_TYPES.MIDFIELD_BATTLE)).toHaveLength(1);

      for (let m = 2; m < 5; m++) {
        const emitted = generator._maybeEmitMidfieldBattle(m, seqCtx);
        expect(emitted.filter((e) => e.type === EVENT_TYPES.MIDFIELD_BATTLE)).toHaveLength(0);
      }

      // After cooldown elapses, can emit again.
      const e5 = generator._maybeEmitMidfieldBattle(5, seqCtx);
      expect(e5.filter((e) => e.type === EVENT_TYPES.MIDFIELD_BATTLE)).toHaveLength(1);
    });

    it('emits midfield_battle as a single-step terminal chain', () => {
      const generator = new EventGenerator(buildContext(), createEvent, jest.fn());
      // Force no counter spawn for a clean assertion.
      jest.spyOn(Math, 'random').mockReturnValue(0.99);

      const events = generator._maybeEmitMidfieldBattle(7, { startZone: 50, possessionSide: 'home' });
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(EVENT_TYPES.MIDFIELD_BATTLE);
      expect(events[0].chain_type).toBe('midfield');
      expect(events[0].chain_terminal).toBe(true);
      expect(events[0].bundleStep).toBe(0);
      expect(events[0].pacing).toBeDefined();
    });
  });

  describe('Stage C: chain event types are persistable', () => {
    it('every chain event type is allowed by the CHECK whitelist', () => {
      const chainTypes = [
        EVENT_TYPES.MIDFIELD_BATTLE,
        EVENT_TYPES.GOAL_BUILD_UP,
        EVENT_TYPES.ATTACK_BREAKDOWN,
        EVENT_TYPES.COUNTER_ATTACK,
        EVENT_TYPES.COUNTER_BREAKDOWN,
        EVENT_TYPES.SHOT_SAVED,
        EVENT_TYPES.SHOT_MISSED,
        EVENT_TYPES.SHOT_BLOCKED,
        EVENT_TYPES.GOAL,
        EVENT_TYPES.CORNER
      ];
      for (const type of chainTypes) {
        expect(PERSISTABLE_MATCH_EVENT_TYPES.has(type)).toBe(true);
      }
    });

    it('simulateMinute only emits known/persistable types over many minutes', () => {
      const generator = new EventGenerator(buildContext(), createEvent, jest.fn());
      jest.spyOn(generator, '_defenseBlocks').mockReturnValue(false);
      jest.spyOn(generator, '_goalkeeperSaves').mockReturnValue(true);

      const known = new Set(Object.values(EVENT_TYPES));
      let seenAny = false;
      for (let m = 1; m <= 60; m++) {
        const events = generator.simulateMinute(m);
        for (const evt of events) {
          seenAny = true;
          expect(known.has(evt.type)).toBe(true);
        }
      }
      expect(seenAny).toBe(true);
    });

    it('uses readable bundleId values that include fixtureId and stay under VARCHAR(50)', () => {
      const generator = new EventGenerator(buildContext(), createEvent, jest.fn());
      jest.spyOn(generator, '_defenseBlocks').mockReturnValue(true);
      jest.spyOn(Math, 'random').mockReturnValue(0.5);

      const events = generator._handleAttack(homeTeam, awayTeam, 'home', 88, baseSequenceContext);
      const chained = events.filter((e) => e.bundleId);
      expect(chained.length).toBeGreaterThan(0);
      for (const evt of chained) {
        expect(evt.bundleId.length).toBeLessThanOrEqual(50);
        expect(evt.bundleId).toMatch(/^(attack|counter|midfield)_42_88_\d+$/);
      }
    });
  });
});
