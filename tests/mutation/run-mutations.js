#!/usr/bin/env node
/**
 * Mutation test runner.
 *
 * Coverage proves a line executed. It says nothing about whether any assertion
 * would notice if that line were wrong. This runner answers the second
 * question: it breaks the source on purpose, one edit at a time, and checks
 * that the unit tests go red.
 *
 * A mutation that "survives" (tests still pass) marks a line the suite executes
 * without asserting anything useful about it.
 *
 *   node tests/mutation/run-mutations.js
 *   node tests/mutation/run-mutations.js --list
 *   node tests/mutation/run-mutations.js --filter getPlatform
 *   node tests/mutation/run-mutations.js --json out.json
 *
 * Exits non-zero if any mutation survives, any pattern fails to apply, or the
 * unmutated control run is not green.
 *
 * See README.md in this directory for what this does and does not prove.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const mutations = require('./mutations');

const repoRoot = path.resolve(__dirname, '..', '..');
const jestBin = path.join(repoRoot, 'server', 'node_modules', 'jest', 'bin', 'jest.js');
const jestConfig = path.join(repoRoot, 'tests', 'jest.config.js');

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { list: false, filter: null, json: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--list') opts.list = true;
    else if (arg === '--filter') opts.filter = argv[++i];
    else if (arg === '--json') opts.json = argv[++i];
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else die(`Unknown argument: ${arg}`);
  }
  if (opts.filter === undefined) die('--filter needs a value');
  if (opts.json === undefined) die('--json needs a value');
  return opts;
}

function die(message) {
  console.error(`error: ${message}`);
  process.exit(2);
}

const opts = parseArgs(process.argv.slice(2));

if (opts.help) {
  console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^#!.*\n/, ''));
  process.exit(0);
}

const selected = opts.filter
  ? mutations.filter(m => m.id.includes(opts.filter) || m.file.includes(opts.filter))
  : mutations;

if (opts.list) {
  for (const m of selected) console.log(`${m.file}\n  ${m.id}`);
  process.exit(0);
}

if (!selected.length) die(`No mutations matched --filter ${opts.filter}`);

// ---------------------------------------------------------------------------
// Preconditions
// ---------------------------------------------------------------------------

if (!fs.existsSync(jestBin)) {
  die(
    'jest not found at server/node_modules/jest.\n' +
      '       Run `npm ci` in both server/ and client/ first (jest.config.js resolves\n' +
      "       React packages from client/node_modules)."
  );
}

const targetFiles = [...new Set(selected.map(m => m.file))];

/**
 * Refuse to run against uncommitted edits to the files we are about to rewrite:
 * a crash mid-run would otherwise destroy work. core.fileMode=false keeps a
 * Windows checkout's mode-only churn from looking like a real change.
 */
function assertTargetsCommitted() {
  try {
    execFileSync('git', ['-c', 'core.fileMode=false', 'diff', '--quiet', '--', ...targetFiles], {
      cwd: repoRoot,
      stdio: 'ignore',
    });
  } catch (e) {
    if (e.status === 1) {
      die(
        'the files this run mutates have uncommitted changes:\n' +
          targetFiles.map(f => `         ${f}`).join('\n') +
          '\n       Commit or stash them first — the runner rewrites these files in place.'
      );
    }
    console.warn('warning: could not check git status, continuing without that safety net');
  }
}

assertTargetsCommitted();

// ---------------------------------------------------------------------------
// Backup / restore
// ---------------------------------------------------------------------------

const pristine = new Map();
for (const file of targetFiles) {
  pristine.set(file, fs.readFileSync(path.join(repoRoot, file), 'utf8'));
}

// A second copy outside the repo, in case the process dies somewhere the
// finally blocks cannot reach.
const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-mutation-'));
for (const [file, content] of pristine) {
  const dest = path.join(backupDir, file.replace(/[\\/]/g, '__'));
  fs.writeFileSync(dest, content);
}

function restoreAll() {
  for (const [file, content] of pristine) {
    const abs = path.join(repoRoot, file);
    if (fs.readFileSync(abs, 'utf8') !== content) fs.writeFileSync(abs, content);
  }
}

let restoredCleanly = false;

process.on('SIGINT', () => {
  restoreAll();
  console.log('\ninterrupted — sources restored');
  process.exit(130);
});

process.on('exit', () => {
  restoreAll();
  if (restoredCleanly) {
    fs.rmSync(backupDir, { recursive: true, force: true });
  } else {
    console.error(`\nsource backups kept at ${backupDir}`);
  }
});

// ---------------------------------------------------------------------------
// Jest
// ---------------------------------------------------------------------------

