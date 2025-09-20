const express = require('express');
const router = express.Router();

const playerController = require('../controllers/playerController');

// Route to get all players
router.get('/', playerController.getAllPlayers);

// Route to get players by team name
router.get('/team/:teamName', playerController.getPlayersByTeamName);

// Route to get player by ID
router.get('/:playerId', playerController.getPlayerById);

module.exports = router;
