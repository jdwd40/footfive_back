const Fixture = require('../models/FixtureModel');
const Odds = require('../models/OddsModel');
const MatchEvent = require('../models/MatchEventModel');
const MatchReport = require('../models/MatchReportModel');
const Team = require('../models/TeamModel');
const OddsEngine = require('../Gamelogic/OddsEngine');
const SimulationEngine = require('../Gamelogic/SimulationEngine');

const oddsEngine = new OddsEngine(0.05);

// Create a new fixture with odds
const createFixture = async (req, res) => {
    try {
        const { homeTeamId, awayTeamId, tournamentId, round, scheduledAt } = req.body;

        if (!homeTeamId || !awayTeamId) {
            return res.status(400).json({ error: 'homeTeamId and awayTeamId required' });
        }

        if (homeTeamId === awayTeamId) {
            return res.status(400).json({ error: 'Teams must be different' });
        }

        // Create fixture
        const fixture = await Fixture.create({
            homeTeamId,
            awayTeamId,
            tournamentId,
            round,
            scheduledAt
        });

        // Get team ratings for odds calculation
        const homeTeam = await Team.getRatingById(homeTeamId);
        const awayTeam = await Team.getRatingById(awayTeamId);

        // Calculate and save odds
        const odds = await oddsEngine.calculateAndSaveOdds(fixture.fixtureId, homeTeam, awayTeam);

        res.status(201).json({
            message: 'Fixture created',
            fixture: {
                fixtureId: fixture.fixtureId,
                homeTeam: { id: homeTeam.id, name: homeTeam.name },
                awayTeam: { id: awayTeam.id, name: awayTeam.name },
                round: fixture.round,
                status: fixture.status,
                scheduledAt: fixture.scheduledAt
            },
            odds: odds.toJSON()
        });
    } catch (error) {
        console.error('createFixture error:', error);
        res.status(500).json({ error: error.message });
    }
};

// Create multiple fixtures (for tournament rounds)
const createFixtures = async (req, res) => {
    try {
        const { fixtures } = req.body;

        if (!fixtures || !Array.isArray(fixtures) || !fixtures.length) {
            return res.status(400).json({ error: 'fixtures array required' });
        }

        // Create all fixtures
        const createdFixtures = await Fixture.createBatch(fixtures);

        // Calculate odds for each
        const results = [];
        for (const fixture of createdFixtures) {
            const homeTeam = await Team.getRatingById(fixture.homeTeamId);
            const awayTeam = await Team.getRatingById(fixture.awayTeamId);
            const odds = await oddsEngine.calculateAndSaveOdds(fixture.fixtureId, homeTeam, awayTeam);

            results.push({
                fixtureId: fixture.fixtureId,
                homeTeam: { id: homeTeam.id, name: homeTeam.name },
                awayTeam: { id: awayTeam.id, name: awayTeam.name },
                round: fixture.round,
                odds: {
                    homeWin: odds.homeWinOdds,
                    awayWin: odds.awayWinOdds
                }
            });
        }

        res.status(201).json({
            message: `${results.length} fixtures created`,
            fixtures: results
        });
    } catch (error) {
        console.error('createFixtures error:', error);
        res.status(500).json({ error: error.message });
    }
};

// Get all fixtures
const getFixtures = async (req, res) => {
    try {
        const { status, teamId, tournamentId, round, limit } = req.query;

        const fixtures = await Fixture.getAll({
            status,
            teamId: teamId ? parseInt(teamId) : null,
            tournamentId: tournamentId ? parseInt(tournamentId) : null,
            round,
            limit: limit ? parseInt(limit) : 100
        });

        res.json({
            count: fixtures.length,
            fixtures: fixtures.map(f => ({
                fixtureId: f.fixtureId,
                homeTeam: { id: f.homeTeamId, name: f.homeTeamName },
                awayTeam: { id: f.awayTeamId, name: f.awayTeamName },
                round: f.round,
                status: f.status,
                score: f.status === 'completed' ? {
                    home: f.homeScore,
                    away: f.awayScore,
                    penalties: f.homePenaltyScore ? {
                        home: f.homePenaltyScore,
                        away: f.awayPenaltyScore
                    } : null
                } : null,
                scheduledAt: f.scheduledAt,
                completedAt: f.completedAt
            }))
        });
    } catch (error) {
        console.error('getFixtures error:', error);
        res.status(500).json({ error: error.message });
    }
};

// Get single fixture with odds
const getFixture = async (req, res) => {
    try {
        const { id } = req.params;
        const fixture = await Fixture.getByIdWithOdds(parseInt(id));

        res.json({
            fixture: {
                fixtureId: fixture.fixtureId,
                homeTeam: { id: fixture.homeTeamId, name: fixture.homeTeamName },
                awayTeam: { id: fixture.awayTeamId, name: fixture.awayTeamName },
                round: fixture.round,
                status: fixture.status,
                score: fixture.status === 'completed' ? {
                    home: fixture.homeScore,
                    away: fixture.awayScore,
                    penalties: fixture.homePenaltyScore ? {
                        home: fixture.homePenaltyScore,
                        away: fixture.awayPenaltyScore
                    } : null
                } : null,
                winnerId: fixture.winnerTeamId,
                scheduledAt: fixture.scheduledAt,
                completedAt: fixture.completedAt
            },
            odds: fixture.odds || null
        });
    } catch (error) {
        console.error('getFixture error:', error);
        res.status(404).json({ error: error.message });
    }
};

