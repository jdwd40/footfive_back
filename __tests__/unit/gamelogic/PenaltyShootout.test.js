const { PenaltyShootout } = require('../../../gamelogic/simulation/PenaltyShootout');
const { EVENT_TYPES, SIM, PERSISTABLE_MATCH_EVENT_TYPES } = require('../../../gamelogic/constants');

describe('PenaltyShootout (Stage F: chained kick messaging)', () => {
  const homeTeam = { id: 1, name: 'Metro City' };
  const awayTeam = { id: 2, name: 'Airway City' };

  const buildContext = () => ({
    fixtureId: 99,
    homeTeam,
    awayTeam,
    homePlayers: [
      { playerId: 11, name: 'H1', attack: 80, isGoalkeeper: false },
      { playerId: 12, name: 'H2', attack: 78, isGoalkeeper: false },
      { playerId: 13, name: 'H-GK', attack: 5, isGoalkeeper: true }
    ],
    awayPlayers: [
      { playerId: 21, name: 'A1', attack: 80, isGoalkeeper: false },
      { playerId: 22, name: 'A2', attack: 78, isGoalkeeper: false },
      { playerId: 23, name: 'A-GK', attack: 5, isGoalkeeper: true }
    ],
    score: { home: 0, away: 0 },
    penaltyScore: { home: 0, away: 0 },
    shootoutScores: { home: 0, away: 0 },
    shootoutTaken: { home: 0, away: 0 }
  });

  const createEvent = (type, minute, payload = {}) => ({ type, minute, ...payload });

  const buildShootout = () => {
    const ctx = buildContext();
    const selectScorer = (players) => players.find((p) => !p.isGoalkeeper) || null;
    const shootout = new PenaltyShootout(ctx, createEvent, selectScorer);
    return { ctx, shootout };
  };

  // Helper: drive one full kick (walkup → result → optional reaction) and
  // return the events emitted across the three ticks.
  const playOneKick = (shootout, baseTick = 0) => {
    const collected = [];
    for (let off = 2; off <= 4; off++) {
      const { events } = shootout.processTick(baseTick + off, baseTick);
      collected.push(...events);
    }
    return collected;
  };

  afterEach(() => {
    if (Math.random.mockRestore) Math.random.mockRestore();
  });

  it('walkup → result chain shares one bundleId with monotonic bundleStep', () => {
    const { shootout } = buildShootout();
    // 0.5 < 0.85 → onTarget; 0.5 > 0.12 → not saved → scored. Routine kick,
    // no reaction expected.
    jest.spyOn(Math, 'random').mockReturnValue(0.5);

    const walkup = shootout.processTick(2, 0).events[0];
    const result = shootout.processTick(3, 0).events[0];

    expect(walkup.type).toBe(EVENT_TYPES.SHOOTOUT_WALKUP);
    expect([
      EVENT_TYPES.SHOOTOUT_GOAL,
      EVENT_TYPES.SHOOTOUT_SAVE,
      EVENT_TYPES.SHOOTOUT_MISS
    ]).toContain(result.type);

    expect(walkup.bundleId).toBe(result.bundleId);
    expect(walkup.bundleStep).toBe(0);
    expect(result.bundleStep).toBe(1);
    expect(walkup.bundleId).toMatch(/^shootout_99_\d+_\d+$/);
    expect(walkup.bundleId.length).toBeLessThanOrEqual(50);
  });

  it('uses chain_type "shootout" and pacing metadata on every chain step', () => {
    const { shootout } = buildShootout();
    jest.spyOn(Math, 'random').mockReturnValue(0.5);

    const events = playOneKick(shootout);
    expect(events.length).toBeGreaterThanOrEqual(2);
    for (const evt of events) {
      expect(evt.chain_type).toBe('shootout');
      expect(evt.pacing).toBeDefined();
      expect(typeof evt.pacing.delay_ms).toBe('number');
      expect(typeof evt.pacing.hold_ms).toBe('number');
    }
  });

  it('marks exactly one chain_terminal: true per kick bundle', () => {
    const { shootout } = buildShootout();
    jest.spyOn(Math, 'random').mockReturnValue(0.5);

    const events = playOneKick(shootout);
    const byBundle = new Map();
    for (const evt of events) {
      const arr = byBundle.get(evt.bundleId) || [];
      arr.push(evt);
      byBundle.set(evt.bundleId, arr);
    }
    expect(byBundle.size).toBe(1);
    const [, bundleEvents] = [...byBundle.entries()][0];
    const terminals = bundleEvents.filter((e) => e.chain_terminal === true);
    expect(terminals).toHaveLength(1);
  });

  it('routine kicks do NOT emit a reaction (the result is terminal)', () => {
    const { shootout } = buildShootout();
    jest.spyOn(Math, 'random').mockReturnValue(0.5);

    const events = playOneKick(shootout);
    expect(events.some((e) => e.type === EVENT_TYPES.SHOOTOUT_REACTION)).toBe(false);
    const result = events.find((e) =>
      [EVENT_TYPES.SHOOTOUT_GOAL, EVENT_TYPES.SHOOTOUT_SAVE, EVENT_TYPES.SHOOTOUT_MISS].includes(e.type)
    );
    expect(result.chain_terminal).toBe(true);
  });

  it('decider kicks DO emit a reaction (the reaction is terminal, result is not)', () => {
    const { ctx, shootout } = buildShootout();
    // Engineer state where the next kick is a decider: 5-3 after 5 home, 4
    // away. Away takes their 5th kick — if they miss/save, home wins; if
    // they score, still home 5-4 with home having 0 left to take, so 4-1
    // remaining... Actually any away result with home already on 5 is
    // mathematically decisive when away has only one kick left.
    ctx.shootoutScores = { home: 5, away: 3 };
    ctx.shootoutTaken = { home: 5, away: 4 };
    shootout.currentShooter = 'away';

    jest.spyOn(Math, 'random').mockReturnValue(0.5);

    const walkup = shootout.processTick(2, 0).events[0];
    const result = shootout.processTick(3, 0).events[0];
    const reactionEvents = shootout.processTick(4, 0).events;

    expect(walkup.type).toBe(EVENT_TYPES.SHOOTOUT_WALKUP);
    expect(result.chain_terminal).toBe(false);
    const reaction = reactionEvents.find((e) => e.type === EVENT_TYPES.SHOOTOUT_REACTION);
    expect(reaction).toBeDefined();
    expect(reaction.chain_terminal).toBe(true);
    expect(reaction.bundleId).toBe(walkup.bundleId);
    expect(reaction.bundleStep).toBe(2);
  });

  it('shootout_goal updates the correct side score and does not touch the other side', () => {
    const { ctx, shootout } = buildShootout();
    // 0.5 → scored.
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(ctx.shootoutScores).toEqual({ home: 0, away: 0 });

    shootout.currentShooter = 'home';
    shootout.processTick(3, 0); // home result tick (offset 3, modulo 0)

    expect(ctx.shootoutScores.home).toBe(1);
    expect(ctx.shootoutScores.away).toBe(0);
    expect(ctx.shootoutTaken.home).toBe(1);
    expect(ctx.shootoutTaken.away).toBe(0);
  });

  it('shootout_save and shootout_miss do not change shootoutScores', () => {
    // saved
    {
      const { ctx, shootout } = buildShootout();
      // 0.5 < 0.85 onTarget; 0.05 < 0.12 saved.
      const rand = jest.spyOn(Math, 'random');
      rand.mockReturnValueOnce(0.5).mockReturnValueOnce(0.05).mockReturnValue(0.5);
      shootout.processTick(3, 0);
      expect(ctx.shootoutScores).toEqual({ home: 0, away: 0 });
      rand.mockRestore();
    }
    // missed
    {
      const { ctx, shootout } = buildShootout();
      // 0.9 > 0.85 → not on target → missed.
      jest.spyOn(Math, 'random').mockReturnValue(0.9);
      shootout.processTick(3, 0);
      expect(ctx.shootoutScores).toEqual({ home: 0, away: 0 });
    }
  });

  it('shootout chain bundleId namespace never collides with attack/counter/penalty', () => {
    const { shootout } = buildShootout();
    jest.spyOn(Math, 'random').mockReturnValue(0.5);

    const events = playOneKick(shootout);
    for (const evt of events) {
      if (!evt.bundleId) continue;
      expect(evt.bundleId).toMatch(/^shootout_/);
      expect(evt.bundleId).not.toMatch(/^attack_/);
      expect(evt.bundleId).not.toMatch(/^counter_/);
      expect(evt.bundleId).not.toMatch(/^midfield_/);
      expect(evt.bundleId).not.toMatch(/^penalty_/);
    }
  });

  it('shootout chain never carries an in-match penalty event type', () => {
    const { shootout } = buildShootout();
    jest.spyOn(Math, 'random').mockReturnValue(0.5);

    const events = [];
    // Run a full standard shootout 5x2 = 10 kicks worth of ticks.
    for (let t = 2; t <= 32; t++) {
      events.push(...shootout.processTick(t, 0).events);
      if (shootout.ctx.shootoutTaken.home + shootout.ctx.shootoutTaken.away >= 10) break;
    }

    const inMatchPenaltyTypes = new Set([
      EVENT_TYPES.PENALTY_AWARDED,
      EVENT_TYPES.PENALTY_WALKUP,
      EVENT_TYPES.PENALTY_RUN_UP,
      EVENT_TYPES.PENALTY_SCORED,
      EVENT_TYPES.PENALTY_SAVED,
      EVENT_TYPES.PENALTY_MISSED,
      EVENT_TYPES.KICKOFF_RESTART
    ]);
    for (const evt of events) {
      expect(inMatchPenaltyTypes.has(evt.type)).toBe(false);
    }
  });

  it('only emits canonical shootout event types', () => {
    const { shootout } = buildShootout();
    jest.spyOn(Math, 'random').mockReturnValue(0.5);

    const allowed = new Set([
      EVENT_TYPES.SHOOTOUT_WALKUP,
      EVENT_TYPES.SHOOTOUT_GOAL,
      EVENT_TYPES.SHOOTOUT_SAVE,
      EVENT_TYPES.SHOOTOUT_MISS,
      EVENT_TYPES.SHOOTOUT_REACTION
    ]);
    const events = [];
    for (let t = 2; t <= 35; t++) {
      events.push(...shootout.processTick(t, 0).events);
    }
    expect(events.length).toBeGreaterThan(0);
    for (const evt of events) {
      expect(allowed.has(evt.type)).toBe(true);
    }
  });

  it('walkup names the upcoming taker and the result names the same taker', () => {
    const { shootout } = buildShootout();
    jest.spyOn(Math, 'random').mockReturnValue(0.5);

    const walkup = shootout.processTick(2, 0).events[0];
    const result = shootout.processTick(3, 0).events[0];

    expect(walkup.displayName).toBeTruthy();
    expect(result.displayName).toBe(walkup.displayName);
    expect(walkup.description).toContain(walkup.displayName);
    expect(walkup.description).toContain('walks up for');
    expect(result.description).toContain('takes the penalty');
  });

  it('does not break the winner detection after 5 rounds (home wins 5-2)', () => {
    const { ctx, shootout } = buildShootout();
    ctx.shootoutScores = { home: 5, away: 2 };
    ctx.shootoutTaken = { home: 5, away: 4 };
    shootout.currentShooter = 'away';

    // 0.9 → off target → miss. Away misses 5th kick → home wins 5-2.
    jest.spyOn(Math, 'random').mockReturnValue(0.9);

    const { finished } = shootout.processTick(3, 0);
    expect(finished).toBe(true);
    expect(ctx.penaltyScore).toEqual({ home: 5, away: 2 });
  });

  it('still resolves a sudden-death kick after 5 rounds tied', () => {
    const { ctx, shootout } = buildShootout();
    ctx.shootoutScores = { home: 4, away: 4 };
    ctx.shootoutTaken = { home: 5, away: 5 };
    shootout.currentShooter = 'home';

    // 0.5 → scored. After this, home leads but only one of two kicks taken
    // in the round, so finished should stay false until away replies.
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const first = shootout.processTick(3, 0);
    expect(first.finished).toBe(false);
    expect(ctx.shootoutScores.home).toBe(5);
    expect(ctx.shootoutTaken.home).toBe(6);

    // Away replies on the next result tick.
    const second = shootout.processTick(6, 0);
    // Away also scored → still tied at 5-5, continue sudden death.
    expect(second.finished).toBe(false);
    expect(ctx.shootoutScores).toEqual({ home: 5, away: 5 });
  });

  it('static simulateInstant produces a non-tied final score', () => {
    const scores = { home: 0, away: 0 };
    const taken = { home: 0, away: 0 };
    const penalty = { home: 0, away: 0 };
    PenaltyShootout.simulateInstant(scores, taken, penalty);
    expect(penalty.home).not.toBe(penalty.away);
    expect(penalty.home).toBe(scores.home);
    expect(penalty.away).toBe(scores.away);
  });

  it('no kickoff_restart is emitted at any point during the shootout', () => {
    const { shootout } = buildShootout();
    jest.spyOn(Math, 'random').mockReturnValue(0.5);

    const events = [];
    for (let t = 2; t <= 35; t++) {
      events.push(...shootout.processTick(t, 0).events);
    }
    expect(events.some((e) => e.type === EVENT_TYPES.KICKOFF_RESTART)).toBe(false);
  });

  describe('Stage F2: shootout chain persistence', () => {
    it('shootout_walkup is in PERSISTABLE_MATCH_EVENT_TYPES', () => {
      expect(PERSISTABLE_MATCH_EVENT_TYPES.has(EVENT_TYPES.SHOOTOUT_WALKUP)).toBe(true);
    });

    it('shootout_reaction is in PERSISTABLE_MATCH_EVENT_TYPES', () => {
      expect(PERSISTABLE_MATCH_EVENT_TYPES.has(EVENT_TYPES.SHOOTOUT_REACTION)).toBe(true);
    });

    it('every shootout result event type is in PERSISTABLE_MATCH_EVENT_TYPES (regression)', () => {
      for (const type of [EVENT_TYPES.SHOOTOUT_GOAL, EVENT_TYPES.SHOOTOUT_SAVE, EVENT_TYPES.SHOOTOUT_MISS]) {
        expect(PERSISTABLE_MATCH_EVENT_TYPES.has(type)).toBe(true);
      }
    });

    it('emitted walkup carries the fields the persistence layer needs', () => {
      const { shootout } = buildShootout();
      jest.spyOn(Math, 'random').mockReturnValue(0.5);

      const walkup = shootout.processTick(2, 0).events[0];
      expect(walkup.type).toBe(EVENT_TYPES.SHOOTOUT_WALKUP);
      expect(walkup.bundleId).toMatch(/^shootout_99_\d+_\d+$/);
      expect(typeof walkup.bundleStep).toBe('number');
      expect(walkup.chain_type).toBe('shootout');
      expect(walkup.chain_terminal).toBe(false);
      expect(typeof walkup.pacing.delay_ms).toBe('number');
      expect(typeof walkup.pacing.hold_ms).toBe('number');
      expect(typeof walkup.description).toBe('string');
      expect(walkup.description.length).toBeGreaterThan(0);
      expect(walkup.teamId).toBeTruthy();
      // playerId is included when a taker is selected; build context guarantees one.
      expect(walkup.playerId).toBeTruthy();
    });

    it('emitted reaction (on a decider kick) carries the fields the persistence layer needs', () => {
      const { ctx, shootout } = buildShootout();
      // Engineer a decider so the reaction actually fires.
      ctx.shootoutScores = { home: 5, away: 3 };
      ctx.shootoutTaken = { home: 5, away: 4 };
      shootout.currentShooter = 'away';
      jest.spyOn(Math, 'random').mockReturnValue(0.5);

      shootout.processTick(2, 0); // walkup
      shootout.processTick(3, 0); // result
      const reactionTick = shootout.processTick(4, 0);
      const reaction = reactionTick.events.find((e) => e.type === EVENT_TYPES.SHOOTOUT_REACTION);

      expect(reaction).toBeDefined();
      expect(reaction.bundleId).toMatch(/^shootout_99_\d+_\d+$/);
      expect(typeof reaction.bundleStep).toBe('number');
      expect(reaction.chain_type).toBe('shootout');
      expect(reaction.chain_terminal).toBe(true);
      expect(typeof reaction.pacing.delay_ms).toBe('number');
      expect(typeof reaction.pacing.hold_ms).toBe('number');
      expect(typeof reaction.description).toBe('string');
      expect(reaction.description.length).toBeGreaterThan(0);
    });

    it('every event emitted across a full shootout has the bundle metadata that survives persistence', () => {
      const { shootout } = buildShootout();
      jest.spyOn(Math, 'random').mockReturnValue(0.5);

      const events = [];
      for (let t = 2; t <= 35; t++) {
        events.push(...shootout.processTick(t, 0).events);
      }
      expect(events.length).toBeGreaterThan(0);

      for (const evt of events) {
        // chain_type is the load-bearing tag for reconstruction; bundleId
        // and bundleStep position the event within the kick.
        expect(evt.chain_type).toBe('shootout');
        expect(evt.bundleId).toMatch(/^shootout_99_\d+_\d+$/);
        expect(evt.bundleId.length).toBeLessThanOrEqual(50);
        expect(typeof evt.bundleStep).toBe('number');
        expect(evt.pacing).toBeDefined();
      }
    });
  });
});
