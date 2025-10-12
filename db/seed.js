const db = require('./connection'); // Your PostgreSQL connection setup
const format = require('pg-format');

const seed = async (data) => {
    // Handle both direct teams array and data object with teams property
    const teamsData = data && data.teams ? data.teams : require('./data/teams');
    // Start by clearing the existing data
    await db.query('DROP TABLE IF EXISTS players CASCADE;');
    await db.query('DROP TABLE IF EXISTS teams CASCADE;');

    // Recreate the tables
    await db.query(`
    CREATE TABLE teams (
        team_id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        wins INTEGER DEFAULT 0 NOT NULL,
        losses INTEGER DEFAULT 0 NOT NULL,
        goals_for INTEGER DEFAULT 0 NOT NULL,
        goals_against INTEGER DEFAULT 0 NOT NULL,
        jcups_won INTEGER DEFAULT 0 NOT NULL,
        runner_ups INTEGER DEFAULT 0 NOT NULL,
        highest_round_reached VARCHAR(50) DEFAULT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    ); 
    `);

    await db.query(`
        CREATE TABLE players (
            player_id SERIAL PRIMARY KEY,
            team_id INTEGER NOT NULL REFERENCES teams(team_id),
            name VARCHAR(255) NOT NULL,
            attack INTEGER NOT NULL,
            defense INTEGER NOT NULL,
            is_goalkeeper BOOLEAN NOT NULL
        );
    `);

    // Insert teams and players
    for (const team of teamsData) {
        const res = await db.query(format('INSERT INTO teams (name) VALUES (%L) RETURNING team_id', team.name));
        const teamId = res.rows[0].team_id;

        const playerValues = team.players.map(p => [
            teamId,
            p.name,
            p.attack,
            p.defense,
            p.isGoalkeeper
        ]);

        await db.query(format('INSERT INTO players (team_id, name, attack, defense, is_goalkeeper) VALUES %L', playerValues));
    }

    console.log('Database seeded successfully!');
};

module.exports =  { seed };
