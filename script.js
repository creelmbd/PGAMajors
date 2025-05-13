/**
 * PGA Tournament Draft Board
 * Enhanced version with tournament selection and dynamic player data
 */

// Main application state
const app = {
  tournaments: {
    current: null,
    list: [
      { id: "pga-championship-2025", name: "PGA Championship 2025", venue: "Quail Hollow" },
      { id: "us-open-2025", name: "US Open 2025", venue: "Oakmont Country Club" },
      { id: "open-championship-2025", name: "The Open Championship 2025", venue: "Royal Portrush" },
      { id: "masters-2026", name: "The Masters 2026", venue: "Augusta National" }
    ]
  },
  players: [],
  participants: [],
  ui: {
    editMode: false,
    selectedPlayerId: null,
    loading: false
  },
  api: {
    baseUrl: "https://api.sportsdata.io/golf/v2/json",
    apiKey: "", // You would set this in the UI
    endpoints: {
      leaderboard: "/Leaderboard/{tournamentId}",
      playersByTournament: "/PlayersByTournament/{tournamentId}",
      tournamentList: "/Tournaments/{season}"
    }
  }
};

// Event handler setup
$(document).ready(function() {
  // Set up tournament selector
  setupTournamentSelector();

  // Set up event listeners
  setupEventListeners();

  // Load saved data if available
  loadFromLocalStorage();

  // Check if we need to fetch default tournament data
  checkAndLoadCurrentTournament();

  // Apply responsive grid initially
  applyResponsiveGrid();

  // Set up dropdown toggle functionality
  setupDropdownToggle();

  // Initial render of draft stats
  renderDraftStats();
});

// Initialize the tournament selector dropdown
function setupTournamentSelector() {
  const selector = $("#tournamentSelector");
  selector.empty();

  // Add default option
  selector.append(`<option value="">-- Select Tournament --</option>`);

  // Add tournament options
  app.tournaments.list.forEach(tournament => {
    selector.append(`<option value="${tournament.id}">${tournament.name} at ${tournament.venue}</option>`);
  });

  // Add custom tournament option
  selector.append(`<option value="custom">Custom Tournament...</option>`);
}

// Set up all event listeners
function setupEventListeners() {
  // Tournament selection
  $("#tournamentSelector").change(handleTournamentChange);
  $("#customTournamentForm").submit(handleCustomTournamentSubmit);

  // API Key management
  $("#apiKeyForm").submit(handleApiKeySubmit);
  $("#showApiKeyForm").click(() => $("#apiKeyPanel").toggleClass("hidden"));

  // Player management
  $("#toggleEditMode").click(toggleEditMode);
  $("#saveChanges").click(saveChanges);
  $("#resetDraft").click(resetDraft);
  $("#playerSearch").on("keyup", filterPlayers); // This was missing - implementation added below
  $("#sortBy").change(renderPlayers);
  $("#filterBy").change(renderPlayers);
  $("#manualPlayerForm").submit(handleManualPlayerSubmit);

  // Manual player form button
  $("#manualPlayerAdd").click(showManualPlayerForm);

  // Participant management
  $("#toggleParticipants").click(toggleParticipantsForm);
  $("#addParticipant").click(addParticipant);
  $("#confirmSelection").click(confirmSelection);
  $("#cancelSelection").click(hideParticipantModal);

  // Export/Import
  $("#exportCSV").click(exportToCSV);
  $("#importCSV").change(function(e) {
    if (e.target.files.length > 0) {
      importFromCSV(e.target.files[0]);
      e.target.value = ''; // Reset file input
    }
  });

  // Toggle statistics view
  $("#toggleStats").click(function() {
    const statsDiv = $("#draftStats");
    const toggleBtn = $("#toggleStats");

    if (statsDiv.hasClass("hidden")) {
      statsDiv.removeClass("hidden");
      toggleBtn.text("Hide Stats");
    } else {
      statsDiv.addClass("hidden");
      toggleBtn.text("Show Stats");
    }
  });

  // Refresh data
  $("#refreshData").click(fetchTournamentPlayers);
}

// Missing function implementation: Filter players based on search input
function filterPlayers() {
  renderPlayers(); // Call renderPlayers which will use the search input value
}

// Handler for tournament selector changes
function handleTournamentChange() {
  const selectedId = $("#tournamentSelector").val();

  if (selectedId === "custom") {
    $("#customTournamentPanel").removeClass("hidden");
    return;
  }

  if (!selectedId) return;

  // Find the selected tournament
  const selectedTournament = app.tournaments.list.find(t => t.id === selectedId);
  if (!selectedTournament) return;

  // Set current tournament
  app.tournaments.current = selectedTournament;

  // Update UI
  $("#currentTournament").text(selectedTournament.name);
  $("#currentVenue").text(selectedTournament.venue);

  // Fetch player data
  fetchTournamentPlayers();

  // Save current tournament to local storage
  localStorage.setItem("pgaDraftCurrentTournament", JSON.stringify(selectedTournament));
}

