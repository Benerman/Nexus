import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import './UserProfileModal.css';

export default function UserProfileModal({ user, server, servers = [], currentUser, socket, onClose, onSendMessage, onAddFriend, onBlock }) {
  const [showInvitePicker, setShowInvitePicker] = useState(false);
  const [inviteSending, setInviteSending] = useState(null); // serverId being invited to
  const [inviteSent, setInviteSent] = useState(null); // serverId that was sent

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Listen for invite:created to send the DM
  useEffect(() => {
    if (!socket || !inviteSending) return;
    const handleInviteCreated = ({ invite }) => {
      // DM the invite link to the user
      socket.emit('dm:create', { targetUserId: user.id });

      // Wait a moment for the DM to be created, then send the invite
      const handleDMCreated = ({ channel }) => {
        socket.emit('message:send', {
          channelId: channel.id,
          content: `Hey! Here's an invite to join: ${invite.url}`
        });
        socket.off('dm:created', handleDMCreated);
        setInviteSending(null);
        setInviteSent(invite.server_id);
        setTimeout(() => setInviteSent(null), 3000);
      };
      socket.on('dm:created', handleDMCreated);

      // Cleanup after timeout in case DM already exists
      setTimeout(() => {
        socket.off('dm:created', handleDMCreated);
        setInviteSending(null);
      }, 10000);
    };
    socket.on('invite:created', handleInviteCreated);
    return () => socket.off('invite:created', handleInviteCreated);
  }, [socket, inviteSending, user?.id]);

  if (!user) return null;

  const isSelf = user.id === currentUser?.id;
  const members = server?.members || {};
  const roles = server?.roles || {};
  const member = members[user.id];
  const memberRoles = (member?.roles || [])
    .filter(r => r !== 'everyone')
    .map(rId => roles[rId])
    .filter(Boolean);

  // Filter to servers the current user owns or is a member of (exclude personal server)
  const invitableServers = (servers || []).filter(s =>
    !s.isPersonal && !s.id?.startsWith('personal:')
  );

  const handleInviteToServer = (serverId) => {
    if (!socket) return;
    setInviteSending(serverId);
    socket.emit('invite:create', { serverId, maxUses: 1, expiresInMs: 7 * 24 * 60 * 60 * 1000 });
  };

  return ReactDOM.createPortal(
    <div className="user-profile-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="user-profile-modal">
        {/* Banner */}
        <div className="user-profile-banner" style={{ background: user.color || '#3B82F6' }} />

        {/* Avatar */}
        <div className="user-profile-avatar-wrapper">
          <div className="user-profile-avatar" style={{ background: user.customAvatar ? 'transparent' : (user.color || '#3B82F6') }}>
            {user.customAvatar
              ? <img src={user.customAvatar} alt="" className="user-profile-avatar-img" />
              : <span className="user-profile-avatar-emoji">{user.avatar || '👤'}</span>
            }
          </div>
          <div className={`user-profile-status-dot status-${user.status || 'offline'}`} />
        </div>

        {/* Info */}
        <div className="user-profile-body">
          <div className="user-profile-name" style={{ color: user.color || '#fff' }}>
            {user.username || 'Unknown'}
          </div>

          <div className="user-profile-status-text">
            {user.status || 'offline'}
          </div>

          {user.bio && (
            <div className="user-profile-section">
              <div className="user-profile-section-title">ABOUT ME</div>
              <div className="user-profile-bio">{user.bio}</div>
            </div>
          )}

          {memberRoles.length > 0 && (
            <div className="user-profile-section">
              <div className="user-profile-section-title">ROLES</div>
              <div className="user-profile-roles">
                {memberRoles.map(role => (
                  <span key={role.id} className="user-profile-role-pill" style={{ borderColor: role.color || '#99aab5' }}>
                    <span className="user-profile-role-dot" style={{ background: role.color || '#99aab5' }} />
                    {role.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {member?.joinedAt && (
            <div className="user-profile-section">
              <div className="user-profile-section-title">MEMBER SINCE</div>
              <div className="user-profile-date">
                {new Date(member.joinedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
              </div>
            </div>
          )}

          {/* Action buttons */}
          {!isSelf && (
            <div className="user-profile-actions">
              <div className="user-profile-actions-row">
                <button className="user-profile-action-btn primary" onClick={() => { onSendMessage?.(user); onClose(); }}>
                  <span className="up-btn-icon">💬</span> Message
                </button>
                <button className="user-profile-action-btn" onClick={() => { onAddFriend?.(user); }}>
                  <span className="up-btn-icon">🤝</span> Add Friend
                </button>
              </div>
              <div className="user-profile-actions-row">
                <button
                  className={`user-profile-action-btn ${showInvitePicker ? 'active' : ''}`}
                  onClick={() => setShowInvitePicker(!showInvitePicker)}
                >
                  <span className="up-btn-icon">📨</span> Invite to Server
                </button>
                <button className="user-profile-action-btn danger" onClick={() => { onBlock?.(user); onClose(); }}>
                  <span className="up-btn-icon">🚷</span> Block
                </button>
              </div>

              {/* Invite to Server picker */}
              {showInvitePicker && (
                <div className="user-profile-invite-picker">
                  {invitableServers.length === 0 ? (
                    <div className="up-invite-empty">No servers available</div>
                  ) : (
                    invitableServers.map(srv => (
                      <button
                        key={srv.id}
                        className={`up-invite-server-item ${inviteSent === srv.id ? 'sent' : ''}`}
                        onClick={() => handleInviteToServer(srv.id)}
                        disabled={inviteSending === srv.id || inviteSent === srv.id}
                      >
                        <div className="up-invite-server-icon" style={{ background: srv.customIcon ? 'transparent' : 'var(--bg-tertiary)' }}>
                          {srv.customIcon
                            ? <img src={srv.customIcon} alt="" className="up-invite-server-img" />
                            : <span>{srv.icon || srv.name?.[0] || 'S'}</span>}
                        </div>
                        <span className="up-invite-server-name">{srv.name}</span>
                        <span className="up-invite-server-status">
                          {inviteSending === srv.id ? 'Sending...' : inviteSent === srv.id ? 'Sent!' : 'Invite'}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
