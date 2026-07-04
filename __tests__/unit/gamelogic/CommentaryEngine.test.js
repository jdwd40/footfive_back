/**
 * CommentaryEngine unit tests (Stage G).
 *
 * The engine is constructed directly with a fake createEvent and an
 * injectable rng, mirroring how LiveMatch wires it. Trigger logic is
 * deterministic from context; rng only picks between template variants,
 * so tests assert shape/type/valid output rather than exact strings
 * (except where a pool is pinned via rng).
 */
const { CommentaryEngine, ATTACK_SIGNAL_TYPES } = require('../../../gamelogic/simulation/CommentaryEngine');
const { EVENT_TYPES, COMMENTARY, OBSERVATION_SUBTYPES } = require('../../../gamelogic/constants');

const homeTeam = { id: 1, name: 'Metro City', attackRating: 80, defenseRating: 78, goalkeeperRating: 76 };
const awayTeam = { id: 2, name: 'Port Hilo', attackRating: 70, defenseRating: 68, goalkeeperRating: 66 };

// Minimal stand-in for LiveMatch._createEvent: stamps score snapshot,
// side derivation and matchPhase the way the real one does.
function makeCreateEvent(score, matchPhase = 'second_half') {
  return (type, minute, data = {}) => {
    const event = {
      type,
      fixtureId: 123,
      minute,
      timestamp: Date.now(),
      score: { ...score },
      homeTeam: { id: homeTeam.id, name: homeTeam.name },
      awayTeam: { id: awayTeam.id, name: awayTeam.name },
      ...data
    };
    if (event.side !== 'home' && event.side !== 'away') {
      event.side = event.teamId === homeTeam.id ? 'home'
        : event.teamId === awayTeam.id ? 'away' : null;
    }
    if (event.matchPhase === undefined) event.matchPhase = matchPhase;
    return event;
  };
}

function makeEngine({ score = { home: 0, away: 0 }, rng = Math.random, tuning, matchPhase } = {}) {
  const ctx = { fixtureId: 123, homeTeam, awayTeam, score };
  return {
    engine: new CommentaryEngine(ctx, makeCreateEvent(score, matchPhase), { rng, tuning }),
    score
  };
}

// Attacking signal event helper (side home unless stated).
function signal(type, minute, side = 'home') {
  return {
    type,
    minute,
    side,
    teamId: side === 'home' ? homeTeam.id : awayTeam.id
  };
}

