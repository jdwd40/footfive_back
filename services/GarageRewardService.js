const db = require('../db/connection');
const GarageService = require('./GarageService');
const { GARAGE } = require('../gamelogic/garage/garageConfig');
const {
    overallRating,
    calculateReward,
    energyDrain,
    conditionDamage,
    clamp
} = require('../gamelogic/garage/garageCalc');

/**
 * GarageRewardService - post-match processing for the garage team.
 *
 * After a garage-team fixture is confirmed completed in the DB this:
 * - drains active players' energy (by mode) and damages their condition
 * - credits the win reward (round base + opponent tier + upset + stadium +
 *   history bonuses) when the garage team won
 *
 * Idempotent: garage_match_results has fixture_id as PRIMARY KEY and the
 * insert runs first inside the transaction — a second call for the same
 * fixture finds the row already claimed and does nothing.
 */
class GarageRewardService {
    /**
     * Process one completed fixture. Safe to call for any fixture — no-ops
     * unless it is a confirmed, completed garage-team match not yet processed.
     */
    static async processFixtureResult(fixtureId, rng = Math.random) {
        const teamId = await GarageService.getTeamId();
        if (!teamId) return { processed: false, reason: 'Garage not initialised' };

        const fixtureResult = await db.query(`
            SELECT f.fixture_id, f.round, f.status, f.winner_team_id,
                   f.home_team_id, f.away_team_id
            FROM fixtures f
            WHERE f.fixture_id = $1 AND f.status = 'completed' AND f.winner_team_id IS NOT NULL
        `, [fixtureId]);
        if (!fixtureResult.rows.length) {
            return { processed: false, reason: 'Fixture has no confirmed winner yet' };
        }

        const fixture = fixtureResult.rows[0];
        const userIsHome = fixture.home_team_id === teamId;
        const userIsAway = fixture.away_team_id === teamId;
        if (!userIsHome && !userIsAway) {
            return { processed: false, reason: 'Not a garage team fixture' };
        }

        const won = fixture.winner_team_id === teamId;

        // Compute the reward before opening the transaction (read-only work).
        let reward = { total: 0, breakdown: {}, opponentGrade: null };
        if (won) {
            reward = await GarageRewardService._calculateRewardForFixture(fixture, teamId, userIsHome);
        }

        // Wear applies win or lose — the active 5 played the match.
        const squad = await GarageService.getSquad();
        const playerChanges = squad
            .filter(p => p.isActive)
            .map(p => {
                const drained = clamp(p.energy - energyDrain(p.mode), 0, 100);
                const damaged = clamp(p.condition - conditionDamage(p.mode, rng), 0, 100);
                return {
                    playerId: p.playerId,
                    name: p.name,
                    mode: p.mode,
                    energyBefore: p.energy,
                    energyAfter: drained,
                    conditionBefore: p.condition,
                    conditionAfter: damaged
                };
            });

        const client = await db.connect();
        try {
            await client.query('BEGIN');

            // Idempotency gate: first writer claims the fixture, everyone
            // else gets zero rows back and stops here.
            const claimed = await client.query(`
                INSERT INTO garage_match_results (fixture_id, won, reward_total, breakdown, player_changes)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (fixture_id) DO NOTHING
                RETURNING fixture_id
            `, [
                fixtureId,
                won,
                reward.total,
                JSON.stringify({ ...reward.breakdown, opponentGrade: reward.opponentGrade }),
                JSON.stringify(playerChanges)
            ]);

            if (!claimed.rows.length) {
                await client.query('ROLLBACK');
                return { processed: false, reason: 'Fixture already processed' };
            }

            for (const change of playerChanges) {
                await client.query(`
                    UPDATE garage_players SET energy = $1, condition = $2
                    WHERE player_id = $3
                `, [change.energyAfter, change.conditionAfter, change.playerId]);
            }

            if (won && reward.total > 0) {
                await GarageService._applyMoney(client, {
                    amount: reward.total,
                    transactionType: 'match_reward',
                    fixtureId,
                    description: `${fixture.round} win reward`
                });
            }

            await client.query('COMMIT');

            console.log(`[Garage] Processed fixture ${fixtureId}: won=${won} reward=${reward.total}`);
            return {
                processed: true,
                won,
                rewardTotal: reward.total,
                breakdown: reward.breakdown,
                playerChanges
            };
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    static async _calculateRewardForFixture(fixture, teamId, userIsHome) {
        const opponentId = userIsHome ? fixture.away_team_id : fixture.home_team_id;

        const teamsResult = await db.query(`
            SELECT t.team_id, t.wins, t.jcups_won, t.stadium_size,
                   (SELECT MAX(attack) FROM players WHERE team_id = t.team_id AND is_goalkeeper = false) AS attack_rating,
                   (SELECT MAX(defense) FROM players WHERE team_id = t.team_id AND is_goalkeeper = false) AS defense_rating,
                   (SELECT MAX(defense) FROM players WHERE team_id = t.team_id AND is_goalkeeper = true) AS goalkeeper_rating
            FROM teams t
            WHERE t.team_id = ANY($1::int[])
        `, [[teamId, opponentId]]);

        const byId = new Map(teamsResult.rows.map(r => [r.team_id, r]));
        const user = byId.get(teamId);
        const opponent = byId.get(opponentId);
        if (!user || !opponent) {
            return { total: GARAGE.REWARDS.BASE_BY_ROUND[fixture.round] || 0, breakdown: {}, opponentGrade: null };
        }

        const ratings = row => ({
            attackRating: row.attack_rating || 0,
            defenseRating: row.defense_rating || 0,
            goalkeeperRating: row.goalkeeper_rating || 0
        });

        return calculateReward({
            round: fixture.round,
            userWasHome: userIsHome,
            userOverall: overallRating(ratings(user)),
            opponent: {
                overall: overallRating(ratings(opponent)),
                wins: opponent.wins || 0,
                jcupsWon: opponent.jcups_won || 0,
                stadiumSize: opponent.stadium_size
            }
        });
    }

    /**
     * Safety-net sweep for results confirmed while the server was down.
     * Idempotent (processFixtureResult refuses already-processed fixtures).
     */
    static async sweep() {
        const teamId = await GarageService.getTeamId();
        if (!teamId) return { processed: 0 };

        const rows = await db.query(`
            SELECT f.fixture_id
            FROM fixtures f
            LEFT JOIN garage_match_results gmr ON gmr.fixture_id = f.fixture_id
            WHERE (f.home_team_id = $1 OR f.away_team_id = $1)
              AND f.status = 'completed'
              AND f.winner_team_id IS NOT NULL
              AND gmr.fixture_id IS NULL
              AND f.created_at > NOW() - INTERVAL '6 hours'
        `, [teamId]);

        let processed = 0;
        for (const row of rows.rows) {
            const outcome = await GarageRewardService.processFixtureResult(row.fixture_id);
            if (outcome.processed) processed++;
        }
        return { processed };
    }
}

module.exports = GarageRewardService;
