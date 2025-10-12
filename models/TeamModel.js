const db = require('../db/connection');

class Team {
    constructor(id, name, attackRating = 0, defenseRating = 0, goalkeeperRating = 0, jcups_won = 0, runner_ups = 0, highest_round_reached = null) {
        this.id = id;
        this.name = name;
        this.attackRating = attackRating;
        this.defenseRating = defenseRating;
        this.goalkeeperRating = goalkeeperRating;
        this.wins = 0;
        this.losses = 0;
        this.goalsFor = 0;
        this.goalsAgainst = 0;
        this.jcups_won = jcups_won;
        this.runner_ups = runner_ups;
        this.highest_round_reached = highest_round_reached;
    }

    static async getAll() {
        const result = await db.query(`
            SELECT t.team_id, t.name, t.jcups_won, t.runner_ups, t.highest_round_reached,
                   (SELECT MAX(attack) FROM players WHERE team_id = t.team_id AND is_goalkeeper = false) AS attack_rating,
                   (SELECT MAX(defense) FROM players WHERE team_id = t.team_id AND is_goalkeeper = false) AS defense_rating,
                   (SELECT MAX(defense) FROM players WHERE team_id = t.team_id AND is_goalkeeper = true) AS goalkeeper_rating
            FROM teams t
        `);
        return result.rows.map(t => new Team(t.team_id, t.name, t.attack_rating || 0, t.defense_rating || 0, t.goalkeeper_rating || 0, t.jcups_won, t.runner_ups, t.highest_round_reached));
    }

    static async getRatingById(teamId) {
        const result = await db.query(`
            SELECT team_id, name,
                   (SELECT MAX(attack) FROM players WHERE team_id = $1 AND is_goalkeeper = false) AS attack_rating,
                   (SELECT MAX(defense) FROM players WHERE team_id = $1 AND is_goalkeeper = false) AS defense_rating,
                   (SELECT MAX(defense) FROM players WHERE team_id = $1 AND is_goalkeeper = true) AS goalkeeper_rating
            FROM teams
            WHERE team_id = $1
        `, [teamId]);

        if (result.rows.length) {
            const t = result.rows[0];
            return new Team(t.team_id, t.name, t.attack_rating, t.defense_rating, t.goalkeeper_rating);
        }
        throw new Error(`Team with ID ${teamId} not found.`);
    }

    static async getRatingByTeamName(teamName) {
        const result = await db.query(`
            SELECT team_id, name,
                   (SELECT MAX(attack) FROM players WHERE team_id = teams.team_id AND is_goalkeeper = false) AS attack_rating,
                   (SELECT MAX(defense) FROM players WHERE team_id = teams.team_id AND is_goalkeeper = false) AS defense_rating,
                   (SELECT MAX(defense) FROM players WHERE team_id = teams.team_id AND is_goalkeeper = true) AS goalkeeper_rating
            FROM teams
            WHERE name = $1
        `, [teamName]);

        if (result.rows.length) {
            const t = result.rows[0];
            return new Team(t.team_id, t.name, t.attack_rating, t.defense_rating, t.goalkeeper_rating);
        }
        throw new Error(`Team with name '${teamName}' not found.`);
    }

    // add jcups won increase
    static async addJCupsWon(teamId) {
        const result = await db.query(`
            UPDATE teams
            SET jcups_won = jcups_won + 1
            WHERE team_id = $1
            RETURNING jcups_won
        `, [teamId]);

        if (result.rows.length) {
            return result.rows[0].jcups_won;
        }
        throw new Error(`Team with ID ${teamId} not found.`);
    }

    // add runner up increase
    static async addRunnerUp(teamId) {
        const result = await db.query(`
            UPDATE teams
            SET runner_ups = runner_ups + 1
            WHERE team_id = $1
            RETURNING runner_ups
        `, [teamId]);

        if (result.rows.length) {
            return result.rows[0].runner_ups;
        }
        throw new Error(`Team with ID ${teamId} not found.`);
    }

    static async getTop3JCupWinners() {
        const result = await db.query(`
            SELECT name, jcups_won
            FROM teams
            ORDER BY jcups_won DESC
            LIMIT 16
        `);

        return result.rows;
    }

    // Update match statistics (wins/losses/goals)
    static async updateMatchStats(teamId, won, goalsFor, goalsAgainst) {
        const result = await db.query(`
            UPDATE teams
            SET wins = wins + $2,
                losses = losses + $3,
                goals_for = goals_for + $4,
                goals_against = goals_against + $5
            WHERE team_id = $1
            RETURNING team_id, wins, losses, goals_for, goals_against
        `, [teamId, won ? 1 : 0, won ? 0 : 1, goalsFor, goalsAgainst]);

        if (result.rows.length) {
            return result.rows[0];
        }
        throw new Error(`Team with ID ${teamId} not found.`);
    }

    // Update highest round reached (only if better than current)
    static async updateHighestRound(teamId, roundName) {
        // Define round hierarchy (lower number = better achievement)
        const roundHierarchy = {
            'Winner': 1,
            'Runner-up': 2,
            'Semi-finals': 3,
            'Quarter-finals': 4,
            'Round of 16': 5,
            'Round of 32': 6
        };

        // Get current highest round
        const currentResult = await db.query(`
            SELECT highest_round_reached
            FROM teams
            WHERE team_id = $1
        `, [teamId]);

        if (currentResult.rows.length === 0) {
            throw new Error(`Team with ID ${teamId} not found.`);
        }

        const currentRound = currentResult.rows[0].highest_round_reached;
        const currentRank = currentRound ? roundHierarchy[currentRound] : 999;
        const newRank = roundHierarchy[roundName] || 999;

        // Only update if the new round is better (lower rank number)
        if (newRank < currentRank) {
            const result = await db.query(`
                UPDATE teams
                SET highest_round_reached = $2
                WHERE team_id = $1
                RETURNING highest_round_reached
            `, [teamId, roundName]);

            return result.rows[0].highest_round_reached;
        }

        return currentRound;
    }

    // Get all team statistics
    static async getAllStats() {
        const result = await db.query(`
            SELECT team_id, name, wins, losses, goals_for, goals_against, 
                   jcups_won, runner_ups, highest_round_reached
            FROM teams
            ORDER BY jcups_won DESC, wins DESC, name ASC
        `);

        return result.rows;
    }
}

module.exports = Team;
