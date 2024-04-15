const Teams = require('./models/TeamModel');
const Players = require('./models/PlayerModel');
const MatchSimulator = require('./Gamelogic/MatchSimulator');
const JCup = require('./Gamelogic/JCup');

const showTeams = async () => {
    const teams = await Teams.getAll();
    console.log(teams);
};

const showPlayer = async (player_id) => {
    const player = await Players.fetchById(player_id);
    console.log(player);
}

const showPlayersByTeam = async (team_id) => {
    const players = await Players.fetchByTeamId(team_id);
    console.log(players);
}

const updatePlayer = async (player_id, name, attack, defense) => {
    const player = await Players.updateById(player_id, name, attack, defense);
    // console.log(player);
}

const showPlayersByTeamName = async (team_name) => {
    const players = await Players.fetchByTeamName(team_name);
    console.log(players);
}

const showPlayersByTeamTeamName = async (team_name) => {
    const players = await Players.fetchByTeamId(team_name);
    console.log(players);
}

const showTeamRatings = async (team_id) => {
    const team = await Teams.getRatingByTeamName(team_id);
    console.log(team);
}


// Usage
const team1 = { name: "Metro City", attackRating: 90, defenseRating: 80, goalkeeperRating: 80 };
const team2 = { name: "Coastal Guardians", attackRating: 90, defenseRating: 70, goalkeeperRating: 70 };
const match = new MatchSimulator(team1, team2);
const result = match.simulate();
console.log(result);

// Example usage
// (async () => {
//     const jCup = new JCup();
//     await jCup.startTournament();
// })();

// const makeCup = async () => {
//     const jCup = new JCup();
//     await jCup.startTournament();
// }

// console.log(makeCup());



