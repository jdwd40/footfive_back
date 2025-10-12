/**
 * PlayerModel Unit Tests
 * Tests for PlayerModel database operations
 */

const Player = require('../../../models/PlayerModel');
const { DatabaseTestHelper, setupBeforeEach, cleanupAfterEach } = require('../../setup/testHelpers');

describe('PlayerModel', () => {
  beforeEach(async () => {
    await setupBeforeEach();
  });

  afterEach(async () => {
    await cleanupAfterEach();
  });

  describe('fetchById()', () => {
    it('should fetch player by ID', async () => {
      const teams = await DatabaseTestHelper.getAllTeams();
      const players = await DatabaseTestHelper.getPlayersByTeamId(teams[0].team_id);
      const testPlayer = players[0];
      
      const player = await Player.fetchById(testPlayer.player_id);
      
      expect(player).toBeDefined();
      expect(player.playerId).toBe(testPlayer.player_id);
      expect(player.teamId).toBe(testPlayer.team_id);
      expect(player.name).toBe(testPlayer.name);
      expect(player.attack).toBe(testPlayer.attack);
      expect(player.defense).toBe(testPlayer.defense);
      expect(player.isGoalkeeper).toBe(testPlayer.is_goalkeeper);
    });

    it('should throw error for non-existent player ID', async () => {
      await expect(Player.fetchById(99999)).rejects.toThrow('not found');
    });

    it('should return player with valid stat ranges', async () => {
      const teams = await DatabaseTestHelper.getAllTeams();
      const players = await DatabaseTestHelper.getPlayersByTeamId(teams[0].team_id);
      
      const player = await Player.fetchById(players[0].player_id);
      
      expect(player.attack).toBeGreaterThanOrEqual(10);
      expect(player.attack).toBeLessThanOrEqual(100);
      expect(player.defense).toBeGreaterThanOrEqual(10);
      expect(player.defense).toBeLessThanOrEqual(100);
      expect(typeof player.isGoalkeeper).toBe('boolean');
    });
  });

  describe('updateById()', () => {
    it('should update player stats', async () => {
      const teams = await DatabaseTestHelper.getAllTeams();
      const players = await DatabaseTestHelper.getPlayersByTeamId(teams[0].team_id);
      const testPlayer = players[0];
      
      const newName = 'Updated Player';
      const newAttack = 85;
      const newDefense = 75;
      
      const updatedPlayer = await Player.updateById(
        testPlayer.player_id,
        newName,
        newAttack,
        newDefense
      );
      
      expect(updatedPlayer.playerId).toBe(testPlayer.player_id);
      expect(updatedPlayer.name).toBe(newName);
      expect(updatedPlayer.attack).toBe(newAttack);
      expect(updatedPlayer.defense).toBe(newDefense);
      
      // Verify in database
      const verifiedPlayer = await Player.fetchById(testPlayer.player_id);
      expect(verifiedPlayer.name).toBe(newName);
      expect(verifiedPlayer.attack).toBe(newAttack);
      expect(verifiedPlayer.defense).toBe(newDefense);
    });

    it('should throw error for non-existent player', async () => {
      await expect(
        Player.updateById(99999, 'Test', 80, 80)
      ).rejects.toThrow('not found');
    });

    it('should not modify goalkeeper status', async () => {
      const teams = await DatabaseTestHelper.getAllTeams();
      const players = await DatabaseTestHelper.getPlayersByTeamId(teams[0].team_id);
      const goalkeeper = players.find(p => p.is_goalkeeper);
      
      const originalIsGoalkeeper = goalkeeper.is_goalkeeper;
      
      await Player.updateById(goalkeeper.player_id, goalkeeper.name, 80, 80);
      
      const updatedPlayer = await Player.fetchById(goalkeeper.player_id);
      expect(updatedPlayer.isGoalkeeper).toBe(originalIsGoalkeeper);
    });
  });

  describe('fetchByTeamName()', () => {
    it('should fetch all players for a team by team name', async () => {
      const teams = await DatabaseTestHelper.getAllTeams();
      const testTeam = teams[0];
      
      const players = await Player.fetchByTeamName(testTeam.name);
      
      expect(Array.isArray(players)).toBe(true);
      expect(players.length).toBeGreaterThan(0);
      
      // Check player structure
      players.forEach(player => {
        expect(player).toHaveProperty('name');
        expect(player).toHaveProperty('attack');
        expect(player).toHaveProperty('defense');
        expect(player).toHaveProperty('isGoalkeeper');
      });
    });

    it('should return empty array for non-existent team', async () => {
      const players = await Player.fetchByTeamName('Non-Existent Team');
      expect(Array.isArray(players)).toBe(true);
      expect(players.length).toBe(0);
    });

    it('should include both outfield players and goalkeepers', async () => {
      const teams = await DatabaseTestHelper.getAllTeams();
      const testTeam = teams[0];
      
      const players = await Player.fetchByTeamName(testTeam.name);
      
      const goalkeepers = players.filter(p => p.isGoalkeeper);
      const outfieldPlayers = players.filter(p => !p.isGoalkeeper);
      
      expect(goalkeepers.length).toBeGreaterThan(0);
      expect(outfieldPlayers.length).toBeGreaterThan(0);
    });
  });

  describe('fetchByTeamId()', () => {
    it('should fetch all players for a team by team ID', async () => {
      const teams = await DatabaseTestHelper.getAllTeams();
      const testTeam = teams[0];
      
      const players = await Player.fetchByTeamId(testTeam.team_id);
      
      expect(Array.isArray(players)).toBe(true);
      expect(players.length).toBeGreaterThan(0);
      
      // All players should belong to the same team
      players.forEach(player => {
        expect(player.teamId).toBe(testTeam.team_id);
      });
    });

    it('should return empty array for non-existent team ID', async () => {
      const players = await Player.fetchByTeamId(99999);
      expect(Array.isArray(players)).toBe(true);
      expect(players.length).toBe(0);
    });

    it('should return players with all properties', async () => {
      const teams = await DatabaseTestHelper.getAllTeams();
      const players = await Player.fetchByTeamId(teams[0].team_id);
      
      players.forEach(player => {
        expect(player).toHaveProperty('playerId');
        expect(player).toHaveProperty('teamId');
        expect(player).toHaveProperty('name');
        expect(player).toHaveProperty('attack');
        expect(player).toHaveProperty('defense');
        expect(player).toHaveProperty('isGoalkeeper');
      });
    });
  });

  describe('Player validation', () => {
    it('should have valid stat ranges for all players', async () => {
      const teams = await DatabaseTestHelper.getAllTeams();
      
      for (const team of teams) {
        const players = await Player.fetchByTeamId(team.team_id);
        
        players.forEach(player => {
          expect(player.attack).toBeGreaterThanOrEqual(10);
          expect(player.attack).toBeLessThanOrEqual(100);
          expect(player.defense).toBeGreaterThanOrEqual(10);
          expect(player.defense).toBeLessThanOrEqual(100);
        });
      }
    });

    it('should ensure each team has at least one goalkeeper', async () => {
      const teams = await DatabaseTestHelper.getAllTeams();
      
      for (const team of teams) {
        const players = await Player.fetchByTeamId(team.team_id);
        const goalkeepers = players.filter(p => p.isGoalkeeper);
        
        expect(goalkeepers.length).toBeGreaterThan(0);
      }
    });

    it('should ensure each team has outfield players', async () => {
      const teams = await DatabaseTestHelper.getAllTeams();
      
      for (const team of teams) {
        const players = await Player.fetchByTeamId(team.team_id);
        const outfieldPlayers = players.filter(p => !p.isGoalkeeper);
        
        expect(outfieldPlayers.length).toBeGreaterThan(0);
      }
    });
  });
});

