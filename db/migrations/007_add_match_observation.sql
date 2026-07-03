-- Migration: 007_add_match_observation
-- Description: Stage G CommentaryEngine. Extend match_events.valid_event_type
--              CHECK to admit 'match_observation' — commentator-style
--              contextual analysis events (momentum, collapse, late drama,
--              ...). Subtype/severity ride in metadata JSONB; no new columns.
-- Date: 2026-07-03

BEGIN;

-- Recreate valid_event_type CHECK with the Stage-G addition appended.
-- Existing 006 list preserved verbatim; new type appended at the end.
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

        -- Migration 006 Stage-A chained-narrative types
        'midfield_battle', 'goal_build_up', 'attack_breakdown',
        'counter_breakdown', 'kickoff_restart',
        'penalty_walkup', 'penalty_run_up',

        -- Stage G: commentator observation events (this migration)
        'match_observation'
    )
);

COMMIT;
