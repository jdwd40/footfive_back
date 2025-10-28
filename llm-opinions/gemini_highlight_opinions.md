### Analysis of the Current System

1.  **Core Problem:** The `highlights_problem.md` document is correct; the clock synchronization issue is fundamental. The frontend's `app.js` updates the clock immediately when it *processes* a highlight but displays the highlight after a calculated delay. This guarantees they will be out of sync.

2.  **Unrealistic Simulation:** In `MatchSimulator.js`, the `usedMinutes` set, while a pragmatic fix for a timing bug, forces an unrealistic "one event per minute" rule. Real matches have ebbs and flows, with periods of sustained pressure and multiple events happening in quick succession. The current system models a penalty as two distinct events in the same minute, which the frontend then has to apply special logic to handle.

3.  **Lack of Narrative:** The highlights are disconnected events. A "pressure" event is generated, but it's just a piece of text; it doesn't guarantee a shot or any other logical follow-up action. There's no story to the match.

### Proposal for a New Highlight and Event System

I propose a move away from a simple list of highlights to a more robust, event-driven architecture. This will solve the synchronization problem and create a more realistic and scalable simulation.

#### 1. A Richer, Structured Event Model

We should introduce new event types to create a logical and narrative flow. Instead of a single "goal" highlight, a goal would be the culmination of a sequence of events.

**New Event Types:**

*   **`build-up`**: A team establishes possession and starts an attack.
*   **`chance`**: A key moment in the attack, like a great pass or a defensive error.
*   **`shot`**: The attempt on goal.
*   **`outcome`**: The result of the shot (goal, save, block, miss).
*   **`foul`**: Can lead to a free-kick or penalty.
*   **`card`**: Yellow or red card, influencing player/team state.
*   **`crowd-reaction`**: Adds atmosphere after significant events.

**Example Event Chain for a Goal:**

```json
[
  { "minute": 74, "type": "build-up", "team": "Team A", "description": "Team A is patiently building from the back." },
  { "minute": 75, "type": "chance", "team": "Team A", "player": "Player 10", "description": "Player 10 plays a brilliant through-ball!" },
  { "minute": 75, "type": "shot", "team": "Team A", "player": "Player 9", "description": "Player 9 is one-on-one with the keeper and takes the shot!" },
  { "minute": 75, "type": "outcome", "outcome": "goal", "team": "Team A", "player": "Player 9", "description": "GOAL! He slots it past the keeper! What a finish!" },
  { "minute": 75, "type": "crowd-reaction", "team": "Team A", "description": "The home crowd erupts!" }
]
```

#### 2. Backend Refactoring (`MatchSimulator.js`)

*   **State Machine:** I will refactor the simulation logic into a state machine. The match can be in states like `neutral`, `attacking`, `defending`, or `set-piece`. This allows for more complex and realistic scenarios.
*   **Multi-Minute Sequences:** An attack sequence can span multiple minutes. A `build-up` in minute 74 can lead to a `shot` in minute 75. The `usedMinutes` constraint will be removed.
*   **Event Emission:** Instead of generating a single large array of highlights at the end, the `MatchSimulator` will be modified to emit events as they occur. This is key for live updates.

#### 3. Frontend Refactoring (`app.js`)

*   **Event-Driven Updates:** The frontend will be refactored to handle events one by one. For a true live experience, this would use WebSockets or Server-Sent Events, but we can simulate this by processing the event array sequentially.
*   **Frontend Clock Authority:** The frontend clock will become the "source of truth." It will only advance when it processes an event that moves the game time forward.
*   **New Processing Logic:** A new `processEvent` function will be the core of the frontend logic.

    ```javascript
    // Simplified new logic
    function processEvent(event) {
        // 1. Update the game state (score, etc.) based on the event.
        // 2. Display the highlight for the event.
        // 3. **Then, and only then,** update the clock to match the event's minute.
        updateGameClock(event.minute);
    }
    ```

    This ensures the clock and the displayed highlight are **always** synchronized.

#### 4. Scalability for Live Games

This event-based architecture is inherently scalable. A live game feed would simply be another source of events, and the frontend would not need to distinguish between a simulated event and a real one. The flexible JSON structure of the events can be easily extended with more data in the future, such as player coordinates for a 2D visualization.

By implementing these changes, we will not only fix the clock synchronization bug but also create a foundation for a much more realistic, engaging, and feature-rich soccer simulation.
