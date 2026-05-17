-- Migration: 006_expand_match_event_types
-- Description: Stage A of flow-chain work. Extend match_events.valid_event_type
--              CHECK to admit the new chained-narrative types so EventGenerator
--              can emit them in later stages without silent rejects.
--              counter_attack is already permitted by migration 005 (Stage-1
--              foundation set) and is reused for the counter chain step 1.
-- Date: 2026-05-17

BEGIN;

-- Recreate valid_event_type CHECK with Stage-A additions appended.
-- Existing 005 list preserved verbatim; new types appended at the end.
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

        -- Migration 002
        'match_start', 'match_end', 'second_half_start',

        -- Migration 005 fill-ins
        'chance_created', 'match_recap',
        'shootout_walkup', 'shootout_reaction',

        -- Migration 005 Stage-1 foundation set
        'possession', 'build_up', 'keeper_distribution', 'defensive_action',
        'shot', 'save', 'miss', 'block',
        'counter_attack', 'breakaway', 'momentum_shift',
        'final_score', 'match_winner', 'match_draw',
        'penalty_shootout_start', 'penalty_taker',
        'penalty_sudden_death', 'penalty_winner',

        -- Stage A: chained-narrative types (this migration)
        -- Midfield phase (single emit, outcome in metadata).
        'midfield_battle',
        -- Attack chain build-up steps 1-2 (existing build_up_play left alone).
        'goal_build_up',
        -- Attack chain terminal failure before shot (defender block / shut down).
        'attack_breakdown',
        -- Counter chain terminal failure step 1 (shut down on the break).
        -- counter_attack itself is already permitted (foundation set above).
        'counter_breakdown',
        -- Restart after a goal, suppressed if half/full/ET-end/match-end follows.
        'kickoff_restart',
        -- In-game penalty chain lead-in (mirrors shootout_walkup naming).
        'penalty_walkup',
        -- In-game penalty chain run-up between walkup and outcome.
        'penalty_run_up'
    )
);

COMMIT;
