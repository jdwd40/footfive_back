const db = require('../db/connection');
const { GARAGE } = require('../gamelogic/garage/garageConfig');
const {
    overallRating,
    stadiumSizeFromOverall,
    effectiveTeamRatings,
    repairCost,
    upgradeCost
} = require('../gamelogic/garage/garageCalc');

/**
 * GarageService - state and money operations for the Cyborg Garage.
 *
 * One shared garage exists (the live tournament is a single shared
 * simulation). All spending runs inside a DB transaction with the garage row
 * locked, and the balance CHECK (>= 0) backs up the in-code validation.
 */
class GarageService {
    /**
     * Idempotent data initialisation, run at server startup:
     * - creates the garage row (with starting funds) for the configured team
     * - tops the squad up to 7 players with spare players
     * - backfills garage_players rows
     * - stamps stadium_size on every team from its current strength
     * No-op (with a warning) if the configured team does not exist yet.
     */
    static async ensureInitialized() {
        const teamResult = await db.query('SELECT team_id FROM teams WHERE name = $1', [GARAGE.USER_TEAM_NAME]);
        if (!teamResult.rows.length) {
            console.warn(`[Garage] Team '${GARAGE.USER_TEAM_NAME}' not found - garage not initialised`);
            return null;
        }
        const defaultTeamId = teamResult.rows[0].team_id;

        const client = await db.connect();
        let teamId;
        try {
            await client.query('BEGIN');

            const inserted = await client.query(`
                INSERT INTO garage (garage_id, team_id, balance)
                VALUES (1, $1, $2)
                ON CONFLICT (garage_id) DO NOTHING
                RETURNING garage_id
            `, [defaultTeamId, GARAGE.STARTING_BALANCE]);

            if (inserted.rows.length) {
                await client.query(`
                    INSERT INTO garage_transactions (amount, balance_after, transaction_type, description)
                    VALUES ($1, $1, 'starting_funds', 'Garage opened - starting funds')
                `, [GARAGE.STARTING_BALANCE]);
            }

            // Init the squad of the garage's ACTUAL team (the user may have
            // switched away from the default with the team picker).
            const current = await client.query('SELECT team_id FROM garage WHERE garage_id = 1');
            teamId = current.rows[0].team_id;
            await GarageService._initTeamSquad(client, teamId);

            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }

        await GarageService.refreshStadiumSizes();

        console.log(`[Garage] Initialised (controlling team ${teamId})`);
        return teamId;
    }

    /**
     * Make a team garage-ready inside the caller's transaction: top the
     * squad up to 7 players with spares, backfill garage_players rows, and
     * make sure exactly 5 are active. Idempotent.
     */
    static async _initTeamSquad(client, teamId) {
        const countResult = await client.query(
            'SELECT COUNT(*)::int AS count FROM players WHERE team_id = $1', [teamId]
        );
        let missing = GARAGE.SQUAD_SIZE - countResult.rows[0].count;
        for (const spare of GARAGE.SPARE_PLAYERS) {
            if (missing <= 0) break;
            await client.query(`
                INSERT INTO players (team_id, name, attack, defense, is_goalkeeper)
                VALUES ($1, $2, $3, $4, $5)
            `, [teamId, spare.name, spare.attack, spare.defense, spare.isGoalkeeper]);
            missing--;
        }

        // Backfill garage_players. Speed starts as a mid-range value
        // derived from the player's existing stats.
        await client.query(`
            INSERT INTO garage_players (player_id, speed)
            SELECT player_id, LEAST(90, GREATEST(20, (attack + defense) / 2))
            FROM players
            WHERE team_id = $1
            ON CONFLICT (player_id) DO NOTHING
        `, [teamId]);

        // Make sure exactly ACTIVE_SIZE players are active: default to the
        // 5 lowest player ids (the seeded base squad).
        const activeResult = await client.query(`
            SELECT COUNT(*)::int AS count
            FROM garage_players gp JOIN players p ON p.player_id = gp.player_id
            WHERE p.team_id = $1 AND gp.is_active
        `, [teamId]);
        if (activeResult.rows[0].count !== GARAGE.ACTIVE_SIZE) {
            await client.query(`
                UPDATE garage_players SET is_active = FALSE
                WHERE player_id IN (SELECT player_id FROM players WHERE team_id = $1)
            `, [teamId]);
            await client.query(`
                UPDATE garage_players SET is_active = TRUE
                WHERE player_id IN (
                    SELECT player_id FROM players WHERE team_id = $1
                    ORDER BY player_id ASC LIMIT $2
                )
            `, [teamId, GARAGE.ACTIVE_SIZE]);
        }
    }

