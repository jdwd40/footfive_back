/**
 * BracketManager - Bracket/fixture creation, slot mapping, round advancement
 * Extracted from TournamentManager to reduce file complexity
 */
const Fixture = require('../../models/FixtureModel');
const Team = require('../../models/TeamModel');
const Player = require('../../models/PlayerModel');
const { LiveMatch } = require('./LiveMatch');
const { BRACKET_STRUCTURE, ROUND_NAMES } = require('../constants');

// Bracket slots grouped by round
const ROUND_SLOT_MAP = {
  ROUND_OF_16: ['R16_1', 'R16_2', 'R16_3', 'R16_4', 'R16_5', 'R16_6', 'R16_7', 'R16_8'],
  QUARTER_FINALS: ['QF1', 'QF2', 'QF3', 'QF4'],
  SEMI_FINALS: ['SF1', 'SF2'],
  FINAL: ['FINAL']
};

class BracketManager {
  constructor() {
    this.bracketFixtures = new Map(); // bracketSlot -> fixtureId
  }

  /**
   * Generate all bracket fixtures at tournament start
   * R16 fixtures have teams assigned, later rounds are TBD (null teams)
   */
  async generateAllBracketFixtures(shuffledTeams, tournamentId) {
    const allFixtures = [];

    // R16 slots with teams assigned
    const r16Slots = ROUND_SLOT_MAP.ROUND_OF_16;
    for (let i = 0; i < r16Slots.length && i * 2 + 1 < shuffledTeams.length; i++) {
      const slot = r16Slots[i];
      const bracket = BRACKET_STRUCTURE[slot];
      allFixtures.push({
        homeTeamId: shuffledTeams[i * 2].id,
        awayTeamId: shuffledTeams[i * 2 + 1].id,
        tournamentId,
        round: bracket.round,
        bracketSlot: slot,
        feedsInto: bracket.feedsInto
      });
    }

    // QF slots - TBD teams
    for (const slot of ROUND_SLOT_MAP.QUARTER_FINALS) {
      const bracket = BRACKET_STRUCTURE[slot];
      allFixtures.push({
        homeTeamId: null,
        awayTeamId: null,
        tournamentId,
        round: bracket.round,
        bracketSlot: slot,
        feedsInto: bracket.feedsInto
      });
    }

    // SF slots - TBD teams
    for (const slot of ROUND_SLOT_MAP.SEMI_FINALS) {
      const bracket = BRACKET_STRUCTURE[slot];
      allFixtures.push({
        homeTeamId: null,
        awayTeamId: null,
        tournamentId,
        round: bracket.round,
        bracketSlot: slot,
        feedsInto: bracket.feedsInto
      });
    }

    // Final - TBD teams
    allFixtures.push({
      homeTeamId: null,
      awayTeamId: null,
      tournamentId,
      round: BRACKET_STRUCTURE.FINAL.round,
      bracketSlot: 'FINAL',
      feedsInto: null
    });

    // Batch create all fixtures
    const created = await Fixture.createBatch(allFixtures);

    // Store bracket slot -> fixtureId mapping
    this.bracketFixtures = new Map();
    for (const fixture of created) {
      this.bracketFixtures.set(fixture.bracketSlot, fixture.fixtureId);
    }

    console.log(`[BracketManager] Created ${created.length} bracket fixtures: ${Array.from(this.bracketFixtures.keys()).join(', ')}`);
  }

  /**
   * Load fixtures and create LiveMatch instances for a given round
   * @returns {{ fixtures: Array, liveMatches: Array }}
   */
  async createRoundMatches(roundKey, tournamentId, rules, now) {
    const roundName = ROUND_NAMES[roundKey];
    const slots = ROUND_SLOT_MAP[roundKey] || [];

    // Load ALL fixtures for this round in parallel
    const fixturePromises = slots
      .map(slot => this.bracketFixtures.get(slot))
      .filter(Boolean)
      .map(fixtureId => Fixture.getById(fixtureId));

    const allFixtures = await Promise.all(fixturePromises);
    const roundFixtures = allFixtures.filter(f => f.homeTeamId && f.awayTeamId);

    // Create LiveMatch instances - load all team data in parallel
    const teamIds = new Set();
    roundFixtures.forEach(f => {
      teamIds.add(f.homeTeamId);
      teamIds.add(f.awayTeamId);
    });

    const teamPromises = [...teamIds].map(id => Team.getRatingById(id));
    const teams = await Promise.all(teamPromises);
    const teamMap = new Map(teams.map(t => [t.id, t]));

    // Create all matches with their teams
    const matchData = roundFixtures.map(fixture => {
      const homeTeam = teamMap.get(fixture.homeTeamId);
      const awayTeam = teamMap.get(fixture.awayTeamId);

      const match = new LiveMatch(
        fixture.fixtureId,
        homeTeam,
        awayTeam,
        now,
        rules
      );

      match.bracketSlot = fixture.bracketSlot;
      match.feedsInto = fixture.feedsInto;
      match.tournamentId = tournamentId;

      return { match, fixture, homeTeam, awayTeam };
    });

    // Load ALL players in parallel
    await Promise.all(matchData.map(m => m.match.loadPlayers()));

    // Build result arrays
    const fixtures = [];
    const liveMatches = [];

    for (const { match, fixture, homeTeam, awayTeam } of matchData) {
      liveMatches.push(match);
      fixtures.push({
        home: homeTeam,
        away: awayTeam,
        isBye: false,
        fixtureId: fixture.fixtureId,
        bracketSlot: fixture.bracketSlot,
        feedsInto: fixture.feedsInto,
        match
      });
    }

    console.log(`[BracketManager] ${roundName} created with ${liveMatches.length} matches`);

    return { fixtures, liveMatches };
  }

  /**
   * Update next round fixture with winner (fills TBD slot)
   */
  async advanceWinnerToNextRound(winnerId, fromSlot, toSlot) {
    const nextFixtureId = this.bracketFixtures.get(toSlot);
    if (!nextFixtureId) {
      console.warn(`[BracketManager] No fixture found for bracket slot ${toSlot}`);
      return;
    }

    const fromBracket = BRACKET_STRUCTURE[fromSlot];
    const position = fromBracket?.position;

    try {
      if (position === 'home') {
        await Fixture.updateHomeTeam(nextFixtureId, winnerId);
      } else if (position === 'away') {
        await Fixture.updateAwayTeam(nextFixtureId, winnerId);
      }
      console.log(`[BracketManager] Advanced winner ${winnerId} from ${fromSlot} to ${toSlot} (${position})`);
    } catch (err) {
      console.error(`[BracketManager] Failed to advance winner to ${toSlot}:`, err.message);
    }
  }
}

module.exports = { BracketManager, ROUND_SLOT_MAP };
