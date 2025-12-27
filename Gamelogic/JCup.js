const Team = require('../models/TeamModel');
const Fixture = require('../models/FixtureModel');
const MatchEvent = require('../models/MatchEventModel');
const MatchReport = require('../models/MatchReportModel');
const SimulationEngine = require('./SimulationEngine');
const OddsEngine = require('./OddsEngine');
const MatchSimulator = require('./MatchSimulator'); // Keep for legacy support

const oddsEngine = new OddsEngine(0.05);

class JCup {
    constructor() {
        this.teams = [];
        this.currentRound = 0;
        this.fixtures = []; // Array of rounds, each containing pairs of matches
        this.fixtureIds = []; // Track DB fixture IDs per round
        this.results = [];
        this.completedMatches = {};
        this.tournamentId = null;
        this.useNewSimulation = true; // Toggle for new vs legacy simulation
    }

    async loadTeams() {
        this.resetJCup();
        this.teams = await Team.getAll();
        this.tournamentId = Date.now() % 1000000000; // Keep within INT range
        await this.generateFixtures();
    }

    async generateFixtures(teams = this.teams) {
        let roundFixtures = [];
        let formattedRound = [];
        let dbFixtures = [];

        const roundName = this.getRoundName(teams.length);

        // Shuffle and pair teams for the current round
        let shuffledTeams = this.shuffleTeams(teams);
        while (shuffledTeams.length > 1) {
            let team1 = shuffledTeams.shift();
            let team2 = shuffledTeams.shift();
            roundFixtures.push({ team1, team2 });
            formattedRound.push(`${roundName}: ${team1.name} vs ${team2.name}`);

            // Create fixture in DB
            if (this.useNewSimulation) {
                dbFixtures.push({
                    homeTeamId: team1.id,
                    awayTeamId: team2.id,
                    tournamentId: this.tournamentId,
                    round: roundName
                });
            }
        }

        // Handle bye
        if (shuffledTeams.length === 1) {
            formattedRound.push(`${roundName}: ${shuffledTeams[0].name} has a bye`);
            roundFixtures.push({ team1: shuffledTeams[0], team2: null, isBye: true });
        }

        this.fixtures.push(roundFixtures);

        // Create fixtures in DB and calculate odds
        if (this.useNewSimulation && dbFixtures.length > 0) {
            const createdFixtures = await Fixture.createBatch(dbFixtures);
            const fixtureIdsForRound = [];

            for (let i = 0; i < createdFixtures.length; i++) {
                const fixture = createdFixtures[i];
                const match = roundFixtures[i];

                // Calculate odds
                const homeTeam = await Team.getRatingById(fixture.homeTeamId);
                const awayTeam = await Team.getRatingById(fixture.awayTeamId);
                const odds = await oddsEngine.calculateAndSaveOdds(fixture.fixtureId, homeTeam, awayTeam);

                // Store fixture ID and odds in match object
                match.fixtureId = fixture.fixtureId;
                match.odds = {
                    homeWin: odds.homeWinOdds,
                    awayWin: odds.awayWinOdds,
                    homeProb: odds.homeWinProb,
                    awayProb: odds.awayWinProb
                };

                fixtureIdsForRound.push(fixture.fixtureId);
            }

            this.fixtureIds.push(fixtureIdsForRound);
        }

        return formattedRound;
    }

