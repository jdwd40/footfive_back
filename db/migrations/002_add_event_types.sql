-- Migration: Add new event types for live simulation
-- Adds: match_start, match_end, second_half_start

-- Drop old constraint
ALTER TABLE match_events DROP CONSTRAINT IF EXISTS valid_event_type;

-- Add updated constraint with new event types
ALTER TABLE match_events ADD CONSTRAINT valid_event_type CHECK (
    event_type IN (
        'kickoff', 'goal', 'own_goal',
        'shot_saved', 'shot_missed', 'shot_blocked',
        'penalty_awarded', 'penalty_scored', 'penalty_missed', 'penalty_saved',
        'corner', 'foul', 'yellow_card', 'red_card',
        'substitution', 'injury',
        'halftime', 'fulltime',
        'extra_time_start', 'extra_time_half', 'extra_time_end',
        'shootout_start', 'shootout_goal', 'shootout_miss', 'shootout_save', 'shootout_end',
        'pressure', 'blocked',
        -- New event types for live simulation
        'match_start', 'match_end', 'second_half_start'
    )
);