// Handle custom tournament creation
function handleCustomTournamentSubmit(e) {
  e.preventDefault();

  const name = $("#customTournamentName").val().trim();
  const venue = $("#customTournamentVenue").val().trim();
  const year = $("#customTournamentYear").val().trim();

  if (!name || !venue || !year) {
    alert("Please fill out all tournament details");
    return;
  }

  // Create tournament ID (slug)
  const id = `${name.toLowerCase().replace(/\s+/g, '-')}-${year}`;

  // Check if tournament already exists
  if (app.tournaments.list.some(t => t.id === id)) {
    alert("This tournament already exists. Please select it from the dropdown.");
    return;
  }

  // Add to tournament list
  const newTournament = { id, name: `${name} ${year}`, venue };
  app.tournaments.list.push(newTournament);

  // Update tournament selector
  setupTournamentSelector();

  // Select the new tournament
  $("#tournamentSelector").val(id);

  // Set as current tournament
  app.tournaments.current = newTournament;

  // Update UI
  $("#currentTournament").text(newTournament.name);
  $("#currentVenue").text(newTournament.venue);

  // Hide custom tournament form
  $("#customTournamentPanel").addClass("hidden");

  // Clear form
  $("#customTournamentForm")[0].reset();

  // Save tournaments list to local storage
  localStorage.setItem("pgaDraftTournaments", JSON.stringify(app.tournaments.list));
  localStorage.setItem("pgaDraftCurrentTournament", JSON.stringify(newTournament));

  // Show manual player form since we might not have API data for custom tournament
  showManualPlayerForm();
}

// Handle API key submission
function handleApiKeySubmit(e) {
  e.preventDefault();

  const apiKey = $("#apiKey").val().trim();
  if (!apiKey) {
    alert("Please enter an API key");
    return;
  }

  // Save API key
  app.api.apiKey = apiKey;
  localStorage.setItem("pgaDraftApiKey", apiKey);

  // Hide API key panel
  $("#apiKeyPanel").addClass("hidden");

  // Refetch data if we have a tournament selected
  if (app.tournaments.current) {
    fetchTournamentPlayers();
  }

  // Show success message
  showNotification("API key saved successfully", "success");
}

// Fetch player data for the current tournament
function fetchTournamentPlayers() {
  if (!app.tournaments.current) {
    showNotification("Please select a tournament first", "error");
    return;
  }

  // Use the API or fallback to demo data
  if (app.api.apiKey) {
    fetchPlayersFromApi();
  } else {
    fetchDemoPlayers();
  }
}

// Fetch players from API
// In script.js, modify the fetchPlayersFromApi function
// Replace the incomplete fetchPlayersFromApi function with this complete implementation
function fetchPlayersFromApi() {
  app.ui.loading = true;
  updateLoadingUI(true);

  const tournamentId = app.tournaments.current.id;
  const apiUrl = `${app.api.baseUrl}${app.api.endpoints.playersByTournament.replace('{tournamentId}', tournamentId)}?key=${app.api.apiKey}`;

  // Show loading notification
  showNotification(`Loading players for ${app.tournaments.current.name}...`, "info");

  // Make the fetch request
  fetch(apiUrl)
    .then(response => {
      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      if (Array.isArray(data) && data.length > 0) {
        processPlayerData(data);
      } else {
        throw new Error("No player data returned from API");
      }
    })
    .catch(error => {
      console.error("Error fetching players from API:", error);
      showNotification("Could not load data from API, using demo data instead", "warning");
      // Fall back to demo data if API fails
      fetchDemoPlayers();
    })
    .finally(() => {
      app.ui.loading = false;
      updateLoadingUI(false);
    });
}

// Also improve the updateLoadingUI function to be more robust
function updateLoadingUI(isLoading) {
  if (isLoading) {
    $("#loadingIndicator").removeClass("hidden");
    $("#playerGrid").addClass("opacity-50");
  } else {
    setTimeout(() => {
      $("#loadingIndicator").addClass("hidden");
      $("#playerGrid").removeClass("opacity-50");
    }, 500); // Small delay to ensure UI updates smoothly
  }
}

// Fetch demo players when API is not available
function fetchDemoPlayers() {
  app.ui.loading = true;
  updateLoadingUI(true);

  // Simulate API delay
  setTimeout(() => {
    // Generate player data based on tournament
    const tournamentName = app.tournaments.current.name;
    app.players = generateDemoPlayers(tournamentName);

    // Update the UI
    renderPlayers();
    updateDraftStatus();

    app.ui.loading = false;
    updateLoadingUI(false);

    showNotification(`${app.players.length} players loaded for ${tournamentName}`, "success");
  }, 1000);
}

// Process player data from API
function processPlayerData(data) {
  // Transform API data to our player format
  app.players = data.map((player, index) => ({
    id: player.PlayerId || index + 1,
    name: `${player.FirstName} ${player.LastName}`,
    rank: player.WorldGolfRank || index + 1,
    odds: player.Odds || generateFakeOdds(index + 1),
    nationality: player.Country || "USA",
    info: player.Bio || `Professional golfer competing in ${app.tournaments.current.name}`
  }));

  // Sort players by rank
  app.players.sort((a, b) => a.rank - b.rank);

  // Update the UI
  renderPlayers();
  updateDraftStatus();

  showNotification(`${app.players.length} players loaded for ${app.tournaments.current.name}`, "success");
}