    async simulateRound() {
        if (this.currentRound >= this.fixtures.length) {
            return { error: "No more rounds to play.", fixtures: await this.generateFixtures() };
        }

        const matches = this.fixtures[this.currentRound];
        const roundResults = [];
        const winners = [];

        const currentTeamCount = matches.filter(m => !m.isBye).length * 2;
        const currentRoundName = this.getRoundName(currentTeamCount);

        if (!this.completedMatches[this.currentRound]) {
            this.completedMatches[this.currentRound] = {};
        }

        for (let i = 0; i < matches.length; i++) {
            const match = matches[i];

            // Skip if already completed
            if (this.completedMatches[this.currentRound][i]) {
                const completedResult = this.completedMatches[this.currentRound][i];
                roundResults.push(completedResult.matchResult);
                winners.push(completedResult.winner);
                continue;
            }

            // Handle bye
            if (match.team2 === null || match.isBye) {
                winners.push(match.team1);
                await Team.updateHighestRound(match.team1.id, currentRoundName);
                continue;
            }

            // Ensure teams have ratings
            if (!match.team1.attackRating) {
                match.team1 = await Team.getRatingByTeamName(match.team1.name);
            }
            if (!match.team2.attackRating) {
                match.team2 = await Team.getRatingByTeamName(match.team2.name);
            }

            let result, winner, matchResult;

            if (this.useNewSimulation && match.fixtureId) {
                // Use new SimulationEngine
                const engine = new SimulationEngine(match.fixtureId, match.team1, match.team2);
                const simResult = await engine.simulate();

                winner = simResult.score.home > simResult.score.away ? match.team1 :
                         simResult.score.away > simResult.score.home ? match.team2 :
                         simResult.penaltyScore && simResult.penaltyScore.home > simResult.penaltyScore.away ? match.team1 : match.team2;

                // Get events for highlights (summary only - first few and goals)
                const events = await MatchEvent.getByFixtureId(match.fixtureId, { includePlayerNames: true });
                const highlights = events.map(e => ({
                    minute: e.minute,
                    type: e.eventType,
                    team: e.teamName,
                    player: e.playerName,
                    description: e.description,
                    score: { home: simResult.score.home, away: simResult.score.away }
                }));

                matchResult = {
                    fixtureId: match.fixtureId,
                    score: { [match.team1.name]: simResult.score.home, [match.team2.name]: simResult.score.away },
                    penaltyScore: simResult.penaltyScore ? { [match.team1.name]: simResult.penaltyScore.home, [match.team2.name]: simResult.penaltyScore.away } : {},
                    highlights,
                    finalResult: simResult.finalResult,
                    stats: simResult.stats,
                    matchMetadata: {
                        homeTeam: match.team1.name,
                        awayTeam: match.team2.name,
                        date: new Date().toISOString(),
                        round: currentRoundName,
                        odds: match.odds
                    }
                };
            } else {
                // Legacy MatchSimulator
                result = new MatchSimulator(match.team1, match.team2).simulate();
                winner = this.determineWinner(result, match.team1, match.team2);

                const team1Goals = result.score[match.team1.name];
                const team2Goals = result.score[match.team2.name];

                await Team.updateMatchStats(match.team1.id, winner.id === match.team1.id, team1Goals, team2Goals);
                await Team.updateMatchStats(match.team2.id, winner.id === match.team2.id, team2Goals, team1Goals);

                matchResult = {
                    score: result.score,
                    penaltyScore: result.penaltyScore,
                    highlights: result.highlights,
                    finalResult: result.finalResult,
                    matchMetadata: {
                        homeTeam: match.team1.name,
                        awayTeam: match.team2.name,
                        date: new Date().toISOString(),
                        round: currentRoundName
                    }
                };
            }

            // Update highest round
            await Team.updateHighestRound(match.team1.id, currentRoundName);
            await Team.updateHighestRound(match.team2.id, currentRoundName);

            winners.push(winner);
            roundResults.push(matchResult);

            this.completedMatches[this.currentRound][i] = { matchResult, winner };
        }

        this.results.push({ roundResults });
        this.currentRound++;

        if (winners.length > 1) {
            await this.generateFixtures(winners);
        } else {
            // Tournament finished
            const winner = winners[0];
            const finalMatch = roundResults[0];
            const runnerUpName = finalMatch.matchMetadata.homeTeam === winner.name
                ? finalMatch.matchMetadata.awayTeam
                : finalMatch.matchMetadata.homeTeam;
            const runnerUp = this.teams.find(t => t.name === runnerUpName);

            await Team.addJCupsWon(winner.id);
            await Team.addRunnerUp(runnerUp.id);
            await Team.updateHighestRound(winner.id, 'Winner');
            await Team.updateHighestRound(runnerUp.id, 'Runner-up');

            this.teams = winners;
            this.currentRound = 4;

            return {
                roundResults,
                nextRoundFixtures: "Tournament finished.",
                winner: { id: winner.id, name: winner.name },
                runner: { id: runnerUp.id, name: runnerUp.name }
            };
        }

        // Format next fixtures for response
        const nextFixtures = this.fixtures[this.currentRound]?.map(m => ({
            homeTeam: m.team1.name,
            awayTeam: m.team2?.name || 'BYE',
            fixtureId: m.fixtureId,
            odds: m.odds
        })) || [];

        return {
            roundResults,
            nextRoundFixtures: nextFixtures
        };
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

        if (!this.completedMatches[this.currentRound]) {
            this.completedMatches[this.currentRound] = {};
        }

        if (this.completedMatches[this.currentRound][matchIndex]) {
            return this.completedMatches[this.currentRound][matchIndex];
        }

        const currentTeamCount = matches.filter(m => !m.isBye).length * 2;
        const currentRoundName = this.getRoundName(currentTeamCount);

        // Handle bye
        if (match.team2 === null || match.isBye) {
            await Team.updateHighestRound(match.team1.id, currentRoundName);
            const result = {
                matchResult: { isBye: true, team: match.team1.name },
                winner: match.team1
            };
            this.completedMatches[this.currentRound][matchIndex] = result;
            return result;
        }

        // Ensure ratings
        if (!match.team1.attackRating) {
            match.team1 = await Team.getRatingByTeamName(match.team1.name);
        }
        if (!match.team2.attackRating) {
            match.team2 = await Team.getRatingByTeamName(match.team2.name);
        }

        let matchResult, winner;

        if (this.useNewSimulation && match.fixtureId) {
            const engine = new SimulationEngine(match.fixtureId, match.team1, match.team2);
            const simResult = await engine.simulate();

            winner = simResult.score.home > simResult.score.away ? match.team1 :
                     simResult.score.away > simResult.score.home ? match.team2 :
                     simResult.penaltyScore && simResult.penaltyScore.home > simResult.penaltyScore.away ? match.team1 : match.team2;

            const events = await MatchEvent.getByFixtureId(match.fixtureId, { includePlayerNames: true });

            matchResult = {
                fixtureId: match.fixtureId,
                score: { [match.team1.name]: simResult.score.home, [match.team2.name]: simResult.score.away },
                penaltyScore: simResult.penaltyScore ? { [match.team1.name]: simResult.penaltyScore.home, [match.team2.name]: simResult.penaltyScore.away } : {},
                highlights: events.map(e => ({
                    minute: e.minute,
                    type: e.eventType,
                    team: e.teamName,
                    description: e.description
                })),
                finalResult: simResult.finalResult,
                stats: simResult.stats,
                matchMetadata: {
                    homeTeam: match.team1.name,
                    awayTeam: match.team2.name,
                    date: new Date().toISOString(),
                    round: currentRoundName,
                    odds: match.odds
                }
            };
        } else {
            // Legacy
            const result = new MatchSimulator(match.team1, match.team2).simulate();
            winner = this.determineWinner(result, match.team1, match.team2);

            await Team.updateMatchStats(match.team1.id, winner.id === match.team1.id, result.score[match.team1.name], result.score[match.team2.name]);
            await Team.updateMatchStats(match.team2.id, winner.id === match.team2.id, result.score[match.team2.name], result.score[match.team1.name]);

            matchResult = {
                score: result.score,
                penaltyScore: result.penaltyScore,
                highlights: result.highlights,
                finalResult: result.finalResult,
                matchMetadata: {
                    homeTeam: match.team1.name,
                    awayTeam: match.team2.name,
                    date: new Date().toISOString(),
                    round: currentRoundName
                }
            };
        }

        await Team.updateHighestRound(match.team1.id, currentRoundName);
        await Team.updateHighestRound(match.team2.id, currentRoundName);

        this.completedMatches[this.currentRound][matchIndex] = { matchResult, winner };
        return { matchResult, winner };
    }

