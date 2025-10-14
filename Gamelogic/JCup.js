const Team = require('../models/TeamModel');
const MatchSimulator = require('./MatchSimulator');

class JCup {
    constructor() {
        this.teams = [];
        this.currentRound = 0;
        this.fixtures = []; // Array of rounds, each containing pairs of matches
        this.results = [];
        this.completedMatches = {}; // Track completed matches by round: { roundIndex: { matchIndex: result } }
    }

    async loadTeams() {
        this.resetJCup();
        this.teams = await Team.getAll();
        this.generateFixtures();
    }

    generateFixtures(teams = this.teams) {
        let roundFixtures = [];
        let formattedRound = [];
        // Shuffle and pair teams for the current round
        let shuffledTeams = this.shuffleTeams(teams);
        while (shuffledTeams.length > 1) {
            let team1 = shuffledTeams.shift();
            let team2 = shuffledTeams.shift();
            roundFixtures.push({ team1, team2 });
            formattedRound.push(`Round ${this.currentRound + 1}: ${team1.name} Vs ${team2.name}`);
        }

        // Handle an odd number of teams by giving the last team a bye if necessary
        if (shuffledTeams.length === 1) {
            formattedRound.push(`Round ${this.currentRound + 1}: ${shuffledTeams[0].name} has a bye`);
            roundFixtures.push({ team1: shuffledTeams[0], team2: null });
        }

        this.fixtures.push(roundFixtures);
        return formattedRound;
    }

    async simulateRound() {
        if (this.currentRound >= this.fixtures.length) {
            return { error: "No more rounds to play.", fixtures: this.generateFixtures() };
        }

        const matches = this.fixtures[this.currentRound];
        const roundResults = [];
        const winners = [];

        // Determine the current round name (before matches are played)
        const currentTeamCount = matches.length * 2; // Each match has 2 teams
        const currentRoundName = this.getRoundName(currentTeamCount);

        // Initialize completed matches for this round if not exists
        if (!this.completedMatches[this.currentRound]) {
            this.completedMatches[this.currentRound] = {};
        }

        for (let i = 0; i < matches.length; i++) {
            const match = matches[i];
            
            // Skip if match already completed
            if (this.completedMatches[this.currentRound][i]) {
                const completedResult = this.completedMatches[this.currentRound][i];
                roundResults.push(completedResult.matchResult);
                winners.push(completedResult.winner);
                continue;
            }
            console.log(match);
            if (match.team2 === null) {  // Check for a bye
                winners.push(match.team1);
                // Update highest round for team with bye
                await Team.updateHighestRound(match.team1.id, currentRoundName);
                continue;
            }
            // Only fetch from database if teams don't already have ratings
            if (!match.team1.attackRating || !match.team1.defenseRating || !match.team1.goalkeeperRating) {
                match.team1 = await Team.getRatingByTeamName(match.team1.name);
            }
            if (!match.team2.attackRating || !match.team2.defenseRating || !match.team2.goalkeeperRating) {
                match.team2 = await Team.getRatingByTeamName(match.team2.name);
            }
            const result = new MatchSimulator(match.team1, match.team2).simulate();
            const winner = this.determineWinner(result, match.team1, match.team2);
            const loser = winner.id === match.team1.id ? match.team2 : match.team1;
            
            // Get scores for each team
            const team1Goals = result.score[match.team1.name];
            const team2Goals = result.score[match.team2.name];
            
            // Update match statistics for both teams
            await Team.updateMatchStats(match.team1.id, winner.id === match.team1.id, team1Goals, team2Goals);
            await Team.updateMatchStats(match.team2.id, winner.id === match.team2.id, team2Goals, team1Goals);
            
            // Update highest round reached for both teams (winner will advance, so they reach this round)
            await Team.updateHighestRound(match.team1.id, currentRoundName);
            await Team.updateHighestRound(match.team2.id, currentRoundName);
            
            winners.push(winner);
            const matchResult = {
                score: result.score,
                penaltyScore: result.penaltyScore,
                highlights: result.highlights,
                finalResult: result.finalResult,
                matchMetadata: {
                    homeTeam: match.team1.name,
                    awayTeam: match.team2.name,
                    venue: "Stadium Name", // This could be made dynamic in the future
                    date: new Date().toISOString(),
                    round: `Round ${this.currentRound + 1}`
                }
            };
            roundResults.push(matchResult);
        }

        this.results.push({ roundResults });
        this.currentRound++;

        if (winners.length > 1) {
            this.generateFixtures(winners);
        } else {
            // Tournament finished - determine winner and runner-up from final match
            const finalMatch = roundResults[0]; // The last match is the final
            const winner = winners[0];
            
            // Determine runner-up from the final match
            const finalMatchTeam1 = matches[0].team1.name;
            const finalMatchTeam2 = matches[0].team2.name;
            const runnerUpName = finalMatchTeam1 === winner.name ? finalMatchTeam2 : finalMatchTeam1;
            
            // Get runner-up team object
            const runnerUp = matches[0].team1.name === runnerUpName ? matches[0].team1 : matches[0].team2;
            
            // Update championship winner and runner-up statistics
            await Team.addJCupsWon(winner.id);
            await Team.addRunnerUp(runnerUp.id);
            
            // Update highest round for winner and runner-up
            await Team.updateHighestRound(winner.id, 'Winner');
            await Team.updateHighestRound(runnerUp.id, 'Runner-up');
            
            this.teams = winners;
            this.currentRound = 4;
            
            return {
                roundResults,
                nextRoundFixtures: this.fixtures[this.currentRound] || "Tournament finished, initializing new tournament.",
                winner,
                runner: runnerUp
            };
        }

        return {
            roundResults,
            nextRoundFixtures: this.fixtures[this.currentRound] || "Tournament finished, initializing new tournament."
        };
    }

