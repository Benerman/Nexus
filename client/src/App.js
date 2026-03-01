import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { io } from 'socket.io-client';
import { useWebRTC } from './hooks/useWebRTC';
import ServerList from './components/ServerList';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import VoiceArea from './components/VoiceArea';
import LoginScreen from './components/LoginScreen';
import ServerSetupScreen from './components/ServerSetupScreen';
import MemberList from './components/MemberList';
import SettingsModal from './components/SettingsModal';
import UserContextMenu from './components/UserContextMenu';
import ServerContextMenu from './components/ServerContextMenu';
import ChannelContextMenu from './components/ChannelContextMenu';
import CategoryContextMenu from './components/CategoryContextMenu';
import UserProfileModal from './components/UserProfileModal';
import ReportModal from './components/ReportModal';
import ConfirmModal from './components/ConfirmModal';
import IncomingCallOverlay from './components/IncomingCallOverlay';
import ActivityPanel from './components/ActivityPanel';
import WelcomeTour from './components/WelcomeTour';
import { getServerUrl, needsServerSetup, setServerUrl, isStandaloneApp, requestNotificationPermission, sendNotification } from './config';
import { registerMenuUpdateCheck, autoCheckOnStartup } from './utils/updater';
import './App.css';
const EMPTY_CHANNELS = { text: [], voice: [] };

let renderCount = 0;

// Apply saved server order from localStorage
function applySavedServerOrder(serverList) {
  const savedOrder = localStorage.getItem('nexus_server_order');
  if (!savedOrder) return serverList;
  try {
    const orderIds = JSON.parse(savedOrder);
    const personal = serverList.filter(s => s.isPersonal || s.id?.startsWith('personal:'));
    const regular = serverList.filter(s => !s.isPersonal && !s.id?.startsWith('personal:'));
    // Sort regular servers by saved order, unknown servers go to the end
    const orderMap = new Map(orderIds.map((id, i) => [id, i]));
    regular.sort((a, b) => {
      const aIdx = orderMap.has(a.id) ? orderMap.get(a.id) : Infinity;
      const bIdx = orderMap.has(b.id) ? orderMap.get(b.id) : Infinity;
      return aIdx - bIdx;
    });
    return [...personal, ...regular];
  } catch {
    return serverList;
  }
}

