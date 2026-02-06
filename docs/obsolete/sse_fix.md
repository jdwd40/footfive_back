# SSE Fix - Event Broadcasting Issue

## Problem

SSE clients connect successfully and receive the initial `connected` event, but subsequent events (goals, halftime, etc.) are never received by clients despite being emitted internally (seq increases).

## Root Cause

Response buffering - `res.write()` calls were being buffered by Node.js/Express and not immediately flushed to the client.

## Changes Made

**File:** `Gamelogic/simulation/EventBus.js`

### 1. Force Flush Headers (line 84)

```javascript
res.writeHead(200, { ... });
res.flushHeaders();  // NEW - ensures headers sent immediately
```

### 2. Disable Nagle Algorithm (lines 86-89)

```javascript
if (res.socket) {
  res.socket.setNoDelay(true);
}
```

Nagle algorithm batches small TCP packets for efficiency. For SSE we need immediate delivery.

### 3. Flush After Each Write (line 212)

```javascript
res.write(`event: ${event.type}\n`);
res.write(`data: ${data}\n\n`);
if (res.flush) res.flush();  // NEW - flush if compression middleware exists
```

### 4. Debug Logging (lines 170-173)

```javascript
if (clientCount > 0) {
  console.log(`[EventBus] Broadcasting ${event.type} (seq ${event.seq}) to ${clientCount} clients`);
}
```

### 5. Writable Check (lines 204-207)

```javascript
if (!res.writable) {
  console.warn(`[EventBus] Response not writable for event ${event.type}`);
  return false;
}
```

## Deployment

1. Deploy changes to server
2. Restart Node.js process
3. Monitor logs for `[EventBus] Broadcasting...` messages

## If Still Not Working

Check nginx config for proxy buffering:

```nginx
location /api/live/events {
    proxy_pass http://localhost:9001;
    proxy_buffering off;
    proxy_cache off;
    proxy_set_header Connection '';
    proxy_http_version 1.1;
    chunked_transfer_encoding off;
}
```
