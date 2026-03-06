#!/usr/bin/env node
'use strict';

const { TestHarness } = require('./lib/harness');
const { MetricsCollector } = require('./lib/metrics');

const SUITES = {
  connections: () => require('./lib/suites/connections'),
  messaging: () => require('./lib/suites/messaging'),
  channels: () => require('./lib/suites/channels'),
  broadcast: () => require('./lib/suites/broadcast'),
  mixed: () => require('./lib/suites/mixed'),
  'rest-api': () => require('./lib/suites/rest-api'),
  pressure: () => require('./lib/suites/pressure'),
};

function parseArgs(argv) {
  const args = {
    url: process.env.STRESS_SERVER_URL || 'http://localhost:3001',
    users: parseInt(process.env.STRESS_USERS) || 20,
    duration: parseInt(process.env.STRESS_DURATION) || 30,
    suite: 'all',
    cleanup: false,
    verbose: false,
    prefix: 'stresstest',
  };

  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--url':
        args.url = argv[++i];
        break;
      case '--users':
        args.users = parseInt(argv[++i]);
        break;
      case '--duration':
        args.duration = parseInt(argv[++i]);
        break;
      case '--suite':
        args.suite = argv[++i];
        break;
      case '--cleanup':
        args.cleanup = true;
        break;
      case '--verbose':
        args.verbose = true;
        break;
      case '--prefix':
        args.prefix = argv[++i];
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  return args;
}

function printHelp() {
  console.log(`
Nexus Performance / Stress Test Suite

Usage: node stress-test.js [options]

Options:
  --url <url>        Server URL (default: http://localhost:3001, env: STRESS_SERVER_URL)
  --users <n>        Concurrent users (default: 20, env: STRESS_USERS)
  --duration <sec>   Per-suite duration (default: 30, env: STRESS_DURATION)
  --suite <name>     Suite(s) to run, comma-separated or "all" (default: all)
                     Available: ${Object.keys(SUITES).join(', ')}
  --cleanup          Delete test accounts/server after run
  --verbose          Extra logging
  --prefix <str>     Username prefix (default: stresstest)
  -h, --help         Show this help

Examples:
  node stress-test.js --url http://localhost:3003 --suite messaging --users 5 --duration 10
  node stress-test.js --suite connections,broadcast --users 10 --duration 15
  node stress-test.js --cleanup --users 5 --duration 10
`);
}

async function main() {
  const args = parseArgs(process.argv);

  const suitesToRun = args.suite === 'all'
    ? Object.keys(SUITES)
    : args.suite.split(',').map(s => s.trim()).filter(s => SUITES[s]);

  if (suitesToRun.length === 0) {
    console.error(`No valid suites found. Available: ${Object.keys(SUITES).join(', ')}`);
    process.exit(1);
  }

  console.log('='.repeat(80));
  console.log('  Nexus Performance Test Suite');
  console.log('='.repeat(80));
  console.log(`  Server:    ${args.url}`);
  console.log(`  Users:     ${args.users}`);
  console.log(`  Duration:  ${args.duration}s per suite`);
  console.log(`  Suites:    ${suitesToRun.join(', ')}`);
  console.log(`  Cleanup:   ${args.cleanup}`);
  console.log('='.repeat(80));

  // Verify server is reachable
  try {
    const res = await fetch(`${args.url}/health`);
    if (!res.ok) throw new Error(`Health check returned ${res.status}`);
    console.log('\nServer health check passed');
  } catch (err) {
    console.error(`\nCannot reach server at ${args.url}: ${err.message}`);
    process.exit(1);
  }

  const metrics = new MetricsCollector();
  const harness = new TestHarness({
    url: args.url,
    users: args.users,
    prefix: args.prefix,
    verbose: args.verbose,
    cleanup: args.cleanup,
  });

  try {
    await harness.setup();

    for (const suiteName of suitesToRun) {
      metrics.startSuite(suiteName);
      try {
        const suite = SUITES[suiteName]();
        await suite.run(harness, metrics, args.duration);
      } catch (err) {
        console.error(`\nSuite "${suiteName}" failed: ${err.message}`);
        if (args.verbose) console.error(err.stack);
      }
      metrics.endSuite(suiteName);
    }

    metrics.printReport();

    await harness.doCleanup();
  } catch (err) {
    console.error(`\nFatal error: ${err.message}`);
    if (args.verbose) console.error(err.stack);
    process.exitCode = 1;
  } finally {
    await harness.teardown();
  }
}

main();
