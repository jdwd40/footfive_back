-- Migration: 009_cyborg_garage
-- Description: Cyborg Garage layer - stadium sizes on teams, single shared
--              garage (bank balance), per-player garage state (mode, speed,
--              condition, energy), idempotent post-match results, and a
--              money audit trail. Garage credits are virtual only.
--              Data (garage row, spare players, stadium sizes) is initialised
--              in code by GarageService.ensureInitialized() so this migration
--              stays safe on empty databases.
-- Date: 2026-07-07

BEGIN;

-- ============================================
-- 1. Stadium size on teams (small/medium/large/mega, from team strength)
-- ============================================
ALTER TABLE teams ADD COLUMN IF NOT EXISTS stadium_size VARCHAR(10) NOT NULL DEFAULT 'medium';

-- ============================================
-- 2. The garage: single row (one shared user-controlled team)
-- ============================================
CREATE TABLE IF NOT EXISTS garage (
    garage_id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (garage_id = 1),
    team_id INTEGER UNIQUE NOT NULL REFERENCES teams(team_id) ON DELETE CASCADE,
    balance NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 3. Per-player garage state (only user-team players get rows)
-- ============================================
CREATE TABLE IF NOT EXISTS garage_players (
    player_id INTEGER PRIMARY KEY REFERENCES players(player_id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    mode VARCHAR(10) NOT NULL DEFAULT 'balanced'
      CHECK (mode IN ('passive', 'balanced', 'aggressive')),
    speed INTEGER NOT NULL DEFAULT 50 CHECK (speed BETWEEN 0 AND 100),
    condition INTEGER NOT NULL DEFAULT 100 CHECK (condition BETWEEN 0 AND 100),
    energy INTEGER NOT NULL DEFAULT 100 CHECK (energy BETWEEN 0 AND 100)
);

-- ============================================
-- 4. Post-match garage results (PRIMARY KEY on fixture_id makes reward
--    processing idempotent: a fixture can never be rewarded twice)
-- ============================================
CREATE TABLE IF NOT EXISTS garage_match_results (
    fixture_id INTEGER PRIMARY KEY REFERENCES fixtures(fixture_id) ON DELETE CASCADE,
    won BOOLEAN NOT NULL,
    reward_total NUMERIC(12,2) NOT NULL DEFAULT 0,
    breakdown JSONB NOT NULL DEFAULT '{}',
    player_changes JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 5. Garage money audit trail
-- ============================================
CREATE TABLE IF NOT EXISTS garage_transactions (
    transaction_id SERIAL PRIMARY KEY,
    amount NUMERIC(12,2) NOT NULL,
    balance_after NUMERIC(12,2) NOT NULL,
    transaction_type VARCHAR(30) NOT NULL
      CHECK (transaction_type IN ('starting_funds', 'match_reward', 'energy_purchase', 'repair', 'upgrade')),
    fixture_id INTEGER DEFAULT NULL,
    player_id INTEGER DEFAULT NULL,
    description TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_garage_tx_created ON garage_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_garage_results_created ON garage_match_results(created_at DESC);

COMMIT;
