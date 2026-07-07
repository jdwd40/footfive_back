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
const { EVENT_TYPES, SIM, CHAIN_PACING, MATCH_MINUTES } = require('../constants');

// Stage E: in-match goals that land on the very last minute of a half don't
// get a kickoff_restart, because the half-time / full-time / extra-time
// transition will already be the next emitted event. Anything that isn't
// one of these is mid-play and the match continues.
const PERIOD_END_MINUTES = new Set([
  MATCH_MINUTES.FIRST_HALF_END,    // 45  → halftime imminent
  MATCH_MINUTES.SECOND_HALF_END,   // 90  → fulltime (or ET start)
  MATCH_MINUTES.ET_FIRST_HALF_END, // 105 → ET halftime
  MATCH_MINUTES.ET_SECOND_HALF_END // 120 → match end (or shootout)
]);

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
      const cornerAwarded = Math.random() < SIM.CORNER_ON_BLOCK_CHANCE;
      this._updateMomentum(side, 'blocked');

      if (cornerAwarded) {
        // Issue 1: a corner won off a defensive block must NOT be preceded by
        // a possession-loss / "attack breaks down" event for the attacking
        // team — that reads as a turnover immediately before they are handed a
        // corner. Emit a coherent force → block → corner sequence instead:
        //   <attack> force the issue   (build-up, non-terminal)
        //   <defence> block it behind  (defensive_action, chain terminal)
        //   Corner kick to <attack>    (standalone bookkeeping, no chain meta)
        // The block-behind is a defensive event, not a turnover, so the corner
        // that follows is consistent. No counter springs from a conceded
        // corner — the attacking side keep the ball for the set piece.
        this.ctx.stats[side].corners++;

        events.push(this._createEvent(EVENT_TYPES.GOAL_BUILD_UP, minute, {
          teamId: attackingTeam.id,
          description: `${attackingTeam.name} force the issue.`,
          bundleId,
          bundleStep: step++,
          chain_type: 'attack',
          chain_terminal: false,
          pacing: { ...CHAIN_PACING.goal_build_up },
          phase: 'force_issue',
          tags: ['buildUp', 'pressure'],
          narrative: `${attackingTeam.name} pile on the pressure in the final third.`,
          fieldZone: Math.min(100, startZone + 25),
          possessionState: 'dangerous'
        }));

        events.push(this._createEvent(EVENT_TYPES.DEFENSIVE_ACTION, minute, {
          teamId: defendingTeam.id,
          description: `${defendingTeam.name} block it behind.`,
          bundleId,
          bundleStep: step++,
          chain_type: 'attack',
          chain_terminal: true,
          pacing: { ...CHAIN_PACING.attack_breakdown },
          reason: 'blocked_behind',
          outcome: 'block',
          cornerConceded: true,
          tags: ['defensiveStand'],
          narrative: `${defendingTeam.name} throw a body in the way to concede a corner.`,
          momentumSnapshot: { ...this.phaseState.momentum },
          fieldZone: Math.min(100, startZone + 25)
        }));

        events.push(this._createEvent(EVENT_TYPES.CORNER, minute, {
          teamId: attackingTeam.id,
          description: `Corner kick to ${attackingTeam.name}.`,
          outcome: 'corner',
          tags: ['setPiece'],
          narrative: `${attackingTeam.name} have a corner to attack.`,
          momentumSnapshot: { ...this.phaseState.momentum },
          fieldZone: Math.min(100, startZone + 25)
        }));

        return events;
      }

      // No corner: a genuine turnover. Keep the normal attack breakdown and
      // the counter that may spring from it.
      const reason = Math.random() < 0.5 ? 'defender_block' : 'shut_down';
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
        cornerAwarded: false,
        tags: ['defensiveStand'],
        narrative: `${defendingTeam.name} get bodies behind the ball and force a turnover.`,
        momentumSnapshot: { ...this.phaseState.momentum },
        fieldZone: Math.min(100, startZone + 25)
      }));

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

    // Issue 2: pick the shooter once so the shot build-up and the result name
    // the same player, and so the build-up can be emitted before whichever
    // result branch we take.
    const shooter = this._selectScorer(players);

    const baseXg = 0.08 + Math.random() * 0.12;
    const pressureMod = pressureLevel === 'high' ? 1.3 : 1.0;
    const sustainedPressureBonus = Math.min(0.12, this.phaseState.sustainedPressure[side] * 0.02);
    const xg = Math.min(0.80, baseXg * pressureMod);
    const adjustedXg = Math.min(0.85, xg + sustainedPressureBonus);
    this.ctx.stats[side].xg += adjustedXg;

    // Step bookkeeping: the build-up takes the caller's bundleStep and the
    // result event follows on the next step, keeping the chain monotonic.
    let step = bundleStep;
    const chainStep = chainCtx ? { chain_type: chainCtx.chainType } : {};

    // Issue 2: shot build-up immediately before the result. Always a
    // non-terminal chain step and never mutates the score — it is emitted
    // before any score change below, so its score snapshot is the pre-shot
    // score. Reuses goal_build_up (already in the live stream) so existing
    // frontends keep rendering it.
    events.push(this._createEvent(EVENT_TYPES.GOAL_BUILD_UP, minute, {
      teamId: attackingTeam.id,
      playerId: shooter?.playerId,
      displayName: shooter?.name,
      description: this._getShotBuildUpDescription(shooter?.name, attackingTeam.name),
      bundleId,
      bundleStep: step++,
      ...chainStep,
      ...(chainCtx ? { chain_terminal: false } : {}),
      pacing: { ...CHAIN_PACING.goal_build_up },
      phase: 'shot_attempt',
      tags: ['finalThird', 'shot', 'shotAttempt'],
      narrative: `${attackingTeam.name} work a shooting chance.`,
      possessionState: sequenceContext.possessionState,
      fieldZone: Math.min(100, sequenceContext.startZone + 28)
    }));

    const chainTerminal = chainCtx
      ? { chain_type: chainCtx.chainType, chain_terminal: true, pacing: { ...CHAIN_PACING.shot_terminal } }
      : null;
    const goalTerminal = chainCtx
      ? { chain_type: chainCtx.chainType, chain_terminal: true, pacing: { ...CHAIN_PACING.goal_terminal } }
      : null;

    // Stage C: small chance shot is physically blocked before keeper involvement.
    if (Math.random() < SIM.SHOT_BLOCKED_CHANCE) {
      this._updateMomentum(side, 'blocked');
      events.push(this._createEvent(EVENT_TYPES.SHOT_BLOCKED, minute, {
        teamId: attackingTeam.id,
        playerId: shooter?.playerId,
        displayName: shooter?.name,
        description: `Shot from ${shooter?.name || attackingTeam.name} is blocked by a ${defendingTeam.name} defender.`,
        xg: adjustedXg,
        outcome: 'blocked',
        bundleId,
        bundleStep: step,
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
          bundleStep: step,
          tags: ['finalThird', 'shot'],
          narrative: `${attackingTeam.name} turn pressure into a clinical finish.`,
          possessionState: sequenceContext.possessionState,
          fieldZone: Math.min(100, sequenceContext.startZone + 30),
          momentumSnapshot: { ...this.phaseState.momentum },
          ...(goalTerminal || {})
        }));

        this._persistScore();

        // Stage E: restart from the halfway spot, suppressed at period ends.
        events.push(...this._buildKickoffRestart(defendingTeam, minute));
      } else {
        const cornerAwarded = Math.random() < SIM.CORNER_ON_SAVE_CHANCE;
        if (cornerAwarded) this.ctx.stats[side].corners++;
        this._updateMomentum(side, 'saved');

        events.push(this._createEvent(EVENT_TYPES.SHOT_SAVED, minute, {
          teamId: attackingTeam.id,
          playerId: shooter?.playerId,
          displayName: shooter?.name,
          description: cornerAwarded
            ? `Save! ${defendingTeam.name} keeper denies ${shooter?.name || attackingTeam.name}. Corner kick to ${attackingTeam.name}.`
            : `Save! Good stop by the ${defendingTeam.name} goalkeeper from ${shooter?.name || attackingTeam.name}'s effort.`,
          xg: adjustedXg,
          outcome: 'saved',
          bundleId,
          bundleStep: step,
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
      this._updateMomentum(side, 'missed');
      // Issue 3: vary the missed-shot message (incl. "hit the post"). The post
      // is still a miss — type stays shot_missed, score is untouched. The
      // chosen variant is surfaced in metadata so the FE can optionally flavour
      // a post differently while still treating it as a miss.
      const miss = this._buildMissOutcome(shooter?.name, attackingTeam.name);
      events.push(this._createEvent(EVENT_TYPES.SHOT_MISSED, minute, {
        teamId: attackingTeam.id,
        playerId: shooter?.playerId,
        displayName: shooter?.name,
        description: miss.description,
        missVariant: miss.variant,
        xg: adjustedXg,
        outcome: 'missed',
        bundleId,
        bundleStep: step,
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
   * Stage D: in-match penalty chain.
   *   penalty_awarded → penalty_walkup → penalty_run_up → result (terminal)
   *
   * Score and stats only change on the terminal step; the three lead-in
   * steps are narrative-only. Penalty shootout flow is unaffected — it
   * lives in PenaltyShootout.js and uses the separate SHOOTOUT_* event
   * types, not these PENALTY_* types.
   *
   * kickoff_restart after a goal is reserved for a later stage; this stage
   * does not emit it.
   */
  _handlePenalty(attackingTeam, defendingTeam, side, minute) {
    const events = [];
    const attackingPlayers = side === 'home' ? this.ctx.homePlayers : this.ctx.awayPlayers;
    const defendingPlayers = side === 'home' ? this.ctx.awayPlayers : this.ctx.homePlayers;

    this.ctx.stats[side].shots++;
    this.ctx.stats[side].xg += SIM.PENALTY_XG;

    const taker = this._selectScorer(attackingPlayers);
    const keeper = this._selectKeeper(defendingPlayers);
    const takerName = taker?.name || `${attackingTeam.name} taker`;
    const keeperName = keeper?.name || `${defendingTeam.name} keeper`;

    const bundleId = this._generateChainBundleId('penalty', minute);
    let step = 0;

    events.push(this._createEvent(EVENT_TYPES.PENALTY_AWARDED, minute, {
      teamId: attackingTeam.id,
      description: `Foul! The ref points to the spot. Penalty awarded to ${attackingTeam.name}.`,
      bundleId,
      bundleStep: step++,
      chain_type: 'penalty',
      chain_terminal: false,
      pacing: { ...CHAIN_PACING.penalty_awarded },
      tags: ['setPiece', 'penalty'],
      narrative: `${attackingTeam.name} have a chance from the spot.`
    }));

    events.push(this._createEvent(EVENT_TYPES.PENALTY_WALKUP, minute, {
      teamId: attackingTeam.id,
      playerId: taker?.playerId,
      displayName: taker?.name,
      description: `${takerName} steps up for ${attackingTeam.name}.`,
      bundleId,
      bundleStep: step++,
      chain_type: 'penalty',
      chain_terminal: false,
      pacing: { ...CHAIN_PACING.penalty_walkup },
      tags: ['setPiece', 'penalty'],
      narrative: `${takerName} places the ball on the spot.`
    }));

    events.push(this._createEvent(EVENT_TYPES.PENALTY_RUN_UP, minute, {
      teamId: attackingTeam.id,
      playerId: taker?.playerId,
      displayName: taker?.name,
      description: `${takerName} takes the penalty...`,
      bundleId,
      bundleStep: step++,
      chain_type: 'penalty',
      chain_terminal: false,
      pacing: { ...CHAIN_PACING.penalty_run_up },
      tags: ['setPiece', 'penalty'],
      narrative: `${takerName} begins the run-up.`
    }));

    const outcome = this._determinePenaltyOutcome(defendingTeam);
    const terminalPacing = { ...CHAIN_PACING.penalty_outcome };

    if (outcome === 'scored') {
      this.ctx.score[side]++;
      this.ctx.stats[side].shotsOnTarget++;
      this._updateMomentum(side, 'goal');

      events.push(this._createEvent(EVENT_TYPES.PENALTY_SCORED, minute, {
        teamId: attackingTeam.id,
        playerId: taker?.playerId,
        displayName: taker?.name,
        description: `GOAL! He sends the keeper the wrong way.`,
        xg: SIM.PENALTY_XG,
        outcome: 'scored',
        bundleId,
        bundleStep: step++,
        chain_type: 'penalty',
        chain_terminal: true,
        pacing: terminalPacing,
        tags: ['setPiece', 'penalty'],
        narrative: `${takerName} keeps composure to convert from the spot.`,
        momentumSnapshot: { ...this.phaseState.momentum }
      }));

      this._persistScore();

      // Stage E: restart after a successful penalty, suppressed at period ends.
      events.push(...this._buildKickoffRestart(defendingTeam, minute));
    } else if (outcome === 'saved') {
      this.ctx.stats[side].shotsOnTarget++;
      this._updateMomentum(side, 'saved');
      events.push(this._createEvent(EVENT_TYPES.PENALTY_SAVED, minute, {
        teamId: attackingTeam.id,
        playerId: taker?.playerId,
        displayName: taker?.name,
        keeperPlayerId: keeper?.playerId,
        keeperName: keeper?.name,
        description: `SAVED! ${keeperName} makes the stop for ${defendingTeam.name}.`,
        xg: SIM.PENALTY_XG,
        outcome: 'saved',
        bundleId,
        bundleStep: step++,
        chain_type: 'penalty',
        chain_terminal: true,
        pacing: terminalPacing,
        tags: ['setPiece', 'penalty'],
        narrative: `${keeperName} produces a huge stop from the spot.`,
        momentumSnapshot: { ...this.phaseState.momentum }
      }));
    } else {
      this._updateMomentum(side, 'missed');
      const goesWide = Math.random() < 0.5;
      events.push(this._createEvent(EVENT_TYPES.PENALTY_MISSED, minute, {
        teamId: attackingTeam.id,
        playerId: taker?.playerId,
        displayName: taker?.name,
        description: goesWide ? `He misses! It goes wide.` : `He misses! It goes over.`,
        xg: SIM.PENALTY_XG,
        outcome: 'missed',
        bundleId,
        bundleStep: step++,
        chain_type: 'penalty',
        chain_terminal: true,
        pacing: terminalPacing,
        tags: ['setPiece', 'penalty'],
        narrative: `${takerName} squanders the opportunity from the spot.`,
        momentumSnapshot: { ...this.phaseState.momentum }
      }));
    }

    return events;
  }

  _selectKeeper(players) {
    if (!Array.isArray(players)) return null;
    return players.find((p) => p.isGoalkeeper) || null;
  }

  /**
   * Stage E: emit a kickoff_restart follow-up after an in-match goal or
   * penalty_scored when the match is going to continue. The restart event
   * is deliberately *not* part of any chain — no bundleId, bundleStep,
   * chain_type, or chain_terminal — so it can't violate the
   * "exactly one terminal per chain" rule for the preceding goal/penalty
   * chain. It carries pacing metadata so the FE can stagger the reveal.
   *
   * The opposingTeam is the one that restarts from the halfway line, i.e.
   * the team that just conceded.
   *
   * Returns [] when the minute lands on a period boundary so we don't
   * race the halftime / fulltime / ET-halftime / match-end event that
   * LiveMatch is about to emit on the next tick.
   */
  _buildKickoffRestart(opposingTeam, minute) {
    if (PERIOD_END_MINUTES.has(minute)) return [];
    const teamName = opposingTeam?.name || 'The opposition';
    return [this._createEvent(EVENT_TYPES.KICKOFF_RESTART, minute, {
      teamId: opposingTeam?.id,
      description: `${teamName} restart from the halfway spot.`,
      pacing: { ...CHAIN_PACING.kickoff_restart },
      tags: ['restart'],
      narrative: `${teamName} get the match going again from the centre circle.`
    })];
  }

  _handleFoul(minute) {
    const events = [];
    // Which side commits the foul. Even split by default; the Cyborg Garage
    // can set foulRiskMultiplier on a team (aggressive lineups foul more,
    // passive ones less). With both multipliers at 1 this is exactly 0.5,
    // so non-garage matches are untouched.
    const homeRisk = this.ctx.homeTeam.foulRiskMultiplier || 1;
    const awayRisk = this.ctx.awayTeam.foulRiskMultiplier || 1;
    const isHomeFoul = Math.random() < homeRisk / (homeRisk + awayRisk);
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

  /**
   * Issue 2: short build-up line emitted immediately before a shot result.
   * Player forms are used when a shooter is known; otherwise team-only
   * fallbacks. Never references the outcome — the result event reveals it.
   */
  _getShotBuildUpDescription(playerName, teamName) {
    if (!playerName) {
      const teamVariants = [
        `${teamName} take a shot!`,
        `${teamName} go for goal!`,
        `${teamName} let fly!`
      ];
      return teamVariants[Math.floor(Math.random() * teamVariants.length)];
    }
    const variants = [
      `${playerName} takes the shot for ${teamName}!`,
      `${playerName} drives it goalward!`,
      `${playerName} lets fly for ${teamName}!`,
      `${teamName} work it to ${playerName} who shoots!`
    ];
    return variants[Math.floor(Math.random() * variants.length)];
  }

  /**
   * Issue 3: varied missed-shot text. Returns { description, variant } where
   * variant is one of 'miss' | 'wide' | 'over' | 'post'. "Hit the post" is a
   * miss like any other — the caller keeps the shot_missed type and never
   * touches the score for any variant.
   */
  _buildMissOutcome(playerName, teamName) {
    const variants = playerName
      ? [
          { variant: 'miss', text: `${playerName} misses for ${teamName}!` },
          { variant: 'wide', text: `${playerName} drags it wide.` },
          { variant: 'over', text: `${playerName} blazes it over the bar.` },
          { variant: 'post', text: `${playerName} hits the post!` },
          { variant: 'wide', text: `${playerName} fires wide of the target.` },
          { variant: 'over', text: `Effort from ${playerName} sails over the crossbar.` }
        ]
      : [
          { variant: 'miss', text: `${teamName} miss!` },
          { variant: 'wide', text: `${teamName} fire wide!` },
          { variant: 'over', text: `${teamName} blaze it over!` },
          { variant: 'post', text: `${teamName} hit the post!` }
        ];
    const pick = variants[Math.floor(Math.random() * variants.length)];
    return { description: pick.text, variant: pick.variant };
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
