const { getEventBus } = require('../Gamelogic/simulation/EventBus');
const { getSimulationLoop } = require('../Gamelogic/simulation/SimulationLoop');
const Fixture = require('../models/FixtureModel');

/**
 * SSE endpoint for live match events
 * GET /api/live/events?tournamentId=&fixtureId=
 */
const streamEvents = (req, res) => {
  const eventBus = getEventBus();

  const filters = {};
  if (req.query.tournamentId) {
    filters.tournamentId = parseInt(req.query.tournamentId);
  }
  if (req.query.fixtureId) {
    filters.fixtureId = parseInt(req.query.fixtureId);
  }

  const clientId = eventBus.addClient(res, filters);

  // If afterSeq provided, send catchup
  if (req.query.afterSeq !== undefined) {
    const afterSeq = parseInt(req.query.afterSeq);
    eventBus.sendCatchup(clientId, afterSeq);
  }
};

/**
 * Get current tournament state snapshot
 * GET /api/live/tournament
 */
const getTournamentState = (req, res) => {
  const loop = getSimulationLoop();

  if (!loop.tournamentManager) {
    return res.status(503).json({ error: 'Simulation not initialized' });
  }

  const state = loop.tournamentManager.getState();
  res.json(state);
};

/**
 * Get current matches snapshot
 * GET /api/live/matches
 */
const getActiveMatches = (req, res) => {
  const loop = getSimulationLoop();

  const matches = [];
  for (const [fixtureId, match] of loop.matches) {
    matches.push({
      fixtureId,
      state: match.state,
      minute: match.getMatchMinute(),
      score: match.getScore(),
      penaltyScore: match.getPenaltyScore(),
      homeTeam: { id: match.homeTeam.id, name: match.homeTeam.name },
      awayTeam: { id: match.awayTeam.id, name: match.awayTeam.name },
      isFinished: match.isFinished()
    });
  }

  res.json({ matches, count: matches.length });
};

/**
 * Get single match snapshot
 * GET /api/live/matches/:fixtureId
 */
const getMatchState = (req, res) => {
  const loop = getSimulationLoop();
  const fixtureId = parseInt(req.params.fixtureId);

  const match = loop.getMatch(fixtureId);

  if (!match) {
    return res.status(404).json({ error: 'Match not found or not active' });
  }

  res.json({
    fixtureId,
    state: match.state,
    minute: match.getMatchMinute(),
    score: match.getScore(),
    penaltyScore: match.getPenaltyScore(),
    homeTeam: { id: match.homeTeam.id, name: match.homeTeam.name },
    awayTeam: { id: match.awayTeam.id, name: match.awayTeam.name },
    isFinished: match.isFinished(),
    tickElapsed: match.tickElapsed,
    stats: match.stats
  });
};

/**
 * Get recent events from buffer
 * GET /api/live/events/recent?fixtureId=&type=&limit=
 */
const getRecentEvents = (req, res) => {
  const eventBus = getEventBus();

  const filters = {};
  if (req.query.fixtureId) {
    filters.fixtureId = parseInt(req.query.fixtureId);
  }
  if (req.query.tournamentId) {
    filters.tournamentId = parseInt(req.query.tournamentId);
  }
  if (req.query.type) {
    filters.type = req.query.type;
  }
  if (req.query.afterSeq) {
    filters.afterSeq = parseInt(req.query.afterSeq);
  }

  const limit = parseInt(req.query.limit) || 100;
  const events = eventBus.getRecentEvents(filters, limit);

  res.json({ events, count: events.length });
};

/**
 * Get simulation loop status
 * GET /api/live/status
 * Includes lastCompleted from previous tournament if available
 */
const getStatus = (req, res) => {
  const loop = getSimulationLoop();
  const eventBus = getEventBus();
  const tournamentState = loop.tournamentManager?.getState() ?? null;

  res.json({
    simulation: {
      isRunning: loop.isRunning,
      isPaused: loop.isPaused,
      tickCount: loop.tickCount,
      speedMultiplier: loop.speedMultiplier,
      activeMatches: loop.matches.size
    },
    eventBus: eventBus.getStats(),
    tournament: tournamentState,
    // Convenience: lastCompleted extracted from tournament state
    lastCompleted: tournamentState?.lastCompleted ?? null
  });
};

