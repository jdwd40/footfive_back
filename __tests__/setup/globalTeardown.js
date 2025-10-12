/**
 * Jest Global Teardown
 * Runs once after all test suites complete
 */

const { closeTestConnection } = require('../../db/test-seed');

module.exports = async () => {
  console.log('\n🧹 Cleaning up test environment...');
  
  try {
    // Close database connection
    await closeTestConnection();
    console.log('✅ Cleanup complete!\n');
  } catch (error) {
    console.error('⚠️  Warning: Cleanup failed:', error.message);
    // Don't throw - we don't want to fail tests due to cleanup issues
  }
};

