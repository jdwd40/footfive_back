/**
 * Cyborg Garage integration tests: initialisation, garage API, lineup
 * validation, purchases (energy/repair/upgrade) with money validation,
 * idempotent post-match rewards, and live-match modifier overrides.
 */
const request = require('supertest');
const { cleanupAfterEach, getTestApp } = require('../setup/testHelpers');
const { seedTestData, cleanupTestDatabase, db } = require('../../db/test-seed');
const Fixture = require('../../models/FixtureModel');
const GarageService = require('../../services/GarageService');
const GarageRewardService = require('../../services/GarageRewardService');
const { GARAGE } = require('../../gamelogic/garage/garageConfig');

const TOURNAMENT_ID = 787878;

// Swirl City is the configured garage team (weak); Giant United is a
// top-grade opponent; Mid Rovers sits in between.
const garageTeams = [
    {
        name: GARAGE.USER_TEAM_NAME,
        players: [
            { name: 'Q Foret', attack: 54, defense: 19, isGoalkeeper: false },
            { name: 'R Loire', attack: 33, defense: 18, isGoalkeeper: false },
            { name: 'S Mare', attack: 22, defense: 37, isGoalkeeper: false },
            { name: 'T Jura', attack: 25, defense: 40, isGoalkeeper: false },
            { name: 'U Ardennes', attack: 30, defense: 59, isGoalkeeper: true }
        ]
    },
    {
        name: 'Giant United',
        players: [
            { name: 'G One', attack: 87, defense: 60, isGoalkeeper: false },
            { name: 'G Two', attack: 85, defense: 62, isGoalkeeper: false },
            { name: 'G Three', attack: 60, defense: 83, isGoalkeeper: false },
            { name: 'G Four', attack: 55, defense: 80, isGoalkeeper: false },
            { name: 'G Keeper', attack: 30, defense: 75, isGoalkeeper: true }
        ]
    },
    {
        name: 'Mid Rovers',
        players: [
            { name: 'M One', attack: 60, defense: 45, isGoalkeeper: false },
            { name: 'M Two', attack: 58, defense: 44, isGoalkeeper: false },
            { name: 'M Three', attack: 40, defense: 55, isGoalkeeper: false },
            { name: 'M Four', attack: 42, defense: 52, isGoalkeeper: false },
            { name: 'M Keeper', attack: 30, defense: 52, isGoalkeeper: true }
        ]
    }
];

