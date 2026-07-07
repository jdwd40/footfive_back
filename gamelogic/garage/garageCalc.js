/**
 * Pure Cyborg Garage calculations: grades, stadium sizes, effective player
 * stats, reward breakdowns, and costs. No database access — everything here
 * is deterministic (or takes an injected rng) so it is easy to test.
 */
const { GARAGE } = require('./garageConfig');

/** Overall team rating used for grading: mean of the three sim ratings. */
function overallRating({ attackRating = 0, defenseRating = 0, goalkeeperRating = 0 }) {
    return (attackRating + defenseRating + goalkeeperRating) / 3;
}

function gradeFromOverall(overall) {
    for (const { min, grade } of GARAGE.GRADE_THRESHOLDS) {
        if (overall >= min) return grade;
    }
    return 'C-';
}

function stadiumSizeFromOverall(overall) {
    return GARAGE.STADIUM_BY_GRADE[gradeFromOverall(overall)] || 'medium';
}

/**
 * How much of a player's stats survive their current energy/condition.
 * 1.0 at full energy+condition, floor^2 (0.36) at zero of both.
 */
function effectivenessFactor(energy, condition) {
    const floor = GARAGE.EFFECTIVENESS_FLOOR;
    const energyPart = floor + (1 - floor) * clamp(energy, 0, 100) / 100;
    const conditionPart = floor + (1 - floor) * clamp(condition, 0, 100) / 100;
    return energyPart * conditionPart;
}

/**
 * A garage player's effective attack/defense after mode, speed, energy and
 * condition. Speed contributes 10% of both values; modes scale their parts.
 */
function effectivePlayerStats(player) {
    const mode = GARAGE.MODES[player.mode] || GARAGE.MODES[GARAGE.DEFAULT_MODE];
    const factor = effectivenessFactor(player.energy, player.condition);
    const effSpeed = player.speed * mode.speed;
    return {
        attack: (0.9 * player.attack * mode.attack + 0.1 * effSpeed) * factor,
        defense: (0.9 * player.defense * mode.defense + 0.1 * effSpeed) * factor
    };
}

/**
 * Team rating overrides for the live simulation, computed from the ACTIVE
 * squad players. Mirrors TeamModel's MAX-of-players rating semantics so the
 * garage team plugs into the sim exactly like any other team.
 *
 * Returns null unless exactly ACTIVE_SIZE players are active.
 */
function effectiveTeamRatings(squad) {
    const active = squad.filter(p => p.isActive);
    if (active.length !== GARAGE.ACTIVE_SIZE) return null;

    const outfield = active.filter(p => !p.isGoalkeeper);
    const keepers = active.filter(p => p.isGoalkeeper);

    const eff = p => effectivePlayerStats(p);
    const maxBy = (players, pick) => players.reduce((m, p) => Math.max(m, pick(eff(p))), 0);

    const attackRating = maxBy(outfield, s => s.attack);
    const defenseRating = maxBy(outfield, s => s.defense);
    // No keeper picked: best outfield defender goes in goal, badly.
    const goalkeeperRating = keepers.length > 0
        ? maxBy(keepers, s => s.defense)
        : 0.75 * defenseRating;

    const foulRiskMultiplier = active.reduce((sum, p) => {
        const mode = GARAGE.MODES[p.mode] || GARAGE.MODES[GARAGE.DEFAULT_MODE];
        return sum + mode.foulRisk;
    }, 0) / active.length;

    return {
        attackRating: round1(attackRating),
        defenseRating: round1(defenseRating),
        goalkeeperRating: round1(goalkeeperRating),
        foulRiskMultiplier: round2(foulRiskMultiplier)
    };
}

/** Flat energy lost by a player for playing a match in the given mode. */
function energyDrain(mode) {
    return (GARAGE.MODES[mode] || GARAGE.MODES[GARAGE.DEFAULT_MODE]).energyDrain;
}

/** Post-match condition damage; rng injectable for tests (default Math.random). */
function conditionDamage(mode, rng = Math.random) {
    const risk = (GARAGE.MODES[mode] || GARAGE.MODES[GARAGE.DEFAULT_MODE]).damageRisk;
    const roll = GARAGE.CONDITION_DAMAGE_BASE + rng() * GARAGE.CONDITION_DAMAGE_RANDOM;
    return Math.round(roll * risk);
}

/** Cost to restore a player from `condition` back to 100. */
function repairCost(condition) {
    return Math.max(0, 100 - clamp(condition, 0, 100)) * GARAGE.REPAIR_COST_PER_POINT;
}

/** Cost of the next +1 on a stat. Quadratic so high stats get very expensive. */
function upgradeCost(currentStat) {
    const { BASE_COST, MULTIPLIER } = GARAGE.UPGRADE;
    return Math.round(BASE_COST + currentStat * currentStat * MULTIPLIER);
}

/**
 * Post-match win reward with a full breakdown for the UI.
 *
 * @param {object} args
 * @param {string} args.round          fixture round name ('Round of 16', ...)
 * @param {boolean} args.userWasHome   first team in the fixture is home
 * @param {number} args.userOverall    user team overall rating
 * @param {object} args.opponent       { overall, wins, jcupsWon, stadiumSize }
 */
function calculateReward({ round, userWasHome, userOverall, opponent }) {
    const r = GARAGE.REWARDS;
    const base = r.BASE_BY_ROUND[round] || r.BASE_BY_ROUND['Round of 16'];
    const opponentGrade = gradeFromOverall(opponent.overall);

    const tierBonus = r.TIER_BONUS[opponentGrade] || 0;
    const upsetBonus = opponent.overall > userOverall ? r.UPSET_BONUS : 0;
    const stadiumBonus = !userWasHome ? (r.STADIUM_BONUS[opponent.stadiumSize] || 0) : 0;
    const historyBonus = Math.min(
        r.HISTORY_BONUS_CAP,
        Math.round((opponent.wins || 0) * r.HISTORY_WIN_VALUE + (opponent.jcupsWon || 0) * r.HISTORY_CUP_VALUE)
    );

    const total = base + tierBonus + upsetBonus + stadiumBonus + historyBonus;

    return {
        total,
        breakdown: { base, tierBonus, upsetBonus, stadiumBonus, historyBonus },
        opponentGrade
    };
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
}

const round1 = n => Math.round(n * 10) / 10;
const round2 = n => Math.round(n * 100) / 100;

module.exports = {
    overallRating,
    gradeFromOverall,
    stadiumSizeFromOverall,
    effectivenessFactor,
    effectivePlayerStats,
    effectiveTeamRatings,
    energyDrain,
    conditionDamage,
    repairCost,
    upgradeCost,
    calculateReward,
    clamp
};
