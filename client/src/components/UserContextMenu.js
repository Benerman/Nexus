import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import './UserContextMenu.css';

const UserContextMenu = ({ user, currentUser, position, onAction, onClose }) => {
  const menuRef = useRef(null);
  const isSelf = user?.id === currentUser?.id;
  const [adjustedPosition, setAdjustedPosition] = useState(position);

  const isAdmin = currentUser?.roles?.includes('admin');

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

  return ReactDOM.createPortal(
    <>
      <div className="user-context-menu-overlay" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div ref={menuRef} className="user-context-menu" style={menuStyle}>
        <button className="context-menu-item" onClick={() => onAction && onAction('view-profile', user)}>
          <span className="context-menu-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span>
          View Profile
        </button>

        {!isSelf && (
          <button className="context-menu-item" onClick={() => onAction && onAction('send-dm', user)}>
            <span className="context-menu-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span>
            Send Message
          </button>
        )}

        {!isSelf && (
          <>
            <div className="context-menu-divider" />
            <button className="context-menu-item" onClick={() => onAction && onAction('add-friend', user)}>
              <span className="context-menu-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg></span>
              Add Friend
            </button>

            <button className="context-menu-item warning" onClick={() => onAction && onAction('block', user)}>
              <span className="context-menu-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg></span>
              Block User
            </button>

            <button className="context-menu-item warning" onClick={() => onAction && onAction('report', user)}>
              <span className="context-menu-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>
              Report User
            </button>
          </>
        )}

        {!isSelf && isAdmin && (
          <>
            <div className="context-menu-divider" />
            <div className="context-menu-section-label">Moderation</div>

            <button className="context-menu-item warning" onClick={() => onAction && onAction('timeout', user)}>
              <span className="context-menu-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></span>
              Timeout User
            </button>

            <button className="context-menu-item warning" onClick={() => onAction && onAction('kick', user)}>
              <span className="context-menu-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></span>
              Kick from Server
            </button>

            <button className="context-menu-item danger" onClick={() => onAction && onAction('ban', user)}>
              <span className="context-menu-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></span>
              Ban from Server
            </button>
          </>
        )}
      </div>
    </>,
    document.body
  );
};

export default UserContextMenu;
