module.exports = {
  // Test environment
  testEnvironment: 'node',

  // Set NODE_ENV to test before running tests
  setupFiles: ['<rootDir>/__tests__/setup/jest.setup.js'],

  // Setup and teardown
  globalSetup: '<rootDir>/__tests__/setup/globalSetup.js',
  globalTeardown: '<rootDir>/__tests__/setup/globalTeardown.js',

  // Test match patterns
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/__tests__/**/*.spec.js'
  ],

  // Coverage configuration
  collectCoverageFrom: [
    'models/**/*.js',
    'controllers/**/*.js',
    'routes/**/*.js',
    'Gamelogic/**/*.js',
    '!node_modules/**',
    '!db/**',
    '!test-helpers/**',
    '!listen.js',
    '!test*.js'
  ],

  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },

  // Coverage reporters
  coverageReporters: ['text', 'lcov', 'html'],

  // Test timeout (increase for database operations)
  testTimeout: 10000,

  // Clear mocks between tests
  clearMocks: true,

  // Verbose output
  verbose: true,

  // Force exit after tests complete
  forceExit: true,

  // Detect open handles
  detectOpenHandles: true
};

