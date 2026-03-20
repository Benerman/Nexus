import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import './MessageContextMenu.css';

const MessageContextMenu = ({ message, currentUser, isAdmin, isServerOwner, canManageMessages, position, onClose, onDelete, onEdit, onReply, onCopyUrl, onReport, onPin, onBookmark, onThread, savedMessageIds, isDM, developerMode }) => {
  const menuRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [adjustedPosition, setAdjustedPosition] = useState(position);
  const [ready, setReady] = useState(false);
  const isAuthor = message.author.id === currentUser?.id;
  const canDelete = isAuthor || isAdmin || isServerOwner;

  // Delay overlay click sensitivity so the touch-end from long press
  // doesn't immediately trigger the ghost click that dismisses the menu
  useEffect(() => {
    const id = setTimeout(() => setReady(true), 450);
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
      <div className="message-context-overlay" onClick={() => ready && onClose()} onContextMenu={(e) => { e.preventDefault(); if (ready) onClose(); }} />
      <div ref={menuRef} className="message-context-menu" style={menuStyle}>
        {onReply && (
          <button className="context-menu-item" onClick={() => { onReply(message); onClose(); }}>
            <span className="context-menu-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span>
            Reply to Message
          </button>
        )}

        {onThread && !message.threadId && !isDM && (
          <button className="context-menu-item" onClick={() => { onThread(message); onClose(); }}>
            <span className="context-menu-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 10 20 15 15 20"/><path d="M4 4v7a4 4 0 0 0 4 4h12"/></svg></span>
            {(message.threadReplyCount > 0 || message.threadName) ? 'Open Thread' : 'Start Thread'}
          </button>
        )}

        {onThread && !message.threadId && !isDM && <div className="context-menu-divider" />}

        {canManageMessages && !isDM && onPin && !message.threadId && (
          <button className="context-menu-item" onClick={() => { onPin(message); onClose(); }}>
            <span className="context-menu-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z"/></svg></span>
            {message.pinned ? 'Unpin Message' : 'Pin Message'}
          </button>
        )}

        {onBookmark && (
          <button className="context-menu-item" onClick={() => { onBookmark(message); onClose(); }}>
            <span className="context-menu-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg></span>
            {savedMessageIds?.has(message.id) ? 'Remove Bookmark' : 'Bookmark'}
          </button>
        )}

        {(onBookmark || (canManageMessages && !isDM && onPin && !message.threadId)) && <div className="context-menu-divider" />}

        {isAuthor && onEdit && !message.isWebhook && (
          <button className="context-menu-item" onClick={() => { onEdit(message); onClose(); }}>
            <span className="context-menu-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg></span>
            Edit Message
          </button>
        )}

        {onCopyUrl && (
          <button className="context-menu-item" onClick={() => { onCopyUrl(message); onClose(); }}>
            <span className="context-menu-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></span>
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
              <span className="context-menu-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/></svg></span>
              {copied ? '✓ ID Copied to Clipboard' : 'Copy Message ID'}
            </button>
          </>
        )}

        {!isAuthor && onReport && (
          <>
            <div className="context-menu-divider" />
            <button className="context-menu-item warning" onClick={() => { onReport(message); onClose(); }}>
              <span className="context-menu-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>
              Report Message
            </button>
          </>
        )}

        {canDelete && onDelete && (
          <>
            <div className="context-menu-divider" />
            <button className="context-menu-item danger" onClick={() => { onDelete(message); onClose(); }}>
              <span className="context-menu-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></span>
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