    shuffleTeams(teams) {
        let shuffled = [...teams];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    // Get round name based on number of teams
    getRoundName(teamCount) {
        if (teamCount === 2) return 'Final';
        if (teamCount === 4) return 'Semi-finals';
        if (teamCount === 8) return 'Quarter-finals';
        if (teamCount === 16) return 'Round of 16';
        if (teamCount === 32) return 'Round of 32';
        return `Round of ${teamCount}`;
    }

    // Helper method to determine winner considering penalty shootouts
    determineWinner(result, team1, team2) {
        // Check if there was a penalty shootout (both penalty scores > 0 or tie in regular score)
        const team1PenaltyScore = result.penaltyScore[team1.name] || 0;
        const team2PenaltyScore = result.penaltyScore[team2.name] || 0;
        
        // If penalty shootout occurred, use penalty scores
        if (team1PenaltyScore > 0 || team2PenaltyScore > 0) {
            return team1PenaltyScore > team2PenaltyScore ? team1 : team2;
        }
        
        // Otherwise, use regular scores
        return result.score[team1.name] > result.score[team2.name] ? team1 : team2;
    }
    async simulateSingleMatch(matchIndex) {
        if (this.currentRound >= this.fixtures.length) {
            throw new Error("No active round to simulate.");
        }

        const matches = this.fixtures[this.currentRound];
        
        if (matchIndex < 0 || matchIndex >= matches.length) {
            throw new Error(`Invalid match index. Must be between 0 and ${matches.length - 1}`);
        }

        const match = matches[matchIndex];

        // Initialize completed matches for this round if not exists
        if (!this.completedMatches[this.currentRound]) {
            this.completedMatches[this.currentRound] = {};
        }

        // Check if already completed
        if (this.completedMatches[this.currentRound][matchIndex]) {
            return this.completedMatches[this.currentRound][matchIndex];
        }

        // Determine the current round name
        const currentTeamCount = matches.length * 2;
        const currentRoundName = this.getRoundName(currentTeamCount);

        // Handle bye
        if (match.team2 === null) {
            await Team.updateHighestRound(match.team1.id, currentRoundName);
            const result = {
                matchResult: {
                    isBye: true,
                    team: match.team1.name
                },
                winner: match.team1
            };
            this.completedMatches[this.currentRound][matchIndex] = result;
            return result;
        }

        // Fetch ratings if needed
        if (!match.team1.attackRating || !match.team1.defenseRating || !match.team1.goalkeeperRating) {
            match.team1 = await Team.getRatingByTeamName(match.team1.name);
        }
        if (!match.team2.attackRating || !match.team2.defenseRating || !match.team2.goalkeeperRating) {
            match.team2 = await Team.getRatingByTeamName(match.team2.name);
        }

        // Simulate the match
        const result = new MatchSimulator(match.team1, match.team2).simulate();
        const winner = this.determineWinner(result, match.team1, match.team2);
        
        // Get scores for each team
        const team1Goals = result.score[match.team1.name];
        const team2Goals = result.score[match.team2.name];
        
        // Update match statistics for both teams
        await Team.updateMatchStats(match.team1.id, winner.id === match.team1.id, team1Goals, team2Goals);
        await Team.updateMatchStats(match.team2.id, winner.id === match.team2.id, team2Goals, team1Goals);
        
        // Update highest round reached for both teams
        await Team.updateHighestRound(match.team1.id, currentRoundName);
        await Team.updateHighestRound(match.team2.id, currentRoundName);

        const matchResult = {
            score: result.score,
            penaltyScore: result.penaltyScore,
            highlights: result.highlights,
            finalResult: result.finalResult,
            matchMetadata: {
                homeTeam: match.team1.name,
                awayTeam: match.team2.name,
                venue: "Stadium Name",
                date: new Date().toISOString(),
                round: `Round ${this.currentRound + 1}`
            }
        };

        // Store the completed match
        this.completedMatches[this.currentRound][matchIndex] = {
            matchResult,
            winner
        };

        return { matchResult, winner };
    }

    isRoundComplete() {
        if (this.currentRound >= this.fixtures.length) {
            return true;
        }

        const matches = this.fixtures[this.currentRound];
        const completedInRound = this.completedMatches[this.currentRound] || {};
        
        return matches.length === Object.keys(completedInRound).length;
    }

    resetJCup() {
        this.currentRound = 0;
        this.fixtures = [];  // Clear fixtures
        this.results = [];
        this.completedMatches = {};
        // Optionally clear teams if they are supposed to be reloaded each tournament
        this.teams = [];
    }

    async jCupWon(winner_id, runner_id) {
        await Team.addJCupsWon(winner_id);
        if (runner_id) {
            await Team.addRunnerUp(runner_id);
        }
        return { msg: "updated" };
    }
    
}

module.exports = JCup;
