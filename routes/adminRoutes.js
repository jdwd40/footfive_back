const express = require('express');
const router = express.Router();
const {
  startSimulation,
  stopSimulation,
  forceTournamentStart,
  cancelTournament,
  skipToRound,
  forceScore,
  forceEndMatch,
  pauseSimulation,
  resumeSimulation,
  setSpeed,
  getFullState,
  clearEvents
} = require('../controllers/adminController');

// Simulation loop controls
router.post('/simulation/start', startSimulation);   // POST /api/admin/simulation/start
router.post('/simulation/stop', stopSimulation);     // POST /api/admin/simulation/stop

// Tournament controls
router.post('/tournament/start', forceTournamentStart);   // POST /api/admin/tournament/start
router.post('/tournament/cancel', cancelTournament);      // POST /api/admin/tournament/cancel
router.post('/tournament/skip-to-round', skipToRound);    // POST /api/admin/tournament/skip-to-round

// Match controls
router.post('/match/:fixtureId/force-score', forceScore);   // POST /api/admin/match/:id/force-score
router.post('/match/:fixtureId/force-end', forceEndMatch);  // POST /api/admin/match/:id/force-end

// Clock controls
router.post('/clock/pause', pauseSimulation);     // POST /api/admin/clock/pause
router.post('/clock/resume', resumeSimulation);   // POST /api/admin/clock/resume
router.post('/clock/set-speed', setSpeed);        // POST /api/admin/clock/set-speed

// Debug
router.get('/state', getFullState);               // GET /api/admin/state
router.post('/events/clear', clearEvents);        // POST /api/admin/events/clear

module.exports = router;
