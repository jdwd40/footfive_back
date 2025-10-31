# Codex Highlight Opinion

## Should We Redesign for Live Score Support?
Yes—the current highlight pipeline intentionally spaces same-minute events by two seconds for readability, but that behavior makes it hard to keep a live scoreboard accurate. A redesign should separate presentation delays from state updates so the score can change the moment the decisive highlight fires.

### Key Findings
- `test-server/public/app.js:403-448` processes highlights sequentially and schedules display delays; the deliberate two‑second pause for same-minute events helps narration but postpones score updates that rely on highlight playback.
- `Gamelogic/MatchSimulator.js:116` still limits the engine to one attack resolution per minute, so the simulator cannot generate realistic bursts (counter + rebound) that a live scoreboard would need to reflect quickly.
- `Gamelogic/MatchSimulator.js:142` emits isolated events without explicit causal metadata, forcing the frontend to infer which highlight should trigger a score change versus which is just atmosphere.

### Live-Score-Oriented Redesign Goals
- **Decouple score timing from display pacing:** Keep the 2‑second delay for the commentary feed, but publish score-affecting events immediately (e.g., via a separate event channel or metadata flag).
- **Richer event metadata:** Emit highlights with second-level `gameTime`, `attackId`, and `phase` so the UI knows when a highlight is the authoritative moment to update the scoreboard.
- **Flexible event cadence:** Replace the `usedMinutes` guard with a sequence builder that allows multiple phases in quick succession while capping total volume to keep narration manageable.
- **Transport for real-time updates:** Shape events as immutable `MatchEvent` records that can power both a live scoreboard (no artificial delay) and a delayed commentary feed.

### Immediate Focus Areas
- Prototype a dual-channel approach where outcome events (goal, card, VAR decision) reach the scoreboard instantly while narration still honors the 2‑second stagger.
- Pilot an `AttackSequence` builder that can emit quick succession events and tag the phase that should flip the score.
- Build regression fixtures with rapid-fire sequences to ensure the scoreboard updates as soon as the decisive highlight is produced, even if presentation delays remain.

### Recommended Next Steps
1. **State vs presentation split:** Introduce metadata (e.g., `isScoreAuthoritative`, `displayDelay`) so the frontend can update the scoreboard immediately and schedule commentary separately.
2. **Metadata spike:** Extend the simulator to emit `gameTime`, `attackId`, and `phase`, and ensure existing consumers ignore the new fields unless opted in.
3. **Sequence pilot:** Run controlled matches using a feature-flagged builder that allows multiple phases per minute and verify both event counts and live-score responsiveness.
4. **Streaming readiness:** Once timing and metadata are in place, encapsulate events in an append-only stream accessible to both slow-sim playback and eventual live feeds.