// Generate fake odds for demo data
function generateFakeOdds(rank) {
  if (rank <= 5) return `+${Math.floor(Math.random() * 600) + 400}`;
  if (rank <= 15) return `+${Math.floor(Math.random() * 1500) + 1000}`;
  if (rank <= 30) return `+${Math.floor(Math.random() * 4000) + 2000}`;
  return `+${Math.floor(Math.random() * 10000) + 5000}`;
}

// Generate demo players for development
function generateDemoPlayers(tournamentName) {
  // Base list of top golfers
  const topGolfers = [
    {name: "Rory McIlroy", nationality: "NIR", info: "4-time major winner"},
    {name: "Scottie Scheffler", nationality: "USA", info: "2024 Masters champion"},
    {name: "Bryson DeChambeau", nationality: "USA", info: "Power player, 2024 U.S. Open champion"},
    {name: "Ludvig Åberg", nationality: "SWE", info: "Rising star, strong at major championships"},
    {name: "Xander Schauffele", nationality: "USA", info: "Olympic gold medalist, consistent performer"},
    {name: "Collin Morikawa", nationality: "USA", info: "2-time major champion, elite iron player"},
    {name: "Justin Thomas", nationality: "USA", info: "2-time PGA Champion, aggressive player"},
    {name: "Viktor Hovland", nationality: "NOR", info: "European star with multiple PGA Tour wins"},
    {name: "Brooks Koepka", nationality: "USA", info: "5-time major champion, big game player"},
    {name: "Jon Rahm", nationality: "ESP", info: "Major champion, former world #1"},
    {name: "Hideki Matsuyama", nationality: "JPN", info: "Masters champion, icon in Japanese golf"},
    {name: "Jordan Spieth", nationality: "USA", info: "3-time major champion, creative shotmaker"},
    {name: "Tommy Fleetwood", nationality: "ENG", info: "European Tour star seeking first major"},
    {name: "Patrick Cantlay", nationality: "USA", info: "FedEx Cup champion, methodical player"},
    {name: "Shane Lowry", nationality: "IRL", info: "Open Championship winner, excellent in wind"},
    {name: "Max Homa", nationality: "USA", info: "Multiple PGA Tour winner, popular personality"},
    {name: "Tony Finau", nationality: "USA", info: "Long hitter with multiple wins"},
    {name: "Cameron Smith", nationality: "AUS", info: "Open champion, elite short game"},
    {name: "Sungjae Im", nationality: "KOR", info: "Consistent performer, iron play specialist"},
    {name: "Will Zalatoris", nationality: "USA", info: "Runner-up in multiple majors"}
  ];

  // Generate 40-50 players
  const playerCount = Math.floor(Math.random() * 10) + 40;
  const players = [];

  // Add top golfers first
  for (let i = 0; i < Math.min(topGolfers.length, playerCount); i++) {
    players.push({
      id: i + 1,
      name: topGolfers[i].name,
      rank: i + 1,
      odds: generateFakeOdds(i + 1),
      nationality: topGolfers[i].nationality,
      info: topGolfers[i].info + `. Competing in ${tournamentName}.`
    });
  }

  // Fill the rest if needed
  for (let i = topGolfers.length; i < playerCount; i++) {
    const firstName = ["James", "Robert", "John", "Michael", "David", "Richard", "Thomas", "Charles", "Daniel", "Matthew", "Christopher", "Andrew", "Joseph", "Edward", "Brian", "Kevin", "Steven", "Ronald", "Anthony", "Jason"][Math.floor(Math.random() * 20)];
    const lastName = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Martinez", "Wilson", "Anderson", "Taylor", "Thomas", "Moore", "Martin", "Jackson", "Thompson", "White", "Lopez", "Lee"][Math.floor(Math.random() * 20)];

    const countries = ["USA", "USA", "USA", "ENG", "AUS", "RSA", "CAN", "ESP", "GER", "FRA", "ITA", "KOR", "JPN", "CHN", "MEX", "ARG", "SWE", "FIN", "DEN", "BEL"];

    players.push({
      id: i + 1,
      name: `${firstName} ${lastName}`,
      rank: i + 1,
      odds: generateFakeOdds(i + 1),
      nationality: countries[Math.floor(Math.random() * countries.length)],
      info: `Professional golfer competing in ${tournamentName}.`
    });
  }

  return players;
}

// Show manual player form for custom tournaments
function showManualPlayerForm() {
  $("#manualPlayerPanel").toggleClass("hidden");
}

// Handle manual player submission
function handleManualPlayerSubmit(e) {
  e.preventDefault();

  const name = $("#manualPlayerName").val().trim();
  const nationality = $("#manualPlayerNationality").val().trim();
  const odds = $("#manualPlayerOdds").val().trim();
  const info = $("#manualPlayerInfo").val().trim();

  if (!name) {
    alert("Please enter a player name");
    return;
  }

  // Create new player
  const newId = app.players.length > 0 ? Math.max(...app.players.map(p => p.id)) + 1 : 1;
  const newRank = app.players.length > 0 ? Math.max(...app.players.map(p => p.rank)) + 1 : 1;

  const newPlayer = {
    id: newId,
    name: name,
    rank: newRank,
    odds: odds || "+10000",
    nationality: nationality || "USA",
    info: info || `Competing in ${app.tournaments.current?.name || "tournament"}`
  };

  // Add player to list
  app.players.push(newPlayer);

  // Update UI
  renderPlayers();
  updateDraftStatus();

  // Clear form
  $("#manualPlayerForm")[0].reset();

  showNotification(`Player ${name} added successfully`, "success");
}

