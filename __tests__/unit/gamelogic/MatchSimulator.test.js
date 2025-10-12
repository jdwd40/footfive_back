/**
 * MatchSimulator Unit Tests
 * Tests for match simulation logic
 */

const MatchSimulator = require('../../../Gamelogic/MatchSimulator');

describe('MatchSimulator', () => {
  describe('Constructor', () => {
    it('should initialize correctly', () => {
      const team1 = { name: 'Team A', attackRating: 70, defenseRating: 70, goalkeeperRating: 70 };
      const team2 = { name: 'Team B', attackRating: 75, defenseRating: 75, goalkeeperRating: 75 };
      
      const match = new MatchSimulator(team1, team2);
      
      expect(match.team1).toBe(team1);
      expect(match.team2).toBe(team2);
      expect(match.homeTeam).toBe(team1.name);
      expect(match.awayTeam).toBe(team2.name);
      expect(match.score[team1.name]).toBe(0);
      expect(match.score[team2.name]).toBe(0);
      expect(match.minute).toBe(0);
      expect(Array.isArray(match.highlights)).toBe(true);
      expect(match.highlights.length).toBe(0);
    });

    it('should store team objects correctly', () => {
      const team1 = { name: 'Team 1', attackRating: 80, defenseRating: 75, goalkeeperRating: 70 };
      const team2 = { name: 'Team 2', attackRating: 70, defenseRating: 80, goalkeeperRating: 75 };
      
      const match = new MatchSimulator(team1, team2);
      
      expect(match.team1.attackRating).toBe(80);
      expect(match.team2.defenseRating).toBe(80);
    });
  });

  describe('simulate()', () => {
    it('should simulate a complete match', () => {
      const team1 = { name: 'Test Team A', attackRating: 80, defenseRating: 75, goalkeeperRating: 70 };
      const team2 = { name: 'Test Team B', attackRating: 75, defenseRating: 80, goalkeeperRating: 75 };
      
      const match = new MatchSimulator(team1, team2);
      const result = match.simulate();
      
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('highlights');
      expect(result).toHaveProperty('finalResult');
      expect(result).toHaveProperty('penaltyScore');
    });

    it('should produce non-negative scores', () => {
      const team1 = { name: 'Team A', attackRating: 80, defenseRating: 75, goalkeeperRating: 70 };
      const team2 = { name: 'Team B', attackRating: 75, defenseRating: 80, goalkeeperRating: 75 };
      
      const match = new MatchSimulator(team1, team2);
      const result = match.simulate();
      
      expect(result.score[team1.name]).toBeGreaterThanOrEqual(0);
      expect(result.score[team2.name]).toBeGreaterThanOrEqual(0);
    });

    it('should produce realistic score ranges', () => {
      const team1 = { name: 'Balanced 1', attackRating: 75, defenseRating: 75, goalkeeperRating: 70 };
      const team2 = { name: 'Balanced 2', attackRating: 70, defenseRating: 80, goalkeeperRating: 75 };
      
      const scores = [];
      
      // Run multiple simulations
      for (let i = 0; i < 20; i++) {
        const match = new MatchSimulator(team1, team2);
        const result = match.simulate();
        
        // Only count regular time scores (no penalties)
        const hadPenalties = result.penaltyScore[team1.name] > 0 || result.penaltyScore[team2.name] > 0;
        if (!hadPenalties) {
          scores.push(result.score[team1.name] + result.score[team2.name]);
        }
      }
      
      if (scores.length > 0) {
        const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
        const maxScore = Math.max(...scores);
        
        // Most matches should have 0-6 total goals in regular time
        expect(avgScore).toBeLessThan(7);
        expect(maxScore).toBeLessThan(15); // Allow some variance
      }
    });

    it('should generate half-time and full-time highlights', () => {
      const team1 = { name: 'Metro City', attackRating: 85, defenseRating: 80, goalkeeperRating: 75 };
      const team2 = { name: 'Coastal City', attackRating: 80, defenseRating: 85, goalkeeperRating: 80 };
      
      const match = new MatchSimulator(team1, team2);
      const result = match.simulate();
      
      const hasHalfTime = result.highlights.some(h => h.description && h.description.includes('Half time'));
      const hasFullTime = result.highlights.some(h => h.description && h.description.includes('Full time'));
      
      expect(hasHalfTime).toBe(true);
      expect(hasFullTime).toBe(true);
    });

    it('should have highlights with required properties', () => {
      const team1 = { name: 'Team 1', attackRating: 80, defenseRating: 75, goalkeeperRating: 70 };
      const team2 = { name: 'Team 2', attackRating: 75, defenseRating: 80, goalkeeperRating: 75 };
      
      const match = new MatchSimulator(team1, team2);
      const result = match.simulate();
      
      expect(result.highlights.length).toBeGreaterThan(0);
      
      result.highlights.forEach(highlight => {
        expect(highlight).toHaveProperty('minute');
        expect(highlight).toHaveProperty('type');
        expect(highlight).toHaveProperty('description');
        expect(highlight).toHaveProperty('score');
      });
    });
  });

  describe('Team strength impact', () => {
    it('should reflect team strength in results', () => {
      const strongTeam = { name: 'Strong', attackRating: 88, defenseRating: 85, goalkeeperRating: 80 };
      const weakTeam = { name: 'Weak', attackRating: 30, defenseRating: 25, goalkeeperRating: 30 };
      
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
      expect(winPercentage).toBeGreaterThan(0.6);
    });

    it('should allow weaker teams to occasionally win', () => {
      const strongTeam = { name: 'Strong', attackRating: 85, defenseRating: 80, goalkeeperRating: 75 };
      const weakTeam = { name: 'Weak', attackRating: 65, defenseRating: 60, goalkeeperRating: 65 };
      
      let weakTeamWins = 0;
      const simulations = 100;
      
      for (let i = 0; i < simulations; i++) {
        const match = new MatchSimulator(strongTeam, weakTeam);
        const result = match.simulate();
        
        if (result.score[weakTeam.name] > result.score[strongTeam.name]) {
          weakTeamWins++;
        }
      }
      
      // Weaker team should win at least once in 100 matches (realistic underdogs can win)
      expect(weakTeamWins).toBeGreaterThan(0);
    });
  });

  describe('Penalty shootouts', () => {
    it('should handle penalty shootouts when match is drawn', () => {
      // Run multiple simulations to eventually get a draw
      let foundPenalties = false;
      
      for (let i = 0; i < 50 && !foundPenalties; i++) {
        const team1 = { name: 'Team A', attackRating: 70, defenseRating: 70, goalkeeperRating: 70 };
        const team2 = { name: 'Team B', attackRating: 70, defenseRating: 70, goalkeeperRating: 70 };
        
        const match = new MatchSimulator(team1, team2);
        const result = match.simulate();
        
        // Check if penalty shootout occurred
        if (result.penaltyScore[team1.name] > 0 || result.penaltyScore[team2.name] > 0) {
          foundPenalties = true;
          
          // Verify penalty shootout properties
          expect(result.penaltyScore[team1.name]).toBeGreaterThan(0);
          expect(result.penaltyScore[team2.name]).toBeGreaterThan(0);
          expect(result.penaltyScore[team1.name]).not.toBe(result.penaltyScore[team2.name]);
          
          // Check for penalty shootout highlights
          const penaltyHighlights = result.highlights.filter(h => 
            h.description && h.description.includes('Penalty Shootout')
          );
          expect(penaltyHighlights.length).toBeGreaterThan(0);
        }
      }
      
      // At least one simulation should have resulted in penalties
      expect(foundPenalties).toBe(true);
    });

    it('should have winner after penalty shootout', () => {
      // Force many matches to increase chance of penalties
      let foundPenalties = false;
      
      for (let i = 0; i < 50 && !foundPenalties; i++) {
        const team1 = { name: 'Team 1', attackRating: 65, defenseRating: 85, goalkeeperRating: 80 };
        const team2 = { name: 'Team 2', attackRating: 65, defenseRating: 85, goalkeeperRating: 80 };
        
        const match = new MatchSimulator(team1, team2);
        const result = match.simulate();
        
        if (result.penaltyScore[team1.name] > 0 || result.penaltyScore[team2.name] > 0) {
          foundPenalties = true;
          
          // After penalties, there must be a winner
          expect(result.score[team1.name]).not.toBe(result.score[team2.name]);
        }
      }
      
      expect(foundPenalties).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle minimum rating values', () => {
      const team1 = { name: 'Min Team 1', attackRating: 10, defenseRating: 10, goalkeeperRating: 10 };
      const team2 = { name: 'Min Team 2', attackRating: 10, defenseRating: 10, goalkeeperRating: 10 };
      
      expect(() => {
        const match = new MatchSimulator(team1, team2);
        match.simulate();
      }).not.toThrow();
    });

    it('should handle maximum rating values', () => {
      const team1 = { name: 'Max Team 1', attackRating: 100, defenseRating: 100, goalkeeperRating: 100 };
      const team2 = { name: 'Max Team 2', attackRating: 100, defenseRating: 100, goalkeeperRating: 100 };
      
      expect(() => {
        const match = new MatchSimulator(team1, team2);
        match.simulate();
      }).not.toThrow();
    });

    it('should handle teams with same name differently', () => {
      const team1 = { name: 'Same Name', attackRating: 80, defenseRating: 75, goalkeeperRating: 70 };
      const team2 = { name: 'Same Name', attackRating: 75, defenseRating: 80, goalkeeperRating: 75 };
      
      const match = new MatchSimulator(team1, team2);
      const result = match.simulate();
      
      // Should still have score entries (though this is a weird edge case)
      expect(result.score).toHaveProperty('Same Name');
    });
  });

  describe('finalResult formatting', () => {
    it('should format result without penalties correctly', () => {
      const team1 = { name: 'Team A', attackRating: 80, defenseRating: 75, goalkeeperRating: 70 };
      const team2 = { name: 'Team B', attackRating: 75, defenseRating: 80, goalkeeperRating: 75 };
      
      // Keep trying until we get a match without penalties
      for (let i = 0; i < 10; i++) {
        const match = new MatchSimulator(team1, team2);
        const result = match.simulate();
        
        if (result.penaltyScore[team1.name] === 0 && result.penaltyScore[team2.name] === 0) {
          expect(result.finalResult).toContain('Team A');
          expect(result.finalResult).toContain('Team B');
          expect(result.finalResult).not.toContain('(');
          break;
        }
      }
    });

    it('should format result with penalties correctly', () => {
      // Keep trying until we get penalties
      for (let i = 0; i < 50; i++) {
        const team1 = { name: 'Team A', attackRating: 70, defenseRating: 70, goalkeeperRating: 70 };
        const team2 = { name: 'Team B', attackRating: 70, defenseRating: 70, goalkeeperRating: 70 };
        
        const match = new MatchSimulator(team1, team2);
        const result = match.simulate();
        
        if (result.penaltyScore[team1.name] > 0 || result.penaltyScore[team2.name] > 0) {
          expect(result.finalResult).toContain('(');
          expect(result.finalResult).toContain(')');
          break;
        }
      }
    });
  });
});

