import React, { useState } from 'react';
import './LoginScreen.css';
import { HexagonIcon } from './icons';
import { getServerUrl } from '../config';

export default function LoginScreen({ onLogin, pendingInvite, onChangeServer }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const usernameRegex = /^[a-zA-Z0-9 _\-\.!@#$%^&*()+=]{1,32}$/;
  const passwordRegex = /^[\x20-\x7E]{4,128}$/;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) return;
    if (!usernameRegex.test(username.trim())) {
      setError('Username can only contain letters, numbers, spaces, and standard special characters'); return;
    }
    if (mode === 'register' && !passwordRegex.test(password)) {
      setError('Password can only contain standard characters and must be 4-128 characters'); return;
    }
    if (mode === 'register' && password !== confirmPassword) {
      setError('Passwords do not match'); return;
    }
    setLoading(true);
    try {
      const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const base = getServerUrl() || window.location.origin;
      const res = await fetch(`${base}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password })
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Something went wrong'); setLoading(false); return; }
      localStorage.setItem('nexus_token', data.token);
      localStorage.setItem('nexus_username', (data.account || data.user).username);
      // Apply saved settings from server to localStorage
      const settings = (data.account || data.user).settings;
      if (settings && typeof settings === 'object') {
        const settingsKeyMap = {
          audio_input: 'nexus_audio_input',
          audio_input_volume: 'nexus_audio_input_volume',
          audio_output: 'nexus_audio_output',
          audio_output_volume: 'nexus_audio_output_volume',
          noise_gate_enabled: 'nexus_noise_gate_enabled',
          noise_gate_threshold: 'nexus_noise_gate_threshold',
          auto_gain_enabled: 'nexus_auto_gain_enabled',
          auto_gain_target: 'nexus_auto_gain_target',
          server_order: 'nexus_server_order',
        };
        for (const [serverKey, localKey] of Object.entries(settingsKeyMap)) {
          if (settings[serverKey] != null) {
            const val = serverKey === 'server_order' ? JSON.stringify(settings[serverKey]) : String(settings[serverKey]);
            localStorage.setItem(localKey, val);
          }
        }
      }
      setLoading(false);
      onLogin({ token: data.token, username: (data.account || data.user).username });
    } catch (err) {
      setError('Could not reach server. Is it running?');
      setLoading(false);
    }
  };

  const handleGuest = () => {
    if (!username.trim()) { setError('Enter a display name to join as guest'); return; }
    if (!usernameRegex.test(username.trim())) {
      setError('Username can only contain letters, numbers, spaces, and standard special characters'); return;
    }
    onLogin({ token: null, username: username.trim() });
  };

  return (
    <div className="login-screen">
      {/* Background glow is now CSS radial-gradient on .login-screen */}
      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-icon">
            <HexagonIcon size={48} color="#ed4245" />
          </div>
          <div className="login-logo-text">NEXUS</div>
        </div>
        <h1 className="login-title">{mode === 'login' ? 'Welcome back' : 'Create account'}</h1>
        <p className="login-subtitle">{mode === 'login' ? "We're so excited to see you again!" : 'Join the conversation today.'}</p>

        {pendingInvite && (
          <div className="login-invite-notice">
            You've been invited to a server! Log in or create an account to join.
          </div>
        )}

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label className="login-label">USERNAME</label>
            <input type="text" className="login-input" placeholder="Enter your username"
              value={username} onChange={e => setUsername(e.target.value)} maxLength={32} disabled={loading} />
          </div>
          <div className="login-field">
            <label className="login-label">PASSWORD</label>
            <input type="password" className="login-input" placeholder="Enter password"
              value={password} onChange={e => setPassword(e.target.value)} disabled={loading} />
          </div>
          {mode === 'register' && (
            <div className="login-field">
              <label className="login-label">CONFIRM PASSWORD</label>
              <input type="password" className="login-input" placeholder="Confirm password"
                value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} disabled={loading} />
            </div>
          )}
          <button type="submit" className="login-btn"
            disabled={!username.trim() || !password || loading || (mode==='register' && !confirmPassword)}>
            {loading ? 'Please wait...' : mode === 'login' ? 'Log In' : 'Create Account'}
          </button>
        </form>

        <div className="login-switch">
          {mode === 'login' ? (
            <><span>Need an account? </span><button onClick={() => { setMode('register'); setError(''); }}>Register</button></>
          ) : (
            <><span>Already have an account? </span><button onClick={() => { setMode('login'); setError(''); }}>Log In</button></>
          )}
        </div>

        {onChangeServer && (
          <div className="login-switch" style={{marginTop: 8}}>
            <span>Connected to {getServerUrl()} </span>
            <button onClick={onChangeServer}>Change Server</button>
          </div>
        )}
      </div>
    </div>
  );
}
