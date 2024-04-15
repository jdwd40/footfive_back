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
        const highlights = [];
        const winners = [];

        for (const match of matches) {
            console.log(match);
            if (match.team2 === null) {  // Check for a bye
                winners.push(match.team1);
                highlights.push(`${match.team1.name} had a bye.`);
                continue;
            }
            match.team1 = await Team.getRatingByTeamName(match.team1.name);
            match.team2 = await Team.getRatingByTeamName(match.team2.name);
            const result = await new MatchSimulator(match.team1, match.team2).simulate();
            const winner = result.score[match.team1.name] > result.score[match.team2.name] ? match.team1 : match.team2;
            winners.push(winner);
            roundResults.push(result.finalResult);
            highlights.push(result.shortHighlights);
        }

        this.results.push({ roundResults, highlights });
        this.currentRound++;

        if (winners.length > 1) {
            this.generateFixtures(winners);
        } else {
            // Reset for a new tournament if you want to start over automatically
            this.teams = winners;
            this.currentRound = 0;
            this.fixtures = [];
            this.results = [];
            this.generateFixtures();
        }

        return {
            roundResults,
            highlights,
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
        // this.teams = [];
    }
    
}

module.exports = JCup;
