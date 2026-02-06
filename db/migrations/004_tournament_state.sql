-- Migration: 004_tournament_state
-- Description: Persist tournament lifecycle state for event-driven round scheduling
-- Date: 2026-02-06

BEGIN;

-- ============================================
-- 1. Tournament state table (single active row)
-- ============================================
CREATE TABLE IF NOT EXISTS tournament_state (
    tournament_id INTEGER PRIMARY KEY,

    -- Lifecycle state
    state VARCHAR(30) NOT NULL DEFAULT 'IDLE'
      CHECK (state IN (
        'IDLE', 'SETUP', 'ROUND_ACTIVE', 'ROUND_COMPLETE',
        'INTER_ROUND_DELAY', 'RESULTS', 'COMPLETE'
      )),

    -- Which round is current (NULL when IDLE/COMPLETE)
    current_round VARCHAR(50)
      CHECK (current_round IS NULL OR current_round IN (
        'Round of 16', 'Quarter-finals', 'Semi-finals', 'Final'
      )),

    -- Timestamps for round and delay tracking
    round_started_at TIMESTAMPTZ,
    delay_started_at TIMESTAMPTZ,
    next_round_start_at TIMESTAMPTZ,

    -- Match duration config: even integer 2..20, immutable once tournament starts
    total_match_minutes INTEGER NOT NULL DEFAULT 8
      CHECK (total_match_minutes >= 2
         AND total_match_minutes <= 20
         AND total_match_minutes % 2 = 0),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
