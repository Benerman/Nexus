import React, { useEffect, useRef } from 'react';
import { PhoneIcon, PhoneOffIcon } from './icons';
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
            <PhoneOffIcon size={20} />
          </button>
        </div>
      </div>
    </div>
  );
});

export default IncomingCallOverlay;
