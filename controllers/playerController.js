const Player = require('../models/PlayerModel');
const db = require('../db/connection');

exports.getAllPlayers = async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM players');
        const players = result.rows.map(p => new Player(p.player_id, p.team_id, p.name, p.attack, p.defense, p.is_goalkeeper));
        return res.status(200).json({
            message: "Players fetched successfully",
            players: players
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to fetch players",
            error: error.message
        });
    }
}

exports.getPlayersByTeamName = async (req, res) => {
    try {
        const { teamName } = req.params;
        const players = await Player.fetchByTeamName(teamName);
        return res.status(200).json({
            message: `Players for ${teamName} fetched successfully`,
            players: players
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to fetch players by team name",
            error: error.message
        });
    }
}

exports.getPlayerById = async (req, res) => {
    try {
        const { playerId } = req.params;
        const player = await Player.fetchById(playerId);
        return res.status(200).json({
            message: "Player fetched successfully",
            player: player
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to fetch player",
            error: error.message
        });
    }
}
