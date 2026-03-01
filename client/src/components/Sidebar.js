import React, { useState, useEffect, useRef } from 'react';
import UserPanel from './UserPanel';
import { SettingsIcon, PhoneIcon } from './icons';
import './Sidebar.css';

function HashIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M10.5,10H7.5L9,3H7L5.5,10H2.5l-.5,2h3L4,16H1l-.5,2H3.5L2,24H4L5.5,18h3L7,24H9L10.5,18H13.5l.5-2H11L12,10h3l.5-2H12.5L14,3H12Z"/>
  </svg>;
}
function SpeakerIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M11.383 3.08C11.009 2.928 10.579 3.01 10.293 3.296L6 8.002H3C2.45 8.002 2 8.453 2 9.002v6c0 .55.45 1 1 1h3l4.293 4.705c.286.286.716.368 1.09.217.374-.151.617-.517.617-.922V4.002c0-.406-.243-.77-.617-.922z"/>
    <path d="M14 5.066c-.211 0-.422.084-.586.249-.289.287-.344.739-.122 1.088.988 1.578 1.495 3.562 1.495 5.598 0 2.036-.507 4.02-1.495 5.598-.222.35-.167.801.122 1.088.164.165.375.249.586.249.286 0 .565-.134.746-.387 1.166-1.821 1.754-4.143 1.754-6.548 0-2.404-.588-4.726-1.754-6.547A.906.906 0 0 0 14 5.066z"/>
  </svg>;
}
function LockIcon() {
  return <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style={{opacity:0.5}}>
    <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
  </svg>;
}