// Render players with filtering and sorting
function renderPlayers() {
  const sortByValue = $("#sortBy").val();
  const filterByValue = $("#filterBy").val();
  const searchTerm = $("#playerSearch").val().toLowerCase();

  let filteredPlayers = [...app.players];

  // Apply search filter
  if (searchTerm) {
    filteredPlayers = filteredPlayers.filter(player =>
      player.name.toLowerCase().includes(searchTerm) ||
      player.nationality.toLowerCase().includes(searchTerm) ||
      player.info.toLowerCase().includes(searchTerm)
    );
  }

  // Apply selection filter
  if (filterByValue === "available") {
    filteredPlayers = filteredPlayers.filter(player => getPlayerOwner(player.id) === null);
  } else if (filterByValue === "selected") {
    filteredPlayers = filteredPlayers.filter(player => getPlayerOwner(player.id) !== null);
  }

  // Apply sorting
  if (sortByValue === "rank") {
    filteredPlayers.sort((a, b) => a.rank - b.rank);
  } else if (sortByValue === "odds") {
    filteredPlayers.sort((a, b) => {
      const aOdds = parseOdds(a.odds);
      const bOdds = parseOdds(b.odds);
      return aOdds - bOdds;
    });
  } else if (sortByValue === "name") {
    filteredPlayers.sort((a, b) => a.name.localeCompare(b.name));
  }

  // Secondary sort: always put selected players at the bottom within their category
  filteredPlayers.sort((a, b) => {
    const aSelected = getPlayerOwner(a.id) !== null;
    const bSelected = getPlayerOwner(b.id) !== null;

    if (filterByValue !== "all") return 0; // Skip if we're already filtering by selection status
    if (aSelected && !bSelected) return 1;
    if (!aSelected && bSelected) return -1;
    return 0;
  });

  // Render the grid
  const grid = $("#playerGrid");
  grid.empty();

  if (filteredPlayers.length === 0) {
    grid.append(`
      <div class="col-span-full text-center py-8">
        <p class="text-gray-500">No players found. ${app.ui.loading ? 'Loading...' : searchTerm ? 'Try a different search term.' : 'Select a tournament or add players manually.'}</p>
      </div>
    `);
    return;
  }

  filteredPlayers.forEach(player => {
    const owner = getPlayerOwner(player.id);
    const isSelected = owner !== null;
    const ownerName = isSelected ? owner.name : "";

    const card = $(`
      <div class="player-card ${isSelected ? 'selected' : ''}" data-player-id="${player.id}">
        <div class="bg-white rounded-lg shadow-md overflow-hidden">
          <div class="p-4">
            <div class="flex justify-between items-start">
              <div>
                <h3 class="text-lg font-bold">${player.name}</h3>
                <p class="text-sm text-gray-600">${player.nationality}</p>
              </div>
              <div class="text-right">
                <span class="text-sm font-bold bg-gray-200 rounded px-2 py-1">${player.odds}</span>
                <p class="text-xs text-gray-500 mt-1">Rank: ${player.rank}</p>
              </div>
            </div>
            <div class="tooltip mt-2 text-sm">
              <span class="text-blue-500 cursor-help">Player info</span>
              <span class="tooltip-text">${player.info}</span>
            </div>
            ${isSelected ? `<p class="mt-2 text-sm text-green-600 font-medium">Selected by: ${ownerName}</p>` : ''}
            ${app.ui.editMode && !isSelected ? `<button class="select-player mt-2 w-full py-1 bg-green-100 hover:bg-green-200 text-green-800 rounded text-sm border border-green-300">Select Player</button>` : ''}
            ${app.ui.editMode && isSelected ? `<button class="deselect-player mt-2 w-full py-1 bg-red-100 hover:bg-red-200 text-red-800 rounded text-sm border border-red-300">Remove Selection</button>` : ''}
          </div>
        </div>
      </div>
    `);

    grid.append(card);

    // Add click handlers for selecting/deselecting players
    if (app.ui.editMode) {
      card.find(".select-player").click(function() {
        selectPlayer(player.id);
      });

      card.find(".deselect-player").click(function() {
        deselectPlayer(player.id);
        renderPlayers();
        renderParticipants();
        updateDraftStatus();
      });
    }
  });
}

// Parse odds string to numeric value for sorting
function parseOdds(oddsString) {
  // Handle plus odds (e.g., "+450")
  if (oddsString.startsWith("+")) {
    return parseInt(oddsString.substring(1));
  }
  // Handle minus odds (e.g., "-120") if they appear
  else if (oddsString.startsWith("-")) {
    return -parseInt(oddsString.substring(1));
  }
  // Default fallback
  return 10000;
}

// Select a player
function selectPlayer(playerId) {
  app.ui.selectedPlayerId = playerId;
  const player = app.players.find(p => p.id === playerId);
  $("#selectedPlayerName").text(player.name);
  showParticipantModal();
}