// Get fixture odds
const getFixtureOdds = async (req, res) => {
    try {
        const { id } = req.params;
        const odds = await Odds.getByFixtureId(parseInt(id));

        if (!odds) {
            return res.status(404).json({ error: 'Odds not found for fixture' });
        }

        res.json({ odds: odds.toJSON() });
    } catch (error) {
        console.error('getFixtureOdds error:', error);
        res.status(500).json({ error: error.message });
    }
};

// Recalculate odds for a fixture
const recalculateOdds = async (req, res) => {
    try {
        const { id } = req.params;
        const fixture = await Fixture.getById(parseInt(id));

        if (fixture.status === 'completed') {
            return res.status(400).json({ error: 'Cannot recalculate odds for completed fixture' });
        }

        const homeTeam = await Team.getRatingById(fixture.homeTeamId);
        const awayTeam = await Team.getRatingById(fixture.awayTeamId);
        const odds = await oddsEngine.calculateAndSaveOdds(fixture.fixtureId, homeTeam, awayTeam);

        res.json({
            message: 'Odds recalculated',
            odds: odds.toJSON()
        });
    } catch (error) {
        console.error('recalculateOdds error:', error);
        res.status(500).json({ error: error.message });
    }
};

// Get match report
const getMatchReport = async (req, res) => {
    try {
        const { id } = req.params;
        const report = await MatchReport.getByFixtureIdWithDetails(parseInt(id));

        if (!report) {
            return res.status(404).json({ error: 'Match report not found' });
        }

        res.json({
            fixture: report.fixture,
            report: report.toJSON()
        });
    } catch (error) {
        console.error('getMatchReport error:', error);
        res.status(500).json({ error: error.message });
    }
};

// Get match events
const getMatchEvents = async (req, res) => {
    try {
        const { id } = req.params;
        const { type, afterEventId } = req.query;

        let events;

        if (afterEventId) {
            // For live streaming - get events after a certain point
            events = await MatchEvent.getAfter(parseInt(id), parseInt(afterEventId));
        } else if (type) {
            events = await MatchEvent.getByType(parseInt(id), type);
        } else {
            events = await MatchEvent.getByFixtureId(parseInt(id), { includePlayerNames: true });
        }

        res.json({
            count: events.length,
            events: events.map(e => e.toJSON())
        });
    } catch (error) {
        console.error('getMatchEvents error:', error);
        res.status(500).json({ error: error.message });
    }
};

// Get goals for a fixture
const getMatchGoals = async (req, res) => {
    try {
        const { id } = req.params;
        const goals = await MatchEvent.getGoals(parseInt(id));

        res.json({
            count: goals.length,
            goals: goals.map(g => g.toJSON())
        });
    } catch (error) {
        console.error('getMatchGoals error:', error);
        res.status(500).json({ error: error.message });
    }
};

// Delete fixture
const deleteFixture = async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await Fixture.delete(parseInt(id));

        if (!deleted) {
            return res.status(404).json({ error: 'Fixture not found' });
        }

        res.json({ message: 'Fixture deleted' });
    } catch (error) {
        console.error('deleteFixture error:', error);
        res.status(500).json({ error: error.message });
    }
};

// Simulate a fixture
const simulateFixture = async (req, res) => {
    try {
        const { id } = req.params;
        const fixture = await Fixture.getById(parseInt(id));

        if (fixture.status === 'completed') {
            return res.status(400).json({ error: 'Fixture already completed' });
        }

        if (fixture.status === 'live') {
            return res.status(400).json({ error: 'Fixture already in progress' });
        }

        // Get team ratings
        const homeTeam = await Team.getRatingById(fixture.homeTeamId);
        const awayTeam = await Team.getRatingById(fixture.awayTeamId);

        // Run simulation
        const engine = new SimulationEngine(fixture.fixtureId, homeTeam, awayTeam);
        const result = await engine.simulate();

        res.json({
            message: 'Match simulated',
            result: {
                fixtureId: result.fixtureId,
                finalResult: result.finalResult,
                score: result.score,
                penaltyScore: result.penaltyScore,
                stats: {
                    home: {
                        possession: result.stats.home.possession,
                        shots: result.stats.home.shots,
                        shotsOnTarget: result.stats.home.shotsOnTarget,
                        xG: Math.round(result.stats.home.xg * 100) / 100,
                        corners: result.stats.home.corners,
                        fouls: result.stats.home.fouls,
                        yellowCards: result.stats.home.yellowCards,
                        redCards: result.stats.home.redCards
                    },
                    away: {
                        possession: result.stats.away.possession,
                        shots: result.stats.away.shots,
                        shotsOnTarget: result.stats.away.shotsOnTarget,
                        xG: Math.round(result.stats.away.xg * 100) / 100,
                        corners: result.stats.away.corners,
                        fouls: result.stats.away.fouls,
                        yellowCards: result.stats.away.yellowCards,
                        redCards: result.stats.away.redCards
                    }
                }
            }
        });
    } catch (error) {
        console.error('simulateFixture error:', error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
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
};
