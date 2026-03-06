import React, { useRef, useEffect, useState, useCallback } from 'react';
import './VoiceArea.css';
import { MicrophoneIcon, HeadphoneIcon, ScreenShareIcon, PhoneIcon, VolumeIcon, SettingsIcon } from './icons';
import { isCapacitorApp } from '../config';

// Convert a data URI (data:audio/wav;base64,...) to ArrayBuffer without fetch
function dataUriToArrayBuffer(dataUri) {
  const base64 = dataUri.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

const AudioPlayer = React.memo(function AudioPlayer({ stream, muted = false, socketId, onRegister }) {
  const audioRef = useRef(null);

  useEffect(() => {
    if (audioRef.current && stream) {
      audioRef.current.srcObject = stream;
    }
  }, [stream]);

  // Apply muted state to audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = muted;
    }
  }, [muted]);

  // Route audio to selected output device
  useEffect(() => {
    const applyOutputDevice = async () => {
      const deviceId = localStorage.getItem('nexus_audio_output');
      if (audioRef.current && deviceId && deviceId !== 'default' && audioRef.current.setSinkId) {
        try {
          await audioRef.current.setSinkId(deviceId);
        } catch (err) {
          console.warn('Failed to set audio output device:', err);
        }
      }
    };
    applyOutputDevice();
  }, [stream]); // Re-apply when stream changes

  // Listen for output device changes from settings
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'nexus_audio_output' && audioRef.current?.setSinkId) {
        const deviceId = e.newValue || 'default';
        audioRef.current.setSinkId(deviceId === 'default' ? '' : deviceId).catch(() => {});
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Register this audio element for volume/mute control
  useEffect(() => {
    if (onRegister && socketId && audioRef.current) {
      onRegister(socketId, audioRef.current);
      return () => onRegister(socketId, null);
    }
  }, [onRegister, socketId]);

  return <audio ref={audioRef} autoPlay muted={muted} />;
});

const VideoPlayer = React.memo(function VideoPlayer({ stream, label, isSpeaking, isScreen, onFullscreen, audioMuted = true }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // Control audio mute via ref (React muted attribute only sets initial state)
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = audioMuted;
    }
  }, [audioMuted]);

  return (
    <div className={`video-tile ${isSpeaking ? 'speaking' : ''} ${isScreen ? 'screen-tile' : ''}`}>
      <video ref={videoRef} autoPlay playsInline muted={audioMuted} />
      <div className="video-label">{label}</div>
      {isScreen && onFullscreen && (
        <button className="fullscreen-btn" onClick={onFullscreen} title="Fullscreen">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
          </svg>
        </button>
      )}
    </div>
  );
});

