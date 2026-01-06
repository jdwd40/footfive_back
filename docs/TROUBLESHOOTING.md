# Troubleshooting Guide

Common issues and solutions for FootFive backend.

## Server Issues

### Server Won't Start

**Error**: `Error: listen EADDRINUSE: address already in use :::9001`

**Cause**: Another process is using port 9001.

**Solution**:
```bash
# Find process using port
lsof -i :9001

# Kill the process
kill $(lsof -t -i :9001)

# Or force kill
kill -9 $(lsof -t -i :9001)
```

---

**Error**: `PGDATABASE not set`

**Cause**: Environment file not found or misconfigured.

**Solution**:
1. Verify `.env.development` exists in project root
2. Check it contains `PGDATABASE=footfive`
3. Ensure `NODE_ENV` matches your env file:
   ```bash
   NODE_ENV=development npm start
   ```

---

**Error**: `Cannot find module 'express'`

**Cause**: Dependencies not installed.

**Solution**:
```bash
npm install
```

---

### Server Crashes on Startup

**Error**: `password authentication failed for user`

**Cause**: Incorrect PostgreSQL credentials.

**Solution**:
1. Update `.env.development` with correct credentials
2. Test connection:
   ```bash
   psql -U your_user -d footfive -c "SELECT 1;"
   ```

---

**Error**: `database "footfive" does not exist`

**Cause**: Database not created.

**Solution**:
```bash
psql -U your_user -c "CREATE DATABASE footfive;"
npm run migrate
npm run seed
```

---

## Database Issues

### Connection Pool Exhausted

**Symptoms**: Requests timeout, "too many clients" error

**Cause**: Connections not being released.

**Solution**:
1. Restart the application
2. Check for unclosed connections in code
3. Increase pool size in `db/connection.js`:
   ```javascript
   const pool = new Pool({ max: 20 });
   ```

---

### Migration Fails

**Error**: `relation already exists` or `column already exists`

**Cause**: Migration already partially applied.

**Solution**:
```bash
# Connect to database
psql -U your_user -d footfive

# Check table structure
\d fixtures

# Drop and recreate if needed
DROP TABLE IF EXISTS match_events CASCADE;
DROP TABLE IF EXISTS match_reports CASCADE;
DROP TABLE IF EXISTS fixtures CASCADE;

# Re-run migration
npm run migrate
```

---

### Seeding Fails

**Error**: `duplicate key value violates unique constraint`

**Cause**: Data already exists.

**Solution**:
```bash
# Clear existing data
psql -U your_user -d footfive -c "TRUNCATE teams, players CASCADE;"

# Re-seed
npm run seed
```

---

### Foreign Key Violations

**Error**: `violates foreign key constraint`

**Cause**: Trying to delete/update referenced data.

**Solution**:
Delete dependent data first, or use CASCADE:
```sql
DELETE FROM fixtures WHERE tournament_id = 123;
-- or
TRUNCATE fixtures CASCADE;
```

---

## Simulation Issues

### Tournament Not Starting

**Symptom**: `/api/live/status` shows `state: "IDLE"` after :00

**Cause**: `SIMULATION_AUTO_START` not set or simulation crashed.

**Solution**:
1. Check environment:
   ```bash
   echo $SIMULATION_AUTO_START
   # Should be "true"
   ```

2. Manual start:
   ```bash
   curl -X POST http://localhost:9001/api/admin/simulation/start
   curl -X POST http://localhost:9001/api/admin/tournament/start
   ```

3. Check server logs for errors

---

### Matches Stuck / Not Progressing

**Symptom**: Match minute doesn't change.

**Cause**: Simulation paused or loop crashed.

**Solution**:
1. Check if paused:
   ```bash
   curl http://localhost:9001/api/live/status | jq '.isPaused'
   ```

2. Resume if paused:
   ```bash
   curl -X POST http://localhost:9001/api/admin/clock/resume
   ```

3. Restart server if needed

---

### Matches End Without Winner

**Symptom**: Match shows as complete but `winner_team_id` is NULL.

**Cause**: Bug in penalty shootout logic (fixed in recent commits).

**Solution**:
1. Update to latest code:
   ```bash
   git pull origin master
   ```

2. Force-end stuck matches:
   ```bash
   curl -X POST http://localhost:9001/api/admin/match/123/force-end
   ```

---

### Round Transition Blocked

**Symptom**: Tournament stuck between rounds.

**Cause**: Not all matches finished (likely extra time/penalties).

**Solution**:
1. Check match states:
   ```bash
   curl http://localhost:9001/api/live/matches | jq '.[] | {id: .fixtureId, state: .state}'
   ```

