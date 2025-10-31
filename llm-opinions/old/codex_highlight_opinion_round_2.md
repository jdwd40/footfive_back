# Codex Highlight Opinion — Round 2

## Should We Redesign to Enable Live Scores?
Yes, but the plan must ensure the live scoreboard becomes trustworthy before layering on richer narratives. The frontend’s intentional two-second spacing of same-minute events keeps commentary readable but delays score updates, so we need a design where state changes are emitted immediately even if narration waits.

### Live-Score Readiness Check
- **Timing:** `test-server/public/app.js` still advances the clock as soon as an event is scheduled, so the score clock leads the commentary while the actual highlight waits out the intentional delay—confusing for live users.
- **Cadence:** `Gamelogic/MatchSimulator.js` enforces one event per minute, blocking realistic possession flows and limiting the ability to display quick score changes.
- **Structure:** Without chain metadata (`attackId`, `phase`, `gameTime`), a live widget cannot map score changes to moments reliably.

## Recommended Roadmap (Live-Score First)

### 1. Stabilize the Existing UX (Week 1)
- Introduce metadata (e.g. `isScoreAuthoritative`) so score updates can fire immediately even while the commentary feed honors the two-second pause.
- Keep the intentional same-minute delay for narration, but ensure the scoreboard subscribes to a delay-free feed of decisive events.
- Add lightweight logging comparing event creation vs display to confirm the scoreboard updates at time zero while narration respects the stagger.

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

## Why This Path Answers the Live Score Question
- **Trustworthy Clock Before Anything Else:** The live score cannot be credible until the display uses the exact timer that triggers highlights.
- **Structured Data for Score Widgets:** Adding `gameTime` and sequence metadata lets downstream consumers (live ticker, push notifications, commentary) reason about when to change the score.
- **Controlled Rollout:** By sequencing timing fixes, metadata enrichment, and finally real-time transport, we avoid shipping a flashy redesign that still misreports the score.
- **Scalable Beyond Simulation:** Once the event stream is battle-tested, the same channel can power an actual live feed with minimal additional work.
