/**
 * PenaltyShootout - Penalty shootout simulation logic
 * Extracted from LiveMatch to reduce file complexity
 *
 * Stage F: each shootout kick is now its own display chain.
 *   shootout_walkup → shootout_goal/save/miss → (optional) shootout_reaction
 *
 * Chain metadata (chain_type: "shootout", bundleId, bundleStep, chain_terminal,
 * pacing) is stamped on every event in the kick. Reactions are gated on
 * "important" kicks (decider / must-score / keeper streak / sudden death)
 * so the feed isn't spammed with one after every routine kick.
 *
 * Shootout scoring, taker tracking, sudden death, and winner logic are
 * untouched — chain metadata is display-only.
 */
const { EVENT_TYPES, SIM, CHAIN_PACING } = require('../constants');

class PenaltyShootout {
  /**
   * @param {Object} context - { fixtureId, homeTeam, awayTeam, homePlayers, awayPlayers, score, penaltyScore, shootoutScores, shootoutTaken }
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
    // Stage F: per-kick chain bookkeeping.
    this.bundleCounter = 0;
    this.currentKickBundleId = null;
    this.currentKickStep = 0;
    this.pendingTaker = null; // taker picked at walkup-time so the name carries through to the result
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
    if (modulo === 1 && this.lastOutcomeMeta && this._shouldEmitReaction(this.lastOutcomeMeta)) {
      events.push(this._createReactionEvent());
      // Reaction terminates the previous kick's chain — clear it so the
      // next walkup starts a fresh bundle.
      this._closeKickBundle();
      this.lastOutcomeMeta = null;
      return { events, finished: false };
    }
    if (modulo !== 0) {
      return { events, finished: false };
    }

    const side = this.currentShooter;
    const team = side === 'home' ? this.ctx.homeTeam : this.ctx.awayTeam;
    const players = side === 'home' ? this.ctx.homePlayers : this.ctx.awayPlayers;
    // Use the taker we picked at walkup-time if available, so the player
    // name printed on the walkup also appears on the result.
    const taker = this.pendingTaker && this.pendingTaker.side === side
      ? this.pendingTaker.player
      : this._selectScorer(players);
    this.pendingTaker = null;

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
    } else if (saved) {
      this.keeperSaveStreak++;
    } else {
      this.keeperSaveStreak = 0;
    }

    const outcome = scored ? 'scored' : saved ? 'saved' : 'missed';
    const eventType = scored
      ? EVENT_TYPES.SHOOTOUT_GOAL
      : saved
        ? EVENT_TYPES.SHOOTOUT_SAVE
        : EVENT_TYPES.SHOOTOUT_MISS;

    // If no walkup ran for this kick (kick 1 on the first shootout tick),
    // open a bundle here so the result still has a bundleId/step.
    if (!this.currentKickBundleId) {
      this._startKickBundle(roundIndex);
    }

    const outcomeMeta = {
      outcome,
      teamName: team.name,
      decider,
      mustScore,
      isSuddenDeath,
      pressure,
      keeperSaveStreak: this.keeperSaveStreak
    };
    const willReact = this._shouldEmitReaction(outcomeMeta);

    events.push(this._createEvent(eventType, MATCH_MINUTES_ET_END, {
      teamId: team.id,
      playerId: taker?.playerId,
      displayName: taker?.name,
      description: this._buildOutcomeDescription({
        taker,
        teamName: team.name,
        outcome,
        decider,
        mustScore,
        pressure
      }),
      outcome,
      round: Math.ceil(this.ctx.shootoutTaken[side]),
      shootoutRound,
      kickIndex,
      kickerTeamId: team.id,
      isSuddenDeath,
      pressure,
      decider,
      mustScore,
      shootoutScore: { ...this.ctx.shootoutScores },
      // Running shootout total under the canonical name so scoreboards can
      // apply it directly; shootoutScore stays for backwards compatibility.
      penaltyScore: { ...this.ctx.shootoutScores },
      bundleId: this.currentKickBundleId,
      bundleStep: this._nextStep(),
      chain_type: 'shootout',
      chain_terminal: !willReact,
      pacing: { ...CHAIN_PACING.shootout_terminal },
      narrative: this._getOutcomeNarration({
        outcome,
        teamName: team.name,
        pressure,
        decider,
        mustScore
      })
    }));

    this.lastOutcomeMeta = outcomeMeta;

    if (!willReact) {
      // No reaction will follow — close the bundle so the next walkup
      // starts cleanly.
      this._closeKickBundle();
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

  _createWalkupEvent() {
    const side = this.currentShooter;
    const team = side === 'home' ? this.ctx.homeTeam : this.ctx.awayTeam;
    const players = side === 'home' ? this.ctx.homePlayers : this.ctx.awayPlayers;
    const kickIndex = this.ctx.shootoutTaken.home + this.ctx.shootoutTaken.away + 1;
    const roundIndex = Math.ceil(kickIndex / 2);
    const isSuddenDeath = roundIndex > SIM.SHOOTOUT_STANDARD_ROUNDS;
    const shootoutRound = isSuddenDeath ? roundIndex - SIM.SHOOTOUT_STANDARD_ROUNDS : roundIndex;
    const decider = this._isDeciderKick(side);
    const mustScore = this._isMustScoreKick(side);
    const pressure = this._calculatePressure({ isSuddenDeath, roundIndex, mustScore, decider });

    // Stage F: open the kick's chain bundle and pin the taker so the name
    // printed on the walkup also appears on the result event.
    this._startKickBundle(roundIndex);
    const taker = this._selectScorer(players);
    this.pendingTaker = { side, player: taker };

    const playerName = taker?.name || `${team.name} taker`;

    return this._createEvent(EVENT_TYPES.SHOOTOUT_WALKUP, MATCH_MINUTES_ET_END, {
      teamId: team.id,
      playerId: taker?.playerId,
      displayName: taker?.name,
      kickIndex,
      shootoutRound,
      kickerTeamId: team.id,
      isSuddenDeath,
      pressure,
      decider,
      mustScore,
      // Running total before this kick is taken.
      penaltyScore: { ...this.ctx.shootoutScores },
      description: `${playerName} walks up for ${team.name}.`,
      bundleId: this.currentKickBundleId,
      bundleStep: this._nextStep(),
      chain_type: 'shootout',
      chain_terminal: false,
      pacing: { ...CHAIN_PACING.shootout_walkup },
      narrative: decider
        ? `${team.name} walk up for a potential winner.`
        : `Tension builds as ${team.name} prepare their kick.`
    });
  }

  _createReactionEvent() {
    const meta = this.lastOutcomeMeta;
    return this._createEvent(EVENT_TYPES.SHOOTOUT_REACTION, MATCH_MINUTES_ET_END, {
      outcome: meta.outcome,
      decider: meta.decider,
      mustScore: meta.mustScore,
      // Running total after the kick this reaction follows — keeps a paced
      // scoreboard in sync even when the reaction is the last revealed item.
      penaltyScore: { ...this.ctx.shootoutScores },
      description: this._buildReactionDescription(meta),
      bundleId: this.currentKickBundleId,
      bundleStep: this._nextStep(),
      chain_type: 'shootout',
      chain_terminal: true,
      pacing: { ...CHAIN_PACING.shootout_reaction },
      narrative: meta.decider
        ? `Huge reaction after ${meta.teamName}'s decisive kick.`
        : `Crowd reacts to ${meta.teamName}'s ${meta.outcome}.`
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

  /**
   * Stage F: gate reactions so the feed isn't spammed after every kick.
   * Reactions only fire after kicks that genuinely shift the narrative:
   * deciders, must-score kicks, the keeper's streak hitting 2+, or a
   * sudden-death kick of any outcome.
   */
  _shouldEmitReaction(meta) {
    if (!meta) return false;
    if (meta.decider) return true;
    if (meta.mustScore) return true;
    if (meta.isSuddenDeath) return true;
    if (meta.outcome === 'saved' && meta.keeperSaveStreak >= 2) return true;
    return false;
  }

