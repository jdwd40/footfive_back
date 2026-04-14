/**
 * TournamentScheduler - Scheduling, continuous mode, timing logic
 * Extracted from TournamentManager to reduce file complexity
 */
const { TOURNAMENT_STATES, SCHEDULE, CONTINUOUS_MODE } = require('../constants');

class TournamentScheduler {
  constructor() {
    this.breakEndTime = null;
    this.tournamentBreakEndTime = null;
    this.continuousMode = CONTINUOUS_MODE;
    this.forceMode = false;
  }

  /**
   * Check if state is a break state
   */
  isBreakState(state) {
    return [
      TOURNAMENT_STATES.QF_BREAK,
      TOURNAMENT_STATES.SF_BREAK,
      TOURNAMENT_STATES.FINAL_BREAK
    ].includes(state);
  }

  /**
   * Get the next break state after a playing round
   */
  getNextBreakState(currentState) {
    const map = {
      [TOURNAMENT_STATES.ROUND_OF_16]: TOURNAMENT_STATES.QF_BREAK,
      [TOURNAMENT_STATES.QUARTER_FINALS]: TOURNAMENT_STATES.SF_BREAK,
      [TOURNAMENT_STATES.SEMI_FINALS]: TOURNAMENT_STATES.FINAL_BREAK,
      [TOURNAMENT_STATES.FINAL]: TOURNAMENT_STATES.RESULTS
    };
    return map[currentState];
  }

  /**
   * Get the next round key from a break state
   */
  getNextRoundFromBreak(breakState) {
    const map = {
      [TOURNAMENT_STATES.QF_BREAK]: 'QUARTER_FINALS',
      [TOURNAMENT_STATES.SF_BREAK]: 'SEMI_FINALS',
      [TOURNAMENT_STATES.FINAL_BREAK]: 'FINAL'
    };
    return map[breakState];
  }

  /**
   * Get the next playing state in force mode
   */
  getForceNextState(currentState) {
    const map = {
      [TOURNAMENT_STATES.ROUND_OF_16]: TOURNAMENT_STATES.QUARTER_FINALS,
      [TOURNAMENT_STATES.QUARTER_FINALS]: TOURNAMENT_STATES.SEMI_FINALS,
      [TOURNAMENT_STATES.SEMI_FINALS]: TOURNAMENT_STATES.FINAL,
      [TOURNAMENT_STATES.FINAL]: TOURNAMENT_STATES.RESULTS
    };
    return map[currentState];
  }

  /**
   * Check if state is a playing round
   */
  isPlayingRound(state) {
    return [
      TOURNAMENT_STATES.ROUND_OF_16,
      TOURNAMENT_STATES.QUARTER_FINALS,
      TOURNAMENT_STATES.SEMI_FINALS,
      TOURNAMENT_STATES.FINAL
    ].includes(state);
  }

  /**
   * Start a break timer
   */
  startBreak(now) {
    this.breakEndTime = now + SCHEDULE.BREAK_DURATION_MS;
    return this.breakEndTime;
  }

  /**
   * Start a tournament break timer
   */
  startTournamentBreak(now) {
    this.tournamentBreakEndTime = now + SCHEDULE.TOURNAMENT_BREAK_DURATION_MS;
    return this.tournamentBreakEndTime;
  }

  /**
   * Check if a break is over
   */
  isBreakOver(now) {
    return this.breakEndTime && now >= this.breakEndTime;
  }

  /**
   * Check if a tournament break is over
   */
  isTournamentBreakOver(now) {
    return this.tournamentBreakEndTime && now >= this.tournamentBreakEndTime;
  }

  /**
   * Clear break timer
   */
  clearBreak() {
    this.breakEndTime = null;
  }

  /**
   * Clear tournament break timer
   */
  clearTournamentBreak() {
    this.tournamentBreakEndTime = null;
  }

  /**
   * Map round name to tournament state
   */
  static roundNameToState(roundName) {
    const map = {
      'Round of 16': TOURNAMENT_STATES.ROUND_OF_16,
      'Quarter-finals': TOURNAMENT_STATES.QUARTER_FINALS,
      'Semi-finals': TOURNAMENT_STATES.SEMI_FINALS,
      'Final': TOURNAMENT_STATES.FINAL
    };
    return map[roundName] || TOURNAMENT_STATES.IDLE;
  }

  /**
   * Map round name to break state
   */
  static roundNameToBreakState(roundName) {
    const map = {
      'Round of 16': TOURNAMENT_STATES.QF_BREAK,
      'Quarter-finals': TOURNAMENT_STATES.SF_BREAK,
      'Semi-finals': TOURNAMENT_STATES.FINAL_BREAK,
      'Final': TOURNAMENT_STATES.RESULTS
    };
    return map[roundName] || TOURNAMENT_STATES.IDLE;
  }
}

module.exports = { TournamentScheduler };
