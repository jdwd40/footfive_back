const db = require('../db/connection');

class Fixture {
    constructor(data) {
        this.fixtureId = data.fixture_id;
        this.homeTeamId = data.home_team_id;
        this.awayTeamId = data.away_team_id;
        this.homeTeamName = data.home_team_name || null;
        this.awayTeamName = data.away_team_name || null;
        this.tournamentId = data.tournament_id;
        this.round = data.round;
        this.scheduledAt = data.scheduled_at;
        this.status = data.status;
        this.homeScore = data.home_score;
        this.awayScore = data.away_score;
        this.homePenaltyScore = data.home_penalty_score;
        this.awayPenaltyScore = data.away_penalty_score;
        this.winnerTeamId = data.winner_team_id;
        this.createdAt = data.created_at;
        this.completedAt = data.completed_at;
        // Bracket positioning
        this.bracketSlot = data.bracket_slot || null;
        this.feedsInto = data.feeds_into || null;
    }

    // Create a new fixture (supports TBD teams with null IDs)
    static async create({ homeTeamId = null, awayTeamId = null, tournamentId = null, round = null, scheduledAt = null, bracketSlot = null, feedsInto = null }) {
        const result = await db.query(`
            INSERT INTO fixtures (home_team_id, away_team_id, tournament_id, round, scheduled_at, bracket_slot, feeds_into)
            VALUES ($1, $2, $3, $4, COALESCE($5, NOW()), $6, $7)
            RETURNING *
        `, [homeTeamId, awayTeamId, tournamentId, round, scheduledAt, bracketSlot, feedsInto]);

        return new Fixture(result.rows[0]);
    }

