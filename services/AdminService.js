/**
 * AdminService - Simulation control logic
 * Extracted from adminController to keep controllers thin
 */
const { getSimulationLoop } = require('../gamelogic/simulation/SimulationLoop');
const { getEventBus } = require('../gamelogic/simulation/EventBus');
const { TournamentManager } = require('../gamelogic/simulation/TournamentManager');

/**
 * Initialize and start the simulation loop
 */
async function initializeSimulation(rules = {}) {
  const loop = getSimulationLoop();
  const eventBus = getEventBus();
  const tournamentManager = new TournamentManager(rules);

  loop.init({ tournamentManager, eventBus });
  await loop.start();

  return loop.getState();
}

/**
 * Start a new tournament via the simulation loop
 */
async function startNewTournament() {
  const loop = getSimulationLoop();

  if (!loop.tournamentManager) {
    throw new Error('Simulation not initialized');
  }

  const result = await loop.tournamentManager.startTournament();

  // Register created matches with loop
  const matches = loop.tournamentManager.getLiveMatches();
  loop.registerMatches(matches);

  return result;
}

/**
 * Skip to a specific tournament round
 */
async function skipToTournamentRound(round) {
  const loop = getSimulationLoop();

  if (!loop.tournamentManager) {
    throw new Error('Simulation not initialized');
  }

  if (!round) {
    throw new Error('round is required');
  }

  const state = await loop.tournamentManager.skipToRound(round);

  // Register created matches
  const matches = loop.tournamentManager.getLiveMatches();
  loop.registerMatches(matches);

  return state;
}

/**
 * Build full internal state dump for debugging
 */
function buildFullState() {
  const loop = getSimulationLoop();
  const eventBus = getEventBus();

  const matchDetails = [];
  for (const [fixtureId, match] of loop.matches) {
    matchDetails.push({
      fixtureId,
      state: match.state,
      tickElapsed: match.tickElapsed,
      minute: match.getMatchMinute(),
      score: match.getScore(),
      penaltyScore: match.getPenaltyScore(),
      stats: match.stats,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      rules: match.rules,
      timings: match.timings
    });
  }

  return {
    loop: loop.getState(),
    tournament: loop.tournamentManager?.getState() ?? null,
    matches: matchDetails,
    eventBus: eventBus.getStats(),
    recentEvents: eventBus.getRecentEvents({}, 50)
  };
}

module.exports = {
  initializeSimulation,
  startNewTournament,
  skipToTournamentRound,
  buildFullState
};
