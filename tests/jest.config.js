const path = require('path');

module.exports = {
  rootDir: path.resolve(__dirname, '..'),
  testMatch: ['<rootDir>/tests/automated/**/*.test.js'],
  testEnvironment: 'node',
  forceExit: true,
};
