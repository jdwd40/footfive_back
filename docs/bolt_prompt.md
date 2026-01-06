# Bolt Prompt: FootFive Frontend

You are Bolt, an expert frontend engineer. Your task is to build a Vite + React application to serve as the user interface for the FootFive backend.

**Source of Truth:**
Your primary source of truth for all API interactions is the attached `bolt_endpoints.md` file. Do not invent or assume any endpoints or data structures not present in that file.

## Core Requirements

### 1. Project Setup
*   **Framework:** React with Vite
*   **Language:** JavaScript
*   **Styling:** Use a modern CSS framework like Tailwind CSS or Material-UI. The UI should be clean, modern, and mobile-first.

### 2. API Client
*   Create a single, dedicated API client module (e.g., `src/services/api.js`) to handle all `fetch` requests to the backend.
*   This module should read the base URL from an environment variable.
*   Implement functions for each endpoint defined in `bolt_endpoints.md`.

### 3. Environment Configuration
*   Use a `.env` file to manage environment variables.
*   Define `VITE_API_BASE_URL` and set its default value to `http://localhost:9001/api`.
*   Provide clear instructions in the README on how to change this variable.

### 4. Pages and Components
Implement the following pages, ensuring they are responsive and user-friendly:

*   **Tournament Page:**
    *   On first load, call `GET /api/jcup/init` to fetch and display the initial tournament bracket.
    *   The bracket should clearly show the teams in each fixture and the tournament rounds.
    *   Include a "Play Next Round" button that calls `GET /api/jcup/play`.
    *   After a round is played, update the bracket with the winners and display the `nextRoundFixtures`.

*   **Live Match View:**
    *   When a user clicks on a "View Match" button for a fixture, navigate to a live match view.
    *   This view should display the match highlights in a feed.
    *   Use polling on the `GET /api/fixtures/:id/events?afterEventId=<last_event_id>` endpoint to fetch new events in near real-time.
    *   The clock should be synchronized with the event timestamps.
    *   Show a clear "Match Final" message when the simulation is complete.

*   **Match Report Page:**
    *   After a match is finished, provide a link to a full match report.
    *   This page should display the final score, detailed statistics (from `GET /api/fixtures/:id/report`), and a complete log of all match events.

*   **Teams Page:**
    *   Display a list of all teams with their key statistics using data from `GET /api/teams`.
    *   Include a section or a separate view for the "Top Cup Winners" from `GET /api/teams/3jcup`.
    *   Allow users to click on a team to see more details.

*   **Team Detail Page:**
    *   Show detailed information for a single team.
    *   Fetch and display the list of players for that team using `GET /api/players/team/:teamName`.

*   **Standalone Simulation Page (Optional but Recommended):**
    *   A simple UI to create and simulate a single "friendly" match.
    *   Allow users to select two teams, create a fixture with `POST /api/fixtures`, and then simulate it with `POST /api/fixtures/:id/simulate`.
    *   Display the results and a link to the match report.

### 5. UI/UX
*   **Loading States:** Implement loading indicators (e.g., spinners) for all asynchronous operations.
*   **Error Handling:** Display user-friendly error messages if an API call fails.
*   **Navigation:** Use a clear and intuitive navigation structure (e.g., a navbar).

## What NOT to Implement
*   **Backend Logic:** Do not implement any game simulation or business logic on the frontend. The frontend is purely a consumer of the backend API.
*   **Authentication:** Do not add any login, registration, or authentication features.

## Verification Checklist for Bolt
After generating the code, please verify the following:

*   [ ] The application starts without errors using `npm run dev`.
*   [ ] The `VITE_API_BASE_URL` is correctly used in the API client.
*   [ ] The Tournament Bracket page correctly initializes and updates.
*   [ ] The Live Match view polls for and displays events.
*   [ ] All pages handle loading and error states gracefully.
*   [ ] The UI is responsive and looks good on both mobile and desktop screens.
*   [ ] The README includes clear instructions on how to run the application and configure the backend URL.

Now, generate the Vite + React application based on these instructions.
