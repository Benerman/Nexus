import React, { useEffect, useRef, useState } from 'react';
import { emitWithLoadingTimeout, TIMEOUT_MSG } from '../utils/socketTimeout';
import './ServerContextMenu.css';

const ServerContextMenu = ({ server, position, socket, currentUser, onClose, onOpenSettings, mutedServers, onMuteServer, onUnmuteServer, developerMode }) => {
  const menuRef = useRef(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);
  const [view, setView] = useState('menu'); // 'menu' | 'create-invite' | 'join-server' | 'mute-options'
  const [inviteLink, setInviteLink] = useState(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [copied, setCopied] = useState(false);
  const inviteTimeoutRef = useRef(null);
  const joinTimeoutRef = useRef(null);

  const isPersonal = server?.isPersonal || server?.id?.startsWith('personal:');

  // Close on click outside or Escape
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Keep menu on screen
  useEffect(() => {
    if (menuRef.current) {
      const menuRect = menuRef.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let newX = position.x;
      let newY = position.y;
      if (position.x + menuRect.width > vw) newX = vw - menuRect.width - 10;
      if (newX < 10) newX = 10;
      if (position.y + menuRect.height > vh) newY = vh - menuRect.height - 10;
      if (newY < 10) newY = 10;
      setAdjustedPosition({ x: newX, y: newY });
    }
  }, [position, view]);

  // Socket listeners
  useEffect(() => {
    if (!socket) return;

    const handleInviteCreated = ({ invite }) => {
      clearTimeout(inviteTimeoutRef.current);
      setInviteLoading(false);
      setInviteLink(invite.url || invite.id);
    };

    const handleInviteJoined = () => {
      clearTimeout(joinTimeoutRef.current);
      setJoinLoading(false);
      onClose();
    };

    const handleError = ({ message }) => {
      if (inviteLoading) {
        clearTimeout(inviteTimeoutRef.current);
        setInviteLoading(false);
      }
      if (joinLoading) {
        clearTimeout(joinTimeoutRef.current);
        setJoinLoading(false);
        setJoinError(message);
      }
    };

    socket.on('invite:created', handleInviteCreated);
    socket.on('invite:joined', handleInviteJoined);
    socket.on('error', handleError);

    return () => {
      socket.off('invite:created', handleInviteCreated);
      socket.off('invite:joined', handleInviteJoined);
      socket.off('error', handleError);
    };
  }, [socket, onClose, inviteLoading, joinLoading]);

  const handleCreateInvite = () => {
    if (!socket || !server) return;
    setInviteLoading(true);
    inviteTimeoutRef.current = emitWithLoadingTimeout(socket, 'invite:create',
      { serverId: server.id, maxUses: 0, expiresInMs: 7 * 24 * 60 * 60 * 1000 },
      { onTimeout: () => { setInviteLoading(false); } }
    );
  };

  const handleCopyLink = () => {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  const handleJoinServer = () => {
    if (!socket || !inviteCode.trim()) return;
    setJoinLoading(true);
    setJoinError('');
    const code = inviteCode.trim().split('/').pop();
    joinTimeoutRef.current = emitWithLoadingTimeout(socket, 'invite:use', { inviteCode: code },
      { onTimeout: () => { setJoinLoading(false); setJoinError(TIMEOUT_MSG); } }
    );
  };

  const menuStyle = {
    top: adjustedPosition.y,
    left: adjustedPosition.x,
  };

  // Stop clicks inside the menu from bubbling to the app-level onClick
  const stopPropagation = (e) => e.stopPropagation();

  // ─── Create Invite Link view ─────────────────────────────────────────────────
  if (view === 'create-invite') {
    return (
      <div ref={menuRef} className="server-context-menu scm-panel" style={menuStyle} onClick={stopPropagation}>
        <div className="scm-header">
          <button className="scm-back-btn" onClick={() => { setView('menu'); setInviteLink(null); }}>
            ←
          </button>
          <span className="scm-header-title">Invite to {server?.name}</span>
        </div>
        <div className="scm-body">
          {inviteLink ? (
            <>
              <div className="scm-label">Share this link to invite others</div>
              <div className="scm-invite-result">
                <input
                  className="scm-invite-input"
                  value={inviteLink}
                  readOnly
                  onClick={(e) => e.target.select()}
                />
                <button
                  className={`scm-copy-btn ${copied ? 'copied' : ''}`}
                  onClick={handleCopyLink}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <div className="scm-info-box">
                <div className="scm-info-row">Expires in 7 days</div>
                <div className="scm-info-row">Recipients must have an account to join</div>
                <div className="scm-info-row">Paste the link in a browser or use "Join a Server"</div>
              </div>
            </>
          ) : (
            <>
              <div className="scm-description">
                Generate a link that lets others join <strong>{server?.name}</strong>.
                The invite will expire after 7 days. Recipients need a registered account to accept.
              </div>
              <button
                className="scm-action-btn"
                onClick={handleCreateInvite}
                disabled={inviteLoading}
              >
                {inviteLoading ? 'Generating...' : 'Generate Invite Link'}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ─── Join a Server view ──────────────────────────────────────────────────────
  if (view === 'join-server') {
    return (
      <div ref={menuRef} className="server-context-menu scm-panel" style={menuStyle} onClick={stopPropagation}>
        <div className="scm-header">
          <button className="scm-back-btn" onClick={() => { setView('menu'); setJoinError(''); }}>
            ←
          </button>
          <span className="scm-header-title">Join a Server</span>
        </div>
        <div className="scm-body">
          <div className="scm-description">
            Paste an invite link or code that someone shared with you.
          </div>
          <label className="scm-label">Invite Link or Code</label>
          <input
            className="scm-invite-input"
            placeholder="e.g. https://...invite/abc123 or abc123"
            value={inviteCode}
            onChange={(e) => { setInviteCode(e.target.value); setJoinError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && handleJoinServer()}
            autoFocus
          />
          {joinError && <div className="scm-error">{joinError}</div>}
          <button
            className="scm-action-btn"
            onClick={handleJoinServer}
            disabled={joinLoading || !inviteCode.trim()}
          >
            {joinLoading ? 'Joining...' : 'Join Server'}
          </button>
        </div>
      </div>
    );
  }

  // Check if this server is muted
  const muteEntry = mutedServers?.[server?.id];
  const isMuted = muteEntry && (muteEntry.until === 'forever' || Date.now() < muteEntry.until);
  const muteTimeRemaining = isMuted && muteEntry.until !== 'forever'
    ? (() => {
        const ms = muteEntry.until - Date.now();
        if (ms < 60000) return 'less than a minute';
        if (ms < 3600000) return `${Math.ceil(ms / 60000)} minutes`;
        return `${Math.round(ms / 3600000)} hours`;
      })()
    : null;

  // ─── Mute duration picker ──────────────────────────────────────────────────
  if (view === 'mute-options') {
    return (
      <div ref={menuRef} className="server-context-menu scm-panel" style={menuStyle} onClick={stopPropagation}>
        <div className="scm-header">
          <button className="scm-back-btn" onClick={() => setView('menu')}>←</button>
          <span className="scm-header-title">Mute {server?.name}</span>
        </div>
        <div className="scm-body" style={{padding: '4px 0'}}>
          {[
            { label: 'For 15 minutes', duration: 15 * 60 * 1000 },
            { label: 'For 1 hour', duration: 60 * 60 * 1000 },
            { label: 'For 8 hours', duration: 8 * 60 * 60 * 1000 },
            { label: 'For 24 hours', duration: 24 * 60 * 60 * 1000 },
            { label: 'Until I turn it back on', duration: 'forever' },
          ].map(opt => (
            <button key={opt.label} className="context-menu-item" onClick={() => {
              onMuteServer(server.id, opt.duration);
              onClose();
            }}>
              <span className="context-menu-icon">🔕</span>
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ─── Main context menu ───────────────────────────────────────────────────────
  return (
    <div ref={menuRef} className="server-context-menu" style={menuStyle} onClick={stopPropagation}>
      {!isPersonal && (
        <>
          <button className="context-menu-item" onClick={() => setView('create-invite')}>
            <span className="context-menu-icon">🔗</span>
            Create Invite Link
          </button>
          <button className="context-menu-item" onClick={() => {
            onClose();
            if (onOpenSettings) onOpenSettings('server-settings');
          }}>
            <span className="context-menu-icon">⚙️</span>
            Server Settings
          </button>
          <div className="context-menu-divider" />
          {isMuted ? (
            <button className="context-menu-item" onClick={() => { onUnmuteServer(server.id); onClose(); }}>
              <span className="context-menu-icon">🔔</span>
              Unmute Server{muteTimeRemaining ? ` (${muteTimeRemaining} left)` : ''}
            </button>
          ) : (
            <button className="context-menu-item" onClick={() => setView('mute-options')}>
              <span className="context-menu-icon">🔕</span>
              Mute Server
            </button>
          )}
          <div className="context-menu-divider" />
        </>
      )}
      <button className="context-menu-item" onClick={() => setView('join-server')}>
        <span className="context-menu-icon">📨</span>
        Join a Server
      </button>
      {developerMode && !isPersonal && (
        <>
          <div className="context-menu-divider" />
          <button className="context-menu-item" onClick={() => {
            navigator.clipboard.writeText(server.id).then(() => {
              setCopied(true);
              setTimeout(() => { setCopied(false); onClose(); }, 1200);
            });
          }}>
            <span className="context-menu-icon">📋</span>
            {copied ? '✓ ID Copied to Clipboard' : 'Copy Server ID'}
          </button>
        </>
      )}
    </div>
  );
};

export default ServerContextMenu;
