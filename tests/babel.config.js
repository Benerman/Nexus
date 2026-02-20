const path = require('path');

module.exports = {
  presets: [
    [
      path.resolve(__dirname, '..', 'server', 'node_modules', '@babel', 'preset-env'),
      { targets: { node: 'current' } },
    ],
  ],
};
