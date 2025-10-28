# Codex Highlight Opinion

## Key Findings
- `test-server/public/app.js:403` advances the game clock immediately when iterating highlights, so the UI clock jumps ahead while the highlight is still queued.
- `test-server/public/app.js:406` ties display timing to a synthetic “1 second per match minute” delay, so minute gaps (for example 5' → 15') create long pauses unrelated to match flow.
- `Gamelogic/MatchSimulator.js:116` enforces one attack resolution per minute, blocking natural chains such as turnover → counter → shot inside the same minute.
- `Gamelogic/MatchSimulator.js:142` emits pressure, shot, and goal highlights with identical minute stamps and no sequence metadata, leaving the frontend without context for coherent micro-narratives.

## Event Flow Improvements
- Move clock control into a single ticker that advances virtual match time, and trigger both `updateGameClock` and highlight rendering when that ticker reaches each event’s scheduled timestamp (`test-server/public/app.js:403`).
- Emit highlights with richer timing fields (minute, second, stoppage, phase order) so delays rely on simulated seconds rather than coarse minute gaps (`Gamelogic/MatchSimulator.js:188`).
- Replace the `usedMinutes` gate with a possession/sequence model that can emit multiple ordered phases within one minute while capping overall volume (`Gamelogic/MatchSimulator.js:116`).
- Introduce sequence IDs and phase labels (for example `attackId`, `phase: 'buildUp' | 'shot' | 'rebound'`) so the UI can bundle related cards before displaying the outcome (`Gamelogic/MatchSimulator.js:142`).

## New Highlight Types
- `buildUpPlay`: possession starts, progressive passes, or wing overloads that set the stage.
- `keyPass` / `assist`: the decisive ball linking build-up to the shot.
- `woodwork` / `goalMouthScramble`: dramatic near-misses distinct from generic off-target shots.
- `keeperDistribution` or `quickCounter`: transitions after saves or interceptions.
- `crowdReaction` / `benchReaction`: post-goal or controversial-moment color.
- `VARCheck` / `injuryBreak` / `substitution`: stoppages that clarify longer pauses or tactical shifts.

## Scalability Considerations
- Store events as immutable `MatchEvent` records with precise `gameTime` (seconds) and sequence metadata to support replay and real-time streaming.
- Drive a dedicated clock service that can sync to real wall time for live matches or a simulated rate, exposing pause/resume hooks for ads and stoppages.
- Publish highlights over WebSockets or Server-Sent Events so live clients consume the same stream slow-sim replays use.
- Keep a `MatchState` reducer on the client that derives scoreboard, clock, and narrative panes from the event stream, avoiding duplicated timing logic.
- Log event timings and UI render timestamps to validate synchronization and tune delays as the model evolves.

## Next Steps
- Prototype the possession/sequence data model in the simulator and confirm it yields coherent highlight bundles.
- Refactor the frontend timing loop so the same scheduler drives both clock updates and highlight rendering.
- Build a fixed highlight fixture (including new event types) for regression tests that verify clock/highlight alignment.
- Run an end-to-end slow simulation after refactoring to confirm clock accuracy and the perceived flow of commentary.
