# FootFive Backend - Installation Guide

This guide will walk you through setting up the FootFive backend application step by step.

In this VM, `PGUSER`, `PGDATABASE`, `PGPASSWORD`, `PGHOST`, and `PGPORT` may be pre-set by the environment. For commands that run the app, seed, migrate, or test, unset those variables first so `dotenv` can load this project's `.env.*` files:

```bash
env -u PGUSER -u PGDATABASE -u PGPASSWORD -u PGHOST -u PGPORT <command>
```

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Project Setup](#project-setup)
3. [Environment Configuration](#environment-configuration)
4. [Database Setup](#database-setup)
5. [Running the Application](#running-the-application)
6. [Running Tests](#running-tests)
7. [Troubleshooting](#troubleshooting)

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
cd /home/jd/projects/footfive/footfive_back
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
PGPASSWORD=your_password
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
PGPASSWORD=your_password
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

Create the development database:

```bash
psql -U jd -d postgres -c "CREATE DATABASE footfive_dev;"
```

If it already exists, PostgreSQL will report that and you can continue.

### Step 6: Create Test Database

Create the test database:

```bash
psql -U jd -d postgres -c "CREATE DATABASE footfive_test;"
```

The test database must be named `footfive_test`; `db/test-connection.js` enforces this safety check.

### Step 7: Seed Development Database

Populate the development database with initial data:

```bash
env -u PGUSER -u PGDATABASE -u PGPASSWORD -u PGHOST -u PGPORT npm run seed
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
env -u PGUSER -u PGDATABASE -u PGPASSWORD -u PGHOST -u PGPORT npm start
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

## Running Tests

The project uses Jest for testing.

### Run All Tests

```bash
env -u PGUSER -u PGDATABASE -u PGPASSWORD -u PGHOST -u PGPORT npm test
```

### Run Specific Test Suites

```bash
# Watch mode (auto-run on file changes)
env -u PGUSER -u PGDATABASE -u PGPASSWORD -u PGHOST -u PGPORT npm run test:watch

# With coverage report
env -u PGUSER -u PGDATABASE -u PGPASSWORD -u PGHOST -u PGPORT npm run test:coverage

# Unit tests only
env -u PGUSER -u PGDATABASE -u PGPASSWORD -u PGHOST -u PGPORT npm run test:unit

# Integration tests only
env -u PGUSER -u PGDATABASE -u PGPASSWORD -u PGHOST -u PGPORT npm run test:integration

# API/route tests only
env -u PGUSER -u PGDATABASE -u PGPASSWORD -u PGHOST -u PGPORT npm run test:api

# Model tests only
env -u PGUSER -u PGDATABASE -u PGPASSWORD -u PGHOST -u PGPORT npm run test:models

# Game logic tests only
env -u PGUSER -u PGDATABASE -u PGPASSWORD -u PGHOST -u PGPORT npm run test:gamelogic

# Controller tests only
env -u PGUSER -u PGDATABASE -u PGPASSWORD -u PGHOST -u PGPORT npm run test:controllers
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
1. Create the database:
   ```bash
   psql -U jd -d postgres -c "CREATE DATABASE footfive_dev;"
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

### Standalone Test Server

The old standalone `test-server` app is not present in this checkout. Use the backend API on `http://localhost:9001/api` and the Jest tests instead.

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
PGPASSWORD=your_password
PGHOST=localhost
PGPORT=5432
EOF

cat > .env.test << EOF
PGDATABASE=footfive_test
PGUSER=jd
PGPASSWORD=your_password
PGHOST=localhost
PGPORT=5432
EOF

# 3. Setup databases
psql -U jd -d postgres -c "CREATE DATABASE footfive_dev;"
psql -U jd -d postgres -c "CREATE DATABASE footfive_test;"

# 4. Seed development database
env -u PGUSER -u PGDATABASE -u PGPASSWORD -u PGHOST -u PGPORT npm run seed

# 5. Start main server
env -u PGUSER -u PGDATABASE -u PGPASSWORD -u PGHOST -u PGPORT npm start
```

---

## Next Steps

After installation, you can:

1. **Explore the API** - Check available endpoints in the codebase
2. **Run the test suite** - `env -u PGUSER -u PGDATABASE -u PGPASSWORD -u PGHOST -u PGPORT npm test` to verify everything works
3. **Review documentation** - See [README.md](README.md) (index), [API_REFERENCE.md](API_REFERENCE.md), and [../LIVING_ARCHITECTURE.md](../LIVING_ARCHITECTURE.md)

---

## Support & Documentation

- **Documentation index:** [docs/README.md](README.md)
- **API reference:** [docs/API_REFERENCE.md](API_REFERENCE.md)
- **File map:** [LIVING_ARCHITECTURE.md](../LIVING_ARCHITECTURE.md) (repository root)
- **Testing:** [TEST_SUITE_REVIEW.md](TEST_SUITE_REVIEW.md) and [AGENTS.md](../AGENTS.md)

---

**Version:** 1.0.0  
**Author:** JD  
**License:** ISC
