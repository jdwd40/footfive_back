const express = require('express');
const router = express.Router();

const teamController = require('../controllers/teamController');

// Route to get all teams
router.get('/', teamController.getAllTeams);

router.get('/3jcup', teamController.getTop3JCupWinners);

module.exports = router;