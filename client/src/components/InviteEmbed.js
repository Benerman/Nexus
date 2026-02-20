import React, { useState, useEffect } from 'react';
import './InviteEmbed.css';

// Extract invite code from various URL patterns
export function extractInviteCode(text) {
  if (!text) return null;
  // Match /invite/CODE or full URLs like https://domain/invite/CODE
  const match = text.match(/(?:https?:\/\/[^\s/]+)?\/invite\/([A-Za-z0-9]+)/);
  return match ? match[1] : null;
}

// Check if text contains an invite link
export function containsInviteLink(text) {
  if (!text) return false;
  return /(?:https?:\/\/[^\s/]+)?\/invite\/[A-Za-z0-9]+/.test(text);
}

// Split message content into text parts and invite codes
export function splitMessageContent(text) {
  if (!text) return [];
  const parts = [];
  const regex = /((?:https?:\/\/[^\s/]+)?\/invite\/[A-Za-z0-9]+)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Text before the invite
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    // The invite link
    const code = match[1].match(/\/invite\/([A-Za-z0-9]+)/)?.[1];
    parts.push({ type: 'invite', content: match[0], code });
    lastIndex = regex.lastIndex;
  }

  // Remaining text
  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return parts;
}

export default function InviteEmbed({ inviteCode, socket }) {
  const [serverInfo, setServerInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    if (!socket || !inviteCode) return;

    const handlePeekResult = (data) => {
      if (data.inviteCode !== inviteCode) return;
      setLoading(false);
      if (data.error || !data.server) {
        setError(data.error || 'Server not found');
      } else {
        setServerInfo({ ...data.server, valid: data.valid, isMember: data.isMember });
        if (data.isMember) setJoined(true);
      }
    };

    socket.on('invite:peek:result', handlePeekResult);
    socket.emit('invite:peek', { inviteCode });

    return () => socket.off('invite:peek:result', handlePeekResult);
  }, [socket, inviteCode]);

  // Listen for successful join
  useEffect(() => {
    if (!socket) return;
    const handleJoined = ({ server }) => {
      if (server && serverInfo && server.id === serverInfo.id) {
        setJoining(false);
        setJoined(true);
      }
    };
    socket.on('invite:joined', handleJoined);
    return () => socket.off('invite:joined', handleJoined);
  }, [socket, serverInfo]);

  const handleJoin = () => {
    if (!socket || !inviteCode) return;
    setJoining(true);
    socket.emit('invite:use', { inviteCode });
  };

  if (loading) {
    return (
      <div className="invite-embed loading">
        <div className="invite-embed-loading-dot" />
        <span>Loading invite...</span>
      </div>
    );
  }

  if (error || !serverInfo) {
    return (
      <div className="invite-embed invalid">
        <div className="invite-embed-invalid-icon">⚠️</div>
        <div className="invite-embed-invalid-text">
          <span className="invite-embed-invalid-title">Invalid Invite</span>
          <span className="invite-embed-invalid-desc">This invite may have expired or been revoked.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="invite-embed">
      <div className="invite-embed-header">YOU'VE BEEN INVITED TO JOIN A SERVER</div>
      <div className="invite-embed-body">
        <div className="invite-embed-server-icon" style={{ background: serverInfo.customIcon ? 'transparent' : 'var(--brand-500, #3B82F6)' }}>
          {serverInfo.customIcon
            ? <img src={serverInfo.customIcon} alt="" className="invite-embed-server-img" />
            : <span className="invite-embed-server-initial">{serverInfo.icon || serverInfo.name?.[0] || 'S'}</span>}
        </div>
        <div className="invite-embed-info">
          <div className="invite-embed-server-name">{serverInfo.name}</div>
          <div className="invite-embed-meta">
            <span className="invite-embed-online-dot" />
            <span>{serverInfo.memberCount || 0} Member{serverInfo.memberCount !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <button
          className={`invite-embed-join-btn ${joined ? 'joined' : ''}`}
          onClick={handleJoin}
          disabled={joining || joined || !serverInfo.valid}
        >
          {joined ? 'Joined' : joining ? 'Joining...' : !serverInfo.valid ? 'Expired' : serverInfo.isMember ? 'Joined' : 'Join'}
        </button>
      </div>
    </div>
  );
}
