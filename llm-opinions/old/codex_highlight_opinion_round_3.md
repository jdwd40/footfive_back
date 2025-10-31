# Codex Highlight Opinion — Round 3

## Source Documents
- `claude_highlight_opinion_round_2.md`
- `gemini_highlight_opinion_round_2.md`
- `codex_highlight_opinion_round_2.md`

## Consensus From Round 2
- **Intentional delay impact:** Everyone noted that the frontend staggers same-minute events (historically to solve display issues), which now hurts live score responsiveness.
- **Simulation limits:** The `usedMinutes` guard in `Gamelogic/MatchSimulator.js` blocks realistic multi-phase attacks.
- **Narrative gap:** Every opinion calls for linked event chains with sub-minute timing and richer event types.
- **Architecture direction:** Move to an event-stream model where the simulator emits structured sequences and the frontend controls both immediate state updates and delayed presentation.

## Recommended Way Forward (Live Score Lens)

### Phase 0 – Immediate UX Fix (1–2 days)
- Keep the two-second commentary spacing, but emit score-affecting events (goal, card, VAR decision) on a zero-delay channel so the clock/score stay accurate.
- Add lightweight logging comparing event creation vs display to prove the scoreboard updates instantly while narration respects the intentional delay.

### Phase 1 – Event Enrichment (Week 1)
- Extend highlight payloads with `gameTime` (seconds), `chainId`, `phase`, and optional `displayDelay`.
- Introduce the high-impact event types that all LLMs agree on (`buildUpPlay`, `keyPass`, `shotAttempt`, `outcomeGoal|Save|Miss|Woodwork`, `cornerKick`, `counterAttack`, `crowdReaction`) while keeping legacy fields for backward compatibility.

### Phase 2 – Attack Sequence Builder (Weeks 2–3)
- Replace direct highlight pushes with an `AttackSequenceBuilder` that emits ordered phases and controls pacing; remove the `usedMinutes` constraint once the builder enforces reasonable caps.
- Incorporate a simple pressure or state tracker (0–100 scale) so repeated possession naturally leads to richer chains.

### Phase 3 – Frontend Event Scheduler (Weeks 3–4)
- Refactor the slow-sim renderer into an `EventStreamProcessor` that publishes two views: an immediate state feed for the scoreboard and a presentation feed that honors per-event `displayDelay` or `pauseAfter`.
- Group events by `chainId` for presentation and ensure the scoreboard feed uses `event.gameTime` rather than scheduled display times.
- Build deterministic fixtures to regression-test clock progression, score updates, and event ordering for both feeds.

### Phase 4 – Live-Ready Architecture (Weeks 5–6)
- Publish the same event stream over WebSocket/SSE so slow-sim and live feeds share one pipeline.
- Add a client-side `MatchState` reducer derived from the stream, enabling other surfaces (score bug, commentary ticker, dashboards) to consume the same data.
- Instrument both ends with timing logs to detect drift and set alert thresholds for live operations.

### Phase 5 – Atmosphere & Extensions (Post-Migration)
- Incrementally add the remaining narrative elements from the Round 2 opinions (cards, substitutions, injury breaks, VAR checks, manager reactions).
- Explore player-level metadata and momentum tracking once the core chain system is battle-tested.

## Why This Plan Answers “Should We Redesign?”
- **Live score credibility first:** The plan begins by separating immediate state updates from intentional presentation delays so the live score stays correct even when narration is staggered.
- **Data contracts for real-time widgets:** Enriching events with `gameTime`, `chainId`, and phases creates the structure a live scoreboard or commentary overlay needs.
- **Measured rollout:** Sequencing fixes through telemetry, fixtures, and controlled transport upgrades prevents shipping another redesign that still misreports scores.
- **Future compatibility:** Once validated in simulation, the event-stream pipeline can accept genuine live match data with minimal rework, justifying the redesign investment.
