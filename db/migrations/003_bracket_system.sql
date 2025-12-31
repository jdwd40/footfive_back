-- Migration: 003_bracket_system
-- Description: Add bracket positioning and allow TBD teams for pre-generated fixtures
-- Date: 2025-12-31

BEGIN;

-- ============================================
-- 1. Allow NULL team IDs for TBD fixtures
-- ============================================

-- Drop the different_teams constraint temporarily
ALTER TABLE fixtures DROP CONSTRAINT IF EXISTS different_teams;

-- Make team IDs nullable for TBD fixtures
ALTER TABLE fixtures ALTER COLUMN home_team_id DROP NOT NULL;
ALTER TABLE fixtures ALTER COLUMN away_team_id DROP NOT NULL;

-- Re-add different_teams constraint that allows NULLs
ALTER TABLE fixtures ADD CONSTRAINT different_teams
  CHECK (home_team_id IS NULL OR away_team_id IS NULL OR home_team_id != away_team_id);

-- ============================================
-- 2. Add bracket positioning columns
-- ============================================

-- bracket_slot: Position in bracket (e.g., 'R16_1', 'QF1', 'SF1', 'FINAL')
ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS bracket_slot VARCHAR(20);

-- feeds_into: Which fixture the winner goes to (e.g., 'QF1' means winner goes to QF1)
ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS feeds_into VARCHAR(20);

-- Index for bracket queries
CREATE INDEX IF NOT EXISTS idx_fixtures_bracket_slot ON fixtures(bracket_slot);
CREATE INDEX IF NOT EXISTS idx_fixtures_tournament_bracket ON fixtures(tournament_id, bracket_slot);

COMMIT;
