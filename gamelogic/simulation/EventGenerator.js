/**
 * EventGenerator - Goal/card/foul/corner event generation logic
 * Extracted from LiveMatch to reduce file complexity
 */
const { EVENT_TYPES, SIM } = require('../constants');

class EventGenerator {
  /**
   * @param {Object} context - { homeTeam, awayTeam, homePlayers, awayPlayers, stats, score, possessionTicks }
   * @param {Function} createEvent - bound _createEvent from LiveMatch
   * @param {Function} persistScore - bound _persistScore from LiveMatch
   */
  constructor(context, createEvent, persistScore) {
    this.ctx = context;
    this._createEvent = createEvent;
    this._persistScore = persistScore;
    this.bundleCounter = 0;
    this.phaseState = {
      momentum: { home: 0, away: 0 },
      fieldZone: 50,
      possessionSide: null,
      possessionState: 'neutral',
      sustainedPressure: { home: 0, away: 0 }
    };
  }

  simulateMinute(minute) {
    const events = [];
    this._decayMomentum();

    if (Math.random() < SIM.FOUL_CHANCE) {
      const foulEvents = this._handleFoul(minute);
      events.push(...foulEvents);
    }

    const sequenceContext = this._resolveSequenceContext();
    const homeAttackChance = this._attackChanceFor('home', sequenceContext);
    const awayAttackChance = this._attackChanceFor('away', sequenceContext);

    if (Math.random() < homeAttackChance) {
      const attackEvents = this._handleAttack(this.ctx.homeTeam, this.ctx.awayTeam, 'home', minute, sequenceContext);
      events.push(...attackEvents);
    } else if (Math.random() < awayAttackChance) {
      const attackEvents = this._handleAttack(this.ctx.awayTeam, this.ctx.homeTeam, 'away', minute, sequenceContext);
      events.push(...attackEvents);
    } else if (sequenceContext.possessionState === 'build_up' && Math.random() < 0.25) {
      const quietSide = sequenceContext.possessionSide;
      const team = quietSide === 'home' ? this.ctx.homeTeam : this.ctx.awayTeam;
      const bundleId = this._generateBundleId('possession', minute);
      events.push(this._createEvent(EVENT_TYPES.POSSESSION_PLAY, minute, {
        teamId: team.id,
        description: `${team.name} are enjoying a spell of possession in midfield.`,
        bundleId,
        bundleStep: 1,
        tags: ['buildUp', 'midfieldControl'],
        narrative: `${team.name} circulate possession and probe for openings.`,
        momentumSnapshot: { ...this.phaseState.momentum },
        fieldZone: sequenceContext.startZone
      }));
    }

    return events;
  }

  _handleAttack(attackingTeam, defendingTeam, side, minute, sequenceContext) {
    const events = [];
    const bundleId = this._generateBundleId('attack', minute);
    const startStep = 1;
    const startZone = sequenceContext.startZone;

    if (sequenceContext.emitBuildUp) {
      events.push(this._createEvent(EVENT_TYPES.BUILD_UP_PLAY, minute, {
        teamId: attackingTeam.id,
        description: `${attackingTeam.name} work it out from the back with patience.`,
        bundleId,
        bundleStep: startStep,
        tags: ['buildUp'],
        narrative: `${attackingTeam.name} build from deep and invite pressure.`,
        fieldZone: startZone,
        possessionState: sequenceContext.possessionState
      }));

      events.push(this._createEvent(EVENT_TYPES.BALL_PROGRESSION, minute, {
        teamId: attackingTeam.id,
        description: `${attackingTeam.name} progress through midfield with purpose.`,
        bundleId,
        bundleStep: startStep + 1,
        tags: ['buildUp', 'progression'],
        narrative: `${attackingTeam.name} break midfield lines and push into the final third.`,
        fieldZone: Math.min(100, startZone + 20),
        possessionState: 'dangerous'
      }));
    }

    if (this._defenseBlocks(defendingTeam, side)) {
      const cornerAwarded = Math.random() < SIM.CORNER_ON_BLOCK_CHANCE;
      if (cornerAwarded) {
        this.ctx.stats[side].corners++;
        events.push(this._createEvent(EVENT_TYPES.CORNER, minute, {
          teamId: attackingTeam.id,
          description: `Corner to ${attackingTeam.name}. Good defensive work from ${defendingTeam.name}.`,
          outcome: 'corner',
          bundleId,
          bundleStep: sequenceContext.emitBuildUp ? startStep + 2 : startStep,
          tags: ['defensiveStand'],
          narrative: `${defendingTeam.name} get bodies behind the ball and force a corner.`,
          momentumSnapshot: { ...this.phaseState.momentum },
          fieldZone: Math.min(100, startZone + 25)
        }));
      }
      this._updateMomentum(side, 'blocked');
      return events;
    }

    const pressureLevel = this._calculatePressure(attackingTeam, defendingTeam, side);
    const penaltyChance = pressureLevel === 'high' ? SIM.HIGH_PRESSURE_PENALTY_CHANCE : SIM.BASE_PENALTY_CHANCE;
    this._updatePressure(side, sequenceContext.startZone);

    if (Math.random() < penaltyChance) {
      return this._handlePenalty(attackingTeam, defendingTeam, side, minute, bundleId, sequenceContext.emitBuildUp ? startStep + 2 : startStep);
    }

    return this._handleShot(attackingTeam, defendingTeam, side, minute, bundleId, sequenceContext.emitBuildUp ? startStep + 2 : startStep, pressureLevel, sequenceContext);
  }

