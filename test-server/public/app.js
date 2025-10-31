// Global state - Version 2.0 (Live Score Sync Fix)
let teamsData = [];
let selectedTeam1 = null;
let selectedTeam2 = null;

// Slow simulation state
let slowSimState = {
    isRunning: false,
    timeouts: [],
    currentScore: { team1: 0, team2: 0 },
    team1Name: '',
    team2Name: ''
};

// DOM elements
const team1Select = document.getElementById('team1Select');
const team2Select = document.getElementById('team2Select');
const loadTeamsBtn = document.getElementById('loadTeamsBtn');
const simulateBtn = document.getElementById('simulateBtn');
const simulateSlowBtn = document.getElementById('simulateSlowBtn');
const stopSlowBtn = document.getElementById('stopSlowBtn');
const ratingEditor = document.getElementById('ratingEditor');
const resultsSection = document.getElementById('resultsSection');
const liveFeedSection = document.getElementById('liveFeedSection');
const alertContainer = document.getElementById('alertContainer');

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    fetchTeams();
    setupEventListeners();
});

// Fetch teams from API
async function fetchTeams() {
    try {
        showAlert('Loading teams from database...', 'info');
        const response = await fetch('/api/teams');
        const data = await response.json();

        if (data.success) {
            teamsData = data.teams;
            populateTeamDropdowns(data.teams);
            clearAlerts();
        } else {
            showAlert(`Error: ${data.error}`, 'danger');
        }
    } catch (error) {
        showAlert(`Failed to fetch teams: ${error.message}`, 'danger');
        console.error('Fetch error:', error);
    }
}

// Populate dropdown menus with teams
function populateTeamDropdowns(teams) {
    const team1Options = teams.map(team => 
        `<option value="${team.id}">${team.name}</option>`
    ).join('');
    
    const team2Options = teams.map(team => 
        `<option value="${team.id}">${team.name}</option>`
    ).join('');

    team1Select.innerHTML = '<option value="">-- Select Home Team --</option>' + team1Options;
    team2Select.innerHTML = '<option value="">-- Select Away Team --</option>' + team2Options;
}

// Setup event listeners
function setupEventListeners() {
    team1Select.addEventListener('change', checkTeamSelection);
    team2Select.addEventListener('change', checkTeamSelection);
    loadTeamsBtn.addEventListener('click', loadTeamData);
    simulateBtn.addEventListener('click', simulateMatch);
    simulateSlowBtn.addEventListener('click', simulateMatchSlow);
    stopSlowBtn.addEventListener('click', stopSlowSimulation);
}

// Check if both teams are selected
function checkTeamSelection() {
    const team1Id = team1Select.value;
    const team2Id = team2Select.value;

    if (team1Id && team2Id) {
        if (team1Id === team2Id) {
            showAlert('Please select two different teams', 'warning');
            loadTeamsBtn.disabled = true;
        } else {
            loadTeamsBtn.disabled = false;
            clearAlerts();
        }
    } else {
        loadTeamsBtn.disabled = true;
    }
}

// Load selected team data into editor
function loadTeamData() {
    const team1Id = parseInt(team1Select.value);
    const team2Id = parseInt(team2Select.value);

    selectedTeam1 = teamsData.find(t => t.id === team1Id);
    selectedTeam2 = teamsData.find(t => t.id === team2Id);

    if (selectedTeam1 && selectedTeam2) {
        // Populate team 1 data
        document.getElementById('team1Name').textContent = selectedTeam1.name;
        document.getElementById('team1Attack').value = selectedTeam1.attackRating;
        document.getElementById('team1Defense').value = selectedTeam1.defenseRating;
        document.getElementById('team1Goalkeeper').value = selectedTeam1.goalkeeperRating;

        // Populate team 2 data
        document.getElementById('team2Name').textContent = selectedTeam2.name;
        document.getElementById('team2Attack').value = selectedTeam2.attackRating;
        document.getElementById('team2Defense').value = selectedTeam2.defenseRating;
        document.getElementById('team2Goalkeeper').value = selectedTeam2.goalkeeperRating;

        // Show rating editor
        ratingEditor.style.display = 'block';
        resultsSection.style.display = 'none';

        // Scroll to rating editor
        ratingEditor.scrollIntoView({ behavior: 'smooth', block: 'start' });

        showAlert('Teams loaded! Edit ratings if needed, then click Simulate Match.', 'success');
    }
}

