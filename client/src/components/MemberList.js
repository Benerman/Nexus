import React, { useMemo, useRef, useCallback } from 'react';
import './MemberList.css';
import useLongPress from '../hooks/useLongPress';

const MemberList = React.memo(function MemberList({ onlineUsers, currentUser, server, onOpenSettings, onUserClick, onUserRightClick, className }) {
  const members = server?.members || {};
  const roles = server?.roles || {};

  // Long-press for mobile context menu
  const longPressUserRef = useRef(null);
  const longPress = useLongPress(useCallback((e) => {
    if (longPressUserRef.current && onUserRightClick) {
      onUserRightClick(longPressUserRef.current, e);
    }
  }, [onUserRightClick]), 350);

  // Get the highest colored role for a user
  const getUserTopRole = (userId) => {
    const member = members[userId];
    if (!member) return null;
    const colored = (member.roles || [])
      .map(rid => roles[rid])
      .filter(r => r && r.color && r.id !== 'everyone')
      .sort((a, b) => (b.position || 0) - (a.position || 0));
    return colored[0] || null;
  };

  const getUserRoleNames = (userId) => {
    const member = members[userId];
    if (!member) return [];
    return (member.roles || []).map(rid => roles[rid]).filter(Boolean).filter(r => r.id !== 'everyone');
  };

  // Deduplicate online users by user ID and filter to only members of THIS server
  const serverOnlineUsers = useMemo(() => {
    const seen = new Set();
    return onlineUsers.filter(user => {
      if (seen.has(user.id)) return false;
      seen.add(user.id);
      return members[user.id]; // only include users who are members of this server
    });
  }, [onlineUsers, members]);

  // IDs of users who are both online AND members of this server
  const onlineMemberIds = useMemo(() => new Set(serverOnlineUsers.map(u => u.id)), [serverOnlineUsers]);

  // Filter to only show users who are actually online (not offline/invisible)
  const actuallyOnlineUsers = serverOnlineUsers.filter(user => user.status !== 'offline' && user.status !== 'invisible');

  // Build offline members list from server members who aren't currently online
  const offlineMembers = useMemo(() => {
    return Object.entries(members)
      .filter(([userId]) => !onlineMemberIds.has(userId))
      .map(([userId, member]) => ({
        id: userId,
        username: member.username || 'Unknown',
        avatar: member.avatar || '👤',
        customAvatar: member.customAvatar || null,
        color: member.color || '#3B82F6',
        status: 'offline',
        roles: member.roles || ['everyone'],
      }))
      .sort((a, b) => a.username.localeCompare(b.username));
  }, [members, onlineMemberIds]);

  const renderMember = (user, isOffline = false) => {
    const topRole = getUserTopRole(user.id);
    const nameColor = topRole?.color || user.color;
    return (
      <div
        key={user.id}
        className={`member-item ${user.id === currentUser?.id ? 'self' : ''} ${isOffline ? 'offline' : ''}`}
        onClick={(e) => {
          if (longPress.firedRef.current) { e.stopPropagation(); return; }
          onUserClick && onUserClick(user, e);
        }}
        onContextMenu={(e) => onUserRightClick && onUserRightClick(user, e)}
        onTouchStart={(e) => {
          longPressUserRef.current = user;
          longPress.onTouchStart(e);
        }}
        onTouchMove={longPress.onTouchMove}
        onTouchEnd={longPress.onTouchEnd}
        style={{ cursor: onUserClick || onUserRightClick ? 'pointer' : 'default' }}
      >
        <div className="member-avatar" style={{ background: user.customAvatar ? 'transparent' : user.color }}>
          {user.customAvatar
            ? <img src={user.customAvatar} alt="" className="member-custom-avatar" />
            : user.avatar}
          <div className={`member-status-dot status-${user.status || 'online'}`} />
        </div>
        <div className="member-info">
          <div className="member-name" style={{ color: nameColor }}>
            {user.username}
            {user.id === currentUser?.id && <span className="member-self-tag"> (you)</span>}
          </div>
          {getUserRoleNames(user.id).length > 0 && (
            <div className="member-roles">
              {getUserRoleNames(user.id).slice(0, 2).map(r => (
                <span key={r.id} className="member-role-badge" style={{ color: r.color || 'inherit' }}>
                  {r.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={`member-list ${className || ''}`}>
      <div className="member-list-header">
        <span>ONLINE — {actuallyOnlineUsers.length}</span>
      </div>
      {actuallyOnlineUsers.map(user => renderMember(user, false))}

      <div className="member-list-header">
        <span>OFFLINE — {offlineMembers.length}</span>
      </div>
      {offlineMembers.map(user => renderMember(user, true))}
    </div>
  );
});

export default MemberList;