  _handleShot(attackingTeam, defendingTeam, side, minute, bundleId, bundleStep, pressureLevel, sequenceContext) {
    const events = [];
    const players = side === 'home' ? this.ctx.homePlayers : this.ctx.awayPlayers;

    this.ctx.stats[side].shots++;

    const baseXg = 0.08 + Math.random() * 0.12;
    const pressureMod = pressureLevel === 'high' ? 1.3 : 1.0;
    const sustainedPressureBonus = Math.min(0.12, this.phaseState.sustainedPressure[side] * 0.02);
    const xg = Math.min(0.80, baseXg * pressureMod);
    const adjustedXg = Math.min(0.85, xg + sustainedPressureBonus);
    this.ctx.stats[side].xg += adjustedXg;

    if (Math.random() < SIM.ON_TARGET_CHANCE) {
      this.ctx.stats[side].shotsOnTarget++;
      const shooter = this._selectScorer(players);

      if (!this._goalkeeperSaves(defendingTeam)) {
        this.ctx.score[side]++;
        const assister = this._selectAssister(players, shooter?.playerId);
        this._updateMomentum(side, 'goal');

        events.push(this._createEvent(EVENT_TYPES.GOAL, minute, {
          teamId: attackingTeam.id,
          playerId: shooter?.playerId,
          displayName: shooter?.name,
          assistPlayerId: assister?.playerId,
          assistName: assister?.name,
          description: assister
            ? `GOAL! ${shooter?.name || attackingTeam.name} scores! Assisted by ${assister.name}.`
            : `GOAL! ${shooter?.name || attackingTeam.name} finds the net for ${attackingTeam.name}!`,
          xg: adjustedXg,
          outcome: 'scored',
          bundleId,
          bundleStep,
          tags: ['finalThird', 'shot'],
          narrative: `${attackingTeam.name} turn pressure into a clinical finish.`,
          possessionState: sequenceContext.possessionState,
          fieldZone: Math.min(100, sequenceContext.startZone + 30),
          momentumSnapshot: { ...this.phaseState.momentum }
        }));

        this._persistScore();
      } else {
        const cornerAwarded = Math.random() < SIM.CORNER_ON_SAVE_CHANCE;
        if (cornerAwarded) this.ctx.stats[side].corners++;
        this._updateMomentum(side, 'saved');

        events.push(this._createEvent(EVENT_TYPES.SHOT_SAVED, minute, {
          teamId: attackingTeam.id,
          playerId: shooter?.playerId,
          displayName: shooter?.name,
          description: cornerAwarded
            ? `Save! ${defendingTeam.name} keeper denies ${shooter?.name || attackingTeam.name}. Corner to ${attackingTeam.name}.`
            : `Save! Good stop by the ${defendingTeam.name} goalkeeper from ${shooter?.name || attackingTeam.name}'s effort.`,
          xg: adjustedXg,
          outcome: 'saved',
          bundleId,
          bundleStep,
          cornerAwarded,
          tags: ['finalThird', 'shot'],
          narrative: `${defendingTeam.name} survive under heavy pressure.`,
          possessionState: sequenceContext.possessionState,
          fieldZone: Math.min(100, sequenceContext.startZone + 30),
          momentumSnapshot: { ...this.phaseState.momentum }
        }));

        if (adjustedXg >= SIM.BIG_CHANCE_XG) {
          events.push(this._createEvent(EVENT_TYPES.CHANCE_CREATED, minute, {
            teamId: attackingTeam.id,
            playerId: shooter?.playerId,
            displayName: shooter?.name,
            description: `Big chance for ${attackingTeam.name} denied by a save.`,
            xg: adjustedXg,
            outcome: 'saved',
            bundleId,
            bundleStep: bundleStep + 1,
            tags: ['dangerousAttack'],
            narrative: `${attackingTeam.name} carve out a high-value chance.`,
            possessionState: sequenceContext.possessionState,
            fieldZone: Math.min(100, sequenceContext.startZone + 30)
          }));
        }
      }
    } else {
      const shooter = this._selectScorer(players);
      this._updateMomentum(side, 'missed');
      events.push(this._createEvent(EVENT_TYPES.SHOT_MISSED, minute, {
        teamId: attackingTeam.id,
        playerId: shooter?.playerId,
        displayName: shooter?.name,
        description: this._getMissDescription(shooter?.name, attackingTeam.name),
        xg: adjustedXg,
        outcome: 'missed',
        bundleId,
        bundleStep,
        tags: ['finalThird', 'shot'],
        narrative: `${attackingTeam.name} work the opening but fail to hit the target.`,
        possessionState: sequenceContext.possessionState,
        fieldZone: Math.min(100, sequenceContext.startZone + 30),
        momentumSnapshot: { ...this.phaseState.momentum }
      }));

      if (adjustedXg >= SIM.BIG_CHANCE_XG) {
        events.push(this._createEvent(EVENT_TYPES.CHANCE_CREATED, minute, {
          teamId: attackingTeam.id,
          playerId: shooter?.playerId,
          displayName: shooter?.name,
          description: `Big chance for ${attackingTeam.name} goes begging.`,
          xg: adjustedXg,
          outcome: 'missed',
          bundleId,
          bundleStep: bundleStep + 1,
          tags: ['dangerousAttack'],
          narrative: `${attackingTeam.name} create quality but cannot convert.`,
          possessionState: sequenceContext.possessionState,
          fieldZone: Math.min(100, sequenceContext.startZone + 30)
        }));
      }
    }

    return events;
  }

