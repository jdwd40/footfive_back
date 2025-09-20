const { Pool } = require('pg');

// Force test environment
const originalEnv = process.env.NODE_ENV;
process.env.NODE_ENV = 'test';

require('dotenv').config({
  path: `${__dirname}/../.env.test`,
});

if (!process.env.PGDATABASE) {
  throw new Error('PGDATABASE not set for test environment');
}

if (process.env.PGDATABASE !== 'footfive_test') {
  console.error(`Expected test database 'footfive_test', got '${process.env.PGDATABASE}'`);
  console.error(`Original NODE_ENV was: ${originalEnv}`);
  throw new Error('Test database must be named footfive_test for safety');
}

console.log('Connected to test database:', process.env.PGDATABASE);

module.exports = new Pool();
