/**
 * Betting system integration tests
 * Covers auth, wallet (dummy funds), bet placement rules, live betting,
 * championship betting, and idempotent settlement.
 */

const request = require('supertest');
const { setupBeforeEach, cleanupAfterEach, getTestApp } = require('../setup/testHelpers');
const Fixture = require('../../models/FixtureModel');
const SettlementService = require('../../services/SettlementService');
const { getSimulationLoop } = require('../../gamelogic/simulation/SimulationLoop');

const TOURNAMENT_ID = 424242;

describe('Betting system', () => {
  let app;

  beforeAll(() => {
    app = getTestApp();
  });

  beforeEach(async () => {
    await setupBeforeEach();
    getSimulationLoop().matches.clear();
  });

  afterEach(async () => {
    getSimulationLoop().matches.clear();
    await cleanupAfterEach();
  });

  // === Helpers ===

  const registerUser = async (username = 'punter') => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username, password: 'secret123' })
      .expect(201);
    return { token: res.body.token, user: res.body.user, wallet: res.body.wallet };
  };

  const authHeader = (token) => ({ Authorization: `Bearer ${token}` });

  const createFixture = (overrides = {}) => Fixture.create({
    homeTeamId: 1,
    awayTeamId: 2,
    tournamentId: TOURNAMENT_ID,
    round: 'Round of 16',
    ...overrides
  });

  const registerFakeLiveMatch = (fixtureId, snapshot = {}) => {
    getSimulationLoop().matches.set(fixtureId, {
      fixtureId,
      getMatchStateSnapshot: () => ({
        fixtureId,
        state: 'FIRST_HALF',
        currentMinute: 20,
        score: { home: 0, away: 0 },
        isFinished: false,
        ...snapshot
      })
    });
  };

  const placeBet = (token, body, live = false) =>
    request(app)
      .post(live ? '/api/betting/fixture/live' : '/api/betting/fixture')
      .set(authHeader(token))
      .send(body);

  // === Auth ===

  describe('auth', () => {
    it('registers a user with a starting virtual balance', async () => {
      const { user, wallet, token } = await registerUser('newuser');

      expect(user.username).toBe('newuser');
      expect(wallet.balance).toBe(1000);
      expect(wallet.isVirtual).toBe(true);
      expect(token).toBeTruthy();
    });

    it('rejects duplicate usernames', async () => {
      await registerUser('dupe');
      await request(app)
        .post('/api/auth/register')
        .send({ username: 'dupe', password: 'secret123' })
        .expect(409);
    });

    it('rejects invalid usernames and short passwords', async () => {
      await request(app).post('/api/auth/register').send({ username: 'x', password: 'secret123' }).expect(400);
      await request(app).post('/api/auth/register').send({ username: 'validname', password: '123' }).expect(400);
    });

    it('logs in with correct credentials and rejects wrong password', async () => {
      await registerUser('loginuser');

      const ok = await request(app)
        .post('/api/auth/login')
        .send({ username: 'loginuser', password: 'secret123' })
        .expect(200);
      expect(ok.body.token).toBeTruthy();
      expect(ok.body.wallet.balance).toBe(1000);

      await request(app)
        .post('/api/auth/login')
        .send({ username: 'loginuser', password: 'wrongpass' })
        .expect(401);
    });

    it('returns profile with a valid token and 401 without', async () => {
      const { token } = await registerUser('profileuser');

      const res = await request(app).get('/api/auth/profile').set(authHeader(token)).expect(200);
      expect(res.body.user.username).toBe('profileuser');
      expect(res.body.wallet.balance).toBe(1000);

      await request(app).get('/api/auth/profile').expect(401);
      await request(app).get('/api/auth/profile').set({ Authorization: 'Bearer nonsense' }).expect(401);
    });
  });

  // === Wallet / dummy funds ===

  describe('wallet', () => {
    it('adds dummy funds and records a transaction', async () => {
      const { token } = await registerUser('funder');

      const res = await request(app)
        .post('/api/wallet/add-funds')
        .set(authHeader(token))
        .send({ amount: 250 })
        .expect(200);

      expect(res.body.wallet.balance).toBe(1250);
      expect(res.body.transaction.transactionType).toBe('dummy_funds');

      const txRes = await request(app)
        .get('/api/wallet/transactions')
        .set(authHeader(token))
        .expect(200);

      const types = txRes.body.transactions.map(t => t.transactionType);
      expect(types).toContain('dummy_funds');
      // Welcome balance + top-up
      expect(txRes.body.transactions.length).toBeGreaterThanOrEqual(2);
    });

    it('rejects invalid or oversized top-ups', async () => {
      const { token } = await registerUser('badfunder');

      await request(app).post('/api/wallet/add-funds').set(authHeader(token)).send({ amount: -5 }).expect(400);
      await request(app).post('/api/wallet/add-funds').set(authHeader(token)).send({ amount: 999999 }).expect(400);
    });

    it('requires auth for all wallet routes', async () => {
      await request(app).get('/api/wallet').expect(401);
      await request(app).post('/api/wallet/add-funds').send({ amount: 100 }).expect(401);
      await request(app).get('/api/wallet/transactions').expect(401);
    });
  });

  // === Pre-match betting ===

  describe('pre-match fixture betting', () => {
    it('serves deterministic betting odds for a scheduled fixture', async () => {
      const fixture = await createFixture();

      const res = await request(app).get(`/api/betting/fixtures/${fixture.fixtureId}/odds`).expect(200);

      expect(res.body.bettingOpen).toBe(true);
      expect(res.body.odds.home.odds).toBeGreaterThanOrEqual(1.05);
      expect(res.body.odds.away.odds).toBeGreaterThanOrEqual(1.05);

      const res2 = await request(app).get(`/api/betting/fixtures/${fixture.fixtureId}/odds`).expect(200);
      expect(res2.body.odds).toEqual(res.body.odds);
    });

    it('places a bet, deducts the stake, and stores odds at placement', async () => {
      const { token } = await registerUser();
      const fixture = await createFixture();

      const oddsRes = await request(app).get(`/api/betting/fixtures/${fixture.fixtureId}/odds`);
      const homeOdds = oddsRes.body.odds.home.odds;

      const res = await placeBet(token, { fixtureId: fixture.fixtureId, teamId: 1, stake: 100 }).expect(201);

      expect(res.body.balance).toBe(900);
      expect(res.body.bet.betType).toBe('fixture_winner');
      expect(res.body.bet.status).toBe('pending');
      expect(res.body.bet.oddsAtPlacement).toBe(homeOdds);
      expect(res.body.bet.potentialReturn).toBeCloseTo(100 * homeOdds, 2);

      const betsRes = await request(app).get('/api/betting/bets').set(authHeader(token)).expect(200);
      expect(betsRes.body.count).toBe(1);
      expect(betsRes.body.bets[0].selectedTeamId).toBe(1);
    });

    it('prevents backing both sides of the same fixture', async () => {
      const { token } = await registerUser();
      const fixture = await createFixture();

      await placeBet(token, { fixtureId: fixture.fixtureId, teamId: 1, stake: 50 }).expect(201);
      const res = await placeBet(token, { fixtureId: fixture.fixtureId, teamId: 2, stake: 50 }).expect(400);
      expect(res.body.error).toMatch(/other team/i);
    });

    it('allows multiple bets on the same side only', async () => {
      const { token } = await registerUser();
      const fixture = await createFixture();

      await placeBet(token, { fixtureId: fixture.fixtureId, teamId: 1, stake: 50 }).expect(201);
      await placeBet(token, { fixtureId: fixture.fixtureId, teamId: 1, stake: 25 }).expect(201);

      const betsRes = await request(app).get('/api/betting/bets').set(authHeader(token)).expect(200);
      expect(betsRes.body.count).toBe(2);
      expect(betsRes.body.bets.every(b => b.selectedTeamId === 1)).toBe(true);
    });

    it('rejects bets above the balance and invalid stakes', async () => {
      const { token } = await registerUser();
      const fixture = await createFixture();

      await placeBet(token, { fixtureId: fixture.fixtureId, teamId: 1, stake: 5000 }).expect(400);
      await placeBet(token, { fixtureId: fixture.fixtureId, teamId: 1, stake: -10 }).expect(400);
      await placeBet(token, { fixtureId: fixture.fixtureId, teamId: 1, stake: 0 }).expect(400);

      // Balance untouched
      const walletRes = await request(app).get('/api/wallet').set(authHeader(token)).expect(200);
      expect(walletRes.body.wallet.balance).toBe(1000);
    });

    it('rejects pre-match bets once the fixture is live', async () => {
      const { token } = await registerUser();
      const fixture = await createFixture();
      await Fixture.updateStatus(fixture.fixtureId, 'live');

      const res = await placeBet(token, { fixtureId: fixture.fixtureId, teamId: 1, stake: 50 }).expect(400);
      expect(res.body.error).toMatch(/kicked off/i);
    });

    it('rejects bets on teams not in the fixture', async () => {
      const { token } = await registerUser();
      const fixture = await createFixture();

      await placeBet(token, { fixtureId: fixture.fixtureId, teamId: 3, stake: 50 }).expect(400);
    });

    it('requires auth to place bets', async () => {
      const fixture = await createFixture();
      await request(app)
        .post('/api/betting/fixture')
        .send({ fixtureId: fixture.fixtureId, teamId: 1, stake: 50 })
        .expect(401);
    });
  });

  // === Live betting ===

  describe('live in-play betting', () => {
    it('serves live odds that respond to score and minute', async () => {
      const fixture = await createFixture();
      await Fixture.updateStatus(fixture.fixtureId, 'live');

      registerFakeLiveMatch(fixture.fixtureId, { currentMinute: 10, score: { home: 0, away: 0 } });
      const early = await request(app).get(`/api/betting/fixtures/${fixture.fixtureId}/live-odds`).expect(200);
      expect(early.body.bettingOpen).toBe(true);

      // Same fixture, home now leads late in the match
      registerFakeLiveMatch(fixture.fixtureId, { currentMinute: 80, score: { home: 2, away: 0 } });
      const late = await request(app).get(`/api/betting/fixtures/${fixture.fixtureId}/live-odds`).expect(200);

      expect(late.body.odds.home.odds).toBeLessThan(early.body.odds.home.odds);
      expect(late.body.odds.away.odds).toBeGreaterThan(early.body.odds.away.odds);
      expect(late.body.minute).toBe(80);
    });

    it('places a live bet while the match is in progress', async () => {
      const { token } = await registerUser();
      const fixture = await createFixture();
      await Fixture.updateStatus(fixture.fixtureId, 'live');
      registerFakeLiveMatch(fixture.fixtureId, { currentMinute: 30, score: { home: 1, away: 0 } });

      const res = await placeBet(token, { fixtureId: fixture.fixtureId, teamId: 1, stake: 100 }, true).expect(201);

      expect(res.body.bet.betType).toBe('live_fixture_winner');
      expect(res.body.balance).toBe(900);
    });

    it('blocks live bets once the match has ended (locked for settlement)', async () => {
      const { token } = await registerUser();
      const fixture = await createFixture();
      await Fixture.updateStatus(fixture.fixtureId, 'live');
      registerFakeLiveMatch(fixture.fixtureId, { state: 'FINISHED', isFinished: true, currentMinute: 90 });

      const oddsRes = await request(app).get(`/api/betting/fixtures/${fixture.fixtureId}/live-odds`).expect(200);
      expect(oddsRes.body.bettingOpen).toBe(false);

      const res = await placeBet(token, { fixtureId: fixture.fixtureId, teamId: 1, stake: 50 }, true).expect(400);
      expect(res.body.error).toMatch(/locked|closed/i);
    });

    it('blocks live bets on completed fixtures', async () => {
      const { token } = await registerUser();
      const fixture = await createFixture();
      await Fixture.complete(fixture.fixtureId, { homeScore: 2, awayScore: 1, winnerTeamId: 1 });

      await placeBet(token, { fixtureId: fixture.fixtureId, teamId: 1, stake: 50 }, true).expect(400);
    });

    it('enforces the same-side rule across pre-match and live bets', async () => {
      const { token } = await registerUser();
      const fixture = await createFixture();

      await placeBet(token, { fixtureId: fixture.fixtureId, teamId: 1, stake: 50 }).expect(201);

      await Fixture.updateStatus(fixture.fixtureId, 'live');
      registerFakeLiveMatch(fixture.fixtureId);

      await placeBet(token, { fixtureId: fixture.fixtureId, teamId: 2, stake: 50 }, true).expect(400);
      await placeBet(token, { fixtureId: fixture.fixtureId, teamId: 1, stake: 50 }, true).expect(201);
    });
  });

  // === Championship betting ===

  describe('championship betting', () => {
    const createBracket = async () => {
      const f1 = await createFixture({ homeTeamId: 1, awayTeamId: 2, round: 'Round of 16' });
      const f2 = await createFixture({ homeTeamId: 3, awayTeamId: 4, round: 'Round of 16' });
      return { f1, f2 };
    };

    it('lists remaining teams with odds', async () => {
      await createBracket();

      const res = await request(app).get('/api/betting/championship/odds').expect(200);

      expect(res.body.tournamentId).toBe(TOURNAMENT_ID);
      expect(res.body.bettingOpen).toBe(true);
      expect(res.body.teams).toHaveLength(4);
      for (const team of res.body.teams) {
        expect(team.odds).toBeGreaterThanOrEqual(1.05);
      }
    });

    it('places a championship bet and deducts the stake', async () => {
      const { token } = await registerUser();
      await createBracket();

      const res = await request(app)
        .post('/api/betting/championship')
        .set(authHeader(token))
        .send({ teamId: 1, stake: 100 })
        .expect(201);

      expect(res.body.bet.betType).toBe('championship_winner');
      expect(res.body.bet.tournamentId).toBe(TOURNAMENT_ID);
      expect(res.body.balance).toBe(900);
    });

    it('removes eliminated teams from the board and rejects bets on them', async () => {
      const { token } = await registerUser();
      const { f2 } = await createBracket();

      // Team 4 loses to team 3
      await Fixture.complete(f2.fixtureId, { homeScore: 2, awayScore: 0, winnerTeamId: 3 });

      const res = await request(app).get('/api/betting/championship/odds').expect(200);
      const teamIds = res.body.teams.map(t => t.teamId);
      expect(teamIds).not.toContain(4);
      expect(res.body.eliminatedTeamIds).toContain(4);

      await request(app)
        .post('/api/betting/championship')
        .set(authHeader(token))
        .send({ teamId: 4, stake: 50 })
        .expect(400);
    });

    it('closes championship betting once the semi-finals begin', async () => {
      const { token } = await registerUser();
      await createBracket();

      const semi = await createFixture({ homeTeamId: 1, awayTeamId: 3, round: 'Semi-finals' });
      await Fixture.updateStatus(semi.fixtureId, 'live');

      const res = await request(app).get('/api/betting/championship/odds').expect(200);
      expect(res.body.bettingOpen).toBe(false);
      expect(res.body.reason).toMatch(/semi-final/i);

      await request(app)
        .post('/api/betting/championship')
        .set(authHeader(token))
        .send({ teamId: 1, stake: 50 })
        .expect(400);
    });

    it('still allows championship bets while semi-final fixtures are only scheduled', async () => {
      const { token } = await registerUser();
      await createBracket();
      await createFixture({ homeTeamId: null, awayTeamId: null, round: 'Semi-finals' });

      await request(app)
        .post('/api/betting/championship')
        .set(authHeader(token))
        .send({ teamId: 1, stake: 50 })
        .expect(201);
    });
  });

  // === Settlement ===

  describe('settlement', () => {
    it('settles a winning fixture bet after a normal-time result', async () => {
      const { token, user } = await registerUser();
      const fixture = await createFixture();

      const betRes = await placeBet(token, { fixtureId: fixture.fixtureId, teamId: 1, stake: 100 }).expect(201);
      const potentialReturn = betRes.body.bet.potentialReturn;

      await Fixture.complete(fixture.fixtureId, { homeScore: 2, awayScore: 0, winnerTeamId: 1 });
      const outcome = await SettlementService.settleFixtureBets(fixture.fixtureId);

      expect(outcome.settled).toBe(1);
      expect(outcome.won).toBe(1);

      const walletRes = await request(app).get('/api/wallet').set(authHeader(token)).expect(200);
      expect(walletRes.body.wallet.balance).toBeCloseTo(900 + potentialReturn, 2);

      const betsRes = await request(app).get('/api/betting/bets').set(authHeader(token)).expect(200);
      expect(betsRes.body.bets[0].status).toBe('won');
      expect(betsRes.body.bets[0].settledAt).toBeTruthy();
    });

    it('settles bets using the penalty shootout winner without touching the main score', async () => {
      const { token } = await registerUser();
      const fixture = await createFixture();

      await placeBet(token, { fixtureId: fixture.fixtureId, teamId: 2, stake: 100 }).expect(201);

      // 1-1 after extra time; away team wins the shootout 4-3
      await Fixture.complete(fixture.fixtureId, {
        homeScore: 1,
        awayScore: 1,
        homePenaltyScore: 3,
        awayPenaltyScore: 4,
        winnerTeamId: 2
      });

      const outcome = await SettlementService.settleFixtureBets(fixture.fixtureId);
      expect(outcome.won).toBe(1);

      // Main score in the DB is untouched by shootout goals
      const saved = await Fixture.getById(fixture.fixtureId);
      expect(saved.homeScore).toBe(1);
      expect(saved.awayScore).toBe(1);
      expect(saved.homePenaltyScore).toBe(3);
      expect(saved.awayPenaltyScore).toBe(4);

      const betsRes = await request(app).get('/api/betting/bets').set(authHeader(token)).expect(200);
      expect(betsRes.body.bets[0].status).toBe('won');
      expect(betsRes.body.bets[0].settlementNote).toMatch(/shootout/i);
    });

    it('marks losing bets lost without crediting funds', async () => {
      const { token } = await registerUser();
      const fixture = await createFixture();

      await placeBet(token, { fixtureId: fixture.fixtureId, teamId: 2, stake: 100 }).expect(201);
      await Fixture.complete(fixture.fixtureId, { homeScore: 3, awayScore: 0, winnerTeamId: 1 });
      await SettlementService.settleFixtureBets(fixture.fixtureId);

      const walletRes = await request(app).get('/api/wallet').set(authHeader(token)).expect(200);
      expect(walletRes.body.wallet.balance).toBe(900); // stake stays lost

      const betsRes = await request(app).get('/api/betting/bets').set(authHeader(token)).expect(200);
      expect(betsRes.body.bets[0].status).toBe('lost');
    });

    it('is idempotent: settling twice never double-credits', async () => {
      const { token } = await registerUser();
      const fixture = await createFixture();

      const betRes = await placeBet(token, { fixtureId: fixture.fixtureId, teamId: 1, stake: 100 }).expect(201);
      await Fixture.complete(fixture.fixtureId, { homeScore: 2, awayScore: 1, winnerTeamId: 1 });

      const first = await SettlementService.settleFixtureBets(fixture.fixtureId);
      expect(first.settled).toBe(1);

      const second = await SettlementService.settleFixtureBets(fixture.fixtureId);
      expect(second.settled).toBe(0);

      const expected = 900 + betRes.body.bet.potentialReturn;
      const walletRes = await request(app).get('/api/wallet').set(authHeader(token)).expect(200);
      expect(walletRes.body.wallet.balance).toBeCloseTo(expected, 2);
    });

    it('does not settle before the fixture has a confirmed winner', async () => {
      const { token } = await registerUser();
      const fixture = await createFixture();

      await placeBet(token, { fixtureId: fixture.fixtureId, teamId: 1, stake: 100 }).expect(201);

      const outcome = await SettlementService.settleFixtureBets(fixture.fixtureId);
      expect(outcome.settled).toBe(0);

      const betsRes = await request(app).get('/api/betting/bets').set(authHeader(token)).expect(200);
      expect(betsRes.body.bets[0].status).toBe('pending');
    });

    it('settles championship bets from the confirmed Final winner', async () => {
      const { token } = await registerUser('champ1');
      const { token: token2 } = await registerUser('champ2');

      await createFixture({ homeTeamId: 1, awayTeamId: 2, round: 'Round of 16' });
      await createFixture({ homeTeamId: 3, awayTeamId: 4, round: 'Round of 16' });

      const winRes = await request(app)
        .post('/api/betting/championship')
        .set(authHeader(token))
        .send({ teamId: 1, stake: 100 })
        .expect(201);

      await request(app)
        .post('/api/betting/championship')
        .set(authHeader(token2))
        .send({ teamId: 3, stake: 100 })
        .expect(201);

      // Team 1 wins the Final
      const final = await createFixture({ homeTeamId: 1, awayTeamId: 3, round: 'Final' });
      await Fixture.complete(final.fixtureId, { homeScore: 2, awayScore: 1, winnerTeamId: 1 });

      const outcome = await SettlementService.settleChampionshipBets(TOURNAMENT_ID);
      expect(outcome.settled).toBe(2);
      expect(outcome.won).toBe(1);

      // Idempotent
      const again = await SettlementService.settleChampionshipBets(TOURNAMENT_ID);
      expect(again.settled).toBe(0);

      const w1 = await request(app).get('/api/wallet').set(authHeader(token)).expect(200);
      expect(w1.body.wallet.balance).toBeCloseTo(900 + winRes.body.bet.potentialReturn, 2);

      const w2 = await request(app).get('/api/wallet').set(authHeader(token2)).expect(200);
      expect(w2.body.wallet.balance).toBe(900);
    });

    it('sweep settles pending bets for completed fixtures via the admin endpoint', async () => {
      const { token } = await registerUser();
      const fixture = await createFixture();

      await placeBet(token, { fixtureId: fixture.fixtureId, teamId: 1, stake: 100 }).expect(201);
      await Fixture.complete(fixture.fixtureId, { homeScore: 1, awayScore: 0, winnerTeamId: 1 });

      const res = await request(app).post('/api/admin/settlement/sweep').expect(200);
      expect(res.body.fixturesSettled).toBe(1);

      // Running the sweep again settles nothing new
      const res2 = await request(app).post('/api/admin/settlement/sweep').expect(200);
      expect(res2.body.fixturesSettled).toBe(0);

      const betsRes = await request(app).get('/api/betting/bets').set(authHeader(token)).expect(200);
      expect(betsRes.body.bets[0].status).toBe('won');
    });

    it('provides a betting summary', async () => {
      const { token } = await registerUser();
      const fixture = await createFixture();

      await placeBet(token, { fixtureId: fixture.fixtureId, teamId: 1, stake: 100 }).expect(201);
      await Fixture.complete(fixture.fixtureId, { homeScore: 1, awayScore: 0, winnerTeamId: 1 });
      await SettlementService.settleFixtureBets(fixture.fixtureId);

      const res = await request(app).get('/api/betting/summary').set(authHeader(token)).expect(200);

      expect(res.body.summary.totalBets).toBe(1);
      expect(res.body.summary.won).toBe(1);
      expect(res.body.summary.totalStaked).toBe(100);
      expect(res.body.summary.totalReturned).toBeGreaterThan(100);
    });
  });
});
