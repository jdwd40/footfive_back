const db = require('../db/connection');
const Fixture = require('../models/FixtureModel');
const MatchEvent = require('../models/MatchEventModel');
const MatchReport = require('../models/MatchReportModel');
const Team = require('../models/TeamModel');
const Player = require('../models/PlayerModel');

const EVENT_TYPES = {
    KICKOFF: 'kickoff',
    GOAL: 'goal',
    SHOT_SAVED: 'shot_saved',
    SHOT_MISSED: 'shot_missed',
    SHOT_BLOCKED: 'shot_blocked',
    PENALTY_AWARDED: 'penalty_awarded',
    PENALTY_SCORED: 'penalty_scored',
    PENALTY_MISSED: 'penalty_missed',
    PENALTY_SAVED: 'penalty_saved',
    CORNER: 'corner',
    FOUL: 'foul',
    YELLOW_CARD: 'yellow_card',
    RED_CARD: 'red_card',
    HALFTIME: 'halftime',
    FULLTIME: 'fulltime',
    EXTRA_TIME_START: 'extra_time_start',
    EXTRA_TIME_HALF: 'extra_time_half',
    EXTRA_TIME_END: 'extra_time_end',
    SHOOTOUT_START: 'shootout_start',
    SHOOTOUT_GOAL: 'shootout_goal',
    SHOOTOUT_MISS: 'shootout_miss',
    SHOOTOUT_SAVE: 'shootout_save',
    SHOOTOUT_END: 'shootout_end',
    PRESSURE: 'pressure',
    BLOCKED: 'blocked'
};

class SimulationEngine {
    constructor(fixtureId, homeTeam, awayTeam) {
        this.fixtureId = fixtureId;
        this.homeTeam = homeTeam;
        this.awayTeam = awayTeam;
        this.homePlayers = [];
        this.awayPlayers = [];

        this.score = { home: 0, away: 0 };
        this.penaltyScore = { home: 0, away: 0 };
        this.minute = 0;
        this.bundleCounter = 0;
        this.usedMinutes = new Set();

        // Stats tracking
        this.stats = {
            home: { possession: 0, shots: 0, shotsOnTarget: 0, xg: 0, corners: 0, fouls: 0, yellowCards: 0, redCards: 0 },
            away: { possession: 0, shots: 0, shotsOnTarget: 0, xg: 0, corners: 0, fouls: 0, yellowCards: 0, redCards: 0 }
        };

        this.possessionTicks = { home: 0, away: 0 };
    }

    async loadPlayers() {
        this.homePlayers = await Player.fetchByTeamId(this.homeTeam.id);
        this.awayPlayers = await Player.fetchByTeamId(this.awayTeam.id);
    }

    generateClockData(minute, secondOverride = null) {
        const second = secondOverride !== null ? secondOverride : Math.floor(Math.random() * 60);
        return {
            minute,
            second,
            gameTime: parseFloat((minute + second / 60).toFixed(3)),
            addedTime: null
        };
    }

    generateBundleId(eventType, minute) {
        this.bundleCounter++;
        return `${eventType}_${minute}_${this.bundleCounter}`;
    }

    async simulate() {
        await this.loadPlayers();
        await Fixture.updateStatus(this.fixtureId, 'live');

        // First half
        await this.persistEvent(this.createKickoffEvent(1, 'First Half begins!'));

        for (this.minute = 1; this.minute <= 45; this.minute++) {
            await this.simulateMinute();
        }

        await this.persistEvent(this.createPeriodEvent(45, EVENT_TYPES.HALFTIME,
            `Half time: ${this.homeTeam.name} ${this.score.home}-${this.score.away} ${this.awayTeam.name}`));

        // Second half
        await this.persistEvent(this.createKickoffEvent(46, 'Second Half begins!'));

        for (this.minute = 46; this.minute <= 90; this.minute++) {
            await this.simulateMinute();
        }

        await this.persistEvent(this.createPeriodEvent(90, EVENT_TYPES.FULLTIME,
            `Full time: ${this.homeTeam.name} ${this.score.home}-${this.score.away} ${this.awayTeam.name}`));

        // Extra time if draw
        if (this.score.home === this.score.away) {
            await this.simulateExtraTime();

            // Penalties if still draw
            if (this.score.home === this.score.away) {
                await this.simulatePenaltyShootout();
            }
        }

        // Finalize
        await this.finalizeMatch();

        return this.getResult();
    }

