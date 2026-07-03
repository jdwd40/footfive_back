/**
 * CommentaryEngine - centralised match commentary (Stage G)
 *
 * Two responsibilities, both display-only (never mutates score/state):
 *
 * 1. decorate(event): swap the stock description of selected existing event
 *    types (goal, shot_saved, cards, halftime, ...) for a varied, contextual
 *    line picked from template pools. Only `description` is touched; every
 *    structured field (side, matchPhase, chain metadata, score) passes
 *    through unchanged. Types the frontend legacy parsers read
 *    (attack_breakdown / counter_breakdown) and the already-contextual
 *    shootout kick copy from PenaltyShootout are deliberately left alone.
 *
 * 2. observe(events, minute): track rolling match context (attacking
 *    signals per side, goals timeline, on-paper favourite) and occasionally
 *    emit one `match_observation` event — commentator analysis such as
 *    momentum spells, collapses, late drama. Heavily cooldown-gated via
 *    constants.COMMENTARY so observations stay occasional and earned.
 *
 * Randomness is injected (options.rng, defaults Math.random — the project's
 * existing pattern) so tests can pin template selection.
 */
const { EVENT_TYPES, COMMENTARY, OBSERVATION_SUBTYPES } = require('../constants');

// Attacking signals counted toward pressure/momentum windows. Keyed by the
// attacking side's event types; breakdown types are excluded because their
// teamId is the defender.
const ATTACK_SIGNAL_TYPES = new Set([
  EVENT_TYPES.GOAL,
  EVENT_TYPES.SHOT_SAVED,
  EVENT_TYPES.SHOT_MISSED,
  EVENT_TYPES.SHOT_BLOCKED,
  EVENT_TYPES.CHANCE_CREATED,
  EVENT_TYPES.CORNER,
  EVENT_TYPES.COUNTER_ATTACK,
  EVENT_TYPES.PENALTY_AWARDED
]);

const GOAL_TYPES = new Set([EVENT_TYPES.GOAL, EVENT_TYPES.PENALTY_SCORED]);

class CommentaryEngine {
  /**
   * @param {Object} context - { fixtureId, homeTeam, awayTeam, score } —
   *   score is the live LiveMatch score object (read-only here).
   * @param {Function} createEvent - bound LiveMatch._createEvent, stamps
   *   score snapshot, side, matchPhase, team blocks.
   * @param {Object} [options] - { rng, tuning } overrides for tests.
   */
  constructor(context, createEvent, options = {}) {
    this.ctx = context;
    this._createEvent = createEvent;
    this.rng = options.rng || Math.random;
    this.tuning = { ...COMMENTARY, ...(options.tuning || {}) };

    // Decoration bookkeeping: last variant index per event type so the same
    // line never repeats back-to-back.
    this.lastVariantByType = new Map();

    // Observation bookkeeping.
    this.observationsEmitted = 0;
    this.lastObservationMinute = -Infinity;
    this.lastMinuteBySubtype = new Map();
    this.lastMinuteByTeam = new Map();
    this.lastObservationLine = null;

    // Rolling context.
    this.attackSignals = []; // { minute, side }
    this.goals = [];         // { minute, side } (side = scorer)
  }

  // === 1. Varied wording for existing events ===

  /**
   * Replace the description of supported event types with a varied,
   * context-aware line. Mutates only `description`; returns the event.
   */
  decorate(event) {
    if (!event || typeof event.type !== 'string') return event;
    const builder = this._templatePools()[event.type];
    if (!builder) return event;

    const names = this._namesFor(event);
    const pool = builder(event, names);
    if (!Array.isArray(pool) || pool.length === 0) return event;

    event.description = this._pickVariant(event.type, pool);
    return event;
  }