    /**
     * Switch which team the garage controls. Keeps the bank balance; the
     * new team gets spares/garage state on first pick. The old team's
     * garage rows stay dormant (state is kept if the user switches back).
     */
    static async setTeam(teamId) {
        const id = Number(teamId);
        if (!Number.isInteger(id)) throw new GarageError('teamId must be an integer');

        const teamResult = await db.query('SELECT team_id, name FROM teams WHERE team_id = $1', [id]);
        if (!teamResult.rows.length) throw new GarageError(`Team ${id} not found`);

        const client = await db.connect();
        try {
            await client.query('BEGIN');
            const updated = await client.query(`
                UPDATE garage SET team_id = $1, updated_at = NOW()
                WHERE garage_id = 1
                RETURNING team_id
            `, [id]);
            if (!updated.rows.length) throw new GarageError('Garage not initialised');

            await GarageService._initTeamSquad(client, id);
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }

        console.log(`[Garage] Now controlling ${teamResult.rows[0].name} (team ${id})`);
        return GarageService.getState();
    }

    /**
     * Fresh legs for a fresh cup: every garage squad player starts a new
     * tournament at full energy. Condition is NOT reset - repairs stay
     * meaningful across cup runs.
     */
    static async resetEnergyForNewTournament() {
        const result = await db.query(`
            UPDATE garage_players SET energy = 100
            WHERE player_id IN (
                SELECT p.player_id FROM players p
                JOIN garage g ON g.team_id = p.team_id
            )
        `);
        if (result.rowCount > 0) {
            console.log(`[Garage] New tournament: energy reset for ${result.rowCount} players`);
        }
        return result.rowCount;
    }

    /**
     * Stamp stadium_size on every team from its current strength.
     * Idempotent; re-run whenever ratings may have changed materially.
     */
    static async refreshStadiumSizes() {
        const Team = require('../models/TeamModel');
        const teams = await Team.getAll();
        for (const team of teams) {
            const size = stadiumSizeFromOverall(overallRating(team));
            await db.query('UPDATE teams SET stadium_size = $1 WHERE team_id = $2', [size, team.id]);
        }
    }

    /** The garage team id, or null if the garage is not set up. */
    static async getTeamId() {
        const result = await db.query('SELECT team_id FROM garage WHERE garage_id = 1');
        return result.rows.length ? result.rows[0].team_id : null;
    }

    static async getBalance() {
        const result = await db.query('SELECT balance FROM garage WHERE garage_id = 1');
        return result.rows.length ? parseFloat(result.rows[0].balance) : null;
    }

    /** Full squad (players joined with their garage state). */
    static async getSquad(client = db) {
        const result = await client.query(`
            SELECT p.player_id, p.team_id, p.name, p.attack, p.defense, p.is_goalkeeper,
                   gp.is_active, gp.mode, gp.speed, gp.condition, gp.energy
            FROM garage g
            JOIN players p ON p.team_id = g.team_id
            JOIN garage_players gp ON gp.player_id = p.player_id
            WHERE g.garage_id = 1
            ORDER BY p.player_id ASC
        `);
        return result.rows.map(GarageService._formatPlayer);
    }

