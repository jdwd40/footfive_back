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
  PERSISTABLE_MATCH_EVENT_TYPES
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
