/**
 * Jest Global Setup
 * Runs once before all test suites
 */

const { setupTestDatabase } = require('../../db/test-seed');

module.exports = async () => {
  console.log('\n🔧 Setting up test environment...');
  
  // Ensure NODE_ENV is test
  process.env.NODE_ENV = 'test';
  
  try {
    // Setup test database schema
    await setupTestDatabase();
    console.log('✅ Test database ready!\n');
  } catch (error) {
    console.error('❌ Failed to setup test database:', error.message);
    throw error;
  }
};

