const express = require('express');
const router = express.Router();
const {
    createFixture,
    createFixtures,
    getFixtures,
    getFixture,
    getFixtureOdds,
    recalculateOdds,
    getMatchReport,
    getMatchEvents,
    getMatchGoals,
    deleteFixture,
    simulateFixture
} = require('../controllers/fixtureController');

// Fixture CRUD
router.post('/', createFixture);              // POST /api/fixtures - create single
router.post('/batch', createFixtures);        // POST /api/fixtures/batch - create multiple
router.get('/', getFixtures);                 // GET /api/fixtures?status=&teamId=&round=
router.get('/:id', getFixture);               // GET /api/fixtures/:id
router.delete('/:id', deleteFixture);         // DELETE /api/fixtures/:id

// Odds
router.get('/:id/odds', getFixtureOdds);      // GET /api/fixtures/:id/odds
router.post('/:id/odds/calculate', recalculateOdds); // POST /api/fixtures/:id/odds/calculate

// Simulation
router.post('/:id/simulate', simulateFixture); // POST /api/fixtures/:id/simulate

// Match data (after simulation)
router.get('/:id/report', getMatchReport);    // GET /api/fixtures/:id/report
router.get('/:id/events', getMatchEvents);    // GET /api/fixtures/:id/events?type=&afterEventId=
router.get('/:id/goals', getMatchGoals);      // GET /api/fixtures/:id/goals

module.exports = router;
