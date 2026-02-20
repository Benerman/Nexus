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
          <span className="context-menu-icon">🔔</span>
          Unmute Channel
        </button>
      ) : (
        <button className="context-menu-item" onClick={() => { onMuteChannel?.(channel.id, 'forever'); onClose(); }}>
          <span className="context-menu-icon">🔕</span>
          Mute Channel
        </button>
      )}

      {developerMode && (
        <>
          <div className="context-menu-divider" />
          <button className="context-menu-item" onClick={handleCopyId}>
            <span className="context-menu-icon">📋</span>
            {copied ? '✓ ID Copied to Clipboard' : 'Copy Channel ID'}
          </button>
        </>
      )}
    </div>
  );
};

export default ChannelContextMenu;
