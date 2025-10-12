/**
 * TeamModel Unit Tests
 * Tests for TeamModel database operations
 */

const Team = require('../../../models/TeamModel');
const { DatabaseTestHelper, setupBeforeEach, cleanupAfterEach } = require('../../setup/testHelpers');

describe('TeamModel', () => {
  beforeEach(async () => {
    await setupBeforeEach();
  });

  afterEach(async () => {
    await cleanupAfterEach();
  });

  describe('getAll()', () => {
    it('should fetch all teams from database', async () => {
      const teams = await Team.getAll();
      
      expect(Array.isArray(teams)).toBe(true);
      expect(teams.length).toBeGreaterThan(0);
      
      // Check team structure
      const firstTeam = teams[0];
      expect(firstTeam).toHaveProperty('id');
      expect(firstTeam).toHaveProperty('name');
      expect(firstTeam).toHaveProperty('attackRating');
      expect(firstTeam).toHaveProperty('defenseRating');
      expect(firstTeam).toHaveProperty('goalkeeperRating');
      expect(firstTeam).toHaveProperty('jcups_won');
      expect(firstTeam).toHaveProperty('runner_ups');
    });

    it('should return teams with valid rating values', async () => {
      const teams = await Team.getAll();
      
      teams.forEach(team => {
        expect(team.attackRating).toBeGreaterThanOrEqual(0);
        expect(team.defenseRating).toBeGreaterThanOrEqual(0);
        expect(team.goalkeeperRating).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('getRatingById()', () => {
    it('should fetch team ratings by ID', async () => {
      const teams = await DatabaseTestHelper.getAllTeams();
      const testTeam = teams[0];
      
      const team = await Team.getRatingById(testTeam.team_id);
      
      expect(team).toBeDefined();
      expect(team.id).toBe(testTeam.team_id);
      expect(team.name).toBe(testTeam.name);
      expect(typeof team.attackRating).toBe('number');
      expect(typeof team.defenseRating).toBe('number');
      expect(typeof team.goalkeeperRating).toBe('number');
    });

    it('should throw error for non-existent team ID', async () => {
      await expect(Team.getRatingById(99999)).rejects.toThrow('not found');
    });
  });

  describe('getRatingByTeamName()', () => {
    it('should calculate team ratings correctly', async () => {
      const teams = await DatabaseTestHelper.getAllTeams();
      const testTeamName = teams[0].name;
      
      const team = await Team.getRatingByTeamName(testTeamName);
      
      expect(team).toBeDefined();
      expect(team.name).toBe(testTeamName);
      expect(team.attackRating).toBeGreaterThanOrEqual(10);
      expect(team.attackRating).toBeLessThanOrEqual(100);
      expect(team.defenseRating).toBeGreaterThanOrEqual(10);
      expect(team.defenseRating).toBeLessThanOrEqual(100);
      expect(team.goalkeeperRating).toBeGreaterThanOrEqual(10);
      expect(team.goalkeeperRating).toBeLessThanOrEqual(100);
    });

    it('should have consistent ratings for same team', async () => {
      const teams = await DatabaseTestHelper.getAllTeams();
      const testTeamName = teams[0].name;
      
      const ratings1 = await Team.getRatingByTeamName(testTeamName);
      const ratings2 = await Team.getRatingByTeamName(testTeamName);
      
      expect(ratings1.attackRating).toBe(ratings2.attackRating);
      expect(ratings1.defenseRating).toBe(ratings2.defenseRating);
      expect(ratings1.goalkeeperRating).toBe(ratings2.goalkeeperRating);
    });

    it('should throw error for non-existent team name', async () => {
      await expect(Team.getRatingByTeamName('Non-Existent Team')).rejects.toThrow('not found');
    });

    it('should calculate ratings from best players', async () => {
      const teams = await DatabaseTestHelper.getAllTeams();
      const team = teams[0];
      const players = await DatabaseTestHelper.getPlayersByTeamId(team.team_id);
      
      // Calculate expected ratings manually
      const outfieldPlayers = players.filter(p => !p.is_goalkeeper);
      const goalkeepers = players.filter(p => p.is_goalkeeper);
      
      const expectedAttackRating = Math.max(...outfieldPlayers.map(p => p.attack));
      const expectedDefenseRating = Math.max(...outfieldPlayers.map(p => p.defense));
      const expectedGoalkeeperRating = Math.max(...goalkeepers.map(p => p.defense));
      
      // Get actual ratings from model
      const actualRatings = await Team.getRatingByTeamName(team.name);
      
      expect(actualRatings.attackRating).toBe(expectedAttackRating);
      expect(actualRatings.defenseRating).toBe(expectedDefenseRating);
      expect(actualRatings.goalkeeperRating).toBe(expectedGoalkeeperRating);
    });
  });

  describe('addJCupsWon()', () => {
    it('should increment jcups_won count', async () => {
      const teams = await DatabaseTestHelper.getAllTeams();
      const testTeam = teams[0];
      
      // Get initial count
      const initialResult = await DatabaseTestHelper.query(
        'SELECT jcups_won FROM teams WHERE team_id = $1',
        [testTeam.team_id]
      );
      const initialCount = initialResult.rows[0].jcups_won;
      
      // Add a JCup win
      const newCount = await Team.addJCupsWon(testTeam.team_id);
      
      expect(newCount).toBe(initialCount + 1);
      
      // Verify in database
      const verifyResult = await DatabaseTestHelper.query(
        'SELECT jcups_won FROM teams WHERE team_id = $1',
        [testTeam.team_id]
      );
      expect(verifyResult.rows[0].jcups_won).toBe(initialCount + 1);
    });

    it('should throw error for non-existent team', async () => {
      await expect(Team.addJCupsWon(99999)).rejects.toThrow('not found');
    });
  });

  describe('addRunnerUp()', () => {
    it('should increment runner_ups count', async () => {
      const teams = await DatabaseTestHelper.getAllTeams();
      const testTeam = teams[0];
      
      // Get initial count
      const initialResult = await DatabaseTestHelper.query(
        'SELECT runner_ups FROM teams WHERE team_id = $1',
        [testTeam.team_id]
      );
      const initialCount = initialResult.rows[0].runner_ups;
      
      // Add a runner-up
      const newCount = await Team.addRunnerUp(testTeam.team_id);
      
      expect(newCount).toBe(initialCount + 1);
      
      // Verify in database
      const verifyResult = await DatabaseTestHelper.query(
        'SELECT runner_ups FROM teams WHERE team_id = $1',
        [testTeam.team_id]
      );
      expect(verifyResult.rows[0].runner_ups).toBe(initialCount + 1);
    });

    it('should throw error for non-existent team', async () => {
      await expect(Team.addRunnerUp(99999)).rejects.toThrow('not found');
    });
  });

  describe('getTop3JCupWinners()', () => {
    it('should return top cup winners', async () => {
      const teams = await DatabaseTestHelper.getAllTeams();
      
      // Set up test data with different cup wins
      if (teams.length >= 3) {
        await DatabaseTestHelper.updateTeamStats(teams[0].team_id, { jcups_won: 5 });
        await DatabaseTestHelper.updateTeamStats(teams[1].team_id, { jcups_won: 3 });
        await DatabaseTestHelper.updateTeamStats(teams[2].team_id, { jcups_won: 1 });
      }
      
      const topWinners = await Team.getTop3JCupWinners();
      
      expect(Array.isArray(topWinners)).toBe(true);
      expect(topWinners.length).toBeGreaterThan(0);
      
      // Check each team has required fields
      topWinners.forEach(winner => {
        expect(winner).toHaveProperty('name');
        expect(winner).toHaveProperty('jcups_won');
      });
    });

    it('should order winners by jcups_won descending', async () => {
      const teams = await DatabaseTestHelper.getAllTeams();
      
      // Set up test data
      if (teams.length >= 3) {
        await DatabaseTestHelper.updateTeamStats(teams[0].team_id, { jcups_won: 10 });
        await DatabaseTestHelper.updateTeamStats(teams[1].team_id, { jcups_won: 5 });
        await DatabaseTestHelper.updateTeamStats(teams[2].team_id, { jcups_won: 2 });
      }
      
      const topWinners = await Team.getTop3JCupWinners();
      
      // Verify descending order
      for (let i = 1; i < topWinners.length; i++) {
        expect(topWinners[i - 1].jcups_won).toBeGreaterThanOrEqual(topWinners[i].jcups_won);
      }
    });
  });
});

