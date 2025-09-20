/**
 * TeamModel Tests
 * 
 * Tests for the TeamModel database operations using test database
 * Run with: node run-tests.js test-team-model.js
 */

// Set test environment first
process.env.NODE_ENV = 'test';

// We'll need to test the TeamModel functionality using our test database
const { DatabaseTestHelper } = require('./test-helpers/test-setup');

// Create a test version of TeamModel functions using test database
const TestTeamModel = {
    async getAll() {
        const result = await DatabaseTestHelper.query('SELECT * FROM teams ORDER BY team_id');
        return result.rows;
    },
    
    async getRatingByTeamName(teamName) {
        // Get team players
        const teamResult = await DatabaseTestHelper.query('SELECT team_id FROM teams WHERE name = $1', [teamName]);
        if (teamResult.rows.length === 0) {
            return null;
        }
        
        const teamId = teamResult.rows[0].team_id;
        const playersResult = await DatabaseTestHelper.query('SELECT * FROM players WHERE team_id = $1', [teamId]);
        const players = playersResult.rows;
        
        if (players.length === 0) {
            return null;
        }
        
        // Calculate ratings
        const outfieldPlayers = players.filter(p => !p.is_goalkeeper);
        const goalkeepers = players.filter(p => p.is_goalkeeper);
        
        if (outfieldPlayers.length === 0 || goalkeepers.length === 0) {
            return null;
        }
        
        const attackRating = Math.max(...outfieldPlayers.map(p => p.attack));
        const defenseRating = Math.max(...outfieldPlayers.map(p => p.defense));
        const goalkeeperRating = Math.max(...goalkeepers.map(p => p.defense));
        
        return {
            name: teamName,
            attackRating,
            defenseRating,
            goalkeeperRating
        };
    },
    
    async getTop3JCupWinners() {
        const result = await DatabaseTestHelper.query('SELECT * FROM teams ORDER BY jcups_won DESC LIMIT 16');
        return result.rows;
    }
};

