'use strict';

const { sleep } = require('../harness');

async function run(harness, metrics, duration) {
  console.log('\n=== REST API Tests ===\n');

  await testHealthThroughput(harness, metrics, duration);
  await testConcurrentLogins(harness, metrics);
  await testRateLimitValidation(harness, metrics);
}

async function testHealthThroughput(harness, metrics, duration) {
  const label = 'rest_health';
  const testDuration = Math.min(duration, 15);
  const progress = metrics.createProgress(testDuration, 'Health endpoint throughput');
  progress.start();

  const endTime = Date.now() + testDuration * 1000;
  const concurrency = 5;

  const workers = Array.from({ length: concurrency }, async () => {
    while (Date.now() < endTime) {
      const start = Date.now();
      try {
        const res = await fetch(`${harness.serverUrl}/health`);
        if (res.ok) {
          metrics.record(label, Date.now() - start, true);
        } else if (res.status === 429) {
          metrics.record(label, Date.now() - start, false, true);
        } else {
          metrics.record(label, Date.now() - start, false);
        }
      } catch (err) {
        metrics.record(label, Date.now() - start, false);
        metrics.recordError(label, err.message?.slice(0, 50));
      }
      progress.tick();
    }
  });

  await Promise.all(workers);
  progress.stop();
}

async function testConcurrentLogins(harness, metrics) {
  const label = 'rest_concurrent_login';
  const progress = metrics.createProgress(0, 'Concurrent logins');
  progress.start();

  // Login all accounts concurrently
  const promises = harness.accounts.map(async (acct) => {
    const start = Date.now();
    try {
      const res = await fetch(`${harness.serverUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: acct.username, password: acct.password }),
      });
      const latency = Date.now() - start;

      if (res.ok) {
        metrics.record(label, latency, true);
      } else if (res.status === 429) {
        metrics.record(label, latency, false, true);
      } else {
        metrics.record(label, latency, false);
        metrics.recordError(label, `status_${res.status}`);
      }
    } catch (err) {
      metrics.record(label, Date.now() - start, false);
      metrics.recordError(label, err.message?.slice(0, 50));
    }
    progress.tick();
  });

  await Promise.all(promises);
  progress.stop();

  // Cool down for rate limits
  await sleep(11000);
}

async function testRateLimitValidation(harness, metrics) {
  const label = 'rest_rate_limit';
  const progress = metrics.createProgress(0, 'Rate limit validation');
  progress.start();

  const totalRequests = 15;
  let passed = 0;
  let rejected = 0;

  // Fire 15 rapid requests to /api/health (rate limited endpoint)
  const promises = Array.from({ length: totalRequests }, async (_, i) => {
    const start = Date.now();
    try {
      const res = await fetch(`${harness.serverUrl}/api/health`);
      const latency = Date.now() - start;

      if (res.status === 429) {
        metrics.record(label, latency, false, true);
        rejected++;
      } else {
        metrics.record(label, latency, true);
        passed++;
      }
    } catch (err) {
      metrics.record(label, Date.now() - start, false);
      metrics.recordError(label, err.message?.slice(0, 50));
    }
    progress.tick();
  });

  await Promise.all(promises);
  console.log(`  Rate limit: ${passed} passed, ${rejected} rejected out of ${totalRequests} rapid requests`);
  progress.stop();

  // Cool down
  await sleep(11000);
}

module.exports = { run };
