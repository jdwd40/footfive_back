const express = require('express');
const router = express.Router();
const {
    getGarage,
    setTeam,
    setLineup,
    setPlayerMode,
    buyEnergy,
    repairPlayer,
    upgradePlayer,
    getLatestResult,
    getResultForFixture,
    processFixture,
    getTransactions
} = require('../controllers/garageController');

// Cyborg Garage - one shared user-controlled team. Virtual credits only.
router.get('/', getGarage);                                    // GET  /api/garage
router.put('/team', setTeam);                                  // PUT  /api/garage/team { teamId }
router.put('/lineup', setLineup);                              // PUT  /api/garage/lineup { activePlayerIds: [5 ids] }
router.put('/players/:playerId/mode', setPlayerMode);          // PUT  /api/garage/players/:id/mode { mode }
router.post('/energy', buyEnergy);                             // POST /api/garage/energy { pack: 'small'|'full', playerId? }
router.post('/players/:playerId/repair', repairPlayer);        // POST /api/garage/players/:id/repair
router.post('/players/:playerId/upgrade', upgradePlayer);      // POST /api/garage/players/:id/upgrade { stat }
router.get('/rewards/latest', getLatestResult);                // GET  /api/garage/rewards/latest
router.get('/rewards/:fixtureId', getResultForFixture);        // GET  /api/garage/rewards/:fixtureId
router.post('/rewards/:fixtureId/process', processFixture);    // POST /api/garage/rewards/:fixtureId/process (idempotent)
router.get('/transactions', getTransactions);                  // GET  /api/garage/transactions?limit=

module.exports = router;
