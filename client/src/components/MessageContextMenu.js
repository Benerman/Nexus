import React, { useEffect, useRef, useState } from 'react';
import './MessageContextMenu.css';

const MessageContextMenu = ({ message, currentUser, isAdmin, position, onClose, onDelete, onEdit, onReply, onCopyUrl, developerMode }) => {
  const menuRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const isAuthor = message.author.id === currentUser?.id;
  const canDelete = isAuthor || isAdmin;

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
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

  // Adjust position to keep menu on screen
  const menuStyle = {
    top: position.y,
    left: position.x,
  };

  return (
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

      <div className="context-menu-divider" />

      {canDelete && onDelete && (
        <button className="context-menu-item danger" onClick={() => { onDelete(message); onClose(); }}>
          <span className="context-menu-icon">🗑️</span>
          Delete Message
        </button>
      )}
    </div>
  );
};

export default MessageContextMenu;
