# FootFive Backend - Installation Guide

This guide will walk you through setting up the FootFive backend application step by step.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Project Setup](#project-setup)
3. [Environment Configuration](#environment-configuration)
4. [Database Setup](#database-setup)
5. [Running the Application](#running-the-application)
6. [Test Server Setup](#test-server-setup)
7. [Running Tests](#running-tests)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v14 or higher recommended)
  ```bash
  node --version
  ```

- **npm** (comes with Node.js)
  ```bash
  npm --version
  ```

- **PostgreSQL** (v12 or higher)
  ```bash
  psql --version
  ```

- **Git** (to clone the repository)
  ```bash
  git --version
  ```

---

## Project Setup

### Step 1: Navigate to Project Directory

```bash
cd /home/jd/projects/proball/footfive_back
```

### Step 2: Install Dependencies

Install all required Node.js packages:

```bash
npm install
```

This will install:
- `express` - Web framework
- `pg` - PostgreSQL client
- `pg-format` - SQL formatting
- `dotenv` - Environment variable management
- `cors` - Cross-Origin Resource Sharing
- `jest` - Testing framework
- `supertest` - HTTP testing library

**Expected Output:**
- A `node_modules` folder will be created
- You should see a message indicating packages were installed successfully

---

## Environment Configuration

The application requires environment files to configure database connections for different environments.

### Step 3: Create Development Environment File

Create a file named `.env.development` in the project root:

```bash
touch .env.development
```

Add the following content to `.env.development`:

```env
PGDATABASE=footfive_dev
PGUSER=jd
PGPASSWORD=K1ller1921
PGHOST=localhost
PGPORT=5432
```

**Note:** Adjust the values according to your PostgreSQL setup:
- `PGDATABASE` - Name of your development database
- `PGUSER` - Your PostgreSQL username
- `PGPASSWORD` - Your PostgreSQL password
- `PGHOST` - Database host (usually `localhost`)
- `PGPORT` - PostgreSQL port (default is `5432`)

### Step 4: Create Test Environment File

Create a file named `.env.test` in the project root:

```bash
touch .env.test
```

Add the following content to `.env.test`:

```env
PGDATABASE=footfive_test
PGUSER=jd
PGPASSWORD=K1ller1921
PGHOST=localhost
PGPORT=5432
```

**Important:** The test database MUST be named `footfive_test` for safety reasons (to prevent accidental data loss).

### Environment Files Summary

After this step, you should have:
- `.env.development` - For development environment
- `.env.test` - For test environment

The application automatically loads the correct file based on the `NODE_ENV` variable:
- `NODE_ENV=development` (default) → loads `.env.development`
- `NODE_ENV=test` → loads `.env.test`

---

## Database Setup

### Step 5: Create Development Database

Run the database setup script:

```bash
bash setup-database.sh
```

**What this does:**
- Creates a PostgreSQL database named `footfive_dev`
- Uses the credentials from your `.env.development` file

**Expected Output:**
```
Setting up FootFive database...
Database footfive_dev already exists (or CREATE DATABASE)
Database setup complete!

Database Details:
- Database: footfive_dev
- User: jd
- Host: localhost
- Port: 5432
```

**If you encounter permission errors:**

If the script fails, you may need to create the database manually:

```bash
psql -U jd -c "CREATE DATABASE footfive_dev;"
```

### Step 6: Create Test Database

Run the test database setup script:

```bash
bash setup-test-database.sh
```

**What this does:**
- Creates a PostgreSQL database named `footfive_test`
- Grants necessary permissions

**Expected Output:**
```
Setting up FootFive test database...
Database footfive_test already exists (or CREATE DATABASE)
Test database setup complete!

Test Database Details:
- Database: footfive_test
- User: jd
- Host: localhost
- Port: 5432
```

### Step 7: Seed Development Database

Populate the development database with initial data:

```bash
npm run seed
```

**What this does:**
- Drops existing `teams` and `players` tables (if they exist)
- Creates fresh `teams` and `players` tables with the proper schema
- Inserts team and player data from `db/data/`

**Expected Output:**
```
ENV development
seeded
```

**Database Schema Created:**

**Teams Table:**
- `team_id` (Primary Key)
- `name` (Unique)
- `wins`, `losses`, `goals_for`, `goals_against`
- `jcups_won`, `runner_ups`, `highest_round_reached`
- `created_at`, `updated_at`

**Players Table:**
- `player_id` (Primary Key)
- `team_id` (Foreign Key → teams)
- `name`
- `attack`, `defense`
- `is_goalkeeper`

---

## Running the Application

### Step 8: Start the Main Server

Start the development server:

```bash
npm start
```

**What this does:**
- Runs `listen.js` which starts the Express server on port `9001`
- Loads the development database configuration
- Enables CORS for cross-origin requests

**Expected Output:**
```
ENV development
Server is running on port 9001
```

**Accessing the API:**
- Base URL: `http://localhost:9001/api`
- The server is now ready to accept requests

**To stop the server:**
- Press `Ctrl + C` in the terminal

---

## Test Server Setup

The test server is a standalone GUI tool for testing match simulations. It has its own dependencies.

### Step 9: Navigate to Test Server Directory

```bash
cd test-server
```

### Step 10: Install Test Server Dependencies

**Important:** You MUST run `npm install` separately in the test-server directory:

```bash
npm install
```

**What this installs:**
- `express` - Web framework
- `pg` - PostgreSQL client
- `nodemon` - Auto-restart development tool (dev dependency)

### Step 11: Start the Test Server

From the `test-server` directory:

```bash
npm start
```

**Or for auto-reload during development:**

```bash
npm run dev
```

**Expected Output:**
```
Test server running on http://localhost:3001
```

### Step 12: Access Test Server GUI

Open your web browser and navigate to:

```
http://localhost:3001
```

**Features:**
- Interactive team selection
- Editable attack/defense/goalkeeper ratings
- Real-time match simulation
- Detailed results with highlights

**To stop the test server:**
- Press `Ctrl + C` in the terminal

### Returning to Project Root

```bash
cd ..
```

---

## Running Tests

The project uses Jest for testing.

### Run All Tests

```bash
npm test
```

### Run Specific Test Suites

```bash
# Watch mode (auto-run on file changes)
npm run test:watch

# With coverage report
npm run test:coverage

# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# API/route tests only
npm run test:api

# Model tests only
npm run test:models

# Game logic tests only
npm run test:gamelogic

# Controller tests only
npm run test:controllers
```

**Important:** Tests automatically use the test database (`footfive_test`) via `NODE_ENV=test`.

---

## Troubleshooting

### Database Connection Issues

**Problem:** `PGDATABASE not set` error

**Solution:**
1. Verify your `.env.development` and `.env.test` files exist
2. Ensure `PGDATABASE` is set in both files
3. Check that you're in the correct directory

---

**Problem:** `password authentication failed`

**Solution:**
1. Update the `PGPASSWORD` in your `.env` files
2. Verify your PostgreSQL user credentials:
   ```bash
   psql -U jd -d postgres -c "SELECT current_user;"
   ```

---

**Problem:** `database "footfive_dev" does not exist`

**Solution:**
1. Run the setup script again:
   ```bash
   bash setup-database.sh
   ```
2. Or create manually:
   ```bash
   psql -U jd -c "CREATE DATABASE footfive_dev;"
   ```

---

### Port Already in Use

**Problem:** `Port 9001 is already in use`

**Solution:**
1. Find and kill the process using the port:
   ```bash
   lsof -ti:9001 | xargs kill -9
   ```
2. Or change the port in `listen.js`

---

**Problem:** `Port 3001 is already in use` (Test Server)

**Solution:**
1. Find and kill the process:
   ```bash
   lsof -ti:3001 | xargs kill -9
   ```
2. Or modify the port in `test-server/server.js`

---

### NPM Installation Issues

**Problem:** `npm install` fails

**Solution:**
1. Clear npm cache:
   ```bash
   npm cache clean --force
   ```
2. Delete `node_modules` and `package-lock.json`:
   ```bash
   rm -rf node_modules package-lock.json
   ```
3. Reinstall:
   ```bash
   npm install
   ```

---

### Test Server Not Loading Teams

**Problem:** Test server can't fetch teams

**Solution:**
1. Ensure the development database is seeded:
   ```bash
   npm run seed
   ```
2. Verify the main server is NOT running (test server uses its own connection)
3. Check database connection in `db/connection.js`

---

## Quick Start Summary

For experienced users, here's the quick installation flow:

```bash
# 1. Install dependencies
npm install

# 2. Create environment files
cat > .env.development << EOF
PGDATABASE=footfive_dev
PGUSER=jd
PGPASSWORD=K1ller1921
PGHOST=localhost
PGPORT=5432
EOF

cat > .env.test << EOF
PGDATABASE=footfive_test
PGUSER=jd
PGPASSWORD=K1ller1921
PGHOST=localhost
PGPORT=5432
EOF

# 3. Setup databases
bash setup-database.sh
bash setup-test-database.sh

# 4. Seed development database
npm run seed

# 5. Start main server
npm start

# 6. In a new terminal: Setup test server
cd test-server
npm install
npm start
```

---

## Next Steps

After installation, you can:

1. **Explore the API** - Check available endpoints in the codebase
2. **Run the test suite** - `npm test` to verify everything works
3. **Use the test server** - Open `http://localhost:3001` to simulate matches
4. **Review documentation** - Check `backend_documentation.md` for API details

---

## Support & Documentation

- **Main Documentation:** `backend_documentation.md`
- **Testing Guide:** `TESTING.md`
- **Test Server Guide:** `test-server/README.md`
- **Backend Changes (historical):** `obsolete/backend_changes.md`

---

**Version:** 1.0.0  
**Author:** JD  
**License:** ISC