  _namesFor(event) {
    const home = this.ctx.homeTeam;
    const away = this.ctx.awayTeam;
    const side = event.side === 'home' || event.side === 'away'
      ? event.side
      : event.teamId === home.id ? 'home' : event.teamId === away.id ? 'away' : null;
    const team = side === 'home' ? home.name : side === 'away' ? away.name : null;
    const opponent = side === 'home' ? away.name : side === 'away' ? home.name : null;
    return {
      team,
      opponent,
      home: home.name,
      away: away.name,
      player: event.displayName || team || 'The taker',
      assist: event.assistName || null
    };
  }

  /**
   * Pick a pool entry, never repeating the previous pick for that type when
   * an alternative exists.
   */
  _pickVariant(type, pool) {
    let indexes = pool.map((_, i) => i);
    const last = this.lastVariantByType.get(type);
    if (pool.length > 1 && last != null) {
      indexes = indexes.filter(i => i !== last);
    }
    const idx = indexes[Math.floor(this.rng() * indexes.length)] ?? indexes[0];
    this.lastVariantByType.set(type, idx);
    return pool[idx];
  }

  _scoreline() {
    const s = this.ctx.score;
    return `${this.ctx.homeTeam.name} ${s.home}-${s.away} ${this.ctx.awayTeam.name}`;
  }

