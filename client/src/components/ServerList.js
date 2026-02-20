import React, { useState, useRef, useCallback, useEffect } from 'react';
import './ServerList.css';
import { HexagonIcon } from './icons';
import useLongPress from '../hooks/useLongPress';

const ServerList = React.memo(function ServerList({
  servers = [], activeServerId, onSelectServer, onCreateServer, onServerContextMenu, onReorderServers,
  serverUnreadCounts = {}, dmUnreadCounts = {},
  promotedDMs = [], pinnedDMChannels = [], pinnedDMIds = [],
  onSelectDMChannel, onPinDM, onUnpinDM, onReorderPinnedDMs,
  activeChannel, mutedServers = {}
}) {
  const personalServer = servers.find(srv => srv.isPersonal || srv.id?.startsWith('personal:'));
  const regularServers = servers.filter(srv => !srv.isPersonal && !srv.id?.startsWith('personal:'));

  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const dragNodeRef = useRef(null);

  // Pinned DM drag state (separate from server drag)
  const [pinnedDragIndex, setPinnedDragIndex] = useState(null);
  const [pinnedDragOverIndex, setPinnedDragOverIndex] = useState(null);
  const pinnedDragNodeRef = useRef(null);

  // DM context menu
  const [dmCtxMenu, setDmCtxMenu] = useState(null);

  // Close context menu on outside click
  useEffect(() => {
    if (!dmCtxMenu) return;
    const close = () => setDmCtxMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [dmCtxMenu]);

  // Long-press for mobile context menu (servers)
  const longPressServerRef = useRef(null);
  const longPress = useLongPress(useCallback((e) => {
    if (longPressServerRef.current && onServerContextMenu) {
      onServerContextMenu(longPressServerRef.current, e);
    }
  }, [onServerContextMenu]), 500);

  // Long-press for DM context menu on mobile
  const longPressDMRef = useRef(null);
  const dmLongPress = useLongPress(useCallback((e) => {
    const dm = longPressDMRef.current;
    if (dm) {
      const isPinned = pinnedDMIds.includes(dm.id);
      const touch = e?.touches?.[0] || e;
      setDmCtxMenu({ dm, isPinned, x: touch.clientX || touch.pageX || 0, y: touch.clientY || touch.pageY || 0 });
    }
  }, [pinnedDMIds]), 500);

  // Server drag handlers
  const handleDragStart = useCallback((e, index) => {
    setDragIndex(index);
    dragNodeRef.current = e.target;
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
  }, []);

  const handleDragOver = useCallback((e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragIndex === null || dragIndex === index) return;
    setDragOverIndex(index);
  }, [dragIndex]);

  const handleDragEnd = useCallback(() => {
    if (dragNodeRef.current) dragNodeRef.current.classList.remove('dragging');
    setDragIndex(null);
    setDragOverIndex(null);
    dragNodeRef.current = null;
  }, []);

  const handleDrop = useCallback((e, dropIndex) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === dropIndex) return;
    const reordered = [...regularServers];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(dropIndex, 0, moved);
    const newList = personalServer ? [personalServer, ...reordered] : reordered;
    if (onReorderServers) onReorderServers(newList);
    setDragIndex(null);
    setDragOverIndex(null);
    dragNodeRef.current = null;
  }, [dragIndex, regularServers, personalServer, onReorderServers]);

  // Pinned DM drag handlers
  const handlePinnedDragStart = useCallback((e, index) => {
    setPinnedDragIndex(index);
    pinnedDragNodeRef.current = e.target;
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', 'pinned');
  }, []);

  const handlePinnedDragOver = useCallback((e, index) => {
    e.preventDefault();
    if (pinnedDragIndex === null || pinnedDragIndex === index) return;
    setPinnedDragOverIndex(index);
  }, [pinnedDragIndex]);

  const handlePinnedDragEnd = useCallback(() => {
    if (pinnedDragNodeRef.current) pinnedDragNodeRef.current.classList.remove('dragging');
    setPinnedDragIndex(null);
    setPinnedDragOverIndex(null);
    pinnedDragNodeRef.current = null;
  }, []);

  const handlePinnedDrop = useCallback((e, dropIndex) => {
    e.preventDefault();
    if (pinnedDragIndex === null || pinnedDragIndex === dropIndex) return;
    const reordered = [...pinnedDMChannels];
    const [moved] = reordered.splice(pinnedDragIndex, 1);
    reordered.splice(dropIndex, 0, moved);
    if (onReorderPinnedDMs) onReorderPinnedDMs(reordered.map(dm => dm.id));
    setPinnedDragIndex(null);
    setPinnedDragOverIndex(null);
    pinnedDragNodeRef.current = null;
  }, [pinnedDragIndex, pinnedDMChannels, onReorderPinnedDMs]);

  // Total DM unreads for home badge
  const totalDmUnread = Object.values(dmUnreadCounts).reduce((sum, c) => sum + c, 0);

  // Render a DM avatar item (shared between promoted and pinned)
  const renderDMItem = (dm, isPinned, index) => {
    const participant = dm.participant || {};
    const isActive = activeServerId === personalServer?.id && activeChannel?.id === dm.id;
    return (
      <div
        key={`${isPinned ? 'pin' : 'promo'}-${dm.id}`}
        className={`server-item dm-item ${isPinned ? 'dm-pinned' : 'dm-promoted'} ${isActive ? 'active' : ''}`}
        title={`${participant.username || dm.name}${isPinned ? ' (Pinned)' : ''}`}
        onClick={() => onSelectDMChannel?.(dm)}
        onContextMenu={(e) => {
          e.preventDefault();
          setDmCtxMenu({ dm, isPinned, x: e.clientX, y: e.clientY });
        }}
        onTouchStart={(e) => {
          longPressDMRef.current = dm;
          dmLongPress.onTouchStart(e);
        }}
        onTouchMove={dmLongPress.onTouchMove}
        onTouchEnd={dmLongPress.onTouchEnd}
        draggable={isPinned}
        onDragStart={isPinned ? (e) => handlePinnedDragStart(e, index) : undefined}
        onDragOver={isPinned ? (e) => handlePinnedDragOver(e, index) : undefined}
        onDragEnd={isPinned ? handlePinnedDragEnd : undefined}
        onDrop={isPinned ? (e) => handlePinnedDrop(e, index) : undefined}
      >
        {participant.customAvatar
          ? <img src={participant.customAvatar} alt="" className="server-item-custom-icon" draggable={false} />
          : <span style={{ fontSize: 18 }}>{participant.avatar || '👤'}</span>
        }
        {isPinned && <div className="dm-pin-indicator" />}
        {dm.unreadCount > 0 && (
          <div className="server-unread-badge">{dm.unreadCount > 99 ? '99+' : dm.unreadCount}</div>
        )}
        {isActive && <div className="server-active-pill"/>}
      </div>
    );
  };

  return (
    <div className="server-list">
      {/* Home (DM) icon */}
      <div
        className={`server-list-home ${activeServerId === personalServer?.id ? 'active' : ''}`}
        title="Direct Messages"
        onClick={() => { if (personalServer) onSelectServer(personalServer.id); }}
        style={{ cursor: 'pointer' }}
      >
        <span className="home-icon">
          <HexagonIcon size={28} color="currentColor" />
        </span>
        {totalDmUnread > 0 && activeServerId !== personalServer?.id && (
          <div className="server-unread-badge">{totalDmUnread > 99 ? '99+' : totalDmUnread}</div>
        )}
      </div>

      {/* Promoted (unread) DMs */}
      {promotedDMs.map(dm => renderDMItem(dm, false, 0))}

      {/* Pinned DMs */}
      {pinnedDMChannels.map((dm, index) => renderDMItem(dm, true, index))}

      <div className="server-list-separator"/>

      {/* Regular servers */}
      {regularServers.map((srv, index) => (
        <div
          key={srv.id}
          className={
            `server-item` +
            ` ${activeServerId === srv.id ? 'active' : ''}` +
            ` ${srv.customIcon ? 'has-custom-icon' : ''}` +
            ` ${dragOverIndex === index && dragIndex !== index ? 'drag-over' : ''}` +
            ` ${dragIndex === index ? 'drag-source' : ''}`
          }
          title={srv.name}
          draggable
          onClick={() => onSelectServer(srv.id)}
          onContextMenu={(e) => onServerContextMenu && onServerContextMenu(srv, e)}
          onTouchStart={(e) => {
            longPressServerRef.current = srv;
            longPress.onTouchStart(e);
          }}
          onTouchMove={longPress.onTouchMove}
          onTouchEnd={longPress.onTouchEnd}
          onDragStart={(e) => handleDragStart(e, index)}
          onDragOver={(e) => handleDragOver(e, index)}
          onDragEnd={handleDragEnd}
          onDrop={(e) => handleDrop(e, index)}
        >
          {srv.customIcon
            ? <img src={srv.customIcon} alt={srv.name} className="server-item-custom-icon" draggable={false} />
            : <span style={{ fontSize: 20 }}>{srv.icon || srv.name?.[0]?.toUpperCase() || 'S'}</span>}
          {activeServerId === srv.id && <div className="server-active-pill"/>}
          {serverUnreadCounts[srv.id] > 0 && activeServerId !== srv.id && !mutedServers[srv.id] && (
            <>
              <div className="server-unread-badge">{serverUnreadCounts[srv.id] > 99 ? '99+' : serverUnreadCounts[srv.id]}</div>
              <div className="server-unread-pill"/>
            </>
          )}
          {mutedServers[srv.id] && <div className="server-muted-indicator" title="Muted">🔕</div>}
        </div>
      ))}

      <div className="server-item add-server-btn" title="Create a Server" onClick={onCreateServer}>
        <span className="add-icon">+</span>
      </div>

      {/* DM context menu */}
      {dmCtxMenu && (
        <div
          className="dm-context-menu"
          style={{ position: 'fixed', top: dmCtxMenu.y, left: dmCtxMenu.x, zIndex: 10000 }}
          onClick={e => e.stopPropagation()}
        >
          <button className="dm-ctx-item" onClick={() => { onSelectDMChannel?.(dmCtxMenu.dm); setDmCtxMenu(null); }}>
            Open Conversation
          </button>
          {dmCtxMenu.isPinned ? (
            <button className="dm-ctx-item" onClick={() => { onUnpinDM?.(dmCtxMenu.dm.id); setDmCtxMenu(null); }}>
              Unpin from Sidebar
            </button>
          ) : (
            <button className="dm-ctx-item" onClick={() => { onPinDM?.(dmCtxMenu.dm.id); setDmCtxMenu(null); }}>
              Pin to Sidebar
            </button>
          )}
        </div>
      )}
    </div>
  );
});

export default ServerList;
