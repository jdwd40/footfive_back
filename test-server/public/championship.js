// Championship state
let championshipState = {
    isInitialized: false,
    currentRound: 0,
    totalRounds: 0,
    fixtures: [],
    results: [],
    completedMatches: {}, // Track completed matches: { roundIndex: { matchIndex: result } }
    currentView: 'welcome' // welcome, fixtures, results, final
};

// Live match state
let liveMatchState = {
    isPlaying: false,
    matchIndex: null,
    highlightIndex: 0,
    timeouts: []
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
    setupModalEventListeners();
});

// Setup event listeners
function setupEventListeners() {
    startChampionshipBtn.addEventListener('click', startChampionship);
    simulateRoundBtn.addEventListener('click', simulateRound);
    nextRoundBtn.addEventListener('click', advanceToNextRound);
    restartChampionshipBtn.addEventListener('click', resetChampionship);
}

// Setup modal event listeners
function setupModalEventListeners() {
    // Set up explicit close button handlers
    const closeMatchModal = document.getElementById('closeMatchModal');
    const closeMatchModalBtn = document.getElementById('closeMatchModalBtn');
    
    // Only stop live match when user explicitly clicks close buttons
    closeMatchModal.addEventListener('click', function () {
        stopLiveMatch();
    });
    
    closeMatchModalBtn.addEventListener('click', function () {
        stopLiveMatch();
    });
    
    // Note: We don't listen to 'hidden.bs.modal' so the match continues playing
    // even if the modal is hidden (e.g., user navigates away, switches tabs, etc.)
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
                completedMatches: data.championship.completedMatches || {},
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
            championshipState.completedMatches = data.championship.completedMatches || {};
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
            championshipState.completedMatches = {};
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
    
    // Defensive checks
    if (!championshipState.fixtures || championshipState.fixtures.length === 0) {
        console.error('No fixtures available in championship state');
        showAlert('Championship not initialized', 'warning');
        return;
    }
    
    if (championshipState.currentRound < 0 || championshipState.currentRound >= championshipState.fixtures.length) {
        console.error('Invalid currentRound index:', championshipState.currentRound, 'Fixtures length:', championshipState.fixtures.length);
        showAlert('Invalid round state', 'warning');
        return;
    }
    
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
    
    // Update simulate button text based on completed matches
    updateSimulateButtonText();

    fixturesBracket.appendChild(matchesContainer);

    // Re-enable simulate button if not all matches are complete
    const completedInRound = championshipState.completedMatches[championshipState.currentRound] || {};
    const totalMatches = currentRoundFixtures.length;
    if (Object.keys(completedInRound).length < totalMatches) {
        simulateRoundBtn.disabled = false;
    }
    
    // Show fixtures section, hide results
    document.getElementById('fixturesSection').style.display = 'block';
    document.getElementById('resultsSection').style.display = 'none';
    document.getElementById('finalSection').style.display = 'none';
}

