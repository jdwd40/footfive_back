/**
 * Cyborg Garage pure calculation tests: rewards, costs, modes, energy,
 * condition, grades and stadium sizes. No database.
 */
const {
    overallRating,
    gradeFromOverall,
    stadiumSizeFromOverall,
    effectivenessFactor,
    effectiveTeamRatings,
    energyDrain,
    conditionDamage,
    repairCost,
    upgradeCost,
    calculateReward
} = require('../../../gamelogic/garage/garageCalc');
const { GARAGE } = require('../../../gamelogic/garage/garageConfig');

const makePlayer = (overrides = {}) => ({
    playerId: 1,
    attack: 60,
    defense: 60,
    speed: 50,
    isGoalkeeper: false,
    isActive: true,
    mode: 'balanced',
    energy: 100,
    condition: 100,
    ...overrides
});

// 5 active (incl. keeper) + 2 spares, all balanced/full by default
const makeSquad = (activeOverrides = {}) => [
    makePlayer({ playerId: 1, ...activeOverrides }),
    makePlayer({ playerId: 2, attack: 50, defense: 50, ...activeOverrides }),
    makePlayer({ playerId: 3, attack: 40, defense: 55, ...activeOverrides }),
    makePlayer({ playerId: 4, attack: 45, defense: 52, ...activeOverrides }),
    makePlayer({ playerId: 5, attack: 30, defense: 65, isGoalkeeper: true, ...activeOverrides }),
    makePlayer({ playerId: 6, isActive: false }),
    makePlayer({ playerId: 7, isActive: false })
];

describe('garageCalc rewards', () => {
    const baseArgs = {
        round: 'Round of 16',
        userWasHome: true,
        userOverall: 40,
        opponent: { overall: 55, wins: 0, jcupsWon: 0, stadiumSize: 'small' }
    };

    test('later rounds give bigger base rewards', () => {
        const rounds = ['Round of 16', 'Quarter-finals', 'Semi-finals', 'Final'];
        const totals = rounds.map(round => calculateReward({ ...baseArgs, round }).breakdown.base);
        for (let i = 1; i < totals.length; i++) {
            expect(totals[i]).toBeGreaterThan(totals[i - 1]);
        }
    });

    test('bigger (higher graded) opponents give bigger rewards', () => {
        const weak = calculateReward({ ...baseArgs, opponent: { ...baseArgs.opponent, overall: 46 } });
        const strong = calculateReward({ ...baseArgs, opponent: { ...baseArgs.opponent, overall: 81 } });
        expect(strong.total).toBeGreaterThan(weak.total);
        expect(strong.breakdown.tierBonus).toBeGreaterThan(0);
        expect(strong.opponentGrade).toBe('A++');
    });

    test('beating a stronger team adds the upset bonus', () => {
        const upset = calculateReward({ ...baseArgs, userOverall: 40, opponent: { ...baseArgs.opponent, overall: 60 } });
        const expected = calculateReward({ ...baseArgs, userOverall: 70, opponent: { ...baseArgs.opponent, overall: 60 } });
        expect(upset.breakdown.upsetBonus).toBe(GARAGE.REWARDS.UPSET_BONUS);
        expect(expected.breakdown.upsetBonus).toBe(0);
    });

    test('stadium bonus applies to away wins at large/mega grounds only', () => {
        const awayMega = calculateReward({
            ...baseArgs, userWasHome: false,
            opponent: { ...baseArgs.opponent, stadiumSize: 'mega' }
        });
        const homeMega = calculateReward({
            ...baseArgs, userWasHome: true,
            opponent: { ...baseArgs.opponent, stadiumSize: 'mega' }
        });
        const awaySmall = calculateReward({
            ...baseArgs, userWasHome: false,
            opponent: { ...baseArgs.opponent, stadiumSize: 'small' }
        });
        expect(awayMega.breakdown.stadiumBonus).toBe(GARAGE.REWARDS.STADIUM_BONUS.mega);
        expect(homeMega.breakdown.stadiumBonus).toBe(0);
        expect(awaySmall.breakdown.stadiumBonus).toBe(0);
    });

    test('opponent history (wins + championships) increases reward, capped', () => {
        const noHistory = calculateReward(baseArgs);
        const history = calculateReward({
            ...baseArgs, opponent: { ...baseArgs.opponent, wins: 50, jcupsWon: 2 }
        });
        const hugeHistory = calculateReward({
            ...baseArgs, opponent: { ...baseArgs.opponent, wins: 5000, jcupsWon: 100 }
        });
        expect(history.breakdown.historyBonus).toBe(100);
        expect(history.total).toBeGreaterThan(noHistory.total);
        expect(hugeHistory.breakdown.historyBonus).toBe(GARAGE.REWARDS.HISTORY_BONUS_CAP);
    });

    test('total equals the sum of the breakdown', () => {
        const reward = calculateReward({
            round: 'Final', userWasHome: false, userOverall: 40,
            opponent: { overall: 81, wins: 120, jcupsWon: 4, stadiumSize: 'mega' }
        });
        const sum = Object.values(reward.breakdown).reduce((a, b) => a + b, 0);
        expect(reward.total).toBe(sum);
    });
});