// Show modal for selecting participant
function showParticipantModal() {
  const modal = $("#participantModal");
  const options = $("#participantOptions");

  options.empty();
  app.participants.forEach(participant => {
    options.append(`
      <div class="flex items-center">
        <input type="radio" name="participantOption" id="participant-${participant.id}" value="${participant.id}" class="mr-2">
        <label for="participant-${participant.id}">${participant.name}</label>
      </div>
    `);
  });

  modal.removeClass("hidden");
}

// Hide the participant selection modal
function hideParticipantModal() {
  $("#participantModal").addClass("hidden");
  app.ui.selectedPlayerId = null;
}

// Confirm player selection
function confirmSelection() {
  const selectedParticipantId = parseInt($("input[name='participantOption']:checked").val());

  if (!selectedParticipantId || !app.ui.selectedPlayerId) {
    alert("Please select a participant");
    return;
  }

  const participant = app.participants.find(p => p.id === selectedParticipantId);

  if (participant) {
    participant.selections.push(app.ui.selectedPlayerId);
    hideParticipantModal();

    // Re-render to update UI
    renderPlayers();
    renderParticipants();
    updateDraftStatus();
    saveToLocalStorage();

    // Show notification
    const player = app.players.find(p => p.id === app.ui.selectedPlayerId);
    showNotification(`${player.name} selected by ${participant.name}`, "success");
  }
}

// Deselect a player
function deselectPlayer(playerId) {
  app.participants.forEach(participant => {
    participant.selections = participant.selections.filter(id => id !== playerId);
  });

  const player = app.players.find(p => p.id === playerId);
  showNotification(`${player.name} removed from selections`, "info");

  saveToLocalStorage();
}

// Get player owner
function getPlayerOwner(playerId) {
  return app.participants.find(participant => participant.selections.includes(playerId)) || null;
}

// Render participants list
function renderParticipants() {
  const list = $("#participantsList");
  list.empty();

  if (app.participants.length === 0) {
    list.append(`
      <div class="text-center py-4">
        <p class="text-gray-500">No participants added yet. Add some to get started!</p>
      </div>
    `);
    return;
  }

  app.participants.forEach(participant => {
    const playerSelections = participant.selections.map(id => {
      const player = app.players.find(p => p.id === id);
      return player ? player.name : "Unknown player";
    }).join(", ");

    const item = $(`
      <div class="border-b pb-2 mb-2">
        <div class="font-bold">${participant.name}</div>
        <div class="text-xs text-gray-600">Selections: ${participant.selections.length}</div>
        <div class="text-xs italic text-gray-500 truncate" title="${playerSelections}">
          ${playerSelections || "No selections yet"}
        </div>
        ${app.ui.editMode ? `<button class="remove-participant text-red-500 text-xs mt-1">Remove</button>` : ''}
      </div>
    `);

    list.append(item);

    // Add handler for removing participant
    if (app.ui.editMode) {
      item.find(".remove-participant").click(function() {
        if (confirm(`Are you sure you want to remove ${participant.name}?`)) {
          app.participants = app.participants.filter(p => p.id !== participant.id);
          renderParticipants();
          renderPlayers();
          updateDraftStatus();
          saveToLocalStorage();
        }
      });
    }
  });

  // Also update the selections by participant section
  renderParticipantSelections();
}

// Render participant selections table
function renderParticipantSelections() {
  const selectionsDiv = $("#participantSelections");
  selectionsDiv.empty();

  if (app.participants.length === 0) {
    selectionsDiv.append(`
      <div class="text-center py-4">
        <p class="text-gray-500">Add participants and make selections to view details</p>
      </div>
    `);
    return;
  }

  const table = $(`
    <table class="min-w-full">
      <thead>
        <tr class="bg-gray-200">
          <th class="py-2 px-3 text-left">Participant</th>
          <th class="py-2 px-3 text-left">Selections</th>
          <th class="py-2 px-3 text-left">Avg. Rank</th>
          <th class="py-2 px-3 text-left">Best Odds</th>
        </tr>
      </thead>
      <tbody>
      </tbody>
    </table>
  `);

  const tbody = table.find("tbody");

  app.participants.forEach(participant => {
    const selections = participant.selections.map(id => {
      const player = app.players.find(p => p.id === id);
      return player || { name: "Unknown player", rank: 0, odds: "+0" };
    });

    // Calculate stats
    const avgRank = selections.length > 0
      ? (selections.reduce((sum, player) => sum + player.rank, 0) / selections.length).toFixed(1)
      : "N/A";

    const bestOdds = selections.length > 0
      ? selections.sort((a, b) => parseOdds(a.odds) - parseOdds(b.odds))[0].odds
      : "N/A";

    const selectionNames = selections.map(player => player.name).join(", ");

    const row = $(`
      <tr class="border-b">
        <td class="py-2 px-3 font-medium">${participant.name}</td>
        <td class="py-2 px-3">
          <div class="truncate max-w-xs" title="${selectionNames}">
            ${selections.length > 0 ? selectionNames : "No selections"}
          </div>
        </td>
        <td class="py-2 px-3">${avgRank}</td>
        <td class="py-2 px-3">${bestOdds}</td>
      </tr>
    `);

    tbody.append(row);
  });

  selectionsDiv.append(table);
}