  /**
   * Template pools. Each entry: (event, names) => string[].
   * The event's score snapshot already includes the event itself (goal
   * events are created after the score increments), so goal context reads
   * from event.score.
   */
  _templatePools() {
    if (this._pools) return this._pools;

    const scoreline = () => this._scoreline();

    this._pools = {
      [EVENT_TYPES.GOAL]: (evt, n) => this._goalPool(evt, n),

      [EVENT_TYPES.SHOT_SAVED]: (evt, n) => evt.cornerAwarded
        ? [
            `Save! ${n.opponent}'s keeper turns ${n.player}'s effort behind. Corner to ${n.team}.`,
            `${n.player} forces a save — ${n.team} will have a corner.`,
            `Smart stop! ${n.player}'s strike is pushed away for a ${n.team} corner.`
          ]
        : [
            `Save! Good stop by the ${n.opponent} goalkeeper from ${n.player}'s effort.`,
            `${n.player} tests the keeper, but ${n.opponent}'s number one is equal to it.`,
            `Denied! The ${n.opponent} keeper gets down well to keep out ${n.player}.`,
            `${n.player} lets fly for ${n.team} — held comfortably by the keeper.`
          ],

      [EVENT_TYPES.SHOT_MISSED]: (evt, n) => [
        `${n.player} fires wide of the target.`,
        `Off the post! ${n.player} is inches away from giving ${n.team} something to shout about.`,
        `${n.player} drags it wide — ${n.team} will feel that was a chance.`,
        `Over the bar! ${n.player} leans back and the effort sails over.`,
        `${n.player} clips the outside of the post! So close for ${n.team}.`
      ],

      [EVENT_TYPES.SHOT_BLOCKED]: (evt, n) => [
        `Blocked! A ${n.opponent} defender throws himself in front of ${n.player}'s shot.`,
        `${n.player} pulls the trigger, but ${n.opponent} get a body in the way.`,
        `Crucial block — ${n.opponent} refuse to let ${n.player}'s effort through.`
      ],

      [EVENT_TYPES.CORNER]: (evt, n) => [
        `Corner to ${n.team}.`,
        `${n.team} win a corner — chance to load the box.`,
        `Another corner for ${n.team}. ${n.opponent} can't clear their lines.`
      ],

      [EVENT_TYPES.FOUL]: (evt, n) => [
        `Foul by ${n.player}. Free kick to ${n.opponent}.`,
        `${n.player} catches his man late — the referee blows up.`,
        `${n.opponent} win a free kick after a clumsy challenge from ${n.player}.`,
        `Cynical from ${n.player}. ${n.opponent} will restart with the free kick.`
      ],

      [EVENT_TYPES.YELLOW_CARD]: (evt, n) => [
        `Yellow card shown to ${n.player}.`,
        `${n.player} goes into the book — ${n.team} need to be careful now.`,
        `The referee reaches for a yellow. ${n.player} can have no complaints.`
      ],

      [EVENT_TYPES.RED_CARD]: (evt, n) => [
        `RED CARD! ${n.player} is off, and ${n.team} are down to ten.`,
        `${n.player} sees red — a huge moment in this match.`,
        `The referee has no hesitation: red card for ${n.player}. ${n.team} must reorganise.`
      ],

      [EVENT_TYPES.PENALTY_AWARDED]: (evt, n) => [
        `Penalty to ${n.team}! The referee points straight to the spot.`,
        `The ref points to the spot — huge chance coming for ${n.team}.`,
        `${n.opponent} are furious, but the decision stands: penalty to ${n.team}.`
      ],

      [EVENT_TYPES.PENALTY_SCORED]: (evt, n) => [
        `GOAL! ${n.player} sends the keeper the wrong way. ${scoreline()}.`,
        `${n.player} is ice-cold from the spot. ${n.team} score. ${scoreline()}.`,
        `Buried! ${n.player} makes no mistake with the penalty.`
      ],

      [EVENT_TYPES.PENALTY_SAVED]: (evt, n) => [
        `SAVED! ${evt.keeperName || `the ${n.opponent} keeper`} guesses right and keeps it out!`,
        `What a stop! ${n.player}'s penalty is smothered by ${evt.keeperName || `the ${n.opponent} keeper`}.`,
        `${n.player} is denied from the spot — ${n.opponent} survive.`
      ],

      [EVENT_TYPES.PENALTY_MISSED]: (evt, n) => [
        `He misses! ${n.player} puts the penalty wide — ${n.team} can't believe it.`,
        `Over the bar! ${n.player} leans back and wastes the penalty.`,
        `${n.player} misses from the spot. A let-off for ${n.opponent}.`
      ],

      [EVENT_TYPES.HALFTIME]: () => {
        const s = this.ctx.score;
        const line = scoreline();
        if (s.home === s.away) {
          return [
            `Half time: ${line}. All square, everything to play for.`,
            `Half time: ${line}. Neither side has found the breakthrough their play deserves.`
          ];
        }
        const leader = s.home > s.away ? this.ctx.homeTeam.name : this.ctx.awayTeam.name;
        return [
          `Half time: ${line}. ${leader} go in with the advantage.`,
          `Half time: ${line}. ${leader} will be the happier side at the break.`
        ];
      },

      [EVENT_TYPES.FULLTIME]: () => [
        `Full time: ${scoreline()}.`,
        `The referee brings it to an end. Full time: ${scoreline()}.`,
        `That's that after ninety minutes: ${scoreline()}.`
      ],

      [EVENT_TYPES.EXTRA_TIME_START]: () => [
        `Extra time begins. Thirty more minutes to settle it.`,
        `We go to extra time — legs are heavy, nerves are heavier.`,
        `Extra time. Someone has to blink first.`
      ],

      [EVENT_TYPES.EXTRA_TIME_HALF]: () => [
        `ET half time: ${scoreline()}.`,
        `A brief pause in extra time: ${scoreline()}. Penalties are creeping into view.`
      ],

      [EVENT_TYPES.EXTRA_TIME_END]: () => [
        `Full time: ${scoreline()}.`,
        `Extra time ends: ${scoreline()}.`
      ],

      [EVENT_TYPES.SHOOTOUT_START]: () => [
        `Penalty shootout begins.`,
        `It comes down to penalties. Nowhere to hide now.`,
        `We're going to a shootout — the cruellest way to settle it.`
      ],

      [EVENT_TYPES.SHOOTOUT_END]: (evt) => {
        const winner = evt.winnerId === this.ctx.homeTeam.id
          ? this.ctx.homeTeam.name
          : evt.winnerId === this.ctx.awayTeam.id ? this.ctx.awayTeam.name : null;
        const base = evt.description || `Shootout over.`;
        if (!winner) return [base];
        return [
          `${base} ${winner} win it on penalties!`,
          `${base} ${winner} hold their nerve when it matters most.`
        ];
      }
    };

    return this._pools;
  }

