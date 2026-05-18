/**
 * EventGenerator - Goal/card/foul/corner event generation logic
 * Extracted from LiveMatch to reduce file complexity
 *
 * Stage C: attack/counter/midfield flow chains. Emitters stamp chain metadata
 * (chain_type, chain_terminal, pacing) on each chained event. The pipeline
 * splats payload top-level keys into metadata JSONB (see EventBus), so
 * `chain_type` / `chain_terminal` / `pacing` flow through unchanged. Reserved
 * payload keys (`score`, `shootoutScore`, `round`, `seq`) are stomped by the
 * pipeline and must not be reused for chain data.
 */
const { EVENT_TYPES, SIM, CHAIN_PACING } = require('../constants');

class EventGenerator {
  /**
   * @param {Object} context - { fixtureId, homeTeam, awayTeam, homePlayers, awayPlayers, stats, score, possessionTicks }
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
    // Stage C: throttle midfield_battle so it doesn't fire every match minute.
    this.lastMidfieldEmittedMinute = -Infinity;
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
      const quietEvents = this._maybeEmitMidfieldBattle(minute, sequenceContext);
      events.push(...quietEvents);
    }

    return events;
  }

  _handleAttack(attackingTeam, defendingTeam, side, minute, sequenceContext) {
    const events = [];
    const startZone = sequenceContext.startZone;
    const defenseBlocked = this._defenseBlocks(defendingTeam, side);

    // Stage C: settle the penalty diversion *before* we emit any chain step.
    // A penalty branch returns a clean legacy event (no bundleId, bundleStep,
    // chain_type, chain_terminal, or pacing), so we can't have already
    // committed to a partial attack chain when the diversion happens.
    // Penalty chains arrive in Stage D.
    let pressureLevel = null;
    if (!defenseBlocked) {
      pressureLevel = this._calculatePressure(attackingTeam, defendingTeam, side);
      const penaltyChance = pressureLevel === 'high' ? SIM.HIGH_PRESSURE_PENALTY_CHANCE : SIM.BASE_PENALTY_CHANCE;
      this._updatePressure(side, startZone);
      if (Math.random() < penaltyChance) {
        return this._handlePenalty(attackingTeam, defendingTeam, side, minute);
      }
    }

    const bundleId = this._generateChainBundleId('attack', minute);
    let step = 0;

    // Optional midfield_battle opener. Throttled so attacks don't always
    // start with one; satisfies "only when it starts a meaningful flow chain".
    if (this._shouldOpenWithMidfield(minute)) {
      this.lastMidfieldEmittedMinute = minute;
      events.push(this._createEvent(EVENT_TYPES.MIDFIELD_BATTLE, minute, {
        teamId: attackingTeam.id,
        description: `${attackingTeam.name} tussle for control in midfield.`,
        bundleId,
        bundleStep: step++,
        chain_type: 'attack',
        chain_terminal: false,
        pacing: { ...CHAIN_PACING.midfield_battle },
        tags: ['midfield', 'attackOpen'],
        narrative: `${attackingTeam.name} win the second ball and look forward.`,
        momentumSnapshot: { ...this.phaseState.momentum },
        fieldZone: Math.max(35, startZone - 10),
        possessionState: 'neutral'
      }));
    }

    if (sequenceContext.emitBuildUp) {
      events.push(this._createEvent(EVENT_TYPES.GOAL_BUILD_UP, minute, {
        teamId: attackingTeam.id,
        description: `${attackingTeam.name} push forward with intent.`,
        bundleId,
        bundleStep: step++,
        chain_type: 'attack',
        chain_terminal: false,
        pacing: { ...CHAIN_PACING.goal_build_up },
        phase: 'push_forward',
        tags: ['buildUp'],
        narrative: `${attackingTeam.name} build from deep and invite pressure.`,
        fieldZone: startZone,
        possessionState: sequenceContext.possessionState
      }));

      events.push(this._createEvent(EVENT_TYPES.GOAL_BUILD_UP, minute, {
        teamId: attackingTeam.id,
        description: `${attackingTeam.name} beat a defender to break into the final third.`,
        bundleId,
        bundleStep: step++,
        chain_type: 'attack',
        chain_terminal: false,
        pacing: { ...CHAIN_PACING.goal_build_up },
        phase: 'beat_defender',
        tags: ['buildUp', 'progression'],
        narrative: `${attackingTeam.name} break midfield lines and push into the final third.`,
        fieldZone: Math.min(100, startZone + 20),
        possessionState: 'dangerous'
      }));
    }

    if (defenseBlocked) {
      const reason = Math.random() < 0.5 ? 'defender_block' : 'shut_down';
      const cornerAwarded = Math.random() < SIM.CORNER_ON_BLOCK_CHANCE;
      if (cornerAwarded) this.ctx.stats[side].corners++;
      this._updateMomentum(side, 'blocked');

      events.push(this._createEvent(EVENT_TYPES.ATTACK_BREAKDOWN, minute, {
        teamId: defendingTeam.id,
        description: `${defendingTeam.name} shut down ${attackingTeam.name}'s attack.`,
        bundleId,
        bundleStep: step++,
        chain_type: 'attack',
        chain_terminal: true,
        pacing: { ...CHAIN_PACING.attack_breakdown },
        reason,
        outcome: 'breakdown',
        cornerAwarded,
        tags: ['defensiveStand'],
        narrative: `${defendingTeam.name} get bodies behind the ball and force a turnover.`,
        momentumSnapshot: { ...this.phaseState.momentum },
        fieldZone: Math.min(100, startZone + 25)
      }));

      if (cornerAwarded) {
        // Corner is bookkeeping for the defensive stand; keep it as a
        // standalone event outside the attack chain so the chain has one
        // terminal step.
        events.push(this._createEvent(EVENT_TYPES.CORNER, minute, {
          teamId: attackingTeam.id,
          description: `Corner to ${attackingTeam.name}.`,
          outcome: 'corner',
          tags: ['defensiveStand'],
          narrative: `${defendingTeam.name} concede a corner in the process.`,
          momentumSnapshot: { ...this.phaseState.momentum },
          fieldZone: Math.min(100, startZone + 25)
        }));
      }

      if (Math.random() < SIM.COUNTER_AFTER_BREAKDOWN_CHANCE) {
        const counterSide = side === 'home' ? 'away' : 'home';
        events.push(...this._runCounterChain(defendingTeam, attackingTeam, counterSide, minute));
      }

      return events;
    }

    events.push(...this._handleShot(
      attackingTeam, defendingTeam, side, minute, bundleId, step, pressureLevel, sequenceContext,
      { chainType: 'attack' }
    ));
    return events;
  }

  _handleShot(attackingTeam, defendingTeam, side, minute, bundleId, bundleStep, pressureLevel, sequenceContext, chainCtx = null) {
    const events = [];
    const players = side === 'home' ? this.ctx.homePlayers : this.ctx.awayPlayers;

    this.ctx.stats[side].shots++;

    const baseXg = 0.08 + Math.random() * 0.12;
    const pressureMod = pressureLevel === 'high' ? 1.3 : 1.0;
    const sustainedPressureBonus = Math.min(0.12, this.phaseState.sustainedPressure[side] * 0.02);
    const xg = Math.min(0.80, baseXg * pressureMod);
    const adjustedXg = Math.min(0.85, xg + sustainedPressureBonus);
    this.ctx.stats[side].xg += adjustedXg;

    const chainTerminal = chainCtx
      ? { chain_type: chainCtx.chainType, chain_terminal: true, pacing: { ...CHAIN_PACING.shot_terminal } }
      : null;
    const goalTerminal = chainCtx
      ? { chain_type: chainCtx.chainType, chain_terminal: true, pacing: { ...CHAIN_PACING.goal_terminal } }
      : null;

    // Stage C: small chance shot is physically blocked before keeper involvement.
    if (Math.random() < SIM.SHOT_BLOCKED_CHANCE) {
      const shooter = this._selectScorer(players);
      this._updateMomentum(side, 'blocked');
      events.push(this._createEvent(EVENT_TYPES.SHOT_BLOCKED, minute, {
        teamId: attackingTeam.id,
        playerId: shooter?.playerId,
        displayName: shooter?.name,
        description: `Shot from ${shooter?.name || attackingTeam.name} is blocked by a ${defendingTeam.name} defender.`,
        xg: adjustedXg,
        outcome: 'blocked',
        bundleId,
        bundleStep,
        tags: ['finalThird', 'shot', 'defensiveStand'],
        narrative: `${defendingTeam.name} get a vital block in.`,
        possessionState: sequenceContext.possessionState,
        fieldZone: Math.min(100, sequenceContext.startZone + 30),
        momentumSnapshot: { ...this.phaseState.momentum },
        ...(chainTerminal || {})
      }));
      return events;
    }

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
          momentumSnapshot: { ...this.phaseState.momentum },
          ...(goalTerminal || {})
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
          momentumSnapshot: { ...this.phaseState.momentum },
          ...(chainTerminal || {})
        }));

        if (adjustedXg >= SIM.BIG_CHANCE_XG) {
          // CHANCE_CREATED is a colour event; keep it out of the chain so the
          // chain has exactly one terminal step.
          events.push(this._createEvent(EVENT_TYPES.CHANCE_CREATED, minute, {
            teamId: attackingTeam.id,
            playerId: shooter?.playerId,
            displayName: shooter?.name,
            description: `Big chance for ${attackingTeam.name} denied by a save.`,
            xg: adjustedXg,
            outcome: 'saved',
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
        momentumSnapshot: { ...this.phaseState.momentum },
        ...(chainTerminal || {})
      }));

      if (adjustedXg >= SIM.BIG_CHANCE_XG) {
        events.push(this._createEvent(EVENT_TYPES.CHANCE_CREATED, minute, {
          teamId: attackingTeam.id,
          playerId: shooter?.playerId,
          displayName: shooter?.name,
          description: `Big chance for ${attackingTeam.name} goes begging.`,
          xg: adjustedXg,
          outcome: 'missed',
          tags: ['dangerousAttack'],
          narrative: `${attackingTeam.name} create quality but cannot convert.`,
          possessionState: sequenceContext.possessionState,
          fieldZone: Math.min(100, sequenceContext.startZone + 30)
        }));
      }
    }

    return events;
  }

  _runCounterChain(attackingTeam, defendingTeam, side, minute) {
    const events = [];
    const bundleId = this._generateChainBundleId('counter', minute);
    let step = 0;

    events.push(this._createEvent(EVENT_TYPES.COUNTER_ATTACK, minute, {
      teamId: attackingTeam.id,
      description: `${attackingTeam.name} break on the counter!`,
      bundleId,
      bundleStep: step++,
      chain_type: 'counter',
      chain_terminal: false,
      pacing: { ...CHAIN_PACING.counter_attack },
      tags: ['counter', 'attack'],
      narrative: `${attackingTeam.name} pour forward in transition.`,
      momentumSnapshot: { ...this.phaseState.momentum },
      fieldZone: 70,
      possessionState: 'dangerous'
    }));

    if (this._defenseBlocks(defendingTeam, side)) {
      this._updateMomentum(side, 'blocked');
      events.push(this._createEvent(EVENT_TYPES.COUNTER_BREAKDOWN, minute, {
        teamId: defendingTeam.id,
        description: `${defendingTeam.name} recover and snuff out the counter.`,
        bundleId,
        bundleStep: step++,
        chain_type: 'counter',
        chain_terminal: true,
        pacing: { ...CHAIN_PACING.counter_breakdown },
        reason: 'recovered',
        outcome: 'breakdown',
        tags: ['counter', 'defence'],
        narrative: `${defendingTeam.name} get back in numbers to extinguish the threat.`,
        momentumSnapshot: { ...this.phaseState.momentum },
        fieldZone: 60
      }));
      return events;
    }

    const pressureLevel = this._calculatePressure(attackingTeam, defendingTeam, side);
    events.push(...this._handleShot(
      attackingTeam, defendingTeam, side, minute, bundleId, step, pressureLevel,
      { startZone: 75, possessionState: 'dangerous' },
      { chainType: 'counter' }
    ));
    return events;
  }

  _maybeEmitMidfieldBattle(minute, sequenceContext) {
    if (minute - this.lastMidfieldEmittedMinute < SIM.MIDFIELD_BATTLE_COOLDOWN_MIN) {
      return [];
    }
    this.lastMidfieldEmittedMinute = minute;

    const events = [];
    const subjectSide = sequenceContext.possessionSide || 'home';
    const team = subjectSide === 'home' ? this.ctx.homeTeam : this.ctx.awayTeam;
    const otherTeam = subjectSide === 'home' ? this.ctx.awayTeam : this.ctx.homeTeam;
    const bundleId = this._generateChainBundleId('midfield', minute);

    events.push(this._createEvent(EVENT_TYPES.MIDFIELD_BATTLE, minute, {
      teamId: team.id,
      description: `${team.name} and ${otherTeam.name} battle for control in midfield.`,
      bundleId,
      bundleStep: 0,
      chain_type: 'midfield',
      chain_terminal: true,
      pacing: { ...CHAIN_PACING.midfield_battle },
      tags: ['midfield'],
      narrative: `${team.name} look to assert themselves in midfield.`,
      momentumSnapshot: { ...this.phaseState.momentum },
      fieldZone: sequenceContext.startZone
    }));

    // Variety: occasionally a midfield battle springs a counter for the
    // opposing side.
    if (Math.random() < SIM.COUNTER_FROM_MIDFIELD_CHANCE) {
      const counterSide = subjectSide === 'home' ? 'away' : 'home';
      events.push(...this._runCounterChain(otherTeam, team, counterSide, minute));
    }

    return events;
  }

  _shouldOpenWithMidfield(minute) {
    if (minute - this.lastMidfieldEmittedMinute < SIM.MIDFIELD_BATTLE_COOLDOWN_MIN) return false;
    return Math.random() < SIM.ATTACK_OPEN_WITH_MIDFIELD_CHANCE;
  }

  /**
   * Stage C: penalty path emits a single legacy event with no chain
   * metadata at all (no bundleId / bundleStep / chain_type / chain_terminal /
   * pacing). Penalty chains are Stage D.
   */
  _handlePenalty(attackingTeam, defendingTeam, side, minute) {
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

  /**
   * Stage C: readable chain bundle id. Format `<chainType>_<fixtureId>_<minute>_<seq>`,
   * kept well under VARCHAR(50). Falls back when fixtureId is unset (unit
   * tests with bare contexts) so the helper is safe outside LiveMatch.
   */
  _generateChainBundleId(chainType, minute) {
    this.bundleCounter++;
    const fixtureId = this.ctx.fixtureId ?? 0;
    return `${chainType}_${fixtureId}_${minute}_${this.bundleCounter}`;
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
