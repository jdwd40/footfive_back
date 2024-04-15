class MatchSimulator {
    constructor(team1, team2) {
        this.team1 = team1;
        this.team2 = team2;
        this.score = { [team1.name]: 0, [team2.name]: 0 };
        this.penaltyScore = { [team1.name]: 0, [team2.name]: 0 }; // Track penalty scores separately
        this.highlights = [];
        this.shortHighlights = []; // New list for short highlights
        this.minute = 0;
    }

    simulate() {
        for (this.minute = 1; this.minute <= 90; this.minute++) {
            this.simulateMinute();
        }
        if (this.score[this.team1.name] === this.score[this.team2.name]) {
            this.highlights.push("Full time: The match is a draw. Starting penalty shootout.");
            this.shortHighlights.push("Starting penalty shootout.");
            this.handlePenaltyShootout();
        }
        return {
            score: this.score,
            penaltyScore: this.penaltyScore, // Include penalty scores in the result
            highlights: this.highlights,
            shortHighlights: this.shortHighlights,
            finalResult: this.formatFinalResult() // Include formatted final result
        };
    }

    simulateMinute() {
        // Simulate minute by minute game logic
        if (this.chanceOfAttack(this.team1)) {
            this.handleAttack(this.team1, this.team2);
        }

        if (this.chanceOfAttack(this.team2)) {
            this.handleAttack(this.team2, this.team1);
        }
    }

    chanceOfAttack(team) {
        return Math.random() < team.attackRating / 200;
    }

    handleAttack(attackingTeam, defendingTeam) {
        if (!this.defenseBlocks(defendingTeam)) {
            if (Math.random() < 0.04) { // chance of penalty
                this.handlePenalty(attackingTeam);
            } else {
                this.handleShot(attackingTeam, defendingTeam);
            }
        } else {
            this.highlights.push(`${this.minute}': Attack by ${attackingTeam.name} blocked by ${defendingTeam.name}`);
        }
    }

    defenseBlocks(defendingTeam) {
        return Math.random() < defendingTeam.defenseRating / 110;
    }

    handleShot(attackingTeam, defendingTeam) {
        if (Math.random() < 0.6) { // Chance of being on target
            if (!this.goalkeeperSaves(defendingTeam)) {
                this.score[attackingTeam.name]++;
                this.highlights.push(`${this.minute}': GOAL by ${attackingTeam.name}! Score is now ${this.score[attackingTeam.name]}-${this.score[defendingTeam.name]}`);
                this.shortHighlights.push(`${this.minute}': GOAL by ${attackingTeam.name}`);
            } else {
                this.highlights.push(`${this.minute}': Shot on target by ${attackingTeam.name} saved by ${defendingTeam.name}`);
                this.shortHighlights.push(`${this.minute}': Shot on target saved by ${defendingTeam.name}`);
            }
        } else {
            this.highlights.push(`${this.minute}': Shot by ${attackingTeam.name} missed`);
        }
    }

    goalkeeperSaves(defendingTeam) {
        return Math.random() < defendingTeam.goalkeeperRating / 90;
    }

    handlePenalty(attackingTeam) {
        if (Math.random() < 0.5) {
            this.score[attackingTeam.name]++;
            this.highlights.push(`${this.minute}': PENALTY scored by ${attackingTeam.name}!`);
            this.shortHighlights.push(`${this.minute}': PENALTY scored by ${attackingTeam.name}`);
        } else {
            this.highlights.push(`${this.minute}': PENALTY missed by ${attackingTeam.name}`);
            this.shortHighlights.push(`${this.minute}': PENALTY missed by ${attackingTeam.name}`);
        }
    }

    handlePenaltyShootout() {
        let team1Score = 0;
        let team2Score = 0;
        for (let i = 0; i < 5; i++) {
            team1Score += this.takePenalty(this.team1);
            team2Score += this.takePenalty(this.team2);
        }
        while (team1Score === team2Score) {
            team1Score += this.takePenalty(this.team1);
            team2Score += this.takePenalty(this.team2);
        }
        this.penaltyScore[this.team1.name] = team1Score;
        this.penaltyScore[this.team2.name] = team2Score;
        this.updateShootoutScore(team1Score, team2Score);
    }

    takePenalty(team) {
        const success = Math.random() < 0.75;
        if (success) {
            this.highlights.push(`Penalty Shootout: ${team.name} scores!`);
            this.shortHighlights.push(`Penalty: ${team.name} scores!`);
            return 1;
        } else {
            this.highlights.push(`Penalty Shootout: ${team.name} misses!`);
            this.shortHighlights.push(`Penalty: ${team.name} misses!`);
            return 0;
        }
    }

    updateShootoutScore(team1Score, team2Score) {
        if (team1Score > team2Score) {
            this.score[this.team1.name] += team1Score;
            this.score[this.team2.name] += team2Score;
            this.highlights.push(`Penalty Shootout Winner: ${this.team1.name} on penalties (${team1Score}-${team2Score})`);
            this.shortHighlights.push(`Winner: ${this.team1.name} on penalties (${team1Score}-${team2Score})`);
        } else {
            this.score[this.team1.name] += team1Score;
            this.score[this.team2.name] += team2Score;
            this.highlights.push(`Penalty Shootout Winner: ${this.team2.name} on penalties (${team1Score}-${team2Score})`);
            this.shortHighlights.push(`Winner: ${this.team2.name} on penalties (${team1Score}-${team2Score})`);
        }
    }

    formatFinalResult() {
        if (Object.values(this.penaltyScore).some(score => score > 0)) {
            return `${this.team1.name} ${this.score[this.team1.name]}(${this.penaltyScore[this.team1.name]}) - ${this.team2.name} ${this.score[this.team2.name]}(${this.penaltyScore[this.team2.name]})`;
        }
        return `${this.team1.name} ${this.score[this.team1.name]} - ${this.team2.name} ${this.score[this.team2.name]}`;
    }
}

module.exports = MatchSimulator;
