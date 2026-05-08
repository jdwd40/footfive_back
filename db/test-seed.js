const fs = require('fs');
const path = require('path');
const db = require('./test-connection'); // Use test database connection
const format = require('pg-format');
const teamsData = require('./data/teams');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const MIGRATION_ORDER = ['001_match_system.sql', '002_add_event_types.sql', '003_bracket_system.sql', '004_tournament_state.sql', '005_expand_match_event_types.sql'];

const setupTestDatabase = async () => {
    try {
        console.log('Setting up test database...');
        // Drop all app tables so migrations run from clean state (idempotent across runs)
        await db.query('DROP TABLE IF EXISTS tournament_state CASCADE;');
        await db.query('DROP TABLE IF EXISTS match_events CASCADE;');
        await db.query('DROP TABLE IF EXISTS match_reports CASCADE;');
        await db.query('DROP TABLE IF EXISTS fixture_odds CASCADE;');
        await db.query('DROP TABLE IF EXISTS fixtures CASCADE;');
        await db.query('DROP TABLE IF EXISTS players CASCADE;');
        await db.query('DROP TABLE IF EXISTS teams CASCADE;');

        // Create teams table
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
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            ); 
        `);

        // Create players table
        await db.query(`
            CREATE TABLE players (
                player_id SERIAL PRIMARY KEY,
                team_id INTEGER NOT NULL REFERENCES teams(team_id),
                name VARCHAR(255) NOT NULL,
                attack INTEGER NOT NULL,
                defense INTEGER NOT NULL,
                is_goalkeeper BOOLEAN NOT NULL
            );
        `);

        console.log('Test database tables created successfully!');
        return true;
    } catch (error) {
        console.error('Error setting up test database:', error);
        throw error;
    }
};

/**
 * Run migration SQL files against test DB (after setupTestDatabase).
 * Ensures fixtures, match_events, tournament_state etc. exist for integration tests.
 */
const runTestMigrations = async () => {
    for (const file of MIGRATION_ORDER) {
        const filePath = path.join(MIGRATIONS_DIR, file);
        if (!fs.existsSync(filePath)) continue;
        const sql = fs.readFileSync(filePath, 'utf8');
        await db.query(sql);
    }
};

const seedTestData = async (customTeamsData = null) => {
    try {
        console.log('Seeding test data...');
        
        // Use custom data if provided, otherwise use default teams data
        const dataToSeed = customTeamsData || teamsData;
        
        // Clear existing data
        await db.query('DELETE FROM players;');
        await db.query('DELETE FROM teams;');
        await db.query('ALTER SEQUENCE teams_team_id_seq RESTART WITH 1;');
        await db.query('ALTER SEQUENCE players_player_id_seq RESTART WITH 1;');

        // Insert teams and players
        for (const team of dataToSeed) {
            const res = await db.query(
                format('INSERT INTO teams (name) VALUES (%L) RETURNING team_id', team.name)
            );
            const teamId = res.rows[0].team_id;

            const playerValues = team.players.map(p => [
                teamId,
                p.name,
                p.attack,
                p.defense,
                p.isGoalkeeper
            ]);

            await db.query(
                format('INSERT INTO players (team_id, name, attack, defense, is_goalkeeper) VALUES %L', playerValues)
            );
        }

        console.log(`Test database seeded with ${dataToSeed.length} teams successfully!`);
        return true;
    } catch (error) {
        console.error('Error seeding test data:', error);
        throw error;
    }
};

const cleanupTestDatabase = async () => {
    try {
        console.log('Cleaning up test database...');
        // Truncate in dependency order so each test starts from clean state
        await db.query(`
            TRUNCATE TABLE
                tournament_state,
                match_events,
                match_reports,
                fixture_odds,
                fixtures,
                players,
                teams
            RESTART IDENTITY CASCADE;
        `);
        console.log('Test database cleaned up successfully!');
        return true;
    } catch (error) {
        console.error('Error cleaning up test database:', error);
        throw error;
    }
};

const closeTestConnection = async () => {
    try {
        await db.end();
        console.log('Test database connection closed.');
    } catch (error) {
        console.error('Error closing test database connection:', error);
    }
};

module.exports = {
    setupTestDatabase,
    runTestMigrations,
    seedTestData,
    cleanupTestDatabase,
    closeTestConnection,
    db
};