    async simulateMinute() {
        if (this.usedMinutes.has(this.minute)) return;

        // Track possession
        const possessionRoll = Math.random();
        const homeChance = this.homeTeam.attackRating / (this.homeTeam.attackRating + this.awayTeam.attackRating);
        if (possessionRoll < homeChance) {
            this.possessionTicks.home++;
        } else {
            this.possessionTicks.away++;
        }

        // Random foul chance (5%)
        if (Math.random() < 0.05) {
            await this.handleFoul();
        }

        // Attack chances
        if (this.chanceOfAttack(this.homeTeam)) {
            await this.handleAttack(this.homeTeam, this.awayTeam, 'home');
            this.usedMinutes.add(this.minute);
        } else if (this.chanceOfAttack(this.awayTeam)) {
            await this.handleAttack(this.awayTeam, this.homeTeam, 'away');
            this.usedMinutes.add(this.minute);
        }
    }

    chanceOfAttack(team) {
        return Math.random() < team.attackRating / 200;
    }

    async handleAttack(attackingTeam, defendingTeam, side) {
        const oppSide = side === 'home' ? 'away' : 'home';
        const pressureLevel = this.calculatePressure(attackingTeam, defendingTeam);
        const bundleId = this.generateBundleId('attack', this.minute);
        let bundleStep = 1;

        // Pressure narrative for medium/high
        if (pressureLevel === 'medium' || pressureLevel === 'high') {
            await this.persistEvent({
                fixtureId: this.fixtureId,
                minute: this.minute,
                second: Math.floor(Math.random() * 30),
                eventType: EVENT_TYPES.PRESSURE,
                teamId: attackingTeam.id,
                description: this.generatePressureNarrative(attackingTeam, defendingTeam, pressureLevel),
                bundleId,
                bundleStep: bundleStep++
            });
        }

        // Defense blocks?
        if (this.defenseBlocks(defendingTeam)) {
            this.stats[oppSide].corners += Math.random() < 0.3 ? 1 : 0; // 30% corner on block
            await this.persistEvent({
                fixtureId: this.fixtureId,
                minute: this.minute,
                second: Math.floor(Math.random() * 30) + 30,
                eventType: EVENT_TYPES.BLOCKED,
                teamId: attackingTeam.id,
                description: `${this.minute}': ${attackingTeam.name} attack blocked by ${defendingTeam.name}`,
                bundleId,
                bundleStep
            });
            return;
        }

        // Penalty chance
        const penaltyChance = pressureLevel === 'high' ? 0.08 : 0.04;
        if (Math.random() < penaltyChance) {
            await this.handlePenalty(attackingTeam, defendingTeam, side, bundleId, bundleStep);
            return;
        }

        // Shot
        await this.handleShot(attackingTeam, defendingTeam, side, bundleId, bundleStep);
    }

