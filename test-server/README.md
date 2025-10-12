# FootFive Match Simulator - Test GUI

A standalone test interface for testing match simulations with custom team ratings and viewing detailed results including regular time, extra time, and penalty shootouts.

## Features

- 🎮 **Interactive Team Selection**: Choose any two teams from the database
- ⚡ **Editable Ratings**: Modify attack, defense, and goalkeeper ratings before simulation
- 📊 **Detailed Results**: View highlights separated by match phase:
  - Regular Time (0-90 minutes)
  - Extra Time (91-120 minutes)
  - Penalty Shootout
- 🎨 **Modern UI**: Bootstrap 5 with custom styling and smooth animations
- 🔄 **Real-time Simulation**: Test match logic with instant feedback

## Installation

### Prerequisites

Make sure you have the main FootFive backend set up with:
- Node.js installed
- PostgreSQL database configured
- Main application dependencies installed

### Setup

1. Navigate to the test-server directory:
```bash
cd test-server
```

2. Install dependencies:
```bash
npm install
```

3. Ensure your database connection is configured in `../db/connection.js`

## Usage

### Starting the Test Server

From the `test-server` directory:

```bash
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

The server will start on **http://localhost:3001**

### Using the Interface

1. **Open your browser** and navigate to http://localhost:3001

2. **Select Teams**:
   - Choose a home team from the first dropdown
   - Choose an away team from the second dropdown
   - Click "Load Team Data"

3. **Edit Ratings** (optional):
   - Modify attack, defense, or goalkeeper ratings for either team
   - Ratings can range from 0 to 200
   - Higher ratings increase the probability of success for that attribute

4. **Simulate Match**:
   - Click "Simulate Match" to run the simulation
   - View the final score and outcome
   - Explore highlights in each match phase using the tabs

### Understanding Ratings

- **Attack Rating**: Higher = More attack opportunities (formula: `attackRating / 200`)
- **Defense Rating**: Higher = More successful blocks (formula: `defenseRating / 110`)
- **Goalkeeper Rating**: Higher = More saves (formula: `goalkeeperRating / 90`)

Typical ranges:
- Low: 10-40
- Medium: 40-70
- High: 70-100
- Very High: 100+

## API Endpoints

The test server provides two API endpoints:

### GET /api/teams
Fetches all teams from the database with their current ratings.

**Response:**
```json
{
  "success": true,
  "teams": [
    {
      "id": 1,
      "name": "Team Name",
      "attackRating": 80,
      "defenseRating": 75,
      "goalkeeperRating": 70
    }
  ]
}
```

### POST /api/simulate
Simulates a match with custom team data.

**Request:**
```json
{
  "team1": {
    "name": "Team A",
    "attackRating": 80,
    "defenseRating": 75,
    "goalkeeperRating": 70
  },
  "team2": {
    "name": "Team B",
    "attackRating": 75,
    "defenseRating": 80,
    "goalkeeperRating": 75
  }
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "score": { "Team A": 2, "Team B": 2 },
    "penaltyScore": { "Team A": 4, "Team B": 3 },
    "finalResult": "Team A 6(4) - Team B 5(3)",
    "regularTimeHighlights": [...],
    "extraTimeHighlights": [...],
    "penaltyHighlights": [...],
    "metadata": {
      "team1": "Team A",
      "team2": "Team B",
      "hadExtraTime": false,
      "hadPenalties": true,
      "totalHighlights": 45
    }
  }
}
```

## File Structure

```
test-server/
├── server.js           # Express server (port 3001)
├── package.json        # Dependencies and scripts
├── README.md          # This file
└── public/
    ├── index.html     # Main GUI interface
    ├── app.js         # Frontend JavaScript
    └── styles.css     # Custom styling
```

## Troubleshooting

### Server won't start
- Ensure port 3001 is not already in use
- Check that the main FootFive database is accessible
- Verify `../db/connection.js` is properly configured

### Teams not loading
- Check database connection
- Ensure teams and players tables are populated
- Check console for error messages

### Simulation fails
- Verify team ratings are valid numbers (0-200)
- Check that both teams are selected
- Review server logs for detailed error messages

## Development

To modify the interface:

1. **HTML changes**: Edit `public/index.html`
2. **JavaScript logic**: Edit `public/app.js`
3. **Styling**: Edit `public/styles.css`
4. **Backend API**: Edit `server.js`

The server serves static files from the `public/` directory, so changes to frontend files are reflected immediately after refreshing the browser.

## Notes

- This is a **testing tool** and runs independently from the main application
- The test server uses the same database as the main application
- Simulations are run in memory and do not affect database records
- The interface is designed for desktop browsers but is responsive for mobile

## Support

For issues or questions related to the match simulation logic, refer to:
- `../Gamelogic/MatchSimulator.js` - Core simulation engine
- `../report_docs/` - Game logic documentation
- Main application README

---

**Version**: 1.0.0  
**Author**: JD  
**License**: ISC

