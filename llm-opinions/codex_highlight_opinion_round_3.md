# Codex Highlight Opinion — Round 3

## Source Documents
- `claude_highlight_opinion_round_2.md`
- `gemini_highlight_opinion_round_2.md`
- `codex_highlight_opinion_round_2.md`

## Consensus From Round 2
- **Clock bug:** All analyses flag `test-server/public/app.js` updating the clock before highlights render as the immediate sync issue.
- **Simulation limits:** The `usedMinutes` guard in `Gamelogic/MatchSimulator.js` blocks realistic multi-phase attacks.
- **Narrative gap:** Every opinion calls for linked event chains with sub-minute timing and richer event types.
- **Architecture direction:** Move to an event-stream model where the simulator emits structured sequences and the frontend controls display timing.

## Recommended Way Forward

### Phase 0 – Immediate UX Fix (1–2 days)
- Move `updateGameClock` inside `scheduleHighlightDisplay` so the clock advances only when a highlight actually renders.
- Add lightweight logging comparing scheduled vs rendered timestamps to confirm the sync issue is resolved.

### Phase 1 – Event Enrichment (Week 1)
- Extend highlight payloads with `gameTime` (seconds), `chainId`, `phase`, and optional `displayDelay`.
- Introduce the high-impact event types that all LLMs agree on (`buildUpPlay`, `keyPass`, `shotAttempt`, `outcomeGoal|Save|Miss|Woodwork`, `cornerKick`, `counterAttack`, `crowdReaction`) while keeping legacy fields for backward compatibility.

### Phase 2 – Attack Sequence Builder (Weeks 2–3)
- Replace direct highlight pushes with an `AttackSequenceBuilder` that emits ordered phases and controls pacing; remove the `usedMinutes` constraint once the builder enforces reasonable caps.
- Incorporate a simple pressure or state tracker (0–100 scale) so repeated possession naturally leads to richer chains.

### Phase 3 – Frontend Event Scheduler (Weeks 3–4)
- Refactor the slow-sim renderer into an `EventStreamProcessor` driven by a single ticker (real or accelerated time) that dequeues events when `event.gameTime <= clock`.
- Group events by `chainId` for presentation and respect per-event `displayDelay` or `pauseAfter` values supplied by the simulator.
- Build deterministic fixtures to regression-test clock progression, score updates, and event ordering.

### Phase 4 – Live-Ready Architecture (Weeks 5–6)
- Publish the same event stream over WebSocket/SSE so slow-sim and live feeds share one pipeline.
- Add a client-side `MatchState` reducer derived from the stream, enabling other surfaces (score bug, commentary ticker, dashboards) to consume the same data.
- Instrument both ends with timing logs to detect drift and set alert thresholds for live operations.

### Phase 5 – Atmosphere & Extensions (Post-Migration)
- Incrementally add the remaining narrative elements from the Round 2 opinions (cards, substitutions, injury breaks, VAR checks, manager reactions).
- Explore player-level metadata and momentum tracking once the core chain system is battle-tested.

## Why This Plan
- **Aligns with Round 2 consensus:** Marries Claude’s phased roadmap, Gemini’s quick-win mindset, and our own data-focused improvements.
- **Delivers value continuously:** Users see the clock fix immediately, richer highlights next, and finally a scalable event stream.
- **Sets the foundation for live play:** The same architecture powers both simulations and real-time feeds without a rewrite.
