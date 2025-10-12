const Team = require('../models/TeamModel');
const MatchSimulator = require('./MatchSimulator');

class JCup {
    constructor() {
        this.teams = [];
        this.currentRound = 0;
        this.fixtures = []; // Array of rounds, each containing pairs of matches
        this.results = [];
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

        for (const match of matches) {
            console.log(match);
            if (match.team2 === null) {  // Check for a bye
                winners.push(match.team1);
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
            const winner = result.score[match.team1.name] > result.score[match.team2.name] ? match.team1 : match.team2;
            winners.push(winner);
            roundResults.push({
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
            });
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
            
            // Update statistics
            await Team.addJCupsWon(winner.id);
            await Team.addRunnerUp(runnerUp.id);
            
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
    resetJCup() {
        this.currentRound = 0;
        this.fixtures = [];  // Clear fixtures
        this.results = [];
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
