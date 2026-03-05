import React, { useEffect, useRef, useState } from 'react';
import './ChannelContextMenu.css';

const ChannelContextMenu = ({ channel, position, onClose, developerMode, mutedChannels, onMuteChannel, onUnmuteChannel }) => {
  const menuRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const isMuted = mutedChannels?.[channel?.id];

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
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

  const menuStyle = { top: position.y, left: position.x };

  const handleCopyId = () => {
    navigator.clipboard.writeText(channel.id).then(() => {
      setCopied(true);
      setTimeout(() => { setCopied(false); onClose(); }, 1200);
    });
  };

  return (
    <div ref={menuRef} className="channel-context-menu" style={menuStyle}>
      {isMuted ? (
        <button className="context-menu-item" onClick={() => { onUnmuteChannel?.(channel.id); onClose(); }}>
          <span className="context-menu-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></span>
          Unmute Channel
        </button>
      ) : (
        <button className="context-menu-item" onClick={() => { onMuteChannel?.(channel.id, 'forever'); onClose(); }}>
          <span className="context-menu-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 0 0-9.33-5"/><line x1="1" y1="1" x2="23" y2="23"/></svg></span>
          Mute Channel
        </button>
      )}

      {developerMode && (
        <>
          <div className="context-menu-divider" />
          <button className="context-menu-item" onClick={handleCopyId}>
            <span className="context-menu-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/></svg></span>
            {copied ? '✓ ID Copied to Clipboard' : 'Copy Channel ID'}
          </button>
        </>
      )}
    </div>
  );
};

export default ChannelContextMenu;
