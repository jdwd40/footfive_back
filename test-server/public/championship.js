// Championship state
let championshipState = {
    isInitialized: false,
    currentRound: 0,
    totalRounds: 0,
    fixtures: [],
    results: [],
    currentView: 'welcome' // welcome, fixtures, results, final
};

// DOM elements
const welcomeScreen = document.getElementById('welcomeScreen');
const championshipContainer = document.getElementById('championshipContainer');
const startChampionshipBtn = document.getElementById('startChampionshipBtn');
const simulateRoundBtn = document.getElementById('simulateRoundBtn');
const nextRoundBtn = document.getElementById('nextRoundBtn');
const restartChampionshipBtn = document.getElementById('restartChampionshipBtn');
const alertContainer = document.getElementById('alertContainer');

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    checkChampionshipStatus();
});

// Setup event listeners
function setupEventListeners() {
    startChampionshipBtn.addEventListener('click', startChampionship);
    simulateRoundBtn.addEventListener('click', simulateRound);
    nextRoundBtn.addEventListener('click', advanceToNextRound);
    restartChampionshipBtn.addEventListener('click', resetChampionship);
}

// Check championship status on load
async function checkChampionshipStatus() {
    try {
        const response = await fetch('/api/championship/status');
        const data = await response.json();
        
        if (data.success && data.championship.isInitialized) {
            // Championship is in progress, restore state
            championshipState = {
                isInitialized: true,
                currentRound: data.championship.currentRound,
                totalRounds: data.championship.totalRounds,
                fixtures: data.championship.fixtures,
                results: data.championship.results,
                currentView: data.championship.isComplete ? 'final' : 'fixtures'
            };
            
            // Check if we need to show final or fixtures
            if (data.championship.isComplete && data.championship.results.length > 0) {
                const lastResult = data.championship.results[data.championship.results.length - 1];
                // Check if last result has winner (final was completed)
                if (lastResult && lastResult.winner) {
                    displayFinalWinner(lastResult, data.championship.results);
                } else {
                    // Championship complete but show current round fixtures
                    displayFixtures();
                }
            } else {
                // Show current round fixtures
                displayFixtures();
            }
        }
    } catch (error) {
        console.error('Error checking championship status:', error);
    }
}

// Fetch updated championship state from server
async function fetchUpdatedChampionshipState() {
    try {
        const response = await fetch('/api/championship/status');
        const data = await response.json();
        
        if (data.success) {
            // Update fixtures and other state
            championshipState.fixtures = data.championship.fixtures;
            championshipState.totalRounds = data.championship.totalRounds;
            championshipState.currentRound = data.championship.currentRound;
        }
    } catch (error) {
        console.error('Error fetching championship state:', error);
    }
}

