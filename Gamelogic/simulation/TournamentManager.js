const EventEmitter = require('events');
const Team = require('../../models/TeamModel');
const Fixture = require('../../models/FixtureModel');
const { LiveMatch, DEFAULT_RULES } = require('./LiveMatch');
const db = require('../../db/connection');

const TOURNAMENT_STATES = {
  IDLE: 'IDLE',
  SETUP: 'SETUP',
  ROUND_OF_16: 'ROUND_OF_16',
  QF_BREAK: 'QF_BREAK',
  QUARTER_FINALS: 'QUARTER_FINALS',
  SF_BREAK: 'SF_BREAK',
  SEMI_FINALS: 'SEMI_FINALS',
  FINAL_BREAK: 'FINAL_BREAK',
  FINAL: 'FINAL',
  RESULTS: 'RESULTS',
  COMPLETE: 'COMPLETE'
};

// Schedule: minute of hour -> state
// Matches start at: :00 (R16), :15 (QF), :30 (SF), :45 (Final)
const SCHEDULE = {
  SETUP:          { startMinute: 55, endMinute: 60 },  // :55-:00 (wraps)
  ROUND_OF_16:    { startMinute: 0,  endMinute: 9 },
  QF_BREAK:       { startMinute: 9,  endMinute: 15 },
  QUARTER_FINALS: { startMinute: 15, endMinute: 24 },
  SF_BREAK:       { startMinute: 24, endMinute: 30 },
  SEMI_FINALS:    { startMinute: 30, endMinute: 39 },
  FINAL_BREAK:    { startMinute: 39, endMinute: 45 },
  FINAL:          { startMinute: 45, endMinute: 54 },
  RESULTS:        { startMinute: 54, endMinute: 55 }
};

const ROUND_NAMES = {
  ROUND_OF_16: 'Round of 16',
  QUARTER_FINALS: 'Quarter-finals',
  SEMI_FINALS: 'Semi-finals',
  FINAL: 'Final'
};

/**
 * TournamentManager - Manages hourly tournament lifecycle
 *
 * Responsibilities:
 * - Track tournament state (IDLE -> SETUP -> R16 -> ... -> COMPLETE)
 * - Schedule rounds based on wall-clock time
 * - Create fixtures and LiveMatch instances
 * - Track match completion, advance rounds
 * - Handle recovery on restart
 */
class TournamentManager extends EventEmitter {
  constructor(rules = {}) {
    super();

    this.state = TOURNAMENT_STATES.IDLE;
    this.rules = { ...DEFAULT_RULES, ...rules };

    // Tournament data
    this.tournamentId = null;
    this.teams = [];
    this.currentRoundName = null;
    this.roundWinners = [];

    // Fixtures and matches
    this.fixtures = [];        // Current round fixture data
    this.liveMatches = [];     // LiveMatch instances
    this.completedResults = [];

    // Timing
    this.roundStartTime = null;
    this.lastTickMinute = null;
    this.forceMode = false; // When true, ignore wall-clock scheduling

    // Results history
    this.winner = null;
    this.runnerUp = null;
  }

  /**
   * Main tick - called by SimulationLoop every second
   */
  tick(now) {
    // In force mode, state transitions are driven by match completion, not wall-clock
    if (this.forceMode) {
      this._checkForceModeTick();
      return;
    }

    const date = new Date(now);
    const minute = date.getMinutes();

    // Only process state changes once per minute
    if (minute === this.lastTickMinute) return;
    this.lastTickMinute = minute;

    const prevState = this.state;
    this._updateState(minute);

    // Handle state transitions
    if (prevState !== this.state) {
      this._handleStateTransition(prevState, this.state, now);
    }
  }

