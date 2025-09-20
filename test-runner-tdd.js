#!/usr/bin/env node

/**
 * FootFive TDD Test Runner
 * 
 * Comprehensive test suite for Test-Driven Development
 * Runs all tests in logical order with clear reporting
 * 
 * Usage: npm test
 */

const { setupTestEnvironment, teardownTestEnvironment } = require('./test-helpers/test-setup');

// Import all test modules
const { testMatchSimulator } = require('./test-match-simulator');
const { testJCupGameLogic } = require('./test-jcup-gamelogic');
const { testTeamModel } = require('./test-team-model');
const { testTeamController } = require('./test-team-controller');
const { testJCupController } = require('./test-jcup-controller');

class TDDTestRunner {
    constructor() {
        this.totalTests = 0;
        this.passedTests = 0;
        this.failedTests = 0;
        this.testSuites = [];
        this.startTime = Date.now();
    }

    async runAllTests() {
        console.log('🚀 FootFive TDD Test Suite');
        console.log('============================');
        console.log(`Started at: ${new Date().toLocaleTimeString()}\n`);

        try {
            // Setup global test environment
            console.log('📋 Setting up test environment...');
            await setupTestEnvironment();
            console.log('✅ Test environment ready!\n');

            // Define test suites in TDD order
            const testSuites = [
                {
                    name: 'Game Logic - Match Simulator',
                    icon: '⚽',
                    description: 'Core match simulation engine',
                    testFunction: testMatchSimulator,
                    category: 'Unit Tests'
                },
                {
                    name: 'Game Logic - JCup Tournament',
                    icon: '🏆',
                    description: 'Tournament management and game flow',
                    testFunction: testJCupGameLogic,
                    category: 'Unit Tests'
                },
                {
                    name: 'Database Models - Team Model',
                    icon: '🗄️',
                    description: 'Database operations and team ratings',
                    testFunction: testTeamModel,
                    category: 'Integration Tests'
                },
                {
                    name: 'API Controllers - Team Controller',
                    icon: '🌐',
                    description: 'Team management API endpoints',
                    testFunction: testTeamController,
                    category: 'API Tests'
                },
                {
                    name: 'API Controllers - JCup Controller',
                    icon: '🏆',
                    description: 'Tournament management API endpoints',
                    testFunction: testJCupController,
                    category: 'API Tests'
                }
            ];

            let currentCategory = '';
            
            // Run each test suite
            for (const suite of testSuites) {
                // Print category header if changed
                if (suite.category !== currentCategory) {
                    currentCategory = suite.category;
                    console.log(`\n📂 ${currentCategory}`);
                    console.log('─'.repeat(50));
                }

                console.log(`\n${suite.icon} ${suite.name}`);
                console.log(`   ${suite.description}`);
                console.log('   ' + '─'.repeat(40));

                try {
                    const suiteResult = await suite.testFunction();
                    
                    if (suiteResult) {
                        console.log(`   ✅ PASSED - All tests in ${suite.name}`);
                        this.testSuites.push({
                            name: suite.name,
                            status: 'PASSED',
                            icon: '✅'
                        });
                    } else {
                        console.log(`   ❌ FAILED - Some tests failed in ${suite.name}`);
                        this.testSuites.push({
                            name: suite.name,
                            status: 'FAILED',
                            icon: '❌'
                        });
                        this.failedTests++;
                    }
                } catch (error) {
                    console.log(`   💥 ERROR - ${suite.name} crashed: ${error.message}`);
                    this.testSuites.push({
                        name: suite.name,
                        status: 'ERROR',
                        icon: '💥'
                    });
                    this.failedTests++;
                }
            }

            // Print comprehensive summary
            await this.printSummary();

        } catch (error) {
            console.error('\n💥 Test environment setup failed:', error.message);
            process.exitCode = 1;
        } finally {
            // Always cleanup
            console.log('\n🧹 Cleaning up test environment...');
            await teardownTestEnvironment();
            console.log('✅ Cleanup complete!');
        }
    }

    async printSummary() {
        const endTime = Date.now();
        const duration = ((endTime - this.startTime) / 1000).toFixed(2);
        
        console.log('\n' + '='.repeat(60));
        console.log('📊 TDD TEST SUITE SUMMARY');
        console.log('='.repeat(60));
        
        // Overall status
        const allPassed = this.testSuites.every(suite => suite.status === 'PASSED');
        if (allPassed) {
            console.log('🎉 ALL TESTS PASSED - Ready for TDD Development!');
        } else {
            console.log('❌ SOME TESTS FAILED - Fix before continuing TDD');
        }
        
        console.log(`⏱️  Duration: ${duration}s`);
        console.log(`📅 Completed: ${new Date().toLocaleTimeString()}\n`);

        // Test suite breakdown
        console.log('📋 Test Suite Results:');
        this.testSuites.forEach(suite => {
            console.log(`   ${suite.icon} ${suite.name} - ${suite.status}`);
        });

        // TDD Status
        console.log('\n🔄 TDD Development Status:');
        if (allPassed) {
            console.log('   ✅ All components tested and working');
            console.log('   ✅ Database integration verified');
            console.log('   ✅ API endpoints validated');
            console.log('   ✅ Game logic functioning correctly');
            console.log('   🚀 Ready for Test-Driven Development!');
            console.log('\n💡 TDD Workflow:');
            console.log('   1. Write failing test first (RED)');
            console.log('   2. Write minimal code to pass (GREEN)');
            console.log('   3. Refactor while keeping tests green (REFACTOR)');
            console.log('   4. Run: npm test (to verify all tests still pass)');
        } else {
            console.log('   ❌ Fix failing tests before starting TDD');
            console.log('   🔧 Run individual test suites to debug:');
            console.log('      npm run test:match');
            console.log('      npm run test:team');
            console.log('      npm run test:team-api');
            console.log('      npm run test:jcup-api');
        }

        console.log('\n' + '='.repeat(60));
        
        // Set exit code
        if (!allPassed) {
            process.exitCode = 1;
        }
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
    const runner = new TDDTestRunner();
    runner.runAllTests().catch(error => {
        console.error('💥 TDD Test Runner failed:', error);
        process.exit(1);
    });
}

module.exports = TDDTestRunner;