    async handleShot(attackingTeam, defendingTeam, side, bundleId, bundleStep) {
        const oppSide = side === 'home' ? 'away' : 'home';
        const players = side === 'home' ? this.homePlayers : this.awayPlayers;
        const clock = this.generateClockData(this.minute);

        this.stats[side].shots++;

        // Calculate xG based on situation
        const baseXg = 0.08 + Math.random() * 0.12; // 0.08 - 0.20
        const pressureMod = this.calculatePressure(attackingTeam, defendingTeam) === 'high' ? 1.3 : 1.0;
        const xg = Math.min(0.80, baseXg * pressureMod);
        this.stats[side].xg += xg;

        // On target? (60%)
        if (Math.random() < 0.6) {
            this.stats[side].shotsOnTarget++;

            // Goal or save?
            if (!this.goalkeeperSaves(defendingTeam)) {
                // GOAL!
                this.score[side]++;
                const scorer = this.selectScorer(players);
                const assister = this.selectAssister(players, scorer?.playerId);

                await this.persistEvent({
                    fixtureId: this.fixtureId,
                    minute: this.minute,
                    second: clock.second,
                    eventType: EVENT_TYPES.GOAL,
                    teamId: attackingTeam.id,
                    playerId: scorer?.playerId,
                    assistPlayerId: assister?.playerId,
                    description: `${this.minute}': GOAL! ${attackingTeam.name} score! ${this.score.home}-${this.score.away}`,
                    xg,
                    outcome: 'scored',
                    bundleId,
                    bundleStep,
                    metadata: { scorer: scorer?.name, assist: assister?.name }
                });
            } else {
                // Saved
                this.stats[oppSide].corners += Math.random() < 0.4 ? 1 : 0;
                await this.persistEvent({
                    fixtureId: this.fixtureId,
                    minute: this.minute,
                    second: clock.second,
                    eventType: EVENT_TYPES.SHOT_SAVED,
                    teamId: attackingTeam.id,
                    playerId: this.selectScorer(players)?.playerId,
                    description: `${this.minute}': Shot by ${attackingTeam.name} saved by ${defendingTeam.name}!`,
                    xg,
                    outcome: 'saved',
                    bundleId,
                    bundleStep
                });
            }
        } else {
            // Missed
            await this.persistEvent({
                fixtureId: this.fixtureId,
                minute: this.minute,
                second: clock.second,
                eventType: EVENT_TYPES.SHOT_MISSED,
                teamId: attackingTeam.id,
                playerId: this.selectScorer(players)?.playerId,
                description: `${this.minute}': Shot by ${attackingTeam.name} goes wide!`,
                xg,
                outcome: 'missed',
                bundleId,
                bundleStep
            });
        }
    }

    async handlePenalty(attackingTeam, defendingTeam, side, bundleId, bundleStep) {
        const players = side === 'home' ? this.homePlayers : this.awayPlayers;
        const clock = this.generateClockData(this.minute);
        const penXg = 0.76;

        this.stats[side].shots++;
        this.stats[side].xg += penXg;

        // Penalty awarded
        await this.persistEvent({
            fixtureId: this.fixtureId,
            minute: this.minute,
            second: clock.second,
            eventType: EVENT_TYPES.PENALTY_AWARDED,
            teamId: attackingTeam.id,
            description: `${this.minute}': PENALTY to ${attackingTeam.name}!`,
            bundleId,
            bundleStep: bundleStep++
        });

        const outcome = this.determinePenaltyOutcome(defendingTeam);
        const taker = this.selectScorer(players);

        if (outcome === 'scored') {
            this.score[side]++;
            this.stats[side].shotsOnTarget++;
            await this.persistEvent({
                fixtureId: this.fixtureId,
                minute: this.minute,
                second: Math.min(59, clock.second + 10),
                eventType: EVENT_TYPES.PENALTY_SCORED,
                teamId: attackingTeam.id,
                playerId: taker?.playerId,
                description: `${this.minute}': GOAL! Penalty scored! ${this.score.home}-${this.score.away}`,
                xg: penXg,
                outcome: 'scored',
                bundleId,
                bundleStep,
                metadata: { scorer: taker?.name }
            });
        } else if (outcome === 'saved') {
            this.stats[side].shotsOnTarget++;
            await this.persistEvent({
                fixtureId: this.fixtureId,
                minute: this.minute,
                second: Math.min(59, clock.second + 10),
                eventType: EVENT_TYPES.PENALTY_SAVED,
                teamId: attackingTeam.id,
                playerId: taker?.playerId,
                description: `${this.minute}': Penalty SAVED by ${defendingTeam.name}!`,
                xg: penXg,
                outcome: 'saved',
                bundleId,
                bundleStep
            });
        } else {
            await this.persistEvent({
                fixtureId: this.fixtureId,
                minute: this.minute,
                second: Math.min(59, clock.second + 10),
                eventType: EVENT_TYPES.PENALTY_MISSED,
                teamId: attackingTeam.id,
                playerId: taker?.playerId,
                description: `${this.minute}': Penalty MISSED by ${attackingTeam.name}!`,
                xg: penXg,
                outcome: 'missed',
                bundleId,
                bundleStep
            });
        }
    }

