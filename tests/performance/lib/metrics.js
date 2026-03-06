'use strict';

class OperationMetrics {
  constructor(name) {
    this.name = name;
    this.latencies = [];
    this.successes = 0;
    this.errors = 0;
    this.rateLimited = 0;
    this.errorTypes = {};
    this.startTime = null;
    this.endTime = null;
  }

  record(latencyMs, success, rateLimited = false) {
    if (!this.startTime) this.startTime = Date.now();
    this.endTime = Date.now();
    this.latencies.push(latencyMs);
    if (rateLimited) {
      this.rateLimited++;
    } else if (success) {
      this.successes++;
    } else {
      this.errors++;
    }
  }

  recordError(errorType) {
    if (!this.startTime) this.startTime = Date.now();
    this.endTime = Date.now();
    this.errors++;
    this.errorTypes[errorType] = (this.errorTypes[errorType] || 0) + 1;
  }

  get totalOps() {
    return this.successes + this.errors + this.rateLimited;
  }

  get durationSec() {
    if (!this.startTime || !this.endTime) return 0;
    return (this.endTime - this.startTime) / 1000;
  }

  get throughput() {
    const dur = this.durationSec;
    return dur > 0 ? this.totalOps / dur : 0;
  }

  get errorRate() {
    return this.totalOps > 0 ? (this.errors / this.totalOps) * 100 : 0;
  }

  percentile(p) {
    if (this.latencies.length === 0) return 0;
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  get stats() {
    if (this.latencies.length === 0) {
      return { min: 0, p50: 0, p95: 0, p99: 0, max: 0, avg: 0 };
    }
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    return {
      min: sorted[0],
      p50: this.percentile(50),
      p95: this.percentile(95),
      p99: this.percentile(99),
      max: sorted[sorted.length - 1],
      avg: sum / sorted.length,
    };
  }
}

class ProgressTracker {
  constructor(totalDurationSec, label) {
    this.totalDurationSec = totalDurationSec;
    this.label = label;
    this.startTime = Date.now();
    this.opsCount = 0;
    this.interval = null;
  }

  start() {
    this.startTime = Date.now();
    this.interval = setInterval(() => this.print(), 500);
  }

  tick(count = 1) {
    this.opsCount += count;
  }

  print() {
    const elapsed = (Date.now() - this.startTime) / 1000;
    const opsPerSec = elapsed > 0 ? (this.opsCount / elapsed).toFixed(1) : '0.0';
    const bar = this.totalDurationSec > 0
      ? `[${elapsed.toFixed(1)}s/${this.totalDurationSec}s]`
      : `[${elapsed.toFixed(1)}s]`;
    process.stdout.write(`\r  ${this.label} ${bar} ${this.opsCount} ops (${opsPerSec} ops/sec)   `);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.print();
    process.stdout.write('\n');
  }
}

class MetricsCollector {
  constructor() {
    this.operations = new Map();
    this.suiteResults = [];
  }

  getOrCreate(opName) {
    if (!this.operations.has(opName)) {
      this.operations.set(opName, new OperationMetrics(opName));
    }
    return this.operations.get(opName);
  }

  record(opName, latencyMs, success, rateLimited = false) {
    this.getOrCreate(opName).record(latencyMs, success, rateLimited);
  }

  recordError(opName, errorType) {
    this.getOrCreate(opName).recordError(errorType);
  }

  startSuite(name) {
    this.currentSuite = { name, startTime: Date.now() };
  }

  endSuite(name) {
    if (this.currentSuite && this.currentSuite.name === name) {
      this.currentSuite.endTime = Date.now();
      this.suiteResults.push(this.currentSuite);
      this.currentSuite = null;
    }
  }

  createProgress(durationSec, label) {
    return new ProgressTracker(durationSec, label);
  }

  printReport() {
    console.log('\n' + '='.repeat(80));
    console.log('  PERFORMANCE TEST REPORT');
    console.log('='.repeat(80));

    if (this.suiteResults.length > 0) {
      console.log('\n  Suite Timings:');
      for (const s of this.suiteResults) {
        const dur = ((s.endTime - s.startTime) / 1000).toFixed(1);
        console.log(`    ${s.name}: ${dur}s`);
      }
    }

    for (const [name, op] of this.operations) {
      const stats = op.stats;
      console.log(`\n--- ${name} ---`);
      console.log(`  Total ops:     ${op.totalOps}`);
      console.log(`  Successes:     ${op.successes}`);
      console.log(`  Errors:        ${op.errors} (${op.errorRate.toFixed(2)}%)`);
      if (op.rateLimited > 0) {
        console.log(`  Rate limited:  ${op.rateLimited}`);
      }
      console.log(`  Throughput:    ${op.throughput.toFixed(2)} ops/sec`);
      console.log(`  Duration:      ${op.durationSec.toFixed(1)}s`);

      if (op.latencies.length > 0) {
        console.log('  Latency (ms):');
        console.log(`    min:  ${stats.min.toFixed(0).padEnd(8)} p50:  ${stats.p50.toFixed(0).padEnd(8)} p95:  ${stats.p95.toFixed(0)}`);
        console.log(`    p99:  ${stats.p99.toFixed(0).padEnd(8)} max:  ${stats.max.toFixed(0).padEnd(8)} avg:  ${stats.avg.toFixed(1)}`);
      }

      if (Object.keys(op.errorTypes).length > 0) {
        console.log('  Error breakdown:');
        for (const [type, count] of Object.entries(op.errorTypes)) {
          console.log(`    ${type}: ${count}`);
        }
      }
    }

    console.log('\n' + '='.repeat(80));
  }
}

module.exports = { MetricsCollector, OperationMetrics, ProgressTracker };
