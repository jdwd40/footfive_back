const db = require('../db/connection');
const Fixture = require('../models/FixtureModel');
const Team = require('../models/TeamModel');
const Wallet = require('../models/WalletModel');
const { Bet, BET_TYPES } = require('../models/BetModel');
const BettingOdds = require('../gamelogic/BettingOddsService');
const { MATCH_STATES } = require('../gamelogic/constants');

const MAX_STAKE = 10000;

/**
 * BettingService - placing virtual bets and computing betting odds.
 * All money is virtual/dummy game credits; there is no real-money handling.
 */
class BettingService {
    /**
     * Live in-memory match snapshot from the simulation loop, if the match
     * is currently registered. Lazy require avoids circular imports.
     */
    static getLiveSnapshot(fixtureId) {
        const { getSimulationLoop } = require('../gamelogic/simulation/SimulationLoop');
        return getSimulationLoop().getMatchStateSnapshot(fixtureId);
    }

    // === Odds ===

    static async getFixtureOdds(fixtureId) {
        const fixture = await Fixture.getById(fixtureId);

        if (!fixture.homeTeamId || !fixture.awayTeamId) {
            return { fixture, odds: null, bettingOpen: false, reason: 'Teams not decided yet' };
        }

        const homeTeam = await Team.getBettingProfileById(fixture.homeTeamId);
        const awayTeam = await Team.getBettingProfileById(fixture.awayTeamId);
        const odds = BettingOdds.prematchOdds(homeTeam, awayTeam);

        return {
            fixture,
            homeTeam,
            awayTeam,
            odds,
            bettingOpen: fixture.status === 'scheduled',
            reason: fixture.status === 'scheduled' ? null : `Fixture is ${fixture.status}`
        };
    }

    static async getLiveOdds(fixtureId) {
        const fixture = await Fixture.getById(fixtureId);

        if (fixture.status !== 'live') {
            return { fixture, odds: null, bettingOpen: false, reason: `Fixture is ${fixture.status}, not live` };
        }

        const snapshot = BettingService.getLiveSnapshot(fixtureId);

        if (!snapshot || snapshot.isFinished) {
            // Match is locked for settlement (or not tracked by the loop).
            return { fixture, odds: null, bettingOpen: false, reason: 'Match locked for settlement' };
        }

        const homeTeam = await Team.getBettingProfileById(fixture.homeTeamId);
        const awayTeam = await Team.getBettingProfileById(fixture.awayTeamId);

        const inExtraTime = [
            MATCH_STATES.EXTRA_TIME_1,
            MATCH_STATES.ET_HALFTIME,
            MATCH_STATES.EXTRA_TIME_2,
            MATCH_STATES.PENALTIES
        ].includes(snapshot.state);

        const odds = BettingOdds.liveOdds(homeTeam, awayTeam, {
            homeScore: snapshot.score.home,
            awayScore: snapshot.score.away,
            minute: snapshot.currentMinute,
            inExtraTime
        });

        return {
            fixture,
            homeTeam,
            awayTeam,
            odds,
            matchState: snapshot.state,
            minute: snapshot.currentMinute,
            score: snapshot.score,
            bettingOpen: true,
            reason: null
        };
    }

    /**
     * Championship odds board for the most recent tournament.
     * Remaining teams = teams in the bracket that have not lost a fixture.
     */
    static async getChampionshipOdds() {
        const tournamentId = await BettingService.getActiveTournamentId();

        if (!tournamentId) {
            return { tournamentId: null, teams: [], bettingOpen: false, reason: 'No active tournament' };
        }

        const fixtures = await Fixture.getAll({ tournamentId, limit: 100 });

        const allTeamIds = new Set();
        const eliminatedIds = new Set();
        let finalCompleted = false;

        for (const f of fixtures) {
            if (f.homeTeamId) allTeamIds.add(f.homeTeamId);
            if (f.awayTeamId) allTeamIds.add(f.awayTeamId);

            if (f.status === 'completed' && f.winnerTeamId) {
                const loserId = f.winnerTeamId === f.homeTeamId ? f.awayTeamId : f.homeTeamId;
                if (loserId) eliminatedIds.add(loserId);
                if (f.round === 'Final') finalCompleted = true;
            }
        }

        const remainingIds = [...allTeamIds].filter(id => !eliminatedIds.has(id));
        const remainingTeams = await Promise.all(remainingIds.map(id => Team.getBettingProfileById(id)));
        const teamsWithOdds = BettingOdds.championshipOdds(remainingTeams);

        const semisBegun = await BettingService.haveSemisBegun(tournamentId);
        const bettingOpen = !finalCompleted && !semisBegun && remainingIds.length > 1;

        let reason = null;
        if (finalCompleted) reason = 'Championship decided';
        else if (semisBegun) reason = 'Championship betting closed once semi-finals begin';

        return {
            tournamentId,
            teams: teamsWithOdds.sort((a, b) => a.odds - b.odds),
            eliminatedTeamIds: [...eliminatedIds],
            bettingOpen,
            reason
        };
    }

