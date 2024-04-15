const express = require('express');
const router = express.Router();
const jCupController = require('../controllers/jCupController');

// Route to initialize the tournament
router.get('/init', jCupController.initTournament);

// Route to play a round
router.get('/play', jCupController.playRound);

// Route to increase jCupWon count
router.post('/end', jCupController.jCupWon);

module.exports = router;
