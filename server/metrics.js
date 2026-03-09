// ─── Application Metrics Collector ──────────────────────────────────────────
// Tracks connections, message rates, API requests, errors, memory, and uptime.
// Uses rolling windows (1m, 5m, 15m) for rate calculations.

const startTime = Date.now();

// ─── Counters ───────────────────────────────────────────────────────────────
let connections = 0;
let peakConnections = 0;
let totalMessages = 0;
let totalApiRequests = 0;
let totalErrors = 0;
const errorsByType = {};

// ─── Rolling window buffers ─────────────────────────────────────────────────
// Each buffer stores timestamps of events for rate-over-time calculations.
const WINDOW_1M = 60 * 1000;
const WINDOW_5M = 5 * 60 * 1000;
const WINDOW_15M = 15 * 60 * 1000;

const messageTimestamps = [];
const apiTimestamps = [];

function pruneTimestamps(arr, maxAge) {
  const cutoff = Date.now() - maxAge;
  while (arr.length > 0 && arr[0] < cutoff) {
    arr.shift();
  }
}

function getRate(arr, windowMs) {
  pruneTimestamps(arr, WINDOW_15M); // prune oldest
  const cutoff = Date.now() - windowMs;
  let count = 0;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] >= cutoff) count++;
    else break;
  }
  return Math.round((count / (windowMs / 1000)) * 100) / 100; // per second, 2 decimal places
}

// ─── Recording functions ────────────────────────────────────────────────────

function recordConnection() {
  connections++;
  if (connections > peakConnections) peakConnections = connections;
}

function recordDisconnection() {
  connections = Math.max(0, connections - 1);
}

function recordMessage() {
  totalMessages++;
  messageTimestamps.push(Date.now());
}

function recordApiRequest() {
  totalApiRequests++;
  apiTimestamps.push(Date.now());
}

function recordError(type) {
  totalErrors++;
  const key = type || 'unknown';
  errorsByType[key] = (errorsByType[key] || 0) + 1;
}

// ─── Snapshot ───────────────────────────────────────────────────────────────

function getMetrics() {
  const mem = process.memoryUsage();
  const uptimeMs = Date.now() - startTime;

  return {
    connections: {
      current: connections,
      peak: peakConnections,
    },
    messages: {
      total: totalMessages,
      rate_1m: getRate(messageTimestamps, WINDOW_1M),
      rate_5m: getRate(messageTimestamps, WINDOW_5M),
      rate_15m: getRate(messageTimestamps, WINDOW_15M),
    },
    api: {
      total: totalApiRequests,
      rate_1m: getRate(apiTimestamps, WINDOW_1M),
      rate_5m: getRate(apiTimestamps, WINDOW_5M),
      rate_15m: getRate(apiTimestamps, WINDOW_15M),
      errors: totalErrors,
      errorsByType: { ...errorsByType },
    },
    system: {
      memory_mb: Math.round(mem.rss / 1024 / 1024 * 100) / 100,
      heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024 * 100) / 100,
      heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024 * 100) / 100,
      uptime_seconds: Math.round(uptimeMs / 1000),
      uptime_hours: Math.round(uptimeMs / 3600000 * 100) / 100,
    },
    timestamp: new Date().toISOString(),
  };
}

// ─── Periodic cleanup ───────────────────────────────────────────────────────
// Prune rolling window buffers every 5 minutes to prevent unbounded growth
setInterval(() => {
  pruneTimestamps(messageTimestamps, WINDOW_15M);
  pruneTimestamps(apiTimestamps, WINDOW_15M);
}, 5 * 60 * 1000);

module.exports = {
  recordConnection,
  recordDisconnection,
  recordMessage,
  recordApiRequest,
  recordError,
  getMetrics,
};