// Update draft status
function updateDraftStatus() {
  const totalPlayers = app.players.length;
  const totalSelected = app.players.filter(player => getPlayerOwner(player.id) !== null).length;

  $("#totalPlayers").text(totalPlayers);
  $("#playersSelected").text(totalSelected);
  $("#playersAvailable").text(totalPlayers - totalSelected);

  // Update last updated time
  updateLastUpdated();

  // Update draft stats section
  renderDraftStats();
}

// Toggle edit mode
function toggleEditMode() {
  app.ui.editMode = !app.ui.editMode;

  if (app.ui.editMode) {
    $("#toggleEditMode").text("Exit Draft Mode");
    $("#toggleEditMode").removeClass("bg-blue-500 hover:bg-blue-600").addClass("bg-gray-500 hover:bg-gray-600");
    $("#saveChanges").removeClass("hidden");
    $("#resetDraft").removeClass("hidden");
  } else {
    $("#toggleEditMode").text("Enter Draft Mode");
    $("#toggleEditMode").removeClass("bg-gray-500 hover:bg-gray-600").addClass("bg-blue-500 hover:bg-blue-600");
    $("#saveChanges").addClass("hidden");
    $("#resetDraft").addClass("hidden");
    $("#addParticipantForm").addClass("hidden");
  }

  renderPlayers();
  renderParticipants();
}

// Save changes
function saveChanges() {
  saveToLocalStorage();
  updateLastUpdated();

  // Enforce sorting with available players at top after saving
  const currentFilter = $("#filterBy").val();
  $("#filterBy").val("all"); // Temporarily set to "all" to ensure proper rendering
  renderPlayers(); // Re-render to move selected players to bottom
  $("#filterBy").val(currentFilter); // Restore previous filter setting

  showNotification("Draft board saved successfully!", "success");
}

// Reset draft
function resetDraft() {
  if (confirm("Are you sure you want to reset all selections? This cannot be undone.")) {
    app.participants.forEach(participant => {
      participant.selections = [];
    });

    saveToLocalStorage();
    renderPlayers();
    renderParticipants();
    updateDraftStatus();

    showNotification("Draft has been reset", "warning");
  }
}

// Toggle participants form
function toggleParticipantsForm() {
  $("#addParticipantForm").toggleClass("hidden");

  if ($("#addParticipantForm").hasClass("hidden")) {
    $("#toggleParticipants").text("Manage Participants");
  } else {
    $("#toggleParticipants").text("Hide Form");
  }
}

// Add new participant
function addParticipant() {
  const name = $("#newParticipantName").val().trim();

  if (!name) {
    alert("Please enter a participant name");
    return;
  }

  const newId = app.participants.length > 0 ? Math.max(...app.participants.map(p => p.id)) + 1 : 1;
  app.participants.push({
    id: newId,
    name: name,
    selections: []
  });

  $("#newParticipantName").val("");
  renderParticipants();
  saveToLocalStorage();

  showNotification(`Participant ${name} added successfully`, "success");
}

// Save data to local storage
function saveToLocalStorage() {
  try {
    // Save participants data with tournament context
    const tournamentContext = app.tournaments.current ? app.tournaments.current.id : null;

    // Store tournament-specific participant data
    if (tournamentContext) {
      localStorage.setItem(`pgaDraft_${tournamentContext}_participants`, JSON.stringify(app.participants));
    }

    // Also store as current/default
    localStorage.setItem("pgaDraftParticipants", JSON.stringify(app.participants));
    localStorage.setItem("pgaDraftLastUpdated", new Date().toISOString());

    // Store additional app data
    localStorage.setItem("pgaDraftTournaments", JSON.stringify(app.tournaments.list));

    if (app.tournaments.current) {
      localStorage.setItem("pgaDraftCurrentTournament", JSON.stringify(app.tournaments.current));
    }
  } catch (e) {
    console.error("Error saving to local storage", e);
    showNotification("Error saving data", "error");
  }
}

// Load data from local storage
function loadFromLocalStorage() {
  try {
    // Load tournaments
    const savedTournaments = localStorage.getItem("pgaDraftTournaments");
    if (savedTournaments) {
      app.tournaments.list = JSON.parse(savedTournaments);
      setupTournamentSelector();
    }

    // Load current tournament
    const savedCurrentTournament = localStorage.getItem("pgaDraftCurrentTournament");
    if (savedCurrentTournament) {
      app.tournaments.current = JSON.parse(savedCurrentTournament);

      // Update UI to reflect current tournament
      $("#tournamentSelector").val(app.tournaments.current.id);
      $("#currentTournament").text(app.tournaments.current.name);
      $("#currentVenue").text(app.tournaments.current.venue);
    }

    // Load API key if available
    const savedApiKey = localStorage.getItem("pgaDraftApiKey");
    if (savedApiKey) {
      app.api.apiKey = savedApiKey;
    }

    // Try to load tournament-specific participants first
    if (app.tournaments.current) {
      const tournamentSpecificParticipants = localStorage.getItem(`pgaDraft_${app.tournaments.current.id}_participants`);
      if (tournamentSpecificParticipants) {
        app.participants = JSON.parse(tournamentSpecificParticipants);
      }
    }

    // Fall back to default participants if none were loaded
    if (app.participants.length === 0) {
      const savedParticipants = localStorage.getItem("pgaDraftParticipants");
      if (savedParticipants) {
        app.participants = JSON.parse(savedParticipants);
      }
    }

    // Load last updated time
    const lastUpdated = localStorage.getItem("pgaDraftLastUpdated");
    if (lastUpdated) {
      $("#updateTime").text(new Date(lastUpdated).toLocaleString());
    }

    renderParticipants();

    // If we have a current tournament but no players, fetch them
    if (app.tournaments.current && app.players.length === 0) {
      fetchTournamentPlayers();
    }
  } catch (e) {
    console.error("Error loading from local storage", e);
    showNotification("Error loading saved data", "error");
  }
}

