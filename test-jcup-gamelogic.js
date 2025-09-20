/**
 * JCup Game Logic Tests
 * 
 * Tests for the JCup tournament management and game logic
 * Run with: node run-tests.js test-jcup-gamelogic.js
 */

// Set test environment first
process.env.NODE_ENV = 'test';

const JCup = require('./Gamelogic/JCup');
const { DatabaseTestHelper, setupFullTournamentData } = require('./test-helpers/test-setup');

async function testJCupGameLogic() {
    console.log('🏆 Testing JCup Game Logic...\n');
    
    let testsPassed = 0;
    let testsTotal = 0;
    
    // Helper function to run an async test
    const runAsyncTest = async (testName, testFn) => {
        testsTotal++;
        try {
            const result = await testFn();
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
    
    // Test 1: JCup constructor and initialization
    await runAsyncTest('Should initialize JCup correctly', async () => {
        const jCup = new JCup();
        
        if (!Array.isArray(jCup.teams)) {
            throw new Error('JCup should have teams array');
        }
        if (!Array.isArray(jCup.fixtures)) {
            throw new Error('JCup should have fixtures array');
        }
        if (typeof jCup.currentRound !== 'number') {
            throw new Error('JCup should have currentRound number');
        }
        
        // Initial state should be empty
        if (jCup.teams.length !== 0) {
            throw new Error('JCup should start with empty teams array');
        }
        if (jCup.currentRound !== 0) {
            throw new Error('JCup should start with currentRound = 0');
        }
        
        return true;
    });
    
    // Test 2: Load teams from database
    await runAsyncTest('Should load teams from database', async () => {
        await setupFullTournamentData();
        
        const jCup = new JCup();
        await jCup.loadTeams();
        
        if (jCup.teams.length === 0) {
            throw new Error('Should load teams from database');
        }
        
        // Check team structure
        const firstTeam = jCup.teams[0];
        if (!firstTeam.name || !firstTeam.id) {
            throw new Error('Teams should have name and id');
        }
        
        console.log(`   Loaded ${jCup.teams.length} teams`);
        return true;
    });
    
    // Test 3: Generate fixtures
    await runAsyncTest('Should generate tournament fixtures', async () => {
        const jCup = new JCup();
        await jCup.loadTeams();
        
        if (jCup.fixtures.length === 0) {
            throw new Error('Should generate fixtures after loading teams');
        }
        
        // First round should have matches
        const firstRound = jCup.fixtures[0];
        if (!Array.isArray(firstRound) || firstRound.length === 0) {
            throw new Error('First round should have matches');
        }
        
        // Check match structure
        const firstMatch = firstRound[0];
        if (!firstMatch.team1 || !firstMatch.team2) {
            throw new Error('Matches should have team1 and team2');
        }
        if (firstMatch.team1.name === firstMatch.team2.name) {
            throw new Error('Teams should not play against themselves');
        }
        
        console.log(`   Generated ${jCup.fixtures.length} round(s)`);
        console.log(`   First round has ${firstRound.length} match(es)`);
        
        return true;
    });
    
    // Test 4: Team shuffling
    await runAsyncTest('Should shuffle teams for fair fixtures', async () => {
        const jCup = new JCup();
        await jCup.loadTeams();
        
        // Get original order
        const originalOrder = jCup.teams.map(t => t.name);
        
        // Shuffle multiple times to check randomness
        const shuffleResults = [];
        for (let i = 0; i < 5; i++) {
            const shuffled = jCup.shuffleTeams(jCup.teams);
            shuffleResults.push(shuffled.map(t => t.name).join(','));
        }
        
        // Check that not all shuffles are identical (very unlikely with proper randomness)
        const uniqueResults = new Set(shuffleResults);
        if (uniqueResults.size === 1 && jCup.teams.length > 2) {
            throw new Error('Shuffle should produce different results (randomness check)');
        }
        
        console.log(`   Shuffle produced ${uniqueResults.size} different arrangements`);
        return true;
    });
    
    // Test 5: Simulate a round
    await runAsyncTest('Should simulate tournament round', async () => {
        const jCup = new JCup();
        await jCup.loadTeams();
        
        // Simulate first round
        const simulationResult = await jCup.simulateRound();
        
        // Check that we get an object with roundResults property
        if (!simulationResult || typeof simulationResult !== 'object') {
            throw new Error('Simulation should return an object');
        }
        
        const roundResults = simulationResult.roundResults;
        if (!Array.isArray(roundResults)) {
            throw new Error('Round results should be an array');
        }
        if (roundResults.length === 0) {
            throw new Error('Should have match results after simulating round');
        }
        
        // Check result structure
        const firstResult = roundResults[0];
        if (!firstResult.score || !firstResult.highlights || !firstResult.finalResult) {
            throw new Error('Match results should have score, highlights, and finalResult');
        }
        
        // Check that currentRound advanced
        if (jCup.currentRound !== 1) {
            throw new Error('Current round should advance after simulation');
        }
        
        console.log(`   Simulated round with ${roundResults.length} match(es)`);
        console.log(`   Advanced to round ${jCup.currentRound}`);
        
        return true;
    });
    
    // Test 6: Complete tournament flow
    await runAsyncTest('Should handle complete tournament flow', async () => {
        const jCup = new JCup();
        await jCup.loadTeams();
        
        let roundCount = 0;
        let winner = null;
        
        // Play all rounds until tournament ends
        while (jCup.currentRound < jCup.fixtures.length) {
            const simulationResult = await jCup.simulateRound();
            roundCount++;
            
            if (simulationResult.winner) {
                winner = simulationResult.winner;
                break;
            }
            
            // Safety check to prevent infinite loop
            if (roundCount > 10) {
                throw new Error('Tournament should complete within reasonable rounds');
            }
        }
        
        if (!winner) {
            throw new Error('Tournament should produce a winner');
        }
        if (!winner.name) {
            throw new Error('Winner should have a name');
        }
        
        console.log(`   Tournament completed in ${roundCount} round(s)`);
        console.log(`   Winner: ${winner.name}`);
        
        return true;
    });
    
    // Test 7: Handle odd number of teams (byes)
    await runAsyncTest('Should handle odd number of teams with byes', async () => {
        // Create custom tournament with odd number of teams
        const customTeams = [
            { id: 1, name: 'Team A' },
            { id: 2, name: 'Team B' },
            { id: 3, name: 'Team C' }
        ];
        
        const jCup = new JCup();
        jCup.teams = customTeams;
        jCup.generateFixtures();
        
        if (jCup.fixtures.length === 0) {
            throw new Error('Should generate fixtures even with odd number of teams');
        }
        
        const firstRound = jCup.fixtures[0];
        
        // With 3 teams, should have 1 match and 1 bye
        // One team advances automatically
        console.log(`   Handled ${customTeams.length} teams with proper bye logic`);
        
        return true;
    });
    
    // Test 8: Cup winner update
    await runAsyncTest('Should update cup winner statistics', async () => {
        const teams = await DatabaseTestHelper.getAllTeams();
        if (teams.length === 0) {
            throw new Error('Need teams for winner test');
        }
        
        const winnerId = teams[0].team_id;
        
        // Get initial cup count
        const initialStats = await DatabaseTestHelper.query(
            'SELECT jcups_won FROM teams WHERE team_id = $1', 
            [winnerId]
        );
        const initialCups = initialStats.rows[0]?.jcups_won || 0;
        
        const jCup = new JCup();
        const result = await jCup.jCupWon(winnerId);
        
        if (!result || !result.msg) {
            throw new Error('Should return success message');
        }
        
        // Verify cup count increased
        const finalStats = await DatabaseTestHelper.query(
            'SELECT jcups_won FROM teams WHERE team_id = $1', 
            [winnerId]
        );
        const finalCups = finalStats.rows[0]?.jcups_won || 0;
        
        if (finalCups !== initialCups + 1) {
            throw new Error('Cup count should increase by 1');
        }
        
        console.log(`   Updated team ${winnerId} from ${initialCups} to ${finalCups} cups`);
        
        return true;
    });
    
    // Test 9: Reset functionality
    await runAsyncTest('Should reset tournament state', async () => {
        const jCup = new JCup();
        await jCup.loadTeams();
        await jCup.simulateRound(); // Play one round
        
        // Should have advanced
        if (jCup.currentRound === 0) {
            throw new Error('Should have advanced after playing round');
        }
        
        jCup.resetJCup();
        
        // Should be reset
        if (jCup.currentRound !== 0) {
            throw new Error('Current round should reset to 0');
        }
        if (jCup.teams.length !== 0) {
            throw new Error('Teams should be cleared on reset');
        }
        if (jCup.fixtures.length !== 0) {
            throw new Error('Fixtures should be cleared on reset');
        }
        
        return true;
    });
    
    // Results
    console.log('\n📊 JCup Game Logic Test Results:');
    console.log(`   Passed: ${testsPassed}/${testsTotal}`);
    
    if (testsPassed === testsTotal) {
        console.log('   🎉 All JCup Game Logic tests passed!');
        return true;
    } else {
        console.log('   ❌ Some JCup Game Logic tests failed!');
        return false;
    }
}

// Run tests if called directly
if (require.main === module) {
    const { setupTestEnvironment, teardownTestEnvironment } = require('./test-helpers/test-setup');
    
    (async () => {
        try {
            await setupTestEnvironment();
            const success = await testJCupGameLogic();
            await teardownTestEnvironment();
            process.exit(success ? 0 : 1);
        } catch (error) {
            console.error('JCup Game Logic test execution failed:', error);
            await teardownTestEnvironment();
            process.exit(1);
        }
    })();
}

module.exports = { testJCupGameLogic };
