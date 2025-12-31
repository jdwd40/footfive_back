const db = require('./connection'); // Your PostgreSQL connection setup
const format = require('pg-format');

const seed = async (data) => {
    // Handle both direct teams array and data object with teams property
    const teamsData = data && data.teams ? data.teams : require('./data/teams');

    // Start by clearing all existing data (in reverse dependency order)
    await db.query('DROP TABLE IF EXISTS fixture_odds CASCADE;');
    await db.query('DROP TABLE IF EXISTS match_events CASCADE;');
    await db.query('DROP TABLE IF EXISTS match_reports CASCADE;');
    await db.query('DROP TABLE IF EXISTS fixtures CASCADE;');
    await db.query('DROP TABLE IF EXISTS players CASCADE;');
    await db.query('DROP TABLE IF EXISTS teams CASCADE;');

    // Recreate the teams table
    await db.query(`
    CREATE TABLE teams (
        team_id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        wins INTEGER DEFAULT 0 NOT NULL,
        losses INTEGER DEFAULT 0 NOT NULL,
        goals_for INTEGER DEFAULT 0 NOT NULL,
        goals_against INTEGER DEFAULT 0 NOT NULL,
        jcups_won INTEGER DEFAULT 0 NOT NULL,
        runner_ups INTEGER DEFAULT 0 NOT NULL,
        highest_round_reached VARCHAR(50) DEFAULT NULL,
        recent_form VARCHAR(10) DEFAULT '',
        goal_diff INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    `);

    // Recreate the players table
    await db.query(`
        CREATE TABLE players (
            player_id SERIAL PRIMARY KEY,
            team_id INTEGER NOT NULL REFERENCES teams(team_id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            attack INTEGER NOT NULL,
            defense INTEGER NOT NULL,
            is_goalkeeper BOOLEAN NOT NULL
        );
    `);

    // Create fixtures table with bracket system support
    // - Nullable team IDs for TBD fixtures in future rounds
    // - bracket_slot for position in bracket (R16_1, QF1, SF1, FINAL)
    // - feeds_into for which fixture winner advances to
    await db.query(`
        CREATE TABLE fixtures (
            fixture_id SERIAL PRIMARY KEY,
            home_team_id INTEGER REFERENCES teams(team_id) ON DELETE CASCADE,
            away_team_id INTEGER REFERENCES teams(team_id) ON DELETE CASCADE,
            tournament_id INTEGER DEFAULT NULL,
            round VARCHAR(50),
            scheduled_at TIMESTAMP DEFAULT NOW(),
            status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'completed')),
            home_score INTEGER DEFAULT NULL,
            away_score INTEGER DEFAULT NULL,
            home_penalty_score INTEGER DEFAULT NULL,
            away_penalty_score INTEGER DEFAULT NULL,
            winner_team_id INTEGER REFERENCES teams(team_id) ON DELETE SET NULL,
            created_at TIMESTAMP DEFAULT NOW(),
            completed_at TIMESTAMP DEFAULT NULL,
            bracket_slot VARCHAR(20),
            feeds_into VARCHAR(20),
            CONSTRAINT different_teams CHECK (home_team_id IS NULL OR away_team_id IS NULL OR home_team_id != away_team_id)
        );
    `);

    // Create match_reports table
    await db.query(`
        CREATE TABLE match_reports (
            report_id SERIAL PRIMARY KEY,
            fixture_id INTEGER UNIQUE NOT NULL REFERENCES fixtures(fixture_id) ON DELETE CASCADE,
            home_possession DECIMAL(5,2) DEFAULT 50.00,
            away_possession DECIMAL(5,2) DEFAULT 50.00,
            home_shots INTEGER DEFAULT 0,
            away_shots INTEGER DEFAULT 0,
            home_shots_on_target INTEGER DEFAULT 0,
            away_shots_on_target INTEGER DEFAULT 0,
            home_xg DECIMAL(4,2) DEFAULT 0.00,
            away_xg DECIMAL(4,2) DEFAULT 0.00,
            home_corners INTEGER DEFAULT 0,
            away_corners INTEGER DEFAULT 0,
            home_fouls INTEGER DEFAULT 0,
            away_fouls INTEGER DEFAULT 0,
            home_yellow_cards INTEGER DEFAULT 0,
            away_yellow_cards INTEGER DEFAULT 0,
            home_red_cards INTEGER DEFAULT 0,
            away_red_cards INTEGER DEFAULT 0,
            extra_time_played BOOLEAN DEFAULT FALSE,
            penalties_played BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT NOW(),
            CONSTRAINT valid_possession CHECK (home_possession + away_possession BETWEEN 99.00 AND 101.00)
        );
    `);

    // Create match_events table
    await db.query(`
        CREATE TABLE match_events (
            event_id SERIAL PRIMARY KEY,
            fixture_id INTEGER NOT NULL REFERENCES fixtures(fixture_id) ON DELETE CASCADE,
            minute INTEGER NOT NULL CHECK (minute >= 0 AND minute <= 130),
            second INTEGER DEFAULT 0 CHECK (second >= 0 AND second < 60),
            added_time INTEGER DEFAULT NULL,
            event_type VARCHAR(30) NOT NULL,
            team_id INTEGER REFERENCES teams(team_id) ON DELETE SET NULL,
            player_id INTEGER REFERENCES players(player_id) ON DELETE SET NULL,
            assist_player_id INTEGER REFERENCES players(player_id) ON DELETE SET NULL,
            description TEXT,
            xg DECIMAL(4,2) DEFAULT NULL,
            outcome VARCHAR(20) DEFAULT NULL,
            bundle_id VARCHAR(50) DEFAULT NULL,
            bundle_step INTEGER DEFAULT NULL,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMP DEFAULT NOW(),
            CONSTRAINT valid_event_type CHECK (
                event_type IN (
                    'kickoff', 'goal', 'own_goal',
                    'shot_saved', 'shot_missed', 'shot_blocked',
                    'penalty_awarded', 'penalty_scored', 'penalty_missed', 'penalty_saved',
                    'corner', 'foul', 'yellow_card', 'red_card',
                    'substitution', 'injury',
                    'halftime', 'fulltime',
                    'extra_time_start', 'extra_time_half', 'extra_time_end',
                    'shootout_start', 'shootout_goal', 'shootout_miss', 'shootout_save', 'shootout_end',
                    'pressure', 'blocked'
                )
            )
        );
    `);

    // Create fixture_odds table
    await db.query(`
        CREATE TABLE fixture_odds (
            odds_id SERIAL PRIMARY KEY,
            fixture_id INTEGER UNIQUE NOT NULL REFERENCES fixtures(fixture_id) ON DELETE CASCADE,
            home_win_prob DECIMAL(5,4) NOT NULL CHECK (home_win_prob > 0 AND home_win_prob < 1),
            away_win_prob DECIMAL(5,4) NOT NULL CHECK (away_win_prob > 0 AND away_win_prob < 1),
            home_win_odds DECIMAL(6,2) NOT NULL CHECK (home_win_odds >= 1.01),
            away_win_odds DECIMAL(6,2) NOT NULL CHECK (away_win_odds >= 1.01),
            margin DECIMAL(4,2) DEFAULT 0.05,
            factors JSONB DEFAULT '{}',
            calculated_at TIMESTAMP DEFAULT NOW(),
            CONSTRAINT probs_sum_to_one CHECK (home_win_prob + away_win_prob BETWEEN 0.99 AND 1.01)
        );
    `);

    // Create indexes for performance
    await db.query(`
        CREATE INDEX idx_fixtures_status ON fixtures(status);
        CREATE INDEX idx_fixtures_home_team ON fixtures(home_team_id);
        CREATE INDEX idx_fixtures_away_team ON fixtures(away_team_id);
        CREATE INDEX idx_fixtures_winner ON fixtures(winner_team_id);
        CREATE INDEX idx_fixtures_round ON fixtures(round);
        CREATE INDEX idx_fixtures_bracket_slot ON fixtures(bracket_slot);
        CREATE INDEX idx_fixtures_tournament_bracket ON fixtures(tournament_id, bracket_slot);
        CREATE INDEX idx_events_fixture ON match_events(fixture_id);
        CREATE INDEX idx_events_type ON match_events(event_type);
        CREATE INDEX idx_events_minute ON match_events(fixture_id, minute);
        CREATE INDEX idx_events_team ON match_events(team_id);
        CREATE INDEX idx_events_player ON match_events(player_id);
        CREATE INDEX idx_events_bundle ON match_events(bundle_id);
        CREATE INDEX idx_odds_fixture ON fixture_odds(fixture_id);
    `);

    // Create goal_diff trigger
    await db.query(`
        CREATE OR REPLACE FUNCTION update_goal_diff()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.goal_diff := NEW.goals_for - NEW.goals_against;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS trigger_update_goal_diff ON teams;
        CREATE TRIGGER trigger_update_goal_diff
            BEFORE UPDATE OF goals_for, goals_against ON teams
            FOR EACH ROW
            EXECUTE FUNCTION update_goal_diff();
    `);

    // Insert teams and players
    for (const team of teamsData) {
        const res = await db.query(format('INSERT INTO teams (name) VALUES (%L) RETURNING team_id', team.name));
        const teamId = res.rows[0].team_id;

        const playerValues = team.players.map(p => [
            teamId,
            p.name,
            p.attack,
            p.defense,
            p.isGoalkeeper
        ]);

        await db.query(format('INSERT INTO players (team_id, name, attack, defense, is_goalkeeper) VALUES %L', playerValues));
    }

    console.log('Database seeded successfully!');
};

module.exports =  { seed };
