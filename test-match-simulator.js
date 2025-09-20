/**
 * MatchSimulator Tests
 * 
 * Tests for the core match simulation logic
 * Run with: node run-tests.js test-match-simulator.js
 */

const MatchSimulator = require('./Gamelogic/MatchSimulator');
const { DatabaseTestHelper } = require('./test-helpers/test-setup');

async function testMatchSimulator() {
    console.log('🏈 Testing MatchSimulator...\n');
    
    let testsPassed = 0;
    let testsTotal = 0;
    
    // Helper function to run a test
    const runTest = (testName, testFn) => {
        testsTotal++;
        try {
            const result = testFn();
            if (result === true || result === undefined) {
                console.log(`✅ ${testName}`);
                testsPassed++;
            } else {
                console.log(`❌ ${testName}: Expected true, got ${result}`);
            }
        } catch (error) {
            console.log(`❌ ${testName}: ${error.message}`);
        }
    };
    
    // Test 1: Basic match simulation
    runTest('Should simulate a complete match', () => {
        const team1 = { name: "Test Team A", attackRating: 80, defenseRating: 75, goalkeeperRating: 70 };
        const team2 = { name: "Test Team B", attackRating: 75, defenseRating: 80, goalkeeperRating: 75 };
        
        const match = new MatchSimulator(team1, team2);
        const result = match.simulate();
        
        // Check result structure
        if (!result.score || !result.highlights || !result.finalResult) {
            throw new Error('Missing required result properties');
        }
        
        // Check scores are numbers
        if (typeof result.score[team1.name] !== 'number' || typeof result.score[team2.name] !== 'number') {
            throw new Error('Scores should be numbers');
        }
        
        // Check scores are non-negative
        if (result.score[team1.name] < 0 || result.score[team2.name] < 0) {
            throw new Error('Scores should be non-negative');
        }
        
        return true;
    });
    
    // Test 2: Match highlights generation
    runTest('Should generate match highlights', () => {
        const team1 = { name: "Metro City", attackRating: 85, defenseRating: 80, goalkeeperRating: 75 };
        const team2 = { name: "Coastal City", attackRating: 80, defenseRating: 85, goalkeeperRating: 80 };
        
        const match = new MatchSimulator(team1, team2);
        const result = match.simulate();
        
        // Highlights are objects with description property
        const hasHalfTime = result.highlights.some(h => h.description && h.description.includes('Half time'));
        const hasFullTime = result.highlights.some(h => h.description && h.description.includes('Full time'));
        
        if (!hasHalfTime) throw new Error('Missing half-time highlight');
        if (!hasFullTime) throw new Error('Missing full-time highlight');
        
        return true;
    });
    
    // Test 3: Realistic score ranges
    runTest('Should produce realistic score ranges', () => {
        const team1 = { name: "Balanced Team 1", attackRating: 75, defenseRating: 75, goalkeeperRating: 70 };
        const team2 = { name: "Balanced Team 2", attackRating: 70, defenseRating: 80, goalkeeperRating: 75 };
        
        const regularTimeScores = [];
        const totalScores = [];
        
        // Run multiple simulations
        for (let i = 0; i < 10; i++) {
            const match = new MatchSimulator(team1, team2);
            const result = match.simulate();
            
            // Check if it was a penalty shootout (penalty scores > 0)
            const hadPenalties = Object.values(result.penaltyScore).some(score => score > 0);
            
            if (!hadPenalties) {
                // Regular time score
                regularTimeScores.push(result.score[team1.name] + result.score[team2.name]);
            }
            
            totalScores.push(result.score[team1.name] + result.score[team2.name]);
        }
        
        // Test regular time scores if we have any
        if (regularTimeScores.length > 0) {
            const avgRegularTime = regularTimeScores.reduce((a, b) => a + b, 0) / regularTimeScores.length;
            console.log(`   Regular time average: ${avgRegularTime.toFixed(1)} goals`);
            
            // Most football matches have 0-6 total goals in regular time
            if (avgRegularTime < 0 || avgRegularTime > 6) {
                throw new Error(`Unrealistic regular time average: ${avgRegularTime}`);
            }
        }
        
        // All scores should be reasonable (including penalty shootouts)
        const maxScore = Math.max(...totalScores);
        if (maxScore > 20) {  // Even with penalties, shouldn't be too crazy
            throw new Error(`Unrealistic maximum score: ${maxScore}`);
        }
        
        console.log(`   Score range: ${Math.min(...totalScores)}-${maxScore} goals`);
        return true;
    });
    
    // Test 4: Team rating effects
    runTest('Should reflect team strength in results', () => {
        const strongTeam = { name: "Strong", attackRating: 88, defenseRating: 85, goalkeeperRating: 80 };
        const weakTeam = { name: "Weak", attackRating: 30, defenseRating: 25, goalkeeperRating: 30 };
        
        let strongTeamWins = 0;
        const simulations = 20;
        
        for (let i = 0; i < simulations; i++) {
            const match = new MatchSimulator(strongTeam, weakTeam);
            const result = match.simulate();
            
            if (result.score[strongTeam.name] > result.score[weakTeam.name]) {
                strongTeamWins++;
            }
        }
        
        const winPercentage = strongTeamWins / simulations;
        
        // Strong team should win more often (at least 60% of the time)
        if (winPercentage < 0.6) {
            throw new Error(`Strong team should win more often. Win rate: ${winPercentage}`);
        }
        
        return true;
    });
    
    // Test 5: Constructor validation
    runTest('Should initialize correctly', () => {
        const team1 = { name: "Team 1", attackRating: 70, defenseRating: 70, goalkeeperRating: 70 };
        const team2 = { name: "Team 2", attackRating: 75, defenseRating: 75, goalkeeperRating: 75 };
        
        const match = new MatchSimulator(team1, team2);
        
        // homeTeam and awayTeam are stored as names, not objects
        if (match.homeTeam !== team1.name) throw new Error('Home team not set correctly');
        if (match.awayTeam !== team2.name) throw new Error('Away team not set correctly');
        if (match.team1 !== team1) throw new Error('Team1 not set correctly');
        if (match.team2 !== team2) throw new Error('Team2 not set correctly');
        if (match.score[team1.name] !== 0) throw new Error('Initial score should be 0');
        if (match.score[team2.name] !== 0) throw new Error('Initial score should be 0');
        if (match.minute !== 0) throw new Error('Initial minute should be 0');
        if (!Array.isArray(match.highlights)) throw new Error('Highlights should be an array');
        
        return true;
    });
    
    // Results
    console.log('\n📊 Match Simulator Test Results:');
    console.log(`   Passed: ${testsPassed}/${testsTotal}`);
    
    if (testsPassed === testsTotal) {
        console.log('   🎉 All tests passed!');
        return true;
    } else {
        console.log('   ❌ Some tests failed!');
        return false;
    }
}

// Run tests if called directly
if (require.main === module) {
    const { setupTestEnvironment, teardownTestEnvironment } = require('./test-helpers/test-setup');
    
    (async () => {
        try {
            await setupTestEnvironment();
            const success = await testMatchSimulator();
            await teardownTestEnvironment();
            process.exit(success ? 0 : 1);
        } catch (error) {
            console.error('Test execution failed:', error);
            await teardownTestEnvironment();
            process.exit(1);
        }
    })();
}

module.exports = { testMatchSimulator };
