# Mutation tests

Coverage measures whether a line **executed**. It says nothing about whether any
assertion would notice if that line were **wrong**. A test that calls
`sendNotification('Hi')` and asserts nothing at all reports 100% coverage of
that function and provides zero feedback.

This runner answers the second question. It edits a source file to break one
specific behaviour, runs the unit tests, and checks they go red — then restores
the file. A mutation that *survives* (tests still pass) marks a line the suite
executes without asserting anything useful about it.

## Running

Needs `npm ci` in both `server/` and `client/` first, same as the unit suite.

```bash
node tests/mutation/run-mutations.js
```

```bash
node tests/mutation/run-mutations.js --list
node tests/mutation/run-mutations.js --filter getPlatform
node tests/mutation/run-mutations.js --json mutation-results.json
```

Exits non-zero if any mutation survives, any pattern fails to apply, or the
unmutated control run is not green.

The runner rewrites files under `client/` and `server/` in place. It refuses to
start if those files have uncommitted changes, keeps an out-of-repo backup for
the duration, and restores on both normal exit and Ctrl-C. If it ever does die
somewhere it cannot recover from, it prints the backup location.

## Reading the output

```
[killed] getPlatform: drop win64 from the Windows check — 1 test(s) failed
      · getPlatform returns win32 for user agent Mozilla/5.0 (Win64)
```

The `pinpointed` figure in the summary counts mutations killed by **exactly
one** test. That number matters more than the raw kill count: a brittle suite
also kills mutations, it just fails thirty tests at once and tells you nothing
about what broke. One mutation → one failing test whose name describes the
broken behaviour is diagnostic feedback, which is the thing worth paying for.

## Adding a mutation

Entries live in `mutations.js`. Pick a decision the code makes, invert or weaken
it, and point `tests` at the suite that should care:

```js
{
  id: 'openExternalUrl: drop noopener,noreferrer from window.open',
  file: 'client/src/config.js',
  tests: 'automated/client/configPlatform\\.test\\.js',
  find: "window.open(url, '_blank', 'noopener,noreferrer');",
  repl: "window.open(url, '_blank');",
}
```

Two rules:

- **Scope `tests` narrowly.** Pointing it at one test file is what makes a kill
  attributable to *those* tests rather than to coverage that happens to exist
  elsewhere in the suite.
- **`find` must match exactly once.** The runner reports `NOT APPLIED` and fails
  rather than crediting a kill it never earned. This check is load-bearing: the
  first draft of this harness silently failed to apply 7 of 20 mutations because
  the patterns used `\n` while a Windows checkout has CRLF on disk, and without
  the match-count assertion it would have reported a clean sweep of only the 13
  that ran. The runner now rewrites patterns to the file's own line endings.

Expect `NOT APPLIED` when the source is legitimately refactored — that is the
harness asking to be updated, not a test failure.

## What this does and does not prove

It proves the assertions in the named test files are load-bearing: break the
behaviour, and a specific test objects.

It does **not** prove:

1. **That the mutation set is complete.** These entries are hand-written, so
   they are biased toward behaviour someone already thought to test. A real tool
   ([Stryker](https://stryker-mutator.io/)) enumerates mutations mechanically
   and will find survivors this list does not. A clean sweep here means "the
   mutations we thought of are all caught", not "the tests are complete".
2. **That the behaviour is correct.** These are characterization tests. They
   pin down what the code currently does. If `getPlatform`'s `'mac os'`
   substring match is a poor heuristic, this harness now helps cement it. It
   defends against regression, not against a wrong design.
3. **That the real native integrations work.** The client config tests stub the
   Tauri and Capacitor plugins, so they verify `config.js`'s dispatch logic
   only. If `@tauri-apps/plugin-notification` renames `isPermissionGranted` in a
   major bump, every one of those unit tests stays green while desktop
   notifications break. That seam belongs to the e2e suite. It is inherent to
   mocking and worth remembering before reading a green run as more reassurance
   than it is.

## Not wired into CI

Deliberately. This is a tool for validating a suite when you have reason to
doubt it — after writing tests to satisfy a coverage gate, or when a bug ships
past a green build — not a gate of its own. It also rewrites tracked source
files, which is fine on an ephemeral runner but wants a conscious decision
rather than a default.
