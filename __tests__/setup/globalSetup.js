/**
 * Jest Global Setup
 * Runs once before all test suites
 */

const { setupTestDatabase, runTestMigrations } = require('../../db/test-seed');

module.exports = async () => {
  console.log('\n🔧 Setting up test environment...');
  
  // Ensure NODE_ENV is test
  process.env.NODE_ENV = 'test';
  
  try {
    await setupTestDatabase();
    await runTestMigrations();
    console.log('✅ Test database ready!\n');
  } catch (error) {
    console.error('❌ Failed to setup test database:', error.message);
    throw error;
  }
};

