import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import './UserContextMenu.css';

const TIMEOUT_DURATIONS = [
  { label: '60 Seconds', mins: 1 },
  { label: '5 Minutes', mins: 5 },
  { label: '10 Minutes', mins: 10 },
  { label: '1 Hour', mins: 60 },
  { label: '1 Day', mins: 1440 },
  { label: '1 Week', mins: 10080 },
];

const UserContextMenu = ({ user, currentUser, position, onAction, onClose, permissions, isInVoice, voiceChannels, serverId }) => {
  const menuRef = useRef(null);
  const isSelf = user?.id === currentUser?.id;
  const [adjustedPosition, setAdjustedPosition] = useState(position);
  const [showTimeoutPicker, setShowTimeoutPicker] = useState(false);
  const [showMovePicker, setShowMovePicker] = useState(false);

  const hasAnyModPerm = !isSelf && serverId && (
    permissions?.kickMembers || permissions?.banMembers ||
    permissions?.moderateMembers || permissions?.muteMembers ||
    permissions?.deafenMembers || permissions?.moveMembers || permissions?.admin
  );

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Adjust position to keep menu on screen
  useEffect(() => {
    if (menuRef.current) {
      const menuRect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let newX = position.x;
      let newY = position.y;

      if (position.x + menuRect.width > viewportWidth) {
        newX = viewportWidth - menuRect.width - 10;
      }
      if (newX < 10) newX = 10;
      if (position.y + menuRect.height > viewportHeight) {
        newY = viewportHeight - menuRect.height - 10;
      }
      if (newY < 10) newY = 10;

      setAdjustedPosition({ x: newX, y: newY });
    }
  }, [position]);

  if (!user) return null;

  const menuStyle = {
    top: adjustedPosition.y,
    left: adjustedPosition.x,
  };

  const canKickMembers = permissions?.kickMembers || permissions?.admin;
  const canBanMembers = permissions?.banMembers || permissions?.admin;
  const canTimeoutMembers = permissions?.moderateMembers || permissions?.admin;
  const canMuteMembers = permissions?.muteMembers || permissions?.admin;
  const canDeafenMembers = permissions?.deafenMembers || permissions?.admin;
  const canMoveMembers = permissions?.moveMembers || permissions?.admin;

  const hasVoiceModPerms = isInVoice && (canMuteMembers || canDeafenMembers || canMoveMembers);

  return ReactDOM.createPortal(
    <>
      <div className="user-context-menu-overlay" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div ref={menuRef} className="user-context-menu" style={menuStyle} role="menu">
        <button className="context-menu-item" role="menuitem" onClick={() => onAction && onAction('view-profile', user)}>
          <span className="context-menu-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span>
          View Profile
        </button>

        {!isSelf && (
          <button className="context-menu-item" role="menuitem" onClick={() => onAction && onAction('send-dm', user)}>
            <span className="context-menu-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span>
            Send Message
          </button>
        )}

        {!isSelf && (
          <>
            <div className="context-menu-divider" />
            <button className="context-menu-item" role="menuitem" onClick={() => onAction && onAction('add-friend', user)}>
              <span className="context-menu-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg></span>
              Add Friend
            </button>

            <button className="context-menu-item warning" role="menuitem" onClick={() => onAction && onAction('block', user)}>
              <span className="context-menu-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg></span>
              Block User
            </button>

            <button className="context-menu-item warning" role="menuitem" onClick={() => onAction && onAction('report', user)}>
              <span className="context-menu-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>
              Report User
            </button>
          </>
        )}

        {hasAnyModPerm && (
          <>
            <div className="context-menu-divider" />
            <div className="context-menu-section-label">Moderation</div>

            {/* Voice moderation sub-section */}
            {hasVoiceModPerms && (
              <>
                {canMoveMembers && (
                  <button className="context-menu-item warning" role="menuitem" onClick={() => onAction && onAction('voice-kick', user)}>
                    <span className="context-menu-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="18" y1="8" x2="23" y2="13"/><line x1="23" y1="8" x2="18" y2="13"/></svg></span>
                    Kick from Voice
                  </button>
                )}

                {canMuteMembers && (
                  <button className="context-menu-item warning" role="menuitem" onClick={() => onAction && onAction('voice-mute', user)}>
                    <span className="context-menu-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.13 1.49-.35 2.17"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg></span>
                    Server Mute
                  </button>
                )}

                {canDeafenMembers && (
                  <button className="context-menu-item warning" role="menuitem" onClick={() => onAction && onAction('voice-deafen', user)}>
                    <span className="context-menu-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/><line x1="1" y1="1" x2="23" y2="23"/></svg></span>
                    Server Deafen
                  </button>
                )}

                {canMoveMembers && voiceChannels && voiceChannels.length > 0 && (
                  <div className="context-menu-submenu-wrap">
                    <button className="context-menu-item warning" role="menuitem" onClick={() => setShowMovePicker(p => !p)}>
                      <span className="context-menu-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg></span>
                      Move to Channel
                      <span className="context-menu-arrow">{showMovePicker ? '\u25B4' : '\u25BE'}</span>
                    </button>
                    {showMovePicker && (
                      <div className="context-menu-submenu" role="menu">
                        {voiceChannels.map(ch => (
                          <button key={ch.id} className="context-menu-item submenu-item" role="menuitem" onClick={() => onAction && onAction('voice-move', user, { targetChannelId: ch.id })}>
                            {ch.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="context-menu-divider" />
              </>
            )}

            {/* Server moderation */}
            {canTimeoutMembers && (
              <div className="context-menu-submenu-wrap">
                <button className="context-menu-item warning" role="menuitem" onClick={() => setShowTimeoutPicker(p => !p)}>
                  <span className="context-menu-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span>
                  Timeout User
                  <span className="context-menu-arrow">{showTimeoutPicker ? '\u25B4' : '\u25BE'}</span>
                </button>
                {showTimeoutPicker && (
                  <div className="context-menu-submenu" role="menu">
                    {TIMEOUT_DURATIONS.map(d => (
                      <button key={d.mins} className="context-menu-item submenu-item" role="menuitem" onClick={() => onAction && onAction('timeout', user, { duration: d.mins })}>
                        {d.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {canKickMembers && (
              <button className="context-menu-item warning" role="menuitem" onClick={() => onAction && onAction('kick', user)}>
                <span className="context-menu-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></span>
                Kick from Server
              </button>
            )}

            {canBanMembers && (
              <button className="context-menu-item danger" role="menuitem" onClick={() => onAction && onAction('ban', user)}>
                <span className="context-menu-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></span>
                Ban from Server
              </button>
            )}
          </>
        )}
      </div>
    </>,
    document.body
  );
};

export default UserContextMenu;