  _goalPool(evt, n) {
    const s = evt.score || this.ctx.score;
    const side = evt.side;
    if (!n.team || (side !== 'home' && side !== 'away')) {
      return [`GOAL! ${n.player} finds the net!`];
    }
    const scorerGoals = side === 'home' ? s.home : s.away;
    const concederGoals = side === 'home' ? s.away : s.home;
    const diff = scorerGoals - concederGoals;
    const late = (evt.minute ?? 0) >= this.tuning.LATE_DRAMA_FROM_MINUTE;
    const assistTail = n.assist ? ` Assisted by ${n.assist}.` : '';
    const line = `${this.ctx.homeTeam.name} ${s.home}-${s.away} ${this.ctx.awayTeam.name}`;

    if (diff === 0) {
      return [
        `GOAL! ${n.player} drags ${n.team} level!${assistTail} ${line}.`,
        `${n.team} have their equaliser — ${n.player} with the finish!${assistTail}`,
        `All square again! ${n.player} restores parity for ${n.team}.${assistTail}`
      ];
    }
    if (diff === 1 && late) {
      return [
        `GOAL! ${n.player} might just have won it for ${n.team}!${assistTail} ${line}.`,
        `Late drama! ${n.player} puts ${n.team} ahead with time running out!${assistTail}`
      ];
    }
    if (diff === 1) {
      return [
        `GOAL! ${n.player} puts ${n.team} in front!${assistTail} ${line}.`,
        `${n.team} take the lead — ${n.player} with a clinical finish!${assistTail}`,
        `${n.player} finds the net and ${n.team} edge ahead.${assistTail} ${line}.`
      ];
    }
    if (diff >= 2) {
      return [
        `GOAL! ${n.player} strikes again for ${n.team} — daylight between the sides now.${assistTail}`,
        `${n.team} are pulling away! ${n.player} makes it ${line}.${assistTail}`,
        `Another one for ${n.team}. ${n.player} scores, and ${n.opponent} are in real trouble.${assistTail}`
      ];
    }
    // Scoring side still behind: consolation / fightback.
    return [
      `GOAL! ${n.player} pulls one back for ${n.team}.${assistTail} ${line}.`,
      `${n.team} aren't done yet — ${n.player} gives them a lifeline!${assistTail}`,
      `${n.player} scores for ${n.team}. Is a comeback on? ${line}.${assistTail}`
    ];
  }

  // === 2. Contextual observations ===

  /**
   * Ingest a tick's events into rolling context without emitting. Used on
   * the fast-forward path where observations are suppressed.
   */
  ingest(events, minute) {
    for (const evt of events || []) {
      if (!evt || typeof evt.type !== 'string') continue;
      if (evt.type === EVENT_TYPES.MATCH_OBSERVATION) continue;
      const side = evt.side === 'home' || evt.side === 'away' ? evt.side : null;
      if (!side) continue;
      const evtMinute = evt.minute ?? minute;
      if (ATTACK_SIGNAL_TYPES.has(evt.type)) {
        this.attackSignals.push({ minute: evtMinute, side });
      }
      if (GOAL_TYPES.has(evt.type)) {
        this.goals.push({ minute: evtMinute, side });
      }
    }
    this._trimWindows(minute);
  }

  _trimWindows(minute) {
    const cutoff = minute - Math.max(
      this.tuning.PRESSURE_WINDOW_MINUTES,
      this.tuning.QUICK_CONCEDE_WINDOW_MINUTES
    );
    this.attackSignals = this.attackSignals.filter(sig => sig.minute >= cutoff);
    // goals kept for the whole match (cheap, used for comeback detection).
  }

