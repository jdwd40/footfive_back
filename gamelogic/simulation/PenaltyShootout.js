/**
 * PenaltyShootout - Penalty shootout simulation logic
 * Extracted from LiveMatch to reduce file complexity
 */
const { EVENT_TYPES, SIM } = require('../constants');

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
    this.lastOutcomeMeta = null;
    this.keeperSaveStreak = 0;
  }

  /**
   * Process one tick of the penalty shootout
   * @param {number} tickElapsed - current tick count
   * @param {number} et2End - tick when ET2 ended (for spacing kicks)
   * @returns {{ events: Array, finished: boolean }}
   */
  processTick(tickElapsed, et2End) {
    const events = [];
    const tickOffset = tickElapsed - et2End;

    // One penalty per N ticks (to spread them out), with lead-in and aftermath.
    const modulo = tickOffset % SIM.SHOOTOUT_TICK_INTERVAL;
    if (modulo === SIM.SHOOTOUT_TICK_INTERVAL - 1) {
      events.push(this._createWalkupEvent());
      return { events, finished: false };
    }
    if (modulo === 1 && this.lastOutcomeMeta) {
      events.push(this._createReactionEvent());
      return { events, finished: false };
    }
    if (modulo !== 0) {
      return { events, finished: false };
    }

    const side = this.currentShooter;
    const team = side === 'home' ? this.ctx.homeTeam : this.ctx.awayTeam;
    const players = side === 'home' ? this.ctx.homePlayers : this.ctx.awayPlayers;
    const taker = this._selectScorer(players);

    const kickIndex = this.ctx.shootoutTaken.home + this.ctx.shootoutTaken.away + 1;
    const roundIndex = Math.ceil(kickIndex / 2);
    const isSuddenDeath = roundIndex > SIM.SHOOTOUT_STANDARD_ROUNDS;
    const shootoutRound = isSuddenDeath ? roundIndex - SIM.SHOOTOUT_STANDARD_ROUNDS : roundIndex;
    const mustScore = this._isMustScoreKick(side);
    const decider = this._isDeciderKick(side);
    const pressure = this._calculatePressure({ isSuddenDeath, roundIndex, mustScore, decider });

    const onTarget = Math.random() < SIM.SHOOTOUT_ON_TARGET;
    const saved = onTarget && Math.random() < SIM.SHOOTOUT_SAVE_RATE;
    const scored = onTarget && !saved;

    this.ctx.shootoutTaken[side]++;

    if (scored) {
      this.ctx.shootoutScores[side]++;
      this.keeperSaveStreak = 0;
      events.push(this._createEvent(EVENT_TYPES.SHOOTOUT_GOAL, MATCH_MINUTES_ET_END, {
        teamId: team.id,
        playerId: taker?.playerId,
        displayName: taker?.name,
        description: this._getOutcomeNarration({
          outcome: 'scored',
          teamName: team.name,
          pressure,
          decider,
          mustScore
        }),
        outcome: 'scored',
        round: Math.ceil(this.ctx.shootoutTaken[side]),
        shootoutRound,
        kickIndex,
        kickerTeamId: team.id,
        isSuddenDeath,
        pressure,
        decider,
        mustScore,
        shootoutScore: { ...this.ctx.shootoutScores }
      }));
    } else if (saved) {
      this.keeperSaveStreak++;
      events.push(this._createEvent(EVENT_TYPES.SHOOTOUT_SAVE, MATCH_MINUTES_ET_END, {
        teamId: team.id,
        playerId: taker?.playerId,
        displayName: taker?.name,
        description: this._getOutcomeNarration({
          outcome: 'saved',
          teamName: team.name,
          pressure,
          decider,
          mustScore
        }),
        outcome: 'saved',
        round: Math.ceil(this.ctx.shootoutTaken[side]),
        shootoutRound,
        kickIndex,
        kickerTeamId: team.id,
        isSuddenDeath,
        pressure,
        decider,
        mustScore,
        shootoutScore: { ...this.ctx.shootoutScores }
      }));
    } else {
      this.keeperSaveStreak = 0;
      events.push(this._createEvent(EVENT_TYPES.SHOOTOUT_MISS, MATCH_MINUTES_ET_END, {
        teamId: team.id,
        playerId: taker?.playerId,
        displayName: taker?.name,
        description: this._getOutcomeNarration({
          outcome: 'missed',
          teamName: team.name,
          pressure,
          decider,
          mustScore
        }),
        outcome: 'missed',
        round: Math.ceil(this.ctx.shootoutTaken[side]),
        shootoutRound,
        kickIndex,
        kickerTeamId: team.id,
        isSuddenDeath,
        pressure,
        decider,
        mustScore,
        shootoutScore: { ...this.ctx.shootoutScores }
      }));
    }

    this.lastOutcomeMeta = {
      outcome: scored ? 'scored' : saved ? 'saved' : 'missed',
      teamName: team.name,
      decider
    };

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

  _createWalkupEvent() {
    const side = this.currentShooter;
    const team = side === 'home' ? this.ctx.homeTeam : this.ctx.awayTeam;
    const kickIndex = this.ctx.shootoutTaken.home + this.ctx.shootoutTaken.away + 1;
    const roundIndex = Math.ceil(kickIndex / 2);
    const isSuddenDeath = roundIndex > SIM.SHOOTOUT_STANDARD_ROUNDS;
    const shootoutRound = isSuddenDeath ? roundIndex - SIM.SHOOTOUT_STANDARD_ROUNDS : roundIndex;
    const decider = this._isDeciderKick(side);
    const mustScore = this._isMustScoreKick(side);
    const pressure = this._calculatePressure({ isSuddenDeath, roundIndex, mustScore, decider });

    return this._createEvent(EVENT_TYPES.SHOOTOUT_WALKUP, MATCH_MINUTES_ET_END, {
      teamId: team.id,
      kickIndex,
      shootoutRound,
      kickerTeamId: team.id,
      isSuddenDeath,
      pressure,
      decider,
      mustScore,
      description: decider
        ? `${team.name} walk up for a potential winner.`
        : `Tension builds as ${team.name} prepare their kick.`
    });
  }

  _createReactionEvent() {
    return this._createEvent(EVENT_TYPES.SHOOTOUT_REACTION, MATCH_MINUTES_ET_END, {
      outcome: this.lastOutcomeMeta.outcome,
      decider: this.lastOutcomeMeta.decider,
      description: this.lastOutcomeMeta.decider
        ? `Huge reaction after ${this.lastOutcomeMeta.teamName}'s decisive kick.`
        : `Crowd roars after ${this.lastOutcomeMeta.teamName}'s ${this.lastOutcomeMeta.outcome}.`
    });
  }

  _isMustScoreKick(side) {
    const remainingHome = Math.max(SIM.SHOOTOUT_STANDARD_ROUNDS - this.ctx.shootoutTaken.home, 0);
    const remainingAway = Math.max(SIM.SHOOTOUT_STANDARD_ROUNDS - this.ctx.shootoutTaken.away, 0);
    if (side === 'home') {
      return this.ctx.shootoutScores.home + remainingHome <= this.ctx.shootoutScores.away;
    }
    return this.ctx.shootoutScores.away + remainingAway <= this.ctx.shootoutScores.home;
  }

  _isDeciderKick(side) {
    const scoredScores = { ...this.ctx.shootoutScores };
    const missedScores = { ...this.ctx.shootoutScores };
    scoredScores[side]++;

    const nextTakenScored = { ...this.ctx.shootoutTaken };
    const nextTakenMissed = { ...this.ctx.shootoutTaken };
    nextTakenScored[side]++;
    nextTakenMissed[side]++;

    return this._isTerminalState(scoredScores, nextTakenScored) || this._isTerminalState(missedScores, nextTakenMissed);
  }

  _isTerminalState(scores, taken) {
    const maxTaken = Math.max(taken.home, taken.away);
    const remainingHome = Math.max(SIM.SHOOTOUT_STANDARD_ROUNDS - taken.home, 0);
    const remainingAway = Math.max(SIM.SHOOTOUT_STANDARD_ROUNDS - taken.away, 0);
    if (taken.home === taken.away && maxTaken >= SIM.SHOOTOUT_STANDARD_ROUNDS && scores.home !== scores.away) {
      return true;
    }
    return scores.home > scores.away + remainingAway || scores.away > scores.home + remainingHome;
  }

  _calculatePressure({ isSuddenDeath, roundIndex, mustScore, decider }) {
    let pressure = 0.35 + (roundIndex / (SIM.SHOOTOUT_STANDARD_ROUNDS + 2)) * 0.25;
    if (isSuddenDeath) pressure += 0.2;
    if (mustScore) pressure += 0.2;
    if (decider) pressure += 0.2;
    return Math.min(1, Math.max(0, pressure));
  }

  _getOutcomeNarration({ outcome, teamName, pressure, decider, mustScore }) {
    const highPressure = pressure >= 0.8;
    if (decider && outcome === 'scored') return `Shootout: ${teamName} score the decisive penalty!`;
    if (decider && outcome !== 'scored') return `Shootout: ${teamName} miss a potential decider!`;
    if (mustScore && outcome === 'scored') return `Shootout: ${teamName} keep themselves alive.`;
    if (mustScore && outcome !== 'scored') return `Shootout: ${teamName} fail to convert under must-score pressure.`;
    if (this.keeperSaveStreak >= 2 && outcome === 'saved') return `Shootout: ${teamName} denied again as the keeper stays red-hot.`;
    if (highPressure && outcome === 'scored') return `Shootout: ${teamName} convert under huge pressure.`;
    if (highPressure && outcome !== 'scored') return `Shootout: ${teamName} crack under pressure.`;
    if (outcome === 'saved') return `Shootout: ${teamName} see their kick saved.`;
    if (outcome === 'missed') return `Shootout: ${teamName} miss the target.`;
    return `Shootout: ${teamName} SCORES!`;
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