    /**
     * Everything the garage screen needs in one call: balance, squad (with
     * repair/upgrade prices), next fixture, and the latest match result.
     */
    static async getState() {
        const garageResult = await db.query(`
            SELECT g.team_id, g.balance, t.name AS team_name, t.stadium_size,
                   t.wins, t.jcups_won
            FROM garage g JOIN teams t ON t.team_id = g.team_id
            WHERE g.garage_id = 1
        `);
        if (!garageResult.rows.length) return null;
        const garage = garageResult.rows[0];

        const squad = await GarageService.getSquad();
        for (const player of squad) {
            player.repairCost = repairCost(player.condition);
            player.upgradeCosts = {
                attack: upgradeCost(player.attack),
                defence: upgradeCost(player.defense),
                speed: upgradeCost(player.speed)
            };
        }

        const nextFixture = await GarageService._getNextFixture(garage.team_id);
        const lastResult = await GarageService.getResultForFixture(null);

        return {
            teamId: garage.team_id,
            teamName: garage.team_name,
            stadiumSize: garage.stadium_size,
            balance: parseFloat(garage.balance),
            currency: 'GC', // Garage Credits - virtual only
            squadSize: GARAGE.SQUAD_SIZE,
            activeSize: GARAGE.ACTIVE_SIZE,
            squad,
            nextFixture,
            lastResult,
            prices: {
                energySmall: GARAGE.ENERGY_PACKS.small,
                energyFull: GARAGE.ENERGY_PACKS.full,
                repairPerPoint: GARAGE.REPAIR_COST_PER_POINT
            }
        };
    }

    /**
     * Next scheduled or live fixture involving the garage team. Scoped to
     * the most recent tournament so stale 'live' fixtures from abandoned
     * runs can't shadow the real next match.
     */
    static async _getNextFixture(teamId) {
        const result = await db.query(`
            SELECT f.fixture_id, f.round, f.status, f.home_team_id, f.away_team_id,
                   ht.name AS home_name, at.name AS away_name,
                   ht.stadium_size AS home_stadium, at.stadium_size AS away_stadium
            FROM fixtures f
            JOIN teams ht ON ht.team_id = f.home_team_id
            JOIN teams at ON at.team_id = f.away_team_id
            WHERE (f.home_team_id = $1 OR f.away_team_id = $1)
              AND f.status IN ('scheduled', 'live')
              AND f.tournament_id = (
                  SELECT tournament_id FROM fixtures
                  WHERE tournament_id IS NOT NULL
                  ORDER BY created_at DESC LIMIT 1
              )
            ORDER BY CASE f.status WHEN 'live' THEN 0 ELSE 1 END, f.fixture_id ASC
            LIMIT 1
        `, [teamId]);
        if (!result.rows.length) return null;

        const f = result.rows[0];
        const userIsHome = f.home_team_id === teamId;
        return {
            fixtureId: f.fixture_id,
            round: f.round,
            status: f.status,
            userIsHome, // first team in the fixture is always the home team
            opponent: {
                id: userIsHome ? f.away_team_id : f.home_team_id,
                name: userIsHome ? f.away_name : f.home_name
            },
            // Match is played at the home team's ground.
            stadiumSize: f.home_stadium
        };
    }

    /**
     * Garage result for a fixture; fixtureId null returns the latest one.
     */
    static async getResultForFixture(fixtureId) {
        const params = [];
        let where = '';
        if (fixtureId != null) {
            params.push(fixtureId);
            where = 'WHERE gmr.fixture_id = $1';
        }
        const result = await db.query(`
            SELECT gmr.fixture_id, gmr.won, gmr.reward_total, gmr.breakdown,
                   gmr.player_changes, gmr.created_at,
                   f.round, f.home_score, f.away_score,
                   f.home_penalty_score, f.away_penalty_score,
                   ht.name AS home_name, at.name AS away_name
            FROM garage_match_results gmr
            JOIN fixtures f ON f.fixture_id = gmr.fixture_id
            LEFT JOIN teams ht ON ht.team_id = f.home_team_id
            LEFT JOIN teams at ON at.team_id = f.away_team_id
            ${where}
            ORDER BY gmr.created_at DESC, gmr.fixture_id DESC
            LIMIT 1
        `, params);
        if (!result.rows.length) return null;

        const r = result.rows[0];
        return {
            fixtureId: r.fixture_id,
            round: r.round,
            won: r.won,
            rewardTotal: parseFloat(r.reward_total),
            breakdown: r.breakdown,
            playerChanges: r.player_changes,
            score: { home: r.home_score, away: r.away_score },
            penaltyScore: r.home_penalty_score !== null
                ? { home: r.home_penalty_score, away: r.away_penalty_score }
                : null,
            homeName: r.home_name,
            awayName: r.away_name,
            createdAt: r.created_at
        };
    }