function runJest(testPathPattern) {
  const args = [
    jestBin,
    '--config', jestConfig,
    '--ci',
    '--forceExit',
    '--json',
    '--testPathPattern', testPathPattern,
  ];
  let stdout;
  try {
    stdout = execFileSync(process.execPath, args, {
      cwd: repoRoot,
      env: { ...process.env, NODE_ENV: 'test' },
      encoding: 'utf8',
      // jest writes JSON to stdout and its human report to stderr.
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    stdout = e.stdout || '';
  }
  const start = stdout.indexOf('{');
  if (start === -1) {
    return { success: false, unparseable: true, numPassedTests: 0, numFailedTests: 0 };
  }
  try {
    return JSON.parse(stdout.slice(start));
  } catch {
    return { success: false, unparseable: true, numPassedTests: 0, numFailedTests: 0 };
  }
}

function failedTestNames(report) {
  const names = [];
  for (const suite of report.testResults || []) {
    const assertions = suite.assertionResults || [];
    // A suite that blew up before running anything still needs reporting.
    if (!assertions.length && suite.message) names.push(`SUITE ERROR: ${suite.name}`);
    for (const a of assertions) if (a.status === 'failed') names.push(a.fullName);
  }
  return names;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log('=== control: unmutated sources ===');
let controlFailed = false;
for (const pattern of [...new Set(selected.map(m => m.tests))]) {
  const report = runJest(pattern);
  const status = report.success ? 'PASS' : 'FAIL';
  console.log(
    `  [${status}] ${pattern}  (${report.numPassedTests} passed, ${report.numFailedTests} failed)`
  );
  if (!report.success) controlFailed = true;
}

if (controlFailed) {
  console.error('\nControl run is not green — fix the suite before trusting any mutation result.');
  restoredCleanly = true;
  process.exit(1);
}

console.log(`\n=== ${selected.length} mutation(s) ===`);
const results = [];

for (const mutation of selected) {
  const source = pristine.get(mutation.file);
  // Patterns are authored with \n; a Windows checkout is CRLF on disk. Without
  // this the pattern silently misses and the mutation is never applied — which
  // would read as a kill it did not earn.
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const find = mutation.find.split('\n').join(eol);
  const repl = mutation.repl.split('\n').join(eol);

  const hits = source.split(find).length - 1;
  if (hits !== 1) {
    results.push({ id: mutation.id, file: mutation.file, verdict: 'NOT APPLIED', hits });
    console.log(`  [NOT APPLIED] ${mutation.id}`);
    console.log(`        pattern matched ${hits}x (expected exactly 1) — has the source moved on?`);
    continue;
  }

  const abs = path.join(repoRoot, mutation.file);
  let report;
  try {
    fs.writeFileSync(abs, source.replace(find, repl));
    report = runJest(mutation.tests);
  } finally {
    fs.writeFileSync(abs, source);
  }

  if (report.unparseable) {
    results.push({ id: mutation.id, file: mutation.file, verdict: 'RUNNER ERROR' });
    console.log(`  [RUNNER ERROR] ${mutation.id} — could not parse jest output`);
    continue;
  }

  const failed = failedTestNames(report);
  const verdict = report.success ? 'SURVIVED' : 'killed';
  results.push({
    id: mutation.id,
    file: mutation.file,
    verdict,
    failedCount: failed.length,
    failedTests: failed,
  });

  if (verdict === 'killed') {
    console.log(`  [killed] ${mutation.id} — ${failed.length} test(s) failed`);
    for (const name of failed.slice(0, 3)) console.log(`        · ${name}`);
    if (failed.length > 3) console.log(`        · … and ${failed.length - 3} more`);
  } else {
    console.log(`  [SURVIVED] ${mutation.id}`);
    console.log('        Tests still pass with this behaviour broken.');
  }
}

restoreAll();
restoredCleanly = true;

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const killed = results.filter(r => r.verdict === 'killed');
const survived = results.filter(r => r.verdict === 'SURVIVED');
const broken = results.filter(r => r.verdict === 'NOT APPLIED' || r.verdict === 'RUNNER ERROR');

console.log('\n=== summary ===');
console.log(`  killed:      ${killed.length}/${results.length}`);
if (survived.length) {
  console.log(`  survived:    ${survived.length}`);
  for (const r of survived) console.log(`      - ${r.id}`);
}
if (broken.length) {
  console.log(`  not run:     ${broken.length}`);
  for (const r of broken) console.log(`      - ${r.id} (${r.verdict})`);
}

// A mutation killed by exactly one test points at the broken behaviour rather
// than just reporting that something, somewhere, went red.
const pinpointed = killed.filter(r => r.failedCount === 1).length;
console.log(`  pinpointed:  ${pinpointed}/${killed.length} killed by exactly one test`);

if (opts.json) {
  fs.writeFileSync(path.resolve(opts.json), `${JSON.stringify(results, null, 2)}\n`);
  console.log(`  results written to ${opts.json}`);
}

if (survived.length || broken.length) {
  console.log('\nA survivor means the tests execute that line without asserting on it.');
  console.log('A "not applied" entry means the pattern no longer matches — update mutations.js.');
  process.exit(1);
}

console.log('\nAll mutations killed.');