    // Create multiple fixtures in batch (supports TBD teams and bracket positioning)
    static async createBatch(fixtures) {
        if (!fixtures.length) return [];

        const values = fixtures.map((f, i) => {
            const offset = i * 7;
            return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, COALESCE($${offset + 5}, NOW()), $${offset + 6}, $${offset + 7})`;
        }).join(', ');

        const params = fixtures.flatMap(f => [
            f.homeTeamId ?? null, f.awayTeamId ?? null, f.tournamentId || null, f.round || null, f.scheduledAt || null, f.bracketSlot || null, f.feedsInto || null
        ]);

        const result = await db.query(`
            INSERT INTO fixtures (home_team_id, away_team_id, tournament_id, round, scheduled_at, bracket_slot, feeds_into)
            VALUES ${values}
            RETURNING *
        `, params);

        return result.rows.map(row => new Fixture(row));
    }

    // Get fixture by ID with team names (supports TBD teams)
    static async getById(fixtureId) {
        const result = await db.query(`
            SELECT f.*,
                   ht.name AS home_team_name,
                   at.name AS away_team_name
            FROM fixtures f
            LEFT JOIN teams ht ON f.home_team_id = ht.team_id
            LEFT JOIN teams at ON f.away_team_id = at.team_id
            WHERE f.fixture_id = $1
        `, [fixtureId]);

        if (!result.rows.length) {
            throw new Error(`Fixture with ID ${fixtureId} not found`);
        }

        return new Fixture(result.rows[0]);
    }

    // Get all fixtures with optional filters (supports TBD teams)
    static async getAll({ status = null, teamId = null, tournamentId = null, round = null, bracketSlot = null, limit = 100 } = {}) {
        let query = `
            SELECT f.*,
                   ht.name AS home_team_name,
                   at.name AS away_team_name
            FROM fixtures f
            LEFT JOIN teams ht ON f.home_team_id = ht.team_id
            LEFT JOIN teams at ON f.away_team_id = at.team_id
            WHERE 1=1
        `;
        const params = [];

        if (status) {
            params.push(status);
            query += ` AND f.status = $${params.length}`;
        }

        if (teamId) {
            params.push(teamId);
            query += ` AND (f.home_team_id = $${params.length} OR f.away_team_id = $${params.length})`;
        }

        if (tournamentId) {
            params.push(tournamentId);
            query += ` AND f.tournament_id = $${params.length}`;
        }

        if (round) {
            params.push(round);
            query += ` AND f.round = $${params.length}`;
        }

        if (bracketSlot) {
            params.push(bracketSlot);
            query += ` AND f.bracket_slot = $${params.length}`;
        }

        params.push(limit);
        query += ` ORDER BY f.bracket_slot ASC, f.scheduled_at DESC LIMIT $${params.length}`;

        const result = await db.query(query, params);
        return result.rows.map(row => new Fixture(row));
    }

    // Update fixture status
    static async updateStatus(fixtureId, status) {
        const result = await db.query(`
            UPDATE fixtures
            SET status = $2
            WHERE fixture_id = $1
            RETURNING *
        `, [fixtureId, status]);

        if (!result.rows.length) {
            throw new Error(`Fixture with ID ${fixtureId} not found`);
        }

        return new Fixture(result.rows[0]);
    }

    // Complete a fixture with final scores
    static async complete(fixtureId, { homeScore, awayScore, homePenaltyScore = null, awayPenaltyScore = null, winnerTeamId }) {
        const result = await db.query(`
            UPDATE fixtures
            SET status = 'completed',
                home_score = $2,
                away_score = $3,
                home_penalty_score = $4,
                away_penalty_score = $5,
                winner_team_id = $6,
                completed_at = NOW()
            WHERE fixture_id = $1
            RETURNING *
        `, [fixtureId, homeScore, awayScore, homePenaltyScore, awayPenaltyScore, winnerTeamId]);

        if (!result.rows.length) {
            throw new Error(`Fixture with ID ${fixtureId} not found`);
        }

        return new Fixture(result.rows[0]);
    }

    // Update home team (for filling TBD bracket slot)
    static async updateHomeTeam(fixtureId, teamId) {
        const result = await db.query(`
            UPDATE fixtures SET home_team_id = $2 WHERE fixture_id = $1 RETURNING *
        `, [fixtureId, teamId]);

        if (!result.rows.length) {
            throw new Error(`Fixture with ID ${fixtureId} not found`);
        }
        return new Fixture(result.rows[0]);
    }

    // Update away team (for filling TBD bracket slot)
    static async updateAwayTeam(fixtureId, teamId) {
        const result = await db.query(`
            UPDATE fixtures SET away_team_id = $2 WHERE fixture_id = $1 RETURNING *
        `, [fixtureId, teamId]);

        if (!result.rows.length) {
            throw new Error(`Fixture with ID ${fixtureId} not found`);
        }
        return new Fixture(result.rows[0]);
    }

    // Get fixture by bracket slot and tournament
    static async getByBracketSlot(tournamentId, bracketSlot) {
        const result = await db.query(`
            SELECT f.*,
                   ht.name AS home_team_name,
                   at.name AS away_team_name
            FROM fixtures f
            LEFT JOIN teams ht ON f.home_team_id = ht.team_id
            LEFT JOIN teams at ON f.away_team_id = at.team_id
            WHERE f.tournament_id = $1 AND f.bracket_slot = $2
        `, [tournamentId, bracketSlot]);

        return result.rows.length ? new Fixture(result.rows[0]) : null;
    }

    // Get recent fixtures for a team (for form calculation)
    static async getRecentByTeam(teamId, limit = 10) {
        const result = await db.query(`
            SELECT f.*,
                   ht.name AS home_team_name,
                   at.name AS away_team_name
            FROM fixtures f
            JOIN teams ht ON f.home_team_id = ht.team_id
            JOIN teams at ON f.away_team_id = at.team_id
            WHERE f.status = 'completed'
              AND (f.home_team_id = $1 OR f.away_team_id = $1)
            ORDER BY f.completed_at DESC
            LIMIT $2
        `, [teamId, limit]);

        return result.rows.map(row => new Fixture(row));
    }

    // Get team form stats from recent fixtures
    static async getTeamForm(teamId, limit = 10) {
        const fixtures = await this.getRecentByTeam(teamId, limit);

        let wins = 0, losses = 0, goalsFor = 0, goalsAgainst = 0;

        for (const f of fixtures) {
            const isHome = f.homeTeamId === teamId;
            const teamScore = isHome ? f.homeScore : f.awayScore;
            const oppScore = isHome ? f.awayScore : f.homeScore;

            goalsFor += teamScore || 0;
            goalsAgainst += oppScore || 0;

            if (f.winnerTeamId === teamId) {
                wins++;
            } else {
                losses++;
            }
        }

        return {
            matches: fixtures.length,
            wins,
            losses,
            goalsFor,
            goalsAgainst,
            goalDiff: goalsFor - goalsAgainst
        };
    }

    // Delete fixture
    static async delete(fixtureId) {
        const result = await db.query(`
            DELETE FROM fixtures WHERE fixture_id = $1 RETURNING fixture_id
        `, [fixtureId]);

        return result.rows.length > 0;
    }

    // Get fixture with odds
    static async getByIdWithOdds(fixtureId) {
        const result = await db.query(`
            SELECT f.*,
                   ht.name AS home_team_name,
                   at.name AS away_team_name,
                   o.home_win_prob,
                   o.away_win_prob,
                   o.home_win_odds,
                   o.away_win_odds,
                   o.margin,
                   o.factors
            FROM fixtures f
            JOIN teams ht ON f.home_team_id = ht.team_id
            JOIN teams at ON f.away_team_id = at.team_id
            LEFT JOIN fixture_odds o ON f.fixture_id = o.fixture_id
            WHERE f.fixture_id = $1
        `, [fixtureId]);

        if (!result.rows.length) {
            throw new Error(`Fixture with ID ${fixtureId} not found`);
        }

        const row = result.rows[0];
        const fixture = new Fixture(row);

        if (row.home_win_odds) {
            fixture.odds = {
                homeWinProb: parseFloat(row.home_win_prob),
                awayWinProb: parseFloat(row.away_win_prob),
                homeWinOdds: parseFloat(row.home_win_odds),
                awayWinOdds: parseFloat(row.away_win_odds),
                margin: parseFloat(row.margin),
                factors: row.factors
            };
        }

        return fixture;
    }
}

module.exports = Fixture;
