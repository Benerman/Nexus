import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { isTauriApp, isElectronApp, isCapacitorApp, getPlatform } from '../config';

const DEFAULT_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

// Voice connection quality states
const VOICE_STATUS = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  DEGRADED: 'degraded',
  RECONNECTING: 'reconnecting'
};

// Convert a data URI to ArrayBuffer without fetch (avoids CSP connect-src issues)
function dataUriToArrayBuffer(dataUri) {
  const base64 = dataUri.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// Play voice join/leave cue — custom sound (base64 data URL) or default synthesized beep
async function playVoiceCue(type, customSound, customSoundVolume = 100) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Route to selected output device
    const deviceId = localStorage.getItem('nexus_audio_output');
    if (deviceId && deviceId !== 'default' && ctx.setSinkId) {
      await ctx.setSinkId(deviceId);
    }
    const outputVol = parseInt(localStorage.getItem('nexus_audio_output_volume') || '100') / 100;

    if (customSound) {
      // Play custom intro/exit sound
      const arrayBuffer = customSound.startsWith('data:') ? dataUriToArrayBuffer(customSound) : await (await fetch(customSound)).arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      const gain = ctx.createGain();
      gain.gain.value = outputVol * (customSoundVolume / 100);
      gain.connect(ctx.destination);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(gain);
      source.start(0);
      source.onended = () => ctx.close();
      return;
    }

    // Default synthesized beep
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.15 * outputVol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    if (type === 'join') {
      // Two rising tones
      osc.frequency.setValueAtTime(600, ctx.currentTime);
      osc.frequency.setValueAtTime(900, ctx.currentTime + 0.12);
    } else {
      // Two falling tones
      osc.frequency.setValueAtTime(900, ctx.currentTime);
      osc.frequency.setValueAtTime(600, ctx.currentTime + 0.12);
    }
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
    osc.onended = () => ctx.close();
  } catch (err) {
    console.warn('[VoiceCue] Failed to play:', err.message);
  }
}

// Map media errors to platform-aware, user-friendly messages
function getMediaErrorInfo(err, mediaType) {
  const platform = getPlatform();
  const isDesktop = isTauriApp() || isElectronApp();
  const deviceLabel = mediaType === 'screen' ? 'screen capture' : mediaType;

  switch (err.name) {
    case 'NotAllowedError':
      if (mediaType === 'screen') {
        if (platform === 'linux') {
          return { title: 'Screen sharing blocked', message: 'Your system denied screen capture access. On Wayland, ensure your compositor supports the ScreenCast portal.', canRetry: false };
        }
        if (platform === 'win32') {
          return { title: 'Screen sharing blocked', message: 'Windows may be blocking screen capture. Check Settings \u2192 Privacy & security \u2192 Screen recording.', canRetry: false };
        }
        return { title: 'Screen sharing blocked', message: 'Screen capture access was denied.', canRetry: false };
      }
      // Microphone / camera
      if (isDesktop && platform === 'linux') {
        return { title: `${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)} access blocked`, message: 'Your OS denied access. Check system Settings \u2192 Privacy \u2192 Microphone.', canRetry: true };
      }
      if (isDesktop && platform === 'win32') {
        return { title: `${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)} access blocked`, message: 'Windows Privacy Settings may be blocking access. Open Settings \u2192 Privacy & security \u2192 Microphone and ensure access is allowed.', canRetry: true };
      }
      if (isCapacitorApp()) {
        return { title: `${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)} access blocked`, message: 'Permission was denied. Open Android Settings \u2192 Apps \u2192 Nexus \u2192 Permissions and enable access.', canRetry: true };
      }
      return { title: `${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)} access denied`, message: 'Click the lock icon in your address bar and allow microphone access, then retry.', canRetry: true };

    case 'NotFoundError':
      return { title: `No ${deviceLabel} found`, message: `No ${deviceLabel} was detected. Check that a device is connected.`, canRetry: true };

    case 'NotReadableError':
      return { title: `${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)} unavailable`, message: `Your ${deviceLabel} may be in use by another application. Close other apps using it and retry.`, canRetry: true };

    case 'OverconstrainedError':
      return { title: 'Device settings error', message: "The selected audio device doesn't support current settings. Try a different device in Audio Settings.", canRetry: true };

    default:
      return { title: 'Media error', message: err.message || `Could not access ${deviceLabel}.`, canRetry: true };
  }
}

