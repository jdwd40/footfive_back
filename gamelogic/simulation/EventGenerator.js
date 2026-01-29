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
  }

  simulateMinute(minute) {
    const events = [];

    if (Math.random() < SIM.FOUL_CHANCE) {
      const foulEvents = this._handleFoul(minute);
      events.push(...foulEvents);
    }

    const homeAttackChance = this.ctx.homeTeam.attackRating / 200;
    const awayAttackChance = this.ctx.awayTeam.attackRating / 200;

    if (Math.random() < homeAttackChance) {
      const attackEvents = this._handleAttack(this.ctx.homeTeam, this.ctx.awayTeam, 'home', minute);
      events.push(...attackEvents);
    } else if (Math.random() < awayAttackChance) {
      const attackEvents = this._handleAttack(this.ctx.awayTeam, this.ctx.homeTeam, 'away', minute);
      events.push(...attackEvents);
    }

    return events;
  }

  _handleAttack(attackingTeam, defendingTeam, side, minute) {
    const events = [];
    const bundleId = this._generateBundleId('attack', minute);

    if (this._defenseBlocks(defendingTeam)) {
      const cornerAwarded = Math.random() < SIM.CORNER_ON_BLOCK_CHANCE;
      if (cornerAwarded) {
        this.ctx.stats[side].corners++;
        events.push(this._createEvent(EVENT_TYPES.CORNER, minute, {
          teamId: attackingTeam.id,
          description: `Corner to ${attackingTeam.name}. Good defensive work from ${defendingTeam.name}.`,
          outcome: 'corner',
          bundleId
        }));
      }
      return events;
    }

    const pressureLevel = this._calculatePressure(attackingTeam, defendingTeam);
    const penaltyChance = pressureLevel === 'high' ? SIM.HIGH_PRESSURE_PENALTY_CHANCE : SIM.BASE_PENALTY_CHANCE;

    if (Math.random() < penaltyChance) {
      return this._handlePenalty(attackingTeam, defendingTeam, side, minute, bundleId);
    }

    return this._handleShot(attackingTeam, defendingTeam, side, minute, bundleId);
  }

  _handleShot(attackingTeam, defendingTeam, side, minute, bundleId) {
    const events = [];
    const players = side === 'home' ? this.ctx.homePlayers : this.ctx.awayPlayers;

    this.ctx.stats[side].shots++;

    const baseXg = 0.08 + Math.random() * 0.12;
    const pressureMod = this._calculatePressure(attackingTeam, defendingTeam) === 'high' ? 1.3 : 1.0;
    const xg = Math.min(0.80, baseXg * pressureMod);
    this.ctx.stats[side].xg += xg;

    if (Math.random() < SIM.ON_TARGET_CHANCE) {
      this.ctx.stats[side].shotsOnTarget++;
      const shooter = this._selectScorer(players);

      if (!this._goalkeeperSaves(defendingTeam)) {
        this.ctx.score[side]++;
        const assister = this._selectAssister(players, shooter?.playerId);

        events.push(this._createEvent(EVENT_TYPES.GOAL, minute, {
          teamId: attackingTeam.id,
          playerId: shooter?.playerId,
          displayName: shooter?.name,
          assistPlayerId: assister?.playerId,
          assistName: assister?.name,
          description: assister
            ? `GOAL! ${shooter?.name || attackingTeam.name} scores! Assisted by ${assister.name}.`
            : `GOAL! ${shooter?.name || attackingTeam.name} finds the net for ${attackingTeam.name}!`,
          xg,
          outcome: 'scored',
          bundleId
        }));

        this._persistScore();
      } else {
        const cornerAwarded = Math.random() < SIM.CORNER_ON_SAVE_CHANCE;
        if (cornerAwarded) this.ctx.stats[side].corners++;

        events.push(this._createEvent(EVENT_TYPES.SHOT_SAVED, minute, {
          teamId: attackingTeam.id,
          playerId: shooter?.playerId,
          displayName: shooter?.name,
          description: cornerAwarded
            ? `Save! ${defendingTeam.name} keeper denies ${shooter?.name || attackingTeam.name}. Corner to ${attackingTeam.name}.`
            : `Save! Good stop by the ${defendingTeam.name} goalkeeper from ${shooter?.name || attackingTeam.name}'s effort.`,
          xg,
          outcome: 'saved',
          bundleId,
          cornerAwarded
        }));
      }
    } else {
      const shooter = this._selectScorer(players);
      events.push(this._createEvent(EVENT_TYPES.SHOT_MISSED, minute, {
        teamId: attackingTeam.id,
        playerId: shooter?.playerId,
        displayName: shooter?.name,
        description: this._getMissDescription(shooter?.name, attackingTeam.name),
        xg,
        outcome: 'missed',
        bundleId
      }));
    }

    return events;
  }

  _handlePenalty(attackingTeam, defendingTeam, side, minute, bundleId) {
    const events = [];
    const players = side === 'home' ? this.ctx.homePlayers : this.ctx.awayPlayers;

    this.ctx.stats[side].shots++;
    this.ctx.stats[side].xg += SIM.PENALTY_XG;

    const outcome = this._determinePenaltyOutcome(defendingTeam);
    const taker = this._selectScorer(players);

    if (outcome === 'scored') {
      this.ctx.score[side]++;
      this.ctx.stats[side].shotsOnTarget++;

      events.push(this._createEvent(EVENT_TYPES.PENALTY_SCORED, minute, {
        teamId: attackingTeam.id,
        playerId: taker?.playerId,
        displayName: taker?.name,
        description: `PENALTY GOAL! ${attackingTeam.name}`,
        xg: SIM.PENALTY_XG,
        outcome: 'scored',
        bundleId
      }));

      this._persistScore();
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

    const cardRoll = Math.random();
    if (cardRoll < SIM.RED_CARD_THRESHOLD) {
      this.ctx.stats[side].redCards++;
    } else if (cardRoll < SIM.YELLOW_CARD_THRESHOLD) {
      this.ctx.stats[side].yellowCards++;
    }

    const fouler = this._selectScorer(players);

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
    return Math.random() < team.defenseRating / 110;
  }

  _goalkeeperSaves(team) {
    return Math.random() < team.goalkeeperRating / 90;
  }

  _calculatePressure(attacking, defending) {
    const diff = attacking.attackRating - defending.defenseRating;
    if (diff >= 15) return 'high';
    if (diff >= 5) return 'medium';
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
