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
  SETUP: { startMinute: 55, endMinute: 60 },  // :55-:00 (wraps)
  ROUND_OF_16: { startMinute: 0, endMinute: 9 },
  QF_BREAK: { startMinute: 9, endMinute: 15 },
  QUARTER_FINALS: { startMinute: 15, endMinute: 24 },
  SF_BREAK: { startMinute: 24, endMinute: 30 },
  SEMI_FINALS: { startMinute: 30, endMinute: 39 },
  FINAL_BREAK: { startMinute: 39, endMinute: 45 },
  FINAL: { startMinute: 45, endMinute: 54 },
  RESULTS: { startMinute: 54, endMinute: 55 }
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
  /**
   * Recovery - restore tournament state from DB
   * Searches for most recent active tournament in last 3 hours
   */
  async recover() {
    console.log('[TournamentManager] Checking for recovery...');

    // 1. Find most recent tournament from last 3 hours
    const recentResult = await db.query(`
      SELECT tournament_id 
      FROM fixtures 
      WHERE created_at > NOW() - INTERVAL '3 hours' 
      ORDER BY created_at DESC 
      LIMIT 1
    `);

    if (recentResult.rows.length === 0) {
      console.log('[TournamentManager] No recent tournament found');
      return false;
    }

    const tournamentId = recentResult.rows[0].tournament_id;
    console.log(`[TournamentManager] Found recent tournament ${tournamentId}`);

    // 2. Load ALL fixtures for this tournament
    const allFixtures = await Fixture.getAll({ tournamentId, limit: 1000 });

    if (allFixtures.length === 0) {
      return false;
    }

    this.tournamentId = tournamentId;

    // 3. Reconstruct State
    // Sort fixtures by creation time/round order to replay history
    // Round order: Round of 16 -> Quarter-finals -> Semi-finals -> Final
    const roundOrder = ['Round of 16', 'Quarter-finals', 'Semi-finals', 'Final'];

    // Group fixtures by round
    const byRound = {};
    for (const f of allFixtures) {
      if (!byRound[f.round]) byRound[f.round] = [];
      byRound[f.round].push(f);
    }

    // Determine current/latest round
    let latestRound = null;
    for (const round of roundOrder) {
      if (byRound[round] && byRound[round].length > 0) {
        latestRound = round;
      }
    }

    if (!latestRound) {
      console.log('[TournamentManager] Could not determine latest round');
      return false;
    }

    this.currentRoundName = latestRound;
    console.log(`[TournamentManager] Reconstructing state at ${latestRound}`);

    // Flatten all fixtures to reconstruct 'completedResults' and 'teams'
    // We need to reload all teams to populate `this.teams`
    this.teams = await Team.getAll(); // Needed for random access if needed, or at least initialization

    // Reconstruct roundWinners for the current round
    // If we are in QF, roundWinners should be the teams in QF
    // Actually, `roundWinners` tracks the teams *competing* in the *current* round (or winners of previous). 
    // Wait, the logic in `_startRound` uses `this.roundWinners` to create pairings.
    // So if we are mid-round, `roundWinners` is actually the participants of this round.

    // Let's identify the participants of the current round from the fixtures
    const currentFixtures = byRound[latestRound];
    const participants = [];

    // Also reconstruct `completedResults` from ALL completed fixtures in previous rounds
    this.completedResults = [];
    for (const round of roundOrder) {
      if (round === latestRound) break; // Don't include current round in completed results yet (unless finished)
      // Actually strictly previous rounds
      if (byRound[round]) {
        for (const f of byRound[round]) {
          if (f.status === 'completed') {
            // We need the match object for stats, but we can just use the DB result
            // SimulationLoop expects `completedResults` to have specific structure
            // But mostly it's used for records.

            // For recovery of `completedResults`, we might just push basic info
            // but `_handleResults` uses it.
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

    // Now handle current round state
    this.fixtures = [];
    this.liveMatches = [];
    const participantsSet = new Set();

    let allCurrentComplete = true;
    let anyLive = false;

    // Load LiveMatch for any non-completed match, or completed if we want to show it?
    // Actually `recover` logic for LiveMatch handles active ones.

    for (const fixture of currentFixtures) {
      // Re-populate fixtures array
      const homeTeam = await Team.getRatingById(fixture.homeTeamId);
      const awayTeam = await Team.getRatingById(fixture.awayTeamId);

      participantsSet.add(fixture.homeTeamId);
      participantsSet.add(fixture.awayTeamId);

      let match = null;

      if (fixture.status === 'live' || fixture.status === 'assigned') { // 'assigned' is default DB status? check schema. FixtureModel uses COALESCE(..., NOW()) but doesn't set status. DB default probably 'scheduled' or something.
        // Check FixtureModel create... it inserts but doesn't specify status. DB schema dependent.
        // Assuming 'scheduled' is default.

        allCurrentComplete = false;
        anyLive = true;

        // Recover match state
        const roundSchedule = SCHEDULE[Object.keys(ROUND_NAMES).find(k => ROUND_NAMES[k] === this.currentRoundName)];
        const now = new Date();
        const startTime = new Date(now);
        startTime.setMinutes(roundSchedule?.startMinute || 0);
        startTime.setSeconds(0);
        startTime.setMilliseconds(0);

        // Determine if we should be live based on time matching schedule?
        // For now, if it's not completed, we treat it as potentially live or needing start

        match = await LiveMatch.recover(
          fixture.fixtureId,
          startTime.getTime(),
          this.rules
        );

        this.liveMatches.push(match);
      } else if (fixture.status === 'completed') {
        // It's done
      } else {
        // Scheduled but not live? Treat as live for recovery if we are in that time window?
        // Or if we are recovering, we should arguably 'resume' them if they aren't marked finished.
        // The issue is if status was never updated to 'live'.
        // LiveMatches update status to 'live' on first tick.

        // If status is NOT completed, we should probably recover it as a LiveMatch
        allCurrentComplete = false;
        anyLive = true;

        const roundSchedule = SCHEDULE[Object.keys(ROUND_NAMES).find(k => ROUND_NAMES[k] === this.currentRoundName)];
        const now = new Date();
        const startTime = new Date(now);
        startTime.setMinutes(roundSchedule?.startMinute || 0);
        startTime.setSeconds(0);
        startTime.setMilliseconds(0);

        match = await LiveMatch.recover(
          fixture.fixtureId,
          startTime.getTime(),
          this.rules
        );
        this.liveMatches.push(match);
      }

      this.fixtures.push({
        home: homeTeam,
        away: awayTeam,
        isBye: false,
        fixtureId: fixture.fixtureId,
        match: match,
        completed: fixture.status === 'completed'
      });
    }

    // Add dummy objects for Byes if any?
    // Byes are not in compiled fixtures usually?
    // In `_startRound`, byes are not created in DB.
    // So we might miss them in `this.fixtures` but `roundWinners` is key.

    // Reconstruct roundWinners (participants for this round)
    this.roundWinners = [];
    // We need to find the Team objects for all participants
    // We have homeTeam/awayTeam from fixtures

    // This part is tricky because we need the array of teams to be in pairing order if we were to restart,
    // but here we just need them to exist for the NEXT round generation.
    // `roundWinners` is essentially "Teams currently in the tournament"

    // Better strategy:
    // If round is complete, `roundWinners` should be the winners of this round.
    // If round is in progress, `roundWinners` should be the participants.

    // Actually `roundWinners` is cleared and repopulated in `_collectWinners` at end of round.
    // At start of round (`_startRound`), `roundWinners` comes from previous round winners.
    // So `this.roundWinners` should reflect the input to the NEXT round if current is done?
    // Or the input to CURRENT round if in progress?

    // `_startRound` consumes `this.roundWinners`.
    // So if we are IN `ROUND_OF_16`, `roundWinners` was used to create fixtures.
    // If we recover, we assume fixtures exist.
    // When round completes, `_collectWinners` populates `roundWinners` for next round.

    // Case 1: All fixtures in current round COMPLETE.
    // We are likely in BREAK.
    // We need to populate `roundWinners` with the winners of this complete round.

    // Case 2: Round IN PROGRESS.
    // We don't strictly need `roundWinners` populated right now, 
    // BUT `_collectWinners` iterates `this.fixtures`.
    // So as long as `this.fixtures` is populated (which we did), `_collectWinners` will work.

    if (allCurrentComplete) {
      console.log('[TournamentManager] All matches in round complete. Recovering to BREAK state.');

      // Populate roundWinners from completed fixtures manually to avoid re-triggering stats updates
      this.roundWinners = [];
      for (const fixture of currentFixtures) {
        // Find the winner
        if (fixture.winnerTeamId) {
          const winnerId = fixture.winnerTeamId;
          // We need full team object for next round
          const winner = await Team.getRatingById(winnerId);
          this.roundWinners.push(winner);
        }
      }

      // Map round name to BREAK state
      const breakMap = {
        'Round of 16': TOURNAMENT_STATES.QF_BREAK,
        'Quarter-finals': TOURNAMENT_STATES.SF_BREAK,
        'Semi-finals': TOURNAMENT_STATES.FINAL_BREAK,
        'Final': TOURNAMENT_STATES.RESULTS
      };
      this.state = breakMap[latestRound] || TOURNAMENT_STATES.IDLE;

      if (latestRound === 'Final') {
        // Special handling for results?
        // _handleResults calls _collectWinners then sets COMPLETE.
        // If we are recovered after final, effectively we are in RESULTS or COMPLETE.
        this.state = TOURNAMENT_STATES.RESULTS; // Trigger results processing next tick
      }

    } else {
      console.log(`[TournamentManager] Matches in progress (Live: ${anyLive}). Recovering to ${latestRound} state.`);
      // Map round name to PLAYING state
      const stateMap = {
        'Round of 16': TOURNAMENT_STATES.ROUND_OF_16,
        'Quarter-finals': TOURNAMENT_STATES.QUARTER_FINALS,
        'Semi-finals': TOURNAMENT_STATES.SEMI_FINALS,
        'Final': TOURNAMENT_STATES.FINAL
      };
      this.state = stateMap[latestRound] || TOURNAMENT_STATES.IDLE;
    }

    console.log(`[TournamentManager] Recovered tournament ${this.tournamentId} in state ${this.state}`);
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
