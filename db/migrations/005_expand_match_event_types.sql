-- Migration: 005_expand_match_event_types
-- Description: Expand match_events valid_event_type CHECK to cover all current
--              and Stage-1 planned event types, and add nullable seq /
--              server_timestamp columns so EventBus ordering can be persisted.
-- Date: 2026-05-08

BEGIN;

-- ============================================
-- 1. Replace valid_event_type CHECK constraint
--    Preserves every type previously allowed by 001 + 002, and adds the
--    Stage-1 set declared in gamelogic/constants.js (PERSISTABLE_MATCH_EVENT_TYPES
--    plus shootout_walkup / shootout_reaction which are emitted today).
-- ============================================
ALTER TABLE match_events DROP CONSTRAINT IF EXISTS valid_event_type;

ALTER TABLE match_events ADD CONSTRAINT valid_event_type CHECK (
    event_type IN (
        -- Original (migration 001)
        'kickoff', 'goal', 'own_goal',
        'shot_saved', 'shot_missed', 'shot_blocked',
        'penalty_awarded', 'penalty_scored', 'penalty_missed', 'penalty_saved',
        'corner', 'foul', 'yellow_card', 'red_card',
        'substitution', 'injury',
        'halftime', 'fulltime',
        'extra_time_start', 'extra_time_half', 'extra_time_end',
        'shootout_start', 'shootout_goal', 'shootout_miss', 'shootout_save', 'shootout_end',
        'pressure', 'blocked',

        -- Added by migration 002
        'match_start', 'match_end', 'second_half_start',

        -- Already emitted by EventGenerator / LiveMatch / PenaltyShootout
        -- but missing from the previous CHECK list (silent insert failures)
        'chance_created', 'match_recap',
        'shootout_walkup', 'shootout_reaction',

        -- Stage-1 foundation types (declared in EVENT_TYPES, not emitted yet)
        'possession', 'build_up', 'keeper_distribution', 'defensive_action',
        'shot', 'save', 'miss', 'block',
        'counter_attack', 'breakaway', 'momentum_shift',
        'final_score', 'match_winner', 'match_draw',
        'penalty_shootout_start', 'penalty_taker',
        'penalty_sudden_death', 'penalty_winner'
    )
);

-- ============================================
-- 2. Persist EventBus ordering / timing on the match_events row itself.
--    Both columns are NULLABLE and additive; existing rows remain valid.
--    seq is BIGINT (EventBus.sequence is a JS number, monotonic per process).
--    server_timestamp records EventBus's serverTimestamp (epoch-ms wall clock)
--    as TIMESTAMPTZ for easy ordering / debugging.
-- ============================================
ALTER TABLE match_events ADD COLUMN IF NOT EXISTS seq BIGINT;
ALTER TABLE match_events ADD COLUMN IF NOT EXISTS server_timestamp TIMESTAMPTZ;

-- Index for replay queries that want strict EventBus ordering per fixture.
CREATE INDEX IF NOT EXISTS idx_events_fixture_seq
    ON match_events(fixture_id, seq);

COMMIT;
