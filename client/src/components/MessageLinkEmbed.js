import React, { useState, useEffect } from 'react';
import './MessageLinkEmbed.css';

function MessageLinkEmbed({ serverId, channelId, messageId, socket }) {
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!socket || !serverId || !channelId || !messageId) return;
    setLoading(true);
    socket.emit('message:get-preview', { serverId, channelId, messageId }, (response) => {
      setLoading(false);
      if (response.error) {
        setError(true);
      } else {
        setPreview(response);
      }
    });
  }, [socket, serverId, channelId, messageId]);

  if (loading) {
    return (
      <div className="message-link-embed loading">
        <div className="mle-loading">Loading message preview...</div>
      </div>
    );
  }

  if (error || !preview) {
    return (
      <div className="message-link-embed error">
        <div className="mle-error">Message not accessible</div>
      </div>
    );
  }

  const formatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) {
      return 'Today at ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' at ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="message-link-embed">
      <div className="mle-header">
        <span className="mle-server">{preview.serverName}</span>
        <span className="mle-sep">&gt;</span>
        <span className="mle-channel">#{preview.channelName}</span>
      </div>
      <div className="mle-body">
        <div className="mle-author">
          <div className="mle-avatar" style={{ background: '#3B82F6' }}>
            {preview.author?.avatar || preview.author?.username?.[0]?.toUpperCase() || '?'}
          </div>
          <span className="mle-username">{preview.author?.username || 'Unknown'}</span>
          <span className="mle-time">{formatTime(preview.timestamp)}</span>
        </div>
        <div className="mle-content">{preview.content}</div>
      </div>
    </div>
  );
}

export default React.memo(MessageLinkEmbed);
