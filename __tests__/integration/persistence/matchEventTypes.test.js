/**
 * Integration test: match_events.valid_event_type CHECK accepts every type
 * EventBus may try to persist (PERSISTABLE_MATCH_EVENT_TYPES from constants).
 *
 * Stage 0 readiness check: prior to migration 005 several types in
 * PERSISTABLE_MATCH_EVENT_TYPES (chance_created, match_recap, plus the
 * Stage-1 foundation set) were silently rejected by the DB CHECK and the
 * failures only showed up in logs. This test asserts the CHECK now allows
 * all of them, and that the new seq / server_timestamp columns round-trip.
 */

const db = require('../../../db/connection');
const MatchEvent = require('../../../models/MatchEventModel');
const {
  EVENT_TYPES,
  PERSISTABLE_MATCH_EVENT_TYPES,
  CHAIN_PACING
} = require('../../../gamelogic/constants');
const {
  setupBeforeEach,
  cleanupAfterEach
} = require('../../setup/testHelpers');

describe('match_events persistence: event-type CHECK constraint', () => {
  let fixtureId;
  let teamAId;
  let teamBId;

  beforeEach(async () => {
    await setupBeforeEach();

    // Two seeded teams from minimal-teams. Pick the first two by id.
    const teams = await db.query('SELECT team_id FROM teams ORDER BY team_id LIMIT 2');
    teamAId = teams.rows[0].team_id;
    teamBId = teams.rows[1].team_id;

    const fixture = await db.query(
      `INSERT INTO fixtures (home_team_id, away_team_id, round, status)
       VALUES ($1, $2, 'Round of 16', 'live')
       RETURNING fixture_id`,
      [teamAId, teamBId]
    );
    fixtureId = fixture.rows[0].fixture_id;
  });

  afterEach(async () => {
    await cleanupAfterEach();
  });

  it('accepts every type in PERSISTABLE_MATCH_EVENT_TYPES', async () => {
    const types = Array.from(PERSISTABLE_MATCH_EVENT_TYPES);
    expect(types.length).toBeGreaterThan(0);

    const failures = [];
    for (const eventType of types) {
      try {
        await MatchEvent.create({
          fixtureId,
          minute: 1,
          eventType,
          teamId: teamAId,
          description: `test ${eventType}`,
          metadata: { test: true }
        });
      } catch (err) {
        failures.push({
          eventType,
          code: err.code || null,
          constraint: err.constraint || null,
          message: err.message
        });
      }
    }

    if (failures.length > 0) {
      // Render failures inline so a single failed type is easy to spot in CI
      // output, instead of just a count.
      throw new Error(
        `Persistence rejected ${failures.length} type(s):\n` +
        failures.map(f => `  - ${f.eventType} [${f.code}/${f.constraint}]: ${f.message}`).join('\n')
      );
    }
  });

  it('accepts shootout_walkup and shootout_reaction (emitted but not in PERSISTABLE)', async () => {
    // These types are emitted by PenaltyShootout today and the CHECK should
    // not block them, even though _isPersistableEvent currently filters them
    // out before they reach the DB.
    for (const eventType of ['shootout_walkup', 'shootout_reaction']) {
      await expect(
        MatchEvent.create({
          fixtureId,
          minute: 120,
          eventType,
          teamId: teamAId,
          description: `test ${eventType}`,
          metadata: {}
        })
      ).resolves.toBeDefined();
    }
  });

  it('still rejects an unknown event_type (CHECK constraint is intact)', async () => {
    // event_type column is VARCHAR(30); pick a short unknown name so we hit
    // the CHECK violation (23514) rather than string-length error (22001).
    await expect(
      MatchEvent.create({
        fixtureId,
        minute: 5,
        eventType: 'not_a_real_type',
        description: 'should fail',
        metadata: {}
      })
    ).rejects.toMatchObject({ code: '23514' }); // 23514 = check_violation
  });

  it('round-trips seq and server_timestamp columns', async () => {
    const ts = new Date('2026-05-08T12:34:56.000Z');
    const created = await MatchEvent.create({
      fixtureId,
      minute: 23,
      eventType: EVENT_TYPES.GOAL,
      teamId: teamAId,
      description: 'seq test',
      seq: 42,
      serverTimestamp: ts.getTime(),
      metadata: {}
    });

    expect(created.seq).toBe(42);
    expect(new Date(created.serverTimestamp).toISOString()).toBe(ts.toISOString());

    const fetched = await db.query(
      'SELECT seq, server_timestamp FROM match_events WHERE event_id = $1',
      [created.eventId]
    );
    expect(Number(fetched.rows[0].seq)).toBe(42);
    expect(new Date(fetched.rows[0].server_timestamp).toISOString()).toBe(ts.toISOString());
  });

  it('accepts every Stage-A chained-narrative type (migration 006)', async () => {
    // Stage-A types are also in PERSISTABLE_MATCH_EVENT_TYPES so the loop
    // above already covers them, but a dedicated assertion makes a CHECK
    // regression on this slice land in a single, named test.
    const stageATypes = [
      EVENT_TYPES.MIDFIELD_BATTLE,
      EVENT_TYPES.GOAL_BUILD_UP,
      EVENT_TYPES.ATTACK_BREAKDOWN,
      EVENT_TYPES.COUNTER_BREAKDOWN,
      EVENT_TYPES.KICKOFF_RESTART,
      EVENT_TYPES.PENALTY_WALKUP,
      EVENT_TYPES.PENALTY_RUN_UP
    ];

    for (const eventType of stageATypes) {
      const created = await MatchEvent.create({
        fixtureId,
        minute: 33,
        eventType,
        teamId: teamAId,
        description: `chain ${eventType}`,
        metadata: {
          chain_type: 'attack',
          chain_step: 1,
          chain_terminal: false,
          pacing: { delay_ms: 1000, hold_ms: 1200 }
        }
      });
      expect(created.eventType).toBe(eventType);
    }
  });

  it('reuses existing counter_attack type for counter chain step 1', async () => {
    // counter_attack is already in the CHECK (migration 005) and Stage-A
    // does NOT redefine it. This guards against an accidental duplicate
    // or removal in a future cleanup.
    expect(EVENT_TYPES.COUNTER_ATTACK).toBe('counter_attack');
    const created = await MatchEvent.create({
      fixtureId,
      minute: 44,
      eventType: EVENT_TYPES.COUNTER_ATTACK,
      teamId: teamAId,
      description: 'counter break',
      metadata: { chain_type: 'counter', chain_step: 0 }
    });
    expect(created.eventType).toBe('counter_attack');
  });

  it('exposes CHAIN_PACING defaults for every Stage-A chain type', () => {
    // Designers tune pacing here, emitters read from here. Guard the
    // shape so a typo in constants.js (e.g. delayMs vs delay_ms) fails
    // loud rather than at runtime in a chained emit.
    const requiredKeys = [
      'midfield_battle',
      'goal_build_up',
      'attack_breakdown',
      'counter_attack',
      'counter_breakdown',
      'shot_terminal',
      'goal_terminal',
      'kickoff_restart',
      'penalty_walkup',
      'penalty_run_up'
    ];
    for (const key of requiredKeys) {
      expect(CHAIN_PACING[key]).toBeDefined();
      expect(typeof CHAIN_PACING[key].delay_ms).toBe('number');
      expect(typeof CHAIN_PACING[key].hold_ms).toBe('number');
    }
  });

  it('createBatch persists seq and server_timestamp for each row', async () => {
    const ts = Date.now();
    const rows = await MatchEvent.createBatch([
      {
        fixtureId,
        minute: 1,
        eventType: EVENT_TYPES.KICKOFF,
        description: 'batch 1',
        seq: 100,
        serverTimestamp: ts,
        metadata: {}
      },
      {
        fixtureId,
        minute: 2,
        eventType: EVENT_TYPES.CHANCE_CREATED,
        description: 'batch 2',
        seq: 101,
        serverTimestamp: ts + 1000,
        metadata: {}
      }
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0].seq).toBe(100);
    expect(rows[1].seq).toBe(101);
    expect(rows[0].serverTimestamp).toBeTruthy();
    expect(rows[1].serverTimestamp).toBeTruthy();
  });
});