2. Wait for matches to complete, or force-end:
   ```bash
   curl -X POST http://localhost:9001/api/admin/match/123/force-end
   ```

---

## API Issues

### CORS Errors

**Error**: `Access-Control-Allow-Origin` errors in browser.

**Cause**: Frontend origin not in allowed list.

**Solution**:
Add origin to `listen.js` CORS config:
```javascript
if (origin.includes('your-domain.com')) {
    return callback(null, true);
}
```

---

### SSE Connection Drops

**Symptom**: Live events stop streaming.

**Cause**: Connection timeout or server restart.

**Solution**:
1. Client should auto-reconnect with `afterSeq` parameter
2. Check nginx/proxy timeouts if using reverse proxy
3. Add keep-alive in nginx:
   ```nginx
   proxy_read_timeout 86400;
   proxy_send_timeout 86400;
   ```

---

### 500 Internal Server Error

**Cause**: Unhandled exception in code.

**Solution**:
1. Check server console logs
2. Common causes:
   - Database connection lost
   - Missing required field in request
   - Null pointer in simulation

---

## Deployment Issues

### PM2 Process Not Starting

**Symptom**: `pm2 list` shows app as "errored" or "stopped".

**Solution**:
```bash
# Check logs
pm2 logs footfive-backend

# Delete and restart
pm2 delete footfive-backend
pm2 start listen.js --name footfive-backend
pm2 save
```

---

### GitHub Actions Deployment Fails

**Error**: `Permission denied (publickey)`

**Cause**: SSH key not configured.

**Solution**:
1. Generate SSH key pair on VPS
2. Add public key to VPS `~/.ssh/authorized_keys`
3. Add private key as GitHub secret `SSH_PRIVATE_KEY`

---

**Error**: `npm: command not found`

**Cause**: NVM not loaded in SSH session.

**Solution**: Use full path in deploy script:
```yaml
/home/jd/.nvm/versions/node/v24.5.0/bin/npm ci --production
```

---

### Database Password Not Set

**Error**: `PGPASSWORD not set` or `password authentication failed`

**Cause**: GitHub secret not passed to environment.

**Solution**:
1. Verify `PGPASSWORD` secret exists in GitHub repo settings
2. Check deploy script uses the secret:
   ```yaml
   PGPASSWORD=${{ secrets.PGPASSWORD }} psql ...
   ```

---

## Testing Issues

### Tests Hang

**Symptom**: Test suite doesn't complete.

**Cause**: Open database connections or async operations.

**Solution**:
```bash
# Run with open handle detection
npx jest --detectOpenHandles

# Set explicit timeout
npx jest --testTimeout=10000
```

---

### Tests Pass Individually, Fail Together

**Cause**: Shared state between tests.

**Solution**:
1. Add proper cleanup in `afterEach`:
   ```javascript
   afterEach(async () => {
     await db.query('TRUNCATE fixtures CASCADE');
   });
   ```

2. Use `--runInBand` to run sequentially:
   ```bash
   npx jest --runInBand
   ```

---

### Test Database Errors

**Error**: `database "footfive_test" does not exist`

**Solution**:
```bash
psql -U your_user -c "CREATE DATABASE footfive_test;"
```

---

## Performance Issues

### Slow API Responses

**Cause**: Missing database indexes or inefficient queries.

**Solution**:
1. Check for missing indexes:
   ```sql
   EXPLAIN ANALYZE SELECT * FROM fixtures WHERE status = 'live';
   ```

2. Ensure indexes exist:
   ```sql
   CREATE INDEX IF NOT EXISTS idx_fixtures_status ON fixtures(status);
   ```

---

### High Memory Usage

**Cause**: Event history growing unbounded.

**Solution**:
1. Clear old events periodically:
   ```bash
   curl -X POST http://localhost:9001/api/admin/events/clear
   ```

2. Restart PM2 process:
   ```bash
   pm2 restart footfive-backend
   ```

---

## Logging

### Enable Debug Logging

Add to your environment:
```bash
DEBUG=* npm start
```

### Check PM2 Logs

```bash
pm2 logs footfive-backend --lines 100
```

### Check PostgreSQL Logs

```bash
tail -f /var/log/postgresql/postgresql-14-main.log
```

---

## Getting Help

If you can't resolve an issue:

1. Check existing GitHub issues
2. Review recent commits for related fixes
3. Check the Architecture docs for system understanding
4. Open a new issue with:
   - Error message
   - Steps to reproduce
   - Environment details (Node version, OS, etc.)
