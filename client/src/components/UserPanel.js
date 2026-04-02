import React from 'react';
import './UserPanel.css';
import { MicrophoneIcon, HeadphoneIcon, SettingsIcon, StatusDot, PhoneOffIcon } from './icons';

const UserPanel = React.memo(function UserPanel({ currentUser, voiceControls, onOpenSettings, onNavigateToVoice }) {
  if (!currentUser) return null;
  const { isMuted, isDeafened, toggleMute, toggleDeafen, leaveVoice, inVoice } = voiceControls || {};

  return (
    <div className="user-panel">
      {inVoice && (
        <div className="voice-status-bar" onClick={onNavigateToVoice} style={{cursor: onNavigateToVoice ? 'pointer' : 'default'}}>
          <span className="voice-status-dot"/>
          <span className="voice-status-text">Voice Connected</span>
          <button className="voice-disconnect-btn" onClick={(e) => { e.stopPropagation(); leaveVoice(); }} title="Disconnect" aria-label="Disconnect from voice">
            <PhoneOffIcon size={14} />
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
            aria-label={!inVoice ? 'Join voice to use' : (isMuted ? 'Unmute' : 'Mute')}
          >
            <MicrophoneIcon size={16} color="currentColor" muted={isMuted} />
          </button>
          <button
            className={`control-btn ${isDeafened ? 'active-mute' : ''} ${!inVoice ? 'disabled' : ''}`}
            onClick={toggleDeafen}
            title={!inVoice ? 'Join voice to use' : (isDeafened ? 'Undeafen' : 'Deafen')}
            aria-label={!inVoice ? 'Join voice to use' : (isDeafened ? 'Undeafen' : 'Deafen')}
          >
            <HeadphoneIcon size={16} color="currentColor" deafened={isDeafened} />
          </button>
          <button className="control-btn" onClick={() => onOpenSettings?.('profile')} title="User Settings" aria-label="User settings">
            <SettingsIcon size={16} color="currentColor" />
          </button>
        </div>
      </div>
    </div>
  );
});

export default UserPanel;
