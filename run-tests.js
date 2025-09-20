#!/usr/bin/env node

/**
 * FootFive Test Runner
 * 
 * This script runs tests with proper test database setup and cleanup
 * Usage: node run-tests.js [test-file]
 * 
 * Examples:
 *   node run-tests.js                    # Run all tests
 *   node run-tests.js test-match.js      # Run specific test file
 *   node run-tests.js --setup-only       # Just setup test database
 */

const { setupTestEnvironment, teardownTestEnvironment } = require('./test-helpers/test-setup');
const path = require('path');
const { spawn } = require('child_process');

async function runTests() {
    const args = process.argv.slice(2);
    const setupOnly = args.includes('--setup-only');
    const testFile = args.find(arg => !arg.startsWith('--')) || 'test.js';
    
    console.log('🚀 FootFive Test Runner');
    console.log('========================\n');
    
    try {
        // Setup test environment
        console.log('📋 Setting up test environment...');
        await setupTestEnvironment();
        console.log('✅ Test environment ready!\n');
        
        if (setupOnly) {
            console.log('🔧 Setup complete. Test database is ready for use.');
            console.log('   Database: footfive_test');
            console.log('   Environment: NODE_ENV=test');
            return;
        }
        
        // Run the specified test file
        console.log(`🧪 Running tests: ${testFile}`);
        console.log('----------------------------------------\n');
        
        // Set test environment
        process.env.NODE_ENV = 'test';
        
        // Run the test file
        if (testFile.endsWith('.js') && require('fs').existsSync(testFile)) {
            try {
                require(path.resolve(testFile));
                console.log('\n✅ Tests completed successfully!');
            } catch (error) {
                console.error('\n❌ Test execution failed:');
                console.error(error);
                process.exitCode = 1;
            }
        } else {
            console.error(`❌ Test file not found: ${testFile}`);
            process.exitCode = 1;
        }
        
    } catch (error) {
        console.error('❌ Test setup failed:', error.message);
        process.exitCode = 1;
    } finally {
        // Always cleanup
        console.log('\n🧹 Cleaning up test environment...');
        await teardownTestEnvironment();
        console.log('✅ Cleanup complete!');
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n\n🛑 Tests interrupted. Cleaning up...');
    await teardownTestEnvironment();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n\n🛑 Tests terminated. Cleaning up...');
    await teardownTestEnvironment();
    process.exit(0);
});

// Run if called directly
if (require.main === module) {
    runTests().catch(console.error);
}

module.exports = { runTests };
