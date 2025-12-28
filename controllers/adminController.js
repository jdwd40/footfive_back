const { getSimulationLoop } = require('../Gamelogic/simulation/SimulationLoop');
const { getEventBus } = require('../Gamelogic/simulation/EventBus');
const { TournamentManager } = require('../Gamelogic/simulation/TournamentManager');

/**
 * Middleware: Dev admin only
 * Checks DEV_ADMIN env var or X-Admin-Secret header
 */
const devAdminOnly = (req, res, next) => {
  const devMode = process.env.DEV_ADMIN === 'true';
  const secretMatch = process.env.ADMIN_SECRET &&
    req.headers['x-admin-secret'] === process.env.ADMIN_SECRET;

  if (!devMode && !secretMatch) {
    return res.status(404).json({ error: 'Not found' });
  }

  next();
};

/**
 * Start simulation loop
 * POST /api/admin/simulation/start
 */
const startSimulation = async (req, res) => {
  try {
    const loop = getSimulationLoop();
    const eventBus = getEventBus();
    const tournamentManager = new TournamentManager(req.body.rules || {});

    loop.init({ tournamentManager, eventBus });
    await loop.start();

    res.json({
      success: true,
      state: loop.getState()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Stop simulation loop
 * POST /api/admin/simulation/stop
 */
const stopSimulation = (req, res) => {
  const loop = getSimulationLoop();
  loop.stop();

  res.json({ success: true, isRunning: loop.isRunning });
};

/**
 * Force start tournament now
 * POST /api/admin/tournament/start
 */
const forceTournamentStart = async (req, res) => {
  try {
    const loop = getSimulationLoop();

    if (!loop.tournamentManager) {
      return res.status(400).json({ error: 'Simulation not initialized' });
    }

    const state = await loop.tournamentManager.forceStart();

    // Register created matches with loop
    const matches = loop.tournamentManager.getLiveMatches();
    loop.registerMatches(matches);

    res.json({ success: true, state });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/**
 * Cancel current tournament
 * POST /api/admin/tournament/cancel
 */
const cancelTournament = (req, res) => {
  const loop = getSimulationLoop();

  if (!loop.tournamentManager) {
    return res.status(400).json({ error: 'Simulation not initialized' });
  }

  loop.tournamentManager.cancel();
  loop.matches.clear();

  res.json({ success: true });
};

/**
 * Skip to a specific round
 * POST /api/admin/tournament/skip-to-round
 * Body: { round: "FINAL" }
 */
const skipToRound = async (req, res) => {
  try {
    const { round } = req.body;
    const loop = getSimulationLoop();

    if (!loop.tournamentManager) {
      return res.status(400).json({ error: 'Simulation not initialized' });
    }

    if (!round) {
      return res.status(400).json({ error: 'round is required' });
    }

    const state = await loop.tournamentManager.skipToRound(round);

    // Register created matches
    const matches = loop.tournamentManager.getLiveMatches();
    loop.registerMatches(matches);

    res.json({ success: true, state });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/**
 * Force set match score
 * POST /api/admin/match/:fixtureId/force-score
 * Body: { home: 2, away: 1 }
 */
const forceScore = (req, res) => {
  const { home, away } = req.body;
  const fixtureId = parseInt(req.params.fixtureId);
  const loop = getSimulationLoop();

  try {
    loop.forceSetScore(fixtureId, home, away);
    res.json({ success: true, score: { home, away } });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/**
 * Force end match
 * POST /api/admin/match/:fixtureId/force-end
 */
const forceEndMatch = (req, res) => {
  const fixtureId = parseInt(req.params.fixtureId);
  const loop = getSimulationLoop();

  try {
    loop.forceEndMatch(fixtureId);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/**
 * Pause simulation
 * POST /api/admin/clock/pause
 */
const pauseSimulation = (req, res) => {
  const loop = getSimulationLoop();
  loop.pause();
  res.json({ success: true, isPaused: loop.isPaused });
};

/**
 * Resume simulation
 * POST /api/admin/clock/resume
 */
const resumeSimulation = (req, res) => {
  const loop = getSimulationLoop();
  loop.resume();
  res.json({ success: true, isPaused: loop.isPaused });
};

/**
 * Set simulation speed
 * POST /api/admin/clock/set-speed
 * Body: { multiplier: 10 }
 */
const setSpeed = (req, res) => {
  const { multiplier } = req.body;
  const loop = getSimulationLoop();

  if (typeof multiplier !== 'number' || multiplier <= 0) {
    return res.status(400).json({ error: 'multiplier must be a positive number' });
  }

  loop.setSpeed(multiplier);
  res.json({
    success: true,
    speedMultiplier: loop.speedMultiplier,
    tickIntervalMs: loop.tickIntervalMs
  });
};

/**
 * Get full internal state dump
 * GET /api/admin/state
 */
const getFullState = (req, res) => {
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
};

/**
 * Clear event bus buffer
 * POST /api/admin/events/clear
 */
const clearEvents = (req, res) => {
  const eventBus = getEventBus();
  eventBus.eventBuffer = [];
  eventBus.sequence = 0;
  res.json({ success: true });
};

module.exports = {
  devAdminOnly,
  startSimulation,
  stopSimulation,
  forceTournamentStart,
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