    async handleFoul() {
        const isHomeFoul = Math.random() < 0.5;
        const side = isHomeFoul ? 'home' : 'away';
        const team = isHomeFoul ? this.homeTeam : this.awayTeam;

        this.stats[side].fouls++;

        // Card chance (15% yellow, 2% red)
        const cardRoll = Math.random();
        if (cardRoll < 0.02) {
            this.stats[side].redCards++;
            await this.persistEvent({
                fixtureId: this.fixtureId,
                minute: this.minute,
                second: Math.floor(Math.random() * 60),
                eventType: EVENT_TYPES.RED_CARD,
                teamId: team.id,
                description: `${this.minute}': RED CARD for ${team.name}!`
            });
        } else if (cardRoll < 0.17) {
            this.stats[side].yellowCards++;
            await this.persistEvent({
                fixtureId: this.fixtureId,
                minute: this.minute,
                second: Math.floor(Math.random() * 60),
                eventType: EVENT_TYPES.YELLOW_CARD,
                teamId: team.id,
                description: `${this.minute}': Yellow card for ${team.name}`
            });
        }
    }

    async simulateExtraTime() {
        await this.persistEvent(this.createPeriodEvent(90, EVENT_TYPES.EXTRA_TIME_START, 'Extra time begins!'));

        // ET first half
        for (this.minute = 91; this.minute <= 105; this.minute++) {
            await this.simulateMinute();
        }

        await this.persistEvent(this.createPeriodEvent(105, EVENT_TYPES.EXTRA_TIME_HALF,
            `ET Half: ${this.homeTeam.name} ${this.score.home}-${this.score.away} ${this.awayTeam.name}`));

        // ET second half
        for (this.minute = 106; this.minute <= 120; this.minute++) {
            await this.simulateMinute();
        }

        await this.persistEvent(this.createPeriodEvent(120, EVENT_TYPES.EXTRA_TIME_END,
            `End of extra time: ${this.homeTeam.name} ${this.score.home}-${this.score.away} ${this.awayTeam.name}`));
    }

    async simulatePenaltyShootout() {
        await this.persistEvent(this.createPeriodEvent(120, EVENT_TYPES.SHOOTOUT_START, 'Penalty shootout begins!'));

        let homeShootoutScore = 0;
        let awayShootoutScore = 0;

        // Initial 5 rounds
        for (let round = 1; round <= 5; round++) {
            homeShootoutScore += await this.takeShootoutPenalty(this.homeTeam, this.awayTeam, 'home', round);
            awayShootoutScore += await this.takeShootoutPenalty(this.awayTeam, this.homeTeam, 'away', round);
        }

        // Sudden death
        let round = 6;
        while (homeShootoutScore === awayShootoutScore) {
            homeShootoutScore += await this.takeShootoutPenalty(this.homeTeam, this.awayTeam, 'home', round);
            awayShootoutScore += await this.takeShootoutPenalty(this.awayTeam, this.homeTeam, 'away', round);
            round++;
        }

        this.penaltyScore = { home: homeShootoutScore, away: awayShootoutScore };

        const winner = homeShootoutScore > awayShootoutScore ? this.homeTeam : this.awayTeam;
        await this.persistEvent({
            fixtureId: this.fixtureId,
            minute: 120,
            second: 0,
            eventType: EVENT_TYPES.SHOOTOUT_END,
            teamId: winner.id,
            description: `${winner.name} wins on penalties ${homeShootoutScore}-${awayShootoutScore}!`
        });
    }