// Create a match card for a fixture
function createMatchCard(fixture, index) {
    const card = document.createElement('div');
    card.className = 'match-card';
    
    // Check if match is completed
    const isCompleted = championshipState.completedMatches[championshipState.currentRound] && 
                       championshipState.completedMatches[championshipState.currentRound][index];
    
    if (isCompleted) {
        card.classList.add('completed');
    }
    
    if (fixture.team2 === null) {
        // Bye match
        card.innerHTML = `
            <div class="match-card-header">
                <span class="badge ${isCompleted ? 'bg-success' : 'bg-secondary'}">Match ${index + 1} ${isCompleted ? '✓' : ''}</span>
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
                <span class="badge ${isCompleted ? 'bg-success' : 'bg-secondary'}">Match ${index + 1} ${isCompleted ? '✓' : ''}</span>
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
            <button class="btn btn-watch" onclick="watchMatch(${index})" ${isCompleted ? 'disabled' : ''}>
                <i class="bi bi-play-circle-fill"></i> ${isCompleted ? 'Match Completed' : 'Watch Game'}
            </button>
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

// Update simulate button text based on completed matches
function updateSimulateButtonText() {
    const currentRoundMatches = championshipState.fixtures[championshipState.currentRound] || [];
    const completedInRound = championshipState.completedMatches[championshipState.currentRound] || {};
    const completedCount = Object.keys(completedInRound).length;
    const totalCount = currentRoundMatches.length;
    
    if (completedCount === 0) {
        simulateRoundBtn.innerHTML = '<i class="bi bi-play-fill"></i> Simulate Round';
    } else if (completedCount < totalCount) {
        simulateRoundBtn.innerHTML = `<i class="bi bi-play-fill"></i> Simulate Remaining Matches (${totalCount - completedCount})`;
    } else {
        simulateRoundBtn.innerHTML = '<i class="bi bi-check-circle-fill"></i> All Matches Complete';
        simulateRoundBtn.disabled = true;
    }
}

// Watch a specific match
async function watchMatch(matchIndex) {
    try {
        liveMatchState.matchIndex = matchIndex;
        liveMatchState.isPlaying = true;
        liveMatchState.highlightIndex = 0;
        liveMatchState.timeouts = [];

        // Get match fixture
        const fixture = championshipState.fixtures[championshipState.currentRound][matchIndex];
        
        // Open modal
        const liveMatchModal = new bootstrap.Modal(document.getElementById('liveMatchModal'));
        liveMatchModal.show();
        
        // Initialize modal
        document.getElementById('liveTeam1Name').textContent = fixture.team1.name;
        document.getElementById('liveTeam2Name').textContent = fixture.team2.name;
        document.getElementById('liveTeam1Score').textContent = '0';
        document.getElementById('liveTeam2Score').textContent = '0';
        document.getElementById('liveMinute').textContent = "0'";
        document.getElementById('matchStatus').textContent = 'Simulating...';
        document.getElementById('matchStatus').className = 'badge bg-info';
        document.getElementById('highlightsFeed').innerHTML = '<div class="text-center text-muted py-4"><i class="bi bi-hourglass-split"></i> Starting match...</div>';
        
        // Disable close buttons during simulation
        document.getElementById('closeMatchModal').disabled = true;
        document.getElementById('closeMatchModalBtn').disabled = true;
        
        showAlert('Simulating match...', 'info');

        // Simulate the match
        const response = await fetch('/api/championship/simulate-match', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ matchIndex })
        });

        const data = await response.json();

        if (data.success) {
            clearAlerts();
            
            // Update completed matches in state
            if (!championshipState.completedMatches[championshipState.currentRound]) {
                championshipState.completedMatches[championshipState.currentRound] = {};
            }
            championshipState.completedMatches[championshipState.currentRound][matchIndex] = data.result;
            
            // Play the match live
            await playMatchLive(data.result, fixture);
            
            // Re-enable close buttons
            document.getElementById('closeMatchModal').disabled = false;
            document.getElementById('closeMatchModalBtn').disabled = false;
            
            // Check if championship is complete FIRST before updating display
            if (data.championshipComplete && data.championshipWinner) {
                // Update championship state BEFORE closing modal and showing winner
                championshipState.currentRound = data.championship.currentRound;
                championshipState.totalRounds = data.championship.totalRounds;
                
                // Close the modal
                const liveMatchModal = bootstrap.Modal.getInstance(document.getElementById('liveMatchModal'));
                if (liveMatchModal) {
                    liveMatchModal.hide();
                }
                
                // Build the result object in the expected format for displayFinalWinner
                const finalResult = {
                    winner: data.championshipWinner,
                    runner: data.championshipRunner,
                    roundResults: [data.result]
                };
                
                // Display the final winner screen
                setTimeout(() => {
                    displayFinalWinner(finalResult, championshipState.results);
                    clearAlerts();
                    showAlert('Championship complete!', 'success');
                }, 500);
            } else if (data.isRoundComplete) {
                // Round complete but not the final
                // Fetch updated state including new fixtures for next round
                await fetchUpdatedChampionshipState();
                
                // Refresh the fixtures display to show completed match
                displayFixtures();
                
                showAlert('All matches in this round are complete! You can advance to the next round.', 'success');
            } else {
                // Match complete but round not complete - refresh fixtures display
                displayFixtures();
            }
        } else {
            showAlert(`Error: ${data.error}`, 'danger');
            liveMatchModal.hide();
        }
    } catch (error) {
        showAlert(`Failed to watch match: ${error.message}`, 'danger');
        console.error('Watch match error:', error);
        const liveMatchModal = bootstrap.Modal.getInstance(document.getElementById('liveMatchModal'));
        if (liveMatchModal) {
            liveMatchModal.hide();
        }
    }
}

// Play match live with progressive highlights
async function playMatchLive(matchResult, fixture) {
    return new Promise((resolve) => {
        const highlights = matchResult.highlights;
        const team1Name = fixture.team1.name;
        const team2Name = fixture.team2.name;
        let currentScore = { [team1Name]: 0, [team2Name]: 0 };
        let penaltyScore = { [team1Name]: 0, [team2Name]: 0 };
        
        // Clear highlights feed
        document.getElementById('highlightsFeed').innerHTML = '';
        document.getElementById('matchStatus').textContent = 'First Half';
        document.getElementById('matchStatus').className = 'badge bg-success';
        
        // Separate regular highlights from penalty shootout
        const regularHighlights = [];
        const penaltyShootoutHighlights = [];
        
        highlights.forEach(highlight => {
            if (highlight.type === 'penaltyShootout') {
                penaltyShootoutHighlights.push(highlight);
            } else if (highlight.type !== 'halfTime' && highlight.type !== 'fullTime') {
                // Skip halfTime and fullTime highlights - we'll show them via showSpecialMessage instead
                regularHighlights.push(highlight);
            }
        });
        
        // Group regular highlights by minute
        const highlightsByMinute = {};
        regularHighlights.forEach(highlight => {
            const minute = highlight.minute;
            if (!highlightsByMinute[minute]) {
                highlightsByMinute[minute] = [];
            }
            highlightsByMinute[minute].push(highlight);
        });
        
        // Get all unique minutes in order
        const minutes = Object.keys(highlightsByMinute).map(Number).sort((a, b) => a - b);
        let currentMinuteIndex = 0;
        let totalElapsedTime = 0; // Track total elapsed time
        // Game clock is now updated when processing highlights
        
        // Check if match has extra time
        const hasExtraTime = regularHighlights.some(h => h.type === 'extraTimeStart');
        
        // Update game clock based on current minute
        function updateGameClock(minute) {
            if (minute <= 90) {
                document.getElementById('liveMinute').textContent = `${minute}'`;
            } else if (minute <= 120) {
                document.getElementById('liveMinute').textContent = `${minute}' (ET)`;
            } else {
                document.getElementById('liveMinute').textContent = "120' (Penalties)";
            }
        }
        
        // Play highlights minute by minute
        function playNextMinute() {
            if (!liveMatchState.isPlaying) {
                resolve();
                return;
            }
            
            if (currentMinuteIndex >= minutes.length) {
                // Regular time and extra time complete - check for penalty shootout
                if (penaltyShootoutHighlights.length > 0) {
                    playPenaltyShootout();
                } else {
                    // Match complete
                    document.getElementById('matchStatus').textContent = 'Match Complete';
                    document.getElementById('matchStatus').className = 'badge bg-secondary';
                    // Game clock updates are handled by highlight processing
                    resolve();
                }
                return;
            }
            
            const minute = minutes[currentMinuteIndex];
            const minuteHighlights = highlightsByMinute[minute];
            
            // Update game clock to show current minute
            updateGameClock(minute);
            
            let eventDelay = 500; // Start events 0.5 seconds into the minute
            
            // Display all highlights for this minute with staggered delays
            minuteHighlights.forEach((highlight, index) => {
                const timeout = setTimeout(() => {
                    if (!liveMatchState.isPlaying) return;
                    
                    addHighlightToFeed(highlight, team1Name, team2Name);
                    
                    // Update score if it's a goal OR a scored penalty
                    const isGoalScored = highlight.type === 'goal' || 
                                       (highlight.type === 'penalty' && 
                                        (highlight.description.includes('GOAL') || 
                                         highlight.description.includes('score')));
                    
                    if (isGoalScored) {
                        if (highlight.description.includes(team1Name)) {
                            currentScore[team1Name]++;
                            document.getElementById('liveTeam1Score').textContent = currentScore[team1Name];
                            document.getElementById('liveTeam1Score').classList.add('score-updated');
                            setTimeout(() => {
                                document.getElementById('liveTeam1Score').classList.remove('score-updated');
                            }, 500);
                        } else {
                            currentScore[team2Name]++;
                            document.getElementById('liveTeam2Score').textContent = currentScore[team2Name];
                            document.getElementById('liveTeam2Score').classList.add('score-updated');
                            setTimeout(() => {
                                document.getElementById('liveTeam2Score').classList.remove('score-updated');
                            }, 500);
                        }
                    }
                }, totalElapsedTime + eventDelay);
                liveMatchState.timeouts.push(timeout);
                
                // Add pause after goals and penalties
                if (highlight.type === 'goal' || highlight.type === 'penalty') {
                    eventDelay += 2000; // 2 second pause
                } else {
                    eventDelay += 2000; // 2 second between regular events in same minute
                }
            });
            
            // Ensure minimum time per minute
            if (eventDelay < 2500) {
                eventDelay = 2500; // Minimum 2.5 seconds per minute
            }
            
            currentMinuteIndex++;
            
            // Update status badge based on game phase
            if (minute === 46) {
                const secondHalfTimeout = setTimeout(() => {
                    if (!liveMatchState.isPlaying) return;
                    document.getElementById('matchStatus').textContent = 'Second Half';
                    document.getElementById('matchStatus').className = 'badge bg-success';
                }, totalElapsedTime);
                liveMatchState.timeouts.push(secondHalfTimeout);
            } else if (minute === 91 && hasExtraTime) {
                const extraTimeTimeout = setTimeout(() => {
                    if (!liveMatchState.isPlaying) return;
                    document.getElementById('matchStatus').textContent = 'Extra Time - First Half';
                    document.getElementById('matchStatus').className = 'badge bg-warning';
                }, totalElapsedTime);
                liveMatchState.timeouts.push(extraTimeTimeout);
            } else if (minute === 106 && hasExtraTime) {
                const extraTime2Timeout = setTimeout(() => {
                    if (!liveMatchState.isPlaying) return;
                    document.getElementById('matchStatus').textContent = 'Extra Time - Second Half';
                    document.getElementById('matchStatus').className = 'badge bg-warning';
                }, totalElapsedTime);
                liveMatchState.timeouts.push(extraTime2Timeout);
            }
            
            // Check for special pauses - only for actual game minutes, not penalty shootouts
            let additionalPause = 0;
            if (minute === 45 && minute <= 120) {
                // Half-time pause
                const halfTimeTimeout = setTimeout(() => {
                    if (!liveMatchState.isPlaying) return;
                    document.getElementById('matchStatus').textContent = 'Half Time';
                    document.getElementById('matchStatus').className = 'badge bg-info';
                    showSpecialMessage(`Half Time<br>${team1Name} ${currentScore[team1Name]} - ${currentScore[team2Name]} ${team2Name}`, 'bg-info');
                }, totalElapsedTime + eventDelay);
                liveMatchState.timeouts.push(halfTimeTimeout);
                additionalPause = 5000; // 5 second pause at half-time
            } else if (minute === 90 && hasExtraTime) {
                // Full-time pause before extra time
                const fullTimeTimeout = setTimeout(() => {
                    if (!liveMatchState.isPlaying) return;
                    document.getElementById('matchStatus').textContent = 'Full Time';
                    document.getElementById('matchStatus').className = 'badge bg-info';
                    showSpecialMessage(`Full Time - Going to Extra Time<br>${team1Name} ${currentScore[team1Name]} - ${currentScore[team2Name]} ${team2Name}`, 'bg-warning');
                }, totalElapsedTime + eventDelay);
                liveMatchState.timeouts.push(fullTimeTimeout);
                additionalPause = 5000; // 5 second pause at full-time
            } else if (minute === 90 && !hasExtraTime) {
                // Match ending at full time (no extra time)
                const fullTimeEndTimeout = setTimeout(() => {
                    if (!liveMatchState.isPlaying) return;
                    document.getElementById('matchStatus').textContent = 'Full Time';
                    document.getElementById('matchStatus').className = 'badge bg-info';
                }, totalElapsedTime + eventDelay);
                liveMatchState.timeouts.push(fullTimeEndTimeout);
            } else if (minute === 105 && hasExtraTime) {
                // Extra time half-time pause
                const etHalfTimeout = setTimeout(() => {
                    if (!liveMatchState.isPlaying) return;
                    document.getElementById('matchStatus').textContent = 'ET Half Time';
                    document.getElementById('matchStatus').className = 'badge bg-info';
                    showSpecialMessage(`Extra Time Half Time<br>${team1Name} ${currentScore[team1Name]} - ${currentScore[team2Name]} ${team2Name}`, 'bg-info');
                }, totalElapsedTime + eventDelay);
                liveMatchState.timeouts.push(etHalfTimeout);
                additionalPause = 3000; // 3 second pause at ET half-time
            } else if (minute === 120 && hasExtraTime) {
                // End of extra time
                const etEndTimeout = setTimeout(() => {
                    if (!liveMatchState.isPlaying) return;
                    document.getElementById('matchStatus').textContent = 'End of Extra Time';
                    document.getElementById('matchStatus').className = 'badge bg-info';
                }, totalElapsedTime + eventDelay);
                liveMatchState.timeouts.push(etEndTimeout);
            }
            
            // Total time for this minute
            const totalMinuteTime = eventDelay + additionalPause;
            totalElapsedTime += totalMinuteTime;
            
            // Schedule next minute
            const nextTimeout = setTimeout(playNextMinute, totalMinuteTime);
            liveMatchState.timeouts.push(nextTimeout);
        }
        
        // Play penalty shootout with special timing
        function playPenaltyShootout() {
            if (!liveMatchState.isPlaying) {
                resolve();
                return;
            }
            
            document.getElementById('matchStatus').textContent = 'Penalty Shootout';
            document.getElementById('matchStatus').className = 'badge bg-warning';
            document.getElementById('liveMinute').textContent = "120' (Penalties)";
            
            // Show penalty shootout starting message
            const startTimeout = setTimeout(() => {
                if (!liveMatchState.isPlaying) return;
                showSpecialMessage(
                    `Penalty Shootout<br>${team1Name} ${currentScore[team1Name]} - ${currentScore[team2Name]} ${team2Name}`,
                    'bg-warning'
                );
            }, totalElapsedTime);
            liveMatchState.timeouts.push(startTimeout);
            totalElapsedTime += 2000; // 2 second pause before first penalty
            
            let shootoutIndex = 0;
            let isSuddenDeath = false;
            
            function playNextPenalty() {
                if (!liveMatchState.isPlaying || shootoutIndex >= penaltyShootoutHighlights.length) {
                    // Shootout complete - show final message with penalty result
                    const timeout = setTimeout(() => {
                        if (!liveMatchState.isPlaying) return;
                        
                        // Show final result message
                        const winner = penaltyScore[team1Name] > penaltyScore[team2Name] ? team1Name : team2Name;
                        const winnerPenScore = Math.max(penaltyScore[team1Name], penaltyScore[team2Name]);
                        const loserPenScore = Math.min(penaltyScore[team1Name], penaltyScore[team2Name]);
                        
                        showSpecialMessage(
                            `Match Complete<br>${winner} wins ${winnerPenScore}-${loserPenScore} on penalties`,
                            'bg-secondary'
                        );
                        
                        document.getElementById('matchStatus').textContent = 'Match Complete';
                        document.getElementById('matchStatus').className = 'badge bg-secondary';
                        resolve();
                    }, totalElapsedTime);
                    liveMatchState.timeouts.push(timeout);
                    return;
                }
                
                const highlight = penaltyShootoutHighlights[shootoutIndex];
                
                // Check if this is sudden death announcement
                if (highlight.roundType === 'sudden_death_start') {
                    const suddenDeathTimeout = setTimeout(() => {
                        if (!liveMatchState.isPlaying) return;
                        showSpecialMessage(highlight.description, 'bg-danger');
                        document.getElementById('matchStatus').textContent = 'Sudden Death!';
                        document.getElementById('matchStatus').className = 'badge bg-danger';
                        isSuddenDeath = true;
                    }, totalElapsedTime);
                    liveMatchState.timeouts.push(suddenDeathTimeout);
                    totalElapsedTime += 3000; // 3 second pause for sudden death announcement
                    shootoutIndex++;
                    
                    const nextTimeout = setTimeout(playNextPenalty, 3000);
                    liveMatchState.timeouts.push(nextTimeout);
                    return;
                }
                
                // Check if this is a setup (stepping up) or outcome
                if (highlight.step === 'setup') {
                    // Show team stepping up
                    const setupTimeout = setTimeout(() => {
                        if (!liveMatchState.isPlaying) return;
                        addHighlightToFeed(highlight, team1Name, team2Name);
                    }, totalElapsedTime);
                    liveMatchState.timeouts.push(setupTimeout);
                    totalElapsedTime += 2000; // 2 second suspense
                    shootoutIndex++;
                    
                    const nextTimeout = setTimeout(playNextPenalty, 2000);
                    liveMatchState.timeouts.push(nextTimeout);
                    return;
                }
                
                // This is an outcome
                if (highlight.step === 'outcome') {
                    const outcomeTimeout = setTimeout(() => {
                        if (!liveMatchState.isPlaying) return;
                        
                        addHighlightToFeed(highlight, team1Name, team2Name);
                        
                        // Update penalty scores from highlight metadata
                        if (highlight.scoreAfter) {
                            penaltyScore[team1Name] = highlight.scoreAfter[team1Name] || 0;
                            penaltyScore[team2Name] = highlight.scoreAfter[team2Name] || 0;
                            
                            // Update display with bracketed penalty scores
                            document.getElementById('liveTeam1Score').textContent = 
                                `${currentScore[team1Name]}(${penaltyScore[team1Name]})`;
                            document.getElementById('liveTeam1Score').classList.add('score-updated');
                            setTimeout(() => {
                                document.getElementById('liveTeam1Score').classList.remove('score-updated');
                            }, 500);
                            
                            document.getElementById('liveTeam2Score').textContent = 
                                `${currentScore[team2Name]}(${penaltyScore[team2Name]})`;
                            document.getElementById('liveTeam2Score').classList.add('score-updated');
                            setTimeout(() => {
                                document.getElementById('liveTeam2Score').classList.remove('score-updated');
                            }, 500);
                        }
                    }, totalElapsedTime);
                    liveMatchState.timeouts.push(outcomeTimeout);
                    totalElapsedTime += 2000; // 2 second pause after outcome
                    shootoutIndex++;
                    
                    const nextTimeout = setTimeout(playNextPenalty, 2000);
                    liveMatchState.timeouts.push(nextTimeout);
                    return;
                }
                
                // Fallback for old format (shouldn't happen with new backend)
                const timeout = setTimeout(() => {
                    if (!liveMatchState.isPlaying) return;
                    addHighlightToFeed(highlight, team1Name, team2Name);
                }, totalElapsedTime);
                liveMatchState.timeouts.push(timeout);
                
                shootoutIndex++;
                totalElapsedTime += 1500;
                
                const nextTimeout = setTimeout(playNextPenalty, 1500);
                liveMatchState.timeouts.push(nextTimeout);
            }
            
            // Start penalty shootout
            playNextPenalty();
        }
        
        // Start playing
        playNextMinute();
    });
}

