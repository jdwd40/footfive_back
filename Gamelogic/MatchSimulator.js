const HIGHLIGHT_TYPES = {
    GOAL: 'goal',
    SHOT: 'shot',
    PENALTY: 'penalty',
    HALF_TIME: 'halfTime',
    FULL_TIME: 'fullTime',
    BLOCKED: 'blocked',
    PENALTY_SHOOTOUT: 'penaltyShootout',
    PRESSURE: 'pressure',
    EXTRA_TIME_START: 'extraTimeStart',
    EXTRA_TIME_HALF: 'extraTimeHalf',
    EXTRA_TIME_END: 'extraTimeEnd'
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
        // Regular time: minutes 1-90
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

        // Check if match is a draw after regular time
        if (this.score[this.team1.name] === this.score[this.team2.name]) {
            // Extra time: minutes 91-120
            this.highlights.push({
                minute: 90,
                type: HIGHLIGHT_TYPES.EXTRA_TIME_START,
                description: "The match is a draw. Extra time begins!",
                score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] }
            });

            for (this.minute = 91; this.minute <= 120; this.minute++) {
                this.simulateMinute();
                
                if (this.minute === 105) {
                    this.highlights.push({
                        minute: this.minute,
                        type: HIGHLIGHT_TYPES.EXTRA_TIME_HALF,
                        description: "Extra time half: The score is " + this.team1.name + " " + this.score[this.team1.name] + "-" + this.score[this.team2.name] + " " + this.team2.name,
                        score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] }
                    });
                }
                
                if (this.minute === 120) {
                    this.highlights.push({
                        minute: this.minute,
                        type: HIGHLIGHT_TYPES.EXTRA_TIME_END,
                        description: "End of extra time: The score is " + this.team1.name + " " + this.score[this.team1.name] + "-" + this.score[this.team2.name] + " " + this.team2.name,
                        score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] }
                    });
                }
            }

            // Check if still a draw after extra time
            if (this.score[this.team1.name] === this.score[this.team2.name]) {
                this.highlights.push({
                    minute: 120,
                    type: HIGHLIGHT_TYPES.PENALTY_SHOOTOUT,
                    description: "Extra time ended in a draw. Starting penalty shootout.",
                    score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] }
                });

                this.handlePenaltyShootout();
            }
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

    calculatePressure(attackingTeam, defendingTeam) {
        const ratingDifference = attackingTeam.attackRating - defendingTeam.defenseRating;
        
        if (ratingDifference >= 15) {
            return 'high';
        } else if (ratingDifference >= 5) {
            return 'medium';
        } else {
            return 'low';
        }
    }

    generatePressureNarrative(attackingTeam, defendingTeam, pressureLevel) {
        const highPressureNarratives = [
            `${this.minute}': ${attackingTeam.name} are deep in ${defendingTeam.name}'s half and putting immense pressure on the defence`,
            `${this.minute}': ${attackingTeam.name} are dominating possession and ${defendingTeam.name} can't get out of their own half`,
            `${this.minute}': ${attackingTeam.name} are relentless! ${defendingTeam.name} are pinned back and struggling`,
            `${this.minute}': ${attackingTeam.name} are all over ${defendingTeam.name} here! The pressure is intense`,
            `${this.minute}': ${defendingTeam.name} are under siege! ${attackingTeam.name} are dominating`
        ];

        const mediumPressureNarratives = [
            `${this.minute}': ${attackingTeam.name} push forward and are giving ${defendingTeam.name} a hard time`,
            `${this.minute}': ${attackingTeam.name} are building momentum and pressing ${defendingTeam.name}`,
            `${this.minute}': ${attackingTeam.name} are on the attack and ${defendingTeam.name} need to stay focused`,
            `${this.minute}': ${attackingTeam.name} are looking dangerous going forward`,
            `${this.minute}': ${attackingTeam.name} are pressing high and ${defendingTeam.name} are feeling the heat`
        ];

        const narratives = pressureLevel === 'high' ? highPressureNarratives : mediumPressureNarratives;
        return narratives[Math.floor(Math.random() * narratives.length)];
    }

    handleAttack(attackingTeam, defendingTeam) {
        const pressureLevel = this.calculatePressure(attackingTeam, defendingTeam);
        
        // Generate pressure narrative for medium/high pressure
        if (pressureLevel === 'medium' || pressureLevel === 'high') {
            this.highlights.push({
                minute: this.minute,
                type: HIGHLIGHT_TYPES.PRESSURE,
                team: attackingTeam.name,
                description: this.generatePressureNarrative(attackingTeam, defendingTeam, pressureLevel),
                score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] }
            });
        }
        
        if (!this.defenseBlocks(defendingTeam)) {
            // Adjust penalty chance based on pressure (double it for high pressure)
            const penaltyChance = pressureLevel === 'high' ? 0.08 : 0.04;
            
            if (Math.random() < penaltyChance) {
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
                
                const goalDescriptions = [
                    `${this.minute}': GOAL by ${attackingTeam.name}! They score! It's now ${this.score[attackingTeam.name]}-${this.score[defendingTeam.name]}`,
                    `${this.minute}': GOAL! ${attackingTeam.name} find the back of the net! Score is ${this.score[attackingTeam.name]}-${this.score[defendingTeam.name]}`,
                    `${this.minute}': GOAL by ${attackingTeam.name}! What a finish! ${this.score[attackingTeam.name]}-${this.score[defendingTeam.name]}`,
                    `${this.minute}': It's in! ${attackingTeam.name} score! ${this.score[attackingTeam.name]}-${this.score[defendingTeam.name]}`,
                    `${this.minute}': GOAL! ${attackingTeam.name} break through! Score is now ${this.score[attackingTeam.name]}-${this.score[defendingTeam.name]}`
                ];
                
                this.highlights.push({
                    minute: this.minute,
                    type: HIGHLIGHT_TYPES.GOAL,
                    team: attackingTeam.name,
                    description: goalDescriptions[Math.floor(Math.random() * goalDescriptions.length)],
                    score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] }
                });

            } else {
                const saveDescriptions = [
                    `${this.minute}': Shot on target by ${attackingTeam.name} - brilliant save by ${defendingTeam.name}!`,
                    `${this.minute}': ${attackingTeam.name} take a shot - the keeper denies them!`,
                    `${this.minute}': Shot by ${attackingTeam.name} saved by ${defendingTeam.name}'s goalkeeper!`,
                    `${this.minute}': ${attackingTeam.name} shoot - what a save by ${defendingTeam.name}!`,
                    `${this.minute}': ${attackingTeam.name} on target but ${defendingTeam.name}'s keeper makes a great stop!`
                ];
                
                this.highlights.push({
                    minute: this.minute,
                    type: HIGHLIGHT_TYPES.SHOT,
                    team: attackingTeam.name,
                    description: saveDescriptions[Math.floor(Math.random() * saveDescriptions.length)],
                    score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] }
                });

            }
        } else {
            const missDescriptions = [
                `${this.minute}': Shot by ${attackingTeam.name} - they miss! Wide of the target`,
                `${this.minute}': ${attackingTeam.name} take a shot - off target!`,
                `${this.minute}': ${attackingTeam.name} shoot but it's wide! Chance wasted`,
                `${this.minute}': ${attackingTeam.name} miss the target! Shot goes wide`,
                `${this.minute}': Shot by ${attackingTeam.name} flies over the bar!`
            ];
            
            this.highlights.push({
                minute: this.minute,
                type: HIGHLIGHT_TYPES.SHOT,
                team: attackingTeam.name,
                description: missDescriptions[Math.floor(Math.random() * missDescriptions.length)],
                score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] }
            });
        }
    }

    goalkeeperSaves(defendingTeam) {
        return Math.random() < defendingTeam.goalkeeperRating / 90;
    }

    handlePenalty(attackingTeam) {
        const defendingTeam = attackingTeam.name === this.team1.name ? this.team2 : this.team1;
        
        // Stage 1: Penalty Awarded
        const awardDescriptions = [
            `${this.minute}': PENALTY awarded to ${attackingTeam.name}!`,
            `${this.minute}': PENALTY! The referee points to the spot for ${attackingTeam.name}`,
            `${this.minute}': Penalty to ${attackingTeam.name}! The pressure told on ${defendingTeam.name}`,
            `${this.minute}': The referee awards a penalty to ${attackingTeam.name}!`,
            `${this.minute}': PENALTY! ${defendingTeam.name} concede a penalty!`
        ];
        
        this.highlights.push({
            minute: this.minute,
            type: HIGHLIGHT_TYPES.PENALTY,
            team: attackingTeam.name,
            description: awardDescriptions[Math.floor(Math.random() * awardDescriptions.length)],
            score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] }
        });
        
        // Stage 2: Determine outcome (scored, saved, or missed)
        const outcome = this.determinePenaltyOutcome(defendingTeam);
        
        // Stage 3: Result highlight
        if (outcome === 'scored') {
            this.score[attackingTeam.name]++;
            const scoreDescriptions = [
                `${this.minute}': GOAL! Penalty scored by ${attackingTeam.name}! ${this.score[attackingTeam.name]}-${this.score[defendingTeam.name]}`,
                `${this.minute}': It's in! ${attackingTeam.name} convert the penalty! Score: ${this.score[attackingTeam.name]}-${this.score[defendingTeam.name]}`,
                `${this.minute}': GOAL! ${attackingTeam.name} make no mistake from the spot! ${this.score[attackingTeam.name]}-${this.score[defendingTeam.name]}`,
                `${this.minute}': Penalty scored! ${attackingTeam.name} find the net! ${this.score[attackingTeam.name]}-${this.score[defendingTeam.name]}`,
                `${this.minute}': GOAL from the penalty spot! ${attackingTeam.name} score! ${this.score[attackingTeam.name]}-${this.score[defendingTeam.name]}`
            ];
            this.highlights.push({
                minute: this.minute,
                type: HIGHLIGHT_TYPES.PENALTY,
                team: attackingTeam.name,
                description: scoreDescriptions[Math.floor(Math.random() * scoreDescriptions.length)],
                score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] }
            });
        } else if (outcome === 'saved') {
            const saveDescriptions = [
                `${this.minute}': SAVED! Brilliant penalty save by ${defendingTeam.name}'s goalkeeper!`,
                `${this.minute}': The keeper saves it! ${defendingTeam.name}'s goalkeeper denies ${attackingTeam.name}!`,
                `${this.minute}': What a save! ${defendingTeam.name}'s keeper keeps the penalty out!`,
                `${this.minute}': Penalty saved! ${defendingTeam.name}'s goalkeeper is the hero!`,
                `${this.minute}': Incredible save! ${defendingTeam.name}'s keeper stops the penalty!`
            ];
            this.highlights.push({
                minute: this.minute,
                type: HIGHLIGHT_TYPES.PENALTY,
                team: attackingTeam.name,
                description: saveDescriptions[Math.floor(Math.random() * saveDescriptions.length)],
                score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] }
            });
        } else { // missed
            const missDescriptions = [
                `${this.minute}': MISSED! ${attackingTeam.name} miss the penalty!`,
                `${this.minute}': Over the bar! ${attackingTeam.name} waste the penalty!`,
                `${this.minute}': Wide! ${attackingTeam.name}'s penalty goes off target!`,
                `${this.minute}': Penalty missed! ${attackingTeam.name} shoot wide of the goal!`,
                `${this.minute}': Blazed over! ${attackingTeam.name} miss from the spot!`
            ];
            this.highlights.push({
                minute: this.minute,
                type: HIGHLIGHT_TYPES.PENALTY,
                team: attackingTeam.name,
                description: missDescriptions[Math.floor(Math.random() * missDescriptions.length)],
                score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] }
            });
        }
    }

    determinePenaltyOutcome(defendingTeam) {
        // 70% chance on target (30% miss completely)
        if (Math.random() < 0.7) {
            // If on target, goalkeeper has chance to save based on rating
            if (Math.random() < (defendingTeam.goalkeeperRating / 120)) {
                return 'saved';
            }
            return 'scored';
        }
        return 'missed';
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
        const defendingTeam = team.name === this.team1.name ? this.team2 : this.team1;
        
        // Stage 1: Penalty setup (optional - commented out to avoid too many highlights in shootout)
        // Uncomment if you want more dramatic shootout commentary
        /*
        this.highlights.push({
            minute: 90,
            type: HIGHLIGHT_TYPES.PENALTY_SHOOTOUT,
            team: team.name,
            description: `Penalty Shootout: ${team.name} step up...`,
            score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] }
        });
        */
        
        // Determine outcome using similar logic to regular penalties
        const outcome = this.determinePenaltyShootoutOutcome(defendingTeam);
        
        // Stage 2: Result
        if (outcome === 'scored') {
            const scoreDescriptions = [
                `Penalty Shootout: ${team.name} score!`,
                `Penalty Shootout: GOAL! ${team.name} convert!`,
                `Penalty Shootout: ${team.name} find the net!`
            ];
            this.highlights.push({
                minute: 90,
                type: HIGHLIGHT_TYPES.PENALTY_SHOOTOUT,
                team: team.name,
                description: scoreDescriptions[Math.floor(Math.random() * scoreDescriptions.length)],
                score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] }
            });
            return 1;
        } else if (outcome === 'saved') {
            const saveDescriptions = [
                `Penalty Shootout: SAVED! ${defendingTeam.name}'s keeper denies ${team.name}!`,
                `Penalty Shootout: The keeper saves from ${team.name}!`,
                `Penalty Shootout: ${defendingTeam.name}'s goalkeeper stops it!`
            ];
            this.highlights.push({
                minute: 90,
                type: HIGHLIGHT_TYPES.PENALTY_SHOOTOUT,
                team: team.name,
                description: saveDescriptions[Math.floor(Math.random() * saveDescriptions.length)],
                score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] }
            });
            return 0;
        } else { // missed
            const missDescriptions = [
                `Penalty Shootout: ${team.name} miss!`,
                `Penalty Shootout: WIDE! ${team.name} miss the target!`,
                `Penalty Shootout: ${team.name} blast it over the bar!`
            ];
            this.highlights.push({
                minute: 90,
                type: HIGHLIGHT_TYPES.PENALTY_SHOOTOUT,
                team: team.name,
                description: missDescriptions[Math.floor(Math.random() * missDescriptions.length)],
                score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] }
            });
            return 0;
        }
    }

    determinePenaltyShootoutOutcome(defendingTeam) {
        // Shootout penalties: 75% success rate overall
        // 85% on target (15% miss completely)
        if (Math.random() < 0.85) {
            // If on target, goalkeeper has ~12% chance to save (to get ~75% overall success)
            if (Math.random() < 0.12) {
                return 'saved';
            }
            return 'scored';
        }
        return 'missed';
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