  _handlePenalty(attackingTeam, defendingTeam, side, minute, bundleId, bundleStep) {
    const events = [];
    const players = side === 'home' ? this.ctx.homePlayers : this.ctx.awayPlayers;

    this.ctx.stats[side].shots++;
    this.ctx.stats[side].xg += SIM.PENALTY_XG;

    const outcome = this._determinePenaltyOutcome(defendingTeam);
    const taker = this._selectScorer(players);

    if (outcome === 'scored') {
      this.ctx.score[side]++;
      this.ctx.stats[side].shotsOnTarget++;
      this._updateMomentum(side, 'goal');

      events.push(this._createEvent(EVENT_TYPES.PENALTY_SCORED, minute, {
        teamId: attackingTeam.id,
        playerId: taker?.playerId,
        displayName: taker?.name,
        description: `PENALTY GOAL! ${attackingTeam.name}`,
        xg: SIM.PENALTY_XG,
        outcome: 'scored',
        bundleId,
        bundleStep,
        tags: ['setPiece', 'penalty'],
        narrative: `${attackingTeam.name} keep composure from the spot.`,
        momentumSnapshot: { ...this.phaseState.momentum }
      }));

      this._persistScore();
    } else if (outcome === 'saved') {
      this.ctx.stats[side].shotsOnTarget++;
      this._updateMomentum(side, 'saved');
      events.push(this._createEvent(EVENT_TYPES.PENALTY_SAVED, minute, {
        teamId: attackingTeam.id,
        playerId: taker?.playerId,
        displayName: taker?.name,
        description: `Penalty saved! ${defendingTeam.name} keep it out.`,
        xg: SIM.PENALTY_XG,
        outcome: 'saved',
        bundleId,
        bundleStep,
        tags: ['setPiece', 'penalty'],
        narrative: `${defendingTeam.name} produce a huge stop from the spot.`,
        momentumSnapshot: { ...this.phaseState.momentum }
      }));
    } else {
      this._updateMomentum(side, 'missed');
      events.push(this._createEvent(EVENT_TYPES.PENALTY_MISSED, minute, {
        teamId: attackingTeam.id,
        playerId: taker?.playerId,
        displayName: taker?.name,
        description: `Penalty missed by ${taker?.name || attackingTeam.name}.`,
        xg: SIM.PENALTY_XG,
        outcome: 'missed',
        bundleId,
        bundleStep,
        tags: ['setPiece', 'penalty'],
        narrative: `${attackingTeam.name} squander the opportunity from the spot.`,
        momentumSnapshot: { ...this.phaseState.momentum }
      }));
    }

    return events;
  }

