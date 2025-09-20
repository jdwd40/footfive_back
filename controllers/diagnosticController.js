const db = require('../db/connection');
const { seed } = require('../db/seed');

exports.getDatabaseStatus = async (req, res) => {
    try {
        // Check if tables exist
        const tablesQuery = `
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('teams', 'players')
        `;
        const tables = await db.query(tablesQuery);

        // Count teams and players
        let teamCount = 0;
        let playerCount = 0;
        let sampleTeam = null;
        let samplePlayer = null;

        try {
            const teamCountResult = await db.query('SELECT COUNT(*) FROM teams');
            teamCount = parseInt(teamCountResult.rows[0].count);
            
            const playerCountResult = await db.query('SELECT COUNT(*) FROM players');
            playerCount = parseInt(playerCountResult.rows[0].count);

            // Get a sample team with ratings
            if (teamCount > 0) {
                const sampleTeamResult = await db.query(`
                    SELECT t.team_id, t.name, t.jcups_won, t.runner_ups,
                           (SELECT MAX(attack) FROM players WHERE team_id = t.team_id AND is_goalkeeper = false) AS attack_rating,
                           (SELECT MAX(defense) FROM players WHERE team_id = t.team_id AND is_goalkeeper = false) AS defense_rating,
                           (SELECT MAX(defense) FROM players WHERE team_id = t.team_id AND is_goalkeeper = true) AS goalkeeper_rating
                    FROM teams t
                    LIMIT 1
                `);
                sampleTeam = sampleTeamResult.rows[0];
            }

            // Get a sample player
            if (playerCount > 0) {
                const samplePlayerResult = await db.query(`
                    SELECT p.*, t.name as team_name 
                    FROM players p 
                    JOIN teams t ON p.team_id = t.team_id 
                    LIMIT 1
                `);
                samplePlayer = samplePlayerResult.rows[0];
            }
        } catch (error) {
            console.log('Error querying data:', error.message);
        }

        return res.status(200).json({
            message: "Database diagnostic complete",
            database: process.env.PGDATABASE || 'Not set',
            environment: process.env.NODE_ENV || 'Not set',
            tables: tables.rows.map(t => t.table_name),
            counts: {
                teams: teamCount,
                players: playerCount
            },
            samples: {
                team: sampleTeam,
                player: samplePlayer
            }
        });
    } catch (error) {
        return res.status(500).json({
            message: "Database diagnostic failed",
            error: error.message,
            database: process.env.PGDATABASE || 'Not set',
            environment: process.env.NODE_ENV || 'Not set'
        });
    }
}

exports.seedDatabase = async (req, res) => {
    try {
        const devData = require('../db/data/index.js');
        await seed(devData);
        
        return res.status(200).json({
            message: "Database seeded successfully",
            environment: process.env.NODE_ENV || 'Not set',
            database: process.env.PGDATABASE || 'Not set'
        });
    } catch (error) {
        return res.status(500).json({
            message: "Database seeding failed",
            error: error.message,
            environment: process.env.NODE_ENV || 'Not set',
            database: process.env.PGDATABASE || 'Not set'
        });
    }
}
