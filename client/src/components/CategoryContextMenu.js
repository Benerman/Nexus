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
          <span className="context-menu-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></span>
          Unmute Category{muteTimeRemaining ? ` (${muteTimeRemaining} left)` : ''}
        </button>
      ) : (
        <button className="context-menu-item" onClick={() => setView('mute-options')}>
          <span className="context-menu-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 0 0-9.33-5"/><line x1="1" y1="1" x2="23" y2="23"/></svg></span>
          Mute Category
        </button>
      )}

      {developerMode && (
        <>
          <div className="context-menu-divider" />
          <button className="context-menu-item" onClick={handleCopyId}>
            <span className="context-menu-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/></svg></span>
            {copied ? '✓ ID Copied to Clipboard' : 'Copy Category ID'}
          </button>
        </>
      )}
    </div>
  );
};

export default CategoryContextMenu;
