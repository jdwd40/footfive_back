const DatabaseTestHelper = require('./database-helpers');

/**
 * Global test setup and teardown functions
 * Use these in your test files for consistent database state
 */

/**
 * Setup function to run before all tests
 * Creates fresh database and seeds with minimal data
 */
const setupTestEnvironment = async () => {
    try {
        console.log('Setting up test environment...');
        
        // Ensure we're in test mode
        process.env.NODE_ENV = 'test';
        
        // Setup fresh database
        await DatabaseTestHelper.setupFreshDatabase();
        
        // Seed with minimal data by default
        await DatabaseTestHelper.seedMinimalData();
        
        console.log('Test environment setup complete!');
    } catch (error) {
        console.error('Failed to setup test environment:', error);
        throw error;
    }
};

/**
 * Cleanup function to run after all tests
 */
const teardownTestEnvironment = async () => {
    try {
        console.log('Tearing down test environment...');
        
        // Clean database
        await DatabaseTestHelper.cleanDatabase();
        
        // Close connection
        await DatabaseTestHelper.closeConnection();
        
        console.log('Test environment teardown complete!');
    } catch (error) {
        console.error('Failed to teardown test environment:', error);
        // Don't throw here to avoid masking test failures
    }
};

/**
 * Reset database state between tests
 * Use this in beforeEach if you need fresh data for each test
 */
const resetTestDatabase = async () => {
    try {
        await DatabaseTestHelper.cleanDatabase();
        await DatabaseTestHelper.seedMinimalData();
    } catch (error) {
        console.error('Failed to reset test database:', error);
        throw error;
    }
};

/**
 * Setup for tests that need full tournament data (16 teams)
 */
const setupFullTournamentData = async () => {
    try {
        await DatabaseTestHelper.cleanDatabase();
        await DatabaseTestHelper.seedFullData();
    } catch (error) {
        console.error('Failed to setup full tournament data:', error);
        throw error;
    }
};

module.exports = {
    setupTestEnvironment,
    teardownTestEnvironment,
    resetTestDatabase,
    setupFullTournamentData,
    DatabaseTestHelper
};