  /**
   * Handle tick in force mode - advance rounds when all matches complete
   */
  async _checkForceModeTick() {
    // Prevent re-entry during async transitions
    if (this._transitioning) return;

    // Check if we're in a playing round and all matches are complete
    const playingRounds = [
      TOURNAMENT_STATES.ROUND_OF_16,
      TOURNAMENT_STATES.QUARTER_FINALS,
      TOURNAMENT_STATES.SEMI_FINALS,
      TOURNAMENT_STATES.FINAL
    ];

    if (!playingRounds.includes(this.state)) return;

    const allComplete = this.liveMatches.every(m => m.isFinished());
    if (!allComplete) return;

    // All matches done - advance to next round
    const nextState = {
      [TOURNAMENT_STATES.ROUND_OF_16]: TOURNAMENT_STATES.QUARTER_FINALS,
      [TOURNAMENT_STATES.QUARTER_FINALS]: TOURNAMENT_STATES.SEMI_FINALS,
      [TOURNAMENT_STATES.SEMI_FINALS]: TOURNAMENT_STATES.FINAL,
      [TOURNAMENT_STATES.FINAL]: TOURNAMENT_STATES.RESULTS
    }[this.state];

    if (nextState) {
      this._transitioning = true;
      try {
        // For RESULTS state, _handleResults will call _collectWinners itself
        // For other states, we need to collect winners before starting next round
        if (nextState === TOURNAMENT_STATES.RESULTS) {
          this.state = nextState;
          await this._handleResults();
        } else {
          // Collect winners first for non-final rounds
          await this._collectWinners();
          this.emit('round_complete', {
            tournamentId: this.tournamentId,
            round: this.currentRoundName,
            winners: this.roundWinners.map(t => ({ id: t.id, name: t.name }))
          });

          this.state = nextState;
          await this._startRound(nextState, Date.now());
        }
      } finally {
        this._transitioning = false;
      }
    }
  }

  /**
   * Update state based on minute of hour
   */
  _updateState(minute) {
    // Handle SETUP wrapping around hour (55-59 of prev hour)
    if (minute >= 55) {
      if (this.state === TOURNAMENT_STATES.IDLE || this.state === TOURNAMENT_STATES.COMPLETE) {
        this.state = TOURNAMENT_STATES.SETUP;
      }
      return;
    }

    // Check each scheduled state
    for (const [stateName, schedule] of Object.entries(SCHEDULE)) {
      if (stateName === 'SETUP') continue; // Handled above

      if (minute >= schedule.startMinute && minute < schedule.endMinute) {
        const targetState = TOURNAMENT_STATES[stateName];

        // Only transition if it's a valid next state
        if (this._isValidTransition(this.state, targetState)) {
          this.state = targetState;
        }
        return;
      }
    }

    // After :55, go to IDLE if tournament is complete
    if (this.state === TOURNAMENT_STATES.RESULTS || this.state === TOURNAMENT_STATES.COMPLETE) {
      this.state = TOURNAMENT_STATES.IDLE;
    }
  }

  _isValidTransition(from, to) {
    // Allow any transition from IDLE/SETUP
    if (from === TOURNAMENT_STATES.IDLE || from === TOURNAMENT_STATES.SETUP) {
      return true;
    }

    // Define valid transitions
    const validTransitions = {
      [TOURNAMENT_STATES.ROUND_OF_16]: [TOURNAMENT_STATES.QF_BREAK],
      [TOURNAMENT_STATES.QF_BREAK]: [TOURNAMENT_STATES.QUARTER_FINALS],
      [TOURNAMENT_STATES.QUARTER_FINALS]: [TOURNAMENT_STATES.SF_BREAK],
      [TOURNAMENT_STATES.SF_BREAK]: [TOURNAMENT_STATES.SEMI_FINALS],
      [TOURNAMENT_STATES.SEMI_FINALS]: [TOURNAMENT_STATES.FINAL_BREAK],
      [TOURNAMENT_STATES.FINAL_BREAK]: [TOURNAMENT_STATES.FINAL],
      [TOURNAMENT_STATES.FINAL]: [TOURNAMENT_STATES.RESULTS],
      [TOURNAMENT_STATES.RESULTS]: [TOURNAMENT_STATES.COMPLETE, TOURNAMENT_STATES.IDLE],
      [TOURNAMENT_STATES.COMPLETE]: [TOURNAMENT_STATES.IDLE, TOURNAMENT_STATES.SETUP]
    };

    return validTransitions[from]?.includes(to) ?? false;
  }

