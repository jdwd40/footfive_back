# FootFive API Endpoints for Bolt

This document outlines the API endpoints for the FootFive backend that the Bolt-generated frontend will interact with.

**Base URL:** `http://localhost:9001/api`

---

## Frontend Usage Notes

*   **Authentication:** There is no authentication required for any of the endpoints.
*   **State Management:** The J-Cup tournament state is maintained on the backend. The frontend should call the endpoints in the correct order to ensure the tournament progresses correctly.
*   **Live Match Polling:** For the live match view, the frontend should poll the `GET /api/fixtures/:id/events?afterEventId=<last_event_id>` endpoint to get new events.

---

## Tournament Management (`/jcup`)

### Initialize Tournament

*   **Method:** `GET`
*   **Endpoint:** `/api/jcup/init`
*   **Purpose:** Initializes a new 16-team knockout tournament.
*   **Response (200 OK):**
    ```json
    {
      "message": "Tournament initialized successfully",
      "fixtures": [
        [
          {
            "team1": { "id": 1, "name": "Metro City", ... },
            "team2": { "id": 2, "name": "Mega City One", ... }
          }
        ]
      ]
    }
    ```
*   **Example `curl`:**
    ```bash
    curl http://localhost:9001/api/jcup/init
    ```

### Play Next Round

*   **Method:** `GET`
*   **Endpoint:** `/api/jcup/play`
*   **Purpose:** Simulates all matches in the current round and returns the results, highlights, and the next round's fixtures.
*   **Response (200 OK):**
    ```json
    {
      "message": "Round 1 played successfully.",
      "results": ["Metro City 2 - Mega City One 1", ...],
      "highlights": ["1': GOAL by Metro City!", ...],
      "nextRoundFixtures": [...]
    }
    ```
*   **Example `curl`:**
    ```bash
    curl http://localhost:9001/api/jcup/play
    ```

### End Tournament

*   **Method:** `POST`
*   **Endpoint:** `/api/jcup/end`
*   **Purpose:** Updates the cup winner and runner-up statistics.
*   **Request Body:**
    ```json
    {
      "winner_id": 1,
      "runner_id": 2
    }
    ```
*   **Response (200 OK):**
    ```json
    {
      "message": "jCupWon updated successfully",
      "jCupWon": { ... }
    }
    ```
*   **Example `curl`:**
    ```bash
    curl -X POST -H "Content-Type: application/json" -d '{"winner_id": 1, "runner_id": 2}' http://localhost:9001/api/jcup/end
    ```

---

## Team Management (`/teams`)

### Get All Teams

*   **Method:** `GET`
*   **Endpoint:** `/api/teams`
*   **Purpose:** Retrieves a list of all teams and their statistics.
*   **Response (200 OK):**
    ```json
    {
      "message": "Teams fetched successfully",
      "teams": [
        {
          "id": 1,
          "name": "Metro City",
          "attackRating": 87,
          "defenseRating": 83,
          "goalkeeperRating": 75,
          "jcups_won": 2,
          "runner_ups": 1
        }
      ]
    }
    ```
*   **Example `curl`:**
    ```bash
    curl http://localhost:9001/api/teams
    ```

### Get Top Cup Winners

*   **Method:** `GET`
*   **Endpoint:** `/api/teams/3jcup`
*   **Purpose:** Retrieves the top 16 teams by the number of J-Cups won.
*   **Response (200 OK):**
    ```json
    {
      "message": "Top 3 JCup winners fetched successfully",
      "top3JCupWinners": [ ... ]
    }
    ```
*   **Example `curl`:**
    ```bash
    curl http://localhost:9001/api/teams/3jcup
    ```

---

## Player Management (`/players`)

### Get Players by Team

*   **Method:** `GET`
*   **Endpoint:** `/api/players/team/:teamName`
*   **Purpose:** Retrieves all players for a specific team.
*   **Response (200 OK):**
    ```json
    {
      "message": "Players for Metro City fetched successfully",
      "players": [ ... ]
    }
    ```
*   **Example `curl`:**
    ```bash
    curl http://localhost:9001/api/players/team/Metro%20City
    ```

---

## Fixture & Simulation (`/fixtures`)

### Create a Fixture

*   **Method:** `POST`
*   **Endpoint:** `/api/fixtures`
*   **Purpose:** Creates a single match fixture.
*   **Request Body:**
    ```json
    {
      "homeTeamId": 1,
      "awayTeamId": 2,
      "round": "Friendly"
    }
    ```
*   **Response (201 Created):**
    ```json
    {
      "message": "Fixture created",
      "fixture": { ... },
      "odds": { ... }
    }
    ```
*   **Example `curl`:**
    ```bash
    curl -X POST -H "Content-Type: application/json" -d '{"homeTeamId": 1, "awayTeamId": 2, "round": "Friendly"}' http://localhost:9001/api/fixtures
    ```

### Simulate a Fixture

*   **Method:** `POST`
*   **Endpoint:** `/api/fixtures/:id/simulate`
*   **Purpose:** Runs a full simulation for a given fixture ID.
*   **Response (200 OK):**
    ```json
    {
      "message": "Match simulated",
      "result": { ... }
    }
    ```
*   **Example `curl`:**
    ```bash
    curl -X POST http://localhost:9001/api/fixtures/1/simulate
    ```

### Get Match Events

*   **Method:** `GET`
*   **Endpoint:** `/api/fixtures/:id/events`
*   **Purpose:** Retrieves all events for a completed match simulation. Can be used for polling live matches.
*   **Query Params:**
    *   `afterEventId=<id>`: Get all events that occurred after the specified event ID.
*   **Response (200 OK):**
    ```json
    {
      "count": 50,
      "events": [
        {
          "eventId": 1,
          "fixtureId": 1,
          "minute": 0,
          "type": "kickoff",
          ...
        }
      ]
    }
    ```
*   **Example `curl`:**
    ```bash
    curl http://localhost:9001/api/fixtures/1/events
    ```

### Get Match Report

*   **Method:** `GET`
*   **Endpoint:** `/api/fixtures/:id/report`
*   **Purpose:** Retrieves the final statistics report for a completed match.
*   **Response (200 OK):**
    ```json
    {
      "fixture": { ... },
      "report": {
        "stats": {
          "home": { "possession": 52, "shots": 12, ... },
          "away": { "possession": 48, "shots": 8, ... }
        }
      }
    }
    ```
*   **Example `curl`:**
    ```bash
    curl http://localhost:9001/api/fixtures/1/report
    ```
