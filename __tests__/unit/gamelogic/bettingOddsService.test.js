/**
 * BettingOddsService unit tests
 * Pure formula tests - no DB required.
 */

const BettingOdds = require('../../../gamelogic/BettingOddsService');

const strongTeam = {
    id: 1,
    name: 'Strong FC',
    attackRating: 90,
    defenseRating: 85,
    goalkeeperRating: 80,
    wins: 20,
    jcupsWon: 4
};

const weakTeam = {
    id: 2,
    name: 'Weak FC',
    attackRating: 55,
    defenseRating: 50,
    goalkeeperRating: 50,
    wins: 1,
    jcupsWon: 0
};

const evenTeam = { ...strongTeam, id: 3, name: 'Even FC' };

describe('BettingOddsService', () => {
    describe('teamPower', () => {
        it('is deterministic for the same inputs', () => {
            expect(BettingOdds.teamPower(strongTeam)).toBe(BettingOdds.teamPower({ ...strongTeam }));
        });

        it('rates stronger squads higher', () => {
            expect(BettingOdds.teamPower(strongTeam)).toBeGreaterThan(BettingOdds.teamPower(weakTeam));
        });

        it('caps form and championship bonuses', () => {
            const serialWinner = { ...strongTeam, wins: 500, jcupsWon: 50 };
            const cappedWinner = { ...strongTeam, wins: 15, jcupsWon: 5 };
            expect(BettingOdds.teamPower(serialWinner)).toBe(BettingOdds.teamPower(cappedWinner));
        });
    });

    describe('prematchOdds', () => {
        it('gives the stronger team shorter odds', () => {
            const { home, away } = BettingOdds.prematchOdds(strongTeam, weakTeam);
            expect(home.odds).toBeLessThan(away.odds);
            expect(home.probability).toBeGreaterThan(away.probability);
        });

        it('is deterministic', () => {
            const a = BettingOdds.prematchOdds(strongTeam, weakTeam);
            const b = BettingOdds.prematchOdds(strongTeam, weakTeam);
            expect(a).toEqual(b);
        });

        it('gives roughly even odds for identical teams', () => {
            const { home, away } = BettingOdds.prematchOdds(strongTeam, evenTeam);
            expect(home.probability).toBeCloseTo(0.5, 2);
            expect(home.odds).toBeCloseTo(away.odds, 2);
        });

        it('probabilities sum to 1', () => {
            const { home, away } = BettingOdds.prematchOdds(strongTeam, weakTeam);
            expect(home.probability + away.probability).toBeCloseTo(1, 4);
        });

        it('clamps odds so upsets stay possible', () => {
            const superTeam = { ...strongTeam, attackRating: 99, defenseRating: 99, goalkeeperRating: 99 };
            const minnows = { ...weakTeam, attackRating: 10, defenseRating: 10, goalkeeperRating: 10 };
            const { home, away } = BettingOdds.prematchOdds(superTeam, minnows);

            expect(home.odds).toBeGreaterThanOrEqual(BettingOdds.MIN_ODDS);
            expect(away.odds).toBeLessThanOrEqual(BettingOdds.MAX_MATCH_ODDS);
            expect(home.probability).toBeLessThanOrEqual(0.94);
            expect(away.probability).toBeGreaterThanOrEqual(0.06);
        });
    });

    describe('liveOdds', () => {
        it('shortens odds for the leading team', () => {
            const level = BettingOdds.liveOdds(strongTeam, evenTeam, { homeScore: 0, awayScore: 0, minute: 30 });
            const leading = BettingOdds.liveOdds(strongTeam, evenTeam, { homeScore: 1, awayScore: 0, minute: 30 });

            expect(leading.home.odds).toBeLessThan(level.home.odds);
            expect(leading.away.odds).toBeGreaterThan(level.away.odds);
        });

        it('makes a lead worth more later in the match', () => {
            const early = BettingOdds.liveOdds(strongTeam, evenTeam, { homeScore: 1, awayScore: 0, minute: 10 });
            const late = BettingOdds.liveOdds(strongTeam, evenTeam, { homeScore: 1, awayScore: 0, minute: 85 });

            expect(late.home.probability).toBeGreaterThan(early.home.probability);
            expect(late.home.odds).toBeLessThanOrEqual(early.home.odds);
        });

        it('changes odds when the minute changes with the same score', () => {
            const min10 = BettingOdds.liveOdds(strongTeam, weakTeam, { homeScore: 0, awayScore: 1, minute: 10 });
            const min80 = BettingOdds.liveOdds(strongTeam, weakTeam, { homeScore: 0, awayScore: 1, minute: 80 });

            // Trailing favourite: chance shrinks as the clock runs down
            expect(min80.home.probability).toBeLessThan(min10.home.probability);
        });

        it('fades the quality edge as a level match progresses', () => {
            const early = BettingOdds.liveOdds(strongTeam, weakTeam, { homeScore: 0, awayScore: 0, minute: 5 });
            const late = BettingOdds.liveOdds(strongTeam, weakTeam, { homeScore: 0, awayScore: 0, minute: 88 });

            expect(late.home.probability).toBeLessThan(early.home.probability);
            expect(late.home.probability).toBeGreaterThan(0.5); // still favourite
        });

        it('clamps live odds to sensible bounds', () => {
            const blowout = BettingOdds.liveOdds(strongTeam, weakTeam, { homeScore: 5, awayScore: 0, minute: 89 });
            expect(blowout.home.odds).toBeGreaterThanOrEqual(BettingOdds.MIN_ODDS);
            expect(blowout.away.odds).toBeLessThanOrEqual(BettingOdds.MAX_MATCH_ODDS);
        });
    });

    describe('championshipOdds', () => {
        const field = [
            strongTeam,
            weakTeam,
            { ...weakTeam, id: 4, name: 'Mid FC', attackRating: 70, defenseRating: 70 },
            { ...weakTeam, id: 5, name: 'Other FC', attackRating: 65, defenseRating: 60 }
        ];

        it('assigns every remaining team a probability and odds', () => {
            const board = BettingOdds.championshipOdds(field);
            expect(board).toHaveLength(4);
            for (const entry of board) {
                expect(entry.probability).toBeGreaterThan(0);
                expect(entry.odds).toBeGreaterThanOrEqual(BettingOdds.MIN_ODDS);
                expect(entry.odds).toBeLessThanOrEqual(BettingOdds.MAX_CHAMPIONSHIP_ODDS);
            }
        });

        it('gives the strongest team the shortest odds', () => {
            const board = BettingOdds.championshipOdds(field);
            const strongest = board.find(e => e.teamId === strongTeam.id);
            for (const entry of board) {
                if (entry.teamId === strongTeam.id) continue;
                expect(strongest.odds).toBeLessThanOrEqual(entry.odds);
            }
        });

        it('shortens odds as rivals are eliminated', () => {
            const fullField = BettingOdds.championshipOdds(field);
            const smallerField = BettingOdds.championshipOdds(field.slice(0, 2));

            const before = fullField.find(e => e.teamId === strongTeam.id);
            const after = smallerField.find(e => e.teamId === strongTeam.id);
            expect(after.probability).toBeGreaterThan(before.probability);
            expect(after.odds).toBeLessThanOrEqual(before.odds);
        });

        it('returns an empty board for no teams', () => {
            expect(BettingOdds.championshipOdds([])).toEqual([]);
        });
    });
});
