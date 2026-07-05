/**
 * BettingOddsService - deterministic odds for the virtual betting layer.
 *
 * All functions are pure: same inputs always produce the same odds, so they
 * are easy to test. Existing fixture_odds / OddsEngine display logic is
 * untouched; this module is only used by the betting endpoints.
 *
 * Formula overview:
 * - Each team gets a "power" score from squad strength (attack/defense/GK
 *   ratings), cup form (career games won, capped) and championship history
 *   (J-Cups won, capped).
 * - Head-to-head win probability uses an Elo-style curve on the power
 *   difference, then is clamped so upsets always stay possible.
 * - Live odds shift the power difference by the current scoreline: a goal
 *   lead is worth more the later the match minute (a late lead is nearly
 *   decisive, an early one only a nudge).
 * - Championship odds share each remaining team's power over the field.
 * - Decimal odds = fair odds reduced by a small margin, clamped to
 *   sensible min/max values.
 */

// How many power points equal one order of magnitude in win chance.
const POWER_SPREAD = 120;
// Bookmaker margin (keeps returns slightly below fair value).
const MARGIN = 0.05;
// Probability clamps: even huge favourites can lose (upsets possible).
const MIN_PROB = 0.06;
const MAX_PROB = 0.94;
// Decimal odds clamps.
const MIN_ODDS = 1.05;
const MAX_MATCH_ODDS = 15;
const MAX_CHAMPIONSHIP_ODDS = 50;
// Power boost per goal of lead, scaled by match progress in liveWinProbability.
const GOAL_LEAD_POWER = 90;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

/**
 * Team power score.
 * Squad strength dominates; cup form and championship pedigree are
 * capped bonuses so a strong newcomer is not buried by history.
 * @param {Object} team - { attackRating, defenseRating, goalkeeperRating, wins, jcupsWon }
 */
function teamPower(team) {
    const attack = team.attackRating || 50;
    const defense = team.defenseRating || 50;
    const goalkeeper = team.goalkeeperRating || 50;
    const wins = team.wins || 0;
    const jcupsWon = team.jcupsWon ?? team.jcups_won ?? 0;

    return attack + defense + goalkeeper * 0.5   // squad strength
        + Math.min(wins, 15) * 2                 // cup form: games won (capped at +30)
        + Math.min(jcupsWon, 5) * 8;             // championship history (capped at +40)
}

/**
 * Elo-style probability that side A beats side B given a power difference.
 */
function winProbabilityFromPowerDiff(powerDiff) {
    const raw = 1 / (1 + Math.pow(10, -powerDiff / POWER_SPREAD));
    return clamp(raw, MIN_PROB, MAX_PROB);
}

/**
 * Convert probability to decimal odds with margin, clamped.
 */
function toDecimalOdds(probability, maxOdds = MAX_MATCH_ODDS) {
    const fairOdds = 1 / probability;
    const withMargin = fairOdds / (1 + MARGIN);
    return Math.round(clamp(withMargin, MIN_ODDS, maxOdds) * 100) / 100;
}

/**
 * Pre-match winner odds for a fixture.
 * @returns {{ home: {probability, odds}, away: {probability, odds} }}
 */
function prematchOdds(homeTeam, awayTeam) {
    const homeProb = winProbabilityFromPowerDiff(teamPower(homeTeam) - teamPower(awayTeam));
    const awayProb = 1 - homeProb;

    return {
        home: { probability: round4(homeProb), odds: toDecimalOdds(homeProb) },
        away: { probability: round4(awayProb), odds: toDecimalOdds(awayProb) }
    };
}

/**
 * Live in-play winner odds.
 * - The quality edge fades as the match progresses (a draw heads to
 *   extra time / penalties where anything can happen).
 * - A goal lead is worth more the later it is.
 * @param {Object} matchState - { homeScore, awayScore, minute, inExtraTime }
 */
function liveOdds(homeTeam, awayTeam, matchState) {
    const { homeScore = 0, awayScore = 0, minute = 0, inExtraTime = false } = matchState;

    const maxMinutes = inExtraTime ? 120 : 90;
    const progress = clamp(minute / maxMinutes, 0, 1);

    const qualityDiff = teamPower(homeTeam) - teamPower(awayTeam);
    const goalLead = homeScore - awayScore;

    // Quality edge fades to half by full time; lead weight grows from
    // 0.5x (kickoff) to 2x (final whistle).
    const liveDiff = qualityDiff * (1 - 0.5 * progress)
        + goalLead * GOAL_LEAD_POWER * (0.5 + 1.5 * progress);

    const homeProb = winProbabilityFromPowerDiff(liveDiff);
    const awayProb = 1 - homeProb;

    return {
        home: { probability: round4(homeProb), odds: toDecimalOdds(homeProb) },
        away: { probability: round4(awayProb), odds: toDecimalOdds(awayProb) },
        minute,
        progress: round4(progress)
    };
}

/**
 * Championship winner odds over the remaining teams.
 * Each remaining team's chance is its power share of the field, so odds
 * shorten automatically as rivals are eliminated round by round.
 * @param {Array} remainingTeams - team objects (see teamPower)
 * @returns {Array<{ teamId, teamName, probability, odds }>}
 */
function championshipOdds(remainingTeams) {
    if (!remainingTeams.length) return [];

    const weights = remainingTeams.map(team => Math.pow(10, teamPower(team) / POWER_SPREAD));
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);

    return remainingTeams.map((team, i) => {
        const probability = clamp(weights[i] / totalWeight, 0.01, MAX_PROB);
        return {
            teamId: team.id ?? team.teamId,
            teamName: team.name,
            probability: round4(probability),
            odds: toDecimalOdds(probability, MAX_CHAMPIONSHIP_ODDS)
        };
    });
}

function round4(value) {
    return Math.round(value * 10000) / 10000;
}

module.exports = {
    teamPower,
    winProbabilityFromPowerDiff,
    toDecimalOdds,
    prematchOdds,
    liveOdds,
    championshipOdds,
    MIN_ODDS,
    MAX_MATCH_ODDS,
    MAX_CHAMPIONSHIP_ODDS,
    MARGIN
};