// Check if we need to load the current tournament data
function checkAndLoadCurrentTournament() {
  if (app.tournaments.current) {
    // If we already have a current tournament and no players, fetch them
    if (app.players.length === 0) {
      fetchTournamentPlayers();
    }
  } else {
    // Show tournament selector prompt
    $("#tournamentPrompt").removeClass("hidden");
  }
}

// Update loading UI state
function updateLoadingUI(isLoading) {
  if (isLoading) {
    $("#loadingIndicator").removeClass("hidden");
    $("#playerGrid").addClass("opacity-50");
  } else {
    $("#loadingIndicator").addClass("hidden");
    $("#playerGrid").removeClass("opacity-50");
  }
}

// Update last updated timestamp
function updateLastUpdated() {
  const now = new Date();
  $("#updateTime").text(now.toLocaleString());
}

// Show notification
function showNotification(message, type = "info") {
  const notification = $(`
    <div class="notification ${type} fixed bottom-4 right-4 bg-white border border-gray-300 p-4 rounded-lg shadow-lg max-w-sm z-50">
      <div class="flex items-center">
        <div class="mr-3">
          ${type === "success" ? '<svg class="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>' : ''}
          ${type === "error" ? '<svg class="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>' : ''}
          ${type === "warning" ? '<svg class="w-6 h-6 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>' : ''}
          ${type === "info" ? '<svg class="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>' : ''}
        </div>
        <div>
          <p class="text-sm font-medium text-gray-900">${message}</p>
        </div>
      </div>
    </div>
  `);

  $("body").append(notification);

  // Auto-remove after 3 seconds
  setTimeout(() => {
    notification.fadeOut(300, function() {
      $(this).remove();
    });
  }, 3000);
}

// Export draft data to CSV
function exportToCSV() {
  if (!app.participants.length || !app.players.length) {
    showNotification("No data to export", "error");
    return;
  }

  let csvContent = "data:text/csv;charset=utf-8,";

  // Header row
  csvContent += "Participant,Player,Rank,Odds,Nationality\n";

  // Data rows
  app.participants.forEach(participant => {
    if (participant.selections.length === 0) {
      csvContent += `${participant.name},No selections,,,\n`;
    } else {
      participant.selections.forEach(playerId => {
        const player = app.players.find(p => p.id === playerId);
        if (player) {
          csvContent += `${participant.name},${player.name},${player.rank},${player.odds},${player.nationality}\n`;
        }
      });
    }
  });

  // Create download link
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `${app.tournaments.current?.name || "PGA"}_Draft_${new Date().toISOString().split("T")[0]}.csv`);
  document.body.appendChild(link);

  // Trigger download
  link.click();
  document.body.removeChild(link);

  showNotification("Draft exported to CSV", "success");
}

// Import draft data from CSV
function importFromCSV(file) {
  const reader = new FileReader();

  reader.onload = function(event) {
    const csvData = event.target.result;

    try {
      // Parse CSV
      const rows = csvData.split('\n');
      const headers = rows[0].split(',');

      // Verify CSV format
      if (!headers.includes('Participant') || !headers.includes('Player')) {
        showNotification("Invalid CSV format. Must include 'Participant' and 'Player' columns.", "error");
        return;
      }

      // Clear existing selections
      app.participants.forEach(p => p.selections = []);

      // Skip header row
      for (let i = 1; i < rows.length; i++) {
        if (!rows[i].trim()) continue;

        const columns = rows[i].split(',');
        const participantName = columns[headers.indexOf('Participant')].trim();
        const playerName = columns[headers.indexOf('Player')].trim();

        if (playerName === "No selections") continue;

        // Find participant
        let participant = app.participants.find(p => p.name === participantName);

        // Create participant if not found
        if (!participant) {
          const newId = app.participants.length > 0 ? Math.max(...app.participants.map(p => p.id)) + 1 : 1;
          participant = {
            id: newId,
            name: participantName,
            selections: []
          };
          app.participants.push(participant);
        }

        // Find player
        const player = app.players.find(p => p.name === playerName);

        if (player && !participant.selections.includes(player.id)) {
          participant.selections.push(player.id);
        }
      }

      // Update UI
      renderParticipants();
      renderPlayers();
      updateDraftStatus();
      saveToLocalStorage();

      showNotification("Draft imported successfully", "success");
    } catch (e) {
      console.error("Error parsing CSV", e);
      showNotification("Error parsing CSV file", "error");
    }
  };

  reader.onerror = function() {
    showNotification("Error reading file", "error");
  };

  reader.readAsText(file);
}