describe('garageCalc costs', () => {
    test('upgrade cost increases sharply at higher stats', () => {
        expect(upgradeCost(30)).toBeLessThan(upgradeCost(70));
        expect(upgradeCost(70)).toBeLessThan(upgradeCost(90));
        // quadratic: 90 costs way more than 3x the 30 cost
        expect(upgradeCost(90)).toBeGreaterThan(upgradeCost(30) * 3);
    });

    test('repair costs more when restoring more condition', () => {
        expect(repairCost(100)).toBe(0);
        expect(repairCost(80)).toBe(20 * GARAGE.REPAIR_COST_PER_POINT);
        expect(repairCost(20)).toBeGreaterThan(repairCost(80));
    });
});

describe('garageCalc modes / energy / condition', () => {
    test('aggressive drains more energy than balanced, balanced more than passive', () => {
        expect(energyDrain('aggressive')).toBeGreaterThan(energyDrain('balanced'));
        expect(energyDrain('balanced')).toBeGreaterThan(energyDrain('passive'));
    });

    test('aggressive mode risks more condition damage than passive', () => {
        const rng = () => 0.5; // fixed roll
        expect(conditionDamage('aggressive', rng)).toBeGreaterThan(conditionDamage('balanced', rng));
        expect(conditionDamage('balanced', rng)).toBeGreaterThan(conditionDamage('passive', rng));
    });

    test('low energy reduces effectiveness (and so team ratings)', () => {
        expect(effectivenessFactor(20, 100)).toBeLessThan(effectivenessFactor(100, 100));

        const fresh = effectiveTeamRatings(makeSquad());
        const tired = effectiveTeamRatings(makeSquad({ energy: 10 }));
        expect(tired.attackRating).toBeLessThan(fresh.attackRating);
        expect(tired.defenseRating).toBeLessThan(fresh.defenseRating);
    });

    test('low condition reduces effectiveness', () => {
        const fresh = effectiveTeamRatings(makeSquad());
        const damaged = effectiveTeamRatings(makeSquad({ condition: 20 }));
        expect(damaged.attackRating).toBeLessThan(fresh.attackRating);
    });

    test('player mode changes affect team strength calculation', () => {
        const balanced = effectiveTeamRatings(makeSquad({ mode: 'balanced' }));
        const aggressive = effectiveTeamRatings(makeSquad({ mode: 'aggressive' }));
        const passive = effectiveTeamRatings(makeSquad({ mode: 'passive' }));

        expect(aggressive.attackRating).toBeGreaterThan(balanced.attackRating);
        expect(aggressive.defenseRating).toBeLessThan(balanced.defenseRating);
        expect(passive.attackRating).toBeLessThan(balanced.attackRating);
        expect(passive.defenseRating).toBeGreaterThan(balanced.defenseRating);

        expect(aggressive.foulRiskMultiplier).toBeGreaterThan(balanced.foulRiskMultiplier);
        expect(passive.foulRiskMultiplier).toBeLessThan(balanced.foulRiskMultiplier);
    });

    test('exactly 5 active players are required for rating overrides', () => {
        const four = makeSquad();
        four[0].isActive = false;
        expect(effectiveTeamRatings(four)).toBeNull();

        const six = makeSquad();
        six[5].isActive = true;
        expect(effectiveTeamRatings(six)).toBeNull();

        expect(effectiveTeamRatings(makeSquad())).not.toBeNull();
    });
});

describe('garageCalc grades and stadiums', () => {
    test('grades follow overall rating', () => {
        expect(gradeFromOverall(81)).toBe('A++');
        expect(gradeFromOverall(73)).toBe('A');
        expect(gradeFromOverall(61)).toBe('B');
        expect(gradeFromOverall(40)).toBe('C-');
    });

    test('top-tier teams get bigger stadiums than lower tiers', () => {
        expect(stadiumSizeFromOverall(81)).toBe('mega');
        expect(stadiumSizeFromOverall(73)).toBe('large');
        expect(stadiumSizeFromOverall(61)).toBe('medium');
        expect(stadiumSizeFromOverall(40)).toBe('small');
    });

    test('overallRating averages the three sim ratings', () => {
        expect(overallRating({ attackRating: 60, defenseRating: 60, goalkeeperRating: 60 })).toBe(60);
    });
});