  /**
   * Handle state transitions
   */
  async _handleStateTransition(fromState, toState, now) {
    console.log(`[TournamentManager] ${fromState} -> ${toState}`);

    switch (toState) {
      case TOURNAMENT_STATES.SETUP:
        await this._handleSetup();
        break;

      case TOURNAMENT_STATES.ROUND_OF_16:
        await this._startRound('ROUND_OF_16', now);
        break;

      case TOURNAMENT_STATES.QUARTER_FINALS:
        await this._startRound('QUARTER_FINALS', now);
        break;

      case TOURNAMENT_STATES.SEMI_FINALS:
        await this._startRound('SEMI_FINALS', now);
        break;

      case TOURNAMENT_STATES.FINAL:
        await this._startRound('FINAL', now);
        break;

      case TOURNAMENT_STATES.QF_BREAK:
      case TOURNAMENT_STATES.SF_BREAK:
      case TOURNAMENT_STATES.FINAL_BREAK:
        await this._handleBreak(fromState);
        break;

      case TOURNAMENT_STATES.RESULTS:
        await this._handleResults();
        break;

      case TOURNAMENT_STATES.COMPLETE:
      case TOURNAMENT_STATES.IDLE:
        this._handleComplete();
        break;
    }
  }

  /**
   * Setup phase - load teams, generate first round
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

    // Load teams
    this.teams = await Team.getAll();

    if (this.teams.length < 2) {
      console.error('[TournamentManager] Not enough teams for tournament');
      this.state = TOURNAMENT_STATES.IDLE;
      return;
    }

    // Shuffle teams for first round
    this.roundWinners = this._shuffleTeams(this.teams);

    this.emit('tournament_setup', {
      tournamentId: this.tournamentId,
      teamCount: this.teams.length
    });

    console.log(`[TournamentManager] Tournament ${this.tournamentId} setup with ${this.teams.length} teams`);
  }

  /**
   * Start a round - create fixtures and LiveMatch instances
   */
  async _startRound(roundKey, now) {
    const roundName = ROUND_NAMES[roundKey];
    this.currentRoundName = roundName;

    console.log(`[TournamentManager] Starting ${roundName} with ${this.roundWinners.length} teams`);

    // Pair teams
    const teams = this.roundWinners;
    const pairings = [];

    for (let i = 0; i < teams.length; i += 2) {
      if (i + 1 < teams.length) {
        pairings.push({ home: teams[i], away: teams[i + 1] });
      } else {
        // Bye - team advances automatically
        pairings.push({ home: teams[i], away: null, isBye: true });
      }
    }

    // Create fixtures in DB
    const dbFixtures = pairings
      .filter(p => !p.isBye)
      .map(p => ({
        homeTeamId: p.home.id,
        awayTeamId: p.away.id,
        tournamentId: this.tournamentId,
        round: roundName
      }));

    let createdFixtures = [];
    if (dbFixtures.length > 0) {
      createdFixtures = await Fixture.createBatch(dbFixtures);
    }

    // Create LiveMatch instances
    this.fixtures = [];
    this.liveMatches = [];
    let fixtureIndex = 0;

    for (const pairing of pairings) {
      if (pairing.isBye) {
        // Handle bye
        this.fixtures.push({
          home: pairing.home,
          away: null,
          isBye: true,
          fixtureId: null
        });
        continue;
      }

      const fixture = createdFixtures[fixtureIndex++];

      // Get full team data with ratings
      const homeTeam = await Team.getRatingById(fixture.homeTeamId);
      const awayTeam = await Team.getRatingById(fixture.awayTeamId);

      // Create LiveMatch
      const match = new LiveMatch(
        fixture.fixtureId,
        homeTeam,
        awayTeam,
        now,
        this.rules
      );

      await match.loadPlayers();

      this.liveMatches.push(match);
      this.fixtures.push({
        home: homeTeam,
        away: awayTeam,
        isBye: false,
        fixtureId: fixture.fixtureId,
        match
      });
    }

    this.roundStartTime = now;

    // Emit matches_created for SimulationLoop to register
    this.emit('matches_created', this.liveMatches);

    this.emit('round_start', {
      tournamentId: this.tournamentId,
      round: roundName,
      fixtures: this.fixtures.map(f => ({
        fixtureId: f.fixtureId,
        home: { id: f.home.id, name: f.home.name },
        away: f.away ? { id: f.away.id, name: f.away.name } : null,
        isBye: f.isBye
      }))
    });

    console.log(`[TournamentManager] ${roundName} started with ${this.liveMatches.length} matches`);
  }