/**
 * Get all fixtures for current tournament with live state
 * GET /api/live/fixtures
 *
 * Returns all fixtures (scheduled, live, completed) for the current tournament,
 * enriched with real-time state for active matches.
 * Includes upcomingFixtures for next round and bracket positioning.
 */
const getLiveFixtures = async (req, res) => {
  try {
    const loop = getSimulationLoop();

    if (!loop.tournamentManager) {
      return res.status(503).json({ error: 'Simulation not initialized' });
    }

    const tournamentId = loop.tournamentManager.tournamentId;
    const tournamentState = loop.tournamentManager.getState();

    if (!tournamentId) {
      return res.status(404).json({ error: 'No active tournament' });
    }

    // Fetch all fixtures for current tournament from database
    const dbFixtures = await Fixture.getAll({ tournamentId, limit: 100 });

    // Round progression for determining nextRound
    const roundOrder = ['Round of 16', 'Quarter-finals', 'Semi-finals', 'Final'];
    const currentRoundIndex = roundOrder.indexOf(tournamentState.currentRound);
    const nextRound = currentRoundIndex >= 0 && currentRoundIndex < roundOrder.length - 1
      ? roundOrder[currentRoundIndex + 1]
      : null;

    // Build response with live state enrichment
    const fixtures = dbFixtures.map(fixture => {
      const fixtureId = fixture.fixtureId;
      const liveMatch = loop.matches.get(fixtureId);

      // Base fixture data from database (including bracket fields)
      const result = {
        fixtureId,
        round: fixture.round,
        bracketSlot: fixture.bracketSlot,
        feedsInto: fixture.feedsInto,
        homeTeam: fixture.homeTeamId
          ? { id: fixture.homeTeamId, name: fixture.homeTeamName }
          : null, // TBD team
        awayTeam: fixture.awayTeamId
          ? { id: fixture.awayTeamId, name: fixture.awayTeamName }
          : null  // TBD team
      };

      if (liveMatch) {
        // Active match - use live state
        result.state = liveMatch.state;
        result.isFinished = liveMatch.isFinished();
        result.minute = liveMatch.getMatchMinute() ?? 0; // Always include minute
        result.score = liveMatch.getScore();
        result.penaltyScore = liveMatch.getPenaltyScore();
        result.winnerId = liveMatch.isFinished() ? liveMatch.getWinnerId() : null;
      } else if (fixture.status === 'completed') {
        // Completed match - use database state
        result.state = 'FINISHED';
        result.isFinished = true;
        result.minute = 90; // Completed matches show 90'
        result.score = { home: fixture.homeScore, away: fixture.awayScore };
        result.penaltyScore = {
          home: fixture.homePenaltyScore || 0,
          away: fixture.awayPenaltyScore || 0
        };
        result.winnerId = fixture.winnerTeamId;
      } else {
        // Scheduled match - not yet started
        result.state = 'SCHEDULED';
        result.isFinished = false;
        result.minute = 0; // Always include minute
        result.score = { home: 0, away: 0 };
        result.penaltyScore = { home: 0, away: 0 };
        result.winnerId = null;
      }

      return result;
    });

    // Filter upcoming fixtures (next round, scheduled, both teams assigned)
    const upcomingFixtures = fixtures.filter(f =>
      f.round === nextRound &&
      f.state === 'SCHEDULED' &&
      f.homeTeam && f.awayTeam
    );

    res.json({
      tournamentId,
      currentRound: tournamentState.currentRound,
      nextRound,
      fixtures,
      upcomingFixtures
    });
  } catch (error) {
    console.error('Error fetching live fixtures:', error);
    res.status(500).json({ error: 'Failed to fetch fixtures' });
  }
};

module.exports = {
  streamEvents,
  getTournamentState,
  getActiveMatches,
  getMatchState,
  getRecentEvents,
  getStatus,
  getLiveFixtures
};
