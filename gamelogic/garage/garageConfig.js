/**
 * Cyborg Garage tunables.
 *
 * Every gameplay number for the garage layer lives here so balancing is a
 * one-file edit. Nothing in this file touches the database or the match
 * simulation directly.
 */
const GARAGE = {
    // The user-controlled team. One shared garage exists for the whole app
    // (the live tournament is a single shared simulation, so only one team
    // can carry garage modifiers).
    USER_TEAM_NAME: 'Swirl City',
    STARTING_BALANCE: 500,

    SQUAD_SIZE: 7,
    ACTIVE_SIZE: 5,

    // Extra squad players added to the user team on first init
    // (base teams ship with 5 players).
    SPARE_PLAYERS: [
        { name: 'V Meuse', attack: 35, defense: 30, isGoalkeeper: false },
        { name: 'W Vosges', attack: 28, defense: 36, isGoalkeeper: false }
    ],

    // Player mode modifiers.
    // attack/defense/speed multiply the player's effective stats.
    // energyDrain is flat energy lost per match played.
    // foulRisk scales how often the team gives away fouls in the sim.
    // damageRisk scales post-match condition damage.
    MODES: {
        passive: { attack: 0.95, defense: 1.05, speed: 1.00, energyDrain: 12, foulRisk: 0.5, damageRisk: 0.5 },
        balanced: { attack: 1.00, defense: 1.00, speed: 1.00, energyDrain: 20, foulRisk: 1.0, damageRisk: 1.0 },
        aggressive: { attack: 1.10, defense: 0.95, speed: 1.10, energyDrain: 30, foulRisk: 1.6, damageRisk: 1.8 }
    },
    DEFAULT_MODE: 'balanced',

    // Effectiveness scaling: a player at 0 energy or 0 condition still plays,
    // just badly. factor = (floor + (1-floor)*energy/100) * (same for condition)
    EFFECTIVENESS_FLOOR: 0.6,

    // Post-match condition damage: base + roll in [0, RANDOM], scaled by the
    // player's mode damageRisk.
    CONDITION_DAMAGE_BASE: 2,
    CONDITION_DAMAGE_RANDOM: 6,

    // Energy purchases (garage credits).
    ENERGY_PACKS: {
        small: { amount: 25, cost: 40 },   // +25 energy to one player
        full: { cost: 150 }                // whole squad back to 100
    },

    REPAIR_COST_PER_POINT: 2, // credits per condition point restored

    // Upgrade cost = BASE_COST + currentStat^2 * MULTIPLIER, rounded.
    // 30 -> 155, 70 -> 755, 90 -> 1235.
    UPGRADE: { BASE_COST: 20, MULTIPLIER: 0.15, STAT_CAP: 99 },
    UPGRADABLE_STATS: ['attack', 'defence', 'speed'],

    REWARDS: {
        BASE_BY_ROUND: {
            'Round of 16': 200,
            'Quarter-finals': 350,
            'Semi-finals': 600,
            'Final': 1000
        },
        // Strong bonus for beating top-graded opponents.
        TIER_BONUS: { 'A++': 400, 'A+': 250, 'A': 150, 'A-': 100 },
        // Beating a team with a higher overall rating than ours.
        UPSET_BONUS: 150,
        // Winning AWAY at a big ground.
        STADIUM_BONUS: { large: 75, mega: 150 },
        // Opponent history: all-time wins + championships, capped.
        HISTORY_WIN_VALUE: 1,
        HISTORY_CUP_VALUE: 25,
        HISTORY_BONUS_CAP: 200
    },

    // Overall rating -> grade. Overall = (attack + defense + goalkeeper) / 3.
    GRADE_THRESHOLDS: [
        { min: 80, grade: 'A++' },
        { min: 77, grade: 'A+' },
        { min: 72, grade: 'A' },
        { min: 69, grade: 'A-' },
        { min: 65, grade: 'B+' },
        { min: 60, grade: 'B' },
        { min: 55, grade: 'B-' },
        { min: 50, grade: 'C+' },
        { min: 45, grade: 'C' },
        { min: 0, grade: 'C-' }
    ],

    // Stadium size follows team grade (project_plan: C small, B medium,
    // A/A- large, A+/A++ mega).
    STADIUM_BY_GRADE: {
        'A++': 'mega', 'A+': 'mega',
        'A': 'large', 'A-': 'large',
        'B+': 'medium', 'B': 'medium', 'B-': 'medium',
        'C+': 'small', 'C': 'small', 'C-': 'small'
    }
};

module.exports = { GARAGE };
