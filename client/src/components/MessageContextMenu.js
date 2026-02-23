import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import './MessageContextMenu.css';

const MessageContextMenu = ({ message, currentUser, isAdmin, position, onClose, onDelete, onEdit, onReply, onCopyUrl, onReport, developerMode }) => {
  const menuRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [adjustedPosition, setAdjustedPosition] = useState(position);
  const [ready, setReady] = useState(false);
  const isAuthor = message.author.id === currentUser?.id;
  const canDelete = isAuthor || isAdmin;

  // Delay overlay click sensitivity so the touch-end from long press
  // doesn't immediately trigger the ghost click that dismisses the menu
  useEffect(() => {
    const id = setTimeout(() => setReady(true), 300);
    return () => clearTimeout(id);
  }, []);

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
      const rect = menuRef.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let x = position.x;
      let y = position.y;
      if (x + rect.width > vw) x = vw - rect.width - 8;
      if (x < 8) x = 8;
      if (y + rect.height > vh) y = vh - rect.height - 8;
      if (y < 8) y = 8;
      setAdjustedPosition({ x, y });
    }
  }, [position]);

  const menuStyle = {
    top: adjustedPosition.y,
    left: adjustedPosition.x,
  };

  return ReactDOM.createPortal(
    <>
      <div className="message-context-overlay" onClick={() => ready && onClose()} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div ref={menuRef} className="message-context-menu" style={menuStyle}>
        {onReply && (
          <button className="context-menu-item" onClick={() => { onReply(message); onClose(); }}>
            <span className="context-menu-icon">💬</span>
            Reply to Message
          </button>
        )}

        {isAuthor && onEdit && !message.isWebhook && (
          <button className="context-menu-item" onClick={() => { onEdit(message); onClose(); }}>
            <span className="context-menu-icon">✏️</span>
            Edit Message
          </button>
        )}

        {onCopyUrl && (
          <button className="context-menu-item" onClick={() => { onCopyUrl(message); onClose(); }}>
            <span className="context-menu-icon">🔗</span>
            Copy Message URL
          </button>
        )}

        {developerMode && (
          <>
            <div className="context-menu-divider" />
            <button className="context-menu-item" onClick={() => {
              navigator.clipboard.writeText(message.id).then(() => {
                setCopied(true);
                setTimeout(() => { setCopied(false); onClose(); }, 1200);
              });
            }}>
              <span className="context-menu-icon">📋</span>
              {copied ? '✓ ID Copied to Clipboard' : 'Copy Message ID'}
            </button>
          </>
        )}

        {!isAuthor && onReport && (
          <>
            <div className="context-menu-divider" />
            <button className="context-menu-item warning" onClick={() => { onReport(message); onClose(); }}>
              <span className="context-menu-icon">⚠️</span>
              Report Message
            </button>
          </>
        )}

        {canDelete && onDelete && (
          <>
            <div className="context-menu-divider" />
            <button className="context-menu-item danger" onClick={() => { onDelete(message); onClose(); }}>
              <span className="context-menu-icon">🗑️</span>
              Delete Message
            </button>
          </>
        )}
      </div>
    </>,
    document.body
  );
};

export default MessageContextMenu;
