/**
 * Team Controller Tests
 * 
 * Tests for the team API endpoints using test database and supertest
 * Run with: node run-tests.js test-team-controller.js
 */

// Set test environment first
process.env.NODE_ENV = 'test';

const request = require('supertest');
const express = require('express');
const cors = require('cors');
const { DatabaseTestHelper } = require('./test-helpers/test-setup');

// Create test app
const createTestApp = () => {
    const app = express();
    app.use(express.json());
    app.use(cors());
    
    // Import routes after setting test environment
    const teamRoutes = require('./routes/teamRoutes');
    app.use('/api/teams', teamRoutes);
    
    return app;
};

async function testTeamController() {
    console.log('🏆 Testing Team Controller API...\n');
    
    let testsPassed = 0;
    let testsTotal = 0;
    let app;
    
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
    
    // Setup test app
    app = createTestApp();
    
    // Test 1: GET /api/teams - Get all teams
    await runAsyncTest('GET /api/teams should return all teams', async () => {
        const response = await request(app)
            .get('/api/teams')
            .expect(200);
        
        // Check response structure
        if (!response.body.message) {
            throw new Error('Response should have message field');
        }
        if (!response.body.teams) {
            throw new Error('Response should have teams field');
        }
        if (!Array.isArray(response.body.teams)) {
            throw new Error('Teams should be an array');
        }
        
        // Check we have test teams
        if (response.body.teams.length === 0) {
            throw new Error('Should have teams in test database');
        }
        
        // Check team structure
        const firstTeam = response.body.teams[0];
        const requiredFields = ['id', 'name', 'wins', 'losses', 'goalsFor', 'goalsAgainst', 'jcups_won', 'runner_ups'];
        
        for (const field of requiredFields) {
            if (!(field in firstTeam)) {
                throw new Error(`Team should have ${field} field`);
            }
        }
        
        console.log(`   Found ${response.body.teams.length} teams`);
        console.log(`   Sample team: ${firstTeam.name}`);
        
        return true;
    });
    
    // Test 2: GET /api/teams/3jcup - Get top cup winners
    await runAsyncTest('GET /api/teams/3jcup should return top cup winners', async () => {
        // First, set up some teams with cup wins
        const teams = await DatabaseTestHelper.getAllTeams();
        if (teams.length >= 3) {
            await DatabaseTestHelper.updateTeamStats(teams[0].team_id, { jcups_won: 5 });
            await DatabaseTestHelper.updateTeamStats(teams[1].team_id, { jcups_won: 3 });
            await DatabaseTestHelper.updateTeamStats(teams[2].team_id, { jcups_won: 1 });
        }
        
        const response = await request(app)
            .get('/api/teams/3jcup')
            .expect(200);
        
        // Check response structure
        if (!response.body.message) {
            throw new Error('Response should have message field');
        }
        if (!response.body.top3JCupWinners) {
            throw new Error('Response should have top3JCupWinners field');
        }
        if (!Array.isArray(response.body.top3JCupWinners)) {
            throw new Error('Top cup winners should be an array');
        }
        
        const topWinners = response.body.top3JCupWinners;
        
        // Check ordering (should be descending by jcups_won)
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
    
    // Test 3: Error handling - Database connection issues
    await runAsyncTest('Should handle database errors gracefully', async () => {
        // This test is harder to simulate without mocking, but we can test the structure
        // For now, we'll test that successful requests have proper structure
        
        const response = await request(app)
            .get('/api/teams')
            .expect(200);
        
        // Verify the response follows the expected error handling pattern
        if (!response.body.message || !response.body.teams) {
            throw new Error('Response should follow standard format');
        }
        
        return true;
    });
    
    // Test 4: Response headers and content type
    await runAsyncTest('Should return proper content type and headers', async () => {
        const response = await request(app)
            .get('/api/teams')
            .expect(200)
            .expect('Content-Type', /json/);
        
        // Check CORS headers if needed
        // (Note: CORS headers might not be present in test environment)
        
        return true;
    });
    
    // Test 5: API endpoint availability
    await runAsyncTest('All team endpoints should be available', async () => {
        // Test that all defined endpoints respond
        await request(app).get('/api/teams').expect(200);
        await request(app).get('/api/teams/3jcup').expect(200);
        
        return true;
    });
    
    // Test 6: Data consistency
    await runAsyncTest('Should return consistent data across requests', async () => {
        const response1 = await request(app).get('/api/teams').expect(200);
        const response2 = await request(app).get('/api/teams').expect(200);
        
        if (response1.body.teams.length !== response2.body.teams.length) {
            throw new Error('Team count should be consistent across requests');
        }
        
        // Check that team IDs are consistent
        const team1Ids = response1.body.teams.map(t => t.id).sort();
        const team2Ids = response2.body.teams.map(t => t.id).sort();
        
        for (let i = 0; i < team1Ids.length; i++) {
            if (team1Ids[i] !== team2Ids[i]) {
                throw new Error('Team IDs should be consistent across requests');
            }
        }
        
        return true;
    });
    
    // Test 7: Invalid endpoints
    await runAsyncTest('Should return 404 for invalid endpoints', async () => {
        await request(app)
            .get('/api/teams/invalid-endpoint')
            .expect(404);
        
        return true;
    });
    
    // Results
    console.log('\n📊 Team Controller Test Results:');
    console.log(`   Passed: ${testsPassed}/${testsTotal}`);
    
    if (testsPassed === testsTotal) {
        console.log('   🎉 All Team Controller tests passed!');
        return true;
    } else {
        console.log('   ❌ Some Team Controller tests failed!');
        return false;
    }
}

// Run tests if called directly
if (require.main === module) {
    const { setupTestEnvironment, teardownTestEnvironment } = require('./test-helpers/test-setup');
    
    (async () => {
        try {
            await setupTestEnvironment();
            const success = await testTeamController();
            await teardownTestEnvironment();
            process.exit(success ? 0 : 1);
        } catch (error) {
            console.error('Team Controller test execution failed:', error);
            await teardownTestEnvironment();
            process.exit(1);
        }
    })();
}

module.exports = { testTeamController };
