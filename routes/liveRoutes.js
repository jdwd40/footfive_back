const express = require('express');
const router = express.Router();
const {
  streamEvents,
  getTournamentState,
  getActiveMatches,
  getMatchState,
  getRecentEvents,
  getStatus,
  getLiveFixtures
} = require('../controllers/liveController');

// SSE stream
router.get('/events', streamEvents);              // GET /api/live/events?tournamentId=&fixtureId=&afterSeq=

// Snapshots
router.get('/status', getStatus);                 // GET /api/live/status
router.get('/tournament', getTournamentState);    // GET /api/live/tournament
router.get('/matches', getActiveMatches);         // GET /api/live/matches
router.get('/matches/:fixtureId', getMatchState); // GET /api/live/matches/:fixtureId
router.get('/fixtures', getLiveFixtures);         // GET /api/live/fixtures

// Event history
router.get('/events/recent', getRecentEvents);    // GET /api/live/events/recent?fixtureId=&type=&limit=

module.exports = router;
