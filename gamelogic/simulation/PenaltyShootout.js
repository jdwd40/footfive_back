/**
 * PenaltyShootout - Penalty shootout simulation logic
 * Extracted from LiveMatch to reduce file complexity
 */
const { EVENT_TYPES, MATCH_STATES, SIM } = require('../constants');

class PenaltyShootout {
  /**
   * @param {Object} context - { homeTeam, awayTeam, homePlayers, awayPlayers, score, penaltyScore, shootoutScores, shootoutTaken }
   * @param {Function} createEvent - bound _createEvent from LiveMatch
   * @param {Function} selectScorer - bound _selectScorer from EventGenerator
   */
  constructor(context, createEvent, selectScorer) {
    this.ctx = context;
    this._createEvent = createEvent;
    this._selectScorer = selectScorer;
    this.currentShooter = 'home';
  }

  /**
   * Process one tick of the penalty shootout
   * @param {number} tickElapsed - current tick count
   * @param {number} et2End - tick when ET2 ended (for spacing kicks)
   * @returns {{ events: Array, finished: boolean }}
   */
  processTick(tickElapsed, et2End) {
    const events = [];

    // One penalty per N ticks (to spread them out)
    if ((tickElapsed - et2End) % SIM.SHOOTOUT_TICK_INTERVAL !== 0) {
      return { events, finished: false };
    }

    const side = this.currentShooter;
    const team = side === 'home' ? this.ctx.homeTeam : this.ctx.awayTeam;
    const players = side === 'home' ? this.ctx.homePlayers : this.ctx.awayPlayers;
    const taker = this._selectScorer(players);

    const onTarget = Math.random() < SIM.SHOOTOUT_ON_TARGET;
    const saved = onTarget && Math.random() < SIM.SHOOTOUT_SAVE_RATE;
    const scored = onTarget && !saved;

    this.ctx.shootoutTaken[side]++;

    if (scored) {
      this.ctx.shootoutScores[side]++;
      events.push(this._createEvent(EVENT_TYPES.SHOOTOUT_GOAL, MATCH_MINUTES_ET_END, {
        teamId: team.id,
        playerId: taker?.playerId,
        displayName: taker?.name,
        description: `Shootout: ${team.name} SCORES!`,
        outcome: 'scored',
        round: Math.ceil(this.ctx.shootoutTaken[side]),
        shootoutScore: { ...this.ctx.shootoutScores }
      }));
    } else if (saved) {
      events.push(this._createEvent(EVENT_TYPES.SHOOTOUT_SAVE, MATCH_MINUTES_ET_END, {
        teamId: team.id,
        playerId: taker?.playerId,
        displayName: taker?.name,
        description: `Shootout: ${team.name} SAVED!`,
        outcome: 'saved',
        round: Math.ceil(this.ctx.shootoutTaken[side]),
        shootoutScore: { ...this.ctx.shootoutScores }
      }));
    } else {
      events.push(this._createEvent(EVENT_TYPES.SHOOTOUT_MISS, MATCH_MINUTES_ET_END, {
        teamId: team.id,
        playerId: taker?.playerId,
        displayName: taker?.name,
        description: `Shootout: ${team.name} MISSES!`,
        outcome: 'missed',
        round: Math.ceil(this.ctx.shootoutTaken[side]),
        shootoutScore: { ...this.ctx.shootoutScores }
      }));
    }

    // Switch shooter
    this.currentShooter = side === 'home' ? 'away' : 'home';

    // Check for winner after both teams have taken equal kicks
    const finished = this._checkWinner();

    return { events, finished };
  }

  _checkWinner() {
    if (this.ctx.shootoutTaken.home !== this.ctx.shootoutTaken.away) {
      return false;
    }

    const round = this.ctx.shootoutTaken.home;

    // After 5 rounds each, check for winner
    if (round >= SIM.SHOOTOUT_STANDARD_ROUNDS) {
      if (this.ctx.shootoutScores.home !== this.ctx.shootoutScores.away) {
        this.ctx.penaltyScore.home = this.ctx.shootoutScores.home;
        this.ctx.penaltyScore.away = this.ctx.shootoutScores.away;
        return true;
      }
    }

    // Check for mathematically decided
    const remaining = Math.max(SIM.SHOOTOUT_STANDARD_ROUNDS - round, 0);
    if (Math.abs(this.ctx.shootoutScores.home - this.ctx.shootoutScores.away) > remaining) {
      this.ctx.penaltyScore.home = this.ctx.shootoutScores.home;
      this.ctx.penaltyScore.away = this.ctx.shootoutScores.away;
      return true;
    }

    return false;
  }

  /**
   * Simulate an instant penalty shootout (for forced match endings)
   */
  static simulateInstant(shootoutScores, shootoutTaken, penaltyScore) {
    for (let round = 0; round < SIM.SHOOTOUT_STANDARD_ROUNDS; round++) {
      if (Math.random() < SIM.INSTANT_PENALTY_SUCCESS) {
        shootoutScores.home++;
      }
      shootoutTaken.home++;

      if (Math.random() < SIM.INSTANT_PENALTY_SUCCESS) {
        shootoutScores.away++;
      }
      shootoutTaken.away++;

      const remaining = SIM.SHOOTOUT_STANDARD_ROUNDS - (round + 1);
      if (Math.abs(shootoutScores.home - shootoutScores.away) > remaining) {
        break;
      }
    }

    // Sudden death if still tied
    while (shootoutScores.home === shootoutScores.away) {
      if (Math.random() < SIM.INSTANT_PENALTY_SUCCESS) shootoutScores.home++;
      shootoutTaken.home++;
      if (Math.random() < SIM.INSTANT_PENALTY_SUCCESS) shootoutScores.away++;
      shootoutTaken.away++;
    }

    penaltyScore.home = shootoutScores.home;
    penaltyScore.away = shootoutScores.away;
  }
}

// Use constant for the minute value in shootout events
const MATCH_MINUTES_ET_END = 120;

module.exports = { PenaltyShootout };
