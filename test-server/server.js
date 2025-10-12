const express = require('express');
const path = require('path');
const db = require('../db/connection');
const MatchSimulator = require('../Gamelogic/MatchSimulator');
const JCup = require('../Gamelogic/JCup');
const Team = require('../models/TeamModel');

const app = express();
const PORT = 3001;

// Championship state
const championship = new JCup();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// CORS for development
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

// API Routes

// GET /api/teams - Fetch all teams from database
app.get('/api/teams', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT t.team_id, t.name,
                   (SELECT MAX(attack) FROM players WHERE team_id = t.team_id AND is_goalkeeper = false) AS attack_rating,
                   (SELECT MAX(defense) FROM players WHERE team_id = t.team_id AND is_goalkeeper = false) AS defense_rating,
                   (SELECT MAX(defense) FROM players WHERE team_id = t.team_id AND is_goalkeeper = true) AS goalkeeper_rating
            FROM teams t
            ORDER BY t.name
        `);

        const teams = result.rows.map(t => ({
            id: t.team_id,
            name: t.name,
            attackRating: t.attack_rating || 50,
            defenseRating: t.defense_rating || 50,
            goalkeeperRating: t.goalkeeper_rating || 50
        }));

        res.json({ success: true, teams });
    } catch (error) {
        console.error('Error fetching teams:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch teams from database',
            details: error.message 
        });
    }
});

// POST /api/simulate - Simulate match with custom team data
app.post('/api/simulate', async (req, res) => {
    try {
        const { team1, team2 } = req.body;

        // Validate input
        if (!team1 || !team2) {
            return res.status(400).json({ 
                success: false, 
                error: 'Both team1 and team2 are required' 
            });
        }

        if (!team1.name || !team2.name) {
            return res.status(400).json({ 
                success: false, 
                error: 'Team names are required' 
            });
        }

        // Validate ratings
        const validateRating = (rating, name) => {
            const num = Number(rating);
            if (isNaN(num) || num < 0 || num > 200) {
                throw new Error(`${name} must be a number between 0 and 200`);
            }
            return num;
        };

        const team1Data = {
            name: team1.name,
            attackRating: validateRating(team1.attackRating, 'Team 1 attack rating'),
            defenseRating: validateRating(team1.defenseRating, 'Team 1 defense rating'),
            goalkeeperRating: validateRating(team1.goalkeeperRating, 'Team 1 goalkeeper rating')
        };

        const team2Data = {
            name: team2.name,
            attackRating: validateRating(team2.attackRating, 'Team 2 attack rating'),
            defenseRating: validateRating(team2.defenseRating, 'Team 2 defense rating'),
            goalkeeperRating: validateRating(team2.goalkeeperRating, 'Team 2 goalkeeper rating')
        };

        // Run simulation
        const simulator = new MatchSimulator(team1Data, team2Data);
        const result = simulator.simulate();

        // Categorize highlights by match phase
        const regularTimeHighlights = [];
        const extraTimeHighlights = [];
        const penaltyHighlights = [];

        result.highlights.forEach(highlight => {
            if (highlight.type === 'penaltyShootout') {
                penaltyHighlights.push(highlight);
            } else if (highlight.type === 'extraTimeStart' || 
                       highlight.type === 'extraTimeHalf' || 
                       highlight.type === 'extraTimeEnd' ||
                       (highlight.minute > 90 && highlight.minute <= 120)) {
                extraTimeHighlights.push(highlight);
            } else {
                regularTimeHighlights.push(highlight);
            }
        });

        // Send response with categorized highlights
        res.json({
            success: true,
            result: {
                score: result.score,
                penaltyScore: result.penaltyScore,
                highlights: result.highlights,
                finalResult: result.finalResult,
                regularTimeHighlights,
                extraTimeHighlights,
                penaltyHighlights,
                metadata: {
                    team1: team1Data.name,
                    team2: team2Data.name,
                    hadExtraTime: extraTimeHighlights.length > 0,
                    hadPenalties: penaltyHighlights.length > 0,
                    totalHighlights: result.highlights.length
                }
            }
        });

    } catch (error) {
        console.error('Simulation error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Simulation failed',
            details: error.message 
        });
    }
});

// Championship API Routes

// GET /api/championship/status - Get current championship state
app.get('/api/championship/status', (req, res) => {
    try {
        res.json({
            success: true,
            championship: {
                isInitialized: championship.teams.length > 0,
                currentRound: championship.currentRound,
                totalRounds: championship.fixtures.length,
                fixtures: championship.fixtures,
                results: championship.results,
                isComplete: championship.currentRound >= championship.fixtures.length && championship.fixtures.length > 0
            }
        });
    } catch (error) {
        console.error('Error getting championship status:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get championship status',
            details: error.message
        });
    }
});

// POST /api/championship/init - Initialize new championship
app.post('/api/championship/init', async (req, res) => {
    try {
        console.log('Initializing championship...');
        await championship.loadTeams();
        console.log('Teams loaded:', championship.teams.length);
        console.log('Fixtures generated:', championship.fixtures.length);
        
        res.json({
            success: true,
            message: 'Championship initialized successfully',
            championship: {
                currentRound: championship.currentRound,
                totalRounds: championship.fixtures.length,
                fixtures: championship.fixtures,
                teamCount: championship.teams.length
            }
        });
    } catch (error) {
        console.error('Error initializing championship:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({
            success: false,
            error: 'Failed to initialize championship',
            details: error.message,
            stack: error.stack
        });
    }
});

// POST /api/championship/simulate-round - Simulate current round
app.post('/api/championship/simulate-round', async (req, res) => {
    try {
        // Check if championship is initialized
        if (!championship.fixtures || championship.fixtures.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Championship not initialized. Please initialize first.'
            });
        }

        // Check if there are rounds left to play
        if (championship.currentRound >= championship.fixtures.length) {
            return res.status(400).json({
                success: false,
                error: 'Championship is complete. No more rounds to simulate.'
            });
        }

        console.log('Before simulation - currentRound:', championship.currentRound, 'totalRounds:', championship.fixtures.length);
        
        // Simulate the round
        const simulationResult = await championship.simulateRound();
        
        console.log('After simulation - currentRound:', championship.currentRound, 'totalRounds:', championship.fixtures.length);
        console.log('Simulation result has winner?', !!simulationResult.winner);
        
        // Check if this was the final (only 1 winner remains)
        const isFinal = simulationResult.winner !== undefined;
        
        res.json({
            success: true,
            message: 'Round simulated successfully',
            result: simulationResult,
            championship: {
                currentRound: championship.currentRound,
                totalRounds: championship.fixtures.length,
                isComplete: isFinal || championship.currentRound >= championship.fixtures.length,
                isFinal: isFinal
            }
        });
    } catch (error) {
        console.error('Error simulating round:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to simulate round',
            details: error.message
        });
    }
});

// POST /api/championship/reset - Reset championship state
app.post('/api/championship/reset', (req, res) => {
    try {
        championship.resetJCup();
        
        res.json({
            success: true,
            message: 'Championship reset successfully'
        });
    } catch (error) {
        console.error('Error resetting championship:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to reset championship',
            details: error.message
        });
    }
});

// GET /api/stats - Get all team statistics
app.get('/api/stats', async (req, res) => {
    try {
        const stats = await Team.getAllStats();
        
        res.json({
            success: true,
            stats: stats
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch team statistics',
            details: error.message
        });
    }
});

// Serve index.html for root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`\n🎮 Match Simulator Test Server`);
    console.log(`================================`);
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Open your browser and navigate to the URL above`);
    console.log(`================================\n`);
});

module.exports = app;

