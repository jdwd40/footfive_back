const Fixture = require('../models/FixtureModel');
const Odds = require('../models/OddsModel');

class OddsEngine {
    constructor(margin = 0.05) {
        this.margin = margin;
        this.formLength = 10;
    }

    /**
     * Calculate odds for a fixture
     * @param {Object} homeTeam - { id, name, attackRating, defenseRating, goalkeeperRating }
     * @param {Object} awayTeam - { id, name, attackRating, defenseRating, goalkeeperRating }
     * @returns {Object} - { homeWinProb, awayWinProb, homeWinOdds, awayWinOdds, factors }
     */
    async calculateOdds(homeTeam, awayTeam) {
        // Get form stats for both teams
        const homeForm = await Fixture.getTeamForm(homeTeam.id, this.formLength);
        const awayForm = await Fixture.getTeamForm(awayTeam.id, this.formLength);

        // Calculate base win rates from form
        const homeWinRate = homeForm.matches > 0
            ? homeForm.wins / homeForm.matches
            : 0.5;
        const awayWinRate = awayForm.matches > 0
            ? awayForm.wins / awayForm.matches
            : 0.5;

        // Calculate team strength from ratings
        const homeStrength = (homeTeam.attackRating || 50) + (homeTeam.defenseRating || 50);
        const awayStrength = (awayTeam.attackRating || 50) + (awayTeam.defenseRating || 50);
        const ratingDiff = homeStrength - awayStrength;

        // Strength modifier (-1 to +1)
        const strengthMod = this.sigmoid(ratingDiff / 50);

        // Goal difference factor
        const gdDiff = (homeForm.goalDiff || 0) - (awayForm.goalDiff || 0);
        const gdFactor = this.sigmoid(gdDiff / 10);

        // Goalkeeper factor (slight adjustment)
        const gkDiff = (homeTeam.goalkeeperRating || 50) - (awayTeam.goalkeeperRating || 50);
        const gkFactor = this.sigmoid(gkDiff / 30) * 0.05;

        // Home advantage
        const homeAdvantage = 0.03;

        // Calculate raw probability
        // Base: 0.5 (even match)
        // Adjust by: form (30%), strength (25%), goal diff (15%), GK (5%), home (3%)
        let homeProb = 0.5
            + (homeWinRate - awayWinRate) * 0.15  // form difference
            + strengthMod * 0.25                   // rating strength
            + gdFactor * 0.10                      // goal difference
            + gkFactor                             // goalkeeper
            + homeAdvantage;                       // home boost

        // Clamp to reasonable range
        homeProb = Math.max(0.10, Math.min(0.90, homeProb));
        const awayProb = 1 - homeProb;

        // Convert to decimal odds with margin
        const homeWinOdds = this.toDecimalOdds(homeProb);
        const awayWinOdds = this.toDecimalOdds(awayProb);

        return {
            homeWinProb: Math.round(homeProb * 10000) / 10000,
            awayWinProb: Math.round(awayProb * 10000) / 10000,
            homeWinOdds,
            awayWinOdds,
            factors: {
                homeForm: {
                    matches: homeForm.matches,
                    wins: homeForm.wins,
                    winRate: Math.round(homeWinRate * 100) / 100,
                    goalDiff: homeForm.goalDiff
                },
                awayForm: {
                    matches: awayForm.matches,
                    wins: awayForm.wins,
                    winRate: Math.round(awayWinRate * 100) / 100,
                    goalDiff: awayForm.goalDiff
                },
                homeStrength,
                awayStrength,
                ratingDiff,
                strengthMod: Math.round(strengthMod * 100) / 100,
                gdFactor: Math.round(gdFactor * 100) / 100
            }
        };
    }

    /**
     * Calculate and persist odds for a fixture
     */
    async calculateAndSaveOdds(fixtureId, homeTeam, awayTeam) {
        const oddsData = await this.calculateOdds(homeTeam, awayTeam);

        return Odds.upsert({
            fixtureId,
            homeWinProb: oddsData.homeWinProb,
            awayWinProb: oddsData.awayWinProb,
            homeWinOdds: oddsData.homeWinOdds,
            awayWinOdds: oddsData.awayWinOdds,
            margin: this.margin,
            factors: oddsData.factors
        });
    }

    /**
     * Sigmoid function: maps any number to range (-1, 1)
     */
    sigmoid(x) {
        return 2 / (1 + Math.exp(-x)) - 1;
    }

    /**
     * Convert probability to decimal odds with margin
     * e.g., 0.5 probability with 5% margin = 1.90 odds
     */
    toDecimalOdds(probability) {
        const fairOdds = 1 / probability;
        const marginalOdds = fairOdds / (1 + this.margin);
        return Math.round(marginalOdds * 100) / 100;
    }

    /**
     * Calculate implied probability from decimal odds
     */
    impliedProbability(decimalOdds) {
        return 1 / decimalOdds;
    }

    /**
     * Get readable odds summary
     */
    formatOddsSummary(homeTeamName, awayTeamName, oddsData) {
        const homePercent = Math.round(oddsData.homeWinProb * 100);
        const awayPercent = Math.round(oddsData.awayWinProb * 100);

        return {
            match: `${homeTeamName} vs ${awayTeamName}`,
            probabilities: {
                [homeTeamName]: `${homePercent}%`,
                [awayTeamName]: `${awayPercent}%`
            },
            odds: {
                [homeTeamName]: oddsData.homeWinOdds.toFixed(2),
                [awayTeamName]: oddsData.awayWinOdds.toFixed(2)
            },
            favorite: homePercent > awayPercent ? homeTeamName : awayTeamName
        };
    }
}

module.exports = OddsEngine;
