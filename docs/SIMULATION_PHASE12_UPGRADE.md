# Simulation Upgrade: Phase 1-2 Narrative Flow

**Date:** 2026-04-16  
**Scope:** `EventGenerator` context-state and linked event sequences (no schema-level Phase 3 changes)

---

## What changed

The live match simulation now adds lightweight "memory" and storytelling while keeping the existing minute-based match clock and flat event payload model.

Implemented in:

- `gamelogic/simulation/EventGenerator.js`
- `gamelogic/constants.js`
- `__tests__/unit/gamelogic/EventGenerator.test.js`

No changes were made to:

- `LiveMatch.tick()` orchestration
- `EventBus` normalization or DB persistence schema
- nested micro-event containers (deferred to future Phase 3)

---

## Backend behavior changes

### 1) Internal phase/context state in `EventGenerator`

Added internal generator state:

- `momentum` per side (`home`, `away`) with decay and clamp
- `fieldZone` (0-100 style positioning)
- `possessionSide` and `possessionState` (`build_up`/`dangerous`)
- `sustainedPressure` counters

This state modifies probability outcomes but does not change `simulateMinute(minute)` signature.

### 2) Linked sequence events (flat payloads)

Selected attacks now emit connected event chains in the same minute using existing bundling fields:

- `bundleId`
- `bundleStep`

New flow events:

- `possession_play`
- `build_up_play`
- `ball_progression`

These are still regular top-level events, not nested structures.

### 3) Enriched payload fields

Existing and new events can now include:

- `narrative` (commentary-friendly string)
- `tags` (event intent/context labels)
- `fieldZone`
- `possessionState`
- `momentumSnapshot`

### 4) Constants/category mapping

In `gamelogic/constants.js`:

- Added event types:
  - `POSSESSION_PLAY`
  - `BUILD_UP_PLAY`
  - `BALL_PROGRESSION`
- Added category mapping for each as `flow`

Persistability set was intentionally not broadened to avoid DB event volume spikes.

---

## Frontend changes required

Frontend can continue functioning without immediate breakage if unknown event types are safely ignored.  
To fully benefit from the upgrade, implement the following:

### 1) Add support for new event types

Wherever event type-to-label/icon/template mapping is done, add:

- `possession_play`
- `build_up_play`
- `ball_progression`

Recommended display:

- treat them as low/medium priority `flow` timeline items
- render `description` by default, prefer `narrative` when available

### 2) Use sequence grouping in match feed

Group events by `bundleId` and order by `bundleStep` to show connected attacks as a short sequence instead of unrelated lines.

Suggested UX:

- collapse grouped sequence behind one expandable timeline row
- show "build-up -> progression -> chance/shot outcome" as a single highlight card

### 3) Handle optional new payload fields safely

Update event typing/interfaces to include optional fields:

- `narrative?: string`
- `tags?: string[]`
- `fieldZone?: number`
- `possessionState?: string`
- `momentumSnapshot?: { home: number; away: number }`
- `bundleStep?: number`

All should be optional to preserve backward compatibility with older historical events.

### 4) Highlight filters and chips

If the UI supports filter chips/toggles:

- add filter handling for `flow` items that include the new types
- optionally add tag chips (`buildUp`, `progression`, `setPiece`, `dangerousAttack`)

### 5) Commentary panel integration (optional but high-value)

If frontend has commentary cards:

- prefer `narrative` when present
- fallback to `description` when absent
- for grouped bundles, combine lines into one narrative paragraph

---

## Compatibility notes

- Event stream contract remains flat and SSE-compatible.
- Existing consumers that only understand legacy event types may miss some new flow detail but should still process match-critical events (goals/cards/penalties) as before.
- Fast-forward behavior remains unchanged in `LiveMatch` (`KEY_EVENTS` filtering still applies).

---

## Testing completed

Executed:

- `__tests__/unit/gamelogic/EventGenerator.test.js` (new)
- `__tests__/unit/gamelogic/LiveMatch.test.js` (regression safety)

Outcome:

- all tests passing for targeted suites
- no lint diagnostics on modified files

