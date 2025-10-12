// Global state
let teamsData = [];
let selectedTeam1 = null;
let selectedTeam2 = null;

// DOM elements
const team1Select = document.getElementById('team1Select');
const team2Select = document.getElementById('team2Select');
const loadTeamsBtn = document.getElementById('loadTeamsBtn');
const simulateBtn = document.getElementById('simulateBtn');
const ratingEditor = document.getElementById('ratingEditor');
const resultsSection = document.getElementById('resultsSection');
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
        extraTimeHalf: '<span class="badge bg-warning text-dark"><i class="bi bi-pause-circle"></i> Extra Time Half</span>',
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