describe('Cyborg Garage', () => {
    let app;
    let garageTeamId;
    let giantId;
    let midId;

    beforeAll(() => {
        app = getTestApp();
    });

    beforeEach(async () => {
        await cleanupTestDatabase();
        await seedTestData(garageTeams);
        garageTeamId = await GarageService.ensureInitialized();

        const teams = await db.query('SELECT team_id, name FROM teams');
        giantId = teams.rows.find(t => t.name === 'Giant United').team_id;
        midId = teams.rows.find(t => t.name === 'Mid Rovers').team_id;
    });

    afterEach(async () => {
        await cleanupAfterEach();
    });

    // === Helpers ===

    const getGarage = async () => {
        const res = await request(app).get('/api/garage').expect(200);
        return res.body.garage;
    };

    const completeFixture = async ({ opponentId, userIsHome = true, userWins = true, round = 'Round of 16' }) => {
        const fixture = await Fixture.create({
            homeTeamId: userIsHome ? garageTeamId : opponentId,
            awayTeamId: userIsHome ? opponentId : garageTeamId,
            tournamentId: TOURNAMENT_ID,
            round
        });
        await Fixture.complete(fixture.fixtureId, {
            homeScore: userIsHome === userWins ? 2 : 0,
            awayScore: userIsHome === userWins ? 0 : 2,
            homePenaltyScore: null,
            awayPenaltyScore: null,
            winnerTeamId: userWins ? garageTeamId : opponentId
        });
        return fixture.fixtureId;
    };

    // === Initialisation ===

    test('initialises a 7-player squad with exactly 5 active and starting funds', async () => {
        const garage = await getGarage();
        expect(garage.teamName).toBe(GARAGE.USER_TEAM_NAME);
        expect(garage.balance).toBe(GARAGE.STARTING_BALANCE);
        expect(garage.squad).toHaveLength(7);
        expect(garage.squad.filter(p => p.isActive)).toHaveLength(5);
    });

    test('is idempotent: re-running init does not duplicate players or funds', async () => {
        await GarageService.ensureInitialized();
        await GarageService.ensureInitialized();
        const garage = await getGarage();
        expect(garage.squad).toHaveLength(7);
        expect(garage.balance).toBe(GARAGE.STARTING_BALANCE);
    });

    test('stamps stadium sizes from team strength (top tier = bigger)', async () => {
        const teams = await db.query('SELECT name, stadium_size FROM teams');
        const byName = Object.fromEntries(teams.rows.map(t => [t.name, t.stadium_size]));
        expect(byName['Giant United']).toBe('mega');
        expect(byName[GARAGE.USER_TEAM_NAME]).toBe('small');
    });

    // === Lineup ===

    test('lineup requires exactly 5 squad players', async () => {
        const garage = await getGarage();
        const ids = garage.squad.map(p => p.playerId);

        await request(app).put('/api/garage/lineup')
            .send({ activePlayerIds: ids.slice(0, 4) }).expect(400);
        await request(app).put('/api/garage/lineup')
            .send({ activePlayerIds: ids.slice(0, 6) }).expect(400);
        await request(app).put('/api/garage/lineup')
            .send({ activePlayerIds: [...ids.slice(0, 4), 999999] }).expect(400);

        // rotate a spare in
        const res = await request(app).put('/api/garage/lineup')
            .send({ activePlayerIds: [...ids.slice(0, 4), ids[6]] }).expect(200);
        const active = res.body.squad.filter(p => p.isActive).map(p => p.playerId);
        expect(active).toHaveLength(5);
        expect(active).toContain(ids[6]);
        expect(active).not.toContain(ids[4]);
    });

    test('player modes can be set and invalid modes are rejected', async () => {
        const garage = await getGarage();
        const playerId = garage.squad[0].playerId;

        const res = await request(app).put(`/api/garage/players/${playerId}/mode`)
            .send({ mode: 'aggressive' }).expect(200);
        expect(res.body.player.mode).toBe('aggressive');

        await request(app).put(`/api/garage/players/${playerId}/mode`)
            .send({ mode: 'berserk' }).expect(400);
    });

    // === Money: energy / repair / upgrade ===

    test('buying a small energy pack costs money and tops up one player', async () => {
        const garage = await getGarage();
        const playerId = garage.squad[0].playerId;
        await db.query('UPDATE garage_players SET energy = 50 WHERE player_id = $1', [playerId]);

        const res = await request(app).post('/api/garage/energy')
            .send({ pack: 'small', playerId }).expect(200);
        expect(res.body.balance).toBe(GARAGE.STARTING_BALANCE - GARAGE.ENERGY_PACKS.small.cost);

        const after = await getGarage();
        expect(after.squad.find(p => p.playerId === playerId).energy).toBe(50 + GARAGE.ENERGY_PACKS.small.amount);
    });

    test('full recharge restores the whole squad to 100 energy', async () => {
        await db.query('UPDATE garage_players SET energy = 30');
        await request(app).post('/api/garage/energy').send({ pack: 'full' }).expect(200);
        const garage = await getGarage();
        expect(garage.squad.every(p => p.energy === 100)).toBe(true);
        expect(garage.balance).toBe(GARAGE.STARTING_BALANCE - GARAGE.ENERGY_PACKS.full.cost);
    });

    test('repair restores condition and charges per missing point', async () => {
        const garage = await getGarage();
        const playerId = garage.squad[0].playerId;
        await db.query('UPDATE garage_players SET condition = 60 WHERE player_id = $1', [playerId]);

        const res = await request(app).post(`/api/garage/players/${playerId}/repair`).expect(200);
        expect(res.body.cost).toBe(40 * GARAGE.REPAIR_COST_PER_POINT);

        const after = await getGarage();
        expect(after.squad.find(p => p.playerId === playerId).condition).toBe(100);
        expect(after.balance).toBe(GARAGE.STARTING_BALANCE - 40 * GARAGE.REPAIR_COST_PER_POINT);

        // already at 100 -> rejected, no charge
        await request(app).post(`/api/garage/players/${playerId}/repair`).expect(400);
    });

    test('upgrades raise the stat by 1 and cost scales with the current value', async () => {
        const garage = await getGarage();
        const player = garage.squad.find(p => p.name === 'Q Foret'); // attack 54
        const cheapPlayer = garage.squad.find(p => p.name === 'S Mare'); // attack 22
        expect(player.upgradeCosts.attack).toBeGreaterThan(cheapPlayer.upgradeCosts.attack);

        const res = await request(app).post(`/api/garage/players/${cheapPlayer.playerId}/upgrade`)
            .send({ stat: 'attack' }).expect(200);
        expect(res.body.cost).toBe(cheapPlayer.upgradeCosts.attack);

        const after = await getGarage();
        expect(after.squad.find(p => p.playerId === cheapPlayer.playerId).attack).toBe(cheapPlayer.attack + 1);
        expect(after.balance).toBe(GARAGE.STARTING_BALANCE - cheapPlayer.upgradeCosts.attack);

        await request(app).post(`/api/garage/players/${cheapPlayer.playerId}/upgrade`)
            .send({ stat: 'luck' }).expect(400);
    });

    test('spending cannot make the balance negative', async () => {
        await db.query('UPDATE garage SET balance = 10 WHERE garage_id = 1');
        const garage = await getGarage();
        const playerId = garage.squad[0].playerId;

        await request(app).post('/api/garage/energy')
            .send({ pack: 'small', playerId }).expect(400);
        await request(app).post('/api/garage/energy').send({ pack: 'full' }).expect(400);

        const after = await getGarage();
        expect(after.balance).toBe(10);
    });

    // === Team picker ===

    test('switching teams keeps the balance and garage-readies the new squad', async () => {
        await db.query('UPDATE garage SET balance = 777 WHERE garage_id = 1');

        const res = await request(app).put('/api/garage/team')
            .send({ teamId: giantId }).expect(200);
        expect(res.body.garage.teamName).toBe('Giant United');
        expect(res.body.garage.balance).toBe(777);
        expect(res.body.garage.squad).toHaveLength(7);
        expect(res.body.garage.squad.filter(p => p.isActive)).toHaveLength(5);

        // unknown team rejected, garage unchanged
        await request(app).put('/api/garage/team').send({ teamId: 999999 }).expect(400);
        await request(app).put('/api/garage/team').send({}).expect(400);
        const garage = await getGarage();
        expect(garage.teamName).toBe('Giant United');

        // switching back finds the original squad state again
        const back = await request(app).put('/api/garage/team')
            .send({ teamId: garageTeamId }).expect(200);
        expect(back.body.garage.teamName).toBe(GARAGE.USER_TEAM_NAME);
        expect(back.body.garage.squad).toHaveLength(7);
    });

    // === Tournament energy reset ===

    test('a new tournament resets squad energy to 100 but not condition', async () => {
        await db.query('UPDATE garage_players SET energy = 30, condition = 70');

        const count = await GarageService.resetEnergyForNewTournament();
        expect(count).toBe(7);

        const garage = await getGarage();
        expect(garage.squad.every(p => p.energy === 100)).toBe(true);
        expect(garage.squad.every(p => p.condition === 70)).toBe(true);
    });

    // === Post-match rewards ===

    test('a win pays a reward with a full breakdown', async () => {
        const fixtureId = await completeFixture({ opponentId: giantId, userIsHome: false });
        const outcome = await GarageRewardService.processFixtureResult(fixtureId, () => 0.5);

        expect(outcome.processed).toBe(true);
        expect(outcome.won).toBe(true);
        expect(outcome.breakdown.base).toBe(GARAGE.REWARDS.BASE_BY_ROUND['Round of 16']);
        expect(outcome.breakdown.tierBonus).toBeGreaterThan(0);   // Giant United is A-tier
        expect(outcome.breakdown.upsetBonus).toBe(GARAGE.REWARDS.UPSET_BONUS);
        expect(outcome.breakdown.stadiumBonus).toBe(GARAGE.REWARDS.STADIUM_BONUS.mega); // away at mega

        const garage = await getGarage();
        expect(garage.balance).toBe(GARAGE.STARTING_BALANCE + outcome.rewardTotal);
    });

    test('rewards cannot be applied twice to the same match', async () => {
        const fixtureId = await completeFixture({ opponentId: midId });
        const first = await GarageRewardService.processFixtureResult(fixtureId, () => 0.5);
        expect(first.processed).toBe(true);

        const second = await GarageRewardService.processFixtureResult(fixtureId, () => 0.5);
        expect(second.processed).toBe(false);

        // and via the API route
        const apiRes = await request(app).post(`/api/garage/rewards/${fixtureId}/process`).expect(200);
        expect(apiRes.body.processed).toBe(false);

        const garage = await getGarage();
        expect(garage.balance).toBe(GARAGE.STARTING_BALANCE + first.rewardTotal);
    });

    test('bigger opponents pay more than smaller ones for the same round', async () => {
        const giantFixture = await completeFixture({ opponentId: giantId });
        const giantOutcome = await GarageRewardService.processFixtureResult(giantFixture, () => 0.5);

        const midFixture = await completeFixture({ opponentId: midId });
        const midOutcome = await GarageRewardService.processFixtureResult(midFixture, () => 0.5);

        expect(giantOutcome.rewardTotal).toBeGreaterThan(midOutcome.rewardTotal);
    });

    test('later rounds pay more than earlier rounds', async () => {
        const r16 = await completeFixture({ opponentId: midId, round: 'Round of 16' });
        const final = await completeFixture({ opponentId: midId, round: 'Final' });
        const r16Outcome = await GarageRewardService.processFixtureResult(r16, () => 0.5);
        const finalOutcome = await GarageRewardService.processFixtureResult(final, () => 0.5);
        expect(finalOutcome.breakdown.base).toBeGreaterThan(r16Outcome.breakdown.base);
    });

    test('a loss pays nothing but the active squad still takes wear', async () => {
        const fixtureId = await completeFixture({ opponentId: giantId, userWins: false });
        const outcome = await GarageRewardService.processFixtureResult(fixtureId, () => 0.5);

        expect(outcome.processed).toBe(true);
        expect(outcome.won).toBe(false);
        expect(outcome.rewardTotal).toBe(0);
        expect(outcome.playerChanges).toHaveLength(5);
        for (const change of outcome.playerChanges) {
            expect(change.energyAfter).toBeLessThan(change.energyBefore);
            expect(change.conditionAfter).toBeLessThanOrEqual(change.conditionBefore);
        }

        const garage = await getGarage();
        expect(garage.balance).toBe(GARAGE.STARTING_BALANCE);
    });

    test('aggressive mode drains more energy and condition than passive', async () => {
        const garage = await getGarage();
        const active = garage.squad.filter(p => p.isActive);
        await db.query('UPDATE garage_players SET mode = $1 WHERE player_id = $2', ['aggressive', active[0].playerId]);
        await db.query('UPDATE garage_players SET mode = $1 WHERE player_id = $2', ['passive', active[1].playerId]);

        const fixtureId = await completeFixture({ opponentId: midId });
        const outcome = await GarageRewardService.processFixtureResult(fixtureId, () => 0.5);

        const aggressive = outcome.playerChanges.find(c => c.playerId === active[0].playerId);
        const passive = outcome.playerChanges.find(c => c.playerId === active[1].playerId);
        const aggDrain = aggressive.energyBefore - aggressive.energyAfter;
        const pasDrain = passive.energyBefore - passive.energyAfter;
        const aggDamage = aggressive.conditionBefore - aggressive.conditionAfter;
        const pasDamage = passive.conditionBefore - passive.conditionAfter;

        expect(aggDrain).toBeGreaterThan(pasDrain);
        expect(aggDamage).toBeGreaterThan(pasDamage);
    });

    test('reward summary is readable from the API afterwards', async () => {
        const fixtureId = await completeFixture({ opponentId: midId });
        await GarageRewardService.processFixtureResult(fixtureId, () => 0.5);

        const res = await request(app).get(`/api/garage/rewards/${fixtureId}`).expect(200);
        expect(res.body.result.won).toBe(true);
        expect(res.body.result.breakdown.base).toBeGreaterThan(0);
        expect(res.body.result.playerChanges).toHaveLength(5);

        const latest = await request(app).get('/api/garage/rewards/latest').expect(200);
        expect(latest.body.result.fixtureId).toBe(fixtureId);
    });

    // === Live match integration ===

    test('applyToLiveMatch overrides ratings and restricts players to the active 5', async () => {
        const squad = await GarageService.getSquad();
        const fakeMatch = {
            homeTeam: { id: garageTeamId, name: GARAGE.USER_TEAM_NAME, attackRating: 54, defenseRating: 59, goalkeeperRating: 59 },
            awayTeam: { id: giantId, name: 'Giant United', attackRating: 87, defenseRating: 83, goalkeeperRating: 75 },
            homePlayers: squad.map(p => ({ playerId: p.playerId, name: p.name, attack: p.attack, defense: p.defense, isGoalkeeper: p.isGoalkeeper })),
            awayPlayers: []
        };

        await GarageService.applyToLiveMatch(fakeMatch);

        expect(fakeMatch.homePlayers).toHaveLength(5);            // spares filtered out
        expect(fakeMatch.homeTeam.foulRiskMultiplier).toBeCloseTo(1, 1);
        expect(fakeMatch.awayTeam.attackRating).toBe(87);          // opponent untouched
        expect(fakeMatch.awayTeam.foulRiskMultiplier).toBeUndefined();
    });

    test('mode and energy changes flow through to the match overrides', async () => {
        const before = await GarageService.getMatchOverrides();

        await db.query(`UPDATE garage_players SET mode = 'aggressive' WHERE is_active`);
        const aggressive = await GarageService.getMatchOverrides();
        expect(aggressive.attackRating).toBeGreaterThan(before.attackRating);
        expect(aggressive.foulRiskMultiplier).toBeGreaterThan(before.foulRiskMultiplier);

        await db.query(`UPDATE garage_players SET energy = 5 WHERE is_active`);
        const exhausted = await GarageService.getMatchOverrides();
        expect(exhausted.attackRating).toBeLessThan(aggressive.attackRating);
    });
});