// Simulate match
async function simulateMatch() {
    try {
        // Get current ratings from inputs
        const team1Data = {
            name: document.getElementById('team1Name').textContent,
            attackRating: parseInt(document.getElementById('team1Attack').value),
            defenseRating: parseInt(document.getElementById('team1Defense').value),
            goalkeeperRating: parseInt(document.getElementById('team1Goalkeeper').value)
        };

        const team2Data = {
            name: document.getElementById('team2Name').textContent,
            attackRating: parseInt(document.getElementById('team2Attack').value),
            defenseRating: parseInt(document.getElementById('team2Defense').value),
            goalkeeperRating: parseInt(document.getElementById('team2Goalkeeper').value)
        };

        // Disable button and show loading
        simulateBtn.disabled = true;
        simulateBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Simulating...';
        showAlert('Simulating match... This may take a moment.', 'info');

        // Send simulation request
        const response = await fetch('/api/simulate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ team1: team1Data, team2: team2Data })
        });

        const data = await response.json();

        if (data.success) {
            displayResults(data.result);
            clearAlerts();
            showAlert('Match simulation complete!', 'success');
            
            // Scroll to results
            setTimeout(() => {
                resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        } else {
            showAlert(`Simulation failed: ${data.error}`, 'danger');
        }

    } catch (error) {
        showAlert(`Simulation error: ${error.message}`, 'danger');
        console.error('Simulation error:', error);
    } finally {
        // Re-enable button
        simulateBtn.disabled = false;
        simulateBtn.innerHTML = '<i class="bi bi-play-circle-fill"></i> Simulate Match';
    }
}

// Display simulation results
function displayResults(result) {
    // Show results section
    resultsSection.style.display = 'block';

    // Display final score
    document.getElementById('scoreDisplay').textContent = result.finalResult;

    // Determine outcome
    const team1Score = result.score[result.metadata.team1];
    const team2Score = result.score[result.metadata.team2];
    let outcome = '';

    if (team1Score > team2Score) {
        outcome = `🏆 ${result.metadata.team1} wins!`;
        if (result.metadata.hadPenalties) {
            outcome += ' (on penalties)';
        } else if (result.metadata.hadExtraTime) {
            outcome += ' (in extra time)';
        }
    } else if (team2Score > team1Score) {
        outcome = `🏆 ${result.metadata.team2} wins!`;
        if (result.metadata.hadPenalties) {
            outcome += ' (on penalties)';
        } else if (result.metadata.hadExtraTime) {
            outcome += ' (in extra time)';
        }
    } else {
        outcome = 'Match ended in a draw';
    }

    document.getElementById('outcomeDisplay').textContent = outcome;

    // Display highlights by phase
    displayHighlights('regularTimeHighlights', result.regularTimeHighlights, 'regularCount');
    displayHighlights('extraTimeHighlights', result.extraTimeHighlights, 'extraCount');
    displayHighlights('penaltyHighlights', result.penaltyHighlights, 'penaltiesCount');
}

// Display highlights for a specific phase
function displayHighlights(containerId, highlights, countBadgeId) {
    const container = document.getElementById(containerId);
    const countBadge = document.getElementById(countBadgeId);

    // Update count badge
    countBadge.textContent = highlights.length;

    if (highlights.length === 0) {
        const phase = containerId.includes('regular') ? 'regular time' : 
                     containerId.includes('extra') ? 'extra time' : 'penalty shootout';
        container.innerHTML = `<p class="text-center text-muted">No ${phase} highlights</p>`;
        return;
    }

    // Create highlight list
    const highlightsList = highlights.map((highlight, index) => {
        const badge = getEventBadge(highlight.type);
        const minute = highlight.minute || '90';
        const score = highlight.score ? `${highlight.score.home}-${highlight.score.away}` : '';
        
        return `
            <div class="list-group-item highlight-item" data-index="${index}">
                <div class="d-flex justify-content-between align-items-start">
                    <div class="flex-grow-1">
                        <div class="mb-1">
                            <span class="badge bg-secondary minute-badge">${minute}'</span>
                            ${badge}
                            ${highlight.team ? `<span class="text-primary fw-bold">${highlight.team}</span>` : ''}
                        </div>
                        <p class="mb-1 highlight-description">${highlight.description}</p>
                        ${score ? `<small class="text-muted">Score: ${score}</small>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = `<div class="list-group">${highlightsList}</div>`;
}

// Get event badge HTML based on type
function getEventBadge(type) {
    const badges = {
        goal: '<span class="badge bg-success"><i class="bi bi-trophy-fill"></i> GOAL</span>',
        shot: '<span class="badge bg-info"><i class="bi bi-circle-fill"></i> Shot</span>',
        penalty: '<span class="badge bg-warning text-dark"><i class="bi bi-exclamation-triangle-fill"></i> Penalty</span>',
        halfTime: '<span class="badge bg-secondary"><i class="bi bi-pause-circle"></i> Half Time</span>',
        fullTime: '<span class="badge bg-dark"><i class="bi bi-stop-circle"></i> Full Time</span>',
        blocked: '<span class="badge bg-primary"><i class="bi bi-shield-fill"></i> Blocked</span>',
        penaltyShootout: '<span class="badge bg-danger"><i class="bi bi-bullseye"></i> Penalty Shootout</span>',
        pressure: '<span class="badge bg-warning"><i class="bi bi-lightning-fill"></i> Pressure</span>',
        extraTimeStart: '<span class="badge bg-warning text-dark"><i class="bi bi-play-circle"></i> Extra Time Start</span>',
        extraTimeHalf: '<span class="badge bg-warning text-dark"><i class="bi bi-pause-circle"></i> Extra Time Half</span>',
        extraTimeEnd: '<span class="badge bg-warning text-dark"><i class="bi bi-stop-circle"></i> Extra Time End</span>',
        kickOff: '<span class="badge bg-success"><i class="bi bi-flag-fill"></i> Kick-off</span>',
        // Legacy support for old naming
        extraTimeFull: '<span class="badge bg-warning text-dark"><i class="bi bi-stop-circle"></i> Extra Time End</span>'
    };

    return badges[type] || '<span class="badge bg-secondary">Event</span>';
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

// ============= SLOW SIMULATION FUNCTIONS =============

// Simulate match in slow mode
async function simulateMatchSlow() {
    try {
        // Get current ratings from inputs
        const team1Data = {
            name: document.getElementById('team1Name').textContent,
            attackRating: parseInt(document.getElementById('team1Attack').value),
            defenseRating: parseInt(document.getElementById('team1Defense').value),
            goalkeeperRating: parseInt(document.getElementById('team1Goalkeeper').value)
        };

        const team2Data = {
            name: document.getElementById('team2Name').textContent,
            attackRating: parseInt(document.getElementById('team2Attack').value),
            defenseRating: parseInt(document.getElementById('team2Defense').value),
            goalkeeperRating: parseInt(document.getElementById('team2Goalkeeper').value)
        };

        // Disable buttons
        simulateBtn.disabled = true;
        simulateSlowBtn.disabled = true;
        simulateSlowBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Loading...';
        
        // Initialize slow sim state
        slowSimState.isRunning = true;
        slowSimState.timeouts = [];
        slowSimState.currentScore = { team1: 0, team2: 0 };
        slowSimState.team1Name = team1Data.name;
        slowSimState.team2Name = team2Data.name;
        // Game clock is now updated when processing highlights

        // Send simulation request to get all highlights
        const response = await fetch('/api/simulate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ team1: team1Data, team2: team2Data })
        });

        const data = await response.json();

        if (data.success) {
            // Show live feed section
            liveFeedSection.style.display = 'block';
            resultsSection.style.display = 'none';
            
            // Initialize live feed
            initializeLiveFeed(team1Data.name, team2Data.name);
            
            // Clock will be updated when processing highlights
            
            // Scroll to live feed
            setTimeout(() => {
                liveFeedSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
            
            // Process highlights with timing
            processHighlightsWithTiming(data.result.highlights, data.result);
            
            clearAlerts();
        } else {
            showAlert(`Simulation failed: ${data.error}`, 'danger');
            stopSlowSimulation();
        }

    } catch (error) {
        showAlert(`Simulation error: ${error.message}`, 'danger');
        console.error('Simulation error:', error);
        stopSlowSimulation();
    } finally {
        // Re-enable simulate button
        simulateSlowBtn.innerHTML = '<i class="bi bi-stopwatch-fill"></i> Slow Simulate Match';
    }
}

// Initialize the live feed display
function initializeLiveFeed(team1Name, team2Name) {
    document.getElementById('liveTeam1Name').textContent = team1Name;
    document.getElementById('liveTeam2Name').textContent = team2Name;
    document.getElementById('liveScoreDisplay').textContent = '0 - 0';
    document.getElementById('liveMinuteDisplay').textContent = 'Kick-off';
    document.getElementById('liveFeed').innerHTML = '';
}


// Calculate timing delta between two events in milliseconds
function calculateTimingDelta(previousEvent, currentEvent) {
    const prevTime = previousEvent?.clock?.gameTime ?? previousEvent?.minute ?? 0;
    const currTime = currentEvent?.clock?.gameTime ?? currentEvent?.minute ?? 0;
    const deltaMinutes = currTime - prevTime;
    
    // Convert to milliseconds (base rate: 1.5s per game minute = 1500ms)
    return Math.max(0, deltaMinutes * 1500);
}

// Process highlights with proper timing (FIXED VERSION)
function processHighlightsWithTiming(highlights, fullResult) {
    console.log('FIXED SYSTEM: processHighlightsWithTiming called with', highlights.length, 'highlights');
    
    // Sort highlights by gameTime (if available) or minute
    highlights.sort((a, b) => {
        const timeA = a.clock?.gameTime ?? a.minute ?? 0;
        const timeB = b.clock?.gameTime ?? b.minute ?? 0;
        return timeA - timeB;
    });
    
    let cumulativeDelay = 0;
    let previousHighlight = null;
    
    highlights.forEach((highlight, index) => {
        // Calculate delay based on gameTime delta
        const delay = previousHighlight 
            ? calculateTimingDelta(previousHighlight, highlight)
            : 500; // Initial delay for first highlight
        
        cumulativeDelay += delay;
        
        // Determine pause after highlight (for goals and penalties)
        const pauseAfterMs = (highlight.type === 'goal' || highlight.type === 'penalty') 
            ? 2000 
            : (highlight.timing?.pauseAfterMs ?? 0);
        
        // Schedule highlight with synchronized clock update
        scheduleHighlightDisplay(highlight, cumulativeDelay);
        
        cumulativeDelay += pauseAfterMs;
        previousHighlight = highlight;
    });
    
    // Schedule final results display
    const finalTimeout = setTimeout(() => {
        if (slowSimState.isRunning) {
            displayFinalResults(fullResult);
        }
    }, cumulativeDelay + 2000);
    
    slowSimState.timeouts.push(finalTimeout);
}

// Schedule a highlight to be displayed after a delay with synchronized clock update
function scheduleHighlightDisplay(highlight, delay) {
    const timeoutId = setTimeout(() => {
        if (slowSimState.isRunning) {
            // Update clock and display highlight simultaneously
            if (highlight.clock?.minute !== undefined) {
                const second = highlight.clock.second || 0;
                updateGameClock(highlight.clock.minute, second);
            } else {
                // Fallback for backward compatibility
                updateGameClock(highlight.minute || 90, null);
            }
            displayLiveFeedHighlight(highlight);
        }
    }, delay);
    
    slowSimState.timeouts.push(timeoutId);
}

// Update game clock based on current minute (and optionally second)
function updateGameClock(minute, second = null) {
    let clockDisplay;
    
    if (second !== null && second !== undefined) {
        // Format with sub-minute precision: MM:SS
        const secondStr = second.toString().padStart(2, '0');
        if (minute <= 90) {
            clockDisplay = `${minute}:${secondStr}'`;
        } else if (minute <= 120) {
            clockDisplay = `${minute}:${secondStr}' (ET)`;
        } else {
            clockDisplay = "120' (Penalties)";
        }
    } else {
        // Fallback to minute-only format
        if (minute <= 90) {
            clockDisplay = `${minute}'`;
        } else if (minute <= 120) {
            clockDisplay = `${minute}' (ET)`;
        } else {
            clockDisplay = "120' (Penalties)";
        }
    }
    
    document.getElementById('liveMinuteDisplay').textContent = clockDisplay;
}

// Display a single highlight in the live feed
function displayLiveFeedHighlight(highlight) {
    const liveFeed = document.getElementById('liveFeed');
    const badge = getEventBadge(highlight.type);
    const minute = highlight.minute || '90';
    
    // Format minute display
    let minuteText = `${minute}'`;
    if (minute > 90 && minute <= 120) {
        minuteText = `${minute - 90}' (ET)`;
    } else if (minute > 120) {
        minuteText = "120' (Penalties)";
    }
    
    // Update score if it's a goal
    if (highlight.type === 'goal' || (highlight.type === 'penalty' && highlight.description.toLowerCase().includes('goal'))) {
        updateLiveScore(highlight);
    }
    
    // Check if this is a kick-off message
    const isKickOff = highlight.type === 'kickOff';
    
    // Create highlight element
    const highlightElement = document.createElement('div');
    highlightElement.className = 'live-feed-item';
    
    // Special display for kick-off
    if (isKickOff) {
        highlightElement.classList.add('kickoff-announcement');
        highlightElement.innerHTML = `
            <div class="kickoff-announcement">
                <div class="kickoff-icon">⚽</div>
                <div class="kickoff-text">${highlight.description}</div>
            </div>
        `;
    } else {
        highlightElement.innerHTML = `
            <div class="d-flex align-items-start p-3 border-bottom">
                <div class="minute-indicator me-3">
                    <span class="badge bg-dark">${minuteText}</span>
                </div>
                <div class="flex-grow-1">
                    <div class="mb-1">
                        ${badge}
                        ${highlight.team ? `<span class="text-primary fw-bold">${highlight.team}</span>` : ''}
                    </div>
                    <p class="mb-0 highlight-text">${highlight.description}</p>
                </div>
            </div>
        `;
    }
    
    // Add animation class
    highlightElement.style.opacity = '0';
    highlightElement.style.transform = 'translateY(-20px)';
    
    // Insert at the top (newest first)
    liveFeed.insertBefore(highlightElement, liveFeed.firstChild);
    
    // Trigger animation
    setTimeout(() => {
        highlightElement.style.transition = 'all 0.4s ease-out';
        highlightElement.style.opacity = '1';
        highlightElement.style.transform = 'translateY(0)';
    }, 10);
}

// Update the live score display
function updateLiveScore(highlight) {
    // Extract score from highlight
    if (highlight.score) {
        const homeScore = highlight.score.home;
        const awayScore = highlight.score.away;
        document.getElementById('liveScoreDisplay').textContent = `${homeScore} - ${awayScore}`;
        slowSimState.currentScore = { team1: homeScore, team2: awayScore };
    }
}

// Display final results after slow simulation completes
function displayFinalResults(result) {
    showAlert('Match complete!', 'success');
    
    // Display in regular results section
    displayResults(result);
    
    // Show a completion message in live feed
    const liveFeed = document.getElementById('liveFeed');
    const completionElement = document.createElement('div');
    completionElement.className = 'live-feed-item bg-success text-white';
    completionElement.innerHTML = `
        <div class="text-center p-4">
            <h4><i class="bi bi-check-circle-fill"></i> Match Complete</h4>
            <p class="mb-0">Scroll down to see full match results</p>
        </div>
    `;
    liveFeed.insertBefore(completionElement, liveFeed.firstChild);
    
    // Reset state
    slowSimState.isRunning = false;
    simulateBtn.disabled = false;
    simulateSlowBtn.disabled = false;
    
    // Scroll to results after a moment
    setTimeout(() => {
        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 2000);
}

// Stop slow simulation
function stopSlowSimulation() {
    // Clear all pending timeouts
    slowSimState.timeouts.forEach(timeoutId => clearTimeout(timeoutId));
    slowSimState.timeouts = [];
    slowSimState.isRunning = false;
    
    // Re-enable buttons
    simulateBtn.disabled = false;
    simulateSlowBtn.disabled = false;
    simulateSlowBtn.innerHTML = '<i class="bi bi-stopwatch-fill"></i> Slow Simulate Match';
    
    // Hide live feed
    liveFeedSection.style.display = 'none';
    
    showAlert('Slow simulation stopped', 'info');
}