  /**
   * Main per-tick entry point: ingest events, then maybe return one
   * match_observation event. `allowEmit` false (halftime pauses, penalties
   * excluded by caller policy, fast-forward) still ingests.
   *
   * @returns {Object|null}
   */
  observe(events, minute, { allowEmit = true } = {}) {
    const tickEvents = events || [];
    this.ingest(tickEvents, minute);

    if (!allowEmit) return null;
    if (this.observationsEmitted >= this.tuning.MAX_OBSERVATIONS_PER_MATCH) return null;
    if (minute - this.lastObservationMinute < this.tuning.MIN_MINUTES_BETWEEN_OBSERVATIONS) return null;

    const candidate = this._findCandidate(tickEvents, minute);
    if (!candidate) return null;

    // Subtype + team cooldowns.
    const lastSubtype = this.lastMinuteBySubtype.get(candidate.subtype);
    if (lastSubtype != null && minute - lastSubtype < this.tuning.SUBTYPE_COOLDOWN_MINUTES) return null;
    if (candidate.teamId != null) {
      const lastTeam = this.lastMinuteByTeam.get(candidate.teamId);
      if (lastTeam != null && minute - lastTeam < this.tuning.TEAM_COOLDOWN_MINUTES) return null;
    }

    const description = this._pickObservationLine(candidate.lines);
    if (!description) return null;

    this.observationsEmitted++;
    this.lastObservationMinute = minute;
    this.lastMinuteBySubtype.set(candidate.subtype, minute);
    if (candidate.teamId != null) this.lastMinuteByTeam.set(candidate.teamId, minute);
    this.lastObservationLine = description;

    return this._createEvent(EVENT_TYPES.MATCH_OBSERVATION, minute, {
      subtype: candidate.subtype,
      teamId: candidate.teamId ?? undefined,
      side: candidate.side ?? undefined,
      description,
      severity: candidate.severity,
      importance: candidate.severity === 'high' ? 'high' : 'medium',
      tags: ['commentary', 'observation']
    });
  }

  _pickObservationLine(lines) {
    if (!Array.isArray(lines) || lines.length === 0) return null;
    const filtered = lines.filter(l => l !== this.lastObservationLine);
    const pool = filtered.length > 0 ? filtered : lines;
    return pool[Math.floor(this.rng() * pool.length)];
  }

  _teamFor(side) {
    return side === 'home' ? this.ctx.homeTeam : this.ctx.awayTeam;
  }

  _overallRating(team) {
    const parts = [team.attackRating, team.defenseRating, team.goalkeeperRating]
      .filter(v => typeof v === 'number');
    if (parts.length === 0) return null;
    return parts.reduce((a, b) => a + b, 0) / parts.length;
  }

  /** On-paper favourite side, or null when ratings are close/missing. */
  _favouriteSide() {
    const home = this._overallRating(this.ctx.homeTeam);
    const away = this._overallRating(this.ctx.awayTeam);
    if (home == null || away == null) return null;
    if (home - away >= this.tuning.FAVOURITE_RATING_GAP) return 'home';
    if (away - home >= this.tuning.FAVOURITE_RATING_GAP) return 'away';
    return null;
  }

  _signalsInWindow(side, minute) {
    const from = minute - this.tuning.PRESSURE_WINDOW_MINUTES;
    return this.attackSignals.filter(sig => sig.side === side && sig.minute >= from).length;
  }

  _goalsAgainstInWindow(side, minute, windowMinutes) {
    const opponent = side === 'home' ? 'away' : 'home';
    const from = minute - windowMinutes;
    return this.goals.filter(g => g.side === opponent && g.minute >= from).length;
  }

  _scoredRecently(side, minute) {
    return this.goals.some(g =>
      g.side === side && minute - g.minute <= this.tuning.CONTRADICTION_GUARD_MINUTES);
  }

  _concededRecently(side, minute) {
    const opponent = side === 'home' ? 'away' : 'home';
    return this.goals.some(g =>
      g.side === opponent && minute - g.minute <= this.tuning.CONTRADICTION_GUARD_MINUTES);
  }

