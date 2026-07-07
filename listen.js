const express = require('express');
const app = express();
const cors = require('cors');
const routes = require('./routes');

// Simulation system
const { getSimulationLoop, resetSimulationLoop } = require('./gamelogic/simulation/SimulationLoop');
const { TournamentManager } = require('./gamelogic/simulation/TournamentManager');
const { getEventBus, resetEventBus } = require('./gamelogic/simulation/EventBus');

app.use(express.json()); // for parsing application/json

// Setup CORS
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        // Allow localhost for development
        if (origin.includes('127.0.0.1') || origin.includes('localhost')) {
            return callback(null, true);
        }
        
        // Allow your VPS IP/domain for production
        if (origin.includes('77.68.4.18') || origin.includes('jwd1.xyz')) {
            return callback(null, true);
        }
        
        // For testing tools like Insomnia/Postman, allow all origins in non-production
        if (process.env.NODE_ENV !== 'production') {
            return callback(null, true);
        }
        
        return callback(null, true); // Allow all for now - tighten this later
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
    optionsSuccessStatus: 200 // For legacy browser support
};

app.use(cors(corsOptions));

app.use('/api', routes); // Mount your API routes here

const server = app.listen(9001, async () => {
    console.log('Server is running on port 9001');

    // Cyborg Garage: make sure garage data exists (idempotent). Runs even
    // when the simulation is started later via the admin API.
    const GarageService = require('./services/GarageService');
    GarageService.ensureInitialized()
        .catch(err => console.error('[Server] Garage init failed:', err));

    // Auto-start simulation if enabled
    if (process.env.SIMULATION_AUTO_START === 'true') {
        await startSimulation();
    }
});

/**
 * Initialize and start the simulation loop
 */
async function startSimulation() {
    try {
        console.log('[Server] Initializing simulation system...');

        const loop = getSimulationLoop();
        const eventBus = getEventBus();
        const tournamentManager = new TournamentManager();

        loop.init({ tournamentManager, eventBus });
        await loop.start();

        console.log('[Server] Simulation system started');

        // Settle any bets whose results were confirmed while the server was
        // down (idempotent - already-settled bets are never touched again).
        const SettlementService = require('./services/SettlementService');
        SettlementService.sweepPendingBets()
            .then(results => console.log('[Server] Settlement sweep:', results))
            .catch(err => console.error('[Server] Settlement sweep failed:', err));

        // Cyborg Garage: process any garage results confirmed while the
        // server was down (idempotent).
        const GarageRewardService = require('./services/GarageRewardService');
        GarageRewardService.sweep()
            .then(results => console.log('[Server] Garage sweep:', results))
            .catch(err => console.error('[Server] Garage sweep failed:', err));
    } catch (err) {
        console.error('[Server] Failed to start simulation:', err);
    }
}

/**
 * Graceful shutdown
 */
function shutdown(signal) {
    console.log(`\n[Server] Received ${signal}, shutting down...`);

    // Stop simulation
    const loop = getSimulationLoop();
    if (loop.isRunning) {
        loop.stop();
        console.log('[Server] Simulation stopped');
    }

    // Clear event bus
    resetEventBus();

    // Close server
    server.close(() => {
        console.log('[Server] HTTP server closed');
        process.exit(0);
    });

    // Force exit after timeout
    setTimeout(() => {
        console.log('[Server] Forcing exit...');
        process.exit(1);
    }, 5000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = app; // Export for testing