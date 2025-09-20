// Minimal test data for faster testing
const minimalTeams = [
    {
        name: "Test Team A",
        players: [
            { name: "Player A1", attack: 80, defense: 70, isGoalkeeper: false },
            { name: "Player A2", attack: 75, defense: 75, isGoalkeeper: false },
            { name: "Player A3", attack: 70, defense: 80, isGoalkeeper: false },
            { name: "Player A4", attack: 65, defense: 85, isGoalkeeper: false },
            { name: "Goalkeeper A", attack: 30, defense: 75, isGoalkeeper: true }
        ]
    },
    {
        name: "Test Team B",
        players: [
            { name: "Player B1", attack: 85, defense: 65, isGoalkeeper: false },
            { name: "Player B2", attack: 78, defense: 72, isGoalkeeper: false },
            { name: "Player B3", attack: 72, defense: 78, isGoalkeeper: false },
            { name: "Player B4", attack: 68, defense: 82, isGoalkeeper: false },
            { name: "Goalkeeper B", attack: 25, defense: 80, isGoalkeeper: true }
        ]
    },
    {
        name: "Test Team C",
        players: [
            { name: "Player C1", attack: 88, defense: 60, isGoalkeeper: false },
            { name: "Player C2", attack: 82, defense: 68, isGoalkeeper: false },
            { name: "Player C3", attack: 75, defense: 75, isGoalkeeper: false },
            { name: "Player C4", attack: 70, defense: 80, isGoalkeeper: false },
            { name: "Goalkeeper C", attack: 35, defense: 70, isGoalkeeper: true }
        ]
    },
    {
        name: "Test Team D",
        players: [
            { name: "Player D1", attack: 70, defense: 85, isGoalkeeper: false },
            { name: "Player D2", attack: 75, defense: 80, isGoalkeeper: false },
            { name: "Player D3", attack: 80, defense: 75, isGoalkeeper: false },
            { name: "Player D4", attack: 85, defense: 70, isGoalkeeper: false },
            { name: "Goalkeeper D", attack: 40, defense: 78, isGoalkeeper: true }
        ]
    }
];

module.exports = minimalTeams;
