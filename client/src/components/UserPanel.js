import React from 'react';
import './UserPanel.css';
import { MicrophoneIcon, HeadphoneIcon, SettingsIcon, StatusDot } from './icons';

const UserPanel = React.memo(function UserPanel({ currentUser, voiceControls, onOpenSettings, onNavigateToVoice }) {
  if (!currentUser) return null;
  const { isMuted, isDeafened, toggleMute, toggleDeafen, leaveVoice, inVoice } = voiceControls || {};

  return (
    <div className="user-panel">
      {inVoice && (
        <div className="voice-status-bar" onClick={onNavigateToVoice} style={{cursor: onNavigateToVoice ? 'pointer' : 'default'}}>
          <span className="voice-status-dot"/>
          <span className="voice-status-text">Voice Connected</span>
          <button className="voice-disconnect-btn" onClick={(e) => { e.stopPropagation(); leaveVoice(); }} title="Disconnect">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.384 17.384L18.5 15.5C19.438 14.262 20 12.699 20 11c0-4.418-3.582-8-8-8S4 6.582 4 11c0 1.699.562 3.262 1.5 4.5L3.616 17.384A9.941 9.941 0 0 1 2 11C2 5.477 6.477 1 12 1s10 4.477 10 10a9.941 9.941 0 0 1-1.616 6.384zM12 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>
            </svg>
          </button>
        </div>
      )}
      <div className="user-info">
        <div className="user-avatar"
          style={{ background: currentUser.customAvatar ? 'transparent' : currentUser.color }}
          onClick={() => onOpenSettings?.('profile')} title="Edit profile">
          {currentUser.customAvatar
            ? <img src={currentUser.customAvatar} alt="" className="user-custom-avatar"/>
            : currentUser.avatar}
        </div>
        <div className="user-details">
          <div className="user-name" style={{ color: currentUser.color }}>{currentUser.username}</div>
          <div className={`user-status status-${currentUser.status || 'online'}`}>
            <StatusDot size={10} status={currentUser.status || 'online'} />
            {' '}{currentUser.status || 'online'}
          </div>
        </div>
        <div className="user-controls">
          <button
            className={`control-btn ${isMuted ? 'active-mute' : ''} ${!inVoice ? 'disabled' : ''}`}
            onClick={toggleMute}
            title={!inVoice ? 'Join voice to use' : (isMuted ? 'Unmute' : 'Mute')}
          >
            <MicrophoneIcon size={16} color="currentColor" muted={isMuted} />
          </button>
          <button
            className={`control-btn ${isDeafened ? 'active-mute' : ''} ${!inVoice ? 'disabled' : ''}`}
            onClick={toggleDeafen}
            title={!inVoice ? 'Join voice to use' : (isDeafened ? 'Undeafen' : 'Deafen')}
          >
            <HeadphoneIcon size={16} color="currentColor" deafened={isDeafened} />
          </button>
          <button className="control-btn" onClick={() => onOpenSettings?.('profile')} title="User Settings">
            <SettingsIcon size={16} color="currentColor" />
          </button>
        </div>
      </div>
    </div>
  );
});

export default UserPanel;
