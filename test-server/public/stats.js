// State management
let allStats = [];
let currentSortColumn = 'jcups_won';
let currentSortDirection = 'desc';

// DOM Elements
const loadingState = document.getElementById('loadingState');
const statsContainer = document.getElementById('statsContainer');
const emptyState = document.getElementById('emptyState');
const statsTableBody = document.getElementById('statsTableBody');
const alertContainer = document.getElementById('alertContainer');
const refreshBtn = document.getElementById('refreshBtn');
const totalTeamsSpan = document.getElementById('totalTeams');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadStats();
    setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
    // Refresh button
    refreshBtn.addEventListener('click', () => {
        loadStats();
    });

    // Sortable column headers
    document.querySelectorAll('.sortable').forEach(header => {
        header.addEventListener('click', () => {
            const column = header.dataset.column;
            sortStats(column);
        });
        // Add cursor pointer style
        header.style.cursor = 'pointer';
    });
}

// Load statistics from API
async function loadStats() {
    try {
        showLoading();
        
        const response = await fetch('/api/stats');
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to load statistics');
        }

        allStats = data.stats;

        if (allStats.length === 0) {
            showEmptyState();
        } else {
            displayStats();
            updateSummaryCards();
            showStatsContainer();
        }

    } catch (error) {
        console.error('Error loading stats:', error);
        showAlert('Failed to load statistics: ' + error.message, 'danger');
        hideLoading();
    }
}

// Display statistics in table
function displayStats() {
    statsTableBody.innerHTML = '';

    allStats.forEach((team, index) => {
        const goalDifference = team.goals_for - team.goals_against;
        const goalDiffClass = goalDifference > 0 ? 'text-success' : goalDifference < 0 ? 'text-danger' : 'text-muted';
        
        const row = document.createElement('tr');
        
        // Highlight top performers
        let rowClass = '';
        if (index === 0 && team.jcups_won > 0) {
            rowClass = 'table-warning'; // Gold highlight for most championships
        }
        
        row.className = rowClass;
        row.innerHTML = `
            <td class="fw-bold">
                ${team.jcups_won > 0 ? '<i class="bi bi-trophy-fill text-warning me-1"></i>' : ''}
                ${team.name}
            </td>
            <td class="text-center">${team.wins}</td>
            <td class="text-center">${team.losses}</td>
            <td class="text-center">${team.goals_for}</td>
            <td class="text-center">${team.goals_against}</td>
            <td class="text-center ${goalDiffClass} fw-bold">${goalDifference > 0 ? '+' : ''}${goalDifference}</td>
            <td class="text-center">
                ${team.jcups_won > 0 ? `<span class="badge bg-warning text-dark">${team.jcups_won}</span>` : '<span class="text-muted">0</span>'}
            </td>
            <td class="text-center">
                ${team.runner_ups > 0 ? `<span class="badge bg-secondary">${team.runner_ups}</span>` : '<span class="text-muted">0</span>'}
            </td>
            <td class="text-center">
                ${team.highest_round_reached ? `<span class="badge bg-info">${team.highest_round_reached}</span>` : '<span class="text-muted">-</span>'}
            </td>
        `;
        
        statsTableBody.appendChild(row);
    });

    totalTeamsSpan.textContent = allStats.length;
}

// Sort statistics
function sortStats(column) {
    // Toggle sort direction if clicking the same column
    if (currentSortColumn === column) {
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortColumn = column;
        currentSortDirection = 'desc'; // Default to descending for new column
    }

    // Sort the data
    allStats.sort((a, b) => {
        let valueA, valueB;

        // Handle goal difference column (calculated field)
        if (column === 'goal_difference') {
            valueA = a.goals_for - a.goals_against;
            valueB = b.goals_for - b.goals_against;
        } else if (column === 'name') {
            // String comparison for name
            valueA = a[column] || '';
            valueB = b[column] || '';
            return currentSortDirection === 'asc' 
                ? valueA.localeCompare(valueB)
                : valueB.localeCompare(valueA);
        } else if (column === 'highest_round_reached') {
            // Custom sorting for round names
            const roundOrder = {
                'Winner': 1,
                'Runner-up': 2,
                'Semi-finals': 3,
                'Quarter-finals': 4,
                'Round of 16': 5,
                'Round of 32': 6
            };
            valueA = a[column] ? roundOrder[a[column]] || 999 : 999;
            valueB = b[column] ? roundOrder[b[column]] || 999 : 999;
        } else {
            // Numeric comparison
            valueA = a[column] || 0;
            valueB = b[column] || 0;
        }

        if (currentSortDirection === 'asc') {
            return valueA - valueB;
        } else {
            return valueB - valueA;
        }
    });

    displayStats();
    updateSortIndicators();
}

// Update sort indicators on column headers
function updateSortIndicators() {
    document.querySelectorAll('.sortable').forEach(header => {
        const icon = header.querySelector('i');
        if (header.dataset.column === currentSortColumn) {
            icon.className = currentSortDirection === 'asc' ? 'bi bi-arrow-up' : 'bi bi-arrow-down';
        } else {
            icon.className = 'bi bi-arrow-down-up';
        }
    });
}

// Update summary cards
function updateSummaryCards() {
    // Find team with most championships
    const topChampion = [...allStats].sort((a, b) => b.jcups_won - a.jcups_won)[0];
    if (topChampion && topChampion.jcups_won > 0) {
        document.getElementById('topChampionTeam').textContent = topChampion.name;
        document.getElementById('topChampionCount').textContent = topChampion.jcups_won;
    } else {
        document.getElementById('topChampionTeam').textContent = '-';
        document.getElementById('topChampionCount').textContent = '0';
    }

    // Find team with most wins
    const topWinning = [...allStats].sort((a, b) => b.wins - a.wins)[0];
    if (topWinning && topWinning.wins > 0) {
        document.getElementById('topWinningTeam').textContent = topWinning.name;
        document.getElementById('topWinningCount').textContent = topWinning.wins;
    } else {
        document.getElementById('topWinningTeam').textContent = '-';
        document.getElementById('topWinningCount').textContent = '0';
    }

    // Find team with most goals
    const topScoring = [...allStats].sort((a, b) => b.goals_for - a.goals_for)[0];
    if (topScoring && topScoring.goals_for > 0) {
        document.getElementById('topScoringTeam').textContent = topScoring.name;
        document.getElementById('topScoringCount').textContent = topScoring.goals_for;
    } else {
        document.getElementById('topScoringTeam').textContent = '-';
        document.getElementById('topScoringCount').textContent = '0';
    }
}

// UI State Management
function showLoading() {
    loadingState.style.display = 'block';
    statsContainer.style.display = 'none';
    emptyState.style.display = 'none';
}

function hideLoading() {
    loadingState.style.display = 'none';
}

function showStatsContainer() {
    loadingState.style.display = 'none';
    statsContainer.style.display = 'block';
    emptyState.style.display = 'none';
}

function showEmptyState() {
    loadingState.style.display = 'none';
    statsContainer.style.display = 'none';
    emptyState.style.display = 'block';
}

// Show alert message
function showAlert(message, type = 'info') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    alertContainer.appendChild(alertDiv);

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        alertDiv.remove();
    }, 5000);
}