  _handleFoul(minute) {
    const events = [];
    const isHomeFoul = Math.random() < 0.5;
    const side = isHomeFoul ? 'home' : 'away';
    const team = isHomeFoul ? this.ctx.homeTeam : this.ctx.awayTeam;
    const opposingTeam = isHomeFoul ? this.ctx.awayTeam : this.ctx.homeTeam;
    const players = isHomeFoul ? this.ctx.homePlayers : this.ctx.awayPlayers;

    this.ctx.stats[side].fouls++;
    this._updateMomentum(side, 'foulWon');

    const fouler = this._selectScorer(players);
    const cardRoll = Math.random();
    if (cardRoll < SIM.RED_CARD_THRESHOLD) {
      this.ctx.stats[side].redCards++;
      events.push(this._createEvent(EVENT_TYPES.RED_CARD, minute, {
        teamId: team.id,
        playerId: fouler?.playerId,
        displayName: fouler?.name,
        description: `Red card shown to ${fouler?.name || team.name}.`,
        outcome: 'red_card'
      }));
    } else if (cardRoll < SIM.YELLOW_CARD_THRESHOLD) {
      this.ctx.stats[side].yellowCards++;
      events.push(this._createEvent(EVENT_TYPES.YELLOW_CARD, minute, {
        teamId: team.id,
        playerId: fouler?.playerId,
        displayName: fouler?.name,
        description: `Yellow card shown to ${fouler?.name || team.name}.`,
        outcome: 'yellow_card'
      }));
    }

    events.push(this._createEvent(EVENT_TYPES.FOUL, minute, {
      teamId: team.id,
      playerId: fouler?.playerId,
      displayName: fouler?.name,
      description: this._getFoulDescription(fouler?.name, team.name, opposingTeam.name),
      outcome: 'foul'
    }));

    return events;
  }

  // === Helper Methods ===

  _defenseBlocks(team) {
    const defendingSide = team.id === this.ctx.homeTeam.id ? 'home' : 'away';
    const blockBonus = Math.max(-0.08, Math.min(0.08, (this.phaseState.momentum[defendingSide] || 0) / 1200));
    return Math.random() < Math.min(0.92, team.defenseRating / 110 + blockBonus);
  }

  _goalkeeperSaves(team) {
    const defendingSide = team.id === this.ctx.homeTeam.id ? 'home' : 'away';
    const saveBonus = Math.max(-0.07, Math.min(0.07, (this.phaseState.momentum[defendingSide] || 0) / 1500));
    return Math.random() < Math.min(0.95, team.goalkeeperRating / 90 + saveBonus);
  }

  _calculatePressure(attacking, defending, attackingSide) {
    const diff = attacking.attackRating - defending.defenseRating;
    const momentum = this.phaseState.momentum[attackingSide] || 0;
    const pressureScore = diff + momentum / 6 + this.phaseState.sustainedPressure[attackingSide] * 2;
    if (pressureScore >= 15) return 'high';
    if (pressureScore >= 5) return 'medium';
    return 'low';
  }

  _determinePenaltyOutcome(defendingTeam) {
    if (Math.random() < 0.7) {
      if (Math.random() < defendingTeam.goalkeeperRating / 120) return 'saved';
      return 'scored';
    }
    return 'missed';
  }

  _selectScorer(players) {
    const outfield = players.filter(p => !p.isGoalkeeper);
    if (!outfield.length) return null;

    const totalAttack = outfield.reduce((sum, p) => sum + p.attack, 0);
    let rand = Math.random() * totalAttack;

    for (const player of outfield) {
      rand -= player.attack;
      if (rand <= 0) return player;
    }
    return outfield[0];
  }

  _selectAssister(players, scorerId) {
    const candidates = players.filter(p => !p.isGoalkeeper && p.playerId !== scorerId);
    if (!candidates.length || Math.random() < SIM.SOLO_GOAL_CHANCE) return null;

    const totalAttack = candidates.reduce((sum, p) => sum + p.attack, 0);
    let rand = Math.random() * totalAttack;

    for (const player of candidates) {
      rand -= player.attack;
      if (rand <= 0) return player;
    }
    return candidates[0];
  }