  /**
   * Evaluate observation candidates in priority order and return the first
   * that fires: goal-driven drama first, then pressure spells, then
   * favourite/underdog framing, then game-state colour.
   */
  _findCandidate(tickEvents, minute) {
    const S = OBSERVATION_SUBTYPES;
    const score = this.ctx.score;
    const goalThisTick = tickEvents.find(e => GOAL_TYPES.has(e.type) &&
      (e.side === 'home' || e.side === 'away'));

    // --- Goal-driven: collapse / warning signs / scoreline / comeback ---
    if (goalThisTick) {
      const scorer = goalThisTick.side;
      const conceder = scorer === 'home' ? 'away' : 'home';
      const concederTeam = this._teamFor(conceder);
      const scorerTeam = this._teamFor(scorer);
      const diff = (scorer === 'home' ? score.home - score.away : score.away - score.home);
      const quickConcedes = this._goalsAgainstInWindow(
        conceder, minute, this.tuning.QUICK_CONCEDE_WINDOW_MINUTES);
      const late = minute >= this.tuning.LATE_DRAMA_FROM_MINUTE;

      if (diff >= 2 && quickConcedes >= 2) {
        return {
          subtype: S.COLLAPSE, teamId: concederTeam.id, side: conceder, severity: 'high',
          lines: [
            `${concederTeam.name} go yet another goal down. This is the last thing they needed.`,
            `${concederTeam.name} are falling apart here.`,
            `It's unravelling quickly for ${concederTeam.name}.`
          ]
        };
      }
      if (quickConcedes >= 2) {
        return {
          subtype: S.WARNING_SIGNS, teamId: concederTeam.id, side: conceder, severity: 'medium',
          lines: [
            `Warning signs for ${concederTeam.name} — they've been opened up twice in quick succession.`,
            `${concederTeam.name} are looking shaky.`,
            `Two quick blows for ${concederTeam.name}. They need to steady themselves.`
          ]
        };
      }
      if (diff >= 2) {
        return {
          subtype: S.SCORELINE, teamId: concederTeam.id, side: conceder, severity: 'medium',
          lines: [
            `${concederTeam.name} now have a mountain to climb.`,
            `That's a two-goal cushion — ${concederTeam.name} need something quickly.`,
            `${concederTeam.name} are chasing the game now.`
          ]
        };
      }
      if (diff === 0 && this.goals.length >= 2) {
        return {
          subtype: S.COMEBACK, teamId: scorerTeam.id, side: scorer, severity: 'high',
          lines: [
            `${scorerTeam.name} have dragged themselves level. Game on.`,
            `From nowhere, ${scorerTeam.name} are back in this.`,
            `${scorerTeam.name} refuse to go away.`
          ]
        };
      }
      if (diff === 1 && late) {
        return {
          subtype: S.SCORELINE, teamId: scorerTeam.id, side: scorer, severity: 'high',
          lines: [
            `${scorerTeam.name} lead late on — can they see this out?`,
            `A late lead for ${scorerTeam.name}. ${concederTeam.name} have minutes to respond.`
          ]
        };
      }
      return null; // Ordinary goal: the goal event carries the drama itself.
    }

    // --- Pressure / momentum / shaky defence / late drama ---
    for (const side of ['home', 'away']) {
      const team = this._teamFor(side);
      const opponent = side === 'home' ? 'away' : 'home';
      const opponentTeam = this._teamFor(opponent);
      const signals = this._signalsInWindow(side, minute);
      const diff = side === 'home' ? score.home - score.away : score.away - score.home;
      const late = minute >= this.tuning.LATE_DRAMA_FROM_MINUTE;

      if (signals >= this.tuning.PRESSURE_SIGNAL_TRIGGER && !this._concededRecently(side, minute)) {
        if (late && diff === -1) {
          return {
            subtype: S.LATE_PRESSURE, teamId: team.id, side, severity: 'high',
            lines: [
              `${team.name} are knocking on the door. An equaliser feels close.`,
              `${team.name} throw everything forward — ${opponentTeam.name} are hanging on.`,
              `Late pressure from ${team.name}. Nerves everywhere.`
            ]
          };
        }
        if (this._scoredRecently(side, minute) ||
            this.goals.some(g => g.side === side &&
              minute - g.minute <= this.tuning.PRESSURE_WINDOW_MINUTES)) {
          return {
            subtype: S.MOMENTUM, teamId: team.id, side, severity: 'medium',
            lines: [
              `${team.name} are growing into this.`,
              `The momentum is all with ${team.name} right now.`,
              `${team.name} have their tails up.`
            ]
          };
        }
        return {
          subtype: S.PRESSURE, teamId: team.id, side, severity: 'medium',
          lines: [
            `${team.name} are having a good spell here. They look dangerous.`,
            `${team.name} are turning the screw.`,
            `Wave after wave from ${team.name} — a goal feels like it's coming.`
          ]
        };
      }

      if (this._signalsInWindow(opponent, minute) >= this.tuning.SHAKY_SIGNAL_TRIGGER &&
          !this._scoredRecently(side, minute)) {
        return {
          subtype: S.SHAKY_DEFENCE, teamId: team.id, side, severity: 'medium',
          lines: [
            `${team.name} are looking shaky.`,
            `${team.name} are struggling to get out of their own half.`,
            `${team.name} are creaking at the back.`
          ]
        };
      }
    }

    // --- Favourite / underdog framing (needs ratings + a telling scoreline) ---
    // These read the standing scoreline rather than a fresh trigger, so they
    // are limited to once per match each — otherwise a mismatched fixture
    // would re-earn them on every cooldown expiry.
    const favSide = this._favouriteSide();
    if (favSide) {
      const fav = this._teamFor(favSide);
      const dogSide = favSide === 'home' ? 'away' : 'home';
      const dog = this._teamFor(dogSide);
      const favDiff = favSide === 'home' ? score.home - score.away : score.away - score.home;
      if (favDiff >= 2 && !this.lastMinuteBySubtype.has(S.FAVOURITE_CONTROL)) {
        return {
          subtype: S.FAVOURITE_CONTROL, teamId: fav.id, side: favSide, severity: 'minor',
          lines: [
            `${fav.name} are starting to play like favourites.`,
            `This is what ${fav.name} were expected to do — total control.`
          ]
        };
      }
      if (favDiff <= 0 && minute >= 60 && !this.lastMinuteBySubtype.has(S.UNDERDOG)) {
        return {
          subtype: S.UNDERDOG, teamId: dog.id, side: dogSide, severity: 'medium',
          lines: [
            `${dog.name} are brave here, but dangerously open.`,
            `${dog.name} are hanging on — and believing.`,
            `Nobody gave ${dog.name} a chance. They haven't read the script.`
          ]
        };
      }
    }

    // --- Game-state colour: extra time / shootout pressure moments ---
    const etStart = tickEvents.find(e => e.type === EVENT_TYPES.EXTRA_TIME_START);
    if (etStart) {
      return {
        subtype: S.GAME_STATE, teamId: null, side: null, severity: 'minor',
        lines: [
          `Extra time will stretch both sides. Fitness and nerve from here.`,
          `Thirty more minutes. Both benches urging tired legs forward.`
        ]
      };
    }
    const bigKick = tickEvents.find(e =>
      e.type === EVENT_TYPES.SHOOTOUT_WALKUP && (e.decider || e.mustScore));
    if (bigKick) {
      const side = bigKick.side === 'home' || bigKick.side === 'away' ? bigKick.side : null;
      const team = side ? this._teamFor(side) : null;
      return {
        subtype: S.GAME_STATE, teamId: team?.id ?? null, side, severity: 'high',
        lines: team
          ? [
              `Everything rides on this kick for ${team.name}.`,
              `You could hear a pin drop. ${team.name}'s whole match comes down to this.`
            ]
          : [`One kick could decide it all.`]
      };
    }

    return null;
  }

  /**
   * Read-only snapshot of engine state for tests/observability.
   */
  getStateSnapshot() {
    return {
      observationsEmitted: this.observationsEmitted,
      lastObservationMinute: this.lastObservationMinute,
      attackSignalCount: this.attackSignals.length,
      goalCount: this.goals.length
    };
  }
}

module.exports = { CommentaryEngine, ATTACK_SIGNAL_TYPES };
