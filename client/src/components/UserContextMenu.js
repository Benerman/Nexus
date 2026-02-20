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
          <span className="context-menu-icon">👤</span>
          View Profile
        </button>

        {!isSelf && (
          <button className="context-menu-item" onClick={() => onAction && onAction('send-dm', user)}>
            <span className="context-menu-icon">💬</span>
            Send Message
          </button>
        )}

        {!isSelf && (
          <>
            <div className="context-menu-divider" />
            <button className="context-menu-item" onClick={() => onAction && onAction('add-friend', user)}>
              <span className="context-menu-icon">🤝</span>
              Add Friend
            </button>

            <button className="context-menu-item warning" onClick={() => onAction && onAction('block', user)}>
              <span className="context-menu-icon">🚷</span>
              Block User
            </button>

            <button className="context-menu-item warning" onClick={() => onAction && onAction('report', user)}>
              <span className="context-menu-icon">⚠️</span>
              Report User
            </button>
          </>
        )}

        {!isSelf && isAdmin && (
          <>
            <div className="context-menu-divider" />
            <div className="context-menu-section-label">Moderation</div>

            <button className="context-menu-item warning" onClick={() => onAction && onAction('timeout', user)}>
              <span className="context-menu-icon">⏱️</span>
              Timeout User
            </button>

            <button className="context-menu-item warning" onClick={() => onAction && onAction('kick', user)}>
              <span className="context-menu-icon">👢</span>
              Kick from Server
            </button>

            <button className="context-menu-item danger" onClick={() => onAction && onAction('ban', user)}>
              <span className="context-menu-icon">🚫</span>
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
