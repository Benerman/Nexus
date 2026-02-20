import React, { useState, useEffect, useRef } from 'react';
import './DMList.css';

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (days === 1) {
    return 'Yesterday';
  } else if (days < 7) {
    return date.toLocaleDateString([], { weekday: 'short' });
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
}

function truncateMessage(content, maxLength = 50) {
  if (!content) return 'Start a conversation...';
  if (content.length <= maxLength) return content;
  return content.substring(0, maxLength) + '...';
}

const DMList = React.memo(function DMList({ dmChannels = [], activeDMChannel, onSelectDM, onlineUsers = [], currentUser, onCreateDM, friends = [] }) {
  console.log('[DMList] RENDER - DMs:', dmChannels.length, dmChannels);

  const [searchQuery, setSearchQuery] = useState('');
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [showNewDMModal, setShowNewDMModal] = useState(false);
  const [newDMUsername, setNewDMUsername] = useState('');
  const [newDMError, setNewDMError] = useState('');
  const searchInputRef = useRef(null);
  const autocompleteRef = useRef(null);
  const modalRef = useRef(null);

  // Close autocomplete when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        autocompleteRef.current &&
        !autocompleteRef.current.contains(event.target) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(event.target)
      ) {
        setShowAutocomplete(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Get participant info for a DM channel
  const getDMParticipant = (dm) => {
    if (!dm) return null;

    // Server sends dm.participant as a single object, not an array
    if (dm.participant) {
      // Update online status if user is in onlineUsers
      const onlineUser = onlineUsers.find(u => u.id === dm.participant.id);
      return onlineUser || dm.participant;
    }

    return null;
  };

  // Filter users for autocomplete
  const getFilteredUsers = () => {
    if (!searchQuery.trim()) return [];

    const query = searchQuery.toLowerCase();
    const existingDMUserIds = dmChannels
      .map(dm => dm.participant?.id)
      .filter(Boolean);

    // Get all available users (excluding self and existing DMs)
    const availableUsers = onlineUsers.filter(
      user => user.id !== currentUser?.id && !existingDMUserIds.includes(user.id)
    );

    // Filter by search query
    const matchingUsers = availableUsers.filter(user =>
      user.username.toLowerCase().includes(query)
    );

    // Separate friends and non-friends
    const friendIds = friends.map(f => f.id);
    const friendMatches = matchingUsers.filter(u => friendIds.includes(u.id));
    const nonFriendMatches = matchingUsers.filter(u => !friendIds.includes(u.id));

    // Prioritize friends first, then others
    return [...friendMatches, ...nonFriendMatches].slice(0, 8);
  };

  const handleSearchFocus = () => {
    setShowAutocomplete(true);
  };

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
    setShowAutocomplete(true);
  };

  const handleUserSelect = (user) => {
    if (onCreateDM) {
      onCreateDM(user.id);
    }
    setSearchQuery('');
    setShowAutocomplete(false);
  };

  const handleOpenNewDMModal = () => {
    setShowNewDMModal(true);
    setNewDMUsername('');
    setNewDMError('');
  };

  const handleCloseNewDMModal = () => {
    setShowNewDMModal(false);
    setNewDMUsername('');
    setNewDMError('');
  };

  const handleCreateNewDM = () => {
    const username = newDMUsername.trim();
    if (!username) {
      setNewDMError('Please enter a username');
      return;
    }

    // Find user by username
    const user = onlineUsers.find(u => u.username.toLowerCase() === username.toLowerCase());

    if (!user) {
      setNewDMError('User not found');
      return;
    }

    if (user.id === currentUser?.id) {
      setNewDMError('Cannot DM yourself');
      return;
    }

    // Check if DM already exists
    const existingDM = dmChannels.find(dm => dm.participant?.id === user.id);
    if (existingDM) {
      setNewDMError('Conversation already exists');
      return;
    }

    // Create DM
    if (onCreateDM) {
      onCreateDM(user.id);
    }
    handleCloseNewDMModal();
  };

  // Close modal when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        handleCloseNewDMModal();
      }
    }
    if (showNewDMModal) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showNewDMModal]);

  const filteredUsers = getFilteredUsers();

  const sortedDMs = [...dmChannels].sort((a, b) => {
    // Server sends lastMessage.timestamp, not lastMessageTimestamp
    const aTime = a.lastMessage?.timestamp || a.createdAt || 0;
    const bTime = b.lastMessage?.timestamp || b.createdAt || 0;
    return bTime - aTime;
  });

  return (
    <div className="dm-list">
      <div className="dm-list-header">
        <span className="dm-list-title">Direct Messages</span>
      </div>

      {/* New DM Search */}
      <div className="dm-search-container">
        <input
          ref={searchInputRef}
          type="text"
          className="dm-search-input"
          placeholder="Search or start a DM..."
          value={searchQuery}
          onChange={handleSearchChange}
          onFocus={handleSearchFocus}
        />
        {searchQuery && (
          <button
            className="dm-search-clear"
            onClick={() => setSearchQuery('')}
            title="Clear search"
          >
            ×
          </button>
        )}
        {showAutocomplete && filteredUsers.length > 0 && (
          <div ref={autocompleteRef} className="dm-autocomplete">
            {filteredUsers.map(user => {
              const isFriend = friends.some(f => f.id === user.id);
              return (
                <div
                  key={user.id}
                  className="dm-autocomplete-item"
                  onClick={() => handleUserSelect(user)}
                >
                  <div className="dm-autocomplete-avatar" style={{ background: user.customAvatar ? 'transparent' : user.color }}>
                    {user.customAvatar
                      ? <img src={user.customAvatar} alt="" className="dm-autocomplete-avatar-img" />
                      : user.avatar}
                    <div className={`dm-autocomplete-status status-${user.status || 'offline'}`} />
                  </div>
                  <div className="dm-autocomplete-info">
                    <span className="dm-autocomplete-username" style={{ color: user.color }}>
                      {user.username}
                    </span>
                    {isFriend && <span className="dm-autocomplete-badge">Friend</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* New Conversation Button */}
      <div className="dm-new-conversation-container">
        <button className="dm-new-conversation-btn" onClick={handleOpenNewDMModal}>
          <span className="dm-new-conversation-icon">+</span>
          New Conversation
        </button>
      </div>

      {/* New DM Modal */}
      {showNewDMModal && (
        <div className="dm-modal-overlay">
          <div className="dm-modal" ref={modalRef}>
            <div className="dm-modal-header">
              <h3>Start a Conversation</h3>
              <button className="dm-modal-close" onClick={handleCloseNewDMModal}>×</button>
            </div>
            <div className="dm-modal-body">
              <label className="dm-modal-label">Enter Username</label>
              <input
                type="text"
                className="dm-modal-input"
                placeholder="Username..."
                value={newDMUsername}
                onChange={(e) => setNewDMUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateNewDM()}
                autoFocus
              />
              {newDMError && <div className="dm-modal-error">{newDMError}</div>}
            </div>
            <div className="dm-modal-footer">
              <button className="dm-modal-btn dm-modal-btn-cancel" onClick={handleCloseNewDMModal}>
                Cancel
              </button>
              <button className="dm-modal-btn dm-modal-btn-create" onClick={handleCreateNewDM}>
                Start Conversation
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="dm-list-items">
        {sortedDMs.length === 0 ? (
          <div className="dm-list-empty">
            <div className="dm-empty-icon"></div>
            <p>No conversations yet</p>
            <span className="dm-empty-hint">Click on a username to start a DM</span>
          </div>
        ) : (
          sortedDMs.map(dm => {
            const participant = getDMParticipant(dm);
            if (!participant) return null;

            const isActive = activeDMChannel?.id === dm.id;
            const hasUnread = dm.unreadCount > 0;

            return (
              <div
                key={dm.id}
                className={`dm-list-item ${isActive ? 'active' : ''} ${hasUnread ? 'unread' : ''}`}
                onClick={() => onSelectDM(dm)}
              >
                <div className="dm-avatar-wrapper">
                  <div className="dm-avatar" style={{ background: participant.customAvatar ? 'transparent' : participant.color }}>
                    {participant.customAvatar
                      ? <img src={participant.customAvatar} alt="" className="dm-avatar-img" />
                      : participant.avatar}
                  </div>
                  <div className={`dm-status-dot status-${participant.status || 'offline'}`} />
                </div>

                <div className="dm-content">
                  <div className="dm-header">
                    <span className="dm-username" style={{ color: participant.color }}>
                      {participant.username}
                    </span>
                    {dm.lastMessage?.timestamp && (
                      <span className="dm-timestamp">{formatTimestamp(dm.lastMessage.timestamp)}</span>
                    )}
                  </div>
                  <div className="dm-last-message">
                    {dm.lastMessage?.authorId === currentUser?.id && (
                      <span className="dm-message-you">You: </span>
                    )}
                    {truncateMessage(dm.lastMessage?.content)}
                  </div>
                </div>

                {hasUnread && (
                  <div className="dm-unread-badge">{dm.unreadCount > 99 ? '99+' : dm.unreadCount}</div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
});

export default DMList;
