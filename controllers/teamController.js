const Team = require('../models/TeamModel');
const Player = require('../models/PlayerModel');

exports.getAllTeams = async (req, res) => {
    try {
        const teams = await Team.getAll();
        return res.status(200).json({
            message: "Teams fetched successfully",
            teams: teams
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to fetch teams",
            error: error.message
        });
    }
}

exports.getTop3JCupWinners = async (req, res) => {
    try {
        const top3JCupWinners = await Team.getTop3JCupWinners();
        return res.status(200).json({
            message: "Top 3 JCup winners fetched successfully",
            top3JCupWinners: top3JCupWinners
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to fetch top 3 JCup winners",
            error: error.message
        });
    }
}

exports.getAllStats = async (req, res) => {
    try {
        const stats = await Team.getAllStats();
        return res.status(200).json({
            message: "Team stats fetched successfully",
            stats: stats
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to fetch team stats",
            error: error.message
        });
    }
}