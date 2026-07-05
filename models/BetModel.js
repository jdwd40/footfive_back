const db = require('../db/connection');

const BET_TYPES = {
    FIXTURE_WINNER: 'fixture_winner',
    LIVE_FIXTURE_WINNER: 'live_fixture_winner',
    CHAMPIONSHIP_WINNER: 'championship_winner'
};

const BET_STATUS = {
    PENDING: 'pending',
    WON: 'won',
    LOST: 'lost',
    VOID: 'void'
};

class Bet {
    constructor(data) {
        this.betId = data.bet_id;
        this.userId = data.user_id;
        this.betType = data.bet_type;
        this.fixtureId = data.fixture_id;
        this.tournamentId = data.tournament_id;
        this.selectedTeamId = data.selected_team_id;
        this.selectedTeamName = data.selected_team_name || null;
        this.homeTeamName = data.home_team_name || null;
        this.awayTeamName = data.away_team_name || null;
        this.round = data.round || null;
        this.stake = parseFloat(data.stake);
        this.oddsAtPlacement = parseFloat(data.odds_at_placement);
        this.potentialReturn = parseFloat(data.potential_return);
        this.status = data.status;
        this.placedAt = data.placed_at;
        this.settledAt = data.settled_at;
        this.settlementNote = data.settlement_note;
    }

    static async create({ userId, betType, fixtureId = null, tournamentId = null, selectedTeamId, stake, oddsAtPlacement, potentialReturn }, client = db) {
        const result = await client.query(`
            INSERT INTO bets (user_id, bet_type, fixture_id, tournament_id, selected_team_id, stake, odds_at_placement, potential_return)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `, [userId, betType, fixtureId, tournamentId, selectedTeamId, stake, oddsAtPlacement, potentialReturn]);

        return new Bet(result.rows[0]);
    }

    // All bets a user holds on one fixture (used for the same-side rule)
    static async getUserBetsOnFixture(userId, fixtureId) {
        const result = await db.query(`
            SELECT * FROM bets
            WHERE user_id = $1 AND fixture_id = $2
            ORDER BY placed_at ASC
        `, [userId, fixtureId]);

        return result.rows.map(row => new Bet(row));
    }

    static async getByUserId(userId, { status = null, fixtureId = null, betType = null, limit = 100 } = {}) {
        let query = `
            SELECT b.*,
                   st.name AS selected_team_name,
                   ht.name AS home_team_name,
                   at.name AS away_team_name,
                   f.round
            FROM bets b
            JOIN teams st ON b.selected_team_id = st.team_id
            LEFT JOIN fixtures f ON b.fixture_id = f.fixture_id
            LEFT JOIN teams ht ON f.home_team_id = ht.team_id
            LEFT JOIN teams at ON f.away_team_id = at.team_id
            WHERE b.user_id = $1
        `;
        const params = [userId];

        if (status) {
            params.push(status);
            query += ` AND b.status = $${params.length}`;
        }

        if (fixtureId) {
            params.push(fixtureId);
            query += ` AND b.fixture_id = $${params.length}`;
        }

        if (betType) {
            params.push(betType);
            query += ` AND b.bet_type = $${params.length}`;
        }

        params.push(limit);
        query += ` ORDER BY b.placed_at DESC, b.bet_id DESC LIMIT $${params.length}`;

        const result = await db.query(query, params);
        return result.rows.map(row => new Bet(row));
    }

    // Aggregate betting summary for a user
    static async getSummary(userId) {
        const result = await db.query(`
            SELECT
                COUNT(*)::int AS total_bets,
                COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
                COUNT(*) FILTER (WHERE status = 'won')::int AS won,
                COUNT(*) FILTER (WHERE status = 'lost')::int AS lost,
                COUNT(*) FILTER (WHERE status = 'void')::int AS void,
                COALESCE(SUM(stake), 0) AS total_staked,
                COALESCE(SUM(stake) FILTER (WHERE status = 'pending'), 0) AS pending_stakes,
                COALESCE(SUM(potential_return) FILTER (WHERE status = 'won'), 0) AS total_returned,
                COALESCE(SUM(potential_return) FILTER (WHERE status = 'pending'), 0) AS potential_returns
            FROM bets
            WHERE user_id = $1
        `, [userId]);

        const row = result.rows[0];
        return {
            totalBets: row.total_bets,
            pending: row.pending,
            won: row.won,
            lost: row.lost,
            void: row.void,
            totalStaked: parseFloat(row.total_staked),
            pendingStakes: parseFloat(row.pending_stakes),
            totalReturned: parseFloat(row.total_returned),
            potentialReturns: parseFloat(row.potential_returns)
        };
    }

    toJSON() {
        return {
            betId: this.betId,
            betType: this.betType,
            fixtureId: this.fixtureId,
            tournamentId: this.tournamentId,
            selectedTeamId: this.selectedTeamId,
            selectedTeamName: this.selectedTeamName,
            fixture: this.fixtureId ? {
                homeTeamName: this.homeTeamName,
                awayTeamName: this.awayTeamName,
                round: this.round
            } : null,
            stake: this.stake,
            oddsAtPlacement: this.oddsAtPlacement,
            potentialReturn: this.potentialReturn,
            status: this.status,
            placedAt: this.placedAt,
            settledAt: this.settledAt,
            settlementNote: this.settlementNote
        };
    }
}

module.exports = { Bet, BET_TYPES, BET_STATUS };