    shuffleTeams(teams) {
        let shuffled = [...teams];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    getRoundName(teamCount) {
        if (teamCount === 2) return 'Final';
        if (teamCount === 4) return 'Semi-finals';
        if (teamCount === 8) return 'Quarter-finals';
        if (teamCount === 16) return 'Round of 16';
        if (teamCount === 32) return 'Round of 32';
        return `Round of ${teamCount}`;
    }

    determineWinner(result, team1, team2) {
        const team1PenaltyScore = result.penaltyScore[team1.name] || 0;
        const team2PenaltyScore = result.penaltyScore[team2.name] || 0;

        if (team1PenaltyScore > 0 || team2PenaltyScore > 0) {
            return team1PenaltyScore > team2PenaltyScore ? team1 : team2;
        }

        return result.score[team1.name] > result.score[team2.name] ? team1 : team2;
    }

    isRoundComplete() {
        if (this.currentRound >= this.fixtures.length) return true;

        const matches = this.fixtures[this.currentRound];
        const completedInRound = this.completedMatches[this.currentRound] || {};

        return matches.length === Object.keys(completedInRound).length;
    }

    resetJCup() {
        this.currentRound = 0;
        this.fixtures = [];
        this.fixtureIds = [];
        this.results = [];
        this.completedMatches = {};
        this.teams = [];
        this.tournamentId = null;
    }

    async jCupWon(winner_id, runner_id) {
        await Team.addJCupsWon(winner_id);
        if (runner_id) {
            await Team.addRunnerUp(runner_id);
        }
        return { msg: "updated" };
    }

    // Get fixture IDs for current round
    getCurrentRoundFixtureIds() {
        return this.fixtureIds[this.currentRound] || [];
    }
}

module.exports = JCup;
