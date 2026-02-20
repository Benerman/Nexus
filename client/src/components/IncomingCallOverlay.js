import React, { useEffect, useRef } from 'react';
import { PhoneIcon } from './icons';
import './IncomingCallOverlay.css';

function playRingSound(ctx) {
  try {
    const now = ctx.currentTime;
    // Two-tone ring: 440Hz then 520Hz, repeated
    for (let i = 0; i < 3; i++) {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.frequency.value = 440;
      osc2.frequency.value = 520;
      gain.gain.setValueAtTime(0.08, now + i * 1.2);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 1.2 + 0.8);

      osc1.start(now + i * 1.2);
      osc1.stop(now + i * 1.2 + 0.8);
      osc2.start(now + i * 1.2);
      osc2.stop(now + i * 1.2 + 0.8);
    }
  } catch (err) {
    console.warn('Ring sound failed:', err);
  }
}

const IncomingCallOverlay = React.memo(function IncomingCallOverlay({ caller, channelId, isGroup, onAccept, onDecline }) {
  const audioCtxRef = useRef(null);
  const ringIntervalRef = useRef(null);

  useEffect(() => {
    // Play ring sound on mount
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtxRef.current = ctx;
    playRingSound(ctx);

    // Repeat ring every 4 seconds
    ringIntervalRef.current = setInterval(() => {
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        playRingSound(audioCtxRef.current);
      }
    }, 4000);

    // Auto-decline after 30 seconds
    const timeout = setTimeout(() => {
      onDecline();
    }, 30000);

    return () => {
      clearInterval(ringIntervalRef.current);
      clearTimeout(timeout);
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        try { audioCtxRef.current.close(); } catch {}
      }
    };
  }, [onDecline]);

  return (
    <div className="incoming-call-overlay">
      <div className="incoming-call-card">
        <div className="incoming-call-pulse" />
        <div className="incoming-call-avatar" style={{ background: caller.color || '#3B82F6' }}>
          {caller.customAvatar
            ? <img src={caller.customAvatar} alt="" className="incoming-call-avatar-img" />
            : (caller.avatar || '👤')}
        </div>
        <div className="incoming-call-info">
          <div className="incoming-call-label">Incoming {isGroup ? 'Group ' : ''}Call</div>
          <div className="incoming-call-name">{caller.username}</div>
        </div>
        <div className="incoming-call-actions">
          <button className="incoming-call-btn accept" onClick={onAccept} title="Accept">
            <PhoneIcon size={20} />
          </button>
          <button className="incoming-call-btn decline" onClick={onDecline} title="Decline">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.384 17.384L18.5 15.5C19.438 14.262 20 12.699 20 11c0-4.418-3.582-8-8-8S4 6.582 4 11c0 1.699.562 3.262 1.5 4.5L3.616 17.384A9.941 9.941 0 0 1 2 11C2 5.477 6.477 1 12 1s10 4.477 10 10a9.941 9.941 0 0 1-1.616 6.384zM12 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
});

export default IncomingCallOverlay;