    async takeShootoutPenalty(takingTeam, defendingTeam, side, round) {
        const players = side === 'home' ? this.homePlayers : this.awayPlayers;
        const taker = this.selectScorer(players);

        // 75% success rate (85% on target, ~12% save if on target)
        const onTarget = Math.random() < 0.85;
        const saved = onTarget && Math.random() < 0.12;
        const scored = onTarget && !saved;

        let eventType, outcome;
        if (scored) {
            eventType = EVENT_TYPES.SHOOTOUT_GOAL;
            outcome = 'scored';
        } else if (saved) {
            eventType = EVENT_TYPES.SHOOTOUT_SAVE;
            outcome = 'saved';
        } else {
            eventType = EVENT_TYPES.SHOOTOUT_MISS;
            outcome = 'missed';
        }

        await this.persistEvent({
            fixtureId: this.fixtureId,
            minute: 120,
            second: round,
            eventType,
            teamId: takingTeam.id,
            playerId: taker?.playerId,
            description: `Shootout: ${takingTeam.name} ${outcome === 'scored' ? 'SCORES!' : outcome === 'saved' ? 'SAVED!' : 'MISSES!'}`,
            outcome,
            metadata: { round, taker: taker?.name }
        });

        return scored ? 1 : 0;
    }

    async finalizeMatch() {
        // Calculate possession percentages
        const totalTicks = this.possessionTicks.home + this.possessionTicks.away;
        const homePossession = totalTicks > 0 ? (this.possessionTicks.home / totalTicks * 100) : 50;
        const awayPossession = 100 - homePossession;

        // Determine winner
        let winnerId;
        if (this.penaltyScore.home > 0 || this.penaltyScore.away > 0) {
            winnerId = this.penaltyScore.home > this.penaltyScore.away ? this.homeTeam.id : this.awayTeam.id;
        } else {
            winnerId = this.score.home > this.score.away ? this.homeTeam.id : this.awayTeam.id;
        }

        // Complete fixture
        await Fixture.complete(this.fixtureId, {
            homeScore: this.score.home,
            awayScore: this.score.away,
            homePenaltyScore: this.penaltyScore.home || null,
            awayPenaltyScore: this.penaltyScore.away || null,
            winnerTeamId: winnerId
        });

        // Create match report
        await MatchReport.create({
            fixtureId: this.fixtureId,
            homePossession: Math.round(homePossession * 100) / 100,
            awayPossession: Math.round(awayPossession * 100) / 100,
            homeShots: this.stats.home.shots,
            awayShots: this.stats.away.shots,
            homeShotsOnTarget: this.stats.home.shotsOnTarget,
            awayShotsOnTarget: this.stats.away.shotsOnTarget,
            homeXg: Math.round(this.stats.home.xg * 100) / 100,
            awayXg: Math.round(this.stats.away.xg * 100) / 100,
            homeCorners: this.stats.home.corners,
            awayCorners: this.stats.away.corners,
            homeFouls: this.stats.home.fouls,
            awayFouls: this.stats.away.fouls,
            homeYellowCards: this.stats.home.yellowCards,
            awayYellowCards: this.stats.away.yellowCards,
            homeRedCards: this.stats.home.redCards,
            awayRedCards: this.stats.away.redCards,
            extraTimePlayed: this.minute > 90,
            penaltiesPlayed: this.penaltyScore.home > 0 || this.penaltyScore.away > 0
        });

        // Update team stats
        await this.updateTeamStats(winnerId);
    }

    async updateTeamStats(winnerId) {
        const homeWon = winnerId === this.homeTeam.id;

        await Team.updateMatchStats(this.homeTeam.id, homeWon, this.score.home, this.score.away);
        await Team.updateMatchStats(this.awayTeam.id, !homeWon, this.score.away, this.score.home);

        // Update form
        await this.updateTeamForm(this.homeTeam.id, homeWon);
        await this.updateTeamForm(this.awayTeam.id, !homeWon);
    }

