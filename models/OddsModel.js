const db = require('../db/connection');

class Odds {
    constructor(data) {
        this.oddsId = data.odds_id;
        this.fixtureId = data.fixture_id;
        this.homeWinProb = parseFloat(data.home_win_prob);
        this.awayWinProb = parseFloat(data.away_win_prob);
        this.homeWinOdds = parseFloat(data.home_win_odds);
        this.awayWinOdds = parseFloat(data.away_win_odds);
        this.margin = parseFloat(data.margin);
        this.factors = data.factors;
        this.calculatedAt = data.calculated_at;
    }

    // Create odds for a fixture
    static async create({ fixtureId, homeWinProb, awayWinProb, homeWinOdds, awayWinOdds, margin = 0.05, factors = {} }) {
        const result = await db.query(`
            INSERT INTO fixture_odds
            (fixture_id, home_win_prob, away_win_prob, home_win_odds, away_win_odds, margin, factors)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [fixtureId, homeWinProb, awayWinProb, homeWinOdds, awayWinOdds, margin, JSON.stringify(factors)]);

        return new Odds(result.rows[0]);
    }

    // Get odds by fixture ID
    static async getByFixtureId(fixtureId) {
        const result = await db.query(`
            SELECT * FROM fixture_odds WHERE fixture_id = $1
        `, [fixtureId]);

        if (!result.rows.length) {
            return null;
        }

        return new Odds(result.rows[0]);
    }

    // Update existing odds
    static async update(fixtureId, { homeWinProb, awayWinProb, homeWinOdds, awayWinOdds, margin, factors }) {
        const result = await db.query(`
            UPDATE fixture_odds
            SET home_win_prob = COALESCE($2, home_win_prob),
                away_win_prob = COALESCE($3, away_win_prob),
                home_win_odds = COALESCE($4, home_win_odds),
                away_win_odds = COALESCE($5, away_win_odds),
                margin = COALESCE($6, margin),
                factors = COALESCE($7, factors),
                calculated_at = NOW()
            WHERE fixture_id = $1
            RETURNING *
        `, [fixtureId, homeWinProb, awayWinProb, homeWinOdds, awayWinOdds, margin, factors ? JSON.stringify(factors) : null]);

        if (!result.rows.length) {
            throw new Error(`Odds for fixture ${fixtureId} not found`);
        }

        return new Odds(result.rows[0]);
    }

    // Upsert odds (create or update)
    static async upsert({ fixtureId, homeWinProb, awayWinProb, homeWinOdds, awayWinOdds, margin = 0.05, factors = {} }) {
        const result = await db.query(`
            INSERT INTO fixture_odds
            (fixture_id, home_win_prob, away_win_prob, home_win_odds, away_win_odds, margin, factors)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (fixture_id)
            DO UPDATE SET
                home_win_prob = EXCLUDED.home_win_prob,
                away_win_prob = EXCLUDED.away_win_prob,
                home_win_odds = EXCLUDED.home_win_odds,
                away_win_odds = EXCLUDED.away_win_odds,
                margin = EXCLUDED.margin,
                factors = EXCLUDED.factors,
                calculated_at = NOW()
            RETURNING *
        `, [fixtureId, homeWinProb, awayWinProb, homeWinOdds, awayWinOdds, margin, JSON.stringify(factors)]);

        return new Odds(result.rows[0]);
    }

    // Delete odds for a fixture
    static async delete(fixtureId) {
        const result = await db.query(`
            DELETE FROM fixture_odds WHERE fixture_id = $1 RETURNING odds_id
        `, [fixtureId]);

        return result.rows.length > 0;
    }

    // Get all odds with fixture info
    static async getAllWithFixtures({ status = null, limit = 100 } = {}) {
        let query = `
            SELECT o.*,
                   f.home_team_id, f.away_team_id, f.round, f.status,
                   ht.name AS home_team_name,
                   at.name AS away_team_name
            FROM fixture_odds o
            JOIN fixtures f ON o.fixture_id = f.fixture_id
            JOIN teams ht ON f.home_team_id = ht.team_id
            JOIN teams at ON f.away_team_id = at.team_id
            WHERE 1=1
        `;
        const params = [];

        if (status) {
            params.push(status);
            query += ` AND f.status = $${params.length}`;
        }

        params.push(limit);
        query += ` ORDER BY o.calculated_at DESC LIMIT $${params.length}`;

        const result = await db.query(query, params);

        return result.rows.map(row => ({
            odds: new Odds(row),
            fixture: {
                fixtureId: row.fixture_id,
                homeTeamId: row.home_team_id,
                awayTeamId: row.away_team_id,
                homeTeamName: row.home_team_name,
                awayTeamName: row.away_team_name,
                round: row.round,
                status: row.status
            }
        }));
    }

    // Format odds for API response
    toJSON() {
        return {
            fixtureId: this.fixtureId,
            probabilities: {
                homeWin: this.homeWinProb,
                awayWin: this.awayWinProb
            },
            odds: {
                homeWin: this.homeWinOdds,
                awayWin: this.awayWinOdds
            },
            margin: this.margin,
            factors: this.factors,
            calculatedAt: this.calculatedAt
        };
    }
}

module.exports = Odds;
