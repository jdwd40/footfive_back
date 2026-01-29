/**
 * Shared constants for the game simulation system
 * Centralizes duplicated values from LiveMatch, TournamentManager, and SimulationEngine
 */

// === Match States ===
const MATCH_STATES = {
  SCHEDULED: 'SCHEDULED',
  FIRST_HALF: 'FIRST_HALF',
  HALFTIME: 'HALFTIME',
  SECOND_HALF: 'SECOND_HALF',
  EXTRA_TIME_1: 'EXTRA_TIME_1',
  ET_HALFTIME: 'ET_HALFTIME',
  EXTRA_TIME_2: 'EXTRA_TIME_2',
  PENALTIES: 'PENALTIES',
  FINISHED: 'FINISHED'
};

// === Event Types ===
const EVENT_TYPES = {
  MATCH_START: 'match_start',
  KICKOFF: 'kickoff',
  GOAL: 'goal',
  SHOT_SAVED: 'shot_saved',
  SHOT_MISSED: 'shot_missed',
  SHOT_BLOCKED: 'shot_blocked',
  PENALTY_AWARDED: 'penalty_awarded',
  PENALTY_SCORED: 'penalty_scored',
  PENALTY_MISSED: 'penalty_missed',
  PENALTY_SAVED: 'penalty_saved',
  CORNER: 'corner',
  FOUL: 'foul',
  YELLOW_CARD: 'yellow_card',
  RED_CARD: 'red_card',
  HALFTIME: 'halftime',
  SECOND_HALF_START: 'second_half_start',
  FULLTIME: 'fulltime',
  EXTRA_TIME_START: 'extra_time_start',
  EXTRA_TIME_HALF: 'extra_time_half',
  EXTRA_TIME_END: 'extra_time_end',
  SHOOTOUT_START: 'shootout_start',
  SHOOTOUT_GOAL: 'shootout_goal',
  SHOOTOUT_MISS: 'shootout_miss',
  SHOOTOUT_SAVE: 'shootout_save',
  SHOOTOUT_END: 'shootout_end',
  MATCH_END: 'match_end',
  // Legacy SimulationEngine types
  PRESSURE: 'pressure',
  BLOCKED: 'blocked'
};

// Key events that should be emitted even during fast-forward
const KEY_EVENTS = new Set([
  EVENT_TYPES.GOAL,
  EVENT_TYPES.PENALTY_SCORED,
  EVENT_TYPES.HALFTIME,
  EVENT_TYPES.SECOND_HALF_START,
  EVENT_TYPES.FULLTIME,
  EVENT_TYPES.EXTRA_TIME_START,
  EVENT_TYPES.EXTRA_TIME_HALF,
  EVENT_TYPES.EXTRA_TIME_END,
  EVENT_TYPES.SHOOTOUT_START,
  EVENT_TYPES.SHOOTOUT_GOAL,
  EVENT_TYPES.SHOOTOUT_MISS,
  EVENT_TYPES.SHOOTOUT_SAVE,
  EVENT_TYPES.SHOOTOUT_END,
  EVENT_TYPES.MATCH_END
]);

// === Default Match Rules ===
const DEFAULT_RULES = {
  knockout: true,
  halfDurationMs: 240000,      // 4 min real = 45 match minutes
  halftimeDurationMs: 60000,   // 1 min real
  extraTimeEnabled: true,
  etHalfDurationMs: 120000,    // 2 min real = 15 match minutes
  etHalftimeMs: 30000,         // 30s real
  penaltiesEnabled: true
};

// === Bracket Structure ===
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

// === Tournament States ===
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
  COMPLETE: 'COMPLETE',
  TOURNAMENT_BREAK: 'TOURNAMENT_BREAK'
};

// === Tournament Scheduling ===
const SCHEDULE = {
  BREAK_DURATION_MS: 5 * 60 * 1000,          // 5 minutes between rounds
  TOURNAMENT_BREAK_DURATION_MS: 2 * 60 * 1000 // 2 minutes between tournaments in continuous mode
};

const CONTINUOUS_MODE = true;

const ROUND_NAMES = {
  ROUND_OF_16: 'Round of 16',
  QUARTER_FINALS: 'Quarter-finals',
  SEMI_FINALS: 'Semi-finals',
  FINAL: 'Final'
};

// === Match Minute Thresholds ===
const MATCH_MINUTES = {
  FIRST_HALF_END: 45,
  SECOND_HALF_START: 46,
  SECOND_HALF_END: 90,
  ET_FIRST_HALF_START: 91,
  ET_FIRST_HALF_END: 105,
  ET_SECOND_HALF_START: 106,
  ET_SECOND_HALF_END: 120
};

// === Simulation Probabilities ===
const SIM = {
  FOUL_CHANCE: 0.05,
  ON_TARGET_CHANCE: 0.6,
  CORNER_ON_BLOCK_CHANCE: 0.3,
  CORNER_ON_SAVE_CHANCE: 0.4,
  SOLO_GOAL_CHANCE: 0.3,
  BASE_PENALTY_CHANCE: 0.04,
  HIGH_PRESSURE_PENALTY_CHANCE: 0.08,
  PENALTY_XG: 0.76,
  SHOOTOUT_ON_TARGET: 0.85,
  SHOOTOUT_SAVE_RATE: 0.12,
  YELLOW_CARD_THRESHOLD: 0.17,
  RED_CARD_THRESHOLD: 0.02,
  SHOOTOUT_TICK_INTERVAL: 3,
  SHOOTOUT_STANDARD_ROUNDS: 5,
  INSTANT_PENALTY_SUCCESS: 0.75
};

module.exports = {
  MATCH_STATES,
  EVENT_TYPES,
  KEY_EVENTS,
  DEFAULT_RULES,
  BRACKET_STRUCTURE,
  TOURNAMENT_STATES,
  SCHEDULE,
  CONTINUOUS_MODE,
  ROUND_NAMES,
  MATCH_MINUTES,
  SIM
};
