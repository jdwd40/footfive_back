const { getSimulationLoop } = require('../gamelogic/simulation/SimulationLoop');
const { getEventBus } = require('../gamelogic/simulation/EventBus');
const { TournamentManager } = require('../gamelogic/simulation/TournamentManager');

/**
 * Middleware: Dev admin only
 */
function devAdminOnly(req, res, next) {
  if (process.env.DEV_ADMIN === 'true') {
    return next();
  }

  const secret = req.headers['x-admin-secret'];
  if (process.env.ADMIN_SECRET && secret === process.env.ADMIN_SECRET) {
    return next();
  }

  return res.status(404).json({ error: 'Not found' });
}

async function startSimulation(req, res) {
  try {
    const loop = getSimulationLoop();
    const eventBus = getEventBus();
    const tournamentManager = new TournamentManager(req.body?.rules);

    loop.init({ tournamentManager, eventBus });
    await loop.start();

    res.json({ success: true, state: loop.getState() });
  } catch (err) {
    console.error('[Admin] startSimulation error:', err);
    res.status(500).json({ error: err.message });
  }
}

function stopSimulation(req, res) {
  const loop = getSimulationLoop();
  loop.stop();
  res.json({ success: true, isRunning: false });
}

async function startTournament(req, res) {
  try {
    const loop = getSimulationLoop();

    if (!loop.tournamentManager) {
      return res.status(400).json({
        error: 'Simulation not initialized',
        hint: 'Call POST /api/admin/simulation/start first, then POST /api/admin/tournament/start'
      });
    }

    const result = await loop.tournamentManager.startTournament();
    const matches = loop.tournamentManager.getLiveMatches();
    loop.registerMatches(matches);

    res.json({
      success: true,
      message: 'Tournament started',
      tournamentId: result.tournamentId,
      state: result.state,
      teamsCount: result.teamsCount
    });
  } catch (err) {
    console.error('[Admin] startTournament error:', err);
    res.status(500).json({ error: err.message });
  }
}

function cancelTournament(req, res) {
  const loop = getSimulationLoop();
  if (loop.tournamentManager) {
    loop.tournamentManager.cancel();
  }
  loop.matches.clear();
  res.json({ success: true });
}

async function skipToRound(req, res) {
  const loop = getSimulationLoop();

  if (!loop.tournamentManager) {
    return res.status(400).json({ error: 'Simulation not initialized' });
  }

  const { round } = req.body;
  if (!round) {
    return res.status(400).json({ error: 'round is required' });
  }

  try {
    const state = await loop.tournamentManager.skipToRound(round);
    // Matches are registered via 'matches_created' event on SimulationLoop.init()
    res.json({ success: true, state });
  } catch (err) {
    console.error('[Admin] skipToRound error:', err);
    res.status(500).json({ error: err.message });
  }
}

function forceScore(req, res) {
  try {
    const loop = getSimulationLoop();
    const { home, away } = req.body;
    const fixtureId = parseInt(req.params.fixtureId, 10);

    loop.forceSetScore(fixtureId, home, away);
    res.json({ success: true, score: { home, away } });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

function forceEndMatch(req, res) {
  try {
    const loop = getSimulationLoop();
    const fixtureId = parseInt(req.params.fixtureId, 10);

    loop.forceEndMatch(fixtureId);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

function pauseSimulation(req, res) {
  const loop = getSimulationLoop();
  loop.pause();
  res.json({ success: true, isPaused: loop.isPaused });
}

function resumeSimulation(req, res) {
  const loop = getSimulationLoop();
  loop.resume();
  res.json({ success: true, isPaused: loop.isPaused });
}

function setSpeed(req, res) {
  const { multiplier } = req.body;

  if (typeof multiplier !== 'number' || multiplier <= 0) {
    return res.status(400).json({ error: 'multiplier must be a positive number' });
  }

  const loop = getSimulationLoop();
  loop.setSpeed(multiplier);
  res.json({
    success: true,
    speedMultiplier: loop.speedMultiplier,
    tickIntervalMs: loop.tickIntervalMs
  });
}

function getFullState(req, res) {
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

  res.json({
    loop: loop.getState(),
    tournament: loop.tournamentManager?.getState() ?? null,
    matches: matchDetails,
    eventBus: eventBus.getStats(),
    recentEvents: eventBus.getRecentEvents({}, 50)
  });
}

function clearEvents(req, res) {
  const eventBus = getEventBus();
  eventBus.eventBuffer = [];
  eventBus.sequence = 0;
  eventBus.stats = { eventsEmitted: 0, eventsPersisted: 0, clientsConnected: eventBus.stats?.clientsConnected || 0 };
  res.json({ success: true });
}

module.exports = {
  devAdminOnly,
  startSimulation,
  stopSimulation,
  startTournament,
  cancelTournament,
  skipToRound,
  forceScore,
  forceEndMatch,
  pauseSimulation,
  resumeSimulation,
  setSpeed,
  getFullState,
  clearEvents
};