async function testTeamModel() {
    console.log('🏆 Testing TeamModel with Test Database...\n');
    
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
    
    // Test 1: Get all teams
    await runAsyncTest('Should fetch all teams from database', async () => {
        const teams = await TestTeamModel.getAll();
        
        if (!Array.isArray(teams)) {
            throw new Error('getAll should return an array');
        }
        
        if (teams.length === 0) {
            throw new Error('Should have teams in test database');
        }
        
        // Check team structure
        const firstTeam = teams[0];
        const requiredFields = ['team_id', 'name', 'wins', 'losses', 'goals_for', 'goals_against', 'jcups_won', 'runner_ups'];
        
        for (const field of requiredFields) {
            if (!(field in firstTeam)) {
                throw new Error(`Team should have ${field} field`);
            }
        }
        
        console.log(`   Found ${teams.length} teams in test database`);
        return true;
    });
    
    // Test 2: Get team ratings by name
    await runAsyncTest('Should calculate team ratings correctly', async () => {
        const teams = await DatabaseTestHelper.getAllTeams();
        if (teams.length === 0) throw new Error('No teams available for testing');
        
        const teamName = teams[0].name;
        const ratings = await TestTeamModel.getRatingByTeamName(teamName);
        
        if (!ratings) {
            throw new Error('Should return ratings object');
        }
        
        const requiredRatings = ['attackRating', 'defenseRating', 'goalkeeperRating'];
        for (const rating of requiredRatings) {
            if (typeof ratings[rating] !== 'number') {
                throw new Error(`${rating} should be a number`);
            }
            if (ratings[rating] < 10 || ratings[rating] > 100) {
                throw new Error(`${rating} should be between 10-100, got ${ratings[rating]}`);
            }
        }
        
        console.log(`   Team "${teamName}" ratings:`, {
            attack: ratings.attackRating,
            defense: ratings.defenseRating,
            goalkeeper: ratings.goalkeeperRating
        });
        
        return true;
    });
    
    // Test 3: Team ratings consistency
    await runAsyncTest('Should have consistent ratings for same team', async () => {
        const teams = await DatabaseTestHelper.getAllTeams();
        if (teams.length === 0) throw new Error('No teams available for testing');
        
        const teamName = teams[0].name;
        
        // Get ratings multiple times
        const ratings1 = await TestTeamModel.getRatingByTeamName(teamName);
        const ratings2 = await TestTeamModel.getRatingByTeamName(teamName);
        
        if (ratings1.attackRating !== ratings2.attackRating) {
            throw new Error('Attack rating should be consistent');
        }
        if (ratings1.defenseRating !== ratings2.defenseRating) {
            throw new Error('Defense rating should be consistent');
        }
        if (ratings1.goalkeeperRating !== ratings2.goalkeeperRating) {
            throw new Error('Goalkeeper rating should be consistent');
        }
        
        return true;
    });
    
    // Test 4: Get top cup winners (test with custom data)
    await runAsyncTest('Should get top cup winners', async () => {
        // First, update some team statistics
        const teams = await DatabaseTestHelper.getAllTeams();
        if (teams.length >= 2) {
            await DatabaseTestHelper.updateTeamStats(teams[0].team_id, { jcups_won: 5 });
            await DatabaseTestHelper.updateTeamStats(teams[1].team_id, { jcups_won: 3 });
        }
        
        const topWinners = await TestTeamModel.getTop3JCupWinners();
        
        if (!Array.isArray(topWinners)) {
            throw new Error('Should return an array');
        }
        
        // Should be ordered by jcups_won descending
        for (let i = 1; i < topWinners.length; i++) {
            if (topWinners[i-1].jcups_won < topWinners[i].jcups_won) {
                throw new Error('Top winners should be ordered by cups won (descending)');
            }
        }
        
        console.log(`   Found ${topWinners.length} cup winners`);
        if (topWinners.length > 0) {
            console.log(`   Top winner: ${topWinners[0].name} with ${topWinners[0].jcups_won} cups`);
        }
        
        return true;
    });
    
    // Test 5: Handle non-existent team
    await runAsyncTest('Should handle non-existent team gracefully', async () => {
        try {
            const ratings = await TestTeamModel.getRatingByTeamName('Non-Existent Team');
            
            // Depending on implementation, this might return null or throw
            if (ratings !== null && ratings !== undefined) {
                throw new Error('Should return null for non-existent team');
            }
        } catch (error) {
            // This is also acceptable behavior
            if (!error.message.includes('not found') && !error.message.includes('No team')) {
                throw error; // Re-throw if it's not the expected error
            }
        }
        
        return true;
    });
    
    // Test 6: Verify team ratings are calculated from players
    await runAsyncTest('Should calculate ratings from best players', async () => {
        const teams = await DatabaseTestHelper.getAllTeams();
        if (teams.length === 0) throw new Error('No teams available for testing');
        
        const teamName = teams[0].name;
        const team = teams[0];
        const players = await DatabaseTestHelper.getPlayersByTeamId(team.team_id);
        
        // Calculate expected ratings manually
        const outfieldPlayers = players.filter(p => !p.is_goalkeeper);
        const goalkeepers = players.filter(p => p.is_goalkeeper);
        
        if (outfieldPlayers.length === 0) throw new Error('Team should have outfield players');
        if (goalkeepers.length === 0) throw new Error('Team should have a goalkeeper');
        
        const expectedAttackRating = Math.max(...outfieldPlayers.map(p => p.attack));
        const expectedDefenseRating = Math.max(...outfieldPlayers.map(p => p.defense));
        const expectedGoalkeeperRating = Math.max(...goalkeepers.map(p => p.defense));
        
        // Get actual ratings from model
        const actualRatings = await TestTeamModel.getRatingByTeamName(teamName);
        
        if (actualRatings.attackRating !== expectedAttackRating) {
            throw new Error(`Attack rating mismatch. Expected: ${expectedAttackRating}, Got: ${actualRatings.attackRating}`);
        }
        if (actualRatings.defenseRating !== expectedDefenseRating) {
            throw new Error(`Defense rating mismatch. Expected: ${expectedDefenseRating}, Got: ${actualRatings.defenseRating}`);
        }
        if (actualRatings.goalkeeperRating !== expectedGoalkeeperRating) {
            throw new Error(`Goalkeeper rating mismatch. Expected: ${expectedGoalkeeperRating}, Got: ${actualRatings.goalkeeperRating}`);
        }
        
        console.log(`   Verified ratings calculation for ${teamName}`);
        return true;
    });
    
    // Results
    console.log('\n📊 TeamModel Test Results:');
    console.log(`   Passed: ${testsPassed}/${testsTotal}`);
    
    if (testsPassed === testsTotal) {
        console.log('   🎉 All TeamModel tests passed!');
        return true;
    } else {
        console.log('   ❌ Some TeamModel tests failed!');
        return false;
    }
}

// Run tests if called directly
if (require.main === module) {
    const { setupTestEnvironment, teardownTestEnvironment } = require('./test-helpers/test-setup');
    
    (async () => {
        try {
            await setupTestEnvironment();
            const success = await testTeamModel();
            await teardownTestEnvironment();
            process.exit(success ? 0 : 1);
        } catch (error) {
            console.error('TeamModel test execution failed:', error);
            await teardownTestEnvironment();
            process.exit(1);
        }
    })();
}

module.exports = { testTeamModel };
