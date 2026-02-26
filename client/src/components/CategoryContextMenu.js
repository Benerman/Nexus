import React, { useEffect, useRef, useState } from 'react';
import './ChannelContextMenu.css';

const CategoryContextMenu = ({ category, position, onClose, developerMode, mutedCategories, onMuteCategory, onUnmuteCategory }) => {
  const menuRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState('menu'); // 'menu' | 'mute-options'
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  const muteEntry = mutedCategories?.[category?.id];
  const isMuted = muteEntry && (muteEntry.until === 'forever' || Date.now() < muteEntry.until);
  const muteTimeRemaining = isMuted && muteEntry.until !== 'forever'
    ? (() => {
        const ms = muteEntry.until - Date.now();
        if (ms < 60000) return 'less than a minute';
        if (ms < 3600000) return `${Math.ceil(ms / 60000)} minutes`;
        return `${Math.round(ms / 3600000)} hours`;
      })()
    : null;

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

  const menuStyle = { top: adjustedPosition.y, left: adjustedPosition.x };

  const handleCopyId = () => {
    navigator.clipboard.writeText(category.id).then(() => {
      setCopied(true);
      setTimeout(() => { setCopied(false); onClose(); }, 1200);
    });
  };

  const stopPropagation = (e) => e.stopPropagation();

  if (view === 'mute-options') {
    return (
      <div ref={menuRef} className="channel-context-menu" style={menuStyle} onClick={stopPropagation}>
        <button className="context-menu-item" style={{ opacity: 0.7, fontSize: '11px', cursor: 'default', padding: '4px 12px' }} disabled>
          Mute {category?.name}
        </button>
        {[
          { label: 'For 15 minutes', duration: 15 * 60 * 1000 },
          { label: 'For 1 hour', duration: 60 * 60 * 1000 },
          { label: 'For 8 hours', duration: 8 * 60 * 60 * 1000 },
          { label: 'For 24 hours', duration: 24 * 60 * 60 * 1000 },
          { label: 'Until I turn it back on', duration: 'forever' },
        ].map(opt => (
          <button key={opt.label} className="context-menu-item" onClick={() => {
            onMuteCategory(category.id, opt.duration);
            onClose();
          }}>
            {opt.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div ref={menuRef} className="channel-context-menu" style={menuStyle} onClick={stopPropagation}>
      {isMuted ? (
        <button className="context-menu-item" onClick={() => { onUnmuteCategory?.(category.id); onClose(); }}>
          <span className="context-menu-icon">🔔</span>
          Unmute Category{muteTimeRemaining ? ` (${muteTimeRemaining} left)` : ''}
        </button>
      ) : (
        <button className="context-menu-item" onClick={() => setView('mute-options')}>
          <span className="context-menu-icon">🔕</span>
          Mute Category
        </button>
      )}

      {developerMode && (
        <>
          <div className="context-menu-divider" />
          <button className="context-menu-item" onClick={handleCopyId}>
            <span className="context-menu-icon">📋</span>
            {copied ? '✓ ID Copied to Clipboard' : 'Copy Category ID'}
          </button>
        </>
      )}
    </div>
  );
};

export default CategoryContextMenu;
