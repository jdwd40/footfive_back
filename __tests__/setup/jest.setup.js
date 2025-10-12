/**
 * Jest Setup File
 * Runs before each test file
 * Sets environment variables needed for tests
 */

// Force test environment
process.env.NODE_ENV = 'test';

// Set test database
process.env.PGDATABASE = 'footfive_test';

// Suppress console logs during tests (optional - comment out if you need to debug)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// };

