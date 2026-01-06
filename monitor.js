#!/usr/bin/env node

const https = require('https');
const readline = require('readline');

const API_BASE = 'https://jwd1.xyz/api';

// ANSI codes
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

let lastDataHash = '';
let lastTournamentId = null;
let waitingForNewTournament = false;

function fetch(path) {
  return new Promise((resolve, reject) => {
    https.get(`${API_BASE}${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    }).on('error', reject);
  });
}

function clearScreen() {
  process.stdout.write('\x1b[2J\x1b[H');
}

function pad(str, len, align = 'left') {
  str = String(str);
  if (str.length >= len) return str.slice(0, len);
  const padding = ' '.repeat(len - str.length);
  return align === 'right' ? padding + str : str + padding;
}

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function padWithAnsi(str, len, align = 'left') {
  const visibleLen = stripAnsi(str).length;
  if (visibleLen >= len) return str;
  const padding = ' '.repeat(len - visibleLen);
  return align === 'right' ? padding + str : str + padding;
}

function getStateDisplay(match) {
  const state = match.state || 'SCHEDULED';
  switch (state) {
    case 'LIVE':
      return `${c.green}${c.bold}LIVE ${match.minute || 0}'${c.reset}`;
    case 'EXTRA_TIME':
      return `${c.yellow}${c.bold}ET ${match.minute || 90}'${c.reset}`;
    case 'PENALTIES':
      return `${c.magenta}${c.bold}PENS${c.reset}`;
    case 'FINISHED':
      return `${c.dim}FT${c.reset}`;
    default:
      return `${c.cyan}--${c.reset}`;
  }
}

function getScoreDisplay(match) {
  if (!match.state || match.state === 'SCHEDULED') {
    return `${c.dim}vs${c.reset}`;
  }

  let score = `${match.score?.home ?? 0} - ${match.score?.away ?? 0}`;

  if (match.penaltyScore && (match.penaltyScore.home > 0 || match.penaltyScore.away > 0)) {
    score += ` ${c.magenta}(P:${match.penaltyScore.home}-${match.penaltyScore.away})${c.reset}`;
  }

  return score;
}

function buildTable(fixtures, tournament) {
  const lines = [];
  const rounds = ['Round of 16', 'Quarter-finals', 'Semi-finals', 'Final'];

  // Header
  lines.push(`${c.bold}${c.cyan}TOURNAMENT FIXTURES${c.reset}  ${c.dim}(Round: ${tournament?.currentRound || 'N/A'} | Status: ${tournament?.status || 'Unknown'})${c.reset}`);
  lines.push(`${c.dim}${'─'.repeat(80)}${c.reset}`);

  // Table header
  lines.push(
    `${c.bold}${pad('Round', 16)}${pad('Home', 18)}${pad('Score', 20)}${pad('Away', 18)}${pad('Status', 12)}${c.reset}`
  );
  lines.push(`${c.dim}${'─'.repeat(80)}${c.reset}`);

  if (!fixtures?.fixtures || fixtures.fixtures.length === 0) {
    lines.push(`${c.dim}No fixtures available${c.reset}`);
    return lines;
  }

  for (const round of rounds) {
    const roundMatches = fixtures.fixtures.filter(f => f.round === round);
    if (roundMatches.length === 0) continue;

    for (const match of roundMatches) {
      const homeName = match.homeTeam?.name || 'TBD';
      const awayName = match.awayTeam?.name || 'TBD';
      const isFinished = match.isFinished || match.state === 'FINISHED';
      const isLive = match.state === 'LIVE' || match.state === 'EXTRA_TIME' || match.state === 'PENALTIES';

      // Highlight winner
      let homeDisplay = homeName;
      let awayDisplay = awayName;

      if (isFinished && match.winnerId) {
        if (match.winnerId === match.homeTeam?.id) {
          homeDisplay = `${c.green}${c.bold}${homeName}${c.reset}`;
          awayDisplay = `${c.dim}${awayName}${c.reset}`;
        } else {
          homeDisplay = `${c.dim}${homeName}${c.reset}`;
          awayDisplay = `${c.green}${c.bold}${awayName}${c.reset}`;
        }
      } else if (isLive) {
        homeDisplay = `${c.bold}${homeName}${c.reset}`;
        awayDisplay = `${c.bold}${awayName}${c.reset}`;
      }

      const scoreDisplay = getScoreDisplay(match);
      const stateDisplay = getStateDisplay(match);

      lines.push(
        `${pad(round, 16)}${padWithAnsi(homeDisplay, 18)}${padWithAnsi(scoreDisplay, 20)}${padWithAnsi(awayDisplay, 18)}${stateDisplay}`
      );
    }
  }

  lines.push(`${c.dim}${'─'.repeat(80)}${c.reset}`);

  // Show winner if tournament finished
  const final = fixtures.fixtures.find(f => f.round === 'Final' && (f.isFinished || f.state === 'FINISHED'));
  if (final && final.winnerId) {
    const winner = final.winnerId === final.homeTeam?.id ? final.homeTeam?.name : final.awayTeam?.name;
    lines.push(`${c.yellow}${c.bold}WINNER: ${winner}${c.reset}`);
    lines.push(`${c.dim}${'─'.repeat(80)}${c.reset}`);
  }

  return lines;
}

function hashData(fixtures, tournament) {
  const data = JSON.stringify({ fixtures: fixtures?.fixtures, tournament });
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash) + data.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString();
}

function getMinutesToNext55() {
  const now = new Date();
  const mins = now.getMinutes();
  if (mins >= 55) {
    return 60 - mins + 55;
  }
  return 55 - mins;
}

function isTournamentFinished(fixtures) {
  if (!fixtures?.fixtures) return false;
  const final = fixtures.fixtures.find(f => f.round === 'Final');
  return final && (final.isFinished || final.state === 'FINISHED');
}

async function update() {
  try {
    const [tournament, fixtures] = await Promise.all([
      fetch('/live/tournament').catch(() => null),
      fetch('/live/fixtures').catch(() => null),
    ]);

    const currentTournamentId = tournament?.tournamentId;

    // Detect new tournament started - reset everything
    if (lastTournamentId !== null && currentTournamentId !== lastTournamentId) {
      lastDataHash = '';
      waitingForNewTournament = false;
    }
    lastTournamentId = currentTournamentId;

    // Check if tournament just finished
    if (isTournamentFinished(fixtures) && !waitingForNewTournament) {
      waitingForNewTournament = true;
    }

    const currentHash = hashData(fixtures, tournament);
    const dataChanged = currentHash !== lastDataHash;

    // Force redraw if waiting for new tournament (to update countdown)
    if (dataChanged || waitingForNewTournament) {
      lastDataHash = currentHash;

      clearScreen();
      const table = buildTable(fixtures, tournament);
      console.log(table.join('\n'));
      console.log();

      if (waitingForNewTournament) {
        const mins = getMinutesToNext55();
        console.log(`${c.yellow}New tournament at :55 (${mins} min${mins !== 1 ? 's' : ''})${c.reset}`);
      }

      console.log(`${c.dim}Last updated: ${new Date().toLocaleTimeString()} | Press 'q' to quit${c.reset}`);
    }
  } catch (err) {
    clearScreen();
    console.log(`${c.red}Error: ${err.message}${c.reset}`);
    console.log(`${c.dim}Retrying...${c.reset}`);
  }
}

async function main() {
  // Setup keyboard input
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }

  process.stdin.on('keypress', (str, key) => {
    if (str === 'q' || str === 'Q' || (key && key.ctrl && key.name === 'c')) {
      clearScreen();
      console.log('Goodbye!');
      process.exit(0);
    }
  });

  // Initial fetch
  await update();

  // Poll every 2 seconds
  setInterval(update, 2000);
}

main();
