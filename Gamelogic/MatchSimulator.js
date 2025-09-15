const HIGHLIGHT_TYPES = {
    GOAL: 'goal',
    SHOT: 'shot',
    PENALTY: 'penalty',
    HALF_TIME: 'halfTime',
    FULL_TIME: 'fullTime',
    BLOCKED: 'blocked',
    PENALTY_SHOOTOUT: 'penaltyShootout'
};

class MatchSimulator {
    constructor(team1, team2) {
        this.team1 = team1;
        this.team2 = team2;
        this.score = { [team1.name]: 0, [team2.name]: 0 };
        this.penaltyScore = { [team1.name]: 0, [team2.name]: 0 }; // Track penalty scores separately
        this.highlights = [];
        this.minute = 0;
        this.homeTeam = team1.name;
        this.awayTeam = team2.name;
    }

    simulate() {
        for (this.minute = 1; this.minute <= 90; this.minute++) {
            this.simulateMinute();
            if (this.minute === 45 ) {
                this.highlights.push({
                    minute: this.minute,
                    type: HIGHLIGHT_TYPES.HALF_TIME,
                    description: "Half time: The score is " + this.team1.name + " " + this.score[this.team1.name] + "-" + this.score[this.team2.name] + " " + this.team2.name,
                    score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] }
                });

            }
            if (this.minute === 90) {
                this.highlights.push({
                    minute: this.minute,
                    type: HIGHLIGHT_TYPES.FULL_TIME,
                    description: "Full time: The score is " + this.team1.name + " " + this.score[this.team1.name] + "-" + this.score[this.team2.name] + " " + this.team2.name,
                    score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] }
                });

            }
        }

        if (this.score[this.team1.name] === this.score[this.team2.name]) {
            this.highlights.push({
                minute: 90,
                type: HIGHLIGHT_TYPES.PENALTY_SHOOTOUT,
                description: "Full time: The match is a draw. Starting penalty shootout.",
                score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] }
            });

            this.handlePenaltyShootout();
        }
        return {
            score: this.score,
            penaltyScore: this.penaltyScore, // Include penalty scores in the result
            highlights: this.highlights,
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
            this.highlights.push({
                minute: this.minute,
                type: HIGHLIGHT_TYPES.BLOCKED,
                team: attackingTeam.name,
                description: `${this.minute}': Attack by ${attackingTeam.name} blocked by ${defendingTeam.name}`,
                score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] }
            });
        }
    }

    defenseBlocks(defendingTeam) {
        return Math.random() < defendingTeam.defenseRating / 110;
    }

    handleShot(attackingTeam, defendingTeam) {
        if (Math.random() < 0.6) { // Chance of being on target
            if (!this.goalkeeperSaves(defendingTeam)) {
                this.score[attackingTeam.name]++;
                this.highlights.push({
                    minute: this.minute,
                    type: HIGHLIGHT_TYPES.GOAL,
                    team: attackingTeam.name,
                    description: `${this.minute}': GOAL by ${attackingTeam.name}! Score is now ${this.score[attackingTeam.name]}-${this.score[defendingTeam.name]}`,
                    score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] }
                });

            } else {
                this.highlights.push({
                    minute: this.minute,
                    type: HIGHLIGHT_TYPES.SHOT,
                    team: attackingTeam.name,
                    description: `${this.minute}': Shot on target by ${attackingTeam.name} saved by ${defendingTeam.name}`,
                    score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] }
                });

            }
        } else {
            this.highlights.push({
                minute: this.minute,
                type: HIGHLIGHT_TYPES.SHOT,
                team: attackingTeam.name,
                description: `${this.minute}': Shot by ${attackingTeam.name} missed`,
                score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] }
            });
        }
    }

    goalkeeperSaves(defendingTeam) {
        return Math.random() < defendingTeam.goalkeeperRating / 90;
    }

    handlePenalty(attackingTeam) {
        if (Math.random() < 0.5) {
            this.score[attackingTeam.name]++;
            this.highlights.push({
                minute: this.minute,
                type: HIGHLIGHT_TYPES.PENALTY,
                team: attackingTeam.name,
                description: `${this.minute}': PENALTY scored by ${attackingTeam.name}! Score is now ${this.score[attackingTeam.name]}-${this.score[this.team2.name]}`,
                score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] }
            });

        } else {
            this.highlights.push({
                minute: this.minute,
                type: HIGHLIGHT_TYPES.PENALTY,
                team: attackingTeam.name,
                description: `${this.minute}': PENALTY missed by ${attackingTeam.name}`,
                score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] }
            });

        }
    }
// ------------------------------ pen shoot out --------------------

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
            this.highlights.push({
                minute: 90,
                type: HIGHLIGHT_TYPES.PENALTY_SHOOTOUT,
                team: team.name,
                description: `Penalty Shootout: ${team.name} scores!`,
                score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] }
            });

            return 1;
        } else {
            this.highlights.push({
                minute: 90,
                type: HIGHLIGHT_TYPES.PENALTY_SHOOTOUT,
                team: team.name,
                description: `Penalty Shootout: ${team.name} misses!`,
                score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] }
            });

            return 0;
        }
    }

    updateShootoutScore(team1Score, team2Score) {
        if (team1Score > team2Score) {
            this.score[this.team1.name] += team1Score;
            this.score[this.team2.name] += team2Score;
            this.highlights.push({
                minute: 90,
                type: HIGHLIGHT_TYPES.PENALTY_SHOOTOUT,
                team: this.team1.name,
                description: `Penalty Shootout Winner: ${this.team1.name} on penalties (${team1Score}-${team2Score})`,
                score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] }
            });

        } else {
            this.score[this.team1.name] += team1Score;
            this.score[this.team2.name] += team2Score;
            this.highlights.push({
                minute: 90,
                type: HIGHLIGHT_TYPES.PENALTY_SHOOTOUT,
                team: this.team2.name,
                description: `Penalty Shootout Winner: ${this.team2.name} on penalties (${team1Score}-${team2Score})`,
                score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] }
            });

        }
    }
// ----------------------- 
    formatFinalResult() {
        if (Object.values(this.penaltyScore).some(score => score > 0)) {
            return `${this.team1.name} ${this.score[this.team1.name]}(${this.penaltyScore[this.team1.name]}) - ${this.team2.name} ${this.score[this.team2.name]}(${this.penaltyScore[this.team2.name]})`;
        }
        return `${this.team1.name} ${this.score[this.team1.name]} - ${this.team2.name} ${this.score[this.team2.name]}`;
    }
}

module.exports = MatchSimulator;
