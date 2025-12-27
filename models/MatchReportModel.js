const db = require('../db/connection');

class MatchReport {
    constructor(data) {
        this.reportId = data.report_id;
        this.fixtureId = data.fixture_id;
        this.homePossession = parseFloat(data.home_possession);
        this.awayPossession = parseFloat(data.away_possession);
        this.homeShots = data.home_shots;
        this.awayShots = data.away_shots;
        this.homeShotsOnTarget = data.home_shots_on_target;
        this.awayShotsOnTarget = data.away_shots_on_target;
        this.homeXg = parseFloat(data.home_xg);
        this.awayXg = parseFloat(data.away_xg);
        this.homeCorners = data.home_corners;
        this.awayCorners = data.away_corners;
        this.homeFouls = data.home_fouls;
        this.awayFouls = data.away_fouls;
        this.homeYellowCards = data.home_yellow_cards;
        this.awayYellowCards = data.away_yellow_cards;
        this.homeRedCards = data.home_red_cards;
        this.awayRedCards = data.away_red_cards;
        this.extraTimePlayed = data.extra_time_played;
        this.penaltiesPlayed = data.penalties_played;
        this.createdAt = data.created_at;
    }

    // Create match report
    static async create(reportData) {
        const result = await db.query(`
            INSERT INTO match_reports
            (fixture_id, home_possession, away_possession,
             home_shots, away_shots, home_shots_on_target, away_shots_on_target,
             home_xg, away_xg, home_corners, away_corners,
             home_fouls, away_fouls, home_yellow_cards, away_yellow_cards,
             home_red_cards, away_red_cards, extra_time_played, penalties_played)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
            RETURNING *
        `, [
            reportData.fixtureId,
            reportData.homePossession || 50,
            reportData.awayPossession || 50,
            reportData.homeShots || 0,
            reportData.awayShots || 0,
            reportData.homeShotsOnTarget || 0,
            reportData.awayShotsOnTarget || 0,
            reportData.homeXg || 0,
            reportData.awayXg || 0,
            reportData.homeCorners || 0,
            reportData.awayCorners || 0,
            reportData.homeFouls || 0,
            reportData.awayFouls || 0,
            reportData.homeYellowCards || 0,
            reportData.awayYellowCards || 0,
            reportData.homeRedCards || 0,
            reportData.awayRedCards || 0,
            reportData.extraTimePlayed || false,
            reportData.penaltiesPlayed || false
        ]);

        return new MatchReport(result.rows[0]);
    }

    // Get report by fixture ID
    static async getByFixtureId(fixtureId) {
        const result = await db.query(`
            SELECT * FROM match_reports WHERE fixture_id = $1
        `, [fixtureId]);

        if (!result.rows.length) {
            return null;
        }

        return new MatchReport(result.rows[0]);
    }

    // Get report with fixture and team info
    static async getByFixtureIdWithDetails(fixtureId) {
        const result = await db.query(`
            SELECT r.*,
                   f.home_score, f.away_score,
                   f.home_penalty_score, f.away_penalty_score,
                   f.round, f.completed_at,
                   ht.name AS home_team_name,
                   at.name AS away_team_name
            FROM match_reports r
            JOIN fixtures f ON r.fixture_id = f.fixture_id
            JOIN teams ht ON f.home_team_id = ht.team_id
            JOIN teams at ON f.away_team_id = at.team_id
            WHERE r.fixture_id = $1
        `, [fixtureId]);

        if (!result.rows.length) {
            return null;
        }

        const row = result.rows[0];
        const report = new MatchReport(row);

        report.fixture = {
            homeScore: row.home_score,
            awayScore: row.away_score,
            homePenaltyScore: row.home_penalty_score,
            awayPenaltyScore: row.away_penalty_score,
            homeTeamName: row.home_team_name,
            awayTeamName: row.away_team_name,
            round: row.round,
            completedAt: row.completed_at
        };

        return report;
    }

    // Update report
    static async update(fixtureId, updateData) {
        const fields = [];
        const values = [fixtureId];
        let paramIndex = 2;

        const fieldMap = {
            homePossession: 'home_possession',
            awayPossession: 'away_possession',
            homeShots: 'home_shots',
            awayShots: 'away_shots',
            homeShotsOnTarget: 'home_shots_on_target',
            awayShotsOnTarget: 'away_shots_on_target',
            homeXg: 'home_xg',
            awayXg: 'away_xg',
            homeCorners: 'home_corners',
            awayCorners: 'away_corners',
            homeFouls: 'home_fouls',
            awayFouls: 'away_fouls',
            homeYellowCards: 'home_yellow_cards',
            awayYellowCards: 'away_yellow_cards',
            homeRedCards: 'home_red_cards',
            awayRedCards: 'away_red_cards',
            extraTimePlayed: 'extra_time_played',
            penaltiesPlayed: 'penalties_played'
        };

        for (const [jsKey, dbKey] of Object.entries(fieldMap)) {
            if (updateData[jsKey] !== undefined) {
                fields.push(`${dbKey} = $${paramIndex}`);
                values.push(updateData[jsKey]);
                paramIndex++;
            }
        }

        if (!fields.length) {
            return this.getByFixtureId(fixtureId);
        }

        const result = await db.query(`
            UPDATE match_reports
            SET ${fields.join(', ')}
            WHERE fixture_id = $1
            RETURNING *
        `, values);

        if (!result.rows.length) {
            throw new Error(`Report for fixture ${fixtureId} not found`);
        }

        return new MatchReport(result.rows[0]);
    }

    // Delete report
    static async delete(fixtureId) {
        const result = await db.query(`
            DELETE FROM match_reports WHERE fixture_id = $1 RETURNING report_id
        `, [fixtureId]);

        return result.rows.length > 0;
    }

    // Format for API response
    toJSON() {
        return {
            fixtureId: this.fixtureId,
            possession: {
                home: this.homePossession,
                away: this.awayPossession
            },
            shots: {
                home: this.homeShots,
                away: this.awayShots
            },
            shotsOnTarget: {
                home: this.homeShotsOnTarget,
                away: this.awayShotsOnTarget
            },
            xG: {
                home: this.homeXg,
                away: this.awayXg
            },
            corners: {
                home: this.homeCorners,
                away: this.awayCorners
            },
            fouls: {
                home: this.homeFouls,
                away: this.awayFouls
            },
            yellowCards: {
                home: this.homeYellowCards,
                away: this.awayYellowCards
            },
            redCards: {
                home: this.homeRedCards,
                away: this.awayRedCards
            },
            extraTimePlayed: this.extraTimePlayed,
            penaltiesPlayed: this.penaltiesPlayed
        };
    }
}

module.exports = MatchReport;