  _generateBundleId(eventType, minute) {
    this.bundleCounter++;
    return `${eventType}_${minute}_${this.bundleCounter}`;
  }

  _resolveSequenceContext() {
    const homeWeight = this.ctx.homeTeam.attackRating + Math.max(0, this.phaseState.momentum.home);
    const awayWeight = this.ctx.awayTeam.attackRating + Math.max(0, this.phaseState.momentum.away);
    const total = Math.max(1, homeWeight + awayWeight);
    const possessionSide = Math.random() < (homeWeight / total) ? 'home' : 'away';
    const momentum = this.phaseState.momentum[possessionSide];
    const baseZone = possessionSide === 'home' ? 50 : 50;
    const startZone = Math.max(20, Math.min(85, Math.round(baseZone + momentum * 0.25)));
    const possessionState = startZone >= 65 ? 'dangerous' : 'build_up';
    const emitBuildUp = possessionState === 'build_up' || Math.random() < 0.35;

    this.phaseState.possessionSide = possessionSide;
    this.phaseState.possessionState = possessionState;
    this.phaseState.fieldZone = startZone;

    return {
      possessionSide,
      possessionState,
      startZone,
      emitBuildUp
    };
  }

  _attackChanceFor(side, sequenceContext) {
    const baseChance = side === 'home'
      ? this.ctx.homeTeam.attackRating / 200
      : this.ctx.awayTeam.attackRating / 200;
    const momentumBonus = Math.max(-0.12, Math.min(0.18, this.phaseState.momentum[side] / 450));
    const possessionBonus = sequenceContext.possessionSide === side ? 0.08 : -0.05;
    return Math.max(0.05, Math.min(0.95, baseChance + momentumBonus + possessionBonus));
  }

  _decayMomentum() {
    this.phaseState.momentum.home = Math.round(this.phaseState.momentum.home * 0.88);
    this.phaseState.momentum.away = Math.round(this.phaseState.momentum.away * 0.88);
  }

  _updateMomentum(side, outcome) {
    const other = side === 'home' ? 'away' : 'home';
    const swings = {
      goal: 18,
      saved: -5,
      missed: -7,
      blocked: -4,
      foulWon: 3
    };
    const swing = swings[outcome] || 0;
    this.phaseState.momentum[side] = this._clampMomentum(this.phaseState.momentum[side] + swing);
    this.phaseState.momentum[other] = this._clampMomentum(this.phaseState.momentum[other] - Math.round(swing * 0.6));
  }

  _updatePressure(side, zone) {
    const other = side === 'home' ? 'away' : 'home';
    if (zone >= 60) {
      this.phaseState.sustainedPressure[side] = Math.min(6, this.phaseState.sustainedPressure[side] + 1);
      this.phaseState.sustainedPressure[other] = Math.max(0, this.phaseState.sustainedPressure[other] - 1);
    } else {
      this.phaseState.sustainedPressure[side] = Math.max(0, this.phaseState.sustainedPressure[side] - 1);
    }
  }

  _clampMomentum(value) {
    return Math.max(-100, Math.min(100, value));
  }

  _getMissDescription(playerName, teamName) {
    const descriptions = [
      `${playerName || teamName} fires wide of the target.`,
      `Shot from ${playerName || teamName} goes over the bar.`,
      `${playerName || teamName} pulls the shot wide. Close!`,
      `Effort from ${playerName || teamName} sails over the crossbar.`,
      `${playerName || teamName} drags the shot wide of the post.`
    ];
    return descriptions[Math.floor(Math.random() * descriptions.length)];
  }

  _getFoulDescription(playerName, teamName, opposingTeam) {
    const descriptions = [
      `Foul by ${playerName || teamName}. Free kick to ${opposingTeam}.`,
      `${playerName || teamName} brings down the opponent. Free kick awarded.`,
      `${opposingTeam} win a free kick after a challenge from ${playerName || teamName}.`,
      `The referee blows for a foul by ${playerName || teamName}.`,
      `Free kick to ${opposingTeam} after ${playerName || teamName}'s challenge.`
    ];
    return descriptions[Math.floor(Math.random() * descriptions.length)];
  }

  trackPossession() {
    const homeChance = this.ctx.homeTeam.attackRating / (this.ctx.homeTeam.attackRating + this.ctx.awayTeam.attackRating);
    if (Math.random() < homeChance) {
      this.ctx.possessionTicks.home++;
    } else {
      this.ctx.possessionTicks.away++;
    }
  }
}

module.exports = { EventGenerator };
