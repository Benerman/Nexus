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

  // Coverage configuration
  collectCoverageFrom: [
    'server/validation.js',
    'server/utils.js',
    'server/config.js',
    'server/default-sounds.js',
    'client/src/config.js',
    'client/src/utils/socketTimeout.js',
  ],
  coverageDirectory: '<rootDir>/tests/coverage',
  coverageReporters: ['text', 'text-summary', 'lcov'],
};
