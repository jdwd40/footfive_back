const EventEmitter = require('events');
const Team = require('../../models/TeamModel');
const Fixture = require('../../models/FixtureModel');
const { LiveMatch } = require('./LiveMatch');
const db = require('../../db/connection');

const {
  TOURNAMENT_STATES,
  SCHEDULE,
  CONTINUOUS_MODE,
  ROUND_NAMES,
  BRACKET_STRUCTURE,
  DEFAULT_RULES
} = require('../constants');

const { BracketManager } = require('./BracketManager');
const { TournamentScheduler } = require('./TournamentScheduler');

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
    this.fixtures = [];
    this.liveMatches = [];
    this.completedResults = [];
    this.scheduledFixtureIds = null;

    // Sub-modules
    this.bracket = new BracketManager();
    this.scheduler = new TournamentScheduler();

    // Timing
    this.roundStartTime = null;
    this.lastTickMinute = null;

    // Results history
    this.winner = null;
    this.runnerUp = null;
    this.lastCompletedTournament = null;
  }

  /**
   * Main tick - called by SimulationLoop every second
   */
  tick(now) {
    if (this.scheduler.forceMode) {
      this._checkForceModeTick();
      return;
    }

    if (this._transitioning) return;

    if (this.state === TOURNAMENT_STATES.IDLE || this.state === TOURNAMENT_STATES.SETUP) {
      return;
    }

    if (this.state === TOURNAMENT_STATES.RESULTS || this.state === TOURNAMENT_STATES.COMPLETE) {
      this._handleComplete();
      if (this.scheduler.continuousMode) {
        console.log(`[TournamentManager] Tournament finished, starting tournament break (continuous mode)`);
        this.state = TOURNAMENT_STATES.TOURNAMENT_BREAK;
        const breakEndTime = this.scheduler.startTournamentBreak(now);
        this.emit('tournament_break_started', {
          tournamentId: this.tournamentId,
          breakEndTime,
          durationMs: SCHEDULE.TOURNAMENT_BREAK_DURATION_MS
        });
      } else {
        console.log(`[TournamentManager] Tournament finished, transitioning to IDLE`);
        this.state = TOURNAMENT_STATES.IDLE;
      }
      return;
    }

    if (this.state === TOURNAMENT_STATES.TOURNAMENT_BREAK) {
      if (this.scheduler.isTournamentBreakOver(now)) {
        console.log(`[TournamentManager] Tournament break ended, starting new tournament`);
        this.scheduler.clearTournamentBreak();
        this._startNewTournamentAfterBreak();
      }
      return;
    }

    if (this.scheduler.isBreakState(this.state)) {
      if (this.scheduler.isBreakOver(now)) {
        this.scheduler.clearBreak();
        this._advanceFromBreak(now);
      }
      return;
    }

    this._checkRoundCompletion(now);
  }

  /**
   * Manually start a new tournament
   */
  async startTournament() {
    if (this.state !== TOURNAMENT_STATES.IDLE && this.state !== TOURNAMENT_STATES.COMPLETE) {
      throw new Error(`Cannot start tournament: already in state ${this.state}`);
    }

    console.log(`[TournamentManager] Starting tournament manually`);

    this._transitioning = true;
    try {
      this.state = TOURNAMENT_STATES.SETUP;
      await this._handleSetup();

      console.log(`[TournamentManager] Setup complete, starting Round of 16`);
      this.state = TOURNAMENT_STATES.ROUND_OF_16;
      await this._startRound('ROUND_OF_16', Date.now());
    } finally {
      this._transitioning = false;
    }

    return {
      tournamentId: this.tournamentId,
      state: this.state,
      teamsCount: this.teams.length
    };
  }

  async _startNewTournamentAfterBreak() {
    this._transitioning = true;
    try {
      this.state = TOURNAMENT_STATES.IDLE;
      await this.startTournament();
      console.log(`[TournamentManager] New tournament started (continuous mode)`);
    } catch (err) {
      console.error(`[TournamentManager] Failed to start new tournament:`, err);
      this.state = TOURNAMENT_STATES.IDLE;
    } finally {
      this._transitioning = false;
    }
  }

  async _checkForceModeTick() {
    if (this._transitioning) return;

    if (this.state === TOURNAMENT_STATES.COMPLETE ||
        this.state === TOURNAMENT_STATES.RESULTS ||
        this.state === TOURNAMENT_STATES.IDLE) {
      this._transitioning = true;
      try {
        console.log(`[TournamentManager] Force mode: starting new tournament from ${this.state}`);
        this.state = TOURNAMENT_STATES.IDLE;
        await this.startTournament();
      } finally {
        this._transitioning = false;
      }
      return;
    }

    if (!this.scheduler.isPlayingRound(this.state)) return;

    const allComplete = this.liveMatches.every(m => m.isFinished());
    if (!allComplete) return;

    const nextState = this.scheduler.getForceNextState(this.state);

    if (nextState) {
      this._transitioning = true;
      try {
        if (nextState === TOURNAMENT_STATES.RESULTS) {
          this.state = nextState;
          await this._handleResults();
        } else {
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

  async _checkRoundCompletion(now) {
    if (!this._allMatchesFinished()) return;
    if (!this.scheduler.isPlayingRound(this.state)) return;

    console.log(`[TournamentManager] All matches complete in ${this.state}`);

    this._transitioning = true;
    try {
      await this._collectWinners();

      this.emit('round_complete', {
        tournamentId: this.tournamentId,
        round: this.currentRoundName,
        winners: this.roundWinners.map(t => ({ id: t.id, name: t.name }))
      });

      const nextBreak = this.scheduler.getNextBreakState(this.state);

      if (nextBreak === TOURNAMENT_STATES.RESULTS) {
        this.state = TOURNAMENT_STATES.RESULTS;
        await this._handleResults();
      } else {
        this.state = nextBreak;
        this.scheduler.startBreak(now);
        console.log(`[TournamentManager] Entering ${nextBreak}, break ends in ${SCHEDULE.BREAK_DURATION_MS}ms`);
      }
    } finally {
      this._transitioning = false;
    }
  }

  async _advanceFromBreak(now) {
    const nextRound = this.scheduler.getNextRoundFromBreak(this.state);

    if (!nextRound) {
      console.error(`[TournamentManager] Unknown break state: ${this.state}`);
      return;
    }

    console.log(`[TournamentManager] Break over, starting ${nextRound}`);

    this._transitioning = true;
    try {
      const nextState = TOURNAMENT_STATES[nextRound];
      this.state = nextState;
      await this._startRound(nextRound, now);
    } finally {
      this._transitioning = false;
    }
  }

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
        console.log(`[TournamentManager] Match ${match.fixtureId} still in progress: ${match.state}`);
        continue;
      }

      const winnerId = match.getWinnerId();
      if (!winnerId) {
        noWinnerCount++;
        console.log(`[TournamentManager] Match ${match.fixtureId} finished but no winnerId`);
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

  // === Setup & Round Management ===

  async _handleSetup() {
    console.log('[TournamentManager] Setting up tournament...');

    this.tournamentId = Date.now() % 1000000000;
    this.roundWinners = [];
    this.completedResults = [];
    this.winner = null;
    this.runnerUp = null;
    this.liveMatches = [];
    this.fixtures = [];
    this.scheduledFixtureIds = null;

    this.teams = await Team.getAll();

    if (this.teams.length < 2) {
      console.error('[TournamentManager] Not enough teams for tournament');
      this.state = TOURNAMENT_STATES.IDLE;
      return;
    }

    const shuffledTeams = this._shuffleTeams(this.teams);
    this.roundWinners = shuffledTeams;

    await this.bracket.generateAllBracketFixtures(shuffledTeams, this.tournamentId);

    this.emit('tournament_setup', {
      tournamentId: this.tournamentId,
      teamCount: this.teams.length,
      bracketGenerated: true
    });

    console.log(`[TournamentManager] Tournament ${this.tournamentId} setup with ${this.teams.length} teams, all bracket fixtures created`);
  }

  async _startRound(roundKey, now) {
    const roundName = ROUND_NAMES[roundKey];
    this.currentRoundName = roundName;

    console.log(`[TournamentManager] Starting ${roundName} with ${this.roundWinners.length} teams`);

    const { fixtures, liveMatches } = await this.bracket.createRoundMatches(
      roundKey, this.tournamentId, this.rules, now
    );

    this.fixtures = fixtures;
    this.liveMatches = liveMatches;
    this.roundStartTime = now;

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

  // === Winner Collection ===

  async _collectWinnersAndAdvance() {
    const winners = [];

    for (const fixture of this.fixtures) {
      if (fixture.isBye) {
        winners.push(fixture.home);
        continue;
      }

      const match = fixture.match;
      if (!match || !match.isFinished()) {
        console.warn(`[TournamentManager] Match ${fixture.fixtureId} not finished! (round=${this.currentRoundName}, matchState=${match?.state})`);
        winners.push(fixture.home);
        if (this.currentRoundName === 'Final' && match) {
          const fallbackWinnerId = fixture.home.id;
          this.completedResults.push({
            fixtureId: fixture.fixtureId,
            bracketSlot: fixture.bracketSlot,
            round: this.currentRoundName,
            home: fixture.home,
            away: fixture.away,
            score: match.getScore ? match.getScore() : { home: 0, away: 0 },
            penaltyScore: match.getPenaltyScore ? match.getPenaltyScore() : { home: 0, away: 0 },
            winnerId: fallbackWinnerId
          });
          console.warn(`[TournamentManager] Added fallback Final result to completedResults`);
        }
        continue;
      }

      const winnerId = match.getWinnerId();
      const winner = winnerId === fixture.home.id ? fixture.home : fixture.away;
      const loser = winnerId === fixture.home.id ? fixture.away : fixture.home;
      winners.push(winner);

      const score = match.getScore();

      try {
        const homeWon = winnerId === fixture.home.id;
        await this._updateRecentForm(fixture.home.id, homeWon);
        await this._updateRecentForm(fixture.away.id, !homeWon);
        await Team.updateHighestRound(loser.id, this.currentRoundName);

        console.log(`[TournamentManager] Updated stats: ${winner.name} beat ${loser.name} ${score.home}-${score.away}, loser highest_round=${this.currentRoundName}`);
      } catch (err) {
        console.error('[TournamentManager] Failed to update team stats:', err.message, err.stack);
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

  async _collectWinners() {
    await this._collectWinnersAndAdvance();
  }

  // === Results ===

  async _handleResults() {
    await this._collectWinners();

    this.emit('round_complete', {
      tournamentId: this.tournamentId,
      round: this.currentRoundName,
      winners: this.roundWinners.map(t => ({ id: t.id, name: t.name }))
    });

    if (this.roundWinners.length === 1) {
      this.winner = this.roundWinners[0];

      const finalResult = this.completedResults.find(r => r.round === 'Final');
      if (finalResult) {
        this.runnerUp = finalResult.winnerId === finalResult.home.id
          ? finalResult.away
          : finalResult.home;
      }

      if (!this.runnerUp && this.fixtures.length === 1) {
        const finalFixture = this.fixtures[0];
        if (finalFixture && this.winner) {
          this.runnerUp = finalFixture.home.id === this.winner.id
            ? finalFixture.away
            : finalFixture.home;
          console.log(`[TournamentManager] Runner-up found via fixture fallback: ${this.runnerUp?.name}`);
        }
      }

      if (!this.winner) {
        console.error(`[TournamentManager] WARNING: No winner found!`);
      }
      if (!this.runnerUp) {
        console.error(`[TournamentManager] WARNING: No runner-up found!`);
      }

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

      this.lastCompletedTournament = {
        tournamentId: this.tournamentId,
        winner: this.winner ? { id: this.winner.id, name: this.winner.name } : null,
        runnerUp: this.runnerUp ? { id: this.runnerUp.id, name: this.runnerUp.name } : null
      };

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

  _handleComplete() {
    this.liveMatches = [];
    this.fixtures = [];
  }

  onMatchesComplete(results) {
    for (const result of results) {
      const fixture = this.fixtures.find(f => f.fixtureId === result.fixtureId);
      if (fixture && fixture.match) {
        fixture.completed = true;
      }
    }

    const allComplete = this.fixtures.every(f =>
      f.isBye || (f.match && f.match.isFinished())
    );

    if (allComplete) {
      console.log('[TournamentManager] All matches in round complete');
    }
  }

  getLiveMatches() {
    return this.liveMatches.filter(m => !m.isFinished());
  }

  // === Recovery ===

  async recover() {
    console.log('[TournamentManager] Checking for recovery...');

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

    const allFixtures = await Fixture.getAll({ tournamentId, limit: 1000 });

    if (allFixtures.length === 0) {
      return false;
    }

    this.tournamentId = tournamentId;

    const roundOrder = ['Round of 16', 'Quarter-finals', 'Semi-finals', 'Final'];

    const byRound = {};
    for (const f of allFixtures) {
      if (!byRound[f.round]) byRound[f.round] = [];
      byRound[f.round].push(f);
    }

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

    this.teams = await Team.getAll();

    this.completedResults = [];
    for (const round of roundOrder) {
      if (round === latestRound) break;
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

    const currentFixtures = byRound[latestRound];
    this.fixtures = [];
    this.liveMatches = [];

    let allCurrentComplete = true;
    let anyLive = false;

    for (const fixture of currentFixtures) {
      const homeTeam = await Team.getRatingById(fixture.homeTeamId);
      const awayTeam = await Team.getRatingById(fixture.awayTeamId);

      let match = null;

      if (fixture.status === 'completed') {
        // Already done
      } else {
        allCurrentComplete = false;
        anyLive = true;

        match = await LiveMatch.recover(
          fixture.fixtureId,
          Date.now(),
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

    if (allCurrentComplete) {
      console.log('[TournamentManager] All matches in round complete. Recovering to BREAK state.');

      this.roundWinners = [];
      for (const fixture of currentFixtures) {
        if (fixture.winnerTeamId) {
          const winner = await Team.getRatingById(fixture.winnerTeamId);
          this.roundWinners.push(winner);
        }
      }

      this.state = TournamentScheduler.roundNameToBreakState(latestRound);

      if (latestRound === 'Final') {
        this.state = TOURNAMENT_STATES.RESULTS;
      }
    } else {
      console.log(`[TournamentManager] Matches in progress (Live: ${anyLive}). Recovering to ${latestRound} state.`);
      this.state = TournamentScheduler.roundNameToState(latestRound);
    }

    console.log(`[TournamentManager] Recovered tournament ${this.tournamentId} in state ${this.state}`);
    return true;
  }

  // === State ===

  getState() {
    return {
      state: this.state,
      tournamentId: this.tournamentId,
      currentRound: this.currentRoundName,
      teamsRemaining: this.roundWinners.length,
      activeMatches: this.liveMatches.length,
      winner: this.winner ? { id: this.winner.id, name: this.winner.name } : null,
      runnerUp: this.runnerUp ? { id: this.runnerUp.id, name: this.runnerUp.name } : null,
      lastCompleted: this.lastCompletedTournament
    };
  }

  // === Admin Controls ===

  async forceStart() {
    if (this.state !== TOURNAMENT_STATES.IDLE && this.state !== TOURNAMENT_STATES.COMPLETE) {
      throw new Error('Tournament already in progress');
    }

    this.scheduler.forceMode = true;

    await this._handleSetup();
    this.state = TOURNAMENT_STATES.SETUP;

    await this._startRound('ROUND_OF_16', Date.now());
    this.state = TOURNAMENT_STATES.ROUND_OF_16;

    return this.getState();
  }

  cancel() {
    this.state = TOURNAMENT_STATES.IDLE;
    this.liveMatches = [];
    this.fixtures = [];
    this.roundWinners = [];
    this.tournamentId = null;

    this.emit('tournament_cancelled', { tournamentId: this.tournamentId });
    console.log('[TournamentManager] Tournament cancelled');
  }

  async skipToRound(targetRound) {
    const validRounds = ['QUARTER_FINALS', 'SEMI_FINALS', 'FINAL'];
    if (!validRounds.includes(targetRound)) {
      throw new Error(`Invalid round: ${targetRound}`);
    }

    if (!this.tournamentId) {
      await this._handleSetup();
    }

    const roundOrder = ['ROUND_OF_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'FINAL'];
    const targetIndex = roundOrder.indexOf(targetRound);

    let teams = this.roundWinners.length > 0 ? this.roundWinners : [...this.teams];

    for (let i = 0; i < targetIndex; i++) {
      teams = teams.slice(0, Math.ceil(teams.length / 2));
    }

    this.roundWinners = this._shuffleTeams(teams);

    await this._startRound(targetRound, Date.now());
    this.state = TOURNAMENT_STATES[targetRound];

    console.log(`[TournamentManager] Skipped to ${targetRound}`);
    return this.getState();
  }

  // === Utility ===

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
  ROUND_NAMES,
  BRACKET_STRUCTURE,
  CONTINUOUS_MODE
};
