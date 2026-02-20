import React, { useState } from 'react';
import './ServerSetupScreen.css';
import { HexagonIcon } from './icons';
import { setServerUrl } from '../config';

export default function ServerSetupScreen({ onConnect }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [testing, setTesting] = useState(false);

  const normalizeUrl = (raw) => {
    let u = raw.trim().replace(/\/+$/, '');
    if (u && !/^https?:\/\//i.test(u)) {
      u = 'https://' + u;
    }
    return u;
  };

  const handleConnect = async (e) => {
    e.preventDefault();
    setError('');

    const normalized = normalizeUrl(url);
    if (!normalized) {
      setError('Please enter a server URL');
      return;
    }

    try {
      new URL(normalized);
    } catch {
      setError('Invalid URL format');
      return;
    }

    setTesting(true);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${normalized}/api/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) throw new Error('Server responded with an error');

      setServerUrl(normalized);
      onConnect(normalized);
    } catch (err) {
      if (err.name === 'AbortError') {
        setError('Connection timed out. Check the URL and try again.');
      } else {
        setError('Could not connect to server. Check the URL and make sure the server is running.');
      }
      setTesting(false);
    }
  };

  return (
    <div className="server-setup-screen">
      <div className="server-setup-card">
        <div className="login-logo">
          <div className="login-logo-icon">
            <HexagonIcon size={48} color="#ed4245" />
          </div>
          <div className="login-logo-text">NEXUS</div>
        </div>
        <h1 className="server-setup-title">Connect to a Server</h1>
        <p className="server-setup-subtitle">
          Enter the URL of your Nexus server to get started.
        </p>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleConnect} className="server-setup-form">
          <div className="login-field">
            <label className="login-label">SERVER URL</label>
            <input
              type="text"
              className="login-input"
              placeholder="nexus.example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={testing}
              autoFocus
            />
            <span className="server-setup-hint">
              Example: https://nexus.example.com or 192.168.1.100:3001
            </span>
          </div>
          <button
            type="submit"
            className="login-btn"
            disabled={!url.trim() || testing}
          >
            {testing ? 'Connecting...' : 'Connect'}
          </button>
        </form>
      </div>
    </div>
  );
}