// Initialize draft stats
function initializeDraftStats() {
  if (!app.players.length || !app.participants.length) return;

  const stats = {
    topPickedNationality: {},
    averageRank: {},
    bestOdds: {},
    participantWithMostPicks: null,
    totalSelections: 0
  };

  // Calculate stats
  app.participants.forEach(participant => {
    let ranks = [];
    let oddsList = [];
    let nationalities = {};

    participant.selections.forEach(playerId => {
      const player = app.players.find(p => p.id === playerId);
      if (player) {
        ranks.push(player.rank);
        oddsList.push(parseOdds(player.odds));
        nationalities[player.nationality] = (nationalities[player.nationality] || 0) + 1;
      }
    });

    // Average rank
    if (ranks.length) {
      stats.averageRank[participant.name] = (ranks.reduce((a, b) => a + b, 0) / ranks.length).toFixed(1);
    }

    // Best odds (lowest number value)
    if (oddsList.length) {
      stats.bestOdds[participant.name] = Math.min(...oddsList);
    }

    // Top nationality
    if (Object.keys(nationalities).length) {
      const topNationality = Object.entries(nationalities).sort((a, b) => b[1] - a[1])[0];
      stats.topPickedNationality[participant.name] = topNationality[0];
    }

    // Tracking total
    stats.totalSelections += participant.selections.length;
  });

  // Participant with most picks
  if (app.participants.length) {
    const sorted = [...app.participants].sort((a, b) => b.selections.length - a.selections.length);
    stats.participantWithMostPicks = sorted[0].name;
  }

  return stats;
}

// Render draft statistics
function renderDraftStats() {
  const stats = initializeDraftStats();
  if (!stats) return;

  const statsContainer = $("#draftStats");
  statsContainer.empty();

  // Overall stats
  statsContainer.append(`
    <div class="mb-4">
      <h3 class="text-lg font-bold mb-2">Overall Draft Statistics</h3>
      <div class="grid grid-cols-2 gap-2 md:grid-cols-3">
        <div class="bg-blue-100 p-3 rounded">
          <div class="text-sm text-blue-800">Total Selections</div>
          <div class="text-xl font-bold">${stats.totalSelections}</div>
        </div>
        <div class="bg-green-100 p-3 rounded">
          <div class="text-sm text-green-800">Participants</div>
          <div class="text-xl font-bold">${app.participants.length}</div>
        </div>
        <div class="bg-purple-100 p-3 rounded">
          <div class="text-sm text-purple-800">Most Active</div>
          <div class="text-xl font-bold">${stats.participantWithMostPicks || "N/A"}</div>
        </div>
      </div>
    </div>
  `);

  // Participant stats
  statsContainer.append(`
    <div>
      <h3 class="text-lg font-bold mb-2">Participant Statistics</h3>
      <div class="overflow-x-auto">
        <table class="min-w-full bg-white">
          <thead>
            <tr class="bg-gray-200 text-gray-700">
              <th class="py-2 px-4 text-left">Participant</th>
              <th class="py-2 px-4 text-left">Selections</th>
              <th class="py-2 px-4 text-left">Avg. Rank</th>
              <th class="py-2 px-4 text-left">Best Odds</th>
              <th class="py-2 px-4 text-left">Top Nationality</th>
            </tr>
          </thead>
          <tbody>
            ${app.participants.map(participant => `
              <tr class="border-b hover:bg-gray-50">
                <td class="py-2 px-4">${participant.name}</td>
                <td class="py-2 px-4">${participant.selections.length}</td>
                <td class="py-2 px-4">${stats.averageRank[participant.name] || "N/A"}</td>
                <td class="py-2 px-4">${stats.bestOdds[participant.name] ? "+" + stats.bestOdds[participant.name] : "N/A"}</td>
                <td class="py-2 px-4">${stats.topPickedNationality[participant.name] || "N/A"}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `);
}

// Helper: Apply responsive grid based on screen size
function applyResponsiveGrid() {
  const width = window.innerWidth;
  const playerGrid = $("#playerGrid");

  playerGrid.removeClass("grid-cols-1 grid-cols-2 grid-cols-3 grid-cols-4");

  if (width < 640) {
    playerGrid.addClass("grid-cols-1");
  } else if (width < 768) {
    playerGrid.addClass("grid-cols-2");
  } else if (width < 1024) {
    playerGrid.addClass("grid-cols-3");
  } else {
    playerGrid.addClass("grid-cols-4");
  }
}

// Setup dropdown toggle functionality
function setupDropdownToggle() {
  document.addEventListener('click', function(e) {
    const dropdown = document.querySelector('.dropdown');
    const dropdownMenu = document.querySelector('.dropdown-menu');

    if (dropdown && dropdown.contains(e.target)) {
      dropdownMenu.classList.toggle('hidden');
    } else if (dropdownMenu && !dropdownMenu.classList.contains('hidden')) {
      dropdownMenu.classList.add('hidden');
    }
  });
}