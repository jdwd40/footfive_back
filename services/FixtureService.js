/**
 * FixtureService - Odds calculation and data transformation logic
 * Extracted from fixtureController to keep controllers thin
 */
const Fixture = require('../models/FixtureModel');
const Odds = require('../models/OddsModel');
const MatchEvent = require('../models/MatchEventModel');
const MatchReport = require('../models/MatchReportModel');
const Team = require('../models/TeamModel');
const OddsEngine = require('../gamelogic/OddsEngine');

const oddsEngine = new OddsEngine(0.05);

/**
 * Format a fixture for API response
 */
function formatFixture(f) {
  return {
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
  };
}

/**
 * Format a detailed fixture with odds for API response
 */
function formatFixtureWithOdds(fixture) {
  return {
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
  };
}

/**
 * Format simulation result stats for API response
 */
function formatSimulationStats(result) {
  return {
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
  };
}

/**
 * Create a fixture and calculate odds
 */
async function createFixtureWithOdds({ homeTeamId, awayTeamId, tournamentId, round, scheduledAt }) {
  const fixture = await Fixture.create({ homeTeamId, awayTeamId, tournamentId, round, scheduledAt });
  const homeTeam = await Team.getRatingById(homeTeamId);
  const awayTeam = await Team.getRatingById(awayTeamId);
  const odds = await oddsEngine.calculateAndSaveOdds(fixture.fixtureId, homeTeam, awayTeam);

  return {
    fixture: {
      fixtureId: fixture.fixtureId,
      homeTeam: { id: homeTeam.id, name: homeTeam.name },
      awayTeam: { id: awayTeam.id, name: awayTeam.name },
      round: fixture.round,
      status: fixture.status,
      scheduledAt: fixture.scheduledAt
    },
    odds: odds.toJSON()
  };
}

/**
 * Create batch fixtures with odds
 */
async function createFixturesWithOdds(fixturesData) {
  const createdFixtures = await Fixture.createBatch(fixturesData);
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

  return results;
}

/**
 * Recalculate odds for a fixture
 */
async function recalculateFixtureOdds(fixtureId) {
  const fixture = await Fixture.getById(fixtureId);

  if (fixture.status === 'completed') {
    throw new Error('Cannot recalculate odds for completed fixture');
  }

  const homeTeam = await Team.getRatingById(fixture.homeTeamId);
  const awayTeam = await Team.getRatingById(fixture.awayTeamId);
  return oddsEngine.calculateAndSaveOdds(fixture.fixtureId, homeTeam, awayTeam);
}

module.exports = {
  formatFixture,
  formatFixtureWithOdds,
  formatSimulationStats,
  createFixtureWithOdds,
  createFixturesWithOdds,
  recalculateFixtureOdds
};
