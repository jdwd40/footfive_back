# Codex Highlight Opinion — Round 2

## Perspective Across LLM Opinions
- **Shared Diagnosis:** All perspectives agree that `test-server/public/app.js` advances the clock before highlights render, causing the sync bug, and that `Gamelogic/MatchSimulator.js`’s `usedMinutes` constraint flattens match flow.
- **Narrative Gap:** Claude and Gemini stress missing causal chains and atmosphere; our initial pass focused on data richness and timing. The best approach merges structured sequences with richer metadata.
- **Architecture Direction:** Each analysis favors event streams with sub-minute precision and a clean split between simulation and display layers, implying a staged refactor rather than a quick patch.

## Recommended Roadmap

### 1. Stabilize the Existing UX (Week 1)
- Move `updateGameClock` calls inside `scheduleHighlightDisplay` so the clock advances only when an event renders.
- Cap delay gaps by converting the minute-based delay to simulated seconds (e.g. clamp long gaps, rely on `highlight.displayAt` when available).
- Add lightweight logging comparing scheduled versus actual render times to validate the sync fix.

### 2. Expand Highlight Semantics (Weeks 2–3)
- Replace `usedMinutes` with an `AttackSequence` builder that emits ordered phases within a minute while keeping overall event volume manageable.
- Introduce core event types shared across the opinions: `buildUpPlay`, `keyPass`, `shotAttempt`, `outcomeGoal|Save|Miss|Woodwork`, `setPieceStart`, `crowdReaction`.
- Attach `chainId`, `phase`, and sub-minute `timestamp` fields so the frontend can cluster related cards.

### 3. Refactor Timing & Frontend Consumption (Weeks 3–4)
- Normalize simulator output into an append-only `MatchEvent` stream sorted by `gameTime` (seconds).
- Build a dedicated frontend scheduler that:
  1. Drives the clock from a single ticker (real or simulated).
  2. Emits events once `gameTime` ≤ current clock time.
  3. Groups events by `chainId` for cohesive animations.
- Create deterministic fixtures to regression-test highlight order, clock progression, and score updates.

### 4. Prepare for Live Integration (Weeks 5–6)
- Wrap the event stream in a WebSocket/SSE publisher so slow-sim replays and live feeds share the same API.
- Implement a client-side `MatchState` reducer derived from the event stream to centralize scoreboard/clock/commentary state.
- Log render timings client-side to detect drift and establish alerting for real-time deployments.

### 5. Atmosphere & Advanced Features (Post-refactor)
- Layer in secondary events (`VARCheck`, `injuryBreak`, `substitution`, `tacticalChange`) once the chain system is stable.
- Factor in momentum/pressure tracking to drive commentary tone and chance probabilities.
- Consider player-level metadata (scorers, assisters) for richer storytelling and optional stat overlays.

## Why This Path
- **Incremental Delivery:** Resolves the visible clock issue first, adds narrative depth next, then retools the architecture without freezing current features.
- **Consensus Driven:** Synthesizes Claude’s chain-focused narrative, Gemini’s event-driven frontend, and our data/timing emphasis into a coherent execution plan.
- **Future-Proof:** Positions the system for live match streaming, richer visualizations, and extensible commentary without repeating one-off rewrites.
