/**
 * LiveService - Snapshot assembly for live match data
 * Extracted from liveController to keep controllers thin
 */
const Fixture = require('../models/FixtureModel');

const ROUND_ORDER = ['Round of 16', 'Quarter-finals', 'Semi-finals', 'Final'];

/**
 * Build a match snapshot for API response
 */
function buildMatchSnapshot(match) {
  return {
    fixtureId: match.fixtureId,
    state: match.state,
    minute: match.getMatchMinute(),
    score: match.getScore(),
    penaltyScore: match.getPenaltyScore(),
    homeTeam: { id: match.homeTeam.id, name: match.homeTeam.name },
    awayTeam: { id: match.awayTeam.id, name: match.awayTeam.name },
    isFinished: match.isFinished()
  };
}

/**
 * Build a detailed match snapshot for API response
 */
function buildDetailedMatchSnapshot(match) {
  return {
    ...buildMatchSnapshot(match),
    tickElapsed: match.tickElapsed,
    stats: match.stats
  };
}

/**
 * Build live fixtures response with real-time state enrichment
 */
async function buildLiveFixturesResponse(tournamentManager, matchesMap) {
  const tournamentId = tournamentManager.tournamentId;
  const tournamentState = tournamentManager.getState();

  const dbFixtures = await Fixture.getAll({ tournamentId, limit: 100 });

  const currentRoundIndex = ROUND_ORDER.indexOf(tournamentState.currentRound);
  const nextRound = currentRoundIndex >= 0 && currentRoundIndex < ROUND_ORDER.length - 1
    ? ROUND_ORDER[currentRoundIndex + 1]
    : null;

  const fixtures = dbFixtures.map(fixture => {
    const fixtureId = fixture.fixtureId;
    const liveMatch = matchesMap.get(fixtureId);

    const result = {
      fixtureId,
      round: fixture.round,
      bracketSlot: fixture.bracketSlot,
      feedsInto: fixture.feedsInto,
      homeTeam: fixture.homeTeamId
        ? { id: fixture.homeTeamId, name: fixture.homeTeamName }
        : null,
      awayTeam: fixture.awayTeamId
        ? { id: fixture.awayTeamId, name: fixture.awayTeamName }
        : null
    };

    if (liveMatch) {
      result.state = liveMatch.state;
      result.isFinished = liveMatch.isFinished();
      result.minute = liveMatch.getMatchMinute() ?? 0;
      result.score = liveMatch.getScore();
      result.penaltyScore = liveMatch.getPenaltyScore();
      result.winnerId = liveMatch.isFinished() ? liveMatch.getWinnerId() : null;
    } else if (fixture.status === 'completed') {
      result.state = 'FINISHED';
      result.isFinished = true;
      result.minute = 90;
      result.score = { home: fixture.homeScore, away: fixture.awayScore };
      result.penaltyScore = {
        home: fixture.homePenaltyScore || 0,
        away: fixture.awayPenaltyScore || 0
      };
      result.winnerId = fixture.winnerTeamId;
    } else if (fixture.status === 'live' && fixture.homeScore != null && fixture.awayScore != null) {
      result.state = 'FINISHED';
      result.isFinished = true;
      result.minute = 90;
      result.score = { home: fixture.homeScore, away: fixture.awayScore };
      result.penaltyScore = {
        home: fixture.homePenaltyScore || 0,
        away: fixture.awayPenaltyScore || 0
      };
      result.winnerId = fixture.winnerTeamId;
    } else {
      result.state = 'SCHEDULED';
      result.isFinished = false;
      result.minute = 0;
      result.score = { home: 0, away: 0 };
      result.penaltyScore = { home: 0, away: 0 };
      result.winnerId = null;
    }

    return result;
  });

  const upcomingFixtures = fixtures.filter(f =>
    f.round === nextRound &&
    f.state === 'SCHEDULED' &&
    f.homeTeam && f.awayTeam
  );

  return {
    tournamentId,
    currentRound: tournamentState.currentRound,
    nextRound,
    fixtures,
    upcomingFixtures
  };
}

module.exports = {
  buildMatchSnapshot,
  buildDetailedMatchSnapshot,
  buildLiveFixturesResponse
};