    static async getActiveTournamentId() {
        const result = await db.query(`
            SELECT tournament_id FROM fixtures
            WHERE tournament_id IS NOT NULL
            ORDER BY created_at DESC, fixture_id DESC
            LIMIT 1
        `);
        return result.rows.length ? result.rows[0].tournament_id : null;
    }

    // Championship betting closes as soon as any semi-final is live/completed.
    static async haveSemisBegun(tournamentId) {
        const result = await db.query(`
            SELECT 1 FROM fixtures
            WHERE tournament_id = $1
              AND round IN ('Semi-finals', 'Final')
              AND status != 'scheduled'
            LIMIT 1
        `, [tournamentId]);
        return result.rows.length > 0;
    }

    // === Bet placement ===

    static async placeFixtureBet({ userId, fixtureId, teamId, stake, live = false }) {
        const cleanStake = BettingService.validateStake(stake);
        const fixture = await Fixture.getById(fixtureId);

        if (teamId !== fixture.homeTeamId && teamId !== fixture.awayTeamId) {
            throw new BettingError('Selected team is not playing in this fixture');
        }

        let odds;

        if (live) {
            const liveData = await BettingService.getLiveOdds(fixtureId);
            if (!liveData.bettingOpen) {
                throw new BettingError(liveData.reason || 'Live betting is closed for this fixture');
            }
            odds = teamId === fixture.homeTeamId ? liveData.odds.home.odds : liveData.odds.away.odds;
        } else {
            if (fixture.status !== 'scheduled') {
                throw new BettingError('Pre-match betting is closed: the fixture has kicked off');
            }
            const prematch = await BettingService.getFixtureOdds(fixtureId);
            odds = teamId === fixture.homeTeamId ? prematch.odds.home.odds : prematch.odds.away.odds;
        }

        // Same-side rule: more bets are fine, but only on the team already backed.
        const existingBets = await Bet.getUserBetsOnFixture(userId, fixtureId);
        const conflicting = existingBets.find(b => b.selectedTeamId !== teamId);
        if (conflicting) {
            throw new BettingError('You have already backed the other team in this fixture');
        }

        return BettingService.createBetWithStake({
            userId,
            betType: live ? BET_TYPES.LIVE_FIXTURE_WINNER : BET_TYPES.FIXTURE_WINNER,
            fixtureId,
            tournamentId: fixture.tournamentId,
            selectedTeamId: teamId,
            stake: cleanStake,
            odds
        });
    }

    static async placeChampionshipBet({ userId, teamId, stake }) {
        const cleanStake = BettingService.validateStake(stake);
        const board = await BettingService.getChampionshipOdds();

        if (!board.bettingOpen) {
            throw new BettingError(board.reason || 'Championship betting is closed');
        }

        const entry = board.teams.find(t => t.teamId === teamId);
        if (!entry) {
            throw new BettingError('Team is not available for championship betting (eliminated or not in the cup)');
        }

        return BettingService.createBetWithStake({
            userId,
            betType: BET_TYPES.CHAMPIONSHIP_WINNER,
            fixtureId: null,
            tournamentId: board.tournamentId,
            selectedTeamId: teamId,
            stake: cleanStake,
            odds: entry.odds
        });
    }

    /**
     * Create the bet and deduct the stake atomically.
     * Locks the wallet row so concurrent bets cannot overspend.
     */
    static async createBetWithStake({ userId, betType, fixtureId, tournamentId, selectedTeamId, stake, odds }) {
        const potentialReturn = Math.round(stake * odds * 100) / 100;
        const client = await db.connect();

        try {
            await client.query('BEGIN');

            const walletResult = await client.query(
                'SELECT balance FROM user_wallets WHERE user_id = $1 FOR UPDATE',
                [userId]
            );

            if (!walletResult.rows.length) {
                throw new BettingError('Wallet not found');
            }

            const balance = parseFloat(walletResult.rows[0].balance);
            if (balance < stake) {
                throw new BettingError(`Insufficient virtual funds: balance ${balance.toFixed(2)} FC, stake ${stake.toFixed(2)} FC`);
            }

            const bet = await Bet.create({
                userId,
                betType,
                fixtureId,
                tournamentId,
                selectedTeamId,
                stake,
                oddsAtPlacement: odds,
                potentialReturn
            }, client);

            const { wallet } = await Wallet.applyTransaction({
                userId,
                amount: -stake,
                transactionType: 'bet_stake',
                betId: bet.betId,
                description: `Stake for bet #${bet.betId} (${betType})`
            }, client);

            await client.query('COMMIT');

            return { bet, balance: wallet.balance };
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    static validateStake(stake) {
        const value = Number(stake);
        if (!Number.isFinite(value) || value <= 0) {
            throw new BettingError('Stake must be a positive amount');
        }
        if (value > MAX_STAKE) {
            throw new BettingError(`Maximum stake is ${MAX_STAKE} FC`);
        }
        return Math.round(value * 100) / 100;
    }
}

/**
 * Validation/game-rule error: controllers map this to HTTP 400.
 */
class BettingError extends Error {
    constructor(message) {
        super(message);
        this.name = 'BettingError';
        this.isBettingError = true;
    }
}

module.exports = { BettingService, BettingError, MAX_STAKE };
