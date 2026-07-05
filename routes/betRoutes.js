const express = require('express');
const router = express.Router();
const {
    getFixtureBettingOdds,
    getLiveBettingOdds,
    getChampionshipOdds,
    placeFixtureBet,
    placeLiveFixtureBet,
    placeChampionshipBet,
    listBets,
    getBettingSummary
} = require('../controllers/betController');
const { requireAuth } = require('../middleware/auth');

// Odds (public - viewing odds does not require an account)
router.get('/fixtures/:id/odds', getFixtureBettingOdds);       // GET /api/betting/fixtures/:id/odds
router.get('/fixtures/:id/live-odds', getLiveBettingOdds);     // GET /api/betting/fixtures/:id/live-odds
router.get('/championship/odds', getChampionshipOdds);         // GET /api/betting/championship/odds

// Bet placement (protected, virtual funds only)
router.post('/fixture', requireAuth, placeFixtureBet);         // POST /api/betting/fixture
router.post('/fixture/live', requireAuth, placeLiveFixtureBet);// POST /api/betting/fixture/live
router.post('/championship', requireAuth, placeChampionshipBet);// POST /api/betting/championship

// User bets (protected)
router.get('/bets', requireAuth, listBets);                    // GET /api/betting/bets?status=&fixtureId=&betType=
router.get('/summary', requireAuth, getBettingSummary);        // GET /api/betting/summary

module.exports = router;
