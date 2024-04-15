const pool = require('../db/connection');

class Player {
  constructor(playerId, teamId, name, attack, defense, isGoalkeeper) {
    this.playerId = playerId;
    this.teamId = teamId;
    this.name = name;
    this.attack = attack;
    this.defense = defense;
    this.isGoalkeeper = isGoalkeeper;
  }

  static async fetchById(playerId) {
    const res = await pool.query('SELECT * FROM players WHERE player_id = $1', [playerId]);
    if (res.rows.length) {
      const p = res.rows[0];
      return new Player(p.player_id, p.team_id, p.name, p.attack, p.defense, p.is_goalkeeper);
    } else {
      throw new Error(`Player with ID ${playerId} not found`);
    }
  }
    static async updateById(playerId, name, attack, defense) {
      const res = await pool.query('UPDATE players SET name = $1, attack = $2, defense = $3 WHERE player_id = $4 RETURNING *', [name, attack, defense, playerId]);
      if (res.rows.length) {
        const p = res.rows[0];
        return new Player(p.player_id, p.team_id, p.name, p.attack, p.defense, p.is_goalkeeper);
      } else {
        throw new Error(`Player with ID ${playerId} not found`);
      }
    }

    static async fetchByTeamName(teamName) {
      const res = await pool.query('SELECT players.name AS player_name, players.attack, players.defense, players.is_goalkeeper FROM players JOIN teams ON players.team_id = teams.team_id WHERE teams.name = $1', [teamName]);
      return res.rows.map(p => new Player(p.player_id, p.team_id, p.player_name, p.attack, p.defense, p.is_goalkeeper));
    }
}

module.exports = Player;
