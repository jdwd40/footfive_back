const express = require('express');
const router = express.Router();

const teamController = require('../controllers/teamController');

// Route to get all teams
router.get('/', teamController.getAllTeams);

// Route to get top JCup winners
router.get('/3jcup', teamController.getTop3JCupWinners);

// Route to get all team stats (wins, losses, goals, cups, highest_round, etc.)
router.get('/stats', teamController.getAllStats);

module.exports = router;