    // === Squad management ===

    /**
     * Set the active 5. Requires exactly ACTIVE_SIZE distinct ids, all from
     * the 7-player garage squad.
     */
    static async setLineup(activePlayerIds) {
        if (!Array.isArray(activePlayerIds)) {
            throw new GarageError('activePlayerIds must be an array');
        }
        const ids = [...new Set(activePlayerIds.map(Number))];
        if (ids.length !== GARAGE.ACTIVE_SIZE || ids.some(id => !Number.isInteger(id))) {
            throw new GarageError(`Exactly ${GARAGE.ACTIVE_SIZE} distinct player ids required`);
        }

        const squad = await GarageService.getSquad();
        if (squad.length !== GARAGE.SQUAD_SIZE) {
            throw new GarageError(`Garage squad must contain exactly ${GARAGE.SQUAD_SIZE} players (found ${squad.length})`);
        }
        const squadIds = new Set(squad.map(p => p.playerId));
        for (const id of ids) {
            if (!squadIds.has(id)) {
                throw new GarageError(`Player ${id} is not in the garage squad`);
            }
        }

        const client = await db.connect();
        try {
            await client.query('BEGIN');
            await client.query(`
                UPDATE garage_players SET is_active = (player_id = ANY($1::int[]))
                WHERE player_id = ANY($2::int[])
            `, [ids, [...squadIds]]);
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }

        return GarageService.getSquad();
    }

    static async setPlayerMode(playerId, mode) {
        if (!GARAGE.MODES[mode]) {
            throw new GarageError(`Invalid mode '${mode}' (passive, balanced or aggressive)`);
        }
        const result = await db.query(`
            UPDATE garage_players SET mode = $1 WHERE player_id = $2
            RETURNING player_id
        `, [mode, playerId]);
        if (!result.rows.length) {
            throw new GarageError(`Player ${playerId} is not in the garage squad`);
        }
        return GarageService._getPlayer(playerId);
    }

    // === Money operations ===

    /**
     * Buy energy. pack 'small' needs a playerId (+25 to that player);
     * pack 'full' recharges the whole squad to 100.
     */
    static async buyEnergy({ pack, playerId = null }) {
        if (pack === 'small') {
            const { amount, cost } = GARAGE.ENERGY_PACKS.small;
            return GarageService._spend({
                cost,
                transactionType: 'energy_purchase',
                playerId,
                description: `Small energy pack (+${amount}) for player ${playerId}`,
                apply: async (client) => {
                    const updated = await client.query(`
                        UPDATE garage_players SET energy = LEAST(100, energy + $1)
                        WHERE player_id = $2
                        RETURNING player_id
                    `, [amount, playerId]);
                    if (!updated.rows.length) {
                        throw new GarageError(`Player ${playerId} is not in the garage squad`);
                    }
                }
            });
        }

        if (pack === 'full') {
            const { cost } = GARAGE.ENERGY_PACKS.full;
            return GarageService._spend({
                cost,
                transactionType: 'energy_purchase',
                description: 'Full squad recharge',
                apply: async (client) => {
                    await client.query(`
                        UPDATE garage_players SET energy = 100
                        WHERE player_id IN (
                            SELECT p.player_id FROM players p
                            JOIN garage g ON g.team_id = p.team_id
                        )
                    `);
                }
            });
        }

        throw new GarageError(`Unknown energy pack '${pack}' (small or full)`);
    }