// Start a new championship
async function startChampionship() {
    try {
        startChampionshipBtn.disabled = true;
        startChampionshipBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Initializing...';
        showAlert('Starting championship...', 'info');

        const response = await fetch('/api/championship/init', {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            championshipState.isInitialized = true;
            championshipState.currentRound = data.championship.currentRound;
            championshipState.totalRounds = data.championship.totalRounds;
            championshipState.fixtures = data.championship.fixtures;
            championshipState.results = [];
            championshipState.currentView = 'fixtures';

            // Show championship container
            welcomeScreen.style.display = 'none';
            championshipContainer.style.display = 'block';

            // Display first round fixtures
            displayFixtures();
            
            clearAlerts();
            showAlert(`Championship started with ${data.championship.teamCount} teams!`, 'success');
        } else {
            showAlert(`Error: ${data.error}`, 'danger');
        }
    } catch (error) {
        showAlert(`Failed to start championship: ${error.message}`, 'danger');
        console.error('Start championship error:', error);
    } finally {
        startChampionshipBtn.disabled = false;
        startChampionshipBtn.innerHTML = '<i class="bi bi-play-circle-fill"></i> Start Championship';
    }
}

// Display fixtures for the current round
function displayFixtures() {
    console.log('displayFixtures called - currentRound:', championshipState.currentRound, 'totalRounds:', championshipState.totalRounds);
    console.log('Fixtures array length:', championshipState.fixtures.length);
    
    const currentRoundFixtures = championshipState.fixtures[championshipState.currentRound];
    
    if (!currentRoundFixtures) {
        console.error('No fixtures found for round', championshipState.currentRound);
        showAlert('No fixtures available for this round', 'warning');
        return;
    }
    
    console.log('Current round has', currentRoundFixtures.length, 'matches');
    
    // Update round header
    const roundName = getRoundName(championshipState.currentRound, championshipState.totalRounds);
    document.getElementById('roundName').textContent = roundName;
    document.getElementById('currentRoundNum').textContent = championshipState.currentRound + 1;
    document.getElementById('totalRoundsNum').textContent = championshipState.totalRounds;

    // Display fixtures in bracket format
    const fixturesBracket = document.getElementById('fixturesBracket');
    fixturesBracket.innerHTML = '';

    const matchesContainer = document.createElement('div');
    matchesContainer.className = 'matches-grid';

    currentRoundFixtures.forEach((fixture, index) => {
        const matchCard = createMatchCard(fixture, index);
        matchesContainer.appendChild(matchCard);
    });

    fixturesBracket.appendChild(matchesContainer);

    // Show fixtures section, hide results
    document.getElementById('fixturesSection').style.display = 'block';
    document.getElementById('resultsSection').style.display = 'none';
    document.getElementById('finalSection').style.display = 'none';
}

// Create a match card for a fixture
function createMatchCard(fixture, index) {
    const card = document.createElement('div');
    card.className = 'match-card';
    
    if (fixture.team2 === null) {
        // Bye match
        card.innerHTML = `
            <div class="match-card-header">
                <span class="badge bg-secondary">Match ${index + 1}</span>
            </div>
            <div class="match-teams">
                <div class="team-name text-center">
                    <i class="bi bi-shield-fill text-primary"></i>
                    <strong>${fixture.team1.name}</strong>
                </div>
                <div class="vs-divider">
                    <span class="badge bg-warning">BYE</span>
                </div>
                <div class="team-name text-center text-muted">
                    (Advances automatically)
                </div>
            </div>
        `;
    } else {
        card.innerHTML = `
            <div class="match-card-header">
                <span class="badge bg-secondary">Match ${index + 1}</span>
            </div>
            <div class="match-teams">
                <div class="team-name">
                    <i class="bi bi-shield-fill text-primary"></i>
                    <strong>${fixture.team1.name}</strong>
                </div>
                <div class="vs-divider">
                    <span class="badge bg-dark">VS</span>
                </div>
                <div class="team-name">
                    <i class="bi bi-shield-fill text-danger"></i>
                    <strong>${fixture.team2.name}</strong>
                </div>
            </div>
        `;
    }

    return card;
}

// Simulate the current round
async function simulateRound() {
    try {
        simulateRoundBtn.disabled = true;
        simulateRoundBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Simulating...';
        showAlert('Simulating matches...', 'info');

        const response = await fetch('/api/championship/simulate-round', {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            // Update state with latest championship data
            championshipState.currentRound = data.championship.currentRound;
            championshipState.totalRounds = data.championship.totalRounds;
            championshipState.results.push(data.result);

            // Fetch updated fixtures from server
            await fetchUpdatedChampionshipState();

            // Display results
            displayResults(data.result);
            
            clearAlerts();
            showAlert('Round completed!', 'success');

            // Check if this was the final match
            if (data.championship.isFinal && data.result.winner) {
                // This was the final, show winner
                setTimeout(() => {
                    displayFinalWinner(data.result, championshipState.results);
                }, 1000);
            }
        } else {
            showAlert(`Error: ${data.error}`, 'danger');
        }
    } catch (error) {
        showAlert(`Failed to simulate round: ${error.message}`, 'danger');
        console.error('Simulate round error:', error);
    } finally {
        simulateRoundBtn.disabled = false;
        simulateRoundBtn.innerHTML = '<i class="bi bi-play-fill"></i> Simulate Round';
    }
}

// Display results for the completed round
function displayResults(result) {
    const resultsContainer = document.getElementById('resultsContainer');
    resultsContainer.innerHTML = '';

    const roundResults = result.roundResults;
    
    const resultsGrid = document.createElement('div');
    resultsGrid.className = 'results-grid';

    roundResults.forEach((match, index) => {
        const resultCard = createResultCard(match, index);
        resultsGrid.appendChild(resultCard);
    });

    resultsContainer.appendChild(resultsGrid);

    // Always show "Next Round" button (final will be handled separately)
    nextRoundBtn.innerHTML = '<i class="bi bi-arrow-right-circle-fill"></i> Next Round';

    // Show results section, hide fixtures
    document.getElementById('fixturesSection').style.display = 'none';
    document.getElementById('resultsSection').style.display = 'block';

    // Scroll to results
    document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Create a result card for a match
function createResultCard(match, index) {
    const card = document.createElement('div');
    card.className = 'result-card';

    const team1Name = match.matchMetadata.homeTeam;
    const team2Name = match.matchMetadata.awayTeam;
    const team1Score = match.score[team1Name];
    const team2Score = match.score[team2Name];

    // Check for extra time and penalties
    const hadExtraTime = match.highlights.some(h => 
        h.type === 'extraTimeStart' || h.type === 'extraTimeHalf' || h.type === 'extraTimeEnd'
    );
    const hadPenalties = match.highlights.some(h => h.type === 'penaltyShootout');

    // Determine winner
    let winnerClass1 = '';
    let winnerClass2 = '';
    let resultBadge = '';
    let winnerName = '';

    if (hadPenalties) {
        // Winner determined by penalties
        const team1PenScore = match.penaltyScore[team1Name];
        const team2PenScore = match.penaltyScore[team2Name];
        if (team1PenScore > team2PenScore) {
            winnerClass1 = 'winner';
            winnerName = team1Name;
        } else {
            winnerClass2 = 'winner';
            winnerName = team2Name;
        }
    } else {
        // Winner determined by regular/extra time score
        if (team1Score > team2Score) {
            winnerClass1 = 'winner';
            winnerName = team1Name;
        } else if (team2Score > team1Score) {
            winnerClass2 = 'winner';
            winnerName = team2Name;
        }
    }

    // Build match note showing how game was decided
    let matchNote = '';
    if (hadPenalties) {
        const team1PenScore = match.penaltyScore[team1Name];
        const team2PenScore = match.penaltyScore[team2Name];
        matchNote = `
            <div class="text-center mt-2">
                <small class="text-muted d-block">After Extra Time: ${team1Score}-${team2Score}</small>
                <small class="text-warning fw-bold">Won on Penalties: ${team1PenScore}-${team2PenScore}</small>
            </div>
        `;
    } else if (hadExtraTime) {
        matchNote = `
            <div class="text-center mt-2">
                <small class="text-info fw-bold">
                    <i class="bi bi-clock-history"></i> Decided in Extra Time
                </small>
            </div>
        `;
    }

    card.innerHTML = `
        <div class="result-card-header">
            <span class="badge bg-secondary">Match ${index + 1}</span>
        </div>
        <div class="result-teams">
            <div class="team-result ${winnerClass1}">
                <span class="team-name">${team1Name}</span>
                <span class="team-score">${team1Score}</span>
                ${winnerClass1 ? '<span class="badge bg-success">Winner</span>' : ''}
            </div>
            <div class="score-divider">-</div>
            <div class="team-result ${winnerClass2}">
                <span class="team-score">${team2Score}</span>
                <span class="team-name">${team2Name}</span>
                ${winnerClass2 ? '<span class="badge bg-success">Winner</span>' : ''}
            </div>
        </div>
        ${matchNote}
    `;

    return card;
}

// Advance to the next round
function advanceToNextRound() {
    console.log('advanceToNextRound called');
    console.log('Current state - Round:', championshipState.currentRound, 'Total:', championshipState.totalRounds);
    
    // Just show next round fixtures or scroll to them
    displayFixtures();
    document.getElementById('resultsSection').style.display = 'none';
    
    // Scroll to fixtures
    document.getElementById('fixturesSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Display the final winner
function displayFinalWinner(finalResult, allResults) {
    // Check if this is the full result object with winner property
    if (finalResult.winner && finalResult.runner) {
        const winner = finalResult.winner.name;
        const runnerUp = finalResult.runner.name;
        
        document.getElementById('winnerName').textContent = winner;
        document.getElementById('runnerUpName').textContent = runnerUp;

        // Get the final match from roundResults
        const finalMatch = finalResult.roundResults[0];
        const team1Name = finalMatch.matchMetadata.homeTeam;
        const team2Name = finalMatch.matchMetadata.awayTeam;
        const team1Score = finalMatch.score[team1Name];
        const team2Score = finalMatch.score[team2Name];

        // Check for extra time and penalties
        const hadExtraTime = finalMatch.highlights.some(h => 
            h.type === 'extraTimeStart' || h.type === 'extraTimeHalf' || h.type === 'extraTimeEnd'
        );
        const hadPenalties = finalMatch.highlights.some(h => h.type === 'penaltyShootout');

        // Display final match score with appropriate details
        let scoreDisplay = `<div class="final-score-details">`;
        scoreDisplay += `<h4 class="mb-2">Final Score: ${team1Name} ${team1Score} - ${team2Score} ${team2Name}</h4>`;
        
        if (hadPenalties) {
            const team1PenScore = finalMatch.penaltyScore[team1Name];
            const team2PenScore = finalMatch.penaltyScore[team2Name];
            scoreDisplay += `<p class="text-warning mb-1"><i class="bi bi-bullseye"></i> Won on Penalties: ${team1PenScore}-${team2PenScore}</p>`;
        } else if (hadExtraTime) {
            scoreDisplay += `<p class="text-info"><i class="bi bi-clock-history"></i> Decided in Extra Time</p>`;
        }
        
        scoreDisplay += `</div>`;
        document.getElementById('finalMatchScore').innerHTML = scoreDisplay;
    } else {
        // Fallback for old format
        const finalMatch = finalResult;
        const team1Name = finalMatch.matchMetadata.homeTeam;
        const team2Name = finalMatch.matchMetadata.awayTeam;
        const team1Score = finalMatch.score[team1Name];
        const team2Score = finalMatch.score[team2Name];

        // Check for extra time and penalties
        const hadExtraTime = finalMatch.highlights.some(h => 
            h.type === 'extraTimeStart' || h.type === 'extraTimeHalf' || h.type === 'extraTimeEnd'
        );
        const hadPenalties = finalMatch.highlights.some(h => h.type === 'penaltyShootout');

        let winner, runnerUp;
        if (hadPenalties) {
            const team1PenScore = finalMatch.penaltyScore[team1Name];
            const team2PenScore = finalMatch.penaltyScore[team2Name];
            winner = team1PenScore > team2PenScore ? team1Name : team2Name;
            runnerUp = team1PenScore > team2PenScore ? team2Name : team1Name;
        } else {
            winner = team1Score > team2Score ? team1Name : team2Name;
            runnerUp = team1Score > team2Score ? team2Name : team1Name;
        }

        document.getElementById('winnerName').textContent = winner;
        document.getElementById('runnerUpName').textContent = runnerUp;

        // Display final match score with appropriate details
        let scoreDisplay = `<div class="final-score-details">`;
        scoreDisplay += `<h4 class="mb-2">Final Score: ${team1Name} ${team1Score} - ${team2Score} ${team2Name}</h4>`;
        
        if (hadPenalties) {
            const team1PenScore = finalMatch.penaltyScore[team1Name];
            const team2PenScore = finalMatch.penaltyScore[team2Name];
            scoreDisplay += `<p class="text-warning mb-1"><i class="bi bi-bullseye"></i> Won on Penalties: ${team1PenScore}-${team2PenScore}</p>`;
        } else if (hadExtraTime) {
            scoreDisplay += `<p class="text-info"><i class="bi bi-clock-history"></i> Decided in Extra Time</p>`;
        }
        
        scoreDisplay += `</div>`;
        document.getElementById('finalMatchScore').innerHTML = scoreDisplay;
    }

    // Hide other sections, show final section
    document.getElementById('fixturesSection').style.display = 'none';
    document.getElementById('resultsSection').style.display = 'none';
    document.getElementById('finalSection').style.display = 'block';

    // Scroll to final section
    document.getElementById('finalSection').scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Add confetti effect
    celebrateWinner();
}

// Reset championship
async function resetChampionship() {
    try {
        restartChampionshipBtn.disabled = true;
        restartChampionshipBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Resetting...';

        const response = await fetch('/api/championship/reset', {
            method: 'POST'
        });

        const data = await response.json();

        if (data.success) {
            // Reset state
            championshipState = {
                isInitialized: false,
                currentRound: 0,
                totalRounds: 0,
                fixtures: [],
                results: [],
                currentView: 'welcome'
            };

            // Show welcome screen
            championshipContainer.style.display = 'none';
            welcomeScreen.style.display = 'block';

            clearAlerts();
            showAlert('Championship reset successfully!', 'success');

            // Scroll to top
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            showAlert(`Error: ${data.error}`, 'danger');
        }
    } catch (error) {
        showAlert(`Failed to reset championship: ${error.message}`, 'danger');
        console.error('Reset championship error:', error);
    } finally {
        restartChampionshipBtn.disabled = false;
        restartChampionshipBtn.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Restart Championship';
    }
}

// Get round name based on round index and total rounds
function getRoundName(roundIndex, totalRounds) {
    const roundsFromEnd = totalRounds - roundIndex;
    
    switch (roundsFromEnd) {
        case 1:
            return 'Final';
        case 2:
            return 'Semi-Finals';
        case 3:
            return 'Quarter-Finals';
        case 4:
            return 'Round of 16';
        default:
            return `Round ${roundIndex + 1}`;
    }
}

// Show alert message
function showAlert(message, type = 'info') {
    const alertId = `alert-${Date.now()}`;
    const alert = `
        <div id="${alertId}" class="alert alert-${type} alert-dismissible fade show" role="alert">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
    alertContainer.innerHTML = alert;

    // Auto-dismiss after 5 seconds for success/info
    if (type === 'success' || type === 'info') {
        setTimeout(() => {
            const alertElement = document.getElementById(alertId);
            if (alertElement) {
                const bsAlert = new bootstrap.Alert(alertElement);
                bsAlert.close();
            }
        }, 5000);
    }
}

// Clear all alerts
function clearAlerts() {
    alertContainer.innerHTML = '';
}

// Celebrate winner with simple animation
function celebrateWinner() {
    const winnerSection = document.getElementById('finalSection');
    winnerSection.classList.add('celebration');
    
    // Add animation class
    setTimeout(() => {
        winnerSection.classList.remove('celebration');
    }, 2000);
}

