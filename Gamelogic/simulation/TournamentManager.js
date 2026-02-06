const EventEmitter = require('events');
const Team = require('../../models/TeamModel');
const Fixture = require('../../models/FixtureModel');
const { LiveMatch, DEFAULT_RULES } = require('./LiveMatch');
const db = require('../../db/connection');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOURNAMENT_STATES = {
  IDLE: 'IDLE',
  SETUP: 'SETUP',
  ROUND_ACTIVE: 'ROUND_ACTIVE',
  ROUND_COMPLETE: 'ROUND_COMPLETE',
  INTER_ROUND_DELAY: 'INTER_ROUND_DELAY',
  RESULTS: 'RESULTS',
  COMPLETE: 'COMPLETE'
};

const ROUND_NAMES = {
  ROUND_OF_16: 'Round of 16',
  QUARTER_FINALS: 'Quarter-finals',
  SEMI_FINALS: 'Semi-finals',
  FINAL: 'Final'
};

// Ordered progression of round keys
const ROUND_ORDER = ['ROUND_OF_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'FINAL'];

// Map round key -> bracket slots for that round
const ROUND_SLOT_MAP = {
  ROUND_OF_16: ['R16_1', 'R16_2', 'R16_3', 'R16_4', 'R16_5', 'R16_6', 'R16_7', 'R16_8'],
  QUARTER_FINALS: ['QF1', 'QF2', 'QF3', 'QF4'],
  SEMI_FINALS: ['SF1', 'SF2'],
  FINAL: ['FINAL']
};

// Bracket slot definitions with feedsInto relationships
const BRACKET_STRUCTURE = {
  // Round of 16 (8 matches)
  R16_1: { round: 'Round of 16', feedsInto: 'QF1', position: 'home' },
  R16_2: { round: 'Round of 16', feedsInto: 'QF1', position: 'away' },
  R16_3: { round: 'Round of 16', feedsInto: 'QF2', position: 'home' },
  R16_4: { round: 'Round of 16', feedsInto: 'QF2', position: 'away' },
  R16_5: { round: 'Round of 16', feedsInto: 'QF3', position: 'home' },
  R16_6: { round: 'Round of 16', feedsInto: 'QF3', position: 'away' },
  R16_7: { round: 'Round of 16', feedsInto: 'QF4', position: 'home' },
  R16_8: { round: 'Round of 16', feedsInto: 'QF4', position: 'away' },
  // Quarter-finals (4 matches)
  QF1: { round: 'Quarter-finals', feedsInto: 'SF1', position: 'home' },
  QF2: { round: 'Quarter-finals', feedsInto: 'SF1', position: 'away' },
  QF3: { round: 'Quarter-finals', feedsInto: 'SF2', position: 'home' },
  QF4: { round: 'Quarter-finals', feedsInto: 'SF2', position: 'away' },
  // Semi-finals (2 matches)
  SF1: { round: 'Semi-finals', feedsInto: 'FINAL', position: 'home' },
  SF2: { round: 'Semi-finals', feedsInto: 'FINAL', position: 'away' },
  // Final
  FINAL: { round: 'Final', feedsInto: null, position: null }
};

// Inter-round delay: 5 minutes (ms)
const INTER_ROUND_DELAY_MS = 5 * 60 * 1000;

// Default total match duration in minutes (even integer 2..20)
const DEFAULT_TOTAL_MATCH_MINUTES = 8;

// ---------------------------------------------------------------------------
// deriveMatchTimings  --  pure function, no side effects
// ---------------------------------------------------------------------------

/**
 * Derive match timing rules from total_match_minutes.
 * @param {number} totalMatchMinutes - Even integer 2..20
 * @returns {Object} Rules object compatible with LiveMatch constructor
 */
function deriveMatchTimings(totalMatchMinutes) {
  const m = Math.max(2, Math.min(20, totalMatchMinutes));
  const halfDurationMs = (m / 2) * 60000; // exact integer, no rounding

  // Half-time: linear interpolation 1 min (at 2) .. 5 min (at 20)
  const htMinutes = 1 + ((m - 2) / 18) * 4;
  const halftimeDurationMs = Math.round(htMinutes * 60000);

  return {
    knockout: true,
    halfDurationMs,
    halftimeDurationMs,
    // ET and penalties are NOT affected by match duration config
    extraTimeEnabled: true,
    etHalfDurationMs: 120000,  // fixed 2 min
    etHalftimeMs: 30000,       // fixed 30s
    penaltiesEnabled: true
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map a round name (DB value) to its round key */
function roundNameToKey(name) {
  for (const [key, val] of Object.entries(ROUND_NAMES)) {
    if (val === name) return key;
  }
  return null;
}

/** Get the next round key after the given one, or null if final */
function getNextRoundKey(currentKey) {
  const idx = ROUND_ORDER.indexOf(currentKey);
  if (idx < 0 || idx >= ROUND_ORDER.length - 1) return null;
  return ROUND_ORDER[idx + 1];
}

// ---------------------------------------------------------------------------
// TournamentManager
// ---------------------------------------------------------------------------

/**
 * TournamentManager - Event-driven tournament lifecycle
 *
 * Responsibilities:
 * - Track tournament state (IDLE -> SETUP -> ROUND_ACTIVE -> ... -> COMPLETE)
 * - Progress rounds based on match completion events (no wall-clock scheduling)
 * - Create fixtures and LiveMatch instances
 * - Persist state to tournament_state table for crash recovery
 * - Handle recovery on restart with inconsistent-state safety
 */
class TournamentManager extends EventEmitter {
  constructor(totalMatchMinutes = DEFAULT_TOTAL_MATCH_MINUTES) {
    super();

    this.state = TOURNAMENT_STATES.IDLE;
    this.totalMatchMinutes = totalMatchMinutes;
    this.rules = deriveMatchTimings(this.totalMatchMinutes);

    // Tournament data
    this.tournamentId = null;
    this.teams = [];
    this.currentRoundName = null;   // e.g. 'Round of 16'
    this.currentRoundKey = null;    // e.g. 'ROUND_OF_16'
    this.roundWinners = [];

    // Fixtures and matches
    this.fixtures = [];             // Current round fixture data
    this.liveMatches = [];          // LiveMatch instances
    this.completedResults = [];
    this.bracketFixtures = new Map(); // bracketSlot -> fixtureId

    // Timing (persisted via tournament_state)
    this.roundStartTime = null;     // ms epoch
    this.delayStartedAt = null;     // ms epoch
    this.nextRoundStartAt = null;   // ms epoch

    // Guard against re-entrant async transitions
    this._transitioning = false;

    // Results history
    this.winner = null;
    this.runnerUp = null;
    this.lastCompletedTournament = null;
  }

  // =========================================================================
  // tick()  --  called by SimulationLoop every second
  // =========================================================================

  /**
   * Main tick - only responsibility is checking INTER_ROUND_DELAY expiry.
   * Round progression is driven by onMatchFinalized(), not by tick().
   */
  tick(now) {
    if (this.state !== TOURNAMENT_STATES.INTER_ROUND_DELAY) return;
    if (this._transitioning) return;
    if (!this.nextRoundStartAt) return;

    if (now >= this.nextRoundStartAt) {
      this._transitioning = true;
      this._startNextRound(now)
        .catch(err => console.error('[TournamentManager] Failed to start next round:', err))
        .finally(() => { this._transitioning = false; });
    }
  }

  // =========================================================================
  // onMatchFinalized()  --  called per-match by SimulationLoop
  // =========================================================================

  /**
   * Called once for each match that enters FINISHED state.
   * Checks whether the entire round is complete and triggers progression.
   *
   * @param {Object} result - { fixtureId, winnerId, score, penaltyScore }
   */
  async onMatchFinalized(result) {
    // Update fixture completed flag
    const fixture = this.fixtures.find(f => f.fixtureId === result.fixtureId);
    if (fixture) {
      fixture.completed = true;
    }

    // Only progress if we are in ROUND_ACTIVE
    if (this.state !== TOURNAMENT_STATES.ROUND_ACTIVE) return;

    // Check if ALL matches in the round are done
    if (!this._allMatchesFinished()) return;

    // Guard: prevent concurrent transitions
    if (this._transitioning) return;
    this._transitioning = true;

    try {
      console.log('[TournamentManager] All matches finished. Transitioning from ROUND_ACTIVE.');

      // Collect winners and update team stats
      await this._collectWinnersAndAdvance();

      // Determine if this was the final round
      const isFinal = this.currentRoundKey === 'FINAL';

      if (isFinal) {
        // Final -> RESULTS -> COMPLETE
        this.state = TOURNAMENT_STATES.RESULTS;
        await this._persistState();
        await this._handleResults();
      } else {
        // Non-final -> ROUND_COMPLETE (transient) -> INTER_ROUND_DELAY
        this.state = TOURNAMENT_STATES.ROUND_COMPLETE;
        await this._transitionToInterRoundDelay(Date.now());
      }
    } catch (err) {
      console.error('[TournamentManager] Error during round completion:', err);
    } finally {
      this._transitioning = false;
    }
  }

  // =========================================================================
  // State persistence
  // =========================================================================

  /**
   * Persist current in-memory state to tournament_state table.
   * Uses UPSERT: INSERT on first call, UPDATE thereafter.
   * NOTE: total_match_minutes is only written on INSERT (immutable after that).
   */
  async _persistState() {
    await db.query(`
      INSERT INTO tournament_state
        (tournament_id, state, current_round, round_started_at,
         delay_started_at, next_round_start_at, total_match_minutes, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (tournament_id) DO UPDATE SET
        state = EXCLUDED.state,
        current_round = EXCLUDED.current_round,
        round_started_at = EXCLUDED.round_started_at,
        delay_started_at = EXCLUDED.delay_started_at,
        next_round_start_at = EXCLUDED.next_round_start_at,
        updated_at = NOW()
    `, [
      this.tournamentId,
      this.state,
      this.currentRoundName,
      this.roundStartTime ? new Date(this.roundStartTime) : null,
      this.delayStartedAt ? new Date(this.delayStartedAt) : null,
      this.nextRoundStartAt ? new Date(this.nextRoundStartAt) : null,
      this.totalMatchMinutes
    ]);
  }

  // =========================================================================
  // Transactional ROUND_COMPLETE -> INTER_ROUND_DELAY
  // =========================================================================

  /**
   * Atomically: advance winners to next-round fixtures + persist INTER_ROUND_DELAY.
   * SSE events are emitted only after COMMIT.
   */
  async _transitionToInterRoundDelay(now) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // 1. Idempotent winner advancement for next-round fixtures
      //    (LiveMatch._finalizeMatch already writes these, so only fill NULLs)
      for (const fixture of this.fixtures) {
        if (fixture.isBye) continue;
        const match = fixture.match;
        if (!match || !match.isFinished()) continue;

        const winnerId = match.getWinnerId();
        const fromSlot = fixture.bracketSlot;
        const bracket = BRACKET_STRUCTURE[fromSlot];
        if (!bracket || !bracket.feedsInto) continue;

        const toSlot = bracket.feedsInto;
        const nextFixtureId = this.bracketFixtures.get(toSlot);
        if (!nextFixtureId) continue;

        if (bracket.position === 'home') {
          await client.query(
            'UPDATE fixtures SET home_team_id = $1 WHERE fixture_id = $2 AND home_team_id IS NULL',
            [winnerId, nextFixtureId]
          );
        } else if (bracket.position === 'away') {
          await client.query(
            'UPDATE fixtures SET away_team_id = $1 WHERE fixture_id = $2 AND away_team_id IS NULL',
            [winnerId, nextFixtureId]
          );
        }
      }

      // 2. Persist state atomically
      const delayStartedAt = new Date(now);
      const nextRoundStartAt = new Date(now + INTER_ROUND_DELAY_MS);

      await client.query(`
        UPDATE tournament_state
        SET state = 'INTER_ROUND_DELAY',
            delay_started_at = $1,
            next_round_start_at = $2,
            updated_at = NOW()
        WHERE tournament_id = $3
      `, [delayStartedAt, nextRoundStartAt, this.tournamentId]);

      await client.query('COMMIT');

      // 3. Update in-memory state AFTER commit
      this.state = TOURNAMENT_STATES.INTER_ROUND_DELAY;
      this.delayStartedAt = delayStartedAt.getTime();
      this.nextRoundStartAt = nextRoundStartAt.getTime();

      // 4. SSE events ONLY after successful commit
      this.emit('round_complete', {
        tournamentId: this.tournamentId,
        round: this.currentRoundName,
        winners: this.roundWinners.map(t => ({ id: t.id, name: t.name }))
      });

      const nextKey = getNextRoundKey(this.currentRoundKey);
      if (nextKey) {
        this.emit('fixtures_updated', {
          tournamentId: this.tournamentId,
          nextRound: ROUND_NAMES[nextKey]
        });
      }

      console.log(`[TournamentManager] Entered INTER_ROUND_DELAY. Next round at ${nextRoundStartAt.toISOString()}`);

    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[TournamentManager] Failed to transition to INTER_ROUND_DELAY:', err);
      throw err;
    } finally {
      client.release();
    }
  }

  // =========================================================================
  // Start next round (from INTER_ROUND_DELAY)
  // =========================================================================

  async _startNextRound(now) {
    const nextKey = getNextRoundKey(this.currentRoundKey);
    if (!nextKey) {
      console.error('[TournamentManager] No next round after', this.currentRoundKey);
      return;
    }

    console.log(`[TournamentManager] INTER_ROUND_DELAY expired. Starting ${ROUND_NAMES[nextKey]}`);

    // Clear delay timestamps
    this.delayStartedAt = null;
    this.nextRoundStartAt = null;

    await this._startRound(nextKey, now);
  }

  // =========================================================================
  // Setup
  // =========================================================================

  /**
   * Setup phase - load teams, generate ALL bracket fixtures, persist state.
   */
  async _handleSetup() {
    console.log('[TournamentManager] Setting up tournament...');

    // Reset state
    this.tournamentId = Date.now() % 1000000000;
    this.roundWinners = [];
    this.completedResults = [];
    this.winner = null;
    this.runnerUp = null;
    this.liveMatches = [];
    this.fixtures = [];
    this.bracketFixtures = new Map();
    this.delayStartedAt = null;
    this.nextRoundStartAt = null;

    // Derive rules from configured match minutes
    this.rules = deriveMatchTimings(this.totalMatchMinutes);

    // Load teams
    this.teams = await Team.getAll();

    if (this.teams.length < 2) {
      console.error('[TournamentManager] Not enough teams for tournament');
      this.state = TOURNAMENT_STATES.IDLE;
      return;
    }

    // Shuffle teams for first round
    const shuffledTeams = this._shuffleTeams(this.teams);
    this.roundWinners = shuffledTeams;

    // Generate ALL bracket fixtures
    await this._generateAllBracketFixtures(shuffledTeams);

    // Persist initial tournament state
    this.state = TOURNAMENT_STATES.SETUP;
    this.currentRoundName = null;
    this.currentRoundKey = null;
    await this._persistState();

    this.emit('tournament_setup', {
      tournamentId: this.tournamentId,
      teamCount: this.teams.length,
      bracketGenerated: true
    });

    console.log(`[TournamentManager] Tournament ${this.tournamentId} setup with ${this.teams.length} teams, total_match_minutes=${this.totalMatchMinutes}`);
  }

  /**
   * Generate all bracket fixtures at tournament start.
   * R16 fixtures have teams assigned, later rounds are TBD (null teams).
   */
  async _generateAllBracketFixtures(shuffledTeams) {
    const allFixtures = [];

    // R16 slots with teams assigned
    const r16Slots = ROUND_SLOT_MAP.ROUND_OF_16;
    for (let i = 0; i < r16Slots.length && i * 2 + 1 < shuffledTeams.length; i++) {
      const slot = r16Slots[i];
      const bracket = BRACKET_STRUCTURE[slot];
      allFixtures.push({
        homeTeamId: shuffledTeams[i * 2].id,
        awayTeamId: shuffledTeams[i * 2 + 1].id,
        tournamentId: this.tournamentId,
        round: bracket.round,
        bracketSlot: slot,
        feedsInto: bracket.feedsInto
      });
    }

    // QF, SF, Final - TBD teams
    for (const roundKey of ['QUARTER_FINALS', 'SEMI_FINALS', 'FINAL']) {
      for (const slot of ROUND_SLOT_MAP[roundKey]) {
        const bracket = BRACKET_STRUCTURE[slot];
        allFixtures.push({
          homeTeamId: null,
          awayTeamId: null,
          tournamentId: this.tournamentId,
          round: bracket.round,
          bracketSlot: slot,
          feedsInto: bracket.feedsInto
        });
      }
    }

    // Batch create all fixtures
    const created = await Fixture.createBatch(allFixtures);

    // Store bracket slot -> fixtureId mapping
    for (const fixture of created) {
      this.bracketFixtures.set(fixture.bracketSlot, fixture.fixtureId);
    }

    console.log(`[TournamentManager] Created ${created.length} bracket fixtures: ${Array.from(this.bracketFixtures.keys()).join(', ')}`);
  }

  // =========================================================================
  // Start a round
  // =========================================================================

  /**
   * Load pre-created fixtures for the round and create LiveMatch instances.
   * Persists ROUND_ACTIVE state to DB.
   */
  async _startRound(roundKey, now) {
    const roundName = ROUND_NAMES[roundKey];
    this.currentRoundKey = roundKey;
    this.currentRoundName = roundName;

    console.log(`[TournamentManager] Starting ${roundName}`);

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
    const matches = roundFixtures.map(fixture => {
      const homeTeam = teamMap.get(fixture.homeTeamId);
      const awayTeam = teamMap.get(fixture.awayTeamId);

      const match = new LiveMatch(
        fixture.fixtureId,
        homeTeam,
        awayTeam,
        now,
        this.rules
      );

      match.bracketSlot = fixture.bracketSlot;
      match.feedsInto = fixture.feedsInto;
      match.tournamentId = this.tournamentId;

      return { match, fixture, homeTeam, awayTeam };
    });

    // Load ALL players in parallel
    await Promise.all(matches.map(m => m.match.loadPlayers()));

    // Populate instance arrays
    this.fixtures = [];
    this.liveMatches = [];

    for (const { match, fixture, homeTeam, awayTeam } of matches) {
      this.liveMatches.push(match);
      this.fixtures.push({
        home: homeTeam,
        away: awayTeam,
        isBye: false,
        fixtureId: fixture.fixtureId,
        bracketSlot: fixture.bracketSlot,
        feedsInto: fixture.feedsInto,
        match
      });
    }

    this.roundStartTime = now;

    // Persist state
    this.state = TOURNAMENT_STATES.ROUND_ACTIVE;
    await this._persistState();

    // Emit matches_created for SimulationLoop to register
    this.emit('matches_created', this.liveMatches);

    this.emit('round_start', {
      tournamentId: this.tournamentId,
      round: roundName,
      fixtures: this.fixtures.map(f => ({
        fixtureId: f.fixtureId,
        bracketSlot: f.bracketSlot,
        feedsInto: f.feedsInto,
        home: { id: f.home.id, name: f.home.name },
        away: f.away ? { id: f.away.id, name: f.away.name } : null,
        isBye: f.isBye
      }))
    });

    console.log(`[TournamentManager] ${roundName} started with ${this.liveMatches.length} matches`);
  }

  // =========================================================================
  // Match completion checks
  // =========================================================================

  /**
   * Check if all matches in current round are finished.
   * Returns true if no matches exist or all are finished with a winner.
   */
  _allMatchesFinished() {
    if (this.liveMatches.length === 0) return true;

    let scheduledCount = 0;
    let inProgressCount = 0;
    let finishedCount = 0;
    let noWinnerCount = 0;

    for (const match of this.liveMatches) {
      if (match.state === 'SCHEDULED') {
        scheduledCount++;
        console.error(`[TournamentManager] CRITICAL: Match ${match.fixtureId} never started! Still in SCHEDULED state.`);
        continue;
      }

      if (!match.isFinished()) {
        inProgressCount++;
        continue;
      }

      const winnerId = match.getWinnerId();
      if (!winnerId) {
        noWinnerCount++;
        continue;
      }

      finishedCount++;
    }

    const total = this.liveMatches.length;
    const allComplete = finishedCount === total;

    if (!allComplete) {
      console.log(`[TournamentManager] Round status: ${finishedCount}/${total} complete, ` +
        `${scheduledCount} never started, ${inProgressCount} in progress, ${noWinnerCount} no winner`);
    }

    return allComplete;
  }

  // =========================================================================
  // Winner collection and stats
  // =========================================================================

  /**
   * Collect winners from current round, update team stats,
   * and populate this.roundWinners / this.completedResults.
   */
  async _collectWinnersAndAdvance() {
    const winners = [];

    for (const fixture of this.fixtures) {
      if (fixture.isBye) {
        winners.push(fixture.home);
        continue;
      }

      const match = fixture.match;
      if (!match || !match.isFinished()) {
        console.warn(`[TournamentManager] Match ${fixture.fixtureId} not finished!`);
        winners.push(fixture.home);
        continue;
      }

      const winnerId = match.getWinnerId();
      const winner = winnerId === fixture.home.id ? fixture.home : fixture.away;
      const loser = winnerId === fixture.home.id ? fixture.away : fixture.home;
      winners.push(winner);

      const score = match.getScore();

      // Update team stats in DB
      try {
        const homeWon = winnerId === fixture.home.id;
        await this._updateRecentForm(fixture.home.id, homeWon);
        await this._updateRecentForm(fixture.away.id, !homeWon);
        await Team.updateHighestRound(loser.id, this.currentRoundName);

        console.log(`[TournamentManager] Updated stats: ${winner.name} beat ${loser.name} ${score.home}-${score.away}`);
      } catch (err) {
        console.error('[TournamentManager] Failed to update team stats:', err.message);
      }

      this.completedResults.push({
        fixtureId: fixture.fixtureId,
        bracketSlot: fixture.bracketSlot,
        round: this.currentRoundName,
        home: fixture.home,
        away: fixture.away,
        score: match.getScore(),
        penaltyScore: match.getPenaltyScore(),
        winnerId
      });
    }

    this.roundWinners = winners;
  }

  // =========================================================================
  // Results (final round complete)
  // =========================================================================

  async _handleResults() {
    if (this.roundWinners.length === 1) {
      this.winner = this.roundWinners[0];

      // Find runner-up from final
      const finalResult = this.completedResults.find(r => r.round === 'Final');
      if (finalResult) {
        this.runnerUp = finalResult.winnerId === finalResult.home.id
          ? finalResult.away
          : finalResult.home;
      }

      // Update team stats for winner and runner-up
      try {
        if (this.winner) {
          await Team.addJCupsWon(this.winner.id);
          await Team.updateHighestRound(this.winner.id, 'Winner');
          console.log(`[TournamentManager] Winner: ${this.winner.name} (ID: ${this.winner.id})`);
        }
      } catch (err) {
        console.error('[TournamentManager] Failed to update winner stats:', err.message);
      }

      try {
        if (this.runnerUp) {
          await Team.addRunnerUp(this.runnerUp.id);
          await Team.updateHighestRound(this.runnerUp.id, 'Runner-up');
          console.log(`[TournamentManager] Runner-up: ${this.runnerUp.name} (ID: ${this.runnerUp.id})`);
        }
      } catch (err) {
        console.error('[TournamentManager] Failed to update runner-up stats:', err.message);
      }

      this.lastCompletedTournament = {
        tournamentId: this.tournamentId,
        winner: this.winner ? { id: this.winner.id, name: this.winner.name } : null,
        runnerUp: this.runnerUp ? { id: this.runnerUp.id, name: this.runnerUp.name } : null
      };

      this.emit('round_complete', {
        tournamentId: this.tournamentId,
        round: this.currentRoundName,
        winners: this.roundWinners.map(t => ({ id: t.id, name: t.name }))
      });

      this.emit('tournament_end', {
        tournamentId: this.tournamentId,
        winner: this.winner ? { id: this.winner.id, name: this.winner.name } : null,
        runnerUp: this.runnerUp ? { id: this.runnerUp.id, name: this.runnerUp.name } : null,
        results: this.completedResults
      });

      console.log(`[TournamentManager] Tournament complete! Winner: ${this.winner?.name}`);
    }

    this.state = TOURNAMENT_STATES.COMPLETE;
    await this._persistState();
    this._handleComplete();
  }

  /**
   * Clean up after tournament completion.
   */
  _handleComplete() {
    this.liveMatches = [];
    this.fixtures = [];
  }

  // =========================================================================
  // Recovery
  // =========================================================================

  /**
   * Recover tournament state from the tournament_state table.
   * Handles inconsistent states idempotently.
   */
  async recover() {
    console.log('[TournamentManager] Checking for recovery...');

    // 1. Load latest active tournament_state row
    const result = await db.query(`
      SELECT * FROM tournament_state
      WHERE state NOT IN ('IDLE', 'COMPLETE')
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      console.log('[TournamentManager] No active tournament state found');
      return false;
    }

    const row = result.rows[0];
    this.tournamentId = row.tournament_id;
    this.totalMatchMinutes = row.total_match_minutes;
    this.rules = deriveMatchTimings(this.totalMatchMinutes);
    this.currentRoundName = row.current_round;
    this.currentRoundKey = roundNameToKey(row.current_round);

    console.log(`[TournamentManager] Recovering tournament ${this.tournamentId} in state ${row.state} (round: ${row.current_round})`);

    // Load teams
    this.teams = await Team.getAll();

    // Reconstruct bracketFixtures map from DB
    const allFixtures = await Fixture.getAll({ tournamentId: this.tournamentId, limit: 1000 });
    this.bracketFixtures = new Map();
    for (const f of allFixtures) {
      if (f.bracketSlot) {
        this.bracketFixtures.set(f.bracketSlot, f.fixtureId);
      }
    }

    // Reconstruct completedResults from completed fixtures in prior rounds
    const roundOrder = Object.values(ROUND_NAMES); // ['Round of 16', 'Quarter-finals', ...]
    const byRound = {};
    for (const f of allFixtures) {
      if (!byRound[f.round]) byRound[f.round] = [];
      byRound[f.round].push(f);
    }

    this.completedResults = [];
    for (const round of roundOrder) {
      if (round === this.currentRoundName) break;
      if (byRound[round]) {
        for (const f of byRound[round]) {
          if (f.status === 'completed') {
            this.completedResults.push({
              fixtureId: f.fixtureId,
              round: f.round,
              home: { id: f.homeTeamId, name: f.homeTeamName },
              away: { id: f.awayTeamId, name: f.awayTeamName },
              score: { home: f.homeScore, away: f.awayScore },
              penaltyScore: { home: f.homePenaltyScore, away: f.awayPenaltyScore },
              winnerId: f.winnerTeamId
            });
          }
        }
      }
    }

    // Dispatch based on persisted state
    switch (row.state) {
      case 'SETUP':
        // Interrupted during setup - treat as no recovery
        console.log('[TournamentManager] Setup was interrupted. No recovery.');
        return false;

      case 'ROUND_ACTIVE':
        return await this._recoverRoundActive(byRound);

      case 'ROUND_COMPLETE':
        // Transition to INTER_ROUND_DELAY was interrupted
        return await this._recoverRoundComplete(byRound);

      case 'INTER_ROUND_DELAY':
        return await this._recoverInterRoundDelay(row, byRound);

      case 'RESULTS':
        // Re-run results handling
        await this._recoverCurrentRoundFixtures(byRound);
        await this._handleResults();
        return true;

      default:
        console.log(`[TournamentManager] Unknown state ${row.state}, no recovery`);
        return false;
    }
  }

  /**
   * Recover ROUND_ACTIVE: rebuild LiveMatch instances for non-completed fixtures.
   * If no live fixtures exist, treat as ROUND_COMPLETE (inconsistent state fix).
   */
  async _recoverRoundActive(byRound) {
    const currentFixtures = byRound[this.currentRoundName] || [];

    // Check for non-completed fixtures
    const nonCompleted = currentFixtures.filter(f => f.status !== 'completed');

    if (nonCompleted.length === 0) {
      // Inconsistent: ROUND_ACTIVE but no live fixtures -> promote to ROUND_COMPLETE
      console.log('[TournamentManager] ROUND_ACTIVE but no live fixtures. Promoting to ROUND_COMPLETE.');
      return await this._recoverRoundComplete(byRound);
    }

    // Rebuild LiveMatch instances for non-completed fixtures
    this.fixtures = [];
    this.liveMatches = [];

    for (const fixture of currentFixtures) {
      const homeTeam = await Team.getRatingById(fixture.homeTeamId);
      const awayTeam = await Team.getRatingById(fixture.awayTeamId);

      let match = null;

      if (fixture.status !== 'completed') {
        // Recover match from events
        match = await LiveMatch.recover(
          fixture.fixtureId,
          this.roundStartTime || Date.now(),
          this.rules
        );
        this.liveMatches.push(match);
      }

      this.fixtures.push({
        home: homeTeam,
        away: awayTeam,
        isBye: false,
        fixtureId: fixture.fixtureId,
        bracketSlot: fixture.bracketSlot,
        feedsInto: fixture.feedsInto,
        match,
        completed: fixture.status === 'completed'
      });
    }

    this.state = TOURNAMENT_STATES.ROUND_ACTIVE;
    console.log(`[TournamentManager] Recovered ROUND_ACTIVE with ${this.liveMatches.length} live matches`);
    return true;
  }

  /**
   * Recover ROUND_COMPLETE: the transactional transition to INTER_ROUND_DELAY was interrupted.
   * Re-run the transition.
   */
  async _recoverRoundComplete(byRound) {
    await this._recoverCurrentRoundFixtures(byRound);

    // Collect winners from completed fixtures
    this.roundWinners = [];
    const currentFixtures = byRound[this.currentRoundName] || [];
    for (const f of currentFixtures) {
      if (f.winnerTeamId) {
        const winner = await Team.getRatingById(f.winnerTeamId);
        this.roundWinners.push(winner);
      }
    }

    const isFinal = this.currentRoundKey === 'FINAL';

    if (isFinal) {
      this.state = TOURNAMENT_STATES.RESULTS;
      await this._persistState();
      await this._handleResults();
    } else {
      this.state = TOURNAMENT_STATES.ROUND_COMPLETE;
      await this._transitionToInterRoundDelay(Date.now());
    }

    console.log('[TournamentManager] Recovered from ROUND_COMPLETE');
    return true;
  }

  /**
   * Recover INTER_ROUND_DELAY: check if delay expired, verify next-round fixtures.
   */
  async _recoverInterRoundDelay(row, byRound) {
    this.delayStartedAt = row.delay_started_at ? new Date(row.delay_started_at).getTime() : null;
    this.nextRoundStartAt = row.next_round_start_at ? new Date(row.next_round_start_at).getTime() : null;
    this.state = TOURNAMENT_STATES.INTER_ROUND_DELAY;

    // Reconstruct roundWinners from completed current-round fixtures
    const currentFixtures = byRound[this.currentRoundName] || [];
    this.roundWinners = [];
    for (const f of currentFixtures) {
      if (f.winnerTeamId) {
        const winner = await Team.getRatingById(f.winnerTeamId);
        this.roundWinners.push(winner);
      }
    }

    // Verify next-round fixtures have teams assigned (idempotent regeneration)
    await this._ensureNextRoundFixturesPopulated(currentFixtures);

    const now = Date.now();
    if (this.nextRoundStartAt && now >= this.nextRoundStartAt) {
      // Delay already expired - start next round immediately
      console.log('[TournamentManager] INTER_ROUND_DELAY already expired. Starting next round.');
      await this._startNextRound(now);
    } else {
      console.log(`[TournamentManager] Recovered INTER_ROUND_DELAY. Waiting until ${new Date(this.nextRoundStartAt).toISOString()}`);
    }

    return true;
  }

  /**
   * Ensure next-round fixtures have team IDs filled in.
   * Idempotent: only writes NULL slots.
   */
  async _ensureNextRoundFixturesPopulated(completedFixtures) {
    const nextKey = getNextRoundKey(this.currentRoundKey);
    if (!nextKey) return;

    const nextSlots = ROUND_SLOT_MAP[nextKey];
    for (const fixture of completedFixtures) {
      if (!fixture.winnerTeamId || !fixture.bracketSlot) continue;

      const bracket = BRACKET_STRUCTURE[fixture.bracketSlot];
      if (!bracket || !bracket.feedsInto) continue;

      const toSlot = bracket.feedsInto;
      if (!nextSlots.includes(toSlot)) continue;

      const nextFixtureId = this.bracketFixtures.get(toSlot);
      if (!nextFixtureId) continue;

      // Idempotent: only update if NULL
      if (bracket.position === 'home') {
        await db.query(
          'UPDATE fixtures SET home_team_id = $1 WHERE fixture_id = $2 AND home_team_id IS NULL',
          [fixture.winnerTeamId, nextFixtureId]
        );
      } else if (bracket.position === 'away') {
        await db.query(
          'UPDATE fixtures SET away_team_id = $1 WHERE fixture_id = $2 AND away_team_id IS NULL',
          [fixture.winnerTeamId, nextFixtureId]
        );
      }
    }
  }

  /**
   * Rebuild this.fixtures array for the current round from DB data.
   * Does NOT create LiveMatch instances (used for completed rounds).
   */
  async _recoverCurrentRoundFixtures(byRound) {
    const currentFixtures = byRound[this.currentRoundName] || [];
    this.fixtures = [];
    this.liveMatches = [];

    for (const fixture of currentFixtures) {
      const homeTeam = await Team.getRatingById(fixture.homeTeamId);
      const awayTeam = await Team.getRatingById(fixture.awayTeamId);

      this.fixtures.push({
        home: homeTeam,
        away: awayTeam,
        isBye: false,
        fixtureId: fixture.fixtureId,
        bracketSlot: fixture.bracketSlot,
        feedsInto: fixture.feedsInto,
        match: null,
        completed: fixture.status === 'completed'
      });
    }
  }

  // =========================================================================
  // Public API / Admin Controls
  // =========================================================================

  /**
   * Start a tournament now (replaces old forceStart).
   * Event-driven flow with inter-round delays.
   *
   * @param {number} [totalMatchMinutes] - Optional override (even int 2..20).
   *   Only accepted when tournament is not active.
   */
  async startNow(totalMatchMinutes) {
    if (this.state !== TOURNAMENT_STATES.IDLE && this.state !== TOURNAMENT_STATES.COMPLETE) {
      throw new Error('Tournament already in progress');
    }

    // Accept match-minutes override before tournament starts
    if (totalMatchMinutes !== undefined) {
      this._validateMatchMinutes(totalMatchMinutes);
      this.totalMatchMinutes = totalMatchMinutes;
      this.rules = deriveMatchTimings(this.totalMatchMinutes);
    }

    await this._handleSetup();

    // Immediately start first round
    await this._startRound('ROUND_OF_16', Date.now());

    return this.getState();
  }

  /**
   * Backward-compatible alias for startNow.
   * @deprecated Use startNow() instead.
   */
  async forceStart() {
    return this.startNow();
  }

  /**
   * Skip to a specific round (admin/testing utility).
   * Simulates previous rounds by halving teams.
   *
   * @param {string} targetRound - Round key: QUARTER_FINALS, SEMI_FINALS, FINAL
   */
  async skipToRound(targetRound) {
    const validRounds = ['QUARTER_FINALS', 'SEMI_FINALS', 'FINAL'];
    if (!validRounds.includes(targetRound)) {
      throw new Error(`Invalid round: ${targetRound}`);
    }

    // Setup if not already
    if (!this.tournamentId) {
      await this._handleSetup();
    }

    // Simulate previous rounds to get correct number of teams
    const targetIndex = ROUND_ORDER.indexOf(targetRound);
    let teams = this.roundWinners.length > 0 ? this.roundWinners : [...this.teams];

    for (let i = 0; i < targetIndex; i++) {
      teams = teams.slice(0, Math.ceil(teams.length / 2));
    }

    this.roundWinners = this._shuffleTeams(teams);

    // Start the target round (sets state to ROUND_ACTIVE and persists)
    await this._startRound(targetRound, Date.now());

    console.log(`[TournamentManager] Skipped to ${targetRound}`);
    return this.getState();
  }

  /**
   * Cancel current tournament.
   */
  async cancel() {
    const prevTournamentId = this.tournamentId;

    this.state = TOURNAMENT_STATES.IDLE;
    this.liveMatches = [];
    this.fixtures = [];
    this.roundWinners = [];

    // Persist cancellation
    if (prevTournamentId) {
      try {
        await db.query(
          `UPDATE tournament_state SET state = 'COMPLETE', updated_at = NOW() WHERE tournament_id = $1`,
          [prevTournamentId]
        );
      } catch (err) {
        console.error('[TournamentManager] Failed to persist cancellation:', err.message);
      }
    }

    this.tournamentId = null;
    this.emit('tournament_cancelled', { tournamentId: prevTournamentId });
    console.log('[TournamentManager] Tournament cancelled');
  }

  /**
   * Get current live matches (for SimulationLoop).
   */
  getLiveMatches() {
    return this.liveMatches.filter(m => !m.isFinished());
  }

  /**
   * Get current tournament state (for API endpoints).
   */
  getState() {
    return {
      state: this.state,
      tournamentId: this.tournamentId,
      currentRound: this.currentRoundName,
      currentRoundKey: this.currentRoundKey,
      teamsRemaining: this.roundWinners.length,
      activeMatches: this.liveMatches.length,
      totalMatchMinutes: this.totalMatchMinutes,
      nextRoundStartAt: this.nextRoundStartAt || null,
      delayStartedAt: this.delayStartedAt || null,
      winner: this.winner ? { id: this.winner.id, name: this.winner.name } : null,
      runnerUp: this.runnerUp ? { id: this.runnerUp.id, name: this.runnerUp.name } : null,
      lastCompleted: this.lastCompletedTournament
    };
  }

  /**
   * Set total match minutes. Only allowed when tournament is idle.
   * @param {number} minutes - Even integer 2..20
   */
  setTotalMatchMinutes(minutes) {
    if (this.state !== TOURNAMENT_STATES.IDLE && this.state !== TOURNAMENT_STATES.COMPLETE) {
      throw new Error('Cannot change match duration while tournament is active');
    }
    this._validateMatchMinutes(minutes);
    this.totalMatchMinutes = minutes;
    this.rules = deriveMatchTimings(minutes);
    console.log(`[TournamentManager] Match duration set to ${minutes} minutes`);
  }

  // =========================================================================
  // Utility
  // =========================================================================

  _validateMatchMinutes(minutes) {
    if (typeof minutes !== 'number' || !Number.isInteger(minutes)) {
      throw new Error('total_match_minutes must be an integer');
    }
    if (minutes < 2 || minutes > 20) {
      throw new Error('total_match_minutes must be between 2 and 20');
    }
    if (minutes % 2 !== 0) {
      throw new Error('total_match_minutes must be even');
    }
  }

  async _updateRecentForm(teamId, won) {
    try {
      const result = await db.query('SELECT recent_form FROM teams WHERE team_id = $1', [teamId]);
      let form = result.rows[0]?.recent_form || '';
      form = (won ? 'W' : 'L') + form.slice(0, 9);
      await db.query('UPDATE teams SET recent_form = $1 WHERE team_id = $2', [form, teamId]);
    } catch (err) {
      console.error(`[TournamentManager] Failed to update recent_form for team ${teamId}:`, err.message);
    }
  }

  _shuffleTeams(teams) {
    const shuffled = [...teams];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}

module.exports = {
  TournamentManager,
  TOURNAMENT_STATES,
  ROUND_NAMES,
  BRACKET_STRUCTURE,
  ROUND_ORDER,
  ROUND_SLOT_MAP,
  INTER_ROUND_DELAY_MS,
  deriveMatchTimings
};