    async updateTeamForm(teamId, won) {
        const result = await db.query('SELECT recent_form FROM teams WHERE team_id = $1', [teamId]);
        let form = result.rows[0]?.recent_form || '';
        form = (won ? 'W' : 'L') + form.slice(0, 9);

        await db.query('UPDATE teams SET recent_form = $1 WHERE team_id = $2', [form, teamId]);
    }

    async persistEvent(eventData) {
        return MatchEvent.create(eventData);
    }

    // Helper methods
    defenseBlocks(team) {
        return Math.random() < team.defenseRating / 110;
    }

    goalkeeperSaves(team) {
        return Math.random() < team.goalkeeperRating / 90;
    }

    calculatePressure(attacking, defending) {
        const diff = attacking.attackRating - defending.defenseRating;
        if (diff >= 15) return 'high';
        if (diff >= 5) return 'medium';
        return 'low';
    }

    determinePenaltyOutcome(defendingTeam) {
        if (Math.random() < 0.7) {
            if (Math.random() < defendingTeam.goalkeeperRating / 120) return 'saved';
            return 'scored';
        }
        return 'missed';
    }

    selectScorer(players) {
        const outfield = players.filter(p => !p.isGoalkeeper);
        if (!outfield.length) return null;

        const totalAttack = outfield.reduce((sum, p) => sum + p.attack, 0);
        let rand = Math.random() * totalAttack;

        for (const player of outfield) {
            rand -= player.attack;
            if (rand <= 0) return player;
        }
        return outfield[0];
    }

    selectAssister(players, scorerId) {
        const candidates = players.filter(p => !p.isGoalkeeper && p.playerId !== scorerId);
        if (!candidates.length || Math.random() < 0.3) return null; // 30% solo goal

        const totalAttack = candidates.reduce((sum, p) => sum + p.attack, 0);
        let rand = Math.random() * totalAttack;

        for (const player of candidates) {
            rand -= player.attack;
            if (rand <= 0) return player;
        }
        return candidates[0];
    }

    generatePressureNarrative(attacking, defending, level) {
        const narratives = level === 'high' ? [
            `${this.minute}': ${attacking.name} dominating! ${defending.name} pinned back!`,
            `${this.minute}': Relentless pressure from ${attacking.name}!`,
            `${this.minute}': ${defending.name} under siege!`
        ] : [
            `${this.minute}': ${attacking.name} building momentum...`,
            `${this.minute}': ${attacking.name} probing for an opening...`,
            `${this.minute}': Pressure mounting from ${attacking.name}`
        ];
        return narratives[Math.floor(Math.random() * narratives.length)];
    }

    createKickoffEvent(minute, description) {
        return {
            fixtureId: this.fixtureId,
            minute,
            second: 0,
            eventType: EVENT_TYPES.KICKOFF,
            description: `${minute}': ${description}`
        };
    }

    createPeriodEvent(minute, type, description) {
        return {
            fixtureId: this.fixtureId,
            minute,
            second: 0,
            eventType: type,
            description
        };
    }

    getResult() {
        return {
            fixtureId: this.fixtureId,
            score: { home: this.score.home, away: this.score.away },
            penaltyScore: this.penaltyScore.home > 0 ? this.penaltyScore : null,
            stats: this.stats,
            homeTeam: this.homeTeam.name,
            awayTeam: this.awayTeam.name,
            finalResult: this.penaltyScore.home > 0
                ? `${this.homeTeam.name} ${this.score.home}(${this.penaltyScore.home}) - ${this.awayTeam.name} ${this.score.away}(${this.penaltyScore.away})`
                : `${this.homeTeam.name} ${this.score.home} - ${this.awayTeam.name} ${this.score.away}`
        };
    }
}

module.exports = SimulationEngine;