export default function App() {
  renderCount++;
  const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
  console.log(`[App] RENDER #${renderCount} at ${timestamp}`);

  const [serverSetupNeeded, setServerSetupNeeded] = useState(() => needsServerSetup());
  const [socket, setSocket] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [servers, setServers] = useState([]);
  const [activeServerId, setActiveServerId] = useState(null);
  const [serverData, setServerData] = useState({});
  const [activeChannel, setActiveChannel] = useState(null);
  const [activeChannelType, setActiveChannelType] = useState('text');
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [voiceChannelState, setVoiceChannelState] = useState({});
  const [messages, setMessages] = useState({});
  const [channelHasMore, setChannelHasMore] = useState({});
  const [typingUsers, setTypingUsers] = useState({});
  const [screenSharerSocketId, setScreenSharerSocketId] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('profile');
  const [errorMsg, setErrorMsg] = useState(null);
  const [memberSidebarVisible, setMemberSidebarVisible] = useState(true);
  // ✅ Phase 2: Removed dmChannels, activeDMChannel, viewingDMs - Personal server is just a server
  const [contextMenu, setContextMenu] = useState(null);
  const [serverContextMenu, setServerContextMenu] = useState(null);
  const [channelContextMenu, setChannelContextMenu] = useState(null);
  const [categoryContextMenu, setCategoryContextMenu] = useState(null);
  const [friends, setFriends] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [messageRequests, setMessageRequests] = useState([]); // pending DM message requests
  const [dmUnreadCounts, setDmUnreadCounts] = useState({}); // channelId -> unread count
  const [profileUser, setProfileUser] = useState(null); // user to show in profile modal
  const [reportTarget, setReportTarget] = useState(null); // { userId, username, messageId?, messagePreview? }
  const [confirmModal, setConfirmModal] = useState(null);
  const [channelLastRead, setChannelLastRead] = useState(() => {
    try { return JSON.parse(localStorage.getItem('nexus_channel_last_read') || '{}'); } catch { return {}; }
  });
  const [pinnedDMs, setPinnedDMs] = useState(() => {
    try { return JSON.parse(localStorage.getItem('nexus_pinned_dms') || '[]'); } catch { return []; }
  });
  const [connectionState, setConnectionState] = useState('connecting'); // 'connected' | 'connecting' | 'disconnected'
  const [showConnectionBanner, setShowConnectionBanner] = useState(false);
  const [showReconnectedBanner, setShowReconnectedBanner] = useState(false);
  const connectionBannerTimer = useRef(null);
  const [soundboardPlayed, setSoundboardPlayed] = useState(null); // { soundId, userId, username, _ts }
  const [scrollToMessageId, setScrollToMessageId] = useState(null); // message id to scroll to after channel switch
  const [showTour, setShowTour] = useState(false);

  // Mute & notification state
  const [mutedServers, setMutedServers] = useState(() => {
    try { return JSON.parse(localStorage.getItem('nexus_muted_servers') || '{}'); } catch { return {}; }
  });
  const [mutedChannels, setMutedChannels] = useState(() => {
    try { return JSON.parse(localStorage.getItem('nexus_muted_channels') || '{}'); } catch { return {}; }
  });
  const [mutedCategories, setMutedCategories] = useState(() => {
    try { return JSON.parse(localStorage.getItem('nexus_muted_categories') || '{}'); } catch { return {}; }
  });
  const [messageSoundsEnabled, setMessageSoundsEnabled] = useState(() => localStorage.getItem('nexus_message_sounds_enabled') !== 'false');
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => localStorage.getItem('nexus_notifications_enabled') !== 'false');
  const [notificationsPausedUntil, setNotificationsPausedUntil] = useState(() => {
    const val = localStorage.getItem('nexus_notifications_paused_until');
    return val ? parseInt(val) : 0;
  });

  // Last channel per server (remember where user was)
  const [lastChannelPerServer, setLastChannelPerServer] = useState(() => {
    try { return JSON.parse(localStorage.getItem('nexus_last_channel') || '{}'); } catch { return {}; }
  });

  // Developer mode
  const [developerMode, setDeveloperMode] = useState(() => localStorage.getItem('nexus_developer_mode') === 'true');

  // DM call state
  const [incomingCall, setIncomingCall] = useState(null); // { channelId, caller, isGroup }
  const [dmCallActive, setDmCallActive] = useState(null); // channelId of active DM call

  // Mobile swipe state
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileMemberListOpen, setMobileMemberListOpen] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchCurrentX = useRef(0);
  const touchCurrentY = useRef(0);

  // Activity panel state
  const [activities, setActivities] = useState([]);
  const [activityOpen, setActivityOpen] = useState(false);
  const activityTimers = useRef({});

  // Auto-updater state (Tauri only)
  const [updateAvailable, setUpdateAvailable] = useState(null); // { version, notes, install }

  const webrtc = useWebRTC(socket, currentUser, activeServerId);
  const webrtcRef = useRef(webrtc);
  webrtcRef.current = webrtc;
  const socketRef = useRef(null);
  const sessionRestored = useRef(false);
  const pendingInviteCode = useRef(null);
  const activeChannelRef = useRef(null);
  const channelLastReadRef = useRef(channelLastRead);
  const heartbeatRef = useRef(null);
  const [restoringSession, setRestoringSession] = useState(() => {
    // Check synchronously if we have a stored token (avoids login screen flash)
    return !!(localStorage.getItem('nexus_token') && localStorage.getItem('nexus_username'));
  });

  // Mute helpers
  const isServerMuted = useCallback((serverId) => {
    const entry = mutedServers[serverId];
    if (!entry) return false;
    if (entry.until === 'forever') return true;
    if (Date.now() < entry.until) return true;
    // Expired — clean up
    setMutedServers(prev => {
      const next = { ...prev };
      delete next[serverId];
      localStorage.setItem('nexus_muted_servers', JSON.stringify(next));
      return next;
    });
    return false;
  }, [mutedServers]);

  const isChannelMuted = useCallback((channelId) => {
    const entry = mutedChannels[channelId];
    if (!entry) return false;
    if (entry.until === 'forever') return true;
    if (Date.now() < entry.until) return true;
    setMutedChannels(prev => {
      const next = { ...prev };
      delete next[channelId];
      localStorage.setItem('nexus_muted_channels', JSON.stringify(next));
      return next;
    });
    return false;
  }, [mutedChannels]);

  const handleMuteServer = useCallback((serverId, duration) => {
    const until = duration === 'forever' ? 'forever' : Date.now() + duration;
    setMutedServers(prev => {
      const next = { ...prev, [serverId]: { until } };
      localStorage.setItem('nexus_muted_servers', JSON.stringify(next));
      return next;
    });
  }, []);

  const handleUnmuteServer = useCallback((serverId) => {
    setMutedServers(prev => {
      const next = { ...prev };
      delete next[serverId];
      localStorage.setItem('nexus_muted_servers', JSON.stringify(next));
      return next;
    });
  }, []);

  const handleMuteChannel = useCallback((channelId, duration) => {
    const until = duration === 'forever' ? 'forever' : Date.now() + duration;
    setMutedChannels(prev => {
      const next = { ...prev, [channelId]: { until } };
      localStorage.setItem('nexus_muted_channels', JSON.stringify(next));
      return next;
    });
  }, []);

  const handleUnmuteChannel = useCallback((channelId) => {
    setMutedChannels(prev => {
      const next = { ...prev };
      delete next[channelId];
      localStorage.setItem('nexus_muted_channels', JSON.stringify(next));
      return next;
    });
  }, []);

  const isCategoryMuted = useCallback((categoryId) => {
    const entry = mutedCategories[categoryId];
    if (!entry) return false;
    if (entry.until === 'forever') return true;
    if (Date.now() < entry.until) return true;
    setMutedCategories(prev => {
      const next = { ...prev };
      delete next[categoryId];
      localStorage.setItem('nexus_muted_categories', JSON.stringify(next));
      return next;
    });
    return false;
  }, [mutedCategories]);

  const handleMuteCategory = useCallback((categoryId, duration) => {
    const until = duration === 'forever' ? 'forever' : Date.now() + duration;
    setMutedCategories(prev => {
      const next = { ...prev, [categoryId]: { until } };
      localStorage.setItem('nexus_muted_categories', JSON.stringify(next));
      return next;
    });
  }, []);

  const handleUnmuteCategory = useCallback((categoryId) => {
    setMutedCategories(prev => {
      const next = { ...prev };
      delete next[categoryId];
      localStorage.setItem('nexus_muted_categories', JSON.stringify(next));
      return next;
    });
  }, []);

  // Activity / job tracking helpers
  const trackJob = useCallback((id, label, initialStatus = {}) => {
    setActivities(prev => {
      if (prev.find(j => j.id === id)) return prev;
      return [...prev, { id, label, status: 'running', progress: 0, currentItem: '', ...initialStatus }];
    });
  }, []);

  const updateJobProgress = useCallback((id, progress, currentItem) => {
    setActivities(prev => prev.map(j =>
      j.id === id ? { ...j, status: 'running', progress, currentItem: currentItem || j.currentItem } : j
    ));
  }, []);

  const completeJob = useCallback((id, summary) => {
    setActivities(prev => prev.map(j =>
      j.id === id ? { ...j, status: 'completed', progress: 1, summary } : j
    ));
    // Auto-remove after 8 seconds
    const timer = setTimeout(() => {
      setActivities(prev => prev.filter(j => j.id !== id));
      delete activityTimers.current[id];
    }, 8000);
    activityTimers.current[id] = timer;
  }, []);

  const failJob = useCallback((id, error) => {
    setActivities(prev => prev.map(j =>
      j.id === id ? { ...j, status: 'failed', error } : j
    ));
  }, []);

  const removeJob = useCallback((id) => {
    if (activityTimers.current[id]) {
      clearTimeout(activityTimers.current[id]);
      delete activityTimers.current[id];
    }
    setActivities(prev => prev.filter(j => j.id !== id));
  }, []);

  const clearJobs = useCallback(() => {
    Object.values(activityTimers.current).forEach(clearTimeout);
    activityTimers.current = {};
    setActivities([]);
  }, []);

  const activeJobCount = useMemo(() => activities.filter(j => j.status === 'running').length, [activities]);

  // Message notification sound (subtle 2-note chime via Web Audio API)
  const messageSoundCtxRef = useRef(null);
  const playMessageSound = useCallback(async () => {
    try {
      if (!messageSoundCtxRef.current || messageSoundCtxRef.current.state === 'closed') {
        messageSoundCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = messageSoundCtxRef.current;
      if (ctx.state === 'suspended') await ctx.resume();
      const deviceId = localStorage.getItem('nexus_audio_output');
      if (deviceId && deviceId !== 'default' && ctx.setSinkId) {
        try { await ctx.setSinkId(deviceId); } catch {}
      }
      const outputVol = parseInt(localStorage.getItem('nexus_audio_output_volume') || '100') / 100;
      const vol = 0.08 * outputVol;
      const t = ctx.currentTime;

      // Note 1: quick soft ping
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, t);
      gain1.gain.setValueAtTime(vol, t);
      gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(t);
      osc1.stop(t + 0.08);

      // Note 2: slightly higher follow-up
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1175, t + 0.06);
      gain2.gain.setValueAtTime(0.001, t);
      gain2.gain.setValueAtTime(vol * 0.7, t + 0.06);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(t + 0.06);
      osc2.stop(t + 0.18);
    } catch (err) {
      console.warn('[Sound] Message sound failed:', err);
    }
  }, []);

  // Debug: Track what's causing re-renders
  const prevPropsRef = useRef({ socket, currentUser, servers, activeServerId, serverData, activeChannel });
  useEffect(() => {
    const prev = prevPropsRef.current;
    const changes = [];
    if (prev.socket !== socket) changes.push('socket');
    if (prev.currentUser !== currentUser) changes.push('currentUser');
    if (prev.servers !== servers) changes.push('servers');
    if (prev.activeServerId !== activeServerId) changes.push('activeServerId');
    if (prev.serverData !== serverData) changes.push('serverData');
    if (prev.activeChannel !== activeChannel) changes.push('activeChannel');
    if (changes.length > 0) {
      console.log('[App] Re-render caused by:', changes.join(', '));
    }
    prevPropsRef.current = { socket, currentUser, servers, activeServerId, serverData, activeChannel };
  });

  // Initialize auto-updater (Tauri desktop only)
  useEffect(() => {
    if (!isStandaloneApp()) return;
    const callbacks = {
      onUpdateAvailable: (info) => setUpdateAvailable(info),
    };
    registerMenuUpdateCheck(callbacks);
    autoCheckOnStartup(callbacks);
  }, []);

  // Auto-select first server if current one was deleted
  useEffect(() => {
    if (!activeServerId && servers.length > 0 && currentUser) {
      const first = servers[0];
      setActiveServerId(first.id);
      if (first.channels?.text?.length > 0) {
        setActiveChannel(first.channels.text[0]);
        setActiveChannelType('text');
        if (socketRef.current) socketRef.current.emit('channel:join', { channelId: first.channels.text[0].id });
      }
    }
  }, [activeServerId, servers, currentUser]);

  // Keep refs in sync so socket handlers can access current values
  useEffect(() => { activeChannelRef.current = activeChannel; }, [activeChannel]);
  useEffect(() => { channelLastReadRef.current = channelLastRead; }, [channelLastRead]);
  const currentUserRef = useRef(currentUser);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);
  const mutedServersRef = useRef(mutedServers);
  useEffect(() => { mutedServersRef.current = mutedServers; }, [mutedServers]);
  const mutedChannelsRef = useRef(mutedChannels);
  useEffect(() => { mutedChannelsRef.current = mutedChannels; }, [mutedChannels]);
  const mutedCategoriesRef = useRef(mutedCategories);
  useEffect(() => { mutedCategoriesRef.current = mutedCategories; }, [mutedCategories]);
  const serverDataRef = useRef(serverData);
  useEffect(() => { serverDataRef.current = serverData; }, [serverData]);
  const messageSoundsEnabledRef = useRef(messageSoundsEnabled);
  useEffect(() => { messageSoundsEnabledRef.current = messageSoundsEnabled; }, [messageSoundsEnabled]);
  const notificationsEnabledRef = useRef(notificationsEnabled);
  useEffect(() => { notificationsEnabledRef.current = notificationsEnabled; }, [notificationsEnabled]);
  const notificationsPausedUntilRef = useRef(notificationsPausedUntil);
  useEffect(() => { notificationsPausedUntilRef.current = notificationsPausedUntil; }, [notificationsPausedUntil]);

  // Sync notification settings from localStorage (when changed in SettingsModal)
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'nexus_message_sounds_enabled') setMessageSoundsEnabled(e.newValue !== 'false');
      if (e.key === 'nexus_notifications_enabled') setNotificationsEnabled(e.newValue !== 'false');
      if (e.key === 'nexus_notifications_paused_until') setNotificationsPausedUntil(parseInt(e.newValue) || 0);
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const activeServer = serverData[activeServerId];
  const channels = activeServer?.channels || EMPTY_CHANNELS;

  // Helper to mark a channel as read
  const markChannelRead = useCallback((channelId, messageId) => {
    if (!channelId || !messageId) return;
    setChannelLastRead(prev => {
      if (prev[channelId] === messageId) return prev;
      const next = { ...prev, [channelId]: messageId };
      localStorage.setItem('nexus_channel_last_read', JSON.stringify(next));
      return next;
    });
  }, []);

  // Compute per-server unread counts
  const serverUnreadCounts = useMemo(() => {
    const counts = {};
    servers.forEach(srv => {
      if (srv.isPersonal || srv.id?.startsWith('personal:')) return;
      const srvData = serverData[srv.id];
      if (!srvData) return;
      let total = 0;
      (srvData.channels?.text || []).forEach(ch => {
        const channelMsgs = messages[ch.id];
        if (!channelMsgs || channelMsgs.length === 0) return;
        const lastMsg = channelMsgs[channelMsgs.length - 1];
        const lastReadId = channelLastRead[ch.id];
        if (!lastReadId) return; // never visited = treat as read
        if (lastMsg.id !== lastReadId) {
          const lastReadIdx = channelMsgs.findIndex(m => m.id === lastReadId);
          total += lastReadIdx === -1 ? channelMsgs.length : channelMsgs.length - lastReadIdx - 1;
        }
      });
      if (total > 0) counts[srv.id] = total;
    });
    return counts;
  }, [servers, serverData, messages, channelLastRead]);

  // Compute per-channel unread counts for active server
  const channelUnreadCounts = useMemo(() => {
    const counts = {};
    if (!activeServer || activeServer.isPersonal) return counts;
    (activeServer.channels?.text || []).forEach(ch => {
      const channelMsgs = messages[ch.id];
      if (!channelMsgs || channelMsgs.length === 0) return;
      const lastMsg = channelMsgs[channelMsgs.length - 1];
      const lastReadId = channelLastRead[ch.id];
      if (!lastReadId) return;
      if (lastMsg.id !== lastReadId) {
        const lastReadIdx = channelMsgs.findIndex(m => m.id === lastReadId);
        const count = lastReadIdx === -1 ? channelMsgs.length : channelMsgs.length - lastReadIdx - 1;
        if (count > 0) counts[ch.id] = count;
      }
    });
    return counts;
  }, [activeServer, messages, channelLastRead]);

  // Compute promoted DMs (unread, not pinned) and pinned DM channels
  const personalServer = useMemo(() => servers.find(s => s.isPersonal || s.id?.startsWith('personal:')), [servers]);
  const personalServerData = personalServer ? serverData[personalServer.id] : null;

  const promotedDMs = useMemo(() => {
    if (!personalServerData) return [];
    return (personalServerData.channels?.text || [])
      .filter(ch => (ch.unreadCount || dmUnreadCounts[ch.id] || 0) > 0 && !pinnedDMs.includes(ch.id))
      .map(ch => ({ ...ch, unreadCount: ch.unreadCount || dmUnreadCounts[ch.id] || 0 }));
  }, [personalServerData, dmUnreadCounts, pinnedDMs]);

  const pinnedDMChannels = useMemo(() => {
    if (!personalServerData) return [];
    const allDMs = personalServerData.channels?.text || [];
    return pinnedDMs
      .map(id => allDMs.find(ch => ch.id === id))
      .filter(Boolean)
      .map(ch => ({ ...ch, unreadCount: ch.unreadCount || dmUnreadCounts[ch.id] || 0 }));
  }, [personalServerData, pinnedDMs, dmUnreadCounts]);

  const showError = useCallback((msg, durationMs = 3000) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(null), durationMs);
  }, []);

  const handleLogin = useCallback(({ token, username }) => {
    console.log('[App]  handleLogin called with', { token: token?.slice(0, 10) + '...', username });

    // Always disconnect and clean up existing socket before creating a new one
    if (socketRef.current) {
      console.log('[App]  Disconnecting old socket');
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
      setSocket(null);
    }

    console.log('[App]  Creating new socket connection');
    const s = io(getServerUrl(), {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 50,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 15000,
      timeout: 10000
    });
    socketRef.current = s;
    setSocket(s);

    let isReconnect = false;

    s.on('connect', () => {
      console.log('[App]  Socket connected' + (isReconnect ? ' (reconnect)' : ''));
      setConnectionState('connected');

      // Clear reconnection banner timer and show brief "Reconnected" message
      if (connectionBannerTimer.current) {
        clearTimeout(connectionBannerTimer.current);
        connectionBannerTimer.current = null;
      }
      if (isReconnect) {
        setShowConnectionBanner(false);
        setShowReconnectedBanner(true);
        setTimeout(() => setShowReconnectedBanner(false), 4000);
      }

      s.emit('join', { token, username });

      // On reconnect, also request a full data refresh and rejoin active channel
      if (isReconnect) {
        setTimeout(() => {
          s.emit('data:refresh');
          const ch = activeChannelRef.current;
          if (ch?.id) s.emit('channel:join', { channelId: ch.id });
        }, 500);
      }
    });

    s.on('disconnect', (reason) => {
      console.log('[App]  Socket disconnected:', reason);
      setConnectionState('disconnected');
      // If server kicked us (io server disconnect), don't try to reconnect with stale token
      if (reason === 'io server disconnect') {
        console.log('[App]  Server disconnected us - clearing tokens');
        localStorage.removeItem('nexus_token');
        localStorage.removeItem('nexus_username');
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        s.removeAllListeners();
        socketRef.current = null;
        setSocket(null);
        setCurrentUser(null);
      } else {
        isReconnect = true;
      }
      setRestoringSession(false);
    });

    s.on('reconnect_attempt', (attemptNumber) => {
      console.log(`[App]  Reconnect attempt #${attemptNumber}`);
      setConnectionState('connecting');
      // Only show banner after 5 seconds of reconnection attempts
      if (!connectionBannerTimer.current) {
        connectionBannerTimer.current = setTimeout(() => {
          setShowConnectionBanner(true);
        }, 5000);
      }
    });

    s.on('connect_error', (err) => {
      console.log('[App]  Connect error:', err.message);
      setRestoringSession(false);
    });

    s.on('init', ({ user, server, servers, onlineUsers, voiceChannels }) => {
      console.log('[App]  Received init event', { servers: servers.length, onlineUsers: onlineUsers.length });
      // Apply saved user settings from server to localStorage
      if (user.settings && typeof user.settings === 'object') {
        const settingsKeyMap = {
          audio_input: 'nexus_audio_input',
          audio_input_volume: 'nexus_audio_input_volume',
          audio_output: 'nexus_audio_output',
          audio_output_volume: 'nexus_audio_output_volume',
          noise_gate_enabled: 'nexus_noise_gate_enabled',
          noise_gate_threshold: 'nexus_noise_gate_threshold',
          auto_gain_enabled: 'nexus_auto_gain_enabled',
          auto_gain_target: 'nexus_auto_gain_target',
          server_order: 'nexus_server_order',
        };
        for (const [serverKey, localKey] of Object.entries(settingsKeyMap)) {
          if (user.settings[serverKey] != null) {
            const val = serverKey === 'server_order' ? JSON.stringify(user.settings[serverKey]) : String(user.settings[serverKey]);
            localStorage.setItem(localKey, val);
          }
        }
      }
      // Restore pinned DMs from server settings
      if (user.settings?.pinned_dms && Array.isArray(user.settings.pinned_dms)) {
        setPinnedDMs(user.settings.pinned_dms);
        localStorage.setItem('nexus_pinned_dms', JSON.stringify(user.settings.pinned_dms));
      }
      setRestoringSession(false);
      setCurrentUser(user);

      // Detect first-time users: no regular servers and onboarding not yet completed
      const hasRegularServers = servers.some(s => !s.isPersonal && !s.id?.startsWith('personal:'));
      const onboardingDone = localStorage.getItem('nexus_onboarding_completed') === 'true';
      if (!hasRegularServers && !onboardingDone && !pendingInviteCode.current) {
        setShowTour(true);
      }

      setServers(applySavedServerOrder(servers));
      setActiveServerId(server.id);
      setServerData(() => {
        const next = {};
        servers.forEach(srv => { next[srv.id] = srv; });
        return next;
      });
      setOnlineUsers(onlineUsers);
      setVoiceChannelState(voiceChannels);

      // If we have an active channel (reconnect), stay on it; otherwise pick the first text channel
      const currentCh = activeChannelRef.current;
      if (currentCh?.id) {
        // Re-join current channel to refresh its messages
        s.emit('channel:join', { channelId: currentCh.id });
      } else if (server.channels.text.length > 0) {
        setActiveChannel(server.channels.text[0]);
        setActiveChannelType('text');
        s.emit('channel:join', { channelId: server.channels.text[0].id });
      }

      // Start periodic heartbeat for real-time state sync
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = setInterval(() => {
        if (document.hidden) return; // Skip heartbeat when tab is backgrounded
        if (s.connected) s.emit('data:refresh');
      }, 30000); // Refresh every 30 seconds

      // Request friend list, unread counts, and message requests after init
      if (token) {
        s.emit('friend:list');
        s.emit('dm:unread-counts');
        s.emit('dm:message-requests');
      }

      // Handle pending invite from URL (e.g. /invite/abc123)
      if (pendingInviteCode.current) {
        const code = pendingInviteCode.current;
        pendingInviteCode.current = null;
        console.log('[App]  Auto-using invite code from URL:', code);
        s.emit('invite:use', { inviteCode: code });
        // Clean up the URL
        window.history.replaceState({}, '', '/');
      }

      // Request notification permission
      requestNotificationPermission();
    });

    // Handle data refresh response (for visibility change / reconnection)
    s.on('data:refreshed', ({ user, servers, onlineUsers, voiceChannels }) => {
      console.log('[App]  Data refreshed - servers:', servers.length, 'onlineUsers:', onlineUsers.length);
      setCurrentUser(prev => ({ ...prev, ...user }));
      setServers(applySavedServerOrder(servers));
      setServerData(() => {
        const next = {};
        servers.forEach(srv => { next[srv.id] = srv; });
        return next;
      });
      setOnlineUsers(onlineUsers);
      setVoiceChannelState(voiceChannels);
    });

    s.on('user:joined', ({ onlineUsers }) => setOnlineUsers(onlineUsers));
    s.on('user:left',   ({ onlineUsers }) => setOnlineUsers(onlineUsers));
    s.on('user:updated', ({ user, onlineUsers }) => {
      setOnlineUsers(onlineUsers);
      setCurrentUser(prev => prev?.id === user.id ? { ...prev, ...user } : prev);
    });

    s.on('channel:history', ({ channelId, messages: msgs, hasMore }) => {
      setMessages(prev => {
        const existing = prev[channelId] || [];
        if (existing.length === 0) {
          return { ...prev, [channelId]: msgs };
        }
        // Merge: keep cached messages, add any new ones from server
        const existingIds = new Set(existing.map(m => m.id));
        const newMsgs = msgs.filter(m => !existingIds.has(m.id));
        if (newMsgs.length === 0) return prev;
        const merged = [...existing, ...newMsgs].sort((a, b) => a.timestamp - b.timestamp);
        return { ...prev, [channelId]: merged };
      });
      setChannelHasMore(prev => ({ ...prev, [channelId]: !!hasMore }));
      // Mark channel as read when history loads (user is viewing it)
      if (msgs.length > 0 && activeChannelRef.current?.id === channelId) {
        const lastMsg = msgs[msgs.length - 1];
        setChannelLastRead(prev => {
          const next = { ...prev, [channelId]: lastMsg.id };
          localStorage.setItem('nexus_channel_last_read', JSON.stringify(next));
          return next;
        });
      }
    });
    s.on('message:new', msg => {
      setMessages(prev => ({ ...prev, [msg.channelId]: [...(prev[msg.channelId] || []), msg] }));
      // Auto-mark as read if user is currently viewing this channel
      const isViewingChannel = activeChannelRef.current?.id === msg.channelId;
      if (isViewingChannel) {
        setChannelLastRead(prev => {
          const next = { ...prev, [msg.channelId]: msg.id };
          localStorage.setItem('nexus_channel_last_read', JSON.stringify(next));
          return next;
        });
      }
      // Message sound & notifications
      const cu = currentUserRef.current;
      const authorId = msg.author?.id || msg.userId;
      if (cu && authorId !== cu.id && cu.status !== 'dnd') {
        // Check if current user is mentioned
        const isMentioned = msg.mentions?.everyone ||
          (msg.mentions?.users && msg.mentions.users.some(u => u.id === cu.id));
        // Check mute status
        const serverMute = mutedServersRef.current[msg.serverId];
        const channelMute = mutedChannelsRef.current[msg.channelId];
        const isServerMuted = serverMute && (serverMute.until === 'forever' || Date.now() < serverMute.until);
        const isChannelMuted = channelMute && (channelMute.until === 'forever' || Date.now() < channelMute.until);
        // Check if the channel's category is muted
        let isCatMuted = false;
        const srv = serverDataRef.current[msg.serverId];
        if (srv?.categories) {
          const catId = Object.keys(srv.categories).find(cid =>
            srv.categories[cid].channels?.includes(msg.channelId)
          );
          if (catId) {
            const catMute = mutedCategoriesRef.current[catId];
            isCatMuted = catMute && (catMute.until === 'forever' || Date.now() < catMute.until);
          }
        }
        if (!isServerMuted && !isChannelMuted && !isCatMuted) {
          // Play sound — always if mentioned, otherwise only when not viewing channel
          if (messageSoundsEnabledRef.current && (isMentioned || !isViewingChannel)) {
            playMessageSound();
          }
          // Desktop notification when tab not focused, or always for @mentions
          const notPaused = !notificationsPausedUntilRef.current || Date.now() > notificationsPausedUntilRef.current;
          const shouldNotify = (document.visibilityState === 'hidden' || isMentioned) && notificationsEnabledRef.current && notPaused;
          if (shouldNotify) {
            // Find channel/server context for notification
            let channelName = null;
            const srvData = serverDataRef.current;
            for (const sId of Object.keys(srvData)) {
              const s = srvData[sId];
              if (s.isPersonal) continue;
              const ch = s.channels?.text?.find(c => c.id === msg.channelId);
              if (ch) { channelName = ch.name; break; }
            }

            const authorName = msg.author?.username || msg.username || 'New message';
            const title = isMentioned
              ? `[Mention] ${authorName}${channelName ? ` in #${channelName}` : ''}`
              : `${authorName}${channelName ? ` in #${channelName}` : ''}`;

            // Build body — prefer content, fall back to embed info, then attachment notice
            let body = (msg.content || '').replace(/[*_~`>#\[\]()\\|]/g, '').replace(/\s+/g, ' ').trim().substring(0, 100);
            if (!body) {
              if (msg.embeds?.length) {
                const e = msg.embeds[0];
                body = e.title || e.description?.substring(0, 100) || 'sent an embed';
              } else if (msg.attachments?.length) {
                body = 'sent an attachment';
              } else {
                body = 'sent a message';
              }
            }

            sendNotification(title, {
              body,
              icon: msg.author?.customAvatar || msg.author?.avatar || msg.avatar || '/favicon.ico',
              tag: isMentioned ? `mention-${msg.id}` : msg.channelId,
              silent: true,
              onclick: () => { window.focus(); }
            });
            if (messageSoundsEnabledRef.current && document.visibilityState === 'hidden') playMessageSound();
          }
        }
      }
    });
    s.on('message:reaction', ({ messageId, reactions }) =>
      setMessages(prev => {
        const u = { ...prev };
        Object.keys(u).forEach(ch => { u[ch] = u[ch].map(m => m.id === messageId ? { ...m, reactions } : m); });
        return u;
      }));
    s.on('message:deleted', ({ channelId, messageId }) =>
      setMessages(prev => ({
        ...prev,
        [channelId]: (prev[channelId] || []).filter(m => m.id !== messageId)
      })));
    s.on('message:edited', ({ channelId, messageId, content, editedAt }) =>
      setMessages(prev => ({
        ...prev,
        [channelId]: (prev[channelId] || []).map(m =>
          m.id === messageId ? { ...m, content, editedAt } : m
        )
      })));

    // Poll vote updates
    s.on('poll:updated', ({ channelId, messageId, commandData }) =>
      setMessages(prev => ({
        ...prev,
        [channelId]: (prev[channelId] || []).map(m =>
          m.id === messageId ? { ...m, commandData } : m
        )
      })));

    // Reminder notification
    s.on('reminder', ({ message, channelId }) => {
      sendNotification('Reminder', { body: message, icon: '/favicon.ico', tag: 'reminder-' + channelId });
      alert(`Reminder: ${message}`);
    });

    s.on('typing:update', ({ channelId, user, typing }) =>
      setTypingUsers(prev => {
        const ch = { ...(prev[channelId] || {}) };
        if (typing) ch[user.id] = user; else delete ch[user.id];
        return { ...prev, [channelId]: ch };
      }));

    // New typing indicators for Phase 3
    s.on('typing:start', ({ channelId, user }) =>
      setTypingUsers(prev => {
        const ch = { ...(prev[channelId] || {}) };
        ch[user.id] = user;
        return { ...prev, [channelId]: ch };
      }));

    s.on('typing:stop', ({ channelId, userId }) =>
      setTypingUsers(prev => {
        const ch = { ...(prev[channelId] || {}) };
        delete ch[userId];
        return { ...prev, [channelId]: ch };
      }));

    s.on('voice:channel:update', ({ channelId, channel }) =>
      setVoiceChannelState(prev => ({ ...prev, [channelId]: channel })));

    s.on('screen:started', ({ socketId }) => setScreenSharerSocketId(socketId));
    s.on('screen:stopped', ({ socketId }) => {
      setScreenSharerSocketId(prev => prev === socketId ? null : prev);
    });
    s.on('voice:joined', ({ peers, screenSharerId }) => {
      if (screenSharerId) setScreenSharerSocketId(screenSharerId);
      webrtcRef.current.initExistingPeers(peers || []);
    });

    // DM call events
    s.on('dm:call-incoming', ({ channelId, caller, isGroup }) => {
      setIncomingCall({ channelId, caller, isGroup });
    });
    s.on('dm:call-declined', ({ channelId }) => {
      // Other user declined - could show a notification
      console.log('[DM Call] Call declined in', channelId);
    });
    s.on('dm:call-ended', ({ channelId }) => {
      setDmCallActive(prev => prev === channelId ? null : prev);
      setIncomingCall(prev => prev?.channelId === channelId ? null : prev);
    });

    s.on('soundboard:played', (data) => {
      setSoundboardPlayed({ ...data, _ts: Date.now() });
    });

    s.on('server:created', ({ server }) => {
      setServerData(prev => ({ ...prev, [server.id]: server }));
      setServers(prev => [...prev.filter(x => x.id !== server.id), server]);
    });
    s.on('servers:updated', ({ servers }) => {
      // Preserve Personal server (DMs) which is not in state.servers on the backend
      setServers(prev => {
        const personal = prev.find(s => s.isPersonal || s.id?.startsWith('personal:'));
        const regularServers = servers.filter(s => !s.isPersonal);
        return personal ? [personal, ...regularServers] : regularServers;
      });
      setServerData(prev => {
        const n = {};
        // Preserve personal server data
        Object.keys(prev).forEach(id => {
          if (prev[id]?.isPersonal || id.startsWith('personal:')) n[id] = prev[id];
        });
        servers.forEach(srv => { n[srv.id] = srv; });
        return n;
      });
    });
    s.on('server:updated', ({ server }) => {
      setServerData(prev => ({ ...prev, [server.id]: server }));
      setServers(prev => prev.map(x => x.id === server.id ? server : x));
    });
    s.on('server:deleted', ({ serverId }) => {
      setServerData(prev => {
        const n = { ...prev };
        delete n[serverId];
        return n;
      });
      setServers(prev => prev.filter(x => x.id !== serverId));
      setActiveServerId(prev => prev === serverId ? null : prev);
    });
    s.on('server:left', ({ serverId }) => {
      setServerData(prev => {
        const n = { ...prev };
        delete n[serverId];
        return n;
      });
      setServers(prev => prev.filter(x => x.id !== serverId));
      setActiveServerId(prev => prev === serverId ? null : prev);
    });

    // Handle invite:joined - add the new server to state
    s.on('invite:joined', ({ server }) => {
      if (server) {
        setServerData(prev => ({ ...prev, [server.id]: server }));
        setServers(prev => {
          if (prev.some(x => x.id === server.id)) return prev;
          return [...prev, server];
        });
        setActiveServerId(server.id);
        if (server.channels?.text?.length > 0) {
          setActiveChannel(server.channels.text[0]);
          setActiveChannelType('text');
          s.emit('channel:join', { channelId: server.channels.text[0].id });
        }
      }
    });

    s.on('error', ({ message }) => {
      console.log('[App]  Server error:', message);
      setRestoringSession(false);

      // If auth failed, clear stale tokens and disconnect socket so user can log in fresh
      if (message?.toLowerCase().includes('token') || message?.toLowerCase().includes('auth') || message?.toLowerCase().includes('expired') || message?.toLowerCase().includes('invalid')) {
        console.log('[App]  Auth error - clearing stored tokens');
        localStorage.removeItem('nexus_token');
        localStorage.removeItem('nexus_username');
        s.removeAllListeners();
        s.disconnect();
        socketRef.current = null;
        setSocket(null);
      }

      showError(message);
    });

    // ✅ Phase 2: DM channels now handled via Personal server
    // When a new DM is created, backend will emit 'server:updated' with the Personal server
    s.on('dm:created', ({ channel, messages: msgs, navigate = true }) => {
      // Add the DM channel to the Personal server's channel list
      setServerData(prev => {
        const personalServer = Object.values(prev).find(srv => srv.isPersonal || srv.id?.startsWith('personal:'));
        if (personalServer) {
          const updated = { ...prev };
          // Check if channel already exists to avoid duplicates
          const existingChannels = personalServer.channels?.text || [];
          const alreadyExists = existingChannels.some(ch => ch.id === channel.id);
          if (!alreadyExists) {
            updated[personalServer.id] = {
              ...personalServer,
              channels: {
                ...personalServer.channels,
                text: [...existingChannels, channel]
              }
            };
          }
          // Only navigate if this user initiated the DM
          if (navigate) {
            setTimeout(() => {
              setActiveServerId(personalServer.id);
            }, 0);
          }
          return updated;
        }
        return prev;
      });

      // Only navigate and load messages if this user initiated the DM
      if (navigate) {
        setMessages(prev => ({ ...prev, [channel.id]: msgs }));
        setActiveChannel(channel);
        setActiveChannelType('text');
        s.emit('channel:join', { channelId: channel.id });
        // Close side panels so the chat area is fully visible and input is accessible
        setMobileSidebarOpen(false);
        setMobileMemberListOpen(false);
      }
    });

    // Message request received from non-friend
    s.on('dm:message-request', ({ channel, messages: msgs }) => {
      console.log('[App] Message request received from:', channel.participant?.username);
      setMessageRequests(prev => {
        if (prev.some(r => r.id === channel.id)) return prev;
        return [...prev, channel];
      });
    });

    // Message request list
    s.on('dm:message-requests', ({ requests }) => {
      setMessageRequests(requests || []);
    });

    // Message request accepted — move channel from requests to active DMs
    s.on('dm:message-request:accepted', ({ channel, messages: msgs }) => {
      console.log('[App] Message request accepted:', channel.id);
      // Remove from message requests
      setMessageRequests(prev => prev.filter(r => r.id !== channel.id));

      // Add to personal server as active DM
      setServerData(prev => {
        const personalServer = Object.values(prev).find(srv => srv.isPersonal || srv.id?.startsWith('personal:'));
        if (personalServer) {
          const updated = { ...prev };
          const existingChannels = personalServer.channels?.text || [];
          // Remove any pending version and add the active one
          const filteredChannels = existingChannels.filter(ch => ch.id !== channel.id);
          updated[personalServer.id] = {
            ...personalServer,
            channels: {
              ...personalServer.channels,
              text: [...filteredChannels, { ...channel, messageRequest: null }]
            }
          };
          return updated;
        }
        return prev;
      });

      // Load messages
      if (msgs) {
        setMessages(prev => ({ ...prev, [channel.id]: msgs }));
      }

      // Update active channel if it's currently this one (remove the pending banner)
      setActiveChannel(prev => {
        if (prev?.id === channel.id) {
          return { ...prev, messageRequest: null };
        }
        return prev;
      });
    });

    // Message request rejected — remove from both sides
    s.on('dm:message-request:rejected', ({ channelId }) => {
      console.log('[App] Message request rejected:', channelId);
      setMessageRequests(prev => prev.filter(r => r.id !== channelId));
      // Also remove from server data in case it was shown as a pending DM
      setServerData(prev => {
        const personalServer = Object.values(prev).find(srv => srv.isPersonal || srv.id?.startsWith('personal:'));
        if (personalServer) {
          const updated = { ...prev };
          const existingChannels = personalServer.channels?.text || [];
          updated[personalServer.id] = {
            ...personalServer,
            channels: {
              ...personalServer.channels,
              text: existingChannels.filter(ch => ch.id !== channelId)
            }
          };
          return updated;
        }
        return prev;
      });
      // If currently viewing this channel, go back
      setActiveChannel(prev => {
        if (prev?.id === channelId) return null;
        return prev;
      });
    });

    // Group DM created
    s.on('group-dm:created', ({ channel, messages: msgs }) => {
      console.log('[App] Group DM created:', channel.id, channel.name);
      setServerData(prev => {
        const personalServer = Object.values(prev).find(srv => srv.isPersonal || srv.id?.startsWith('personal:'));
        if (personalServer) {
          const updated = { ...prev };
          const existingChannels = personalServer.channels?.text || [];
          const alreadyExists = existingChannels.some(ch => ch.id === channel.id);
          if (!alreadyExists) {
            updated[personalServer.id] = {
              ...personalServer,
              channels: {
                ...personalServer.channels,
                text: [...existingChannels, channel]
              }
            };
          }
          setTimeout(() => {
            setActiveServerId(personalServer.id);
          }, 0);
          return updated;
        }
        return prev;
      });
      setMessages(prev => ({ ...prev, [channel.id]: msgs || [] }));
      setActiveChannel(channel);
      setActiveChannelType('text');
      s.emit('channel:join', { channelId: channel.id });
    });

    // Group DM participant added
    s.on('group-dm:participant-added', ({ channelId, participant }) => {
      console.log('[App] Participant added to group DM:', channelId, participant?.username);
      setServerData(prev => {
        const personalServer = Object.values(prev).find(srv => srv.isPersonal || srv.id?.startsWith('personal:'));
        if (!personalServer) return prev;
        const updated = { ...prev };
        updated[personalServer.id] = {
          ...personalServer,
          channels: {
            ...personalServer.channels,
            text: (personalServer.channels?.text || []).map(ch => {
              if (ch.id !== channelId) return ch;
              const existing = ch.participants || [];
              if (existing.some(p => p.id === participant.id)) return ch;
              return { ...ch, participants: [...existing, participant] };
            })
          }
        };
        return updated;
      });
    });

    // Group DM participant removed
    s.on('group-dm:participant-removed', ({ channelId, userId }) => {
      console.log('[App] Participant removed from group DM:', channelId, userId);
      setServerData(prev => {
        const personalServer = Object.values(prev).find(srv => srv.isPersonal || srv.id?.startsWith('personal:'));
        if (!personalServer) return prev;
        const updated = { ...prev };
        updated[personalServer.id] = {
          ...personalServer,
          channels: {
            ...personalServer.channels,
            text: (personalServer.channels?.text || []).map(ch => {
              if (ch.id !== channelId) return ch;
              return { ...ch, participants: (ch.participants || []).filter(p => p.id !== userId) };
            })
          }
        };
        return updated;
      });
    });

    // Removed from group DM
    s.on('group-dm:removed', ({ channelId }) => {
      console.log('[App] Removed from group DM:', channelId);
      setServerData(prev => {
        const personalServer = Object.values(prev).find(srv => srv.isPersonal || srv.id?.startsWith('personal:'));
        if (!personalServer) return prev;
        const updated = { ...prev };
        updated[personalServer.id] = {
          ...personalServer,
          channels: {
            ...personalServer.channels,
            text: (personalServer.channels?.text || []).filter(ch => ch.id !== channelId)
          }
        };
        return updated;
      });
      setActiveChannel(prev => prev?.id === channelId ? null : prev);
    });

    // DM unread counts
    s.on('dm:unread-counts', ({ counts }) => {
      console.log('[App] Received unread counts:', counts);
      setDmUnreadCounts(counts);

      // Update Personal server channels with unread counts (avoid stale closure)
      setServerData(prev => {
        const personalServer = Object.values(prev).find(srv => srv.isPersonal || srv.id?.startsWith('personal:'));
        if (personalServer) {
          const updated = { ...prev };
          updated[personalServer.id] = {
            ...personalServer,
            channels: {
              ...personalServer.channels,
              text: (personalServer.channels?.text || []).map(ch => ({
                ...ch,
                unreadCount: counts[ch.id] || 0
              }))
            }
          };
          return updated;
        }
        return prev;
      });
    });

    // Friend events
    s.on('friend:list', ({ friends, pending }) => {
      console.log('[App] Received friend list:', friends.length, 'friends,', pending.length, 'pending');
      setFriends(friends);
      setPendingRequests(pending);
    });

    s.on('friend:request:sent', ({ requestId, username }) => {
      showError(`Friend request sent to ${username}`);
    });

    s.on('friend:request:received', ({ requestId, from }) => {
      showError(`${from.username} sent you a friend request`);
      // Refresh friend list to get updated pending requests
      if (token) s.emit('friend:list');
    });

    s.on('friend:accepted', ({ friendship }) => {
      showError('Friend request accepted!');
      // Refresh friend list
      if (token) s.emit('friend:list');
    });

    s.on('friend:rejected', ({ requestId }) => {
      // Refresh friend list
      if (token) s.emit('friend:list');
    });

    s.on('friend:removed', ({ friendId }) => {
      setFriends(prev => prev.filter(f => f.id !== friendId));
    });

    s.on('user:blocked', ({ userId }) => {
      showError('User blocked');
    });

    s.on('user:unblocked', ({ userId }) => {
      showError('User unblocked');
    });

    // Kick/ban/timeout — refresh server state to reflect member changes
    s.on('user:kicked', ({ serverId, userId, username }) => {
      showError(`${username || 'User'} was kicked`);
      s.emit('data:refresh');
    });
    s.on('user:banned', ({ serverId, userId, username }) => {
      showError(`${username || 'User'} was banned`);
      s.emit('data:refresh');
    });
    s.on('user:timedout', ({ serverId, userId, username, duration }) => {
      showError(`${username || 'User'} was timed out`);
    });

    // Activity tracking: transfers, ingests, exports, batches
    s.on('transfer:started', ({ transfer_id, device_name }) => {
      trackJob(transfer_id, `Transfer from ${device_name || 'device'}`, { status: 'running', progress: 0 });
    });
    s.on('transfer:progress', ({ transfer_id, files_completed, files_total, file_name }) => {
      updateJobProgress(transfer_id, files_total ? files_completed / files_total : 0, file_name);
    });
    s.on('transfer:complete', ({ transfer_id, summary }) => {
      completeJob(transfer_id, summary);
    });
    s.on('transfer:failed', ({ transfer_id, error }) => {
      failJob(transfer_id, error);
    });
    s.on('ingest:progress', ({ job_id, completed, total, file_name }) => {
      trackJob(job_id, 'Ingesting files');
      updateJobProgress(job_id, total ? completed / total : 0, file_name);
    });
    s.on('ingest:complete', ({ job_id, photos_ingested }) => {
      completeJob(job_id, { succeeded: photos_ingested, total_items: photos_ingested });
    });
    s.on('export:complete', ({ job_id, photos_exported }) => {
      completeJob(job_id, { succeeded: photos_exported, total_items: photos_exported });
    });
    s.on('export:failed', ({ job_id, error }) => {
      failJob(job_id, error);
    });
    s.on('batch:progress', ({ job_id, completed, total, photo_id }) => {
      trackJob(job_id, 'Batch operation');
      updateJobProgress(job_id, total ? completed / total : 0, photo_id);
    });
    s.on('batch:complete', ({ job_id, summary }) => {
      completeJob(job_id, summary);
    });

    // Clean up heartbeat on unmount
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [showError]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-restore session from localStorage on app mount (runs only once)
  useEffect(() => {
    // Prevent duplicate session restoration (React Strict Mode runs effects twice)
    if (sessionRestored.current) return;
    sessionRestored.current = true;

    // Detect invite URL (e.g. /invite/abc123)
    const path = window.location.pathname;
    const inviteMatch = path.match(/^\/invite\/(.+)$/);
    if (inviteMatch) {
      pendingInviteCode.current = inviteMatch[1];
      console.log('[App]  Detected invite URL, code:', inviteMatch[1]);
    }

    const token = localStorage.getItem('nexus_token');
    const username = localStorage.getItem('nexus_username');
    if (token && username) {
      handleLogin({ token, username });

      // Safety timeout: if session restore doesn't complete within 5 seconds,
      // clear tokens and show login screen to prevent being stuck on "Reconnecting..."
      const timeout = setTimeout(() => {
        setRestoringSession(prev => {
          if (prev) {
            console.log('[App]  Session restore timeout - clearing stale tokens');
            localStorage.removeItem('nexus_token');
            localStorage.removeItem('nexus_username');
            if (socketRef.current) {
              socketRef.current.removeAllListeners();
              socketRef.current.disconnect();
              socketRef.current = null;
              setSocket(null);
            }
          }
          return false;
        });
      }, 5000);

      // Clean up timeout if component unmounts
      return () => clearTimeout(timeout);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps = run only once on mount

  // ─── Page Visibility: refresh data when tab becomes visible ─────────────────
  useEffect(() => {
    let lastHiddenAt = 0;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        lastHiddenAt = Date.now();
      } else {
        // Page became visible again
        const hiddenDuration = lastHiddenAt ? Date.now() - lastHiddenAt : 0;
        console.log(`[App]  Page visible again (hidden for ${Math.round(hiddenDuration / 1000)}s)`);

        const s = socketRef.current;
        if (!s) return;

        if (hiddenDuration > 300000 && s.connected) {
          // Hidden longer than server pingTimeout — connection is likely dead
          console.log('[App]  Hidden too long, forcing reconnect');
          s.disconnect();
          s.connect();
          return;
        }

        if (!s.connected) {
          // Socket disconnected while hidden - reconnect
          console.log('[App]  Socket disconnected, reconnecting...');
          s.connect();
        } else {
          // Socket still connected - just request fresh data
          console.log('[App]  Requesting data refresh');
          s.emit('data:refresh');
          // Also re-join current channel to get fresh messages
          if (activeChannel?.id) {
            s.emit('channel:join', { channelId: activeChannel.id });
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [activeChannel?.id]);

  const handleSelectServer = useCallback((serverId) => {
    setActiveServerId(serverId);

    const srv = serverData[serverId];
    if (srv?.channels.text.length > 0) {
      // Try to restore last viewed channel for this server
      const lastChId = lastChannelPerServer[serverId];
      let ch = null;
      if (lastChId) ch = srv.channels.text.find(c => c.id === lastChId);
      if (!ch) ch = srv.channels.text[0]; // fallback to first channel
      setActiveChannel(ch);
      setActiveChannelType('text');
      if (socketRef.current) socketRef.current.emit('channel:join', { channelId: ch.id });
    } else {
      // No text channels (e.g. Personal server with no DMs yet) — clear stale channel
      setActiveChannel(null);
      setActiveChannelType('text');
    }
  }, [serverData, lastChannelPerServer]);

  const handleReorderServers = useCallback((newList) => {
    setServers(newList);
    // Persist order to localStorage (just the IDs of regular servers)
    const regularIds = newList
      .filter(s => !s.isPersonal && !s.id?.startsWith('personal:'))
      .map(s => s.id);
    localStorage.setItem('nexus_server_order', JSON.stringify(regularIds));
    // Sync server order to user account
    if (socketRef.current) {
      socketRef.current.emit('user:settings-update', { settings: { server_order: regularIds } });
    }
  }, []);

  // ✅ Phase 2: Removed handleSelectDMs - Personal server is selected like any other server

  const handleSelectChannel = useCallback((channel, type) => {
    // Remember last text channel per server
    const sid = channel.serverId || activeServerId;
    if (sid && type === 'text') {
      setLastChannelPerServer(prev => {
        const next = { ...prev, [sid]: channel.id };
        localStorage.setItem('nexus_last_channel', JSON.stringify(next));
        return next;
      });
    }

    if (type === 'text') {
      setActiveChannel(channel);
      setActiveChannelType('text');
      if (socketRef.current) socketRef.current.emit('channel:join', { channelId: channel.id });

      // If it's a DM channel, mark it as read
      if ((channel.isDM || channel.type === 'dm' || channel.type === 'group-dm') && socketRef.current) {
        const channelMessages = messages[channel.id] || [];
        const lastMessage = channelMessages[channelMessages.length - 1];
        socketRef.current.emit('dm:mark-read', {
          channelId: channel.id,
          messageId: lastMessage?.id || null
        });
      }

      // Mark server channel as read
      if (!channel.isDM && channel.type !== 'dm' && channel.type !== 'group-dm') {
        const channelMessages = messages[channel.id] || [];
        const lastMsg = channelMessages[channelMessages.length - 1];
        if (lastMsg) markChannelRead(channel.id, lastMsg.id);
      }
    } else {
      setActiveChannel(channel);
      setActiveChannelType('voice');
      if (webrtcRef.current.currentVoiceChannel !== channel.id)
        webrtcRef.current.joinVoice(channel.id);
    }
  }, [messages, markChannelRead, activeServerId]);

  const handleLeaveVoice = useCallback(() => {
    webrtcRef.current.leaveVoice();
    setScreenSharerSocketId(null);
    if (channels.text.length > 0) {
      const ch = channels.text[0];
      setActiveChannel(ch);
      setActiveChannelType('text');
      if (socketRef.current) socketRef.current.emit('channel:join', { channelId: ch.id });
    }
  }, [channels]);

  // Navigate to a specific message in a channel (e.g. from report moderation)
  const handleNavigateToMessage = useCallback((channelId, messageId) => {
    // Find the channel in the active server
    const allChannels = [...(channels.text || []), ...(channels.voice || [])];
    const targetChannel = allChannels.find(ch => ch.id === channelId);
    if (targetChannel) {
      setActiveChannel(targetChannel);
      setActiveChannelType('text');
      if (socketRef.current) socketRef.current.emit('channel:join', { channelId });
      setScrollToMessageId(messageId);
    }
  }, [channels]);

  // Refresh all data from server without page reload
  const handleRefreshData = useCallback(() => {
    if (!socketRef.current?.connected) return;
    socketRef.current.emit('data:refresh');
    const ch = activeChannelRef.current;
    if (ch?.id) socketRef.current.emit('channel:join', { channelId: ch.id });
    socketRef.current.emit('friend:list');
  }, []);

  // DM Call actions
  const handleStartDMCall = useCallback((channelId) => {
    if (!socketRef.current) return;
    socketRef.current.emit('dm:call-start', { channelId });
    setDmCallActive(channelId);
    // Join voice for this DM channel
    webrtcRef.current.joinVoice(channelId);
  }, []);

  const handleAcceptDMCall = useCallback((channelId) => {
    setIncomingCall(null);
    setDmCallActive(channelId);
    // Navigate to the DM channel
    const personal = Object.values(serverData).find(s => s.isPersonal || s.id?.startsWith('personal:'));
    if (personal) {
      const dmCh = (personal.channels?.text || []).find(ch => ch.id === channelId);
      if (dmCh) {
        setActiveServerId(personal.id);
        setActiveChannel(dmCh);
        setActiveChannelType('text');
      }
    }
    // Join voice
    webrtcRef.current.joinVoice(channelId);
  }, [serverData]);

  const handleDeclineDMCall = useCallback((channelId) => {
    setIncomingCall(null);
    if (socketRef.current) {
      socketRef.current.emit('dm:call-decline', { channelId });
    }
  }, []);

  const handleLeaveDMCall = useCallback(() => {
    webrtcRef.current.leaveVoice();
    setScreenSharerSocketId(null);
    setDmCallActive(null);
  }, []);

  // Fetch older messages for lazy loading
  const handleFetchOlderMessages = useCallback((channelId, beforeTimestamp) => {
    return new Promise((resolve) => {
      if (!socketRef.current) return resolve({ messages: [], hasMore: false });
      socketRef.current.emit('messages:fetch-older', { channelId, beforeTimestamp, limit: 30 }, (response) => {
        if (response?.messages?.length > 0) {
          setMessages(prev => {
            const existing = prev[channelId] || [];
            const existingIds = new Set(existing.map(m => m.id));
            const newMsgs = response.messages.filter(m => !existingIds.has(m.id));
            return { ...prev, [channelId]: [...newMsgs, ...existing] };
          });
        }
        setChannelHasMore(prev => ({ ...prev, [channelId]: !!response?.hasMore }));
        resolve(response);
      });
    });
  }, []);

  // Navigate to the active voice channel when clicking "Voice Connected"
  const handleNavigateToVoice = useCallback(() => {
    const voiceChId = webrtcRef.current.currentVoiceChannel;
    if (!voiceChId) return;
    // Find the voice channel object
    const voiceCh = channels.voice?.find(c => c.id === voiceChId);
    if (voiceCh) {
      setActiveChannel(voiceCh);
      setActiveChannelType('voice');
    }
  }, [channels]);

  // Memoize voiceControls to prevent unnecessary re-renders
  const voiceControls = useMemo(() => ({
    isMuted: webrtc.isMuted,
    isDeafened: webrtc.isDeafened,
    toggleMute: webrtc.toggleMute,
    toggleDeafen: webrtc.toggleDeafen,
    leaveVoice: handleLeaveVoice,
    inVoice: !!webrtc.currentVoiceChannel
  }), [
    webrtc.isMuted,
    webrtc.isDeafened,
    webrtc.toggleMute,
    webrtc.toggleDeafen,
    handleLeaveVoice,
    webrtc.currentVoiceChannel
  ]);

  const showConfirm = useCallback(({ title, message, confirmLabel, cancelLabel, danger = true }) => {
    return new Promise((resolve) => {
      setConfirmModal({ title, message, confirmLabel, cancelLabel, danger, resolve });
    });
  }, []);

  // DM handlers
  const handleUserClick = useCallback((user, event) => {
    if (user.id === currentUser?.id) return; // Don't show menu for own user
    setContextMenu({ user, position: { x: event.clientX, y: event.clientY } });
  }, [currentUser]);

  const handleContextMenuAction = useCallback(async (action, user) => {
    setContextMenu(null);

    if (action === 'send-dm' && socketRef.current) {
      socketRef.current.emit('dm:create', { targetUserId: user.id });
    } else if (action === 'add-friend' && socketRef.current) {
      socketRef.current.emit('friend:request', { targetUsername: user.username });
    } else if (action === 'block' && socketRef.current) {
      socketRef.current.emit('block:user', { userId: user.id });
    } else if (action === 'report') {
      setReportTarget({ userId: user.id, username: user.username });
    } else if (action === 'view-profile') {
      setProfileUser(user);
    } else if (action === 'kick' && socketRef.current) {
      const confirmed = await showConfirm({
        title: 'Kick Member',
        message: `Are you sure you want to kick ${user.username} from the server? They can rejoin with an invite link.`,
        confirmLabel: 'Kick',
      });
      if (confirmed) {
        socketRef.current.emit('server:kick-user', { serverId: activeServerId, userId: user.id });
      }
    } else if (action === 'ban' && socketRef.current) {
      const confirmed = await showConfirm({
        title: 'Ban Member',
        message: `Are you sure you want to ban ${user.username} from the server? They will not be able to rejoin.`,
        confirmLabel: 'Ban',
      });
      if (confirmed) {
        socketRef.current.emit('server:ban-user', { serverId: activeServerId, userId: user.id });
      }
    } else if (action === 'timeout' && socketRef.current) {
      const duration = prompt('Timeout duration in minutes:', '10');
      if (duration && !isNaN(duration) && parseInt(duration) > 0) {
        socketRef.current.emit('server:timeout-user', {
          serverId: activeServerId,
          userId: user.id,
          duration: parseInt(duration)
        });
      }
    }
  }, [activeServerId, showConfirm]);

  const handleReportMessage = useCallback((message) => {
    if (!message?.author) return;
    const preview = typeof message.content === 'string' ? message.content.slice(0, 120) : '';
    setReportTarget({
      userId: message.author.id,
      username: message.author.username,
      messageId: message.id,
      messagePreview: preview,
    });
  }, []);

  const handleSubmitReport = useCallback(({ reportType, description }) => {
    if (!socketRef.current || !reportTarget) return;
    socketRef.current.emit('report:user', {
      userId: reportTarget.userId,
      reportType,
      description,
      messageId: reportTarget.messageId || null,
    });
    setReportTarget(null);
  }, [reportTarget]);

  // Server context menu handler
  const handleServerContextMenu = useCallback((server, event) => {
    event.preventDefault();
    setServerContextMenu({ server, position: { x: event.clientX, y: event.clientY } });
  }, []);

  // Channel context menu handler
  const handleChannelContextMenu = useCallback((event, channel) => {
    event.preventDefault();
    setChannelContextMenu({ channel, position: { x: event.clientX, y: event.clientY } });
  }, []);

  const handleCategoryContextMenu = useCallback((event, category) => {
    event.preventDefault();
    setCategoryContextMenu({ category, position: { x: event.clientX, y: event.clientY } });
  }, []);

  // ✅ Phase 2: Removed handleSelectDM - DM channels are selected like regular channels

  // Navigate to a DM channel directly (used by promoted/pinned DMs and friend clicks)
  const handleSelectDMChannel = useCallback((channel) => {
    const personal = Object.values(serverData).find(s => s.isPersonal || s.id?.startsWith('personal:'));
    if (!personal) return;
    setActiveServerId(personal.id);
    setActiveChannel(channel);
    setActiveChannelType('text');
    if (socketRef.current) {
      socketRef.current.emit('channel:join', { channelId: channel.id });
      if (channel.isDM || channel.type === 'dm' || channel.type === 'group-dm') {
        const channelMsgs = messages[channel.id] || [];
        const lastMsg = channelMsgs[channelMsgs.length - 1];
        socketRef.current.emit('dm:mark-read', { channelId: channel.id, messageId: lastMsg?.id || null });
      }
    }
  }, [serverData, messages]);

  const handleCreateDM = useCallback((targetUserId) => {
    // Check if DM already exists — navigate directly if so
    const personal = Object.values(serverData).find(s => s.isPersonal || s.id?.startsWith('personal:'));
    if (personal) {
      const existingDM = (personal.channels?.text || []).find(ch => ch.participant?.id === targetUserId);
      if (existingDM) {
        handleSelectDMChannel(existingDM);
        return;
      }
    }
    if (socketRef.current) {
      console.log('[App] Creating DM with user:', targetUserId);
      socketRef.current.emit('dm:create', { targetUserId });
    }
  }, [serverData, handleSelectDMChannel]);

  // Pin/unpin DM channels
  const handlePinDM = useCallback((channelId) => {
    setPinnedDMs(prev => {
      if (prev.includes(channelId)) return prev;
      const next = [...prev, channelId];
      localStorage.setItem('nexus_pinned_dms', JSON.stringify(next));
      if (socketRef.current) socketRef.current.emit('user:settings-update', { settings: { pinned_dms: next } });
      return next;
    });
  }, []);

  const handleUnpinDM = useCallback((channelId) => {
    setPinnedDMs(prev => {
      const next = prev.filter(id => id !== channelId);
      localStorage.setItem('nexus_pinned_dms', JSON.stringify(next));
      if (socketRef.current) socketRef.current.emit('user:settings-update', { settings: { pinned_dms: next } });
      return next;
    });
  }, []);

  const handleReorderPinnedDMs = useCallback((newPinnedIds) => {
    setPinnedDMs(newPinnedIds);
    localStorage.setItem('nexus_pinned_dms', JSON.stringify(newPinnedIds));
    if (socketRef.current) socketRef.current.emit('user:settings-update', { settings: { pinned_dms: newPinnedIds } });
  }, []);

  // Archive (hide) a DM channel
  const handleArchiveDM = useCallback((channelId) => {
    if (socketRef.current) socketRef.current.emit('dm:close', { channelId });
    // Remove from pinned if it was pinned
    setPinnedDMs(prev => {
      const next = prev.filter(id => id !== channelId);
      localStorage.setItem('nexus_pinned_dms', JSON.stringify(next));
      if (socketRef.current) socketRef.current.emit('user:settings-update', { settings: { pinned_dms: next } });
      return next;
    });
    // Remove from local serverData
    setServerData(prev => {
      const ps = Object.values(prev).find(s => s.isPersonal || s.id?.startsWith('personal:'));
      if (!ps) return prev;
      const updated = { ...prev };
      updated[ps.id] = { ...ps, channels: { ...ps.channels, text: (ps.channels?.text || []).filter(ch => ch.id !== channelId) } };
      return updated;
    });
    // If viewing the archived DM, switch to another
    if (activeChannel?.id === channelId) {
      setActiveChannel(null);
    }
  }, [activeChannel]);

  // Delete a DM conversation for the current user only (hides it and clears messages from their view)
  const handleDeleteDM = useCallback(async (channelId) => {
    const confirmed = await showConfirm({
      title: 'Delete Conversation',
      message: 'Delete this conversation? Messages will be cleared from your view, but not for other participants.',
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;
    if (socketRef.current) socketRef.current.emit('dm:delete', { channelId });
    // Same local cleanup as archive
    setPinnedDMs(prev => {
      const next = prev.filter(id => id !== channelId);
      localStorage.setItem('nexus_pinned_dms', JSON.stringify(next));
      return next;
    });
    setServerData(prev => {
      const ps = Object.values(prev).find(s => s.isPersonal || s.id?.startsWith('personal:'));
      if (!ps) return prev;
      const updated = { ...prev };
      updated[ps.id] = { ...ps, channels: { ...ps.channels, text: (ps.channels?.text || []).filter(ch => ch.id !== channelId) } };
      return updated;
    });
    setMessages(prev => { const next = { ...prev }; delete next[channelId]; return next; });
    if (activeChannel?.id === channelId) setActiveChannel(null);
  }, [activeChannel, showConfirm]);

  const handleFriendAction = useCallback((action, requestId, userId) => {
    if (!socketRef.current) return;
    if (action === 'accept') {
      socketRef.current.emit('friend:accept', { requestId });
    } else if (action === 'reject') {
      socketRef.current.emit('friend:reject', { requestId });
    } else if (action === 'remove' && userId) {
      socketRef.current.emit('friend:remove', { friendId: userId });
    } else if (action === 'block' && userId) {
      socketRef.current.emit('block:user', { userId });
      // Also reject the friend request if there is one
      if (requestId) socketRef.current.emit('friend:reject', { requestId });
    }
  }, []);

  const handleTourComplete = useCallback((joinDefault) => {
    localStorage.setItem('nexus_onboarding_completed', 'true');
    setShowTour(false);
    if (joinDefault && socketRef.current) {
      socketRef.current.emit('server:join-default');
    }
  }, []);

  const openSettings = useCallback((tab = 'profile') => {
    setSettingsTab(tab); setSettingsOpen(true);
  }, []);

  const toggleMemberSidebar = useCallback(() => {
    // On mobile (<=768px), toggle the mobile slide-out member list
    if (window.innerWidth <= 768) {
      setMobileMemberListOpen(p => !p);
      setMobileSidebarOpen(false);
    } else {
      setMemberSidebarVisible(p => !p);
    }
  }, []);

  // Mobile swipe gesture handlers — global, works from anywhere on screen
  const handleTouchStart = useCallback((e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchCurrentX.current = e.touches[0].clientX;
    touchCurrentY.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e) => {
    touchCurrentX.current = e.touches[0].clientX;
    touchCurrentY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e) => {
    const deltaX = touchCurrentX.current - touchStartX.current;
    const deltaY = Math.abs(touchCurrentY.current - touchStartY.current);
    const threshold = 50;

    // Horizontal swipe must be at least 2x the vertical movement
    if (Math.abs(deltaX) > threshold && Math.abs(deltaX) > deltaY * 2) {
      if (deltaX > 0) {
        // Swipe right — open left sidebar or close right panel
        if (mobileMemberListOpen) {
          setMobileMemberListOpen(false);
        } else {
          setMobileSidebarOpen(true);
        }
      } else {
        // Swipe left — open right member list or close left sidebar
        if (mobileSidebarOpen) {
          setMobileSidebarOpen(false);
        } else {
          setMobileMemberListOpen(true);
          setMobileSidebarOpen(false);
        }
      }
    }
  }, [mobileSidebarOpen, mobileMemberListOpen]);

  const closeMobilePanels = useCallback(() => {
    setMobileSidebarOpen(false);
    setMobileMemberListOpen(false);
  }, []);

  const handleStartScreenShare = useCallback(() => {
    if (activeChannel?.id) {
      webrtcRef.current.startScreenShare(activeChannel.id);
    }
  }, [activeChannel?.id]);

  const handleStopScreenShare = useCallback(() => {
    if (activeChannel?.id) {
      webrtcRef.current.stopScreenShare(activeChannel.id);
    }
  }, [activeChannel?.id]);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('nexus_token');
    localStorage.removeItem('nexus_username');
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
      setSocket(null);
    }
    setCurrentUser(null);
    setSettingsOpen(false);
  }, []);

  const handleDeleteAccount = useCallback(async () => {
    try {
      const token = localStorage.getItem('nexus_token');
      if (!token) return;
      const url = getServerUrl();
      const res = await fetch(`${url}/api/auth/account`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to delete account');
        return;
      }
      localStorage.removeItem('nexus_token');
      localStorage.removeItem('nexus_username');
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
      }
      setCurrentUser(null);
      setSettingsOpen(false);
    } catch (err) {
      console.error('Account deletion error:', err);
      alert('Failed to delete account');
    }
  }, []);

  const handleChangeServer = useCallback(() => {
    // Disconnect, clear auth, clear server URL, show setup screen
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
      setSocket(null);
    }
    localStorage.removeItem('nexus_token');
    localStorage.removeItem('nexus_username');
    setServerUrl(null);
    setCurrentUser(null);
    setSettingsOpen(false);
    setServerSetupNeeded(true);
  }, []);

  // Register native menu callbacks (Tauri desktop only)
  useEffect(() => {
    if (!isStandaloneApp()) return;
    window.__NEXUS_OPEN_SETTINGS = () => {
      setSettingsTab('profile');
      setSettingsOpen(true);
    };
    window.__NEXUS_CHANGE_SERVER = () => {
      handleChangeServer();
    };
    return () => {
      delete window.__NEXUS_OPEN_SETTINGS;
      delete window.__NEXUS_CHANGE_SERVER;
    };
  }, [handleChangeServer]);

  if (serverSetupNeeded) {
    return <ServerSetupScreen onConnect={() => setServerSetupNeeded(false)} />;
  }

  if (!currentUser) {
    if (restoringSession) {
      return <div className="app" style={{ display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg-primary, #1e1f22)', color:'var(--text-muted, #949ba4)', height:'100vh' }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:32, marginBottom:12 }}>⬡</div>
          <div>Reconnecting...</div>
        </div>
      </div>;
    }
    return <LoginScreen onLogin={handleLogin} pendingInvite={!!pendingInviteCode.current} onChangeServer={isStandaloneApp() ? handleChangeServer : null} />;
  }

  const activeMessages = messages[activeChannel?.id] || [];
  const activeHasMore = channelHasMore[activeChannel?.id] || false;
  const activeTyping = Object.values(typingUsers[activeChannel?.id] || {})
    .filter(u => u.id !== currentUser.id);
  const hasRegularServers = servers.some(s => !s.isPersonal && !s.id?.startsWith('personal:'));

  return (
    <div
      className="app"
      onClick={() => { setContextMenu(null); setServerContextMenu(null); setChannelContextMenu(null); setCategoryContextMenu(null); }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {errorMsg && <div className="global-error">{errorMsg}</div>}
      {showConnectionBanner && connectionState !== 'connected' && (
        <div className="connection-banner">
          <span>{connectionState === 'connecting' ? 'Reconnecting...' : 'Disconnected — waiting to reconnect'}</span>
          <button className="banner-close" onClick={() => setShowConnectionBanner(false)}>&times;</button>
        </div>
      )}
      {showReconnectedBanner && (
        <div className="connection-banner reconnected">
          <span>Reconnected</span>
          <button className="banner-close" onClick={() => setShowReconnectedBanner(false)}>&times;</button>
        </div>
      )}
      {updateAvailable && (
        <div className="update-banner" onClick={() => updateAvailable.install?.()}>
          <span>Nexus v{updateAvailable.version} is available — click to update</span>
          <button className="banner-close" onClick={(e) => { e.stopPropagation(); setUpdateAvailable(null); }}>&times;</button>
        </div>
      )}

      {/* Mobile overlay backdrop */}
      {(mobileSidebarOpen || mobileMemberListOpen) && (
        <div className="mobile-overlay" onClick={closeMobilePanels} />
      )}

      <ServerList servers={servers} activeServerId={activeServerId}
        onSelectServer={handleSelectServer} onCreateServer={() => openSettings('servers')}
        onServerContextMenu={handleServerContextMenu}
        onReorderServers={handleReorderServers}
        serverUnreadCounts={serverUnreadCounts}
        dmUnreadCounts={dmUnreadCounts}
        promotedDMs={promotedDMs}
        pinnedDMChannels={pinnedDMChannels}
        pinnedDMIds={pinnedDMs}
        onSelectDMChannel={handleSelectDMChannel}
        onPinDM={handlePinDM}
        onUnpinDM={handleUnpinDM}
        onReorderPinnedDMs={handleReorderPinnedDMs}
        activeChannel={activeChannel}
        mutedServers={mutedServers} />

      {/* ✅ Phase 2: Sidebar handles both regular servers and Personal (DM) server */}
      <Sidebar
        channels={channels}
        activeChannel={activeChannel}
        activeChannelType={activeChannelType}
        onSelectChannel={handleSelectChannel}
        voiceChannelState={voiceChannelState}
        currentVoiceChannel={webrtc.currentVoiceChannel}
        onlineUsers={onlineUsers}
        currentUser={currentUser}
        server={activeServer}
        socket={socketRef.current}
        onOpenSettings={openSettings}
        voiceControls={voiceControls}
        onCreateDM={handleCreateDM}
        friends={friends}
        pendingRequests={pendingRequests}
        messageRequests={messageRequests}
        onFriendAction={handleFriendAction}
        className={mobileSidebarOpen ? 'mobile-open' : ''}
        channelUnreadCounts={channelUnreadCounts}
        pinnedDMIds={pinnedDMs}
        onPinDM={handlePinDM}
        onUnpinDM={handleUnpinDM}
        onArchiveDM={handleArchiveDM}
        onDeleteDM={handleDeleteDM}
        mutedChannels={mutedChannels}
        onMuteChannel={handleMuteChannel}
        onUnmuteChannel={handleUnmuteChannel}
        onNavigateToVoice={handleNavigateToVoice}
        dmCallActive={dmCallActive}
        onChannelContextMenu={handleChannelContextMenu}
        mutedCategories={mutedCategories}
        onCategoryContextMenu={handleCategoryContextMenu}
        activityCount={activeJobCount}
        onToggleActivity={() => setActivityOpen(o => !o)}
        showConfirm={showConfirm}
      />
      {/* Mobile sub-nav bar */}
      <div className="mobile-nav-bar">
        <button className="mobile-nav-left" onClick={() => { setMobileSidebarOpen(o => !o); setMobileMemberListOpen(false); }}>
          <span className="mobile-nav-arrow">{mobileSidebarOpen ? '‹' : '›'}</span>
          <span className="mobile-nav-channel">{activeChannel?.isDM ? activeChannel?.name : `# ${activeChannel?.name || 'general'}`}</span>
        </button>
        <button className="mobile-nav-activity" onClick={() => setActivityOpen(o => !o)} title="Activity">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          {activeJobCount > 0 && <span className="mobile-nav-activity-badge">{activeJobCount > 9 ? '9+' : activeJobCount}</span>}
        </button>
        {!activeServer?.isPersonal && (
          <button className="mobile-nav-right" onClick={() => { setMobileMemberListOpen(o => !o); setMobileSidebarOpen(false); }}>
            <span className="mobile-nav-online">{onlineUsers.filter(u => activeServer?.members?.[u.id]).length} online</span>
            <span className="mobile-nav-arrow">{mobileMemberListOpen ? '›' : '‹'}</span>
          </button>
        )}
      </div>
      <div className="main-content">
        {/* Media error banner */}
        {webrtc.mediaError && (
          <div className="media-error-banner">
            <div className="media-error-icon">&#9888;</div>
            <div className="media-error-text">
              <span className="media-error-title">{webrtc.mediaError.title}</span>
              <span className="media-error-message">{webrtc.mediaError.message}</span>
            </div>
            <div className="media-error-actions">
              {webrtc.mediaError.canRetry && webrtc.mediaError.channelId && (
                <button className="media-error-retry"
                  onClick={() => webrtc.retryJoinVoice(webrtc.mediaError.channelId, webrtc.mediaError.serverId)}>
                  Retry
                </button>
              )}
              <button className="media-error-dismiss" onClick={webrtc.clearMediaError}>&times;</button>
            </div>
          </div>
        )}
        {/* DM Call Voice Panel - shows above chat */}
        {dmCallActive && webrtc.currentVoiceChannel === dmCallActive && activeChannel?.isDM && (
          <div className="dm-call-voice-panel">
            <VoiceArea channel={activeChannel}
              voiceChannelData={voiceChannelState[dmCallActive]}
              remoteStreams={webrtc.remoteStreams} localStream={webrtc.localStream}
              remoteScreenStreams={webrtc.remoteScreenStreams}
              screenStream={webrtc.screenStream} isMuted={webrtc.isMuted}
              isDeafened={webrtc.isDeafened} isSharingScreen={webrtc.isSharingScreen}
              isWatchingScreen={webrtc.isWatchingScreen}
              isScreenAudioMuted={webrtc.isScreenAudioMuted}
              activeSpeakers={webrtc.activeSpeakers} screenSharerSocketId={screenSharerSocketId}
              remoteUserStates={webrtc.remoteUserStates}
              userVolumes={webrtc.userVolumes}
              localMutedUsers={webrtc.localMutedUsers}
              onToggleMute={webrtc.toggleMute} onToggleDeafen={webrtc.toggleDeafen}
              onStartScreenShare={handleStartScreenShare}
              onStopScreenShare={handleStopScreenShare}
              onWatchScreen={webrtc.watchScreen}
              onUnwatchScreen={webrtc.unwatchScreen}
              onToggleScreenAudioMute={webrtc.toggleScreenAudioMute}
              onSetUserVolume={webrtc.setUserVolume}
              onToggleUserMute={webrtc.toggleUserMute}
              onRegisterAudioElement={webrtc.registerAudioElement}
              onLeave={handleLeaveDMCall} onReconnect={webrtc.reconnectVoice}
              currentUser={currentUser} onlineUsers={onlineUsers}
              memberSidebarVisible={false}
              socket={socketRef.current}
              serverId={null}
              soundboard={[]}
              soundboardPlayed={null}
              onOpenSettings={openSettings}
              isDMCall={true}
              voiceStatus={webrtc.voiceStatus}
              voiceQuality={webrtc.voiceQuality}
              voiceStatusMessage={webrtc.voiceStatusMessage}
            />
          </div>
        )}
        {activeChannelType === 'voice' && webrtc.currentVoiceChannel && !dmCallActive ? (
          <VoiceArea channel={activeChannel}
            voiceChannelData={voiceChannelState[activeChannel?.id]}
            remoteStreams={webrtc.remoteStreams} localStream={webrtc.localStream}
            remoteScreenStreams={webrtc.remoteScreenStreams}
            screenStream={webrtc.screenStream} isMuted={webrtc.isMuted}
            isDeafened={webrtc.isDeafened} isSharingScreen={webrtc.isSharingScreen}
            isWatchingScreen={webrtc.isWatchingScreen}
            isScreenAudioMuted={webrtc.isScreenAudioMuted}
            activeSpeakers={webrtc.activeSpeakers} screenSharerSocketId={screenSharerSocketId}
            remoteUserStates={webrtc.remoteUserStates}
            userVolumes={webrtc.userVolumes}
            localMutedUsers={webrtc.localMutedUsers}
            onToggleMute={webrtc.toggleMute} onToggleDeafen={webrtc.toggleDeafen}
            onStartScreenShare={handleStartScreenShare}
            onStopScreenShare={handleStopScreenShare}
            onWatchScreen={webrtc.watchScreen}
            onUnwatchScreen={webrtc.unwatchScreen}
            onToggleScreenAudioMute={webrtc.toggleScreenAudioMute}
            onSetUserVolume={webrtc.setUserVolume}
            onToggleUserMute={webrtc.toggleUserMute}
            onRegisterAudioElement={webrtc.registerAudioElement}
            onLeave={handleLeaveVoice} onReconnect={webrtc.reconnectVoice}
            currentUser={currentUser} onlineUsers={onlineUsers}
            memberSidebarVisible={memberSidebarVisible}
            onToggleMemberSidebar={toggleMemberSidebar}
            socket={socketRef.current}
            serverId={activeServerId}
            soundboard={activeServer?.soundboard}
            soundboardPlayed={soundboardPlayed}
            onOpenSettings={openSettings}
            voiceStatus={webrtc.voiceStatus}
            voiceQuality={webrtc.voiceQuality}
            voiceStatusMessage={webrtc.voiceStatusMessage}
          />
        ) : !activeChannel && !hasRegularServers ? (
          <div className="empty-state">
            <div className="empty-state-icon">🏠</div>
            <h2 className="empty-state-title">Welcome to Nexus</h2>
            <p className="empty-state-text">You're not in any servers yet. Join the community or create your own!</p>
            <div className="empty-state-actions">
              <button className="empty-state-btn empty-state-btn-primary" onClick={() => {
                if (socketRef.current) socketRef.current.emit('server:join-default');
              }}>Join Nexus Server</button>
              <button className="empty-state-btn empty-state-btn-secondary" onClick={() => openSettings('servers')}>Create a Server</button>
            </div>
          </div>
        ) : (
          <ChatArea channel={activeChannel} messages={activeMessages}
            typingUsers={activeTyping} currentUser={currentUser}
            socket={socketRef.current} server={activeServer} servers={servers}
            onOpenSettings={openSettings}
            memberSidebarVisible={memberSidebarVisible}
            onToggleMemberSidebar={toggleMemberSidebar}
            hasMore={activeHasMore}
            onFetchOlderMessages={handleFetchOlderMessages}
            onStartDMCall={handleStartDMCall}
            dmCallActive={dmCallActive}
            onlineUsers={onlineUsers}
            friends={friends}
            developerMode={developerMode}
            onReportMessage={handleReportMessage}
            scrollToMessageId={scrollToMessageId}
            onScrollToMessageComplete={() => setScrollToMessageId(null)}
            onRefreshData={handleRefreshData}
            onTrackJob={trackJob}
            onCompleteJob={completeJob}
            onFailJob={failJob}
            showConfirm={showConfirm}
          />
        )}
      </div>
      {/* ✅ FIX: Hide MemberList when viewing Personal Server (DMs) */}
      {(memberSidebarVisible || mobileMemberListOpen) && !activeServer?.isPersonal && (
        <MemberList
          onlineUsers={onlineUsers}
          currentUser={currentUser}
          server={activeServer}
          onOpenSettings={openSettings}
          onUserClick={handleUserClick}
          onUserRightClick={(user, e) => {
            e.preventDefault();
            setContextMenu({ user, position: { x: e.clientX, y: e.clientY } });
          }}
          className={mobileMemberListOpen ? 'mobile-open' : ''}
        />
      )}
      {activityOpen && (
        <ActivityPanel
          jobs={activities}
          onRemove={removeJob}
          onClear={clearJobs}
          onClose={() => setActivityOpen(false)}
        />
      )}
      {incomingCall && (
        <IncomingCallOverlay
          caller={incomingCall.caller}
          channelId={incomingCall.channelId}
          isGroup={incomingCall.isGroup}
          onAccept={() => handleAcceptDMCall(incomingCall.channelId)}
          onDecline={() => handleDeclineDMCall(incomingCall.channelId)}
        />
      )}
      {settingsOpen && (
        <SettingsModal initialTab={settingsTab} currentUser={currentUser}
          server={activeServer} servers={servers} socket={socketRef.current}
          onlineUsers={onlineUsers}
          friends={friends}
          updateAudioProcessing={webrtc.updateAudioProcessing}
          onClose={() => setSettingsOpen(false)}
          onLogout={handleLogout}
          onDeleteAccount={handleDeleteAccount}
          onChangeServer={handleChangeServer}
          developerMode={developerMode}
          onSetDeveloperMode={(val) => { setDeveloperMode(val); localStorage.setItem('nexus_developer_mode', val ? 'true' : 'false'); }}
          onNavigateToMessage={handleNavigateToMessage}
          showConfirm={showConfirm} />
      )}
      {showTour && (
        <WelcomeTour
          onComplete={handleTourComplete}
          onSkip={() => { localStorage.setItem('nexus_onboarding_completed', 'true'); setShowTour(false); }}
        />
      )}
      {contextMenu && (
        <UserContextMenu
          user={contextMenu.user}
          position={contextMenu.position}
          currentUser={currentUser}
          onAction={handleContextMenuAction}
          onClose={() => setContextMenu(null)}
        />
      )}
      {profileUser && (
        <UserProfileModal
          user={profileUser}
          server={activeServer}
          servers={servers}
          currentUser={currentUser}
          socket={socketRef.current}
          onClose={() => setProfileUser(null)}
          onSendMessage={(user) => {
            if (socketRef.current) {
              socketRef.current.emit('dm:create', { targetUserId: user.id });
            }
          }}
          onAddFriend={(user) => {
            if (socketRef.current) {
              socketRef.current.emit('friend:request', { targetUsername: user.username });
            }
          }}
          onBlock={(user) => {
            if (socketRef.current) {
              socketRef.current.emit('block:user', { userId: user.id });
            }
          }}
        />
      )}
      {reportTarget && (
        <ReportModal
          target={reportTarget}
          onSubmit={handleSubmitReport}
          onClose={() => setReportTarget(null)}
        />
      )}
      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          confirmLabel={confirmModal.confirmLabel}
          cancelLabel={confirmModal.cancelLabel}
          danger={confirmModal.danger}
          onConfirm={() => { confirmModal.resolve(true); setConfirmModal(null); }}
          onCancel={() => { confirmModal.resolve(false); setConfirmModal(null); }}
        />
      )}
      {serverContextMenu && (
        <ServerContextMenu
          server={serverContextMenu.server}
          position={serverContextMenu.position}
          socket={socketRef.current}
          currentUser={currentUser}
          onClose={() => setServerContextMenu(null)}
          onOpenSettings={openSettings}
          mutedServers={mutedServers}
          onMuteServer={handleMuteServer}
          onUnmuteServer={handleUnmuteServer}
          developerMode={developerMode}
        />
      )}
      {channelContextMenu && (
        <ChannelContextMenu
          channel={channelContextMenu.channel}
          position={channelContextMenu.position}
          onClose={() => setChannelContextMenu(null)}
          developerMode={developerMode}
          mutedChannels={mutedChannels}
          onMuteChannel={handleMuteChannel}
          onUnmuteChannel={handleUnmuteChannel}
        />
      )}
      {categoryContextMenu && (
        <CategoryContextMenu
          category={categoryContextMenu.category}
          position={categoryContextMenu.position}
          onClose={() => setCategoryContextMenu(null)}
          developerMode={developerMode}
          mutedCategories={mutedCategories}
          onMuteCategory={handleMuteCategory}
          onUnmuteCategory={handleUnmuteCategory}
        />
      )}
    </div>
  );
}