const UserTile = React.memo(function UserTile({
  user,
  isSpeaking,
  audioLevel,
  isMuted,
  isDeafened,
  stream,
  userVolume,
  isLocallyMuted,
  onSetVolume,
  onToggleMute,
  onContextMenu
}) {
  const [volumeOpen, setVolumeOpen] = React.useState(false);
  const popupRef = React.useRef(null);

  // Close popup on click outside
  React.useEffect(() => {
    if (!volumeOpen) return;
    const handleClick = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) setVolumeOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('touchstart', handleClick);
    return () => { document.removeEventListener('mousedown', handleClick); document.removeEventListener('touchstart', handleClick); };
  }, [volumeOpen]);

  // Volume display: 0-150 slider, shown as percentage
  const displayVol = userVolume ?? 100;

  return (
    <div
      className={`voice-user-tile ${isSpeaking ? 'speaking' : ''}`}
      style={isSpeaking && audioLevel > 0 ? {
        boxShadow: `0 0 0 ${2 + (audioLevel || 0) * 6}px var(--green)`
      } : undefined}
      onContextMenu={onContextMenu}
    >
      {stream && stream.getVideoTracks().length > 0 ? (
        <>
          <VideoPlayer stream={stream} label={user?.username || 'Unknown'} isSpeaking={isSpeaking} />
          <div className="voice-tile-indicators">
            {isDeafened && (
              <div className="voice-tile-indicator deafened" title="Deafened">
                <HeadphoneIcon size={14} color="#fff" deafened />
              </div>
            )}
            {isMuted && !isDeafened && (
              <div className="voice-tile-indicator muted" title="Muted">
                <MicrophoneIcon size={14} color="#fff" muted />
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="voice-tile-avatar" style={{ background: user?.customAvatar ? 'transparent' : user?.color }}>
            {user?.customAvatar
              ? <img src={user.customAvatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
              : user?.avatar}
          </div>
          <div className="voice-tile-name">{user?.username}</div>
          <div className="voice-tile-indicators">
            {isDeafened && (
              <div className="voice-tile-indicator deafened" title="Deafened">
                <HeadphoneIcon size={14} color="#fff" deafened />
              </div>
            )}
            {isMuted && !isDeafened && (
              <div className="voice-tile-indicator muted" title="Muted">
                <MicrophoneIcon size={14} color="#fff" muted />
              </div>
            )}
          </div>
        </>
      )}

      {/* Speaker icon button — only for remote users */}
      {onSetVolume && onToggleMute && (
        <button
          className={`voice-tile-vol-btn ${isLocallyMuted || displayVol === 0 ? 'muted' : ''}`}
          onClick={(e) => { e.stopPropagation(); setVolumeOpen(v => !v); }}
          title="Adjust volume"
        >
          <VolumeIcon size={14} muted={isLocallyMuted || displayVol === 0} />
        </button>
      )}

      {/* Volume popup */}
      {volumeOpen && onSetVolume && (
        <div className="voice-tile-vol-popup" ref={popupRef}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}>
          <button
            className={`user-audio-btn ${isLocallyMuted ? 'muted' : ''}`}
            onClick={onToggleMute}
            title={isLocallyMuted ? 'Unmute user' : 'Mute user'}
          >
            <VolumeIcon size={16} muted={isLocallyMuted} />
          </button>
          <input
            type="range"
            min="0"
            max="150"
            value={displayVol}
            onChange={(e) => onSetVolume(parseInt(e.target.value))}
            className="user-volume-slider"
          />
          <span className="volume-label">{displayVol}%</span>
        </div>
      )}
    </div>
  );
});

const VoiceArea = React.memo(function VoiceArea({
  channel,
  voiceChannelData,
  remoteStreams,
  localStream,
  remoteScreenStreams,
  screenStream,
  isMuted,
  isDeafened,
  isSharingScreen,
  isWatchingScreen,
  isScreenAudioMuted,
  activeSpeakers,
  audioLevels,
  screenSharerSocketId,
  remoteUserStates,
  userVolumes,
  localMutedUsers,
  onToggleMute,
  onToggleDeafen,
  onStartScreenShare,
  onStopScreenShare,
  onWatchScreen,
  onUnwatchScreen,
  onToggleScreenAudioMute,
  onSetUserVolume,
  onToggleUserMute,
  onLeave,
  onReconnect,
  currentUser,
  onlineUsers,
  socket,
  serverId,
  soundboard,
  soundboardPlayed,
  onOpenSettings,
  voiceStatus,
  voiceQuality,
  voiceStatusMessage,
  pttActive,
  isPttMode,
  onPttActivate,
  onPttDeactivate
}) {
  console.log('[VoiceArea] RENDER - channel:', channel?.name, 'users:', voiceChannelData?.users?.length);

  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [showFullscreenControls, setShowFullscreenControls] = React.useState(true);
  const [fullscreenSoundboardOpen, setFullscreenSoundboardOpen] = useState(false);
  const [soundboardOpen, setSoundboardOpen] = useState(false);
  const [soundboardPage, setSoundboardPage] = useState('all');
  const [soundboardPlayQueued, setSoundboardPlayQueued] = useState(null);
  const [targetPickerSoundId, setTargetPickerSoundId] = useState(null);
  const [selectedTargetUsers, setSelectedTargetUsers] = useState([]);
  const [soundboardVolume, setSoundboardVolume] = useState(() => parseInt(localStorage.getItem('nexus_soundboard_volume') || '100'));
  const [soundboardSpeaking, setSoundboardSpeaking] = useState(new Set());
  const [soundboardMutedUsers, setSoundboardMutedUsers] = useState(() => {
    try { return JSON.parse(localStorage.getItem('nexus_soundboard_muted_users') || '{}'); }
    catch { return {}; }
  });
  const [contextMenu, setContextMenu] = useState(null);
  const fullscreenContainerRef = useRef(null);
  const hideControlsTimeoutRef = useRef(null);
  const soundboardPopupRef = useRef(null);
  const soundboardAudioCacheRef = useRef({});
  const soundboardAudioCtxRef = useRef(null);
  const soundboardActiveSourcesRef = useRef({}); // soundId -> { source, gain }
  const isDeafenedRef = useRef(isDeafened);
  isDeafenedRef.current = isDeafened;
  const audioBaselinesRef = useRef({}); // socketId -> { peak, lastUpdate }

  // Normalize audio level relative to each user's recent peak
  const getNormalizedLevel = useCallback((socketId, rawLevel) => {
    if (!rawLevel || rawLevel <= 0) return 0;
    const now = Date.now();
    const entry = audioBaselinesRef.current[socketId];
    if (!entry) {
      audioBaselinesRef.current[socketId] = { peak: rawLevel, lastUpdate: now };
      return 0.5; // First sample — show mid-range
    }
    // Update peak: instant rise, slow decay (~3s half-life at 100ms updates)
    if (rawLevel >= entry.peak) {
      entry.peak = rawLevel;
    } else {
      const elapsed = now - entry.lastUpdate;
      entry.peak = entry.peak * Math.pow(0.98, elapsed / 100);
      // Floor so peak doesn't decay below a small minimum
      if (entry.peak < 0.02) entry.peak = 0.02;
    }
    entry.lastUpdate = now;
    // Normalize: raw / peak, clamped to [0, 1]
    return Math.min(1, rawLevel / entry.peak);
  }, []);

  const toggleSoundboardMute = useCallback((userId) => {
    setSoundboardMutedUsers(prev => {
      const next = { ...prev };
      if (next[userId]) delete next[userId];
      else next[userId] = true;
      localStorage.setItem('nexus_soundboard_muted_users', JSON.stringify(next));
      return next;
    });
  }, []);

  const handleTileContextMenu = useCallback((e, userId, username) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, userId, username });
  }, []);

  // Close context menu on click-outside or Escape
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => setContextMenu(null);
    const handleKey = (e) => { if (e.key === 'Escape') setContextMenu(null); };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('mousedown', handleClick); document.removeEventListener('keydown', handleKey); };
  }, [contextMenu]);

  const users = voiceChannelData?.users || [];
  // Only consider screen share active if the sharer is still in the voice channel or is us
  const sharerInChannel = screenSharerSocketId && (
    isSharingScreen ||
    users.some(u => u.socketId === screenSharerSocketId) ||
    Object.keys(remoteStreams).includes(screenSharerSocketId)
  );
  const hasScreen = !!screenSharerSocketId && !!sharerInChannel;
  const isLocalSharer = isSharingScreen;

  // Screen share stream: local sharer sees their own stream, viewers see the remote screen stream
  const screenShareStream = isLocalSharer
    ? screenStream
    : (isWatchingScreen && screenSharerSocketId && remoteScreenStreams?.[screenSharerSocketId])
      ? remoteScreenStreams[screenSharerSocketId]
      : null;

  // Whether to show the screen share video area
  const showScreenVideo = hasScreen && (isLocalSharer || (isWatchingScreen && screenShareStream));

  const getUser = (socketId) => {
    return onlineUsers.find(u => u.socketId === socketId);
  };

  const screenSharerUser = screenSharerSocketId ? getUser(screenSharerSocketId) : null;

  const enterFullscreen = () => {
    const elem = fullscreenContainerRef.current;
    if (!elem) return;

    if (elem.requestFullscreen) {
      elem.requestFullscreen();
    } else if (elem.webkitRequestFullscreen) {
      elem.webkitRequestFullscreen();
    } else if (elem.mozRequestFullScreen) {
      elem.mozRequestFullScreen();
    } else if (elem.msRequestFullscreen) {
      elem.msRequestFullscreen();
    }
    setIsFullscreen(true);
  };

  const exitFullscreen = () => {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }
    setIsFullscreen(false);
  };

  const handleMouseMove = () => {
    if (!isFullscreen) return;
    setShowFullscreenControls(true);
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
    }
    hideControlsTimeoutRef.current = setTimeout(() => {
      setShowFullscreenControls(false);
    }, 3000);
  };

  // Handle fullscreen change events (e.g., Escape key)
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && !document.webkitFullscreenElement &&
          !document.mozFullScreenElement && !document.msFullscreenElement) {
        setIsFullscreen(false);
        setShowFullscreenControls(true);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('msfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('msfullscreenchange', handleFullscreenChange);
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isFullscreen) {
      handleMouseMove(); // Start the auto-hide timer
    }
  }, [isFullscreen]);

  // Close soundboard popup on click outside or Escape
  useEffect(() => {
    if (!soundboardOpen) return;
    const handleClickOutside = (e) => {
      if (soundboardPopupRef.current && !soundboardPopupRef.current.contains(e.target)) {
        setSoundboardOpen(false);
      }
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') setSoundboardOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [soundboardOpen]);

  // Fetch audio data for soundboard when popup opens
  useEffect(() => {
    if (!soundboardOpen || !socket || !serverId) return;

    // Check if we already have audio cached for all sounds
    const sounds = soundboard || [];
    const uncached = sounds.filter(s => !soundboardAudioCacheRef.current[s.id]);
    if (uncached.length === 0) return;

    socket.emit('soundboard:get-sounds', { serverId }, (response) => {
      if (response?.sounds) {
        response.sounds.forEach(s => {
          if (s.trimmed_audio) {
            soundboardAudioCacheRef.current[s.id] = { audio: s.trimmed_audio, volume: s.volume || 1.0 };
          }
        });
      }
    });
  }, [soundboardOpen, socket, serverId, soundboard]);

  // Stop a specific soundboard source by soundId
  const stopSoundboardSource = useCallback((soundId) => {
    const active = soundboardActiveSourcesRef.current[soundId];
    if (active) {
      try { active.source.stop(); } catch {}
      try { active.gain.disconnect(); } catch {}
      delete soundboardActiveSourcesRef.current[soundId];
    }
  }, []);

  // Stop ALL active soundboard sources (used on leave)
  const stopAllSoundboardSources = useCallback(() => {
    for (const soundId of Object.keys(soundboardActiveSourcesRef.current)) {
      stopSoundboardSource(soundId);
    }
  }, [stopSoundboardSource]);

  // Helper: play a soundboard clip (shared by both effects)
  const playSoundboardClip = useCallback(async (soundId, audioData, clipVolume) => {
    try {
      if (!soundboardAudioCtxRef.current || soundboardAudioCtxRef.current.state === 'closed') {
        soundboardAudioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = soundboardAudioCtxRef.current;
      if (ctx.state === 'suspended') await ctx.resume();

      const outputDevice = localStorage.getItem('nexus_audio_output');
      if (outputDevice && outputDevice !== 'default' && ctx.setSinkId) {
        try { await ctx.setSinkId(outputDevice); } catch {}
      }

      const arrayBuffer = audioData.startsWith('data:') ? dataUriToArrayBuffer(audioData) : await (await fetch(audioData)).arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

      // Stop previous instance of same sound (restart behavior)
      stopSoundboardSource(soundId);

      const outputVol = parseInt(localStorage.getItem('nexus_audio_output_volume') || '100') / 100;
      const sbVol = parseInt(localStorage.getItem('nexus_soundboard_volume') || '100') / 100;
      const gainNode = ctx.createGain();
      gainNode.gain.value = outputVol * clipVolume * sbVol;
      gainNode.connect(ctx.destination);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(gainNode);
      source.onended = () => { delete soundboardActiveSourcesRef.current[soundId]; };
      source.start(0);

      // Track active source
      soundboardActiveSourcesRef.current[soundId] = { source, gain: gainNode };
      return audioBuffer.duration;
    } catch (err) {
      console.error('[Soundboard] Playback error:', err);
      return 0;
    }
  }, [stopSoundboardSource]);

  // Handle soundboard:played events — play audio locally
  // Uses isDeafenedRef so changing deafen state doesn't replay old clips
  useEffect(() => {
    if (!soundboardPlayed) return;
    // Ignore stale sounds (e.g. from a previous call session)
    if (Date.now() - (soundboardPlayed._ts || 0) > 5000) return;
    if (isDeafenedRef.current) return; // Discard entirely when deafened
    if (soundboardPlayed.userId && soundboardMutedUsers[soundboardPlayed.userId]) return;

    const { soundId } = soundboardPlayed;
    const cached = soundboardAudioCacheRef.current[soundId];
    if (!cached) {
      // Try to fetch on demand for targeted sounds
      if (soundboardPlayed.targeted && socket) {
        socket.emit('soundboard:get-sound', { soundId }, (response) => {
          if (response?.sound?.trimmed_audio) {
            soundboardAudioCacheRef.current[soundId] = { audio: response.sound.trimmed_audio, volume: response.sound.volume || 1.0 };
            // Re-trigger by updating state
            setSoundboardPlayQueued({ ...soundboardPlayed });
          }
        });
      }
      return;
    }
    const audioData = cached.audio || cached;
    const clipVolume = cached.volume || 1.0;
    (async () => {
      const duration = await playSoundboardClip(soundId, audioData, clipVolume);

      // Show speaking indicator for the user who triggered the clip
      const triggerUserId = soundboardPlayed.userId;
      if (triggerUserId) {
        const triggerSocketId = currentUser?.id === triggerUserId
          ? 'local'
          : users.find(u => u.id === triggerUserId)?.socketId;
        if (triggerSocketId) {
          setSoundboardSpeaking(prev => new Set(prev).add(triggerSocketId));
          const timeout = Math.max(1000, (duration || 3) * 1000);
          setTimeout(() => {
            setSoundboardSpeaking(prev => {
              const next = new Set(prev);
              next.delete(triggerSocketId);
              return next;
            });
          }, timeout);
        }
      }
    })();
  }, [soundboardPlayed, socket, playSoundboardClip, currentUser, users]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle queued playback (after on-demand fetch)
  useEffect(() => {
    if (!soundboardPlayQueued) return;
    if (isDeafenedRef.current) { setSoundboardPlayQueued(null); return; } // Discard when deafened
    if (soundboardPlayQueued.userId && soundboardMutedUsers[soundboardPlayQueued.userId]) { setSoundboardPlayQueued(null); return; }
    const cached = soundboardAudioCacheRef.current[soundboardPlayQueued.soundId];
    if (!cached) return;
    const audioData = cached.audio || cached;
    const clipVolume = cached.volume || 1.0;
    playSoundboardClip(soundboardPlayQueued.soundId, audioData, clipVolume);
    setSoundboardPlayQueued(null);
  }, [soundboardPlayQueued, playSoundboardClip]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSoundboardPlay = useCallback((soundId) => {
    if (!socket || !channel) return;
    const sound = (soundboard || []).find(s => s.id === soundId);
    if (sound?.is_global) {
      socket.emit('soundboard:play-targeted', { soundId, targetUserIds: [], serverId });
    } else {
      socket.emit('soundboard:play', { channelId: channel.id, soundId });
    }
  }, [socket, channel, soundboard, serverId]);

  return (
    <div className="voice-area">
      {/* Header */}
      <div className="voice-header">
        <div className="voice-header-left">
          <VolumeIcon size={18} color="var(--text-muted)" />
          <span className="voice-channel-name">{channel?.name}</span>
          <span className="voice-user-count">{users.length} connected</span>
          {voiceStatus && voiceStatus !== 'disconnected' && (
            <span className={`voice-quality-dot ${
              voiceStatus === 'connected' && (!voiceQuality || voiceQuality.packetLoss < 5) ? 'good' :
              voiceStatus === 'degraded' || (voiceQuality && (voiceQuality.packetLoss >= 5 || voiceQuality.rtt > 200)) ? 'poor' :
              voiceStatus === 'connecting' || voiceStatus === 'reconnecting' ? 'connecting' :
              'good'
            }`} title={
              voiceQuality ? `RTT: ${voiceQuality.rtt}ms | Loss: ${voiceQuality.packetLoss.toFixed(1)}% | Jitter: ${voiceQuality.jitter}ms` :
              voiceStatus === 'connecting' ? 'Connecting...' :
              voiceStatus === 'reconnecting' ? 'Reconnecting...' :
              'Connected'
            } />
          )}
        </div>
        {onReconnect && (
          <button className="voice-header-reconnect" onClick={onReconnect} title="Reconnect audio">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
            </svg>
            <span>Reconnect</span>
          </button>
        )}
      </div>

      {/* Voice status banner */}
      {voiceStatusMessage && (
        <div className={`voice-status-banner ${
          voiceStatus === 'degraded' ? 'warning' :
          voiceStatus === 'connecting' || voiceStatus === 'reconnecting' ? 'info' :
          ''
        }`}>
          <span className="voice-status-text">{voiceStatusMessage}</span>
        </div>
      )}

      {/* Main content */}
      <div className="voice-content">
        {/* Screen share notification banner (shown when someone is sharing and viewer hasn't opted in) */}
        {hasScreen && !isLocalSharer && !isWatchingScreen && (
          <div className="screen-share-banner">
            <div className="screen-share-banner-info">
              <ScreenShareIcon size={18} />
              <span>{screenSharerUser?.username || 'Someone'} is sharing their screen</span>
            </div>
            <button className="screen-share-watch-btn" onClick={() => onWatchScreen(screenSharerSocketId)}>
              Watch Stream
            </button>
          </div>
        )}

        {/* Loading state: watching but stream hasn't arrived yet */}
        {hasScreen && !isLocalSharer && isWatchingScreen && !screenShareStream && (
          <div className="screen-share-banner">
            <div className="screen-share-banner-info">
              <ScreenShareIcon size={18} />
              <span>Connecting to {screenSharerUser?.username || 'Someone'}'s stream...</span>
            </div>
            <button className="screen-share-stop-btn" onClick={() => onUnwatchScreen(screenSharerSocketId)}>
              Stop Watching
            </button>
          </div>
        )}

        {/* Screen share display (shown for sharer or opted-in viewers) */}
        {showScreenVideo && screenShareStream && (
          <div
            ref={fullscreenContainerRef}
            className={`screen-share-area ${isFullscreen ? 'fullscreen-active' : ''}`}
            onMouseMove={handleMouseMove}
          >
            <VideoPlayer
              stream={screenShareStream}
              label={isLocalSharer ? `${currentUser?.username} (You)` : screenSharerUser?.username || 'Screen Share'}
              isScreen
              onFullscreen={enterFullscreen}
              audioMuted={isLocalSharer || isScreenAudioMuted}
            />
            {/* Screen share overlay controls (shown on hover) */}
            {!isFullscreen && (
              <div className="screen-share-overlay-controls">
                {/* Audio mute toggle for screen share (only for viewers) */}
                {!isLocalSharer && isWatchingScreen && (
                  <button
                    className={`screen-audio-mute-btn ${isScreenAudioMuted ? 'muted' : ''}`}
                    onClick={onToggleScreenAudioMute}
                    title={isScreenAudioMuted ? 'Unmute stream audio' : 'Mute stream audio'}
                  >
                    <VolumeIcon size={16} muted={isScreenAudioMuted} />
                  </button>
                )}
                {/* Stop watching button for viewers */}
                {!isLocalSharer && isWatchingScreen && (
                  <button
                    className="screen-share-stop-watching-btn"
                    onClick={() => onUnwatchScreen(screenSharerSocketId)}
                  >
                    Stop Watching
                  </button>
                )}
              </div>
            )}
            {isFullscreen && (
              <div className={`fullscreen-overlay ${showFullscreenControls ? 'visible' : ''}`}>
                <div className="fullscreen-header">
                  <span className="fullscreen-title">
                    {isLocalSharer ? `${currentUser?.username} (You)` : screenSharerUser?.username || 'Screen Share'}
                  </span>
                  <div className="fullscreen-header-actions">
                    {!isLocalSharer && isWatchingScreen && (
                      <button
                        className={`fullscreen-exit-btn ${isScreenAudioMuted ? 'muted' : ''}`}
                        onClick={onToggleScreenAudioMute}
                        title={isScreenAudioMuted ? 'Unmute stream audio' : 'Mute stream audio'}
                      >
                        <VolumeIcon size={18} muted={isScreenAudioMuted} />
                      </button>
                    )}
                    {!isLocalSharer && isWatchingScreen && (
                      <button className="fullscreen-exit-btn" onClick={() => { exitFullscreen(); onUnwatchScreen(screenSharerSocketId); }} title="Stop watching">
                        Stop Watching
                      </button>
                    )}
                    <button className="fullscreen-exit-btn" onClick={exitFullscreen} title="Exit fullscreen (Esc)">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
                      </svg>
                    </button>
                  </div>
                </div>
                {/* Bottom call controls */}
                <div className="fullscreen-bottom-controls">
                  <button
                    className={`fullscreen-ctrl-btn ${isPttMode ? (pttActive ? 'ptt-active' : 'danger') : isMuted ? 'danger' : ''}`}
                    onClick={isPttMode ? undefined : onToggleMute}
                    onMouseDown={isPttMode && onPttActivate ? (e) => { e.preventDefault(); onPttActivate(); } : undefined}
                    onMouseUp={isPttMode && onPttDeactivate ? () => onPttDeactivate() : undefined}
                    onMouseLeave={isPttMode && pttActive && onPttDeactivate ? () => onPttDeactivate() : undefined}
                    onTouchStart={isPttMode && onPttActivate ? (e) => { e.preventDefault(); onPttActivate(); } : undefined}
                    onTouchEnd={isPttMode && onPttDeactivate ? () => onPttDeactivate() : undefined}
                    title={isPttMode ? (pttActive ? 'Talking (PTT)' : 'PTT — Hold to talk') : (isMuted ? 'Unmute' : 'Mute')}
                  >
                    <MicrophoneIcon size={20} muted={isPttMode ? !pttActive : isMuted} />
                    <span>{isPttMode ? (pttActive ? 'Talking' : 'PTT') : (isMuted ? 'Unmute' : 'Mute')}</span>
                  </button>
                  <button
                    className={`fullscreen-ctrl-btn ${isDeafened ? 'danger' : ''}`}
                    onClick={onToggleDeafen}
                    title={isDeafened ? 'Undeafen' : 'Deafen'}
                  >
                    <HeadphoneIcon size={20} deafened={isDeafened} />
                    <span>{isDeafened ? 'Undeafen' : 'Deafen'}</span>
                  </button>
                  {soundboard && soundboard.length > 0 && (
                    <div className="fullscreen-soundboard-wrapper">
                      <button
                        className={`fullscreen-ctrl-btn ${fullscreenSoundboardOpen ? 'active' : ''}`}
                        onClick={() => setFullscreenSoundboardOpen(!fullscreenSoundboardOpen)}
                        title="Soundboard"
                      >
                        <span style={{fontSize: 18}}>🔊</span>
                        <span>Sounds</span>
                      </button>
                      {fullscreenSoundboardOpen && (() => {
                        const CLASSIC_NAMES = new Set(['Airhorn','Crickets','Sad Violin','Womp Womp','Rimshot','Sad Trombone','DUN DUN DUN','Vine Boom']);
                        const MEME_NAMES = new Set(['Bruh','Oh No','Sheesh','Bonk','Noice','Sus','Wilhelm','Toot']);
                        const classicSounds = soundboard.filter(s => CLASSIC_NAMES.has(s.name));
                        const memeSounds = soundboard.filter(s => MEME_NAMES.has(s.name));
                        const customSounds = soundboard.filter(s => !CLASSIC_NAMES.has(s.name) && !MEME_NAMES.has(s.name));
                        const pages = [
                          { id: 'all', label: 'All', sounds: soundboard },
                          ...(customSounds.length > 0 ? [{ id: 'custom', label: 'Custom', sounds: customSounds }] : []),
                          ...(memeSounds.length > 0 ? [{ id: 'meme', label: 'Meme', sounds: memeSounds }] : []),
                          ...(classicSounds.length > 0 ? [{ id: 'classic', label: 'Classic', sounds: classicSounds }] : []),
                        ];
                        const activePage = pages.find(p => p.id === soundboardPage) || pages[0];
                        return (
                        <div className="fullscreen-soundboard-popup">
                          <div className="soundboard-popup-header">Soundboard</div>
                          {pages.length > 1 && (
                            <div className="soundboard-pages-nav">
                              {pages.map(p => (
                                <button key={p.id} className={`soundboard-page-tab ${soundboardPage === p.id ? 'active' : ''}`}
                                  onClick={() => setSoundboardPage(p.id)}>
                                  {p.label}
                                </button>
                              ))}
                            </div>
                          )}
                          <div className="soundboard-grid">
                            {activePage.sounds.map(sound => (
                              <button
                                key={sound.id}
                                className="soundboard-play-btn"
                                onClick={() => handleSoundboardPlay(sound.id)}
                                title={sound.name}
                              >
                                <span className="soundboard-play-emoji">{sound.emoji || '🔊'}</span>
                                <span className="soundboard-play-name">{sound.name}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                        );})()}
                    </div>
                  )}
                  <button
                    className="fullscreen-ctrl-btn leave"
                    onClick={() => { exitFullscreen(); stopAllSoundboardSources(); onLeave(); }}
                    title="Leave voice"
                  >
                    <PhoneIcon size={20} />
                    <span>Leave</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* User tiles */}
        <div className={`voice-users-grid ${showScreenVideo ? 'with-screen' : ''} ${!showScreenVideo && users.length <= 2 ? `users-${users.length}` : ''}`}>
          {/* Local user */}
          <UserTile
            user={currentUser}
            isSpeaking={activeSpeakers.has('local') || soundboardSpeaking.has('local')}
            audioLevel={soundboardSpeaking.has('local') ? 0.5 : getNormalizedLevel('local', audioLevels?.['local'] || 0)}
            isMuted={isMuted}
            isDeafened={isDeafened}
            onContextMenu={(e) => handleTileContextMenu(e, currentUser.id, currentUser.username)}
          />

          {/* Remote users */}
          {users
            .filter(u => u.socketId !== currentUser?.socketId)
            .map(u => {
              const state = remoteUserStates[u.socketId] || {};
              return (
                <UserTile
                  key={u.socketId}
                  user={u}
                  isSpeaking={activeSpeakers.has(u.socketId) || soundboardSpeaking.has(u.socketId)}
                  audioLevel={soundboardSpeaking.has(u.socketId) ? 0.5 : getNormalizedLevel(u.socketId, audioLevels?.[u.socketId] || 0)}
                  isMuted={state.isMuted}
                  isDeafened={state.isDeafened}
                  userVolume={userVolumes[u.socketId] ?? 100}
                  isLocallyMuted={localMutedUsers[u.socketId] ?? false}
                  onSetVolume={(vol) => onSetUserVolume(u.socketId, vol)}
                  onToggleMute={() => onToggleUserMute(u.socketId)}
                  onContextMenu={(e) => handleTileContextMenu(e, u.id, u.username)}
                />
              );
            })
          }
        </div>
      </div>

      {/* Controls */}
      <div className="voice-controls">
        <button
          className={`voice-ctrl-btn ${isPttMode ? (pttActive ? 'ptt-active' : 'danger') : isMuted ? 'danger' : ''}`}
          onClick={isPttMode ? undefined : onToggleMute}
          onMouseDown={isPttMode && onPttActivate ? (e) => { e.preventDefault(); onPttActivate(); } : undefined}
          onMouseUp={isPttMode && onPttDeactivate ? () => onPttDeactivate() : undefined}
          onMouseLeave={isPttMode && pttActive && onPttDeactivate ? () => onPttDeactivate() : undefined}
          onTouchStart={isPttMode && onPttActivate ? (e) => { e.preventDefault(); onPttActivate(); } : undefined}
          onTouchEnd={isPttMode && onPttDeactivate ? () => onPttDeactivate() : undefined}
          title={isPttMode ? (pttActive ? 'Talking (PTT)' : 'PTT — Hold to talk') : (isMuted ? 'Unmute' : 'Mute')}
        >
          <span className="voice-ctrl-icon">
            <MicrophoneIcon size={20} muted={isPttMode ? !pttActive : isMuted} />
          </span>
          <span>{isPttMode ? (pttActive ? 'Talking' : 'PTT') : (isMuted ? 'Unmute' : 'Mute')}</span>
        </button>

        <button
          className={`voice-ctrl-btn ${isDeafened ? 'danger' : ''}`}
          onClick={onToggleDeafen}
          title={isDeafened ? 'Undeafen' : 'Deafen'}
        >
          <span className="voice-ctrl-icon">
            <HeadphoneIcon size={20} deafened={isDeafened} />
          </span>
          <span>{isDeafened ? 'Undeafen' : 'Deafen'}</span>
        </button>

        {/* Soundboard */}
        {soundboard && soundboard.length > 0 && (
          <div className="soundboard-ctrl-wrapper" ref={soundboardPopupRef}>
            <button
              className={`voice-ctrl-btn ${soundboardOpen ? 'active' : ''}`}
              onClick={() => setSoundboardOpen(!soundboardOpen)}
              title="Soundboard"
            >
              <span className="voice-ctrl-icon" style={{fontSize: 18}}>🔊</span>
              <span>Sounds</span>
            </button>

            {soundboardOpen && (() => {
              const CLASSIC_NAMES = new Set(['Airhorn','Crickets','Sad Violin','Womp Womp','Rimshot','Sad Trombone','DUN DUN DUN','Vine Boom']);
              const MEME_NAMES = new Set(['Bruh','Oh No','Sheesh','Bonk','Noice','Sus','Wilhelm','Toot']);
              const classicSounds = soundboard.filter(s => CLASSIC_NAMES.has(s.name));
              const memeSounds = soundboard.filter(s => MEME_NAMES.has(s.name));
              const customSounds = soundboard.filter(s => !CLASSIC_NAMES.has(s.name) && !MEME_NAMES.has(s.name));
              const pages = [
                { id: 'all', label: 'All', sounds: soundboard },
                ...(customSounds.length > 0 ? [{ id: 'custom', label: 'Custom', sounds: customSounds }] : []),
                ...(memeSounds.length > 0 ? [{ id: 'meme', label: 'Meme', sounds: memeSounds }] : []),
                ...(classicSounds.length > 0 ? [{ id: 'classic', label: 'Classic', sounds: classicSounds }] : []),
              ];
              const activePage = pages.find(p => p.id === soundboardPage) || pages[0];
              return (
              <div className="soundboard-popup">
                <div className="soundboard-popup-header">
                  <span>Soundboard</span>
                  <div className="soundboard-vol-row">
                    <VolumeIcon size={14} />
                    <input
                      type="range"
                      className="soundboard-vol-slider"
                      min="0"
                      max="100"
                      value={soundboardVolume}
                      onChange={(e) => {
                        const v = parseInt(e.target.value);
                        setSoundboardVolume(v);
                        localStorage.setItem('nexus_soundboard_volume', String(v));
                      }}
                      title={`Soundboard volume: ${soundboardVolume}%`}
                    />
                    <span className="soundboard-vol-label">{soundboardVolume}</span>
                  </div>
                </div>
                {pages.length > 1 && (
                  <div className="soundboard-pages-nav">
                    {pages.map(p => (
                      <button key={p.id} className={`soundboard-page-tab ${soundboardPage === p.id ? 'active' : ''}`}
                        onClick={() => setSoundboardPage(p.id)}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                )}
                <div className="soundboard-grid">
                  {activePage.sounds.map(sound => (
                    <button
                      key={sound.id}
                      className="soundboard-play-btn"
                      onClick={() => handleSoundboardPlay(sound.id)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setTargetPickerSoundId(sound.id);
                        setSelectedTargetUsers([]);
                      }}
                      title={`${sound.name}${sound.is_global ? ' (Global)' : ''}\nRight-click to target users`}
                    >
                      <span className="soundboard-play-emoji">{sound.emoji || '🔊'}</span>
                      <span className="soundboard-play-name">{sound.name}</span>
                      {sound.is_global && <span className="global-badge">G</span>}
                    </button>
                  ))}
                </div>

                {targetPickerSoundId && (
                  <div className="soundboard-target-picker">
                    <div className="target-picker-header">Send to specific users</div>
                    <div className="target-picker-list">
                      {onlineUsers.filter(u => u.id !== currentUser?.id).map(u => (
                        <label key={u.id} className="target-picker-user">
                          <input
                            type="checkbox"
                            checked={selectedTargetUsers.includes(u.id)}
                            onChange={(e) => {
                              setSelectedTargetUsers(prev =>
                                e.target.checked ? [...prev, u.id] : prev.filter(id => id !== u.id)
                              );
                            }}
                          />
                          <span style={{color: u.color}}>{u.username}</span>
                        </label>
                      ))}
                    </div>
                    <div className="target-picker-actions">
                      <button className="settings-btn primary" style={{padding:'4px 12px',fontSize:12}} onClick={() => {
                        socket.emit('soundboard:play-targeted', {
                          soundId: targetPickerSoundId,
                          targetUserIds: selectedTargetUsers,
                          serverId
                        });
                        setTargetPickerSoundId(null);
                      }} disabled={selectedTargetUsers.length === 0}>
                        Play
                      </button>
                      <button className="settings-btn" style={{padding:'4px 12px',fontSize:12}} onClick={() => setTargetPickerSoundId(null)}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            );})()}
          </div>
        )}

        {!isCapacitorApp() && (isSharingScreen ? (
          <button className="voice-ctrl-btn danger screen-share-btn" onClick={onStopScreenShare} title="Stop sharing">
            <span className="voice-ctrl-icon">
              <ScreenShareIcon size={20} />
            </span>
            <span>Stop Share</span>
          </button>
        ) : (
          <button className="voice-ctrl-btn screen-share-btn" onClick={onStartScreenShare} title="Share screen">
            <span className="voice-ctrl-icon">
              <ScreenShareIcon size={20} />
            </span>
            <span>Share Screen</span>
          </button>
        ))}

        {onOpenSettings && (
          <button className="voice-ctrl-btn audio-settings-btn" onClick={() => onOpenSettings('audio')} title="Audio Settings">
            <span className="voice-ctrl-icon">
              <SettingsIcon size={20} />
            </span>
            <span>Audio</span>
          </button>
        )}

        {voiceQuality && voiceStatus === 'connected' && (
          <div className="voice-quality-stats" title={`RTT: ${voiceQuality.rtt}ms | Packet Loss: ${voiceQuality.packetLoss.toFixed(1)}% | Jitter: ${voiceQuality.jitter}ms`}>
            <span className={`quality-bar ${voiceQuality.packetLoss < 2 && voiceQuality.rtt < 100 ? 'good' : voiceQuality.packetLoss < 5 && voiceQuality.rtt < 200 ? 'fair' : 'poor'}`}>
              {voiceQuality.rtt}ms
            </span>
          </div>
        )}

        <button className="voice-ctrl-btn leave" onClick={() => { stopAllSoundboardSources(); onLeave(); }} title="Leave voice">
          <span className="voice-ctrl-icon">
            <PhoneIcon size={20} />
          </span>
          <span>Leave</span>
        </button>
      </div>

      {/* Soundboard mute context menu */}
      {contextMenu && (
        <div
          className="voice-tile-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            className="voice-tile-context-item"
            onClick={() => { toggleSoundboardMute(contextMenu.userId); setContextMenu(null); }}
          >
            {soundboardMutedUsers[contextMenu.userId] ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
              </svg>
            )}
            {soundboardMutedUsers[contextMenu.userId] ? 'Unmute Sound Clips' : 'Mute Sound Clips'}
          </button>
        </div>
      )}
    </div>
  );
});

export { AudioPlayer };
export default VoiceArea;