  _buildOutcomeDescription({ taker, teamName, outcome, decider, mustScore }) {
    const playerName = taker?.name || `${teamName} taker`;
    const lead = `${playerName} takes the penalty`;
    if (outcome === 'scored') {
      if (decider) return `${lead}... and SCORES! ${teamName} land the decisive penalty.`;
      if (mustScore) return `${lead}... and SCORES under pressure to keep ${teamName} alive.`;
      return `${lead}... and SCORES for ${teamName}!`;
    }
    if (outcome === 'saved') {
      if (this.keeperSaveStreak >= 2) return `${lead}... but the keeper SAVES — denied again!`;
      return `${lead}... but the keeper SAVES it.`;
    }
    if (decider) return `${lead}... and misses — a huge chance gone for ${teamName}.`;
    return `${lead}... and misses the target.`;
  }

  _buildReactionDescription(meta) {
    const { teamName, outcome, decider, mustScore } = meta;
    if (decider && outcome === 'scored') return `${teamName} edge ahead in the shootout.`;
    if (decider) return `${teamName}'s decider goes begging.`;
    if (mustScore && outcome === 'scored') return `${teamName} stay alive.`;
    if (mustScore) return `Pressure tells — ${teamName} cannot find the net.`;
    if (outcome === 'saved' && this.keeperSaveStreak >= 2) return `The keeper is unstoppable right now.`;
    if (meta.isSuddenDeath) return `One kick could decide it now.`;
    return `The pressure shifts back to ${teamName}.`;
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

  // === Chain helpers (Stage F) ===

  _startKickBundle(roundIndex) {
    this.bundleCounter++;
    const fixtureId = this.ctx.fixtureId ?? 0;
    this.currentKickBundleId = `shootout_${fixtureId}_${roundIndex}_${this.bundleCounter}`;
    this.currentKickStep = 0;
  }

  _nextStep() {
    return this.currentKickStep++;
  }

  _closeKickBundle() {
    this.currentKickBundleId = null;
    this.currentKickStep = 0;
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
