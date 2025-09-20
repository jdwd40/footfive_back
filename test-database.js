// Test database configuration demo
// Run this to verify your test database setup works

const { setupTestEnvironment, teardownTestEnvironment, DatabaseTestHelper } = require('./test-helpers/test-setup');

const testDatabaseSetup = async () => {
    console.log('=== FootFive Test Database Configuration Demo ===\n');
    
    try {
        // Setup test environment
        await setupTestEnvironment();
        
        // Test database queries
        console.log('Testing database queries...');
        
        // Get all teams
        const teams = await DatabaseTestHelper.getAllTeams();
        console.log(`✓ Found ${teams.length} teams in test database`);
        
        // Get players for first team
        if (teams.length > 0) {
            const players = await DatabaseTestHelper.getPlayersByTeamId(teams[0].team_id);
            console.log(`✓ Team "${teams[0].name}" has ${players.length} players`);
            
            // Show team composition
            const goalkeepers = players.filter(p => p.is_goalkeeper);
            const outfieldPlayers = players.filter(p => !p.is_goalkeeper);
            console.log(`  - ${goalkeepers.length} goalkeeper(s)`);
            console.log(`  - ${outfieldPlayers.length} outfield player(s)`);
        }
        
        // Test team ratings calculation (simulate what TeamModel does)
        if (teams.length >= 2) {
            const team1 = teams[0];
            const team1Players = await DatabaseTestHelper.getPlayersByTeamId(team1.team_id);
            
            const attackRating = Math.max(...team1Players.filter(p => !p.is_goalkeeper).map(p => p.attack));
            const defenseRating = Math.max(...team1Players.filter(p => !p.is_goalkeeper).map(p => p.defense));
            const goalkeeperRating = Math.max(...team1Players.filter(p => p.is_goalkeeper).map(p => p.defense));
            
            console.log(`✓ ${team1.name} ratings calculated:`);
            console.log(`  - Attack: ${attackRating}`);
            console.log(`  - Defense: ${defenseRating}`);
            console.log(`  - Goalkeeper: ${goalkeeperRating}`);
        }
        
        // Test custom team creation
        console.log('\nTesting custom team creation...');
        const customTeamData = {
            name: "Custom Test Team",
            players: [
                { name: "Custom Player 1", attack: 90, defense: 60, isGoalkeeper: false },
                { name: "Custom Player 2", attack: 85, defense: 65, isGoalkeeper: false },
                { name: "Custom Player 3", attack: 75, defense: 75, isGoalkeeper: false },
                { name: "Custom Player 4", attack: 70, defense: 80, isGoalkeeper: false },
                { name: "Custom Keeper", attack: 30, defense: 85, isGoalkeeper: true }
            ]
        };
        
        const customTeamId = await DatabaseTestHelper.createTestTeam(customTeamData);
        console.log(`✓ Created custom team with ID: ${customTeamId}`);
        
        // Test team statistics update
        await DatabaseTestHelper.updateTeamStats(customTeamId, {
            wins: 5,
            losses: 2,
            goals_for: 15,
            goals_against: 8,
            jcups_won: 1,
            runner_ups: 0
        });
        console.log('✓ Updated team statistics');
        
        // Verify the update
        const updatedTeams = await DatabaseTestHelper.getAllTeams();
        const updatedCustomTeam = updatedTeams.find(t => t.team_id === customTeamId);
        console.log(`✓ Verified: ${updatedCustomTeam.name} has ${updatedCustomTeam.jcups_won} cup win(s)`);
        
        console.log('\n=== Test Database Configuration: SUCCESS ===');
        console.log('Your test database is properly configured and ready for testing!');
        console.log('\nNext steps:');
        console.log('1. Run: chmod +x setup-test-database.sh && ./setup-test-database.sh');
        console.log('2. Install Jest: npm install --save-dev jest supertest');
        console.log('3. Create your test files using the DatabaseTestHelper');
        
    } catch (error) {
        console.error('\n=== Test Database Configuration: FAILED ===');
        console.error('Error:', error.message);
        console.error('\nTroubleshooting:');
        console.error('1. Make sure PostgreSQL is running');
        console.error('2. Run: ./setup-test-database.sh');
        console.error('3. Check your .env.test file');
        console.error('4. Verify database permissions');
    } finally {
        // Cleanup
        await teardownTestEnvironment();
    }
};

// Run the test
if (require.main === module) {
    testDatabaseSetup();
}

module.exports = { testDatabaseSetup };