export function useWebRTC(socket, currentUser, activeServerId) {
  const [localStream, setLocalStream] = useState(null);
  const [screenStream, setScreenStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [isMuted, setIsMuted] = useState(() => {
    // Load saved mute state from localStorage
    const saved = localStorage.getItem('nexus_voice_muted');
    return saved === 'true';
  });
  const [isDeafened, setIsDeafened] = useState(() => {
    // Load saved deafen state from localStorage
    const saved = localStorage.getItem('nexus_voice_deafened');
    return saved === 'true';
  });
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [isWatchingScreen, setIsWatchingScreen] = useState(false);
  const [isScreenAudioMuted, setIsScreenAudioMuted] = useState(false);
  const [remoteScreenStreams, setRemoteScreenStreams] = useState({}); // socketId -> screen share MediaStream
  const [currentVoiceChannel, setCurrentVoiceChannel] = useState(null);
  const [activeSpeakers, setActiveSpeakers] = useState(new Set());
  const [voiceStatus, setVoiceStatus] = useState(VOICE_STATUS.DISCONNECTED);
  const [voiceQuality, setVoiceQuality] = useState(null); // { rtt, packetLoss, jitter } or null
  const [voiceStatusMessage, setVoiceStatusMessage] = useState(''); // User-facing status text
  const [mediaError, setMediaError] = useState(null); // { title, message, canRetry, mediaType, channelId?, serverId? }

  // Remote user states
  const [remoteUserStates, setRemoteUserStates] = useState({}); // socketId -> { isMuted, isDeafened }
  const [userVolumes, setUserVolumes] = useState(() => {
    const saved = localStorage.getItem('nexus_user_volumes');
    return saved ? JSON.parse(saved) : {};
  }); // socketId -> volume (0-150)
  const [localMutedUsers, setLocalMutedUsers] = useState(() => {
    const saved = localStorage.getItem('nexus_local_muted');
    return saved ? JSON.parse(saved) : {};
  }); // socketId -> boolean

  const peersRef = useRef({});
  const localStreamRef = useRef(null);
  const rawStreamRef = useRef(null); // Original mic stream (before processing)
  const screenStreamRef = useRef(null);
  const screenSendersRef = useRef({});  // peerSocketId -> [RTCRtpSender]
  const screenStreamIdsRef = useRef(new Set()); // track remote screen share stream IDs
  const audioContextRef = useRef(null);
  const analyserRef = useRef({});
  const preDeafenMuteStateRef = useRef(false);  // Track mute state before deafening
  const isDeafenedRef = useRef(isDeafened);      // Ref mirror for use in socket handlers
  const audioElementsRef = useRef({});  // socketId -> HTMLAudioElement
  const gainNodesRef = useRef({});      // socketId -> { ctx, gain, source } for volume boost >100%
  const audioProcessingRef = useRef(null); // { ctx, source, highpass, analyser, compressor, destination, workletNode?, usingWorklet, intervalId?, gateGain?, autoGain?, outputGain? }
  const qualityIntervalRef = useRef(null); // Interval for polling WebRTC stats
  const autoReconnectRef = useRef(null); // Timeout for auto-reconnect
  const reconnectAttemptsRef = useRef(0);
  const currentVoiceChannelRef = useRef(null); // Ref mirror for use in callbacks
  const iceServersRef = useRef(DEFAULT_ICE_SERVERS);
  const iceTimeoutsRef = useRef({}); // targetId -> timeout for ICE checking state

  const speakingIntervalsRef = useRef({}); // socketId -> intervalId
  const speakingSourcesRef = useRef({});  // socketId -> MediaStreamAudioSourceNode
  const activeSpeakersRef = useRef(new Set());

  const startSpeakingDetection = useCallback((stream, socketId) => {
    try {
      // Clean up existing detection for this socket
      if (speakingIntervalsRef.current[socketId]) {
        clearInterval(speakingIntervalsRef.current[socketId]);
      }
      if (speakingSourcesRef.current[socketId]) {
        try { speakingSourcesRef.current[socketId].disconnect(); } catch (_) {}
      }

      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      analyserRef.current[socketId] = analyser;
      speakingSourcesRef.current[socketId] = source;
      const data = new Uint8Array(analyser.frequencyBinCount);

      // Use setInterval at 10Hz instead of requestAnimationFrame at 60fps
      const intervalId = setInterval(() => {
        if (!analyserRef.current[socketId]) {
          clearInterval(intervalId);
          delete speakingIntervalsRef.current[socketId];
          return;
        }
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        const isSpeaking = avg > 15;
        const wasSpeaking = activeSpeakersRef.current.has(socketId);
        // Only update state if speaking status changed
        if (isSpeaking !== wasSpeaking) {
          if (isSpeaking) activeSpeakersRef.current.add(socketId);
          else activeSpeakersRef.current.delete(socketId);
          setActiveSpeakers(new Set(activeSpeakersRef.current));
        }
      }, 100);
      speakingIntervalsRef.current[socketId] = intervalId;
    } catch (err) {
      console.warn('Speaking detection unavailable:', err);
    }
  }, []);

  const createPeer = useCallback((targetId, isInitiator) => {
    if (peersRef.current[targetId]) {
      try { peersRef.current[targetId].close(); } catch (_) {}
    }
    const peer = new RTCPeerConnection({
      iceServers: iceServersRef.current,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    });
    peersRef.current[targetId] = peer;

    // Track whether this peer is making an offer (for glare detection)
    let makingOffer = false;
    peer._makingOffer = () => makingOffer;
    // Polite peers yield during glare; impolite peers keep their offer.
    // Non-initiators are polite (they wait for the initiator's offer).
    peer._isPolite = !isInitiator;
    // Queue ICE candidates that arrive before remote description is set
    peer._iceCandidateQueue = [];

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track =>
        peer.addTrack(track, localStreamRef.current));
    }

    peer.ontrack = (e) => {
      const [stream] = e.streams;
      if (e.track.kind === 'video') {
        // Video track = screen share (no webcam in this app)
        screenStreamIdsRef.current.add(stream.id);
        setRemoteScreenStreams(prev => ({ ...prev, [targetId]: stream }));
      } else if (e.track.kind === 'audio') {
        // Check if this audio belongs to a screen share stream (same MediaStream as video)
        if (screenStreamIdsRef.current.has(stream.id)) {
          // Screen share audio - update screen streams so video element can play it
          setRemoteScreenStreams(prev => ({ ...prev, [targetId]: stream }));
        } else {
          // Regular voice audio
          setRemoteStreams(prev => ({ ...prev, [targetId]: stream }));
          startSpeakingDetection(stream, targetId);
        }
      }
    };

    peer.onicecandidate = (e) => {
      if (e.candidate && socket) socket.emit('webrtc:ice', { targetId, candidate: e.candidate });
    };

    peer.onconnectionstatechange = () => {
      const state = peer.connectionState;
      if (state === 'connected') {
        setVoiceStatus(VOICE_STATUS.CONNECTED);
        setVoiceStatusMessage('');
        reconnectAttemptsRef.current = 0;
      } else if (state === 'disconnected') {
        setVoiceStatus(VOICE_STATUS.DEGRADED);
        setVoiceStatusMessage('Connection unstable — attempting to recover...');
        // Auto-recover: browsers often reconnect ICE automatically within a few seconds.
        // If still disconnected after 5s, trigger full reconnect.
        if (!autoReconnectRef.current && currentVoiceChannelRef.current) {
          autoReconnectRef.current = setTimeout(() => {
            autoReconnectRef.current = null;
            const p = peersRef.current[targetId];
            if (p && p.connectionState === 'disconnected') {
              setVoiceStatusMessage('Reconnecting...');
              setVoiceStatus(VOICE_STATUS.RECONNECTING);
              // Try ICE restart first before full reconnect
              p.restartIce();
            }
          }, 5000);
        }
      } else if (state === 'failed') {
        setRemoteStreams(prev => { const n = {...prev}; delete n[targetId]; return n; });
        setRemoteScreenStreams(prev => { const n = {...prev}; delete n[targetId]; return n; });
        delete analyserRef.current[targetId];
        setActiveSpeakers(prev => { const n = new Set(prev); n.delete(targetId); return n; });
        // Auto-reconnect on failure
        if (currentVoiceChannelRef.current && reconnectAttemptsRef.current < 3) {
          reconnectAttemptsRef.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current - 1), 8000);
          setVoiceStatus(VOICE_STATUS.RECONNECTING);
          setVoiceStatusMessage(`Connection lost — reconnecting (attempt ${reconnectAttemptsRef.current}/3)...`);
          autoReconnectRef.current = setTimeout(() => {
            autoReconnectRef.current = null;
            // Re-create the peer
            if (peersRef.current[targetId]) {
              try { peersRef.current[targetId].close(); } catch (_) {}
              delete peersRef.current[targetId];
            }
            peersRef.current[targetId] = createPeer(targetId, true);
          }, delay);
        } else if (reconnectAttemptsRef.current >= 3) {
          setVoiceStatus(VOICE_STATUS.DEGRADED);
          setVoiceStatusMessage('Connection failed — click Reconnect to try again');
        }
      } else if (state === 'closed') {
        setRemoteStreams(prev => { const n = {...prev}; delete n[targetId]; return n; });
        setRemoteScreenStreams(prev => { const n = {...prev}; delete n[targetId]; return n; });
        delete analyserRef.current[targetId];
        setActiveSpeakers(prev => { const n = new Set(prev); n.delete(targetId); return n; });
      }
    };

    // ICE timeout detection — if stuck in 'checking' for 15s, warn user
    peer.oniceconnectionstatechange = () => {
      const iceState = peer.iceConnectionState;
      if (iceState === 'checking') {
        iceTimeoutsRef.current[targetId] = setTimeout(() => {
          if (peer.iceConnectionState === 'checking') {
            setVoiceStatus(VOICE_STATUS.DEGRADED);
            setVoiceStatusMessage('Connection is taking longer than expected — you may be behind a restrictive firewall');
          }
        }, 15000);
      } else {
        if (iceTimeoutsRef.current[targetId]) {
          clearTimeout(iceTimeoutsRef.current[targetId]);
          delete iceTimeoutsRef.current[targetId];
        }
      }
    };

    // onnegotiationneeded fires when local tracks change. Use perfect negotiation
    // pattern to prevent glare (both sides sending offers simultaneously).
    peer.onnegotiationneeded = async () => {
      try {
        makingOffer = true;
        const offer = await peer.createOffer();
        // State may have changed during async createOffer (e.g. received remote offer)
        if (peer.signalingState !== 'stable') return;
        await peer.setLocalDescription(offer);
        socket.emit('webrtc:offer', { targetId, offer });
      } catch (err) { console.error('createOffer:', err); }
      finally { makingOffer = false; }
    };
    return peer;
  }, [socket, startSpeakingDetection]);

  useEffect(() => {
    if (!socket) return;

    const handlePeerJoined = ({ socketId }) => {
      peersRef.current[socketId] = createPeer(socketId, false);
    };

    const handlePeerLeft = ({ socketId }) => {
      try { peersRef.current[socketId]?.close(); } catch (_) {}
      delete peersRef.current[socketId];
      delete screenSendersRef.current[socketId];
      setRemoteStreams(prev => { const n={...prev}; delete n[socketId]; return n; });
      setRemoteScreenStreams(prev => { const n={...prev}; delete n[socketId]; return n; });
      // Clean up speaking detection for this peer
      if (speakingIntervalsRef.current[socketId]) {
        clearInterval(speakingIntervalsRef.current[socketId]);
        delete speakingIntervalsRef.current[socketId];
      }
      if (speakingSourcesRef.current[socketId]) {
        try { speakingSourcesRef.current[socketId].disconnect(); } catch (_) {}
        delete speakingSourcesRef.current[socketId];
      }
      delete analyserRef.current[socketId];
      activeSpeakersRef.current.delete(socketId);
      setActiveSpeakers(new Set(activeSpeakersRef.current));
    };

    const handleOffer = async ({ from, offer }) => {
      let peer = peersRef.current[from];
      if (!peer) peer = createPeer(from, true); // unknown peer → we are polite (yield)

      // Perfect negotiation: detect glare (both sides sending offers)
      const isPolite = peer._isPolite ?? true;
      const makingOffer = peer._makingOffer?.() || false;
      const offerCollision = makingOffer || peer.signalingState !== 'stable';

      if (!isPolite && offerCollision) {
        // Impolite peer ignores incoming offers during glare
        return;
      }

      try {
        // Polite peer rolls back its own offer and accepts the remote one
        if (offerCollision) {
          await peer.setLocalDescription({ type: 'rollback' });
        }
        await peer.setRemoteDescription(new RTCSessionDescription(offer));
        // Flush any ICE candidates that arrived before the remote description
        while (peer._iceCandidateQueue?.length > 0) {
          await peer.addIceCandidate(new RTCIceCandidate(peer._iceCandidateQueue.shift()));
        }
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        socket.emit('webrtc:answer', { targetId: from, answer });
      } catch (err) { console.error('offer handling:', err); }
    };

    const handleAnswer = async ({ from, answer }) => {
      const peer = peersRef.current[from];
      if (peer) {
        try {
          await peer.setRemoteDescription(new RTCSessionDescription(answer));
          // Flush any ICE candidates that arrived before the remote description
          while (peer._iceCandidateQueue?.length > 0) {
            await peer.addIceCandidate(new RTCIceCandidate(peer._iceCandidateQueue.shift()));
          }
        }
        catch (err) { console.error('answer handling:', err); }
      }
    };

    const handleIce = async ({ from, candidate }) => {
      const peer = peersRef.current[from];
      if (peer) {
        try {
          if (peer.remoteDescription) {
            await peer.addIceCandidate(new RTCIceCandidate(candidate));
          } else {
            // Buffer until remote description is set
            peer._iceCandidateQueue = peer._iceCandidateQueue || [];
            peer._iceCandidateQueue.push(candidate);
          }
        }
        catch (err) { console.error('ICE:', err); }
      }
    };

    // Voice join/leave audio cues
    const handleVoiceCue = ({ type, user, customSound, customSoundVolume }) => {
      if (isDeafenedRef.current) return;
      if (user?.id === currentUser?.id) {
        // Play default beep for yourself as feedback (not your custom sound)
        playVoiceCue(type, null, 100);
      } else {
        playVoiceCue(type, customSound, customSoundVolume);
      }
    };

    // Remote user mute/deafen state changes
    const handleMuteChanged = ({ socketId, isMuted }) => {
      setRemoteUserStates(prev => ({
        ...prev,
        [socketId]: { ...prev[socketId], isMuted }
      }));
    };

    const handleDeafenChanged = ({ socketId, isDeafened }) => {
      setRemoteUserStates(prev => ({
        ...prev,
        [socketId]: { ...prev[socketId], isDeafened }
      }));
    };

    // Opt-in screen share: sharer receives request to add/remove viewer
    const handleAddViewer = ({ viewerId }) => {
      const peer = peersRef.current[viewerId];
      const stream = screenStreamRef.current;
      if (!peer || !stream) return;

      const senders = [];
      // Add video track
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        try { senders.push(peer.addTrack(videoTrack, stream)); }
        catch (err) { console.error('addTrack video:', err); }
      }
      // Add audio track if the screen share captured system audio
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        try { senders.push(peer.addTrack(audioTrack, stream)); }
        catch (err) { console.error('addTrack screen audio:', err); }
      }
      screenSendersRef.current[viewerId] = senders;
    };

    const handleRemoveViewer = ({ viewerId }) => {
      const peer = peersRef.current[viewerId];
      const senders = screenSendersRef.current[viewerId];
      if (peer && senders) {
        senders.forEach(sender => {
          try { peer.removeTrack(sender); } catch (_) {}
        });
        delete screenSendersRef.current[viewerId];
      }
    };

    // When a specific user's screen share stops, clean up only that sharer's stream
    const handleScreenStopped = ({ socketId }) => {
      setRemoteScreenStreams(prev => {
        const next = { ...prev };
        delete next[socketId];
        if (Object.keys(next).length === 0) {
          setIsWatchingScreen(false);
          setIsScreenAudioMuted(false);
          screenStreamIdsRef.current.clear();
        }
        return next;
      });
    };

    socket.on('peer:joined', handlePeerJoined);
    socket.on('peer:left', handlePeerLeft);
    socket.on('webrtc:offer', handleOffer);
    socket.on('webrtc:answer', handleAnswer);
    socket.on('webrtc:ice', handleIce);
    socket.on('voice:cue', handleVoiceCue);
    socket.on('peer:mute:changed', handleMuteChanged);
    socket.on('peer:deafen:changed', handleDeafenChanged);
    socket.on('screen:add-viewer', handleAddViewer);
    socket.on('screen:remove-viewer', handleRemoveViewer);
    socket.on('screen:stopped', handleScreenStopped);

    return () => {
      socket.off('peer:joined', handlePeerJoined);
      socket.off('peer:left', handlePeerLeft);
      socket.off('webrtc:offer', handleOffer);
      socket.off('webrtc:answer', handleAnswer);
      socket.off('webrtc:ice', handleIce);
      socket.off('voice:cue', handleVoiceCue);
      socket.off('peer:mute:changed', handleMuteChanged);
      socket.off('peer:deafen:changed', handleDeafenChanged);
      socket.off('screen:add-viewer', handleAddViewer);
      socket.off('screen:remove-viewer', handleRemoveViewer);
      socket.off('screen:stopped', handleScreenStopped);
    };
  }, [socket, createPeer, currentUser]);

  // Connection quality monitoring — polls WebRTC stats every 2 seconds
  useEffect(() => {
    if (!currentVoiceChannel) {
      if (qualityIntervalRef.current) { clearInterval(qualityIntervalRef.current); qualityIntervalRef.current = null; }
      setVoiceQuality(null);
      return;
    }

    let prevBytesSent = 0;
    let prevTimestamp = 0;

    qualityIntervalRef.current = setInterval(async () => {
      const peers = Object.values(peersRef.current);
      if (peers.length === 0) return;

      let totalRtt = 0;
      let totalPacketLoss = 0;
      let totalJitter = 0;
      let peerCount = 0;

      for (const peer of peers) {
        if (peer.connectionState !== 'connected') continue;
        try {
          const stats = await peer.getStats();
          stats.forEach(report => {
            if (report.type === 'candidate-pair' && report.state === 'succeeded') {
              if (report.currentRoundTripTime !== undefined) {
                totalRtt += report.currentRoundTripTime * 1000; // Convert to ms
                peerCount++;
              }
            }
            if (report.type === 'inbound-rtp' && report.kind === 'audio') {
              if (report.packetsLost !== undefined && report.packetsReceived !== undefined) {
                const total = report.packetsLost + report.packetsReceived;
                if (total > 0) totalPacketLoss += (report.packetsLost / total) * 100;
              }
              if (report.jitter !== undefined) {
                totalJitter += report.jitter * 1000; // Convert to ms
              }
            }
          });
        } catch (_) {}
      }

      if (peerCount > 0) {
        const quality = {
          rtt: Math.round(totalRtt / peerCount),
          packetLoss: Math.round((totalPacketLoss / peerCount) * 10) / 10,
          jitter: Math.round(totalJitter / peerCount)
        };
        setVoiceQuality(quality);

        // Update status based on quality
        if (quality.packetLoss > 10 || quality.rtt > 300) {
          setVoiceStatus(VOICE_STATUS.DEGRADED);
          setVoiceStatusMessage(
            quality.packetLoss > 10
              ? `High packet loss (${quality.packetLoss}%) — audio may cut out`
              : `High latency (${quality.rtt}ms) — audio may be delayed`
          );
        } else if (voiceStatus === VOICE_STATUS.DEGRADED && quality.packetLoss < 5 && quality.rtt < 200) {
          setVoiceStatus(VOICE_STATUS.CONNECTED);
          setVoiceStatusMessage('');
        }
      }
    }, 2000);

    return () => {
      if (qualityIntervalRef.current) { clearInterval(qualityIntervalRef.current); qualityIntervalRef.current = null; }
    };
  }, [currentVoiceChannel]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist mute state to localStorage
  useEffect(() => {
    localStorage.setItem('nexus_voice_muted', String(isMuted));
  }, [isMuted]);

  // Persist deafen state to localStorage
  useEffect(() => {
    localStorage.setItem('nexus_voice_deafened', String(isDeafened));
    isDeafenedRef.current = isDeafened;
  }, [isDeafened]);

  const initExistingPeers = useCallback((peers) => {
    if (!peers || peers.length === 0) {
      // No peers in channel — we're connected, just waiting for others
      const waitingMessages = [
        'Waiting for others to join the party...',
        'You have the stage all to yourself!',
        'It\'s quiet in here... too quiet.',
        'First one here! Gold star for punctuality.',
        'Echo... echo... echo...',
      ];
      setVoiceStatus(VOICE_STATUS.CONNECTED);
      setVoiceStatusMessage(waitingMessages[Math.floor(Math.random() * waitingMessages.length)]);
      return;
    }
    const newRemoteStates = {};
    peers.forEach(({ socketId, isMuted, isDeafened }) => {
      if (!peersRef.current[socketId]) peersRef.current[socketId] = createPeer(socketId, true);
      // Capture initial mute/deafen states
      newRemoteStates[socketId] = { isMuted: isMuted || false, isDeafened: isDeafened || false };
    });
    setRemoteUserStates(prev => ({ ...prev, ...newRemoteStates }));
  }, [createPeer]);

  // Clean up audio processing chain
  const cleanupAudioProcessing = useCallback(() => {
    if (audioProcessingRef.current) {
      if (audioProcessingRef.current.intervalId) clearInterval(audioProcessingRef.current.intervalId);
      try { audioProcessingRef.current.rnnoiseNode?.disconnect(); } catch (_) {}
      try { audioProcessingRef.current.workletNode?.disconnect(); } catch (_) {}
      try { audioProcessingRef.current.source.disconnect(); } catch (_) {}
      try { audioProcessingRef.current.highpass.disconnect(); } catch (_) {}
      try { audioProcessingRef.current.analyser.disconnect(); } catch (_) {}
      try { audioProcessingRef.current.gateGain?.disconnect(); } catch (_) {}
      try { audioProcessingRef.current.autoGain?.disconnect(); } catch (_) {}
      try { audioProcessingRef.current.outputGain?.disconnect(); } catch (_) {}
      try { audioProcessingRef.current.compressor?.disconnect(); } catch (_) {}
      try { audioProcessingRef.current.ctx.close(); } catch (_) {}
      audioProcessingRef.current = null;
    }
  }, []);

  // Set up audio processing chain (async — tries AudioWorklet first, falls back to setInterval)
  // Worklet path:  source → highpass → analyser → AudioWorkletNode → compressor → destination
  // Fallback path: source → highpass → analyser → gateGain → autoGain → outputGain → compressor → destination
  const setupAudioProcessing = useCallback(async (stream) => {
    cleanupAudioProcessing();

    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const source = ctx.createMediaStreamSource(stream);

      // High-pass filter at 80Hz to remove rumble
      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 80;

      // Analyser for potential UI metering
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;

      // Compressor to prevent clipping — keeps peaks from distorting
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -6;
      compressor.knee.value = 6;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.1;

      // Output destination (creates a new MediaStream)
      const destination = ctx.createMediaStreamDestination();

      // Read initial settings from localStorage
      const initialSettings = {
        type: 'settings',
        gateEnabled: localStorage.getItem('nexus_noise_gate_enabled') !== 'false',
        gateThreshold: parseFloat(localStorage.getItem('nexus_noise_gate_threshold')) || -50,
        agcEnabled: localStorage.getItem('nexus_auto_gain_enabled') === 'true',
        agcTarget: parseFloat(localStorage.getItem('nexus_auto_gain_target')) || -20,
        inputVolume: parseInt(localStorage.getItem('nexus_audio_input_volume') || '100') / 100,
      };

      // Try AudioWorklet path
      let usingWorklet = false;
      let workletNode = null;

      try {
        await ctx.audioWorklet.addModule('/audio-processor.js');
        workletNode = new AudioWorkletNode(ctx, 'nexus-audio-processor');

        // Send initial settings
        workletNode.port.postMessage(initialSettings);

        // Listen for speaking state from worklet
        workletNode.port.onmessage = (e) => {
          if (e.data.type === 'speaking') {
            const wasSpeaking = activeSpeakersRef.current.has('local');
            if (e.data.isSpeaking !== wasSpeaking) {
              if (e.data.isSpeaking) activeSpeakersRef.current.add('local');
              else activeSpeakersRef.current.delete('local');
              setActiveSpeakers(new Set(activeSpeakersRef.current));
            }
          }
        };

        usingWorklet = true;
        console.log('[Audio] Using AudioWorklet processor');
      } catch (workletErr) {
        console.warn('[Audio] AudioWorklet unavailable, falling back to setInterval:', workletErr.message);
      }

      // Try loading RNNoise ML noise cancellation (only when worklet path succeeded)
      let rnnoiseNode = null;
      if (usingWorklet) {
        try {
          // Fetch and compile RNNoise WASM on main thread
          const wasmResponse = await fetch('/rnnoise.wasm');
          const wasmBinary = await wasmResponse.arrayBuffer();
          const wasmModule = await WebAssembly.compile(wasmBinary);

          // Load RNNoise worklet processor
          await ctx.audioWorklet.addModule('/rnnoise-processor.js');
          rnnoiseNode = new AudioWorkletNode(ctx, 'rnnoise-processor', {
            processorOptions: { wasmModule }
          });

          // Send initial settings
          rnnoiseNode.port.postMessage({
            type: 'settings',
            noiseCancellation: localStorage.getItem('nexus_noise_cancellation_enabled') !== 'false'
          });

          console.log('[Audio] RNNoise noise cancellation loaded');
        } catch (rnnoiseErr) {
          console.warn('[Audio] RNNoise unavailable, skipping ML noise cancellation:', rnnoiseErr.message);
          rnnoiseNode = null;
        }
      }

      if (usingWorklet) {
        if (rnnoiseNode) {
          // Full chain: source → highpass → analyser → rnnoiseNode → workletNode → compressor → destination
          source.connect(highpass);
          highpass.connect(analyser);
          analyser.connect(rnnoiseNode);
          rnnoiseNode.connect(workletNode);
          workletNode.connect(compressor);
          compressor.connect(destination);
        } else {
          // Without RNNoise: source → highpass → analyser → workletNode → compressor → destination
          source.connect(highpass);
          highpass.connect(analyser);
          analyser.connect(workletNode);
          workletNode.connect(compressor);
          compressor.connect(destination);
        }
      }

      if (!usingWorklet) {
        // Fallback: GainNode + setInterval approach (original implementation)
        const gateGain = ctx.createGain();
        gateGain.gain.value = 1.0;

        const autoGain = ctx.createGain();
        autoGain.gain.value = 1.0;

        const inputVol = initialSettings.inputVolume;
        const outputGain = ctx.createGain();
        outputGain.gain.value = 1.8 * inputVol;

        // Connect: source → highpass → analyser → gateGain → autoGain → outputGain → compressor → destination
        source.connect(highpass);
        highpass.connect(analyser);
        analyser.connect(gateGain);
        gateGain.connect(autoGain);
        autoGain.connect(outputGain);
        outputGain.connect(compressor);
        compressor.connect(destination);

        let currentAutoGainValue = 1.0;
        const data = new Uint8Array(analyser.frequencyBinCount);

        const intervalId = setInterval(() => {
          if (!audioProcessingRef.current || ctx.state === 'closed') {
            clearInterval(intervalId);
            return;
          }

          analyser.getByteFrequencyData(data);

          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            sum += data[i] * data[i];
          }
          const rms = Math.sqrt(sum / data.length);
          const dbFS = rms > 0 ? 20 * Math.log10(rms / 255) : -100;

          const now = ctx.currentTime;

          const liveGateEnabled = localStorage.getItem('nexus_noise_gate_enabled') !== 'false';
          const liveGateThreshold = parseFloat(localStorage.getItem('nexus_noise_gate_threshold')) || -50;
          const liveAgcEnabled = localStorage.getItem('nexus_auto_gain_enabled') === 'true';
          const liveAgcTarget = parseFloat(localStorage.getItem('nexus_auto_gain_target')) || -20;

          const liveInputVol = parseInt(localStorage.getItem('nexus_audio_input_volume') || '100') / 100;
          outputGain.gain.setTargetAtTime(1.8 * liveInputVol, now, 0.05);

          if (liveGateEnabled) {
            if (dbFS > liveGateThreshold) {
              gateGain.gain.setTargetAtTime(1.0, now, 0.005);
            } else {
              gateGain.gain.setTargetAtTime(0.0, now, 0.05);
            }
          } else {
            gateGain.gain.setTargetAtTime(1.0, now, 0.005);
          }

          if (liveAgcEnabled && dbFS > -70) {
            const diff = liveAgcTarget - dbFS;
            const adjustment = 1 + (diff * 0.03);
            currentAutoGainValue = Math.max(0.2, Math.min(8.0, currentAutoGainValue * adjustment));
            autoGain.gain.setTargetAtTime(currentAutoGainValue, now, 0.08);
          } else if (!liveAgcEnabled) {
            currentAutoGainValue = 1.0;
            autoGain.gain.setTargetAtTime(1.0, now, 0.05);
          }
        }, 20);

        audioProcessingRef.current = {
          ctx, source, highpass, analyser, gateGain, autoGain, outputGain, compressor, destination, intervalId, usingWorklet: false
        };
      } else {
        audioProcessingRef.current = {
          ctx, source, highpass, analyser, workletNode, rnnoiseNode, compressor, destination, usingWorklet: true
        };
      }

      // Verify the destination stream has a live audio track
      const destTrack = destination.stream.getAudioTracks()[0];
      if (!destTrack || destTrack.readyState !== 'live') {
        console.warn('Audio processing: destination track not live, falling back to raw stream');
        cleanupAudioProcessing();
        return stream;
      }

      return destination.stream;
    } catch (err) {
      console.warn('Audio processing setup failed, using raw stream:', err);
      cleanupAudioProcessing();
      return stream;
    }
  }, [cleanupAudioProcessing]);

  // Update audio processing settings live (called from SettingsModal)
  const updateAudioProcessing = useCallback(() => {
    if (!audioProcessingRef.current) return false;

    // When using worklet, push current settings via MessagePort
    if (audioProcessingRef.current.usingWorklet && audioProcessingRef.current.workletNode) {
      audioProcessingRef.current.workletNode.port.postMessage({
        type: 'settings',
        gateEnabled: localStorage.getItem('nexus_noise_gate_enabled') !== 'false',
        gateThreshold: parseFloat(localStorage.getItem('nexus_noise_gate_threshold')) || -50,
        agcEnabled: localStorage.getItem('nexus_auto_gain_enabled') === 'true',
        agcTarget: parseFloat(localStorage.getItem('nexus_auto_gain_target')) || -20,
        inputVolume: parseInt(localStorage.getItem('nexus_audio_input_volume') || '100') / 100,
      });
    }
    // Forward noise cancellation setting to RNNoise worklet
    if (audioProcessingRef.current.rnnoiseNode) {
      audioProcessingRef.current.rnnoiseNode.port.postMessage({
        type: 'settings',
        noiseCancellation: localStorage.getItem('nexus_noise_cancellation_enabled') !== 'false',
      });
    }

    // Fallback path reads from localStorage in its setInterval loop — no action needed

    return true;
  }, []);

  const joinVoice = useCallback(async (channelId, serverId) => {
    try {
      setMediaError(null);
      setVoiceStatus(VOICE_STATUS.CONNECTING);
      setVoiceStatusMessage('Connecting to voice...');
      reconnectAttemptsRef.current = 0;

      // Fetch fresh ICE config for this server before creating peers
      // Skip for DM/personal servers (no custom ICE config possible)
      const sid = serverId || activeServerId;
      if (socket && sid && !sid.startsWith('personal:')) {
        try {
          const iceResult = await new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(null), 5000);
            socket.emit('voice:ice-config', { serverId: sid }, (result) => {
              clearTimeout(timeout);
              resolve(result);
            });
          });
          if (iceResult?.iceServers?.length > 0) {
            iceServersRef.current = iceResult.iceServers;
          }
        } catch (err) {
          console.warn('[WebRTC] Failed to fetch ICE config, using defaults:', err);
        }
      }

      // Use saved input device if available, with noise suppression settings
      // Default to TRUE for browser-level processing — these are efficient and improve quality
      if (!navigator.mediaDevices?.getUserMedia) return;
      const savedDevice = localStorage.getItem('nexus_audio_input');
      const noiseSuppression = localStorage.getItem('nexus_noise_suppression');
      const echoCancellation = localStorage.getItem('nexus_echo_cancellation');
      const autoGainControl = localStorage.getItem('nexus_auto_gain_control');
      const audioConstraints = {
        ...(savedDevice && savedDevice !== 'default' ? { deviceId: { exact: savedDevice } } : {}),
        noiseSuppression: { ideal: noiseSuppression !== null ? noiseSuppression === 'true' : true },
        echoCancellation: { ideal: echoCancellation !== null ? echoCancellation === 'true' : true },
        autoGainControl: { ideal: autoGainControl !== null ? autoGainControl === 'true' : true },
        // Request high-quality audio
        sampleRate: { ideal: 48000 },
        channelCount: { ideal: 1 }
      };
      let rawStream;
      try {
        rawStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
      } catch (constraintErr) {
        // WebKit2GTK may reject ideal constraints — fall back to basic audio
        console.warn('getUserMedia with constraints failed, retrying with audio:true', constraintErr);
        rawStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      }
      rawStreamRef.current = rawStream;

      // Set up audio processing chain (noise gate + auto gain + volume boost)
      const processedStream = await setupAudioProcessing(rawStream);
      localStreamRef.current = processedStream;
      setLocalStream(processedStream);

      // Apply saved mute state to the processed audio track
      const audioTrack = processedStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !isMuted;
      }

      // Only use setInterval-based speaking detection if worklet is not handling it
      if (!audioProcessingRef.current?.usingWorklet) {
        startSpeakingDetection(processedStream, 'local');
      }
      setCurrentVoiceChannel(channelId);
      currentVoiceChannelRef.current = channelId;
      socket.emit('voice:join', { channelId });
    } catch (err) {
      console.error('getUserMedia:', err);
      setVoiceStatus(VOICE_STATUS.DISCONNECTED);
      setVoiceStatusMessage('');
      const info = getMediaErrorInfo(err, 'microphone');
      setMediaError({ ...info, mediaType: 'microphone', channelId, serverId: serverId || activeServerId });
    }
  }, [socket, startSpeakingDetection, isMuted, setupAudioProcessing, activeServerId]);

  const clearMediaError = useCallback(() => setMediaError(null), []);

  const retryJoinVoice = useCallback((channelId, serverId) => {
    setMediaError(null);
    joinVoice(channelId, serverId);
  }, [joinVoice]);

  const leaveVoice = useCallback(() => {
    // 0. Cancel any pending auto-reconnect and quality polling
    if (autoReconnectRef.current) { clearTimeout(autoReconnectRef.current); autoReconnectRef.current = null; }
    if (qualityIntervalRef.current) { clearInterval(qualityIntervalRef.current); qualityIntervalRef.current = null; }
    reconnectAttemptsRef.current = 0;

    // 1. Close all peer connections FIRST (before stopping streams)
    Object.values(peersRef.current).forEach(p => { try { p.close(); } catch(_){} });
    peersRef.current = {};

    // 2. Clean up audio processing chain
    cleanupAudioProcessing();

    // 3. Stop raw mic stream (releases microphone)
    rawStreamRef.current?.getTracks().forEach(t => t.stop());
    rawStreamRef.current = null;

    // 4. Stop processed stream
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current = null;
    setScreenStream(null);
    setIsSharingScreen(false);
    screenSendersRef.current = {};
    setRemoteStreams({});
    setRemoteScreenStreams({});
    setIsWatchingScreen(false);
    setIsScreenAudioMuted(false);
    screenStreamIdsRef.current.clear();
    setCurrentVoiceChannel(null);
    currentVoiceChannelRef.current = null;
    setActiveSpeakers(new Set());
    activeSpeakersRef.current = new Set();
    setVoiceStatus(VOICE_STATUS.DISCONNECTED);
    setVoiceStatusMessage('');
    setVoiceQuality(null);

    // Clean up ICE timeout timers
    Object.values(iceTimeoutsRef.current).forEach(t => clearTimeout(t));
    iceTimeoutsRef.current = {};

    // Reset ICE servers to defaults for next join
    iceServersRef.current = DEFAULT_ICE_SERVERS;

    // Clean up all speaking detection intervals and audio sources
    Object.values(speakingIntervalsRef.current).forEach(id => clearInterval(id));
    speakingIntervalsRef.current = {};
    Object.values(speakingSourcesRef.current).forEach(src => {
      try { src.disconnect(); } catch (_) {}
    });
    speakingSourcesRef.current = {};
    analyserRef.current = {};

    // Close the shared AudioContext to free resources
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try { audioContextRef.current.close(); } catch (_) {}
      audioContextRef.current = null;
    }

    if (socket) socket.emit('voice:leave');
  }, [socket, cleanupAudioProcessing]);

  const reconnectVoice = useCallback(async () => {
    const channelId = currentVoiceChannel;
    if (!channelId || !socket) return;

    setVoiceStatus(VOICE_STATUS.RECONNECTING);
    setVoiceStatusMessage('Reconnecting...');
    reconnectAttemptsRef.current = 0;

    // Cancel any pending auto-reconnect
    if (autoReconnectRef.current) { clearTimeout(autoReconnectRef.current); autoReconnectRef.current = null; }
    if (qualityIntervalRef.current) { clearInterval(qualityIntervalRef.current); qualityIntervalRef.current = null; }

    // 1. Close all peer connections
    Object.values(peersRef.current).forEach(p => { try { p.close(); } catch(_){} });
    peersRef.current = {};

    // 2. Clean up audio processing
    cleanupAudioProcessing();

    // 3. Stop existing streams
    rawStreamRef.current?.getTracks().forEach(t => t.stop());
    rawStreamRef.current = null;
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStreams({});
    setRemoteScreenStreams({});
    screenStreamIdsRef.current.clear();

    // Clean up speaking detection
    Object.values(speakingIntervalsRef.current).forEach(id => clearInterval(id));
    speakingIntervalsRef.current = {};
    Object.values(speakingSourcesRef.current).forEach(src => {
      try { src.disconnect(); } catch (_) {}
    });
    speakingSourcesRef.current = {};
    analyserRef.current = {};
    activeSpeakersRef.current = new Set();
    setActiveSpeakers(new Set());

    // Close shared AudioContext
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try { audioContextRef.current.close(); } catch (_) {}
      audioContextRef.current = null;
    }

    // Clean up gain nodes
    Object.values(gainNodesRef.current).forEach(gn => {
      try { gn.source.disconnect(); gn.gain.disconnect(); gn.ctx.close(); } catch {}
    });
    gainNodesRef.current = {};
    audioElementsRef.current = {};

    // 4. Emit leave to reset server-side state
    socket.emit('voice:leave');

    // Clean up ICE timeout timers
    Object.values(iceTimeoutsRef.current).forEach(t => clearTimeout(t));
    iceTimeoutsRef.current = {};

    // 5. Short delay then re-join
    await new Promise(r => setTimeout(r, 500));

    // Fetch fresh ICE config for reconnection
    // Skip for DM/personal servers (no custom ICE config possible)
    const sid = activeServerId;
    if (socket && sid && !sid.startsWith('personal:')) {
      try {
        const iceResult = await new Promise((resolve) => {
          const timeout = setTimeout(() => resolve(null), 5000);
          socket.emit('voice:ice-config', { serverId: sid }, (result) => {
            clearTimeout(timeout);
            resolve(result);
          });
        });
        if (iceResult?.iceServers?.length > 0) {
          iceServersRef.current = iceResult.iceServers;
        }
      } catch (err) {
        console.warn('[WebRTC] Failed to fetch ICE config for reconnect, using previous:', err);
      }
    }

    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      const savedDevice = localStorage.getItem('nexus_audio_input');
      const noiseSuppression = localStorage.getItem('nexus_noise_suppression');
      const echoCancellation = localStorage.getItem('nexus_echo_cancellation');
      const autoGainControl = localStorage.getItem('nexus_auto_gain_control');
      const audioConstraints = {
        ...(savedDevice && savedDevice !== 'default' ? { deviceId: { exact: savedDevice } } : {}),
        noiseSuppression: { ideal: noiseSuppression !== null ? noiseSuppression === 'true' : true },
        echoCancellation: { ideal: echoCancellation !== null ? echoCancellation === 'true' : true },
        autoGainControl: { ideal: autoGainControl !== null ? autoGainControl === 'true' : true },
        sampleRate: { ideal: 48000 },
        channelCount: { ideal: 1 }
      };
      let rawStream;
      try {
        rawStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
      } catch (constraintErr) {
        console.warn('getUserMedia with constraints failed, retrying with audio:true', constraintErr);
        rawStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      }
      rawStreamRef.current = rawStream;

      const processedStream = await setupAudioProcessing(rawStream);
      localStreamRef.current = processedStream;
      setLocalStream(processedStream);

      const audioTrack = processedStream.getAudioTracks()[0];
      if (audioTrack) audioTrack.enabled = !isMuted;

      if (!audioProcessingRef.current?.usingWorklet) {
        startSpeakingDetection(processedStream, 'local');
      }
      socket.emit('voice:join', { channelId });
    } catch (err) {
      console.error('Reconnect failed:', err);
      const info = getMediaErrorInfo(err, 'microphone');
      setVoiceStatus(VOICE_STATUS.DEGRADED);
      setVoiceStatusMessage(`Reconnection failed: ${info.title}`);
      setMediaError({ ...info, mediaType: 'microphone' });
    }
  }, [socket, currentVoiceChannel, isMuted, cleanupAudioProcessing, setupAudioProcessing, startSpeakingDetection, activeServerId]);

  const toggleMute = useCallback(() => {
    // Cannot unmute while deafened
    if (isDeafened) return;

    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      const newMutedState = !track.enabled;
      setIsMuted(newMutedState);

      // Broadcast mute state to other users in voice channel
      if (socket && currentVoiceChannel) {
        socket.emit('voice:mute', { isMuted: newMutedState, channelId: currentVoiceChannel });
      }
    }
  }, [isDeafened, socket, currentVoiceChannel]);

  const toggleDeafen = useCallback(() => {
    const willBeDeafened = !isDeafened;
    const track = localStreamRef.current?.getAudioTracks()[0];

    if (willBeDeafened) {
      // Deafening: save current mute state and mute the mic
      preDeafenMuteStateRef.current = isMuted;
      if (track) {
        track.enabled = false;
      }
      setIsMuted(true);
      setIsDeafened(true);

      // Broadcast deafen and mute states
      if (socket && currentVoiceChannel) {
        socket.emit('voice:deafen', { isDeafened: true, channelId: currentVoiceChannel });
        socket.emit('voice:mute', { isMuted: true, channelId: currentVoiceChannel });
      }
    } else {
      // Undeafening: restore previous mute state
      const shouldBeMuted = preDeafenMuteStateRef.current;
      if (track) {
        track.enabled = !shouldBeMuted;
      }
      setIsMuted(shouldBeMuted);
      setIsDeafened(false);

      // Broadcast undeafen and restored mute state
      if (socket && currentVoiceChannel) {
        socket.emit('voice:deafen', { isDeafened: false, channelId: currentVoiceChannel });
        socket.emit('voice:mute', { isMuted: shouldBeMuted, channelId: currentVoiceChannel });
      }
    }
  }, [isDeafened, isMuted, socket, currentVoiceChannel]);

  const startScreenShare = useCallback(async (channelId) => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      alert('Screen sharing is not available in the desktop app. Use the web version for screen sharing.');
      return;
    }
    try {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

      // Request both video and audio - browser shows checkbox for "Share audio"
      const constraints = isMobile ? {
        video: {
          cursor: 'always',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30, max: 60 }
        },
        audio: true  // System audio (user can opt out in browser picker)
      } : {
        video: {
          displaySurface: 'monitor',
          logicalSurface: true,
          cursor: 'always',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30, max: 60 }
        },
        audio: true  // System audio (browser shows "Share audio" checkbox)
      };

      const stream = await navigator.mediaDevices.getDisplayMedia(constraints);

      screenStreamRef.current = stream;
      setScreenStream(stream);
      setIsSharingScreen(true);

      const videoTrack = stream.getVideoTracks()[0];

      // Opt-in: Don't add tracks to any peers here.
      // Tracks are added per-viewer when they emit screen:watch via screen:add-viewer handler.

      socket.emit('screen:start', { channelId });

      videoTrack.onended = () => stopScreenShare(channelId);
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        // In browsers, user likely just clicked Cancel — not an error
        if (isTauriApp() || isElectronApp()) {
          const info = getMediaErrorInfo(err, 'screen');
          setMediaError({ ...info, mediaType: 'screen' });
        }
      } else {
        console.error('getDisplayMedia:', err);
        const info = getMediaErrorInfo(err, 'screen');
        setMediaError({ ...info, mediaType: 'screen' });
      }
    }
  }, [socket]); // stopScreenShare is defined below — safe forward ref via closure

  const stopScreenShare = useCallback((channelId) => {
    // Remove screen track senders from all viewing peers
    Object.entries(screenSendersRef.current).forEach(([peerId, senders]) => {
      const peer = peersRef.current[peerId];
      if (peer) {
        (Array.isArray(senders) ? senders : [senders]).forEach(sender => {
          try { peer.removeTrack(sender); } catch (_) {}
        });
      }
    });
    screenSendersRef.current = {};
    // Only clear local screen share stream IDs, not remote ones
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => {
        screenStreamIdsRef.current.delete(screenStreamRef.current.id);
      });
    }

    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current = null;
    setScreenStream(null);
    setIsSharingScreen(false);
    if (socket) socket.emit('screen:stop', { channelId });
  }, [socket]);

  // Per-user audio controls
  // Mobile browsers often output quieter audio from HTMLAudioElement.
  // Always route through GainNode on mobile for consistent volume.
  const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const mobileBoost = isMobileDevice ? 1.5 : 1.0;

  const applyVolume = useCallback((socketId, volume) => {
    const audioElement = audioElementsRef.current[socketId];
    if (!audioElement) return;

    const needsGainNode = volume > 100 || isMobileDevice;

    if (!needsGainNode) {
      // Desktop normal range: use native volume (0-1.0)
      audioElement.volume = volume / 100;
      // Disconnect any gain node if it exists
      const gn = gainNodesRef.current[socketId];
      if (gn) {
        try { gn.source.disconnect(); gn.gain.disconnect(); gn.ctx.close(); } catch {}
        delete gainNodesRef.current[socketId];
      }
    } else {
      // Boost range or mobile: use GainNode for precise control
      const gainVal = (volume / 100) * mobileBoost;
      let gn = gainNodesRef.current[socketId];
      if (gn) {
        gn.gain.gain.value = gainVal;
      } else if (audioElement.srcObject) {
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          // Route to selected output device
          const outputDevice = localStorage.getItem('nexus_audio_output');
          if (outputDevice && outputDevice !== 'default' && ctx.setSinkId) {
            ctx.setSinkId(outputDevice).catch(() => {});
          }
          const source = ctx.createMediaStreamSource(audioElement.srcObject);
          const gain = ctx.createGain();
          gain.gain.value = gainVal;
          source.connect(gain);
          gain.connect(ctx.destination);
          gainNodesRef.current[socketId] = { ctx, gain, source };
          // Mute the original element to avoid double audio
          audioElement.volume = 0;
        } catch {}
      }
    }
  }, [isMobileDevice, mobileBoost]);

  const setUserVolume = useCallback((socketId, volume) => {
    setUserVolumes(prev => {
      const newVolumes = { ...prev, [socketId]: volume };
      localStorage.setItem('nexus_user_volumes', JSON.stringify(newVolumes));
      return newVolumes;
    });

    applyVolume(socketId, volume);

    const audioElement = audioElementsRef.current[socketId];
    if (audioElement) {
      if (volume === 0) {
        audioElement.muted = true;
      } else {
        setLocalMutedUsers(prev => {
          const isLocallyMuted = prev[socketId];
          audioElement.muted = isDeafened || isLocallyMuted;
          return prev;
        });
      }
    }
  }, [isDeafened, applyVolume]);

  const toggleUserMute = useCallback((socketId) => {
    let newMutedState = false;
    setLocalMutedUsers(prev => {
      newMutedState = !prev[socketId];
      const newMuted = { ...prev, [socketId]: newMutedState };
      localStorage.setItem('nexus_local_muted', JSON.stringify(newMuted));
      return newMuted;
    });

    // Apply mute to audio element if it exists
    const audioElement = audioElementsRef.current[socketId];
    if (audioElement) {
      // CRITICAL: Respect global deafen state - if deafened, audio must stay muted
      audioElement.muted = isDeafened || newMutedState;
      // When unmuting, ensure volume is above 0
      if (!newMutedState && audioElement.volume === 0) {
        audioElement.volume = 1.0; // Set to 100%
        setUserVolumes(prev => {
          const newVolumes = { ...prev, [socketId]: 100 };
          localStorage.setItem('nexus_user_volumes', JSON.stringify(newVolumes));
          return newVolumes;
        });
      }
    }
  }, [isDeafened]);

  // When deafen state changes, suspend/resume all boost gain nodes
  useEffect(() => {
    Object.values(gainNodesRef.current).forEach(gn => {
      try {
        if (isDeafened) gn.ctx.suspend();
        else gn.ctx.resume();
      } catch {}
    });
  }, [isDeafened]);

  // Persist user volumes and local mutes to localStorage
  useEffect(() => {
    localStorage.setItem('nexus_user_volumes', JSON.stringify(userVolumes));
  }, [userVolumes]);

  useEffect(() => {
    localStorage.setItem('nexus_local_muted', JSON.stringify(localMutedUsers));
  }, [localMutedUsers]);

  // Opt-in screen share viewing
  const watchScreen = useCallback((sharerId) => {
    setIsWatchingScreen(true);
    if (socket) socket.emit('screen:watch', { sharerId });
  }, [socket]);

  const unwatchScreen = useCallback((sharerId) => {
    setIsWatchingScreen(false);
    setIsScreenAudioMuted(false);
    setRemoteScreenStreams(prev => { const n = {...prev}; delete n[sharerId]; return n; });
    if (socket) socket.emit('screen:unwatch', { sharerId });
  }, [socket]);

  const toggleScreenAudioMute = useCallback(() => {
    setIsScreenAudioMuted(prev => !prev);
  }, []);

  // Callback to register audio elements for per-user control
  const registerAudioElement = useCallback((socketId, element) => {
    if (element) {
      audioElementsRef.current[socketId] = element;
      const volume = userVolumes[socketId] ?? 100;
      const muted = localMutedUsers[socketId] ?? false;
      // CRITICAL: Respect global deafen state
      element.muted = isDeafened || muted;
      applyVolume(socketId, volume);
    } else {
      // Clean up gain node
      const gn = gainNodesRef.current[socketId];
      if (gn) {
        try { gn.source.disconnect(); gn.gain.disconnect(); gn.ctx.close(); } catch {}
        delete gainNodesRef.current[socketId];
      }
      delete audioElementsRef.current[socketId];
    }
  }, [userVolumes, localMutedUsers, isDeafened, applyVolume]);

  // Memoize the return object to prevent creating new object on every render
  return useMemo(() => ({
    localStream, screenStream, remoteStreams, remoteScreenStreams,
    isMuted, isDeafened, isSharingScreen, isWatchingScreen, isScreenAudioMuted,
    currentVoiceChannel, activeSpeakers,
    voiceStatus, voiceQuality, voiceStatusMessage,
    mediaError, clearMediaError, retryJoinVoice,
    remoteUserStates, userVolumes, localMutedUsers,
    initExistingPeers, joinVoice, leaveVoice, reconnectVoice,
    toggleMute, toggleDeafen,
    startScreenShare, stopScreenShare,
    watchScreen, unwatchScreen, toggleScreenAudioMute,
    setUserVolume, toggleUserMute, registerAudioElement,
    updateAudioProcessing
  }), [
    localStream, screenStream, remoteStreams, remoteScreenStreams,
    isMuted, isDeafened, isSharingScreen, isWatchingScreen, isScreenAudioMuted,
    currentVoiceChannel, activeSpeakers,
    voiceStatus, voiceQuality, voiceStatusMessage,
    mediaError, clearMediaError, retryJoinVoice,
    remoteUserStates, userVolumes, localMutedUsers,
    initExistingPeers, joinVoice, leaveVoice, reconnectVoice,
    toggleMute, toggleDeafen,
    startScreenShare, stopScreenShare,
    watchScreen, unwatchScreen, toggleScreenAudioMute,
    setUserVolume, toggleUserMute, registerAudioElement,
    updateAudioProcessing
  ]);
}