// ✅ Phase 2: Helper functions for DM display
function formatDMTime(timestamp) {
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

function truncateText(text, maxLength) {
  if (!text) return 'Start a conversation...';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

function FriendsList({ friends, onlineUsers, onCreateDM, dmSearch, onFriendAction, showConfirm }) {
  const [collapsed, setCollapsed] = useState(false);
  const [friendCtxMenu, setFriendCtxMenu] = useState(null);
  const friendLongPressRef = useRef(null);

  // Close friend context menu on outside click
  useEffect(() => {
    if (!friendCtxMenu) return;
    const handler = (e) => {
      if (!e.target.closest('.friend-ctx-menu')) setFriendCtxMenu(null);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [friendCtxMenu]);

  // Determine online status for each friend
  const friendsWithStatus = friends.map(f => ({
    ...f,
    isOnline: onlineUsers.some(u => u.id === f.id),
    status: onlineUsers.find(u => u.id === f.id)?.status || 'offline'
  }));

  // Sort: online first, then alphabetical
  friendsWithStatus.sort((a, b) => {
    if (a.isOnline && !b.isOnline) return -1;
    if (!a.isOnline && b.isOnline) return 1;
    return a.username.localeCompare(b.username);
  });

  // Filter by search
  const filtered = dmSearch?.trim()
    ? friendsWithStatus.filter(f => f.username.toLowerCase().includes(dmSearch.toLowerCase()))
    : friendsWithStatus;

  const onlineCount = friendsWithStatus.filter(f => f.isOnline).length;

  if (filtered.length === 0 && dmSearch?.trim()) return null;

  const openFriendCtx = (f, e) => {
    e.preventDefault();
    e.stopPropagation();
    const x = Math.min(e.clientX || e.pageX || 100, window.innerWidth - 200);
    const y = Math.min(e.clientY || e.pageY || 100, window.innerHeight - 180);
    setFriendCtxMenu({ friend: f, x, y });
  };

  return (
    <div className="dm-friends-section">
      <button className="dm-friends-header" onClick={() => setCollapsed(p => !p)}>
        <span className={`collapse-arrow ${collapsed ? 'collapsed' : ''}`}>▶</span>
        <span>FRIENDS — {onlineCount} Online</span>
      </button>
      {!collapsed && filtered.map(f => (
        <div
          key={f.id}
          className="dm-friend-item"
          onClick={() => onCreateDM(f.id)}
          onContextMenu={(e) => openFriendCtx(f, e)}
          onTouchStart={(e) => {
            const touch = e.touches[0];
            friendLongPressRef.current = setTimeout(() => {
              openFriendCtx(f, { preventDefault: () => {}, stopPropagation: () => {}, clientX: touch.clientX, clientY: touch.clientY });
            }, 500);
          }}
          onTouchMove={() => clearTimeout(friendLongPressRef.current)}
          onTouchEnd={() => clearTimeout(friendLongPressRef.current)}
          title={`Message ${f.username}`}
        >
          <div className="dm-avatar-wrapper">
            <div className="dm-avatar" style={{ background: f.customAvatar ? 'transparent' : (f.color || '#3B82F6') }}>
              {f.customAvatar
                ? <img src={f.customAvatar} alt="" className="dm-avatar-img" />
                : (f.avatar || '👤')}
            </div>
            <div className={`dm-status-dot status-${f.status}`} />
          </div>
          <div className="dm-friend-info">
            <span className="dm-friend-name" style={{ color: f.color || '#fff' }}>{f.username}</span>
            <span className="dm-friend-status">{f.isOnline ? f.status : 'Offline'}</span>
          </div>
        </div>
      ))}
      {/* Friend context menu */}
      {friendCtxMenu && (
        <div
          className="dm-sidebar-ctx-menu friend-ctx-menu"
          style={{ position: 'fixed', top: friendCtxMenu.y, left: friendCtxMenu.x, zIndex: 10000 }}
          onClick={e => e.stopPropagation()}
        >
          <button className="dm-ctx-item" onClick={() => { onCreateDM(friendCtxMenu.friend.id); setFriendCtxMenu(null); }}>
            Send Message
          </button>
          <button className="dm-ctx-item dm-ctx-danger" onClick={async () => {
            const confirmed = await showConfirm({
              title: 'Remove Friend',
              message: `Remove ${friendCtxMenu.friend.username} as a friend?`,
              confirmLabel: 'Remove',
            });
            if (confirmed) {
              onFriendAction?.('remove', null, friendCtxMenu.friend.id);
            }
            setFriendCtxMenu(null);
          }}>
            Remove Friend
          </button>
          <button className="dm-ctx-item dm-ctx-danger" onClick={async () => {
            const confirmed = await showConfirm({
              title: 'Block User',
              message: `Block ${friendCtxMenu.friend.username}?`,
              confirmLabel: 'Block',
            });
            if (confirmed) {
              onFriendAction?.('block', null, friendCtxMenu.friend.id);
            }
            setFriendCtxMenu(null);
          }}>
            Block
          </button>
        </div>
      )}
    </div>
  );
}

let sidebarMountCount = 0;

function ActivityToggleIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

const Sidebar = React.memo(function Sidebar({
  channels, activeChannel, activeChannelType, onSelectChannel,
  voiceChannelState, currentVoiceChannel, onlineUsers, currentUser,
  server, socket, onOpenSettings, voiceControls, className, onCreateDM, friends,
  pendingRequests = [], messageRequests = [], onFriendAction,
  channelUnreadCounts = {}, pinnedDMIds = [], onPinDM, onUnpinDM, onArchiveDM, onDeleteDM,
  mutedChannels = {}, onMuteChannel, onUnmuteChannel,
  onNavigateToVoice, dmCallActive,
  onChannelContextMenu,
  mutedCategories = {}, onCategoryContextMenu,
  activityCount = 0, onToggleActivity,
  showConfirm
}) {
  const [collapsed, setCollapsedRaw] = useState(() => {
    try {
      const key = `nexus_sidebar_collapsed_${server?.id}`;
      return JSON.parse(localStorage.getItem(key) || '{}');
    } catch { return {}; }
  });
  const setCollapsed = (updater) => {
    setCollapsedRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      try { localStorage.setItem(`nexus_sidebar_collapsed_${server?.id}`, JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const [dmSearch, setDMSearch] = useState('');
  const [dmCtxMenu, setDmCtxMenu] = useState(null);
  const longPressTimerRef = useRef(null);
  const sidebarRef = useRef(null);
  const instanceId = useRef(++sidebarMountCount);

  console.log(`[Sidebar #${instanceId.current}]  RENDER for server:`, server?.name);

  // ✅ Phase 2: Detect if this is the Personal (DM) server
  const isPersonalServer = server?.isPersonal || server?.id?.startsWith('personal:');

  // Track mount/unmount
  useEffect(() => {
    console.log(`[Sidebar #${instanceId.current}]  MOUNTED for server:`, server?.name);
    return () => {
      console.log(`[Sidebar #${instanceId.current}]  UNMOUNTED`);
    };
  }, [server?.name]);

  // DEFENSIVE FIX: Ensure only ONE sidebar exists at a time
  useEffect(() => {
    const cleanupDuplicates = () => {
      const allSidebars = document.querySelectorAll('.sidebar');
      if (allSidebars.length > 1) {
        console.warn(`[Sidebar] Found ${allSidebars.length} sidebars, removing ${allSidebars.length - 1} duplicates`);
        allSidebars.forEach((sidebar, index) => {
          // Keep only the current sidebar (using ref)
          if (sidebar !== sidebarRef.current) {
            sidebar.remove();
          }
        });
      }
    };

    // Clean up immediately on mount
    cleanupDuplicates();

    // Keep cleaning up every 2s as a safety net
    const interval = setInterval(cleanupDuplicates, 2000);

    return () => clearInterval(interval);
  }, []); // Run once on mount

  // Close DM context menu on outside click
  useEffect(() => {
    if (!dmCtxMenu) return;
    const close = () => setDmCtxMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [dmCtxMenu]);

  const toggleCategory = (catId) => setCollapsed(p => ({ ...p, [catId]: !p[catId] }));

  const categoryOrder = server?.categoryOrder || [];
  const categories = server?.categories || {};
  const allChannels = [...(channels.text || []), ...(channels.voice || [])];

  // Fallback: if no categories yet, show old flat layout
  const hasCats = categoryOrder.length > 0;

  const renderChannel = (ch) => {
    if (!ch) return null;
    const isText = ch.type === 'text';
    const chData = voiceChannelState?.[ch.id] || { users: [] };
    const inThis = currentVoiceChannel === ch.id;
    const isActive = activeChannel?.id === ch.id && activeChannelType === ch.type;
    const unreadCount = isText ? (channelUnreadCounts[ch.id] || 0) : 0;
    const chMuteEntry = mutedChannels[ch.id];
    const isChMuted = chMuteEntry && (chMuteEntry.until === 'forever' || Date.now() < chMuteEntry.until);

    return (
      <div key={ch.id}>
        <button
          className={`channel-item ${isActive ? 'active' : ''} ${inThis ? 'voice-active' : ''} ${unreadCount > 0 && !isActive ? 'has-unread' : ''} ${isChMuted ? 'channel-muted' : ''}`}
          onClick={() => onSelectChannel(ch, ch.type)}
          onContextMenu={(e) => { e.preventDefault(); onChannelContextMenu?.(e, ch); }}
        >
          <span className="channel-icon">{isText ? <HashIcon /> : <SpeakerIcon />}</span>
          <span className="channel-name">{ch.name}</span>
          {ch.isPrivate && <LockIcon />}
          {isChMuted && <span className="channel-muted-icon" title="Muted">🔕</span>}
          {!isText && chData.users.length > 0 && <span className="voice-count">{chData.users.length}</span>}
          {isText && (ch.webhooks || []).length > 0 && <span className="channel-webhook-dot">LINK</span>}
          {isText && !isActive && unreadCount > 0 && (
            <span className="channel-unread-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
          )}
        </button>
        {!isText && chData.users.map(u => (
          <div key={u.id} className={`voice-user ${inThis && u.socketId === currentUser?.socketId ? 'self' : ''}`}>
            <div className="voice-user-avatar-wrap">
              {u.customAvatar
                ? <img src={u.customAvatar} alt="" className="voice-user-custom-avatar"/>
                : <span>{u.avatar}</span>}
            </div>
            <span className="voice-user-name">{u.username}</span>
            {chData.screenSharerId === u.socketId && <span title="Screen sharing">SCREEN</span>}
          </div>
        ))}
      </div>
    );
  };

  const serverIcon = server?.customIcon
    ? <img src={server.customIcon} alt="" className="server-icon-img"/>
    : <span>{server?.icon || 'NEXUS'}</span>;

  // ✅ Phase 2: Render DM-style sidebar for Personal server
  if (isPersonalServer) {
    // Filter DM channels by search query and sort by most recent message
    const filteredDMs = (dmSearch.trim()
      ? channels.text.filter(ch =>
          ch.name?.toLowerCase().includes(dmSearch.toLowerCase()) ||
          ch.participant?.username?.toLowerCase().includes(dmSearch.toLowerCase())
        )
      : [...channels.text]
    ).sort((a, b) => {
      const aTime = a.lastMessage?.timestamp || a.createdAt || 0;
      const bTime = b.lastMessage?.timestamp || b.createdAt || 0;
      return bTime - aTime; // Most recent first
    });

    return (
      <div ref={sidebarRef} className={`sidebar sidebar-dm ${className || ''}`}>
        <div className="sidebar-header">
          <div className={`sidebar-server-icon ${server?.customIcon ? 'has-custom-icon' : ''}`}>{serverIcon}</div>
          <span className="sidebar-server-name">{server?.name || 'Direct Messages'}</span>
          <button className="sidebar-activity-btn" onClick={onToggleActivity} title="Activity">
            <ActivityToggleIcon size={16} />
            {activityCount > 0 && <span className="sidebar-activity-badge">{activityCount > 9 ? '9+' : activityCount}</span>}
          </button>
          <button className="sidebar-settings-btn" onClick={() => onOpenSettings?.('profile')} title="Settings">
            <SettingsIcon size={16} color="currentColor" />
          </button>
        </div>

        {/* DM Search + Create Group DM */}
        <div className="dm-search-bar">
          <input
            type="text"
            className="dm-search-input"
            placeholder="Find or start a conversation"
            value={dmSearch}
            onChange={e => setDMSearch(e.target.value)}
          />
          {dmSearch && (
            <button
              className="dm-search-clear"
              onClick={() => setDMSearch('')}
              title="Clear search"
            >
              ×
            </button>
          )}
          <button
            className="dm-create-group-btn"
            onClick={() => {
              if (socket) {
                // Open a simple prompt for group DM creation
                const name = prompt('Group name (optional):');
                // Need at least 1 friend to create a group
                if (friends && friends.length > 0) {
                  const selected = prompt('Enter usernames to add (comma-separated):');
                  if (selected) {
                    const usernames = selected.split(',').map(u => u.trim().toLowerCase());
                    const ids = friends
                      .filter(f => usernames.includes(f.username.toLowerCase()))
                      .map(f => f.id);
                    if (ids.length > 0) {
                      socket.emit('group-dm:create', { participantIds: ids, name: name || null });
                    }
                  }
                }
              }
            }}
            title="Create Group DM"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
            </svg>
          </button>
        </div>

        {/* Incoming Friend Requests */}
        {pendingRequests.filter(r => r.isIncoming).length > 0 && (
          <div className="dm-friend-requests">
            <div className="dm-fr-header">
              FRIEND REQUESTS — {pendingRequests.filter(r => r.isIncoming).length}
            </div>
            {pendingRequests.filter(r => r.isIncoming).map(req => {
              const from = req.requester || {};
              return (
                <div key={req.id} className="dm-fr-item">
                  <div className="dm-avatar-wrapper">
                    <div className="dm-avatar" style={{ background: from.customAvatar ? 'transparent' : (from.color || '#3B82F6') }}>
                      {from.customAvatar
                        ? <img src={from.customAvatar} alt="" className="dm-avatar-img" />
                        : (from.avatar || '👤')}
                    </div>
                  </div>
                  <div className="dm-fr-info">
                    <span className="dm-fr-name" style={{ color: from.color || '#fff' }}>
                      {from.username || 'Unknown'}
                    </span>
                    <span className="dm-fr-label">wants to be friends</span>
                  </div>
                  <div className="dm-fr-actions">
                    <button
                      className="dm-fr-btn accept"
                      title="Accept"
                      onClick={(e) => { e.stopPropagation(); onFriendAction?.('accept', req.id); }}
                    >
                      ✓
                    </button>
                    <button
                      className="dm-fr-btn ignore"
                      title="Ignore"
                      onClick={(e) => { e.stopPropagation(); onFriendAction?.('reject', req.id); }}
                    >
                      ✕
                    </button>
                    <button
                      className="dm-fr-btn block"
                      title="Block"
                      onClick={(e) => { e.stopPropagation(); onFriendAction?.('block', req.id, from.id); }}
                    >
                      🚫
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Message Requests (DMs from non-friends) */}
        {messageRequests.length > 0 && (
          <div className="dm-friend-requests dm-message-requests">
            <div className="dm-fr-header">
              MESSAGE REQUESTS — {messageRequests.length}
            </div>
            {messageRequests.map(req => {
              const from = req.participant || {};
              return (
                <div key={req.id} className="dm-fr-item" onClick={() => onSelectChannel(req, 'text')}>
                  <div className="dm-avatar-wrapper">
                    <div className="dm-avatar" style={{ background: from.customAvatar ? 'transparent' : (from.color || '#3B82F6') }}>
                      {from.customAvatar
                        ? <img src={from.customAvatar} alt="" className="dm-avatar-img" />
                        : (from.avatar || '👤')}
                    </div>
                  </div>
                  <div className="dm-fr-info">
                    <span className="dm-fr-name" style={{ color: from.color || '#fff' }}>
                      {from.username || 'Unknown'}
                    </span>
                    <span className="dm-fr-label">wants to message you</span>
                  </div>
                  <div className="dm-fr-actions">
                    <button
                      className="dm-fr-btn accept"
                      title="Accept"
                      onClick={(e) => { e.stopPropagation(); socket?.emit('dm:message-request:accept', { channelId: req.id }); }}
                    >
                      ✓
                    </button>
                    <button
                      className="dm-fr-btn ignore"
                      title="Ignore"
                      onClick={(e) => { e.stopPropagation(); socket?.emit('dm:message-request:reject', { channelId: req.id }); }}
                    >
                      ✕
                    </button>
                    <button
                      className="dm-fr-btn block"
                      title="Block"
                      onClick={(e) => { e.stopPropagation(); socket?.emit('dm:message-request:block', { channelId: req.id }); }}
                    >
                      🚫
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Friends List */}
        {friends && friends.length > 0 && (
          <FriendsList
            friends={friends}
            onlineUsers={onlineUsers}
            onCreateDM={onCreateDM}
            dmSearch={dmSearch}
            onFriendAction={onFriendAction}
            showConfirm={showConfirm}
          />
        )}

        {/* DM Channels */}
        <div className="sidebar-channels dm-channels-list">
          {filteredDMs.length === 0 && (!friends || friends.length === 0) && pendingRequests.filter(r => r.isIncoming).length === 0 ? (
            <div className="dm-empty-state">
              <p>No conversations yet</p>
              <span>Click on a username to start a DM</span>
            </div>
          ) : (
            filteredDMs.map(ch => {
              const participant = ch.participant || {};
              // Resolve live online status from onlineUsers (participant.status is stale from load time)
              const liveUser = onlineUsers.find(u => u.id === participant.id);
              const liveStatus = liveUser ? (liveUser.status || 'online') : 'offline';
              const isActive = activeChannel?.id === ch.id;
              const lastMsg = ch.lastMessage;

              return (
                <div
                  key={ch.id}
                  className={`dm-channel-item ${isActive ? 'active' : ''} ${dmCallActive === ch.id ? 'in-call' : ''}`}
                  onClick={() => onSelectChannel(ch, 'text')}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setDmCtxMenu({ channel: ch, x: e.clientX, y: e.clientY });
                  }}
                  onTouchStart={(e) => {
                    const touch = e.touches[0];
                    longPressTimerRef.current = setTimeout(() => {
                      setDmCtxMenu({ channel: ch, x: touch.clientX, y: touch.clientY });
                    }, 500);
                  }}
                  onTouchMove={() => clearTimeout(longPressTimerRef.current)}
                  onTouchEnd={() => clearTimeout(longPressTimerRef.current)}
                >
                  <div className="dm-avatar-wrapper">
                    <div
                      className="dm-avatar"
                      style={{ background: participant.customAvatar ? 'transparent' : (participant.color || '#3B82F6') }}
                    >
                      {participant.customAvatar ? (
                        <img src={participant.customAvatar} alt="" className="dm-avatar-img" />
                      ) : (
                        participant.avatar || '👤'
                      )}
                    </div>
                    <div className={`dm-status-dot status-${liveStatus}`} />
                  </div>

                  <div className="dm-channel-info">
                    <div className="dm-channel-header">
                      <span className="dm-channel-name" style={{ color: participant.color || '#fff' }}>
                        {pinnedDMIds.includes(ch.id) && <span className="dm-pin-icon" title="Pinned">📌</span>}
                        {ch.name || participant.username || 'Unknown'}
                      </span>
                      {lastMsg?.timestamp && (
                        <span className="dm-last-time">
                          {formatDMTime(lastMsg.timestamp)}
                        </span>
                      )}
                    </div>
                    {lastMsg && (
                      <div className="dm-last-message">
                        {lastMsg.authorId === currentUser?.id && <span className="dm-you">You: </span>}
                        {truncateText(lastMsg.content, 40)}
                      </div>
                    )}
                  </div>

                  {dmCallActive === ch.id && (
                    <div className="dm-call-indicator" title="In call">
                      <PhoneIcon size={14} color="var(--text-positive)" />
                    </div>
                  )}
                  {ch.unreadCount > 0 && (
                    <div className="dm-unread-badge">{ch.unreadCount > 99 ? '99+' : ch.unreadCount}</div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <UserPanel currentUser={currentUser} voiceControls={voiceControls} onOpenSettings={onOpenSettings} onNavigateToVoice={onNavigateToVoice} />

        {/* DM context menu */}
        {dmCtxMenu && (
          <div
            className="dm-sidebar-ctx-menu"
            style={{ position: 'fixed', top: dmCtxMenu.y, left: dmCtxMenu.x, zIndex: 10000 }}
            onClick={e => e.stopPropagation()}
          >
            {pinnedDMIds.includes(dmCtxMenu.channel.id) ? (
              <button className="dm-ctx-item" onClick={() => { onUnpinDM?.(dmCtxMenu.channel.id); setDmCtxMenu(null); }}>
                Unpin from Sidebar
              </button>
            ) : (
              <button className="dm-ctx-item" onClick={() => { onPinDM?.(dmCtxMenu.channel.id); setDmCtxMenu(null); }}>
                Pin to Sidebar
              </button>
            )}
            {mutedChannels[dmCtxMenu.channel.id] ? (
              <button className="dm-ctx-item" onClick={() => { onUnmuteChannel?.(dmCtxMenu.channel.id); setDmCtxMenu(null); }}>
                Unmute Conversation
              </button>
            ) : (
              <button className="dm-ctx-item" onClick={() => { onMuteChannel?.(dmCtxMenu.channel.id, 'forever'); setDmCtxMenu(null); }}>
                Mute Conversation
              </button>
            )}
            <button className="dm-ctx-item" onClick={() => { onArchiveDM?.(dmCtxMenu.channel.id); setDmCtxMenu(null); }}>
              Archive Conversation
            </button>
            <button className="dm-ctx-item dm-ctx-danger" onClick={() => { onDeleteDM?.(dmCtxMenu.channel.id); setDmCtxMenu(null); }}>
              Delete Conversation
            </button>
          </div>
        )}
      </div>
    );
  }

  // Regular server layout
  return (
    <div ref={sidebarRef} className={`sidebar ${className || ''}`}>
      <div className="sidebar-header">
        <div className={`sidebar-server-icon ${server?.customIcon ? 'has-custom-icon' : ''}`}>{serverIcon}</div>
        <span className="sidebar-server-name">{server?.name || 'Nexus'}</span>
        <button className="sidebar-activity-btn" onClick={onToggleActivity} title="Activity">
          <ActivityToggleIcon size={16} />
          {activityCount > 0 && <span className="sidebar-activity-badge">{activityCount > 9 ? '9+' : activityCount}</span>}
        </button>
        <button className="sidebar-settings-btn" onClick={() => onOpenSettings?.('server-settings')} title="Server settings">
          <SettingsIcon size={16} color="currentColor" />
        </button>
      </div>

      <div className="sidebar-channels">
        {hasCats ? (
          categoryOrder.map(catId => {
            const cat = categories[catId];
            if (!cat) return null;
            const catChannels = (cat.channels || []).map(id => allChannels.find(c => c.id === id)).filter(Boolean);
            const isCollapsed = collapsed[catId];
            const catMuteEntry = mutedCategories[catId];
            const isCatMuted = catMuteEntry && (catMuteEntry.until === 'forever' || Date.now() < catMuteEntry.until);
            return (
              <div key={catId} className={`channel-category ${isCatMuted ? 'category-muted' : ''}`}>
                <button
                  className="channel-category-header"
                  onClick={() => toggleCategory(catId)}
                  onContextMenu={(e) => { e.preventDefault(); onCategoryContextMenu?.(e, cat); }}
                >
                  <span className={`collapse-arrow ${isCollapsed ? 'collapsed' : ''}`}>▶</span>
                  <span>{cat.name}</span>
                  {isCatMuted && <span className="category-muted-icon" title="Muted">🔕</span>}
                  <button className="add-channel-btn"
                    onClick={e => { e.stopPropagation(); onOpenSettings?.('channels'); }}
                    title="Add channel">+</button>
                </button>
                {!isCollapsed && catChannels.map(ch => renderChannel(ch))}
              </div>
            );
          })
        ) : (
          <>
            <div className="channel-category">
              <button className="channel-category-header">
                <span>TEXT CHANNELS</span>
                <button className="add-channel-btn" onClick={() => onOpenSettings?.('channels')}>+</button>
              </button>
              {channels.text.map(ch => renderChannel(ch))}
            </div>
            <div className="channel-category">
              <button className="channel-category-header">
                <span>VOICE CHANNELS</span>
                <button className="add-channel-btn" onClick={() => onOpenSettings?.('channels')}>+</button>
              </button>
              {channels.voice.map(ch => renderChannel(ch))}
            </div>
          </>
        )}
      </div>

      <UserPanel currentUser={currentUser} voiceControls={voiceControls} onOpenSettings={onOpenSettings} onNavigateToVoice={onNavigateToVoice} />
    </div>
  );
});

export default Sidebar;
