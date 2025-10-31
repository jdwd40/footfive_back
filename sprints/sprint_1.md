# Sprint 1: Critical Fixes - Clock Synchronization & Timing Foundation

**Duration**: Week 1  
**Estimated Effort**: ~9 hours  
**Priority**: CRITICAL - Fixes core UX issue

## Sprint Goal

Fix clock desynchronization bug and establish foundation for sub-minute timing and event bundling. This sprint addresses the core problem where the game clock drifts ahead of displayed highlights, creating a confusing user experience.

## Success Criteria

- ✅ Clock sync accuracy: 100% (currently ~70%)
- ✅ Zero arbitrary same-minute delays
- ✅ Sub-minute timing data available in backend
- ✅ Basic bundleId support for multi-step sequences

---

## Task 1: Clock Synchronization Fix

**Estimated Effort**: 3 hours  
**Priority**: CRITICAL  
**File**: `test-server/public/championship.js` (or equivalent frontend file)

### Description
Implement clock synchronization so the game clock updates only when highlights are displayed, not when they're processed. This fixes the core issue where clock shows "45'" while "48'" events are displaying.

### Subtasks

- [ ] **1.1** Create `scheduleHighlightWithClockSync()` function
  - Accepts highlight object with `timing.displayAfterMs` and `timing.pauseAfterMs`
  - Schedules clock update and highlight display simultaneously
  - Uses `setTimeout` to coordinate both actions
  
- [ ] **1.2** Remove arbitrary 2-second same-minute delays
  - Find and remove logic that adds delays when events have same minute
  - Replace with timing metadata from backend
  
- [ ] **1.3** Update clock display logic
  - Modify clock update function to accept both minute and second
  - Update display to show sub-minute data (e.g., "45:23")
  - Ensure clock only updates when highlight renders
  
- [ ] **1.4** Update highlight playback system
  - Integrate new sync function into existing playback flow
  - Replace old timing logic with new `timing` metadata consumption
  - Test with existing highlight data to ensure backward compatibility

### Implementation Details

```javascript
function scheduleHighlightWithClockSync(highlight) {
  const displayTime = highlight.timing?.displayAfterMs || 0;
  
  // Schedule clock update AND highlight display simultaneously
  setTimeout(() => {
    // Update clock with sub-minute precision if available
    if (highlight.clock?.minute !== undefined) {
      const second = highlight.clock.second || 0;
      updateGameClock(highlight.clock.minute, second);
    } else {
      // Fallback for backward compatibility
      updateGameClock(highlight.minute, 0);
    }
    
    displayHighlight(highlight);
    
    // Schedule next event after pause
    if (highlight.timing?.pauseAfterMs) {
      scheduleNext(highlight.timing.pauseAfterMs);
    }
  }, displayTime);
}
```

### Acceptance Criteria

- Clock updates exactly when highlight displays, not before
- No clock drift - clock stays synchronized with displayed events
- Backward compatible with highlights that don't have timing metadata
- No arbitrary delays added for same-minute events

### Testing

- [ ] Test with normal match highlights (no timing metadata)
- [ ] Test with new format highlights (with timing metadata)
- [ ] Test rapid events in same minute
- [ ] Verify clock accuracy across full match

---

## Task 2: Sub-Minute Timing Foundation

**Estimated Effort**: 4 hours  
**Priority**: HIGH  
**Files**: 
- Backend: `Gamelogic/MatchSimulator.js`
- Frontend: `test-server/public/championship.js`

### Description
Add sub-minute timing support to enable realistic event spacing. Instead of integer minutes (45), events will have seconds (45:23), creating natural progression without forced delays.

### Backend Subtasks

- [ ] **2.1** Extend highlight schema with sub-minute clock data
  - Add `clock` object to highlight structure:
    ```javascript
    clock: {
      minute: 45,
      second: 23,        // 0-59
      gameTime: 45.383,  // Decimal for calculations (minute + second/60)
      addedTime: null    // Optional injury time minute
    }
    ```
  
- [ ] **2.2** Update highlight generation functions
  - Modify `handleAttack()`, `handleShot()`, `handleGoal()` to include seconds
  - Distribute events randomly across 0-59 seconds within each minute
  - Calculate `gameTime` decimal for timing calculations
  
- [ ] **2.3** Generate realistic second values
  - Use random distribution for events within same minute
  - Ensure events don't cluster (spread across second range)
  - Consider event density (busy minutes may have more events, spread across seconds)

### Frontend Subtasks

- [ ] **2.4** Update clock display component
  - Accept and display both minute and second
  - Format: "45:23" or "45'" (hide seconds, but use for timing)
  - Handle smooth progression as events display
  
- [ ] **2.5** Update timing calculation logic
  - Use `gameTime` decimal for calculating deltas between events
  - Replace minute-based timing with sub-minute precision
  - Calculate `displayAfterMs` based on gameTime difference

### Implementation Details