  /**
   * Handle break between rounds
   */
  async _handleBreak(fromState) {
    // Collect winners from completed matches
    await this._collectWinners();

    this.emit('round_complete', {
      tournamentId: this.tournamentId,
      round: this.currentRoundName,
      winners: this.roundWinners.map(t => ({ id: t.id, name: t.name }))
    });

    console.log(`[TournamentManager] Round complete. ${this.roundWinners.length} teams advance.`);
  }

  /**
   * Collect winners from current round and update team stats
   */
  async _collectWinners() {
    const winners = [];

    for (const fixture of this.fixtures) {
      if (fixture.isBye) {
        // Bye team advances
        winners.push(fixture.home);
        continue;
      }

      const match = fixture.match;
      if (!match || !match.isFinished()) {
        console.warn(`[TournamentManager] Match ${fixture.fixtureId} not finished!`);
        // Use home team as fallback (shouldn't happen)
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

        // Home team stats
        await Team.updateMatchStats(
          fixture.home.id,
          homeWon,
          score.home,
          score.away
        );
        // Away team stats
        await Team.updateMatchStats(
          fixture.away.id,
          !homeWon,
          score.away,
          score.home
        );

        // Update recent_form for both teams
        await this._updateRecentForm(fixture.home.id, homeWon);
        await this._updateRecentForm(fixture.away.id, !homeWon);

        // Update highest round reached for loser (they're eliminated here)
        await Team.updateHighestRound(loser.id, this.currentRoundName);

        console.log(`[TournamentManager] Updated stats: ${winner.name} beat ${loser.name} ${score.home}-${score.away}, loser highest_round=${this.currentRoundName}`);
      } catch (err) {
        console.error('[TournamentManager] Failed to update team stats:', err.message, err.stack);
      }

      this.completedResults.push({
        fixtureId: fixture.fixtureId,
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

  /**
   * Handle tournament results
   */
  async _handleResults() {
    await this._collectWinners();

    // Emit round_complete for the final
    this.emit('round_complete', {
      tournamentId: this.tournamentId,
      round: this.currentRoundName,
      winners: this.roundWinners.map(t => ({ id: t.id, name: t.name }))
    });

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
          console.log(`[TournamentManager] Updated winner stats: ${this.winner.name} (ID: ${this.winner.id})`);
        }
      } catch (err) {
        console.error(`[TournamentManager] Failed to update winner stats:`, err.message);
      }

      try {
        if (this.runnerUp) {
          await Team.addRunnerUp(this.runnerUp.id);
          await Team.updateHighestRound(this.runnerUp.id, 'Runner-up');
          console.log(`[TournamentManager] Updated runner-up stats: ${this.runnerUp.name} (ID: ${this.runnerUp.id})`);
        }
      } catch (err) {
        console.error(`[TournamentManager] Failed to update runner-up stats:`, err.message);
      }

      this.emit('tournament_end', {
        tournamentId: this.tournamentId,
        winner: this.winner ? { id: this.winner.id, name: this.winner.name } : null,
        runnerUp: this.runnerUp ? { id: this.runnerUp.id, name: this.runnerUp.name } : null,
        results: this.completedResults
      });

      console.log(`[TournamentManager] Tournament complete! Winner: ${this.winner?.name}`);
    }

    this.state = TOURNAMENT_STATES.COMPLETE;
  }

  /**
   * Handle tournament completion
   */
  _handleComplete() {
    this.liveMatches = [];
    this.fixtures = [];
  }

  /**
   * Called by SimulationLoop when matches complete
   */
  onMatchesComplete(results) {
    // Update fixture data with results
    for (const result of results) {
      const fixture = this.fixtures.find(f => f.fixtureId === result.fixtureId);
      if (fixture && fixture.match) {
        fixture.completed = true;
      }
    }

    // Check if all matches in round are complete
    const allComplete = this.fixtures.every(f =>
      f.isBye || (f.match && f.match.isFinished())
    );

    if (allComplete) {
      console.log('[TournamentManager] All matches in round complete');
    }
  }

  /**
   * Get current live matches (for SimulationLoop)
   */
  getLiveMatches() {
    return this.liveMatches.filter(m => !m.isFinished());
  }

  /**
   * Recovery - restore tournament state from DB
   */
  async recover() {
    // Check for any live fixtures
    const liveFixtures = await Fixture.getAll({ status: 'live' });

    if (liveFixtures.length === 0) {
      return false;
    }

    console.log(`[TournamentManager] Found ${liveFixtures.length} live fixtures to recover`);

    // Get tournament ID from first fixture
    const tournamentId = liveFixtures[0].tournamentId;
    if (!tournamentId) {
      return false;
    }

    this.tournamentId = tournamentId;

    // Determine current round from fixture data
    const roundName = liveFixtures[0].round;
    this.currentRoundName = roundName;

    // Map round name to state
    const roundStateMap = {
      'Round of 16': TOURNAMENT_STATES.ROUND_OF_16,
      'Quarter-finals': TOURNAMENT_STATES.QUARTER_FINALS,
      'Semi-finals': TOURNAMENT_STATES.SEMI_FINALS,
      'Final': TOURNAMENT_STATES.FINAL
    };

    this.state = roundStateMap[roundName] || TOURNAMENT_STATES.IDLE;

    // Recover LiveMatch instances
    this.liveMatches = [];
    this.fixtures = [];

    for (const fixture of liveFixtures) {
      const homeTeam = await Team.getRatingById(fixture.homeTeamId);
      const awayTeam = await Team.getRatingById(fixture.awayTeamId);

      // Calculate start time from match state
      // Assume match started at round start time (approximate)
      const roundSchedule = SCHEDULE[Object.keys(ROUND_NAMES).find(k => ROUND_NAMES[k] === roundName)];
      const now = new Date();
      const startTime = new Date(now);
      startTime.setMinutes(roundSchedule?.startMinute || 0);
      startTime.setSeconds(0);
      startTime.setMilliseconds(0);

      const match = await LiveMatch.recover(
        fixture.fixtureId,
        startTime.getTime(),
        this.rules
      );

      this.liveMatches.push(match);
      this.fixtures.push({
        home: homeTeam,
        away: awayTeam,
        isBye: false,
        fixtureId: fixture.fixtureId,
        match
      });
    }

    console.log(`[TournamentManager] Recovered ${this.liveMatches.length} matches`);
    return true;
  }

  /**
   * Get current tournament state
   */
  getState() {
    return {
      state: this.state,
      tournamentId: this.tournamentId,
      currentRound: this.currentRoundName,
      teamsRemaining: this.roundWinners.length,
      activeMatches: this.liveMatches.length,
      winner: this.winner ? { id: this.winner.id, name: this.winner.name } : null,
      runnerUp: this.runnerUp ? { id: this.runnerUp.id, name: this.runnerUp.name } : null
    };
  }

  // === Admin Controls ===

  /**
   * Force start tournament now (skip schedule)
   */
  async forceStart() {
    if (this.state !== TOURNAMENT_STATES.IDLE && this.state !== TOURNAMENT_STATES.COMPLETE) {
      throw new Error('Tournament already in progress');
    }

    this.forceMode = true; // Ignore wall-clock scheduling

    await this._handleSetup();
    this.state = TOURNAMENT_STATES.SETUP;

    // Immediately start first round
    await this._startRound('ROUND_OF_16', Date.now());
    this.state = TOURNAMENT_STATES.ROUND_OF_16;

    return this.getState();
  }

  /**
   * Cancel current tournament
   */
  cancel() {
    this.state = TOURNAMENT_STATES.IDLE;
    this.liveMatches = [];
    this.fixtures = [];
    this.roundWinners = [];
    this.tournamentId = null;

    this.emit('tournament_cancelled', { tournamentId: this.tournamentId });
    console.log('[TournamentManager] Tournament cancelled');
  }

  /**
   * Skip to a specific round
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
    const roundOrder = ['ROUND_OF_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'FINAL'];
    const targetIndex = roundOrder.indexOf(targetRound);

    // Reduce teams appropriately
    let teams = this.roundWinners.length > 0 ? this.roundWinners : [...this.teams];

    for (let i = 0; i < targetIndex; i++) {
      // Halve the teams (simulate previous rounds)
      teams = teams.slice(0, Math.ceil(teams.length / 2));
    }

    this.roundWinners = this._shuffleTeams(teams);

    // Start the target round
    await this._startRound(targetRound, Date.now());
    this.state = TOURNAMENT_STATES[targetRound];

    console.log(`[TournamentManager] Skipped to ${targetRound}`);
    return this.getState();
  }

  // === Utility ===

  /**
   * Update a team's recent form (last 10 results as W/L string)
   */
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
  SCHEDULE,
  ROUND_NAMES
};
