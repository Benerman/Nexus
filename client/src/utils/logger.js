import { getServerUrl } from '../config';

const MAX_ENTRIES = 1000;
const SHIP_DEBOUNCE_MS = 5000;
const SHIP_BATCH_SIZE = 50;

class ClientLogger {
  constructor() {
    this._entries = [];
    this._token = null;
    this._shipTimer = null;
    this._originalConsole = {
      log: console.log.bind(console),
      error: console.error.bind(console),
      warn: console.warn.bind(console),
      info: console.info.bind(console),
      debug: console.debug.bind(console),
    };

    // Override console methods
    this._override('log', 'info');
    this._override('info', 'info');
    this._override('error', 'error');
    this._override('warn', 'warn');
    this._override('debug', 'debug');

    // Global error handlers
    window.addEventListener('error', (e) => {
      this._push('error', `Uncaught: ${e.message} at ${e.filename}:${e.lineno}:${e.colno}`);
    });
    window.addEventListener('unhandledrejection', (e) => {
      const reason = e.reason instanceof Error ? e.reason.stack || e.reason.message : String(e.reason);
      this._push('error', `Unhandled rejection: ${reason}`);
    });
  }

  _override(method, level) {
    const orig = this._originalConsole[method];
    console[method] = (...args) => {
      this._push(level, args.map(a => {
        if (a instanceof Error) return a.stack || a.message;
        if (typeof a === 'object' && a !== null) {
          try { return JSON.stringify(a); } catch { return String(a); }
        }
        return String(a);
      }).join(' '));
      orig(...args);
    };
  }

  _push(level, msg) {
    this._entries.push({ ts: new Date().toISOString(), level, msg });
    if (this._entries.length > MAX_ENTRIES) {
      this._entries.splice(0, this._entries.length - MAX_ENTRIES);
    }
    if (level === 'error' && this._token) {
      this._scheduleShip();
    }
  }

  _scheduleShip() {
    if (this._shipTimer) return;
    this._shipTimer = setTimeout(() => {
      this._shipTimer = null;
      this._shipErrors();
    }, SHIP_DEBOUNCE_MS);
  }

  _shipErrors() {
    if (!this._token) return;
    const errors = this._entries.filter(e => e.level === 'error').slice(-SHIP_BATCH_SIZE);
    if (errors.length === 0) return;
    const url = getServerUrl();
    fetch(`${url}/api/client-logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this._token}` },
      body: JSON.stringify({ logs: errors }),
    }).catch(() => {}); // silently fail
  }

  setToken(token) {
    this._token = token;
  }

  getEntries() {
    return [...this._entries];
  }

  download() {
    const lines = this._entries.map(e => `${e.ts} [${e.level.toUpperCase()}] ${e.msg}`).join('\n');
    const blob = new Blob([lines], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `nexus-client-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}

const clientLogger = new ClientLogger();
export default clientLogger;
