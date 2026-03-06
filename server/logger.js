const winston = require('winston');
require('winston-daily-rotate-file');
const path = require('path');
const config = require('./config');

const LOG_DIR = path.join(__dirname, 'data', 'logs');

// ─── Formats ─────────────────────────────────────────────────────────────────

// Extract [Domain] prefix from first arg for structured metadata
function parseDomain(args) {
  if (args.length > 0 && typeof args[0] === 'string') {
    const match = args[0].match(/^\[([^\]]+)\]\s*(.*)/);
    if (match) {
      return { domain: match[1], args: [match[2], ...args.slice(1)] };
    }
  }
  return { domain: null, args };
}

// Format args the way console.log does (space-joined, errors get stack)
function formatArgs(args) {
  return args.map(a => {
    if (a instanceof Error) return a.stack || a.message;
    if (typeof a === 'object' && a !== null) {
      try { return JSON.stringify(a); } catch { return String(a); }
    }
    return String(a);
  }).join(' ');
}

// Console transport: human-readable, preserves [Domain] style for docker logs
const consoleFormat = winston.format.printf(({ level, message, timestamp, domain }) => {
  const prefix = domain ? `[${domain}] ` : '';
  return `${timestamp} ${level}: ${prefix}${message}`;
});

// ─── Logger instance ─────────────────────────────────────────────────────────

const logger = winston.createLogger({
  level: config.server.logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true })
  ),
  transports: [
    // Console: human-readable for docker logs
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        consoleFormat
      )
    }),

    // Combined file: JSON, daily rotation, 14-day retention
    new winston.transports.DailyRotateFile({
      dirname: LOG_DIR,
      filename: 'nexus-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '50m',
      maxFiles: '14d',
      zippedArchive: true,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    }),

    // Error file: error-level only
    new winston.transports.DailyRotateFile({
      dirname: LOG_DIR,
      filename: 'nexus-error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '50m',
      maxFiles: '14d',
      zippedArchive: true,
      level: 'error',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    })
  ]
});

// ─── Console monkey-patch ────────────────────────────────────────────────────

const originalConsole = {
  log: console.log.bind(console),
  error: console.error.bind(console),
  warn: console.warn.bind(console),
  info: console.info.bind(console),
  debug: console.debug.bind(console)
};

function overrideConsole(method, winstonLevel) {
  console[method] = (...args) => {
    const { domain, args: cleanArgs } = parseDomain(args);
    const message = formatArgs(cleanArgs);
    const meta = domain ? { domain } : {};
    logger.log(winstonLevel, message, meta);
  };
}

overrideConsole('log', 'info');
overrideConsole('info', 'info');
overrideConsole('error', 'error');
overrideConsole('warn', 'warn');
overrideConsole('debug', 'debug');

module.exports = { logger, originalConsole };
