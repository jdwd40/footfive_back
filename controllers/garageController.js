const GarageService = require('../services/GarageService');
const GarageRewardService = require('../services/GarageRewardService');

// Expected/validation problems come back as GarageError -> 400; anything
// else is a real server error -> 500.
const handleError = (res, label, error) => {
    if (error.isGarageError) {
        return res.status(400).json({ error: error.message });
    }
    console.error(`${label} error:`, error);
    res.status(500).json({ error: error.message });
};

// Full garage state: balance, 7-player squad, next fixture, last result.
const getGarage = async (req, res) => {
    try {
        const state = await GarageService.getState();
        if (!state) {
            return res.status(404).json({ error: 'Garage not initialised' });
        }
        res.json({ garage: state });
    } catch (error) {
        handleError(res, 'getGarage', error);
    }
};

// Switch which team the garage controls (balance is kept).
const setTeam = async (req, res) => {
    try {
        const garage = await GarageService.setTeam(req.body?.teamId);
        res.json({ message: 'Team switched', garage });
    } catch (error) {
        handleError(res, 'setTeam', error);
    }
};

// Set the active 5 (the other 2 become spares).
const setLineup = async (req, res) => {
    try {
        const squad = await GarageService.setLineup(req.body?.activePlayerIds);
        res.json({ message: 'Lineup saved', squad });
    } catch (error) {
        handleError(res, 'setLineup', error);
    }
};

// Set a squad player's mode (passive / balanced / aggressive).
const setPlayerMode = async (req, res) => {
    try {
        const player = await GarageService.setPlayerMode(
            parseInt(req.params.playerId), req.body?.mode
        );
        res.json({ message: 'Mode updated', player });
    } catch (error) {
        handleError(res, 'setPlayerMode', error);
    }
};

// Buy energy: { pack: 'small', playerId } or { pack: 'full' }.
const buyEnergy = async (req, res) => {
    try {
        const { pack, playerId } = req.body || {};
        const result = await GarageService.buyEnergy({
            pack,
            playerId: playerId != null ? parseInt(playerId) : null
        });
        res.json({ message: 'Energy purchased', ...result });
    } catch (error) {
        handleError(res, 'buyEnergy', error);
    }
};

// Fully repair one player's condition.
const repairPlayer = async (req, res) => {
    try {
        const result = await GarageService.repairPlayer(parseInt(req.params.playerId));
        res.json({ message: 'Player repaired', ...result });
    } catch (error) {
        handleError(res, 'repairPlayer', error);
    }
};

// Upgrade a player's attack, defence or speed by +1.
const upgradePlayer = async (req, res) => {
    try {
        const result = await GarageService.upgradePlayer(
            parseInt(req.params.playerId), req.body?.stat
        );
        res.json({ message: 'Player upgraded', ...result });
    } catch (error) {
        handleError(res, 'upgradePlayer', error);
    }
};

// Latest processed garage match result (reward summary).
const getLatestResult = async (req, res) => {
    try {
        const result = await GarageService.getResultForFixture(null);
        res.json({ result });
    } catch (error) {
        handleError(res, 'getLatestResult', error);
    }
};

// Processed garage result for one fixture.
const getResultForFixture = async (req, res) => {
    try {
        const result = await GarageService.getResultForFixture(parseInt(req.params.fixtureId));
        if (!result) {
            return res.status(404).json({ error: 'No garage result for this fixture' });
        }
        res.json({ result });
    } catch (error) {
        handleError(res, 'getResultForFixture', error);
    }
};

// Manually trigger reward processing for a fixture. Idempotent - the sim
// loop normally does this automatically when the match finalises.
const processFixture = async (req, res) => {
    try {
        const outcome = await GarageRewardService.processFixtureResult(parseInt(req.params.fixtureId));
        res.json(outcome);
    } catch (error) {
        handleError(res, 'processFixture', error);
    }
};

// Recent garage money movements.
const getTransactions = async (req, res) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit) : 20;
        const transactions = await GarageService.getTransactions(limit);
        res.json({ count: transactions.length, transactions });
    } catch (error) {
        handleError(res, 'getTransactions', error);
    }
};

module.exports = {
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
};