**Backend Example:**
```javascript
function generateClockData(minute) {
  const second = Math.floor(Math.random() * 60);
  const gameTime = minute + (second / 60);
  
  return {
    minute: minute,
    second: second,
    gameTime: parseFloat(gameTime.toFixed(3)),
    addedTime: null // Will be set if in injury time
  };
}
```

**Frontend Example:**
```javascript
function calculateTimingDelta(previousEvent, currentEvent) {
  const prevTime = previousEvent.clock?.gameTime || previousEvent.minute || 0;
  const currTime = currentEvent.clock?.gameTime || currentEvent.minute || 0;
  const deltaMinutes = currTime - prevTime;
  
  // Convert to milliseconds (base rate: 1.5s per game minute)
  return deltaMinutes * 1500;
}
```

### Acceptance Criteria

- All new highlights include `clock` object with `minute`, `second`, `gameTime`
- Events distributed naturally across 0-59 seconds within minutes
- Frontend can calculate timing deltas from `gameTime` values
- Backward compatible - existing highlights without clock data still work

### Testing

- [ ] Verify events within same minute have different second values
- [ ] Test timing calculations with sub-minute precision
- [ ] Verify clock display updates smoothly
- [ ] Test backward compatibility with old highlight format

---

## Task 3: Basic BundleId Support

**Estimated Effort**: 2 hours  
**Priority**: HIGH  
**Files**: 
- Backend: `Gamelogic/MatchSimulator.js`
- Frontend: `test-server/public/championship.js`

### Description
Implement basic event bundling system using `bundleId` and `bundleStep` to link related events (e.g., penalty sequences, multi-step attacks). This is the foundation for coordinated event sequences.

### Backend Subtasks

- [ ] **3.1** Add bundleId and bundleStep fields to highlight schema
  - Fields: `bundleId` (string), `bundleStep` (integer)
  - `bundleId`: Unique identifier for a sequence (e.g., "penalty_45_1")
  - `bundleStep`: Position in sequence (1, 2, 3, etc.)
  
- [ ] **3.2** Implement bundle generation for penalties
  - Generate unique bundleId for each penalty sequence
  - Mark penalty events with bundleId and appropriate bundleStep
  - Example:
    ```javascript
    // Penalty awarded
    bundleId: "penalty_45_1",
    bundleStep: 1
    
    // Penalty setup (if we add this later)
    bundleId: "penalty_45_1",
    bundleStep: 2
    
    // Penalty outcome
    bundleId: "penalty_45_1",
    bundleStep: 3
    ```
  
- [ ] **3.3** Add bundleId to multi-step attack sequences
  - Link pressure → shot → outcome events
  - Use consistent bundleId for related events

### Frontend Subtasks

- [ ] **3.4** Update highlight display to recognize bundles
  - Detect when highlights share bundleId
  - Display bundled events as related sequences
  - Prepare for future bundle presentation UI

### Implementation Details

**Backend Bundle Generation:**
```javascript
let bundleCounter = 0;

function generateBundleId(eventType, minute) {
  bundleCounter++;
  return `${eventType}_${minute}_${bundleCounter}`;
}

// In penalty handling:
const bundleId = generateBundleId('penalty', currentMinute);
penaltyHighlights.forEach((highlight, index) => {
  highlight.bundleId = bundleId;
  highlight.bundleStep = index + 1;
});
```

### Acceptance Criteria

- Penalties have bundleId and bundleStep fields
- Related events (same attack sequence) share bundleId
- Frontend can identify and group bundled events
- Backward compatible - events without bundleId still work

### Testing

- [ ] Verify penalties have bundleId and bundleStep
- [ ] Test frontend can group events by bundleId
- [ ] Verify standalone events (no bundle) still display correctly

---

## Integration & Testing

### Cross-Task Integration

- [ ] Verify clock sync works with sub-minute timing
- [ ] Ensure bundleId events maintain proper timing
- [ ] Test end-to-end: backend → frontend display → clock sync

### Regression Testing

- [ ] Existing matches still display correctly
- [ ] Old highlight format (no clock, no bundleId) works
- [ ] New highlight format works with new frontend logic
- [ ] No performance degradation

### User Acceptance Testing

- [ ] Clock stays synchronized throughout match
- [ ] Events feel naturally spaced (no forced delays)
- [ ] Penalties group together as sequences
- [ ] Overall match viewing experience improved

---

## Dependencies

- Backend highlight generation system (`Gamelogic/MatchSimulator.js`)
- Frontend highlight playback system (`championship.js` or equivalent)
- Clock display component

## Notes

- **Backward Compatibility**: All changes must maintain compatibility with existing highlight data
- **Performance**: Sub-minute data adds minimal overhead (~5% payload size)
- **Fallbacks**: Frontend should gracefully handle missing timing metadata

## Next Steps After Sprint 1

After completing Sprint 1, proceed to Sprint 2:
- Full schema migration (timing, severity, context, payload)
- Event-specific pacing constants implementation
- 3-phase penalty sequence enhancement

---

**Sprint Owner**: [To be assigned]  
**Start Date**: [To be set]  
**Target Completion**: [To be set]