    /** Fully repair one player's condition. Cost scales with damage. */
    static async repairPlayer(playerId) {
        const player = await GarageService._getPlayer(playerId);
        if (!player) throw new GarageError(`Player ${playerId} is not in the garage squad`);
        if (player.condition >= 100) throw new GarageError('Player is already at full condition');

        const cost = repairCost(player.condition);
        return GarageService._spend({
            cost,
            transactionType: 'repair',
            playerId,
            description: `Repaired ${player.name} (${player.condition} -> 100)`,
            apply: async (client) => {
                await client.query(
                    'UPDATE garage_players SET condition = 100 WHERE player_id = $1', [playerId]
                );
            }
        });
    }

    /** Upgrade attack, defence or speed by +1 with quadratic cost scaling. */
    static async upgradePlayer(playerId, stat) {
        if (!GARAGE.UPGRADABLE_STATS.includes(stat)) {
            throw new GarageError(`Invalid stat '${stat}' (attack, defence or speed)`);
        }
        const player = await GarageService._getPlayer(playerId);
        if (!player) throw new GarageError(`Player ${playerId} is not in the garage squad`);

        const current = stat === 'attack' ? player.attack
            : stat === 'defence' ? player.defense
            : player.speed;
        if (current >= GARAGE.UPGRADE.STAT_CAP) {
            throw new GarageError(`${stat} is already at the cap (${GARAGE.UPGRADE.STAT_CAP})`);
        }

        const cost = upgradeCost(current);
        return GarageService._spend({
            cost,
            transactionType: 'upgrade',
            playerId,
            description: `Upgraded ${player.name} ${stat} ${current} -> ${current + 1}`,
            apply: async (client) => {
                if (stat === 'speed') {
                    await client.query(
                        'UPDATE garage_players SET speed = speed + 1 WHERE player_id = $1', [playerId]
                    );
                } else {
                    const column = stat === 'attack' ? 'attack' : 'defense';
                    await client.query(
                        `UPDATE players SET ${column} = ${column} + 1 WHERE player_id = $1`, [playerId]
                    );
                }
            }
        });
    }

