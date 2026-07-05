const db = require('../db/connection');
const Wallet = require('../models/WalletModel');

/**
 * SettlementService - settles bets from confirmed backend results only.
 *
 * Rules:
 * - Fixture bets settle from fixtures.winner_team_id once status = 'completed'
 *   (penalty shootout winners already count: LiveMatch.getWinnerId() folds the
 *   shootout result into winner_team_id without touching the main score).
 * - Championship bets settle from the completed Final's winner_team_id.
 * - Idempotent: settlement only ever touches bets in 'pending' status and
 *   updates status + pays out inside one DB transaction, so re-running a
 *   settlement never double-credits winnings.
 */
class SettlementService {
    /**
     * Settle all pending bets on a fixture. No-op unless the fixture has a
     * confirmed (DB-persisted) winner.
     */
    static async settleFixtureBets(fixtureId) {
        const fixtureResult = await db.query(`
            SELECT fixture_id, winner_team_id, status, home_score, away_score,
                   home_penalty_score, away_penalty_score
            FROM fixtures
            WHERE fixture_id = $1 AND status = 'completed' AND winner_team_id IS NOT NULL
        `, [fixtureId]);

        if (!fixtureResult.rows.length) {
            return { settled: 0, reason: 'Fixture has no confirmed winner yet' };
        }

        const fixture = fixtureResult.rows[0];
        const winnerId = fixture.winner_team_id;
        const penalties = fixture.home_penalty_score !== null;
        const note = penalties
            ? `Settled on penalty shootout result (${fixture.home_score}-${fixture.away_score}, pens ${fixture.home_penalty_score}-${fixture.away_penalty_score})`
            : `Settled on final score ${fixture.home_score}-${fixture.away_score}`;

        return SettlementService._settlePending({
            where: 'fixture_id = $2',
            params: [fixtureId],
            winnerId,
            note
        });
    }

    /**
     * Settle all pending championship bets for a tournament using the
     * completed Final's winner.
     */
    static async settleChampionshipBets(tournamentId) {
        const finalResult = await db.query(`
            SELECT winner_team_id FROM fixtures
            WHERE tournament_id = $1 AND round = 'Final'
              AND status = 'completed' AND winner_team_id IS NOT NULL
            LIMIT 1
        `, [tournamentId]);

        if (!finalResult.rows.length) {
            return { settled: 0, reason: 'Final has no confirmed winner yet' };
        }

        return SettlementService._settlePending({
            where: `bet_type = 'championship_winner' AND tournament_id = $2`,
            params: [tournamentId],
            winnerId: finalResult.rows[0].winner_team_id,
            note: 'Settled on confirmed championship winner'
        });
    }

    /**
     * Void all pending bets (refund stakes). Used when a tournament is
     * cancelled so stakes are not stranded. Idempotent via 'pending' filter.
     */
    static async voidAllPendingBets(reason = 'Tournament cancelled') {
        const client = await db.connect();
        try {
            await client.query('BEGIN');

            const voided = await client.query(`
                UPDATE bets
                SET status = 'void', settled_at = NOW(), settlement_note = $1
                WHERE status = 'pending'
                RETURNING bet_id, user_id, stake
            `, [reason]);

            for (const bet of voided.rows) {
                await Wallet.applyTransaction({
                    userId: bet.user_id,
                    amount: parseFloat(bet.stake),
                    transactionType: 'bet_refund',
                    betId: bet.bet_id,
                    description: `Refund for void bet #${bet.bet_id}: ${reason}`
                }, client);
            }

            await client.query('COMMIT');
            return { voided: voided.rows.length };
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    /**
     * Safety-net sweep: settles any pending bets whose result is already
     * confirmed in the DB (e.g. after a server restart mid-settlement).
     */
    static async sweepPendingBets() {
        const results = { fixturesSettled: 0, championshipSettled: 0 };

        const fixtureRows = await db.query(`
            SELECT DISTINCT b.fixture_id
            FROM bets b
            JOIN fixtures f ON b.fixture_id = f.fixture_id
            WHERE b.status = 'pending'
              AND f.status = 'completed'
              AND f.winner_team_id IS NOT NULL
        `);

        for (const row of fixtureRows.rows) {
            const outcome = await SettlementService.settleFixtureBets(row.fixture_id);
            results.fixturesSettled += outcome.settled || 0;
        }

        const champRows = await db.query(`
            SELECT DISTINCT b.tournament_id
            FROM bets b
            WHERE b.status = 'pending'
              AND b.bet_type = 'championship_winner'
              AND b.tournament_id IS NOT NULL
        `);

        for (const row of champRows.rows) {
            const outcome = await SettlementService.settleChampionshipBets(row.tournament_id);
            results.championshipSettled += outcome.settled || 0;
        }

        return results;
    }

    /**
     * Core idempotent settle: flips pending bets matching `where` to
     * won/lost and credits winners, all in one transaction.
     * `where` may reference $2..$n; $1 is reserved inside for status.
     */
    static async _settlePending({ where, params, winnerId, note }) {
        const client = await db.connect();
        try {
            await client.query('BEGIN');

            // Only pending bets are eligible: re-running finds nothing to do.
            const settledBets = await client.query(`
                UPDATE bets
                SET status = CASE WHEN selected_team_id = $1 THEN 'won' ELSE 'lost' END,
                    settled_at = NOW(),
                    settlement_note = $${params.length + 2}
                WHERE status = 'pending' AND ${where}
                RETURNING bet_id, user_id, selected_team_id, potential_return
            `, [winnerId, ...params, note]);

            let winners = 0;
            for (const bet of settledBets.rows) {
                if (bet.selected_team_id !== winnerId) continue; // Lost: stake stays lost
                winners++;
                await Wallet.applyTransaction({
                    userId: bet.user_id,
                    amount: parseFloat(bet.potential_return),
                    transactionType: 'bet_payout',
                    betId: bet.bet_id,
                    description: `Winnings for bet #${bet.bet_id}`
                }, client);
            }

            await client.query('COMMIT');

            return { settled: settledBets.rows.length, won: winners, lost: settledBets.rows.length - winners };
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }
}

module.exports = SettlementService;
