const { BettingService } = require('../services/BettingService');
const { Bet } = require('../models/BetModel');

function handleError(res, error, context) {
    if (error.isBettingError) {
        return res.status(400).json({ error: error.message });
    }
    console.error(`${context} error:`, error);
    res.status(500).json({ error: error.message });
}

// === Odds (public) ===

// Pre-match betting odds for a fixture
const getFixtureBettingOdds = async (req, res) => {
    try {
        const data = await BettingService.getFixtureOdds(parseInt(req.params.id));
        res.json({
            fixtureId: data.fixture.fixtureId,
            homeTeam: data.homeTeam ? { id: data.homeTeam.id, name: data.homeTeam.name } : null,
            awayTeam: data.awayTeam ? { id: data.awayTeam.id, name: data.awayTeam.name } : null,
            status: data.fixture.status,
            odds: data.odds,
            bettingOpen: data.bettingOpen,
            reason: data.reason
        });
    } catch (error) {
        handleError(res, error, 'getFixtureBettingOdds');
    }
};

// Live in-play odds for a fixture
const getLiveBettingOdds = async (req, res) => {
    try {
        const data = await BettingService.getLiveOdds(parseInt(req.params.id));
        res.json({
            fixtureId: data.fixture.fixtureId,
            homeTeam: data.homeTeam ? { id: data.homeTeam.id, name: data.homeTeam.name } : null,
            awayTeam: data.awayTeam ? { id: data.awayTeam.id, name: data.awayTeam.name } : null,
            status: data.fixture.status,
            matchState: data.matchState || null,
            minute: data.minute ?? null,
            score: data.score || null,
            odds: data.odds,
            bettingOpen: data.bettingOpen,
            reason: data.reason
        });
    } catch (error) {
        handleError(res, error, 'getLiveBettingOdds');
    }
};

// Championship winner odds board
const getChampionshipOdds = async (req, res) => {
    try {
        const board = await BettingService.getChampionshipOdds();
        res.json(board);
    } catch (error) {
        handleError(res, error, 'getChampionshipOdds');
    }
};

// === Bet placement (protected) ===

const placeFixtureBet = async (req, res) => {
    try {
        const { fixtureId, teamId, stake } = req.body || {};

        if (!fixtureId || !teamId) {
            return res.status(400).json({ error: 'fixtureId and teamId required' });
        }

        const { bet, balance } = await BettingService.placeFixtureBet({
            userId: req.user.userId,
            fixtureId: parseInt(fixtureId),
            teamId: parseInt(teamId),
            stake,
            live: false
        });

        res.status(201).json({ message: 'Bet placed', bet: bet.toJSON(), balance });
    } catch (error) {
        handleError(res, error, 'placeFixtureBet');
    }
};

const placeLiveFixtureBet = async (req, res) => {
    try {
        const { fixtureId, teamId, stake } = req.body || {};

        if (!fixtureId || !teamId) {
            return res.status(400).json({ error: 'fixtureId and teamId required' });
        }

        const { bet, balance } = await BettingService.placeFixtureBet({
            userId: req.user.userId,
            fixtureId: parseInt(fixtureId),
            teamId: parseInt(teamId),
            stake,
            live: true
        });

        res.status(201).json({ message: 'Live bet placed', bet: bet.toJSON(), balance });
    } catch (error) {
        handleError(res, error, 'placeLiveFixtureBet');
    }
};

const placeChampionshipBet = async (req, res) => {
    try {
        const { teamId, stake } = req.body || {};

        if (!teamId) {
            return res.status(400).json({ error: 'teamId required' });
        }

        const { bet, balance } = await BettingService.placeChampionshipBet({
            userId: req.user.userId,
            teamId: parseInt(teamId),
            stake
        });

        res.status(201).json({ message: 'Championship bet placed', bet: bet.toJSON(), balance });
    } catch (error) {
        handleError(res, error, 'placeChampionshipBet');
    }
};

// === Bet listing (protected) ===

const listBets = async (req, res) => {
    try {
        const { status, fixtureId, betType, limit } = req.query;

        const bets = await Bet.getByUserId(req.user.userId, {
            status,
            fixtureId: fixtureId ? parseInt(fixtureId) : null,
            betType,
            limit: limit ? Math.min(parseInt(limit), 200) : 100
        });

        res.json({
            count: bets.length,
            bets: bets.map(b => b.toJSON())
        });
    } catch (error) {
        handleError(res, error, 'listBets');
    }
};

const getBettingSummary = async (req, res) => {
    try {
        const summary = await Bet.getSummary(req.user.userId);
        res.json({ summary });
    } catch (error) {
        handleError(res, error, 'getBettingSummary');
    }
};

module.exports = {
    getFixtureBettingOdds,
    getLiveBettingOdds,
    getChampionshipOdds,
    placeFixtureBet,
    placeLiveFixtureBet,
    placeChampionshipBet,
    listBets,
    getBettingSummary
};
