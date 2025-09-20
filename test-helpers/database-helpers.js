const { setupTestDatabase, seedTestData, cleanupTestDatabase, closeTestConnection, db } = require('../db/test-seed');
const minimalTeams = require('../db/test-data/minimal-teams');

/**
 * Test Database Helper Functions
 * Use these functions in your tests to manage test database state
 */

class DatabaseTestHelper {
    /**
     * Set up a fresh test database with tables
     */
    static async setupFreshDatabase() {
        await setupTestDatabase();
    }

    /**
     * Seed database with full team data (16 teams)
     */
    static async seedFullData() {
        await seedTestData();
    }

    /**
     * Seed database with minimal test data (4 teams) - faster for unit tests
     */
    static async seedMinimalData() {
        await seedTestData(minimalTeams);
    }

    /**
     * Clean all data from test database but keep tables
     */
    static async cleanDatabase() {
        await cleanupTestDatabase();
    }

    /**
     * Close test database connection
     */
    static async closeConnection() {
        await closeTestConnection();
    }

    /**
     * Get direct database connection for custom queries in tests
     */
    static getConnection() {
        return db;
    }

    /**
     * Execute a custom query - useful for test assertions
     */
    static async query(text, params) {
        return await db.query(text, params);
    }

    /**
     * Get all teams from test database
     */
    static async getAllTeams() {
        const result = await db.query('SELECT * FROM teams ORDER BY team_id');
        return result.rows;
    }

    /**
     * Get all players for a specific team
     */
    static async getPlayersByTeamId(teamId) {
        const result = await db.query('SELECT * FROM players WHERE team_id = $1', [teamId]);
        return result.rows;
    }

    /**
     * Create a custom team for testing
     */
    static async createTestTeam(teamData) {
        const { name, players } = teamData;
        
        // Insert team
        const teamResult = await db.query(
            'INSERT INTO teams (name) VALUES ($1) RETURNING team_id',
            [name]
        );
        const teamId = teamResult.rows[0].team_id;

        // Insert players
        for (const player of players) {
            await db.query(
                'INSERT INTO players (team_id, name, attack, defense, is_goalkeeper) VALUES ($1, $2, $3, $4, $5)',
                [teamId, player.name, player.attack, player.defense, player.isGoalkeeper]
            );
        }

        return teamId;
    }

    /**
     * Update team statistics (for testing winner updates)
     */
    static async updateTeamStats(teamId, stats) {
        const { wins, losses, goals_for, goals_against, jcups_won, runner_ups } = stats;
        
        await db.query(`
            UPDATE teams 
            SET wins = COALESCE($2, wins),
                losses = COALESCE($3, losses),
                goals_for = COALESCE($4, goals_for),
                goals_against = COALESCE($5, goals_against),
                jcups_won = COALESCE($6, jcups_won),
                runner_ups = COALESCE($7, runner_ups)
            WHERE team_id = $1
        `, [teamId, wins, losses, goals_for, goals_against, jcups_won, runner_ups]);
    }

    /**
     * Reset all team statistics to zero
     */
    static async resetAllTeamStats() {
        await db.query(`
            UPDATE teams 
            SET wins = 0, losses = 0, goals_for = 0, goals_against = 0, 
                jcups_won = 0, runner_ups = 0
        `);
    }
}

module.exports = DatabaseTestHelper;
