const path = require('path');

module.exports = {
  rootDir: path.resolve(__dirname, '..'),
  testMatch: ['<rootDir>/tests/automated/**/*.test.js'],
  testEnvironment: 'node',
  forceExit: true,

  // Transform ES modules from client/src using babel
  transform: {
    '^.+\\.js$': ['babel-jest', { configFile: path.resolve(__dirname, 'babel.config.js') }],
  },
  transformIgnorePatterns: [
    '/node_modules/',
  ],

  // Allow resolving React packages from client/node_modules for client tests
  modulePaths: ['<rootDir>/client/node_modules'],

  // Coverage configuration
  collectCoverageFrom: [
    'server/validation.js',
    'server/utils.js',
    'server/config.js',
    'server/default-sounds.js',
    'client/src/config.js',
    'client/src/utils/socketTimeout.js',
    'client/src/components/ReportModal.js',
    'client/src/hooks/useLongPress.js',
  ],
  coverageDirectory: '<rootDir>/tests/coverage',
  coverageReporters: ['text', 'text-summary', 'lcov'],
};