describe('CommentaryEngine', () => {
  describe('decorate: varied wording for existing events', () => {
    it('returns a non-empty string description for every supported type', () => {
      const { engine } = makeEngine({ score: { home: 1, away: 0 } });
      const types = [
        EVENT_TYPES.GOAL, EVENT_TYPES.SHOT_SAVED, EVENT_TYPES.SHOT_MISSED,
        EVENT_TYPES.SHOT_BLOCKED, EVENT_TYPES.CORNER, EVENT_TYPES.FOUL,
        EVENT_TYPES.YELLOW_CARD, EVENT_TYPES.RED_CARD,
        EVENT_TYPES.PENALTY_AWARDED, EVENT_TYPES.PENALTY_SCORED,
        EVENT_TYPES.PENALTY_SAVED, EVENT_TYPES.PENALTY_MISSED,
        EVENT_TYPES.HALFTIME, EVENT_TYPES.FULLTIME,
        EVENT_TYPES.EXTRA_TIME_START, EVENT_TYPES.EXTRA_TIME_HALF,
        EVENT_TYPES.EXTRA_TIME_END, EVENT_TYPES.SHOOTOUT_START
      ];
      for (const type of types) {
        const evt = {
          type,
          minute: 30,
          side: 'home',
          teamId: homeTeam.id,
          displayName: 'A. Striker',
          score: { home: 1, away: 0 },
          description: 'stock'
        };
        engine.decorate(evt);
        expect(typeof evt.description).toBe('string');
        expect(evt.description.length).toBeGreaterThan(0);
        expect(evt.description).not.toBe('stock');
        expect(evt.description).not.toMatch(/undefined|null|\$\{/);
      }
    });

    it('produces varied wording across repeated events of the same type', () => {
      const { engine } = makeEngine();
      const seen = new Set();
      for (let i = 0; i < 20; i++) {
        const evt = {
          type: EVENT_TYPES.SHOT_MISSED, minute: 10 + i, side: 'home',
          teamId: homeTeam.id, displayName: 'A. Striker', description: ''
        };
        engine.decorate(evt);
        seen.add(evt.description);
      }
      expect(seen.size).toBeGreaterThan(1);
    });

    it('never repeats the same line back-to-back for one type', () => {
      const { engine } = makeEngine();
      let prev = null;
      for (let i = 0; i < 30; i++) {
        const evt = {
          type: EVENT_TYPES.FOUL, minute: i, side: 'away',
          teamId: awayTeam.id, displayName: 'B. Midfielder', description: ''
        };
        engine.decorate(evt);
        expect(evt.description).not.toBe(prev);
        prev = evt.description;
      }
    });

    it('goal wording reflects context: equaliser vs extending a lead', () => {
      const { engine } = makeEngine();
      // Equaliser: away scores to 1-1.
      const equaliser = {
        type: EVENT_TYPES.GOAL, minute: 40, side: 'away', teamId: awayTeam.id,
        displayName: 'C. Forward', score: { home: 1, away: 1 }, description: ''
      };
      engine.decorate(equaliser);
      expect(equaliser.description).toMatch(/level|equaliser|square|parity/i);

      // Extending: home scores to 3-1.
      const extender = {
        type: EVENT_TYPES.GOAL, minute: 60, side: 'home', teamId: homeTeam.id,
        displayName: 'A. Striker', score: { home: 3, away: 1 }, description: ''
      };
      engine.decorate(extender);
      expect(extender.description).toMatch(/again|pulling away|another|daylight|trouble/i);
    });

    it('does not touch structured fields or unsupported types', () => {
      const { engine } = makeEngine();
      const breakdown = {
        type: EVENT_TYPES.ATTACK_BREAKDOWN, minute: 20, side: 'away',
        teamId: awayTeam.id, description: 'Port Hilo shut down Metro City\'s attack.',
        chain_type: 'attack', chain_terminal: true, bundleId: 'attack_1_20_1'
      };
      const before = { ...breakdown };
      engine.decorate(breakdown);
      // Description is varied, but every structured/chain field survives.
      expect(typeof breakdown.description).toBe('string');
      expect(breakdown.description.length).toBeGreaterThan(0);
      expect(breakdown.side).toBe(before.side);
      expect(breakdown.teamId).toBe(before.teamId);
      expect(breakdown.chain_type).toBe(before.chain_type);
      expect(breakdown.chain_terminal).toBe(before.chain_terminal);
      expect(breakdown.bundleId).toBe(before.bundleId);

      const unsupported = {
        type: EVENT_TYPES.MATCH_START, minute: 1, description: 'stock start'
      };
      engine.decorate(unsupported);
      expect(unsupported.description).toBe('stock start');

      const goal = {
        type: EVENT_TYPES.GOAL, minute: 20, side: 'home', teamId: homeTeam.id,
        score: { home: 1, away: 0 }, bundleId: 'attack_1_20_2', bundleStep: 3,
        chain_type: 'attack', chain_terminal: true, xg: 0.4, description: ''
      };
      engine.decorate(goal);
      expect(goal.bundleId).toBe('attack_1_20_2');
      expect(goal.bundleStep).toBe(3);
      expect(goal.chain_terminal).toBe(true);
      expect(goal.xg).toBe(0.4);
      expect(goal.side).toBe('home');
    });
  });

  describe('decorate: flow-chain variety (build-up / breakdown / counter / restart)', () => {
    const homePlayers = [
      { playerId: 1, name: 'M. Vane', attack: 85, isGoalkeeper: false },
      { playerId: 2, name: 'T. Orr', attack: 70, isGoalkeeper: false },
      { playerId: 3, name: 'G. Keeper', attack: 10, isGoalkeeper: true }
    ];

    const makePlayerEngine = ({ rng = Math.random } = {}) => {
      const score = { home: 0, away: 0 };
      const ctx = { fixtureId: 123, homeTeam, awayTeam, score, homePlayers, awayPlayers: [] };
      return new CommentaryEngine(ctx, makeCreateEvent(score), { rng });
    };

    const flowEvent = (type, extra = {}) => ({
      type, minute: 20, side: 'home', teamId: homeTeam.id,
      bundleId: 'attack_123_20_1', bundleStep: 0, chain_type: 'attack',
      chain_terminal: false, description: 'stock', ...extra
    });

    it('varies goal_build_up per phase without undefined values', () => {
      const engine = makePlayerEngine();
      for (const phase of ['push_forward', 'beat_defender', 'force_issue']) {
        const seen = new Set();
        for (let i = 0; i < 15; i++) {
          const evt = flowEvent(EVENT_TYPES.GOAL_BUILD_UP, { phase });
          engine.decorate(evt);
          expect(evt.description).not.toBe('stock');
          expect(evt.description).not.toMatch(/undefined|null|\$\{/);
          seen.add(evt.description);
        }
        expect(seen.size).toBeGreaterThan(1);
      }
    });

    it('leaves the shot_attempt build-up (already varied at emission) alone', () => {
      const engine = makePlayerEngine();
      const evt = flowEvent(EVENT_TYPES.GOAL_BUILD_UP, {
        phase: 'shot_attempt', displayName: 'M. Vane', description: 'M. Vane lets fly!'
      });
      engine.decorate(evt);
      expect(evt.description).toBe('M. Vane lets fly!');
    });

    it('stamps a player on player-less build-up steps when rng allows, team-only otherwise', () => {
      // rng below FLOW_PLAYER_LINE_CHANCE → player attached and named.
      const withPlayer = makePlayerEngine({ rng: () => 0.1 });
      const evt = flowEvent(EVENT_TYPES.GOAL_BUILD_UP, { phase: 'beat_defender' });
      withPlayer.decorate(evt);
      expect(evt.displayName).toBe('M. Vane');
      expect(evt.playerId).toBe(1);
      expect(evt.description).toContain('M. Vane');
      // Chain metadata untouched.
      expect(evt.bundleId).toBe('attack_123_20_1');
      expect(evt.chain_terminal).toBe(false);

      // rng above the gate → no player, team-only line.
      const teamOnly = makePlayerEngine({ rng: () => 0.9 });
      const evt2 = flowEvent(EVENT_TYPES.GOAL_BUILD_UP, { phase: 'beat_defender' });
      teamOnly.decorate(evt2);
      expect(evt2.displayName).toBeUndefined();
      expect(evt2.description).toContain(homeTeam.name);
    });

    it('falls back to team-only lines when the side has no player data', () => {
      const { engine } = makeEngine({ rng: () => 0.1 }); // ctx without players
      const evt = flowEvent(EVENT_TYPES.COUNTER_ATTACK, {
        chain_type: 'counter', bundleId: 'counter_123_20_1'
      });
      engine.decorate(evt);
      expect(evt.displayName).toBeUndefined();
      expect(evt.description).toContain(homeTeam.name);
      expect(evt.description).not.toMatch(/undefined/);
    });

    it('names the defender as the stopper and the attacker as the loser on attack_breakdown', () => {
      const engine = makePlayerEngine();
      let namedAttacker = 0;
      for (let i = 0; i < 15; i++) {
        // Away defends (teamId = away), home was attacking.
        const evt = flowEvent(EVENT_TYPES.ATTACK_BREAKDOWN, {
          side: 'away', teamId: awayTeam.id, chain_terminal: true
        });
        engine.decorate(evt);
        expect(evt.description).toContain(awayTeam.name);
        if (evt.description.includes(homeTeam.name)) namedAttacker++;
        expect(evt.description).not.toMatch(/undefined/);
      }
      expect(namedAttacker).toBeGreaterThan(0);
    });

    it('varies counter_breakdown, kickoff_restart and midfield_battle', () => {
      const engine = makePlayerEngine();
      for (const [type, extra] of [
        [EVENT_TYPES.COUNTER_BREAKDOWN, { chain_type: 'counter', chain_terminal: true }],
        [EVENT_TYPES.KICKOFF_RESTART, { bundleId: undefined, chain_type: undefined }],
        [EVENT_TYPES.MIDFIELD_BATTLE, {}]
      ]) {
        const seen = new Set();
        for (let i = 0; i < 15; i++) {
          const evt = flowEvent(type, extra);
          engine.decorate(evt);
          expect(evt.description).not.toBe('stock');
          expect(evt.description).toContain(homeTeam.name);
          expect(evt.description).not.toMatch(/undefined/);
          seen.add(evt.description);
        }
        expect(seen.size).toBeGreaterThan(1);
      }
    });

    it('varies the pre-corner block-behind but never as a turnover, and skips flow-filler defensive_action', () => {
      const engine = makePlayerEngine();
      for (let i = 0; i < 15; i++) {
        const evt = flowEvent(EVENT_TYPES.DEFENSIVE_ACTION, {
          side: 'away', teamId: awayTeam.id, reason: 'blocked_behind',
          chain_terminal: true, cornerConceded: true
        });
        engine.decorate(evt);
        expect(evt.description).toContain(awayTeam.name);
        expect(evt.description).not.toMatch(/lose|lost|shut down|breaks down/i);
      }

      const filler = {
        type: EVENT_TYPES.DEFENSIVE_ACTION, minute: 30, side: 'home',
        teamId: homeTeam.id, description: 'Metro City hold a firm line.'
      };
      engine.decorate(filler);
      expect(filler.description).toBe('Metro City hold a firm line.');
    });
  });

  describe('observe: weak context emits nothing', () => {
    it('emits no observation for a quiet early match', () => {
      const { engine } = makeEngine();
      for (let minute = 1; minute <= 30; minute++) {
        const obs = engine.observe([], minute);
        expect(obs).toBeNull();
      }
    });

    it('emits no observation after a single isolated shot', () => {
      const { engine } = makeEngine();
      expect(engine.observe([signal(EVENT_TYPES.SHOT_MISSED, 10)], 10)).toBeNull();
      expect(engine.observe([], 12)).toBeNull();
    });

    it('emits nothing when allowEmit is false, but still ingests context', () => {
      const { engine } = makeEngine();
      for (const m of [10, 11, 12]) {
        expect(
          engine.observe([signal(EVENT_TYPES.SHOT_SAVED, m)], m, { allowEmit: false })
        ).toBeNull();
      }
      expect(engine.getStateSnapshot().attackSignalCount).toBe(3);
    });
  });

  describe('observe: pressure/momentum after repeated attacks', () => {
    it('emits a pressure observation after repeated shots/corners in a window', () => {
      const { engine } = makeEngine({ rng: () => 0 });
      engine.observe([signal(EVENT_TYPES.SHOT_SAVED, 20)], 20);
      engine.observe([signal(EVENT_TYPES.CORNER, 22)], 22);
      const obs = engine.observe([signal(EVENT_TYPES.SHOT_MISSED, 24)], 24);

      expect(obs).not.toBeNull();
      expect(obs.type).toBe(EVENT_TYPES.MATCH_OBSERVATION);
      expect(obs.subtype).toBe(OBSERVATION_SUBTYPES.PRESSURE);
      expect(obs.teamId).toBe(homeTeam.id);
      expect(obs.side).toBe('home');
      expect(obs.matchPhase).toBeTruthy();
      expect(obs.description).toContain(homeTeam.name);
      expect(typeof obs.severity).toBe('string');
    });

    it('upgrades to momentum when the pressing side also scored recently', () => {
      const { engine, score } = makeEngine({ rng: () => 0 });
      score.home = 1;
      engine.observe([signal(EVENT_TYPES.GOAL, 20)], 20);
      engine.observe([signal(EVENT_TYPES.SHOT_SAVED, 22)], 22);
      // Goal at 20 blocks nothing globally (no observation emitted for a
      // 1-0 ordinary goal), so the spell at 26 reads as momentum.
      const obs = engine.observe([signal(EVENT_TYPES.CORNER, 26)], 26);
      expect(obs).not.toBeNull();
      expect(obs.subtype).toBe(OBSERVATION_SUBTYPES.MOMENTUM);
      expect(obs.side).toBe('home');
    });

    it('signals outside the rolling window do not trigger pressure', () => {
      const { engine } = makeEngine({ rng: () => 0 });
      engine.observe([signal(EVENT_TYPES.SHOT_SAVED, 5)], 5);
      engine.observe([signal(EVENT_TYPES.CORNER, 6)], 6);
      // Window is PRESSURE_WINDOW_MINUTES (8): by minute 30 both expired.
      const obs = engine.observe([signal(EVENT_TYPES.SHOT_MISSED, 30)], 30);
      expect(obs).toBeNull();
    });
  });

  describe('observe: scoreline / collapse when a team falls further behind', () => {
    it('emits scoreline observation when a team goes 2+ goals behind', () => {
      const { engine, score } = makeEngine({ rng: () => 0 });
      score.home = 1;
      engine.observe([signal(EVENT_TYPES.GOAL, 20)], 20);
      score.home = 2;
      const secondGoal = signal(EVENT_TYPES.GOAL, 40);
      secondGoal.score = { home: 2, away: 0 };
      const obs = engine.observe([secondGoal], 40);

      expect(obs).not.toBeNull();
      // 2-0 with both goals >10min apart => scoreline (not collapse).
      expect(obs.subtype).toBe(OBSERVATION_SUBTYPES.SCORELINE);
      // Observation is about the conceding side.
      expect(obs.teamId).toBe(awayTeam.id);
      expect(obs.side).toBe('away');
      expect(obs.description).toContain(awayTeam.name);
    });

    it('emits collapse when the second goal comes quickly and the gap is 2+', () => {
      const { engine, score } = makeEngine({ rng: () => 0 });
      score.home = 1;
      engine.observe([signal(EVENT_TYPES.GOAL, 50)], 50);
      score.home = 2;
      const quickSecond = signal(EVENT_TYPES.GOAL, 55);
      const obs = engine.observe([quickSecond], 55);

      expect(obs).not.toBeNull();
      expect(obs.subtype).toBe(OBSERVATION_SUBTYPES.COLLAPSE);
      expect(obs.side).toBe('away');
      expect(obs.severity).toBe('high');
    });

    it('emits comeback when a trailing team equalises', () => {
      const { engine, score } = makeEngine({ rng: () => 0 });
      score.home = 1;
      engine.observe([signal(EVENT_TYPES.GOAL, 20)], 20);
      score.away = 1;
      const equaliser = signal(EVENT_TYPES.GOAL, 70, 'away');
      const obs = engine.observe([equaliser], 70);

      expect(obs).not.toBeNull();
      expect(obs.subtype).toBe(OBSERVATION_SUBTYPES.COMEBACK);
      expect(obs.teamId).toBe(awayTeam.id);
      expect(obs.side).toBe('away');
    });

    it('an ordinary opening goal produces no observation', () => {
      const { engine, score } = makeEngine({ rng: () => 0 });
      score.home = 1;
      const obs = engine.observe([signal(EVENT_TYPES.GOAL, 20)], 20);
      expect(obs).toBeNull();
    });
  });

  describe('cooldowns prevent spam', () => {
    it('respects the minimum gap between observations', () => {
      const { engine } = makeEngine({ rng: () => 0 });
      engine.observe([signal(EVENT_TYPES.SHOT_SAVED, 20)], 20);
      engine.observe([signal(EVENT_TYPES.CORNER, 21)], 21);
      const first = engine.observe([signal(EVENT_TYPES.SHOT_MISSED, 22)], 22);
      expect(first).not.toBeNull();

      // Keep the pressure alive: within MIN_MINUTES_BETWEEN_OBSERVATIONS
      // nothing may fire, whatever the context.
      const blocked = engine.observe([signal(EVENT_TYPES.SHOT_SAVED, 24)], 24);
      expect(blocked).toBeNull();
      const stillBlocked = engine.observe([signal(EVENT_TYPES.CORNER, 26)], 26);
      expect(stillBlocked).toBeNull();
    });

    it('does not repeat the same subtype within its cooldown window', () => {
      const { engine } = makeEngine({ rng: () => 0 });
      engine.observe([signal(EVENT_TYPES.SHOT_SAVED, 20)], 20);
      engine.observe([signal(EVENT_TYPES.CORNER, 21)], 21);
      const first = engine.observe([signal(EVENT_TYPES.SHOT_MISSED, 22)], 22);
      expect(first.subtype).toBe(OBSERVATION_SUBTYPES.PRESSURE);

      // Past the global min gap but inside SUBTYPE_COOLDOWN_MINUTES (15):
      // same-side pressure spell must not re-fire. (Team cooldown would also
      // block; both protect the same repetition.)
      engine.observe([signal(EVENT_TYPES.SHOT_SAVED, 28)], 28);
      engine.observe([signal(EVENT_TYPES.CORNER, 29)], 29);
      const repeat = engine.observe([signal(EVENT_TYPES.SHOT_MISSED, 30)], 30);
      expect(repeat).toBeNull();
    });

    it('never exceeds MAX_OBSERVATIONS_PER_MATCH', () => {
      const tuning = {
        MIN_MINUTES_BETWEEN_OBSERVATIONS: 0,
        SUBTYPE_COOLDOWN_MINUTES: 0,
        TEAM_COOLDOWN_MINUTES: 0
      };
      const { engine } = makeEngine({ rng: () => 0, tuning });
      let emitted = 0;
      for (let minute = 1; minute <= 120; minute++) {
        // Constant heavy pressure from alternating sides.
        const side = minute % 2 === 0 ? 'home' : 'away';
        const events = [
          signal(EVENT_TYPES.SHOT_SAVED, minute, side),
          signal(EVENT_TYPES.CORNER, minute, side),
          signal(EVENT_TYPES.SHOT_MISSED, minute, side)
        ];
        if (engine.observe(events, minute)) emitted++;
      }
      expect(emitted).toBeGreaterThan(0);
      expect(emitted).toBeLessThanOrEqual(COMMENTARY.MAX_OBSERVATIONS_PER_MATCH);
    });
  });

  describe('observation event contract', () => {
    it('includes side, matchPhase, score, minute, fixtureId and subtype', () => {
      const { engine } = makeEngine({ rng: () => 0, matchPhase: 'second_half' });
      engine.observe([signal(EVENT_TYPES.SHOT_SAVED, 50)], 50);
      engine.observe([signal(EVENT_TYPES.CORNER, 52)], 52);
      const obs = engine.observe([signal(EVENT_TYPES.SHOT_MISSED, 54)], 54);

      expect(obs).toMatchObject({
        type: EVENT_TYPES.MATCH_OBSERVATION,
        fixtureId: 123,
        minute: 54,
        side: 'home',
        matchPhase: 'second_half',
        teamId: homeTeam.id
      });
      expect(obs.score).toEqual({ home: 0, away: 0 });
      expect(obs.tags).toContain('commentary');
      expect(typeof obs.description).toBe('string');
      expect(obs.description.length).toBeGreaterThan(0);
    });

    it('every attack-signal type is a real event type', () => {
      const knownTypes = new Set(Object.values(EVENT_TYPES));
      for (const type of ATTACK_SIGNAL_TYPES) {
        expect(knownTypes.has(type)).toBe(true);
      }
    });
  });

  describe('favourite / underdog framing', () => {
    it('calls favourite control when the stronger side leads by 2+', () => {
      // Widen the rating gap so home is a clear favourite.
      const bigHome = { ...homeTeam, attackRating: 90, defenseRating: 88, goalkeeperRating: 86 };
      const score = { home: 2, away: 0 };
      const ctx = { fixtureId: 123, homeTeam: bigHome, awayTeam, score };
      const engine = new CommentaryEngine(ctx, makeCreateEvent(score), { rng: () => 0 });

      // No goal this tick, no pressure spell: favourite framing path.
      const obs = engine.observe([], 30);
      expect(obs).not.toBeNull();
      expect(obs.subtype).toBe(OBSERVATION_SUBTYPES.FAVOURITE_CONTROL);
      expect(obs.description).toContain(bigHome.name);
    });

    it('calls the underdog when it is level with a favourite late on', () => {
      const bigHome = { ...homeTeam, attackRating: 90, defenseRating: 88, goalkeeperRating: 86 };
      const score = { home: 0, away: 0 };
      const ctx = { fixtureId: 123, homeTeam: bigHome, awayTeam, score };
      const engine = new CommentaryEngine(ctx, makeCreateEvent(score), { rng: () => 0 });

      const obs = engine.observe([], 65);
      expect(obs).not.toBeNull();
      expect(obs.subtype).toBe(OBSERVATION_SUBTYPES.UNDERDOG);
      expect(obs.teamId).toBe(awayTeam.id);
      expect(obs.side).toBe('away');
    });
  });

  describe('contradiction guards', () => {
    it('does not praise a side that just conceded', () => {
      const { engine, score } = makeEngine({ rng: () => 0 });
      // Home builds a spell...
      engine.observe([signal(EVENT_TYPES.SHOT_SAVED, 20)], 20);
      engine.observe([signal(EVENT_TYPES.CORNER, 21)], 21);
      // ...but away scores this minute (1-goal ordinary goal → no goal obs).
      score.away = 1;
      engine.observe([signal(EVENT_TYPES.GOAL, 22, 'away')], 22);
      // Home's third signal right after conceding: pressure praise blocked.
      const obs = engine.observe([signal(EVENT_TYPES.SHOT_MISSED, 23)], 23);
      expect(obs?.subtype).not.toBe(OBSERVATION_SUBTYPES.PRESSURE);
      expect(obs?.subtype).not.toBe(OBSERVATION_SUBTYPES.MOMENTUM);
    });
  });
});
