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
    EXTRA_TIME_END: 'extraTimeEnd',
    KICK_OFF: 'kickOff'
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
        this.usedMinutes = new Set(); // Track which minutes already have events
        this.bundleCounter = 0; // Track bundle counter for bundleId generation
    }

    generateClockData(minute, secondOverride = null) {
        const second = secondOverride !== null ? secondOverride : Math.floor(Math.random() * 60);
        const gameTime = minute + (second / 60);
        
        return {
            minute: minute,
            second: second,
            gameTime: parseFloat(gameTime.toFixed(3)),
            addedTime: null // Will be set if in injury time
        };
    }

    generateBundleId(eventType, minute) {
        this.bundleCounter++;
        return `${eventType}_${minute}_${this.bundleCounter}`;
    }

    simulate() {
        // Add kick-off message for first half
        const kickOffClock1 = this.generateClockData(1, 0);
        this.highlights.push({
            minute: 1,
            type: HIGHLIGHT_TYPES.KICK_OFF,
            description: "⚽ Kick-off! First Half begins!",
            score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] },
            clock: kickOffClock1
        });

        // Regular time: minutes 1-90
        for (this.minute = 1; this.minute <= 90; this.minute++) {
            this.simulateMinute();
            if (this.minute === 45 ) {
                const halfTimeClock = this.generateClockData(45, 0);
                this.highlights.push({
                    minute: this.minute,
                    type: HIGHLIGHT_TYPES.HALF_TIME,
                    description: "Half time: The score is " + this.team1.name + " " + this.score[this.team1.name] + "-" + this.score[this.team2.name] + " " + this.team2.name,
                    score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] },
                    clock: halfTimeClock
                });

            }
            if (this.minute === 46) {
                const kickOffClock2 = this.generateClockData(46, 0);
                this.highlights.push({
                    minute: this.minute,
                    type: HIGHLIGHT_TYPES.KICK_OFF,
                    description: "⚽ Kick-off! Second Half begins!",
                    score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] },
                    clock: kickOffClock2
                });
            }
            if (this.minute === 90) {
                const fullTimeClock = this.generateClockData(90, 0);
                this.highlights.push({
                    minute: this.minute,
                    type: HIGHLIGHT_TYPES.FULL_TIME,
                    description: "Full time: The score is " + this.team1.name + " " + this.score[this.team1.name] + "-" + this.score[this.team2.name] + " " + this.team2.name,
                    score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] },
                    clock: fullTimeClock
                });

            }
        }

        // Check if match is a draw after regular time
        if (this.score[this.team1.name] === this.score[this.team2.name]) {
            // Extra time: minutes 91-120
            const extraTimeStartClock = this.generateClockData(90, 0);
            this.highlights.push({
                minute: 90,
                type: HIGHLIGHT_TYPES.EXTRA_TIME_START,
                description: "The match is a draw. Extra time begins!",
                score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] },
                clock: extraTimeStartClock
            });

            for (this.minute = 91; this.minute <= 120; this.minute++) {
                this.simulateMinute();
                
                if (this.minute === 105) {
                    const extraTimeHalfClock = this.generateClockData(105, 0);
                    this.highlights.push({
                        minute: this.minute,
                        type: HIGHLIGHT_TYPES.EXTRA_TIME_HALF,
                        description: "Extra time half: The score is " + this.team1.name + " " + this.score[this.team1.name] + "-" + this.score[this.team2.name] + " " + this.team2.name,
                        score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] },
                        clock: extraTimeHalfClock
                    });
                }
                
                if (this.minute === 120) {
                    const extraTimeEndClock = this.generateClockData(120, 0);
                    this.highlights.push({
                        minute: this.minute,
                        type: HIGHLIGHT_TYPES.EXTRA_TIME_END,
                        description: "End of extra time: The score is " + this.team1.name + " " + this.score[this.team1.name] + "-" + this.score[this.team2.name] + " " + this.team2.name,
                        score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] },
                        clock: extraTimeEndClock
                    });
                }
            }

            // Check if still a draw after extra time
            if (this.score[this.team1.name] === this.score[this.team2.name]) {
                // Penalty shootout will be announced by frontend with proper timing
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
        // Check if this minute already has an event - ensure only one event per minute
        if (this.usedMinutes.has(this.minute)) {
            return;
        }

        // Simulate minute by minute game logic
        if (this.chanceOfAttack(this.team1)) {
            this.handleAttack(this.team1, this.team2);
            this.usedMinutes.add(this.minute); // Mark this minute as used
        } else if (this.chanceOfAttack(this.team2)) {
            this.handleAttack(this.team2, this.team1);
            this.usedMinutes.add(this.minute); // Mark this minute as used
        }
    }

    chanceOfAttack(team) {
        return Math.random() < team.attackRating / 200;
    }

    handleAttack(attackingTeam, defendingTeam) {
        const pressureLevel = this.calculatePressure(attackingTeam, defendingTeam);
        
        // Generate bundleId for this attack sequence
        const bundleId = this.generateBundleId('attack', this.minute);
        let bundleStep = 1;
        
        // Generate clock data for this attack
        const clockData = this.generateClockData(this.minute);
        
        // Generate pressure narrative for medium/high pressure
        if (pressureLevel === 'medium' || pressureLevel === 'high') {
            this.highlights.push({
                minute: this.minute,
                type: HIGHLIGHT_TYPES.PRESSURE,
                team: attackingTeam.name,
                description: this.generatePressureNarrative(attackingTeam, defendingTeam, pressureLevel),
                score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] },
                clock: clockData,
                bundleId: bundleId,
                bundleStep: bundleStep++
            });
        }
        
        if (!this.defenseBlocks(defendingTeam)) {
            // Adjust penalty chance based on pressure (double it for high pressure)
            const penaltyChance = pressureLevel === 'high' ? 0.08 : 0.04;
            
            if (Math.random() < penaltyChance) {
                this.handlePenalty(attackingTeam, bundleId, bundleStep);
            } else {
                this.handleShot(attackingTeam, defendingTeam, bundleId, bundleStep);
            }
        } else {
            this.highlights.push({
                minute: this.minute,
                type: HIGHLIGHT_TYPES.BLOCKED,
                team: attackingTeam.name,
                description: `${this.minute}': ${attackingTeam.name} are on the attack but ${defendingTeam.name} shut them down`,
                score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] },
                clock: clockData,
                bundleId: bundleId,
                bundleStep: bundleStep
            });
        }
    }

    defenseBlocks(defendingTeam) {
        return Math.random() < defendingTeam.defenseRating / 110;
    }

    handleShot(attackingTeam, defendingTeam, bundleId = null, bundleStep = null) {
        // Generate clock data for this shot event
        const clockData = this.generateClockData(this.minute);
        
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
                
                const highlight = {
                    minute: this.minute,
                    type: HIGHLIGHT_TYPES.GOAL,
                    team: attackingTeam.name,
                    description: goalDescriptions[Math.floor(Math.random() * goalDescriptions.length)],
                    score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] },
                    clock: clockData
                };
                if (bundleId) {
                    highlight.bundleId = bundleId;
                    highlight.bundleStep = bundleStep;
                }
                this.highlights.push(highlight);

            } else {
                const saveDescriptions = [
                    `${this.minute}': Shot on target by ${attackingTeam.name} - brilliant save by ${defendingTeam.name}!`,
                    `${this.minute}': ${attackingTeam.name} take a shot - the keeper denies them!`,
                    `${this.minute}': Shot by ${attackingTeam.name} saved by ${defendingTeam.name}'s goalkeeper!`,
                    `${this.minute}': ${attackingTeam.name} shoot - what a save by ${defendingTeam.name}!`,
                    `${this.minute}': ${attackingTeam.name} on target but ${defendingTeam.name}'s keeper makes a great stop!`
                ];
                
                const highlight = {
                    minute: this.minute,
                    type: HIGHLIGHT_TYPES.SHOT,
                    team: attackingTeam.name,
                    description: saveDescriptions[Math.floor(Math.random() * saveDescriptions.length)],
                    score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] },
                    clock: clockData
                };
                if (bundleId) {
                    highlight.bundleId = bundleId;
                    highlight.bundleStep = bundleStep;
                }
                this.highlights.push(highlight);

            }
        } else {
            const missDescriptions = [
                `${this.minute}': Shot by ${attackingTeam.name} - they miss! Wide of the target`,
                `${this.minute}': ${attackingTeam.name} take a shot - off target!`,
                `${this.minute}': ${attackingTeam.name} shoot but it's wide! Chance wasted`,
                `${this.minute}': ${attackingTeam.name} miss the target! Shot goes wide`,
                `${this.minute}': Shot by ${attackingTeam.name} flies over the bar!`
            ];
            
            const highlight = {
                minute: this.minute,
                type: HIGHLIGHT_TYPES.SHOT,
                team: attackingTeam.name,
                description: missDescriptions[Math.floor(Math.random() * missDescriptions.length)],
                score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] },
                clock: clockData
            };
            if (bundleId) {
                highlight.bundleId = bundleId;
                highlight.bundleStep = bundleStep;
            }
            this.highlights.push(highlight);
        }
    }

    goalkeeperSaves(defendingTeam) {
        return Math.random() < defendingTeam.goalkeeperRating / 90;
    }

    handlePenalty(attackingTeam, bundleId = null, bundleStep = null) {
        const defendingTeam = attackingTeam.name === this.team1.name ? this.team2 : this.team1;
        
        // Generate bundleId if not provided (standalone penalty)
        const penaltyBundleId = bundleId || this.generateBundleId('penalty', this.minute);
        
        // Generate clock data for penalty awarded (base second)
        const clockDataAwarded = this.generateClockData(this.minute);
        
        // Generate clock data for penalty outcome (staggered by 5-15 seconds)
        const outcomeSecondOffset = Math.floor(Math.random() * 11) + 5; // 5-15 seconds
        const outcomeSecond = Math.min(59, clockDataAwarded.second + outcomeSecondOffset);
        const clockDataOutcome = this.generateClockData(this.minute, outcomeSecond);
        
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
            score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] },
            clock: clockDataAwarded,
            bundleId: penaltyBundleId,
            bundleStep: bundleStep || 1
        });
        
        // Stage 2: Determine outcome (scored, saved, or missed)
        const outcome = this.determinePenaltyOutcome(defendingTeam);
        
        // Stage 3: Result highlight
        const outcomeBundleStep = bundleStep ? bundleStep + 1 : 2;
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
                score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] },
                clock: clockDataOutcome,
                bundleId: penaltyBundleId,
                bundleStep: outcomeBundleStep
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
                score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] },
                clock: clockDataOutcome,
                bundleId: penaltyBundleId,
                bundleStep: outcomeBundleStep
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
                score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] },
                clock: clockDataOutcome,
                bundleId: penaltyBundleId,
                bundleStep: outcomeBundleStep
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

    // ------------------------------ pen shoot out --------------------

    handlePenaltyShootout() {
        let team1Score = 0;
        let team2Score = 0;
        let penaltyNumber = 1;
        
        // Initial 5 penalties for each team
        for (let i = 0; i < 5; i++) {
            team1Score += this.takePenalty(this.team1, penaltyNumber, 'initial', team1Score, team2Score);
            penaltyNumber++;
            team2Score += this.takePenalty(this.team2, penaltyNumber, 'initial', team1Score, team2Score);
            penaltyNumber++;
        }
        
        // If still tied after 5 penalties each, go to sudden death
        if (team1Score === team2Score) {
            // Add sudden death announcement
            this.highlights.push({
                minute: 120,
                type: HIGHLIGHT_TYPES.PENALTY_SHOOTOUT,
                team: null,
                penaltyNumber: 0,
                roundType: 'sudden_death_start',
                description: `Sudden Death! Scores tied ${team1Score}-${team2Score} after 5 penalties each.`,
                score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] }
            });
            
            // Continue with sudden death
            while (team1Score === team2Score) {
                team1Score += this.takePenalty(this.team1, penaltyNumber, 'sudden_death', team1Score, team2Score);
                penaltyNumber++;
                team2Score += this.takePenalty(this.team2, penaltyNumber, 'sudden_death', team1Score, team2Score);
                penaltyNumber++;
            }
        }
        
        this.penaltyScore[this.team1.name] = team1Score;
        this.penaltyScore[this.team2.name] = team2Score;
        this.updateShootoutScore(team1Score, team2Score);
    }

    takePenalty(team, penaltyNumber, roundType, currentTeam1Score, currentTeam2Score) {
        const defendingTeam = team.name === this.team1.name ? this.team2 : this.team1;
        
        // Stage 1: Penalty setup - team stepping up
        this.highlights.push({
            minute: 120,
            type: HIGHLIGHT_TYPES.PENALTY_SHOOTOUT,
            team: team.name,
            penaltyNumber: penaltyNumber,
            roundType: roundType,
            step: 'setup',
            takingTeam: team.name,
            defendingTeam: defendingTeam.name,
            description: `${team.name} steps up to take penalty #${Math.ceil(penaltyNumber / 2)}`,
            score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] }
        });
        
        // Determine outcome using similar logic to regular penalties
        const outcome = this.determinePenaltyShootoutOutcome(defendingTeam);
        
        // Calculate score after this penalty
        const isTeam1 = team.name === this.team1.name;
        const scoreAfter = {
            [this.team1.name]: currentTeam1Score + (isTeam1 && outcome === 'scored' ? 1 : 0),
            [this.team2.name]: currentTeam2Score + (!isTeam1 && outcome === 'scored' ? 1 : 0)
        };
        
        // Stage 2: Result
        if (outcome === 'scored') {
            const scoreDescriptions = [
                `GOAL! ${team.name} score!`,
                `It's in! ${team.name} convert!`,
                `${team.name} find the net!`
            ];
            this.highlights.push({
                minute: 120,
                type: HIGHLIGHT_TYPES.PENALTY_SHOOTOUT,
                team: team.name,
                penaltyNumber: penaltyNumber,
                roundType: roundType,
                step: 'outcome',
                outcome: 'scored',
                takingTeam: team.name,
                defendingTeam: defendingTeam.name,
                scoreAfter: scoreAfter,
                description: scoreDescriptions[Math.floor(Math.random() * scoreDescriptions.length)],
                score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] }
            });
            return 1;
        } else if (outcome === 'saved') {
            const saveDescriptions = [
                `SAVED! ${defendingTeam.name}'s keeper denies ${team.name}!`,
                `The keeper saves it!`,
                `${defendingTeam.name}'s goalkeeper stops it!`
            ];
            this.highlights.push({
                minute: 120,
                type: HIGHLIGHT_TYPES.PENALTY_SHOOTOUT,
                team: team.name,
                penaltyNumber: penaltyNumber,
                roundType: roundType,
                step: 'outcome',
                outcome: 'saved',
                takingTeam: team.name,
                defendingTeam: defendingTeam.name,
                scoreAfter: scoreAfter,
                description: saveDescriptions[Math.floor(Math.random() * saveDescriptions.length)],
                score: { home: this.score[this.homeTeam], away: this.score[this.awayTeam] }
            });
            return 0;
        } else { // missed
            const missDescriptions = [
                `MISSED! ${team.name} miss!`,
                `WIDE! ${team.name} miss the target!`,
                `${team.name} blast it over the bar!`
            ];
            this.highlights.push({
                minute: 120,
                type: HIGHLIGHT_TYPES.PENALTY_SHOOTOUT,
                team: team.name,
                penaltyNumber: penaltyNumber,
                roundType: roundType,
                step: 'outcome',
                outcome: 'missed',
                takingTeam: team.name,
                defendingTeam: defendingTeam.name,
                scoreAfter: scoreAfter,
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