// Add highlight to feed
function addHighlightToFeed(highlight, team1Name, team2Name) {
    const feed = document.getElementById('highlightsFeed');
    const highlightItem = document.createElement('div');
    
    // Check if this is a penalty awarded message
    const isPenaltyAwarded = highlight.type === 'penalty' && 
                            (highlight.description.includes('awarded') || 
                             highlight.description.includes('PENALTY'));
    
    // Check if this is a penalty outcome (scored/saved/missed) - both regular and shootout
    const isPenaltyScored = (highlight.type === 'penalty' || highlight.type === 'penaltyShootout') && 
                           (highlight.description.includes('GOAL') || 
                            highlight.description.includes('score') ||
                            highlight.description.includes('convert'));
    
    const isPenaltySaved = (highlight.type === 'penalty' || highlight.type === 'penaltyShootout') && 
                          (highlight.description.includes('SAVED') || 
                           highlight.description.includes('save') ||
                           highlight.description.includes('denies') ||
                           highlight.description.includes('keeper') ||
                           highlight.description.includes('stops'));
    
    const isPenaltyMissed = (highlight.type === 'penalty' || highlight.type === 'penaltyShootout') && 
                           (highlight.description.includes('MISSED') || 
                            highlight.description.includes('miss') ||
                            highlight.description.includes('Wide') ||
                            highlight.description.includes('WIDE') ||
                            highlight.description.includes('Over') ||
                            highlight.description.includes('over the bar') ||
                            highlight.description.includes('blast'));
    
    // Check if this is a regular goal (not from penalty)
    const isRegularGoal = highlight.type === 'goal';
    
    // Check if this is a kick-off message
    const isKickOff = highlight.type === 'kickOff';
    
    // Determine highlight type class
    let typeClass = '';
    if (isRegularGoal || isPenaltyScored) {
        typeClass = 'goal';
    }
    else if (highlight.type === 'penalty' || highlight.type === 'penaltyShootout') typeClass = 'penalty';
    else if (highlight.type === 'shot') typeClass = 'shot';
    else if (highlight.type === 'blocked') typeClass = 'blocked';
    else if (highlight.type === 'pressure') typeClass = 'pressure';
    else if (highlight.type === 'kickOff') typeClass = 'kickoff';
    
    highlightItem.className = `highlight-item-live ${typeClass}`;
    
    // Special display for kick-off
    if (isKickOff) {
        highlightItem.classList.add('kickoff-announcement');
        highlightItem.innerHTML = `
            <div class="kickoff-announcement">
                <div class="kickoff-icon">⚽</div>
                <div class="kickoff-text">${highlight.description}</div>
            </div>
        `;
    }
    // Special display for penalty awarded
    if (isPenaltyAwarded) {
        highlightItem.classList.add('penalty-awarded');
        highlightItem.innerHTML = `
            <div class="penalty-announcement">
                <div class="penalty-icon">⚠️</div>
                <div class="penalty-text">${highlight.description}</div>
            </div>
        `;
    }
    // Special display for penalty scored
    else if (isPenaltyScored) {
        highlightItem.classList.add('goal-celebration');
        highlightItem.innerHTML = `
            <div class="goal-announcement">
                <div class="goal-icon">⚽</div>
                <div class="goal-text">${highlight.description}</div>
            </div>
        `;
    }
    // Special display for penalty saved
    else if (isPenaltySaved) {
        highlightItem.classList.add('penalty-saved');
        highlightItem.innerHTML = `
            <div class="penalty-outcome">
                <div class="penalty-outcome-icon">🧤</div>
                <div class="penalty-outcome-text">${highlight.description}</div>
            </div>
        `;
    }
    // Special display for penalty missed
    else if (isPenaltyMissed) {
        highlightItem.classList.add('penalty-missed');
        highlightItem.innerHTML = `
            <div class="penalty-outcome">
                <div class="penalty-outcome-icon">❌</div>
                <div class="penalty-outcome-text">${highlight.description}</div>
            </div>
        `;
    }
    // Special display for regular goals
    else if (isRegularGoal) {
        highlightItem.classList.add('goal-celebration');
        highlightItem.innerHTML = `
            <div class="goal-announcement">
                <div class="goal-icon">⚽</div>
                <div class="goal-text">${highlight.description}</div>
            </div>
        `;
    } 
    // Regular highlight display
    else {
        // Get appropriate icon for highlight type
        let icon = '';
        switch(highlight.type) {
            case 'blocked':
                icon = '🛡️';
                break;
            case 'shot':
                icon = '⭕';
                break;
            case 'pressure':
                icon = '⚡';
                break;
            case 'kickOff':
                icon = '⚽';
                break;
            default:
                icon = '📋';
        }
        
        highlightItem.innerHTML = `
            <div class="d-flex align-items-start">
                <span class="minute-badge">${highlight.minute}'</span>
                <span class="highlight-icon me-2">${icon}</span>
                <span class="highlight-text flex-fill">${highlight.description}</span>
            </div>
        `;
    }
    
    // Prepend to top instead of append to bottom
    feed.insertBefore(highlightItem, feed.firstChild);
}

// Show special message (half-time, full-time)
function showSpecialMessage(message, badgeClass) {
    const feed = document.getElementById('highlightsFeed');
    const messageItem = document.createElement('div');
    messageItem.className = `special-message ${badgeClass}`;
    messageItem.innerHTML = `
        <div class="special-message-content">
            ${message}
        </div>
    `;
    feed.insertBefore(messageItem, feed.firstChild);
}

// Stop live match
function stopLiveMatch() {
    liveMatchState.isPlaying = false;
    liveMatchState.timeouts.forEach(timeout => clearTimeout(timeout));
    liveMatchState.timeouts = [];
    
    // Game clock updates are handled by highlight processing
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
                completedMatches: {},
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