    /**
     * Core spend: locks the garage row, validates funds, applies the
     * domain change and the debit, and records a transaction — all in one
     * DB transaction so money can never go negative or be double-spent.
     */
    static async _spend({ cost, transactionType, playerId = null, fixtureId = null, description, apply }) {
        if (!Number.isFinite(cost) || cost < 0) throw new GarageError('Invalid cost');

        const client = await db.connect();
        try {
            await client.query('BEGIN');

            const garageResult = await client.query(
                'SELECT balance FROM garage WHERE garage_id = 1 FOR UPDATE'
            );
            if (!garageResult.rows.length) throw new GarageError('Garage not initialised');

            const balance = parseFloat(garageResult.rows[0].balance);
            if (balance < cost) {
                throw new GarageError(`Not enough credits (need ${cost}, have ${balance})`);
            }

            await apply(client);

            const newBalance = await GarageService._applyMoney(client, {
                amount: -cost,
                transactionType,
                playerId,
                fixtureId,
                description
            });

            await client.query('COMMIT');
            return { balance: newBalance, cost };
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    /**
     * Credit/debit the garage balance and record the audit row. Must run
     * inside the caller's transaction (client required).
     */
    static async _applyMoney(client, { amount, transactionType, playerId = null, fixtureId = null, description = null }) {
        const updated = await client.query(`
            UPDATE garage SET balance = balance + $1, updated_at = NOW()
            WHERE garage_id = 1
            RETURNING balance
        `, [amount]);
        if (!updated.rows.length) throw new GarageError('Garage not initialised');

        const balanceAfter = parseFloat(updated.rows[0].balance);
        await client.query(`
            INSERT INTO garage_transactions (amount, balance_after, transaction_type, fixture_id, player_id, description)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [amount, balanceAfter, transactionType, fixtureId, playerId, description]);

        return balanceAfter;
    }

    static async getTransactions(limit = 20) {
        const result = await db.query(`
            SELECT * FROM garage_transactions
            ORDER BY created_at DESC, transaction_id DESC
            LIMIT $1
        `, [Math.min(limit, 100)]);
        return result.rows.map(row => ({
            transactionId: row.transaction_id,
            amount: parseFloat(row.amount),
            balanceAfter: parseFloat(row.balance_after),
            transactionType: row.transaction_type,
            fixtureId: row.fixture_id,
            playerId: row.player_id,
            description: row.description,
            createdAt: row.created_at
        }));
    }

    // === Live simulation integration ===

    /**
     * Rating overrides for the garage team, from the active 5's effective
     * stats. Returns null when the garage is missing or the lineup is
     * invalid (the sim then just uses the team's normal ratings).
     */
    static async getMatchOverrides() {
        const teamId = await GarageService.getTeamId();
        if (!teamId) return null;

        const squad = await GarageService.getSquad();
        if (squad.length !== GARAGE.SQUAD_SIZE) return null;

        const ratings = effectiveTeamRatings(squad);
        if (!ratings) {
            console.warn('[Garage] Lineup invalid (need exactly 5 active players) - using base ratings');
            return null;
        }

        return {
            teamId,
            ...ratings,
            activePlayerIds: squad.filter(p => p.isActive).map(p => p.playerId)
        };
    }

    /**
     * Apply garage modifiers to a LiveMatch before kickoff: override the
     * garage team's ratings and restrict its player list to the active 5.
     * Never throws — a garage problem must not stop a match from starting.
     */
    static async applyToLiveMatch(match) {
        try {
            const overrides = await GarageService.getMatchOverrides();
            if (!overrides) return;

            for (const side of ['home', 'away']) {
                const team = side === 'home' ? match.homeTeam : match.awayTeam;
                if (!team || team.id !== overrides.teamId) continue;

                team.attackRating = overrides.attackRating;
                team.defenseRating = overrides.defenseRating;
                team.goalkeeperRating = overrides.goalkeeperRating;
                team.foulRiskMultiplier = overrides.foulRiskMultiplier;

                const active = new Set(overrides.activePlayerIds);
                const playersKey = side === 'home' ? 'homePlayers' : 'awayPlayers';
                const filtered = match[playersKey].filter(p => active.has(p.playerId));
                if (filtered.length === GARAGE.ACTIVE_SIZE) {
                    match[playersKey] = filtered;
                }

                console.log(`[Garage] Applied modifiers to ${team.name} (${side}): ` +
                    `atk=${team.attackRating} def=${team.defenseRating} gk=${team.goalkeeperRating} ` +
                    `foulRisk=${team.foulRiskMultiplier}`);
            }
        } catch (err) {
            console.error('[Garage] Failed to apply match modifiers:', err.message);
        }
    }

    // === Helpers ===

    static async _getPlayer(playerId) {
        const result = await db.query(`
            SELECT p.player_id, p.team_id, p.name, p.attack, p.defense, p.is_goalkeeper,
                   gp.is_active, gp.mode, gp.speed, gp.condition, gp.energy
            FROM players p JOIN garage_players gp ON gp.player_id = p.player_id
            WHERE p.player_id = $1
        `, [playerId]);
        return result.rows.length ? GarageService._formatPlayer(result.rows[0]) : null;
    }

    static _formatPlayer(row) {
        return {
            playerId: row.player_id,
            teamId: row.team_id,
            name: row.name,
            attack: row.attack,
            defense: row.defense,
            isGoalkeeper: row.is_goalkeeper,
            isActive: row.is_active,
            mode: row.mode,
            speed: row.speed,
            condition: row.condition,
            energy: row.energy
        };
    }
}

/** Expected/validation errors -> HTTP 400 in the controller. */
class GarageError extends Error {
    constructor(message) {
        super(message);
        this.name = 'GarageError';
        this.isGarageError = true;
    }
}

module.exports = GarageService;
module.exports.GarageError = GarageError;
