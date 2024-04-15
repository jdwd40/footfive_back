const db = require('../db/connection');

class Team {
    constructor(id, name, attackRating = 0, defenseRating = 0, goalkeeperRating = 0) {
        this.id = id;
        this.name = name;
        this.attackRating = attackRating;
        this.defenseRating = defenseRating;
        this.goalkeeperRating = goalkeeperRating;
        this.wins = 0;
        this.losses = 0;
        this.goalsFor = 0;
        this.goalsAgainst = 0;
        this.jcupsWon = 0;
        this.runnerUps = 0;
    }

    static async getAll() {
        const teams = await db.query('SELECT * FROM teams');
        return teams.rows.map(t => new Team(t.team_id, t.name, t.attack_rating, t.defense_rating, t.goalkeeper_rating));
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
}

module.exports = Team;
