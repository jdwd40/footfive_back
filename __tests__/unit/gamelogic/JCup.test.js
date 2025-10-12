/**
 * JCup Unit Tests
 * Tests for tournament management and game logic
 */

const JCup = require('../../../Gamelogic/JCup');
const { DatabaseTestHelper, setupBeforeEach, setupWithFullData } = require('../../setup/testHelpers');

describe('JCup', () => {
  beforeEach(async () => {
    await setupWithFullData(); // Need full team data for tournament
  });

  afterEach(async () => {
    await DatabaseTestHelper.cleanDatabase();
  });

  describe('Constructor', () => {
    it('should initialize JCup correctly', () => {
      const jCup = new JCup();
      
      expect(Array.isArray(jCup.teams)).toBe(true);
      expect(Array.isArray(jCup.fixtures)).toBe(true);
      expect(Array.isArray(jCup.results)).toBe(true);
      expect(typeof jCup.currentRound).toBe('number');
      expect(jCup.teams.length).toBe(0);
      expect(jCup.currentRound).toBe(0);
      expect(jCup.fixtures.length).toBe(0);
    });
  });

  describe('loadTeams()', () => {
    it('should load teams from database', async () => {
      const jCup = new JCup();
      await jCup.loadTeams();
      
      expect(jCup.teams.length).toBeGreaterThan(0);
      
      // Check team structure
      const firstTeam = jCup.teams[0];
      expect(firstTeam).toHaveProperty('name');
      expect(firstTeam).toHaveProperty('id');
    });

    it('should generate fixtures after loading teams', async () => {
      const jCup = new JCup();
      await jCup.loadTeams();
      
      expect(jCup.fixtures.length).toBeGreaterThan(0);
    });

    it('should reset state before loading', async () => {
      const jCup = new JCup();
      await jCup.loadTeams();
      
      const firstCount = jCup.teams.length;
      
      // Load again - should reset and reload
      await jCup.loadTeams();
      
      expect(jCup.currentRound).toBe(0);
      expect(jCup.teams.length).toBe(firstCount);
    });
  });

  describe('generateFixtures()', () => {
    it('should generate tournament fixtures', async () => {
      const jCup = new JCup();
      await jCup.loadTeams();
      
      expect(jCup.fixtures.length).toBeGreaterThan(0);
      
      // First round should have matches
      const firstRound = jCup.fixtures[0];
      expect(Array.isArray(firstRound)).toBe(true);
      expect(firstRound.length).toBeGreaterThan(0);
    });

    it('should create matches with team1 and team2', async () => {
      const jCup = new JCup();
      await jCup.loadTeams();
      
      const firstMatch = jCup.fixtures[0][0];
      expect(firstMatch).toHaveProperty('team1');
      expect(firstMatch).toHaveProperty('team2');
      expect(firstMatch.team1).toBeDefined();
    });

    it('should not match teams against themselves', async () => {
      const jCup = new JCup();
      await jCup.loadTeams();
      
      jCup.fixtures[0].forEach(match => {
        if (match.team2) { // Skip byes
          expect(match.team1.name).not.toBe(match.team2.name);
        }
      });
    });

    it('should handle odd number of teams with byes', () => {
      const customTeams = [
        { id: 1, name: 'Team A', attackRating: 80, defenseRating: 75, goalkeeperRating: 70 },
        { id: 2, name: 'Team B', attackRating: 75, defenseRating: 80, goalkeeperRating: 75 },
        { id: 3, name: 'Team C', attackRating: 70, defenseRating: 70, goalkeeperRating: 70 }
      ];
      
      const jCup = new JCup();
      jCup.teams = customTeams;
      jCup.generateFixtures();
      
      expect(jCup.fixtures.length).toBeGreaterThan(0);
      
      const firstRound = jCup.fixtures[0];
      // With 3 teams, should have matches arranged (1 match + 1 bye OR handled differently)
      expect(firstRound.length).toBeGreaterThan(0);
    });
  });

  describe('shuffleTeams()', () => {
    it('should shuffle teams for fair fixtures', async () => {
      const jCup = new JCup();
      await jCup.loadTeams();
      
      // Only test if we have enough teams
      if (jCup.teams.length > 2) {
        // Shuffle multiple times
        const shuffleResults = [];
        for (let i = 0; i < 5; i++) {
          const shuffled = jCup.shuffleTeams(jCup.teams);
          shuffleResults.push(shuffled.map(t => t.name).join(','));
        }
        
        // Check that not all shuffles are identical
        const uniqueResults = new Set(shuffleResults);
        expect(uniqueResults.size).toBeGreaterThan(1);
      }
    });

    it('should return same number of teams', async () => {
      const jCup = new JCup();
      await jCup.loadTeams();
      
      const originalCount = jCup.teams.length;
      const shuffled = jCup.shuffleTeams(jCup.teams);
      
      expect(shuffled.length).toBe(originalCount);
    });

    it('should not modify original array', async () => {
      const jCup = new JCup();
      await jCup.loadTeams();
      
      const originalTeams = [...jCup.teams];
      jCup.shuffleTeams(jCup.teams);
      
      // Original should be unchanged
      expect(jCup.teams).toEqual(originalTeams);
    });
  });

  describe('simulateRound()', () => {
    it('should simulate tournament round', async () => {
      const jCup = new JCup();
      await jCup.loadTeams();
      
      const simulationResult = await jCup.simulateRound();
      
      expect(simulationResult).toBeDefined();
      expect(simulationResult).toHaveProperty('roundResults');
      expect(Array.isArray(simulationResult.roundResults)).toBe(true);
      expect(simulationResult.roundResults.length).toBeGreaterThan(0);
    });

    it('should advance current round', async () => {
      const jCup = new JCup();
      await jCup.loadTeams();
      
      expect(jCup.currentRound).toBe(0);
      
      await jCup.simulateRound();
      
      expect(jCup.currentRound).toBe(1);
    });

    it('should generate match results with required properties', async () => {
      const jCup = new JCup();
      await jCup.loadTeams();
      
      const simulationResult = await jCup.simulateRound();
      const firstResult = simulationResult.roundResults[0];
      
      expect(firstResult).toHaveProperty('score');
      expect(firstResult).toHaveProperty('highlights');
      expect(firstResult).toHaveProperty('finalResult');
      expect(firstResult).toHaveProperty('matchMetadata');
    });

    it('should generate next round fixtures', async () => {
      const jCup = new JCup();
      await jCup.loadTeams();
      
      const simulationResult = await jCup.simulateRound();
      
      if (simulationResult.nextRoundFixtures && Array.isArray(simulationResult.nextRoundFixtures)) {
        expect(simulationResult.nextRoundFixtures.length).toBeGreaterThan(0);
      }
    });

    it('should handle byes correctly', async () => {
      const customTeams = [
        { id: 1, name: 'Team A', attackRating: 80, defenseRating: 75, goalkeeperRating: 70 },
        { id: 2, name: 'Team B', attackRating: 75, defenseRating: 80, goalkeeperRating: 75 },
        { id: 3, name: 'Team C', attackRating: 70, defenseRating: 70, goalkeeperRating: 70 }
      ];
      
      const jCup = new JCup();
      jCup.teams = customTeams;
      jCup.generateFixtures();
      
      // Should be able to simulate without errors
      await expect(jCup.simulateRound()).resolves.toBeDefined();
    });
  });

  describe('Complete tournament flow', () => {
    it('should complete tournament and produce a winner', async () => {
      const jCup = new JCup();
      await jCup.loadTeams();
      
      let roundCount = 0;
      let winner = null;
      const maxRounds = 10; // Safety limit
      
      // Play all rounds until tournament ends
      while (jCup.currentRound < jCup.fixtures.length && roundCount < maxRounds) {
        const simulationResult = await jCup.simulateRound();
        roundCount++;
        
        if (simulationResult.winner) {
          winner = simulationResult.winner;
          break;
        }
      }
      
      expect(winner).toBeDefined();
      expect(winner).toHaveProperty('name');
      expect(roundCount).toBeLessThanOrEqual(maxRounds);
    }, 30000); // Increase timeout for full tournament

    it('should produce winner and runner-up', async () => {
      const jCup = new JCup();
      await jCup.loadTeams();
      
      let finalResult = null;
      const maxRounds = 10;
      let roundCount = 0;
      
      while (jCup.currentRound < jCup.fixtures.length && roundCount < maxRounds) {
        finalResult = await jCup.simulateRound();
        roundCount++;
        
        if (finalResult.winner) {
          break;
        }
      }
      
      expect(finalResult).toBeDefined();
      expect(finalResult.winner).toBeDefined();
      expect(finalResult.runner).toBeDefined();
      expect(finalResult.winner.name).not.toBe(finalResult.runner.name);
    }, 30000);

    it('should update winner statistics', async () => {
      const teams = await DatabaseTestHelper.getAllTeams();
      const winnerId = teams[0].team_id;
      
      // Get initial stats
      const initialStats = await DatabaseTestHelper.query(
        'SELECT jcups_won FROM teams WHERE team_id = $1',
        [winnerId]
      );
      const initialCups = initialStats.rows[0].jcups_won;
      
      const jCup = new JCup();
      await jCup.jCupWon(winnerId);
      
      // Verify stats updated
      const finalStats = await DatabaseTestHelper.query(
        'SELECT jcups_won FROM teams WHERE team_id = $1',
        [winnerId]
      );
      const finalCups = finalStats.rows[0].jcups_won;
      
      expect(finalCups).toBe(initialCups + 1);
    });

    it('should update runner-up statistics', async () => {
      const teams = await DatabaseTestHelper.getAllTeams();
      const runnerId = teams[1].team_id;
      
      // Get initial stats
      const initialStats = await DatabaseTestHelper.query(
        'SELECT runner_ups FROM teams WHERE team_id = $1',
        [runnerId]
      );
      const initialRunnerUps = initialStats.rows[0].runner_ups;
      
      const jCup = new JCup();
      await jCup.jCupWon(teams[0].team_id, runnerId);
      
      // Verify stats updated
      const finalStats = await DatabaseTestHelper.query(
        'SELECT runner_ups FROM teams WHERE team_id = $1',
        [runnerId]
      );
      const finalRunnerUps = finalStats.rows[0].runner_ups;
      
      expect(finalRunnerUps).toBe(initialRunnerUps + 1);
    });
  });

  describe('resetJCup()', () => {
    it('should reset tournament state', async () => {
      const jCup = new JCup();
      await jCup.loadTeams();
      await jCup.simulateRound();
      
      // Should have advanced
      expect(jCup.currentRound).toBeGreaterThan(0);
      
      jCup.resetJCup();
      
      // Should be reset
      expect(jCup.currentRound).toBe(0);
      expect(jCup.teams.length).toBe(0);
      expect(jCup.fixtures.length).toBe(0);
      expect(jCup.results.length).toBe(0);
    });

    it('should allow starting new tournament after reset', async () => {
      const jCup = new JCup();
      await jCup.loadTeams();
      await jCup.simulateRound();
      
      jCup.resetJCup();
      
      // Should be able to start new tournament
      await jCup.loadTeams();
      
      expect(jCup.teams.length).toBeGreaterThan(0);
      expect(jCup.currentRound).toBe(0);
    });
  });

  describe('jCupWon()', () => {
    it('should update winner statistics', async () => {
      const teams = await DatabaseTestHelper.getAllTeams();
      const winnerId = teams[0].team_id;
      
      const jCup = new JCup();
      const result = await jCup.jCupWon(winnerId);
      
      expect(result).toHaveProperty('msg');
      expect(result.msg).toBe('updated');
    });

    it('should handle winner without runner-up', async () => {
      const teams = await DatabaseTestHelper.getAllTeams();
      const winnerId = teams[0].team_id;
      
      const jCup = new JCup();
      
      // Should not throw when runner_id is not provided
      await expect(jCup.jCupWon(winnerId)).resolves.toBeDefined();
    });

    it('should handle winner with runner-up', async () => {
      const teams = await DatabaseTestHelper.getAllTeams();
      const winnerId = teams[0].team_id;
      const runnerId = teams[1].team_id;
      
      const jCup = new JCup();
      
      await expect(jCup.jCupWon(winnerId, runnerId)).resolves.toBeDefined();
    });
  });
});

