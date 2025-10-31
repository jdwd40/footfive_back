# FootFive Match Event & Live View Overhaul (Round 1)

## Current System Snapshot
- **Backend timeline** – `Gamelogic/MatchSimulator.js` builds an in-memory `highlights` array during the minute loop, emitting pre-formatted strings and minimal metadata (`minute`, `type`, `team`, `description`, `score`). Kick-off, period breaks, pressure clips, penalties and shootout steps all mix inside the same flat payload ([`MatchSimulator.js:31-112`](../Gamelogic/MatchSimulator.js#L31) and [`MatchSimulator.js:136-160`](../Gamelogic/MatchSimulator.js#L136)).
- **One-minute bottleneck** – `usedMinutes` blocks a second attack in the same game minute, yet multi-step routines (pressure → shot → goal or penalty award → outcome) still share the exact minute stamp. The frontend compensates by inserting extra padding per same-minute event.
- **Frontend playback** – `processHighlightsWithTiming` in `test-server/public/app.js` replays the already-ordered array with a heuristic scheduler: 1 s per minute jump plus +2 s per extra event in the same minute, special cases for penalties and half-time ([`app.js:403-455`](../test-server/public/app.js#L403)). `scheduleHighlightDisplay` updates the game clock immediately before rendering each card, so any injected padding makes the visual clock drift relative to the “1 s = 1′” baseline.
- **Narrative surface** – Descriptions embed minute ticks and scorelines in raw text, repeat phrases, and offer little connective tissue between events. Shootout steps bundle setup/outcome but without tempo cues for suspense.

## Pain Points
- **Rigid highlight shape** – No IDs, no phase metadata, no grouping, no explicit pacing hints. Advanced UX (threaded moments, rewinds, pinned key plays) is hard to add while everything is a flat list of paragraphs.
- **Timing heuristics fighting content** – Because the backend cannot express sub-minute beats, the frontend fakes pauses. The extra delay stalls the highlight feed while the clock keeps marching, recreating the original bug (e.g., a penalty award and conversion both stamped at 72′ forces a 2 s buffer, so the clock shows 73′ before commentary catches up).
- **Low-context copy** – Strings repeat the minute and score (already displayed elsewhere) and jump straight to end states. Users do not feel build-up, suspense, or resolution, especially during frenetic passages and penalties.
- **UX dead-ends** – There is no way to surface match tempo (slow periods vs chaos), queue dramatic pauses, or peek at what is coming next. The live view is a linear log with limited affordances for big moments.

## Recommended Architecture

### 1. Timeline Data Model
Adopt a structured event envelope and separate text templates from data. Suggested schema per event:
```json
{
  "id": "uuid",                // stable key for diffing
  "phase": "regular|et|pens",  // macro context
  "clock": {                    // richer clock data
    "minute": 72,
    "addedTime": 1,             // optional
    "segment": "openPlay"      // kickoff, VAR, break, etc.
  },
  "category": "attack|goal|penalty|segment",
  "severity": "routine|notable|critical",
  "bundleId": "thread-42",     // link multi-step narratives
  "payload": {                  // facts surfaced to templates
    "actor": "Metro FC",
    "opponent": "Airway United",
    "player": "Silva",
    "xg": 0.34,
    "shotType": "leftFoot",
    "pressure": "high"
  },
  "copy": {
    "primary": "Metro carve Airway open down the left...",
    "secondary": "Silva squares it, the box erupts!"
  },
  "timing": {
    "displayAfterMs": 0,        // relative to prior event in bundle
    "pauseBeforeNextMs": 1200    // explicit pacing hint
  }
}
```
Key benefits:
- Frontend can sort/filter by `phase` or `severity` and render rich layouts.
- `bundleId` enables “threads” (e.g., pressure → shot → rebound) without hacking `minute`.
- `timing` tells the live view exactly how long to wait instead of inferring delays.
- `payload` feeds multiple copy variants (concise for tiles, richer for narration, tooltips for stat nerds).

### 2. Backend Event Pipeline
1. **Event planning layer** – Convert raw simulation outcomes into semantic “moments”. Instead of pushing strings, store intermediate facts (time, actors, context). Maintain a queue per minute that can contain multiple sub-events.
2. **Narrative composer** – Pass each moment through a templating engine that selects phrasing based on context (score state, pressure, player form, tournament round). Keep a reusable library of snippets for build-up, suspense, and resolution.
3. **Bundling & pacing** – Group related sub-events under a shared `bundleId`. Assign intra-bundle pacing (e.g., 500 ms from build-up to shot, 1500 ms pause before the VAR decision). Allow the engine to inject “breathers” after high-severity moments or before half/full time announcements.
4. **Phase-aware sequencing** – Tag events with `phase` and `segment` (`kickoff`, `stoppage`, `pensPregame`). Supply explicit `displayAtMs` relative to match start. The frontend can still compress/expand via user settings but has authoritative defaults.

### 3. Event Pacing Rules
- **Global tempo curve** – Map 90 minutes to a target playback duration (e.g., 180 s). Calculate a per-minute base delay (2 s) and modulate it by match state: shorten during lulls, extend around cards/goals. Provide a “fast” and “broadcast” preset.
- **Bundle pacing** – Within a bundle, allow sub-steps such as:
  - Build-up description (`displayAfterMs: 0`)
  - Shot animation (`+800 ms`)
  - Crowd reaction (`+500 ms` if miss, +1500 ms if goal)
- **Dramatic checkpoints** – Inject fixed pauses: 2.5 s between “Penalty awarded” and “striker steps up…”, another 1.5 s before the outcome. Expose these in the data so the frontend clock pauses naturally rather than drifting.
- **Adaptive catch-up** – If the queue grows (many events quickly), tighten `pauseBeforeNextMs` for routine plays but maintain full pauses for marked `critical` events.

### 4. Live Match UX Flow
- **Dual-track header** – Drive the scoreboard clock from the same scheduler that consumes `displayAtMs`, ensuring the “minute” only advances when the highlight renders.
- **Timeline lanes** – Present a primary commentary lane with expandable bundles. A secondary sidebar can surface quick stats (possession swings, xG spikes) pulled from the same event payloads.
- **Tension cues** – Use `severity` to trigger UI treatments (glow, vibration, audio stings) and to briefly freeze scrolling after huge plays.
- **User controls** – Allow “Catch me up” (skip routine events) and “Broadcast mode” toggle (restores every beat). Because the data contains severity and pacing, these filters become trivial.
- **Penalty shootout staging** – Render shootout bundles as card stacks: header with aggregate score, rows for “Steps up… / Strikes… / Save!”. Respect `pauseBeforeNextMs` to deliver the TV-style heartbeat.

## Sample Narrative Upgrades
### Open-Play Frenzy (bundleId `attack-54`)
1. *Primary*: “71′ – Metro recycle a corner, pressure ratchets up down the right flank.”
2. *Secondary*: “Silva darts inside, slips Karouma through…” (`+600 ms`)
3. *Outcome*: “GOAL! Karouma roofs it near post. Metro 2-1 Airway.” (`+900 ms`)
4. *Aftermath*: “Airway players surround the ref claiming offside.” (`+1200 ms`, severity `notable`)

### Penalty Drama (bundleId `pen-7`)
1. “90+1′ – Penalty check! VAR signals a handball after Metro’s cross.”
2. `pauseBeforeNextMs: 2500`
3. “Metro’s talisman Metro steps up… the stadium holds its breath.”
4. `pauseBeforeNextMs: 1800`
5. “Saved! Airway’s keeper guesses right and palms it away.”
6. “Rebound hacked clear, players collapsing in disbelief.” (`severity: critical`)

### Shootout Broadcast (bundleId `pens-12`)
- Setup card: “Round 5 – Airway need this to stay alive.”
- Outcome card after 1.6 s: “Airway’s captain slots bottom left. Sudden death continues.”
- Metadata: `scoreAfter: { Metro: 4, Airway: 4 }`, `pauseBeforeNextMs: 1200` before next taker strides up.

## Suggested Next Steps
1. Prototype the new event schema in the simulator, emitting a short deterministic fixture for validation.
2. Build a lightweight “timeline player” in Node that reads the schema, applies pacing, and logs clock vs highlight times to confirm sync.
3. Update the web client to consume the structured timeline, map severity to UI treatments, and honour explicit pauses.
4. Iterate on narrative templates with copywriting passes, leveraging payload data (player positions, pressure rating, context) for variety.

The overhaul lets the backend own narrative intent while the frontend becomes a true director of pacing and presentation. With explicit structure, you can ship richer copy, fix clock drift, and delight users during the game’s biggest moments.
