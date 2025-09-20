const JCup = require('../Gamelogic/JCup');
const jCup = new JCup(); // Initialize JCup instance globally if it's to be reused across multiple requests

// Initialize tournament and generate fixtures
exports.initTournament = async (req, res) => {
    try {
        await jCup.loadTeams(); // Load teams into the JCup instance

        return res.status(200).json({
            message: "Tournament initialized successfully",
            fixtures: jCup.fixtures
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to initialize the tournament",
            error: error.message
        });
    }
};

// Simulate a round
exports.playRound = async (req, res) => {
    if (jCup.currentRound >= jCup.fixtures.length) {
        return res.status(400).json({ message: "No more rounds to play or tournament not initialized." });
    }

    try {
        const simulationResult = await jCup.simulateRound(); // Simulate the current round

        // Check if it's round 4
        if (jCup.currentRound === 4) {
            console.log(simulationResult);
            return res.status(200).json({
                message: `Final played successfully.`,
                results: simulationResult.roundResults || simulationResult
            });
        }

        return res.status(200).json({
            message: `Round ${jCup.currentRound} played successfully.`,
            results: simulationResult.roundResults || simulationResult
        });
    } catch (error) {
        return res.status(500).json({
            message: `Failed to play round ${jCup.currentRound}`,
            error: error.message
        });
    }
};

// increace jcupwon count
exports.jCupWon = async (req, res) => {
    try {
        const {winner_id, runner_id} = req.body;
        const jCupWon = await jCup.jCupWon(winner_id, runner_id);
        return res.status(200).json({
            message: "jCupWon updated successfully",
            jCupWon: jCupWon
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to increase jCupWon",
            error: error.message
        });
    }
};


