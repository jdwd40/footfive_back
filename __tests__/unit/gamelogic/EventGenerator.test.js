const { EventGenerator } = require('../../../gamelogic/simulation/EventGenerator');
const { EVENT_TYPES } = require('../../../gamelogic/constants');

describe('EventGenerator', () => {
  const homeTeam = { id: 1, name: 'Home FC', attackRating: 80, defenseRating: 75, goalkeeperRating: 74 };
  const awayTeam = { id: 2, name: 'Away FC', attackRating: 72, defenseRating: 70, goalkeeperRating: 71 };

  const buildContext = () => ({
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

  it('emits linked build-up sequence events when enabled', () => {
    const generator = new EventGenerator(buildContext(), createEvent, jest.fn());
    jest.spyOn(generator, '_defenseBlocks').mockReturnValue(true);
    jest.spyOn(Math, 'random').mockReturnValue(0);

    const events = generator._handleAttack(homeTeam, awayTeam, 'home', 12, {
      startZone: 55,
      possessionState: 'build_up',
      emitBuildUp: true
    });

    expect(events[0].type).toBe(EVENT_TYPES.BUILD_UP_PLAY);
    expect(events[1].type).toBe(EVENT_TYPES.BALL_PROGRESSION);
    expect(events.some((event) => event.type === EVENT_TYPES.CORNER)).toBe(true);
    expect(events.every((event) => event.bundleId)).toBe(true);
    expect(events[0].bundleStep).toBe(1);
    expect(events[1].bundleStep).toBe(2);

    Math.random.mockRestore();
  });
});
