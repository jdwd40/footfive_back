-- Migration: 008_betting_system
-- Description: Virtual betting layer - users, wallets, wallet transactions, bets.
--              Virtual/dummy funds only. No real money, no payment providers.
-- Date: 2026-07-04

BEGIN;

-- ============================================
-- 1. Users (minimal account support for betting)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    username VARCHAR(30) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 2. User wallets (virtual credits only)
-- ============================================
CREATE TABLE IF NOT EXISTS user_wallets (
    wallet_id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    balance NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 3. Wallet transactions (audit trail for virtual funds)
-- ============================================
CREATE TABLE IF NOT EXISTS wallet_transactions (
    transaction_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    -- Positive = credit, negative = debit
    amount NUMERIC(12,2) NOT NULL,
    balance_after NUMERIC(12,2) NOT NULL,
    transaction_type VARCHAR(30) NOT NULL
      CHECK (transaction_type IN ('dummy_funds', 'bet_stake', 'bet_payout', 'bet_refund')),
    bet_id INTEGER DEFAULT NULL,
    description TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 4. Bets
-- ============================================
CREATE TABLE IF NOT EXISTS bets (
    bet_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    bet_type VARCHAR(30) NOT NULL
      CHECK (bet_type IN ('fixture_winner', 'live_fixture_winner', 'championship_winner')),
    -- NULL for championship_winner bets
    fixture_id INTEGER DEFAULT NULL REFERENCES fixtures(fixture_id) ON DELETE SET NULL,
    -- Set for championship_winner bets (matches fixtures.tournament_id)
    tournament_id INTEGER DEFAULT NULL,
    selected_team_id INTEGER NOT NULL REFERENCES teams(team_id) ON DELETE CASCADE,
    stake NUMERIC(12,2) NOT NULL CHECK (stake > 0),
    odds_at_placement NUMERIC(6,2) NOT NULL CHECK (odds_at_placement >= 1.01),
    potential_return NUMERIC(12,2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'won', 'lost', 'void')),
    placed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    settled_at TIMESTAMPTZ DEFAULT NULL,
    settlement_note TEXT DEFAULT NULL
);

-- ============================================
-- 5. Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_wallet_tx_user ON wallet_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bets_user ON bets(user_id, placed_at DESC);
CREATE INDEX IF NOT EXISTS idx_bets_fixture ON bets(fixture_id) WHERE fixture_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bets_status ON bets(status);
CREATE INDEX IF NOT EXISTS idx_bets_tournament ON bets(tournament_id) WHERE tournament_id IS NOT NULL;

COMMIT;
