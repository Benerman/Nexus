module.exports = {
  testMatch: ['<rootDir>/specs/**/*.test.js'],
  testEnvironment: 'node',
  testSequencer: '<rootDir>/setup/sequencer.js',
  globalSetup: '<rootDir>/setup/globalSetup.js',
  globalTeardown: '<rootDir>/setup/globalTeardown.js',
  testTimeout: 30000,
  maxWorkers: 1,
  forceExit: true,
  verbose: true,
};
