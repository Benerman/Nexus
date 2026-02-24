import React, { useState, useEffect, useRef } from 'react';
import WebhookDocs from './WebhookDocs';
import { emitWithTimeout, emitWithLoadingTimeout, TIMEOUT_MSG } from '../utils/socketTimeout';
import { getServerUrl, isStandaloneApp, isTauriApp, isCapacitorApp, openExternalUrl } from '../config';
import { checkForUpdates } from '../utils/updater';
import { checkForCapacitorUpdate } from '../utils/capacitor-updater';
import './SettingsModal.css';
import { UserIcon, SettingsIcon, HexagonIcon, LinkIcon, VolumeIcon, FriendsIcon, BellIcon, SoundboardIcon, EmojiIcon } from './icons';

const AVATARS=['🐺','🦊','🐱','🐸','🦁','🐙','🦄','🐧','🦅','🐉','🦋','🐻','🦈','🐊','🦖','🦩','🦚','🦜','🐬'];
const COLORS=['#3B82F6','#57F287','#FEE75C','#EB459E','#ED4245','#60A5FA','#3ba55c','#faa61a','#00b0f4','#e91e63','#9c27b0','#ff5722'];

// Parse color from various formats (hex, rgb, hsl) into hex
function parseColorInput(input) {
  if (!input) return null;
  const s = input.trim();
  // Already hex
  if (/^#[0-9a-fA-F]{3,8}$/.test(s)) {
    if (s.length === 4) return '#' + s[1]+s[1]+s[2]+s[2]+s[3]+s[3];
    return s.slice(0,7);
  }
  // Hex without #
  if (/^[0-9a-fA-F]{6}$/.test(s)) return '#' + s;
  if (/^[0-9a-fA-F]{3}$/.test(s)) return '#' + s[0]+s[0]+s[1]+s[1]+s[2]+s[2];
  // rgb(r, g, b) or r, g, b
  const rgbMatch = s.match(/^(?:rgb\s*\(\s*)?(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*\)?$/i);
  if (rgbMatch) {
    const [,r,g,b] = rgbMatch.map(Number);
    if (r <= 255 && g <= 255 && b <= 255) {
      return '#' + [r,g,b].map(c => c.toString(16).padStart(2,'0')).join('');
    }
  }
  // hsl(h, s%, l%)
  const hslMatch = s.match(/^(?:hsl\s*\(\s*)?(\d{1,3})\s*[,\s]\s*(\d{1,3})%?\s*[,\s]\s*(\d{1,3})%?\s*\)?$/i);
  if (hslMatch) {
    const h = Number(hslMatch[1]) / 360;
    const sat = Number(hslMatch[2]) / 100;
    const l = Number(hslMatch[3]) / 100;
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    let r, g, b;
    if (sat === 0) { r = g = b = l; }
    else {
      const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1/3);
    }
    return '#' + [r,g,b].map(c => Math.round(c * 255).toString(16).padStart(2,'0')).join('');
  }
  return null;
}

// Channel type icons
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

// Generate initials from server name (first letter of each word, max 3 letters)
const getServerInitials = (name) => {
  if (!name || !name.trim()) return 'S';
  const words = name.trim().split(/\s+/);
  if (words.length === 1) {
    // Single word: take first 1-2 characters
    return words[0].substring(0, 2).toUpperCase();
  }
  // Multiple words: take first letter of each word (max 3)
  return words
    .slice(0, 3)
    .map(w => w[0])
    .join('')
    .toUpperCase();
};

const PERM_LABELS = {
  viewChannels:'View Channels', sendMessages:'Send Messages', readHistory:'Read History',
  attachFiles:'Attach Files / Media', addReactions:'Add Reactions', joinVoice:'Join Voice',
  mentionEveryone:'Mention @everyone', manageMessages:'Manage Messages',
  manageChannels:'Manage Channels', manageServer:'Manage Server',
  manageWebhooks:'Manage Webhooks', manageEmojis:'Manage Emojis',
  kickMembers:'Kick Members',
  createInvite:'Create Invites', sendTargetedSounds:'Send Targeted Sounds',
  admin:'Administrator'
};

const CH_PERM_LABELS = {
  viewChannel:'View Channel', sendMessages:'Send Messages',
  attachFiles:'Attach Files / Media', joinVoice:'Join Voice',
  readHistory:'📜 Read History', addReactions:'😊 Add Reactions',
  mentionEveryone:'Mention Everyone', manageMessages:'Manage Messages'
};

async function fileToDataURL(file) {
  return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); });
}

function AvatarUpload({ current, onUpload, label }) {
  const ref = useRef(null);
  const handle = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await fileToDataURL(file);
    onUpload(url);
  };
  return (
    <div className="avatar-upload-wrap">
      <div className="avatar-upload-preview" onClick={()=>ref.current?.click()}
        style={{ background: current ? 'transparent' : 'var(--bg-tertiary)' }}
        title="Click to upload image">
        {current
          ? <img src={current} alt="avatar" className="avatar-upload-img"/>
          : <span style={{fontSize:28, color:'var(--text-muted)'}}>📷</span>}
        <div className="avatar-upload-overlay">Change</div>
      </div>
      <div className="avatar-upload-info">
        <strong>{label || 'Upload Image'}</strong>
        <p>PNG, JPG, GIF — max display size 128×128</p>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:6}}>
          <button className="settings-btn" style={{marginTop:0,padding:'4px 12px',fontSize:12}}
            onClick={()=>ref.current?.click()}>Upload</button>
          {current && <button className="settings-btn danger-sm" onClick={()=>onUpload(null)}>Remove</button>}
        </div>
      </div>
      <input ref={ref} type="file" accept="image/*" style={{display:'none'}} onChange={handle}/>
    </div>
  );
}

function DraggableItem({ item, index, onDragStart, onDragOver, onDrop, children }) {
  return (
    <div className="draggable-item"
      draggable
      onDragStart={()=>onDragStart(index)}
      onDragOver={e=>{e.preventDefault();onDragOver(index);}}
      onDrop={()=>onDrop(index)}>
      <span className="drag-handle">⠿</span>
      {children}
    </div>
  );
}

// ── Server list item with invite link creation ──
function ServerListItemWithInvite({ srv, socket }) {
  const [showInvite, setShowInvite] = useState(false);
  const [inviteLink, setInviteLink] = useState(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [copied, setCopied] = useState(false);
  const inviteTimeoutRef = useRef(null);
  const isPersonal = srv.isPersonal || srv.id?.startsWith('personal:');

  useEffect(() => {
    if (!socket || !showInvite) return;
    const handleCreated = ({ invite }) => {
      clearTimeout(inviteTimeoutRef.current);
      setInviteLoading(false);
      setInviteLink(invite.url || invite.id);
    };
    socket.on('invite:created', handleCreated);
    return () => socket.off('invite:created', handleCreated);
  }, [socket, showInvite]);

  const createInvite = () => {
    if (!socket) return;
    setInviteLoading(true);
    setInviteError('');
    inviteTimeoutRef.current = emitWithLoadingTimeout(socket, 'invite:create',
      { serverId: srv.id, maxUses: 0, expiresInMs: 7 * 24 * 60 * 60 * 1000 },
      { onTimeout: () => { setInviteLoading(false); setInviteError(TIMEOUT_MSG); } }
    );
  };

  const copyLink = () => {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  return (
    <div className="server-list-item-wrap">
      <div className="server-list-item">
        <div className="server-list-icon" style={{background:srv.customIcon?'transparent':'var(--bg-tertiary)'}}>
          {srv.customIcon ? <img src={srv.customIcon} alt="" className="avatar-upload-img"/> : srv.icon}
        </div>
        <span className="server-list-name">{srv.name}</span>
        <span className="server-list-members">{srv.memberCount||0} members</span>
        {!isPersonal && (
          <button
            className="settings-btn-small"
            onClick={() => { setShowInvite(!showInvite); setInviteLink(null); setCopied(false); }}
            title="Create Invite Link"
          >
            {showInvite ? 'Hide' : 'Invite'}
          </button>
        )}
      </div>
      {showInvite && (
        <div className="server-invite-section">
          {inviteLink ? (
            <div className="server-invite-row">
              <input className="settings-input settings-invite-link" value={inviteLink} readOnly onClick={e => e.target.select()} />
              <button className={`settings-btn-small ${copied ? 'copied' : ''}`} onClick={copyLink}>
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          ) : (
            <button className="settings-btn-small primary" onClick={createInvite} disabled={inviteLoading}>
              {inviteLoading ? 'Generating...' : 'Generate Invite Link (7 days)'}
            </button>
          )}
          {inviteLink && <p className="settings-hint">Expires in 7 days. Recipients must log in or register to join.</p>}
          {inviteError && <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 6 }}>{inviteError}</p>}
        </div>
      )}
    </div>
  );
}

// ── Join a server section ──
function JoinServerSection({ socket }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const joinTimeoutRef = useRef(null);

  useEffect(() => {
    if (!socket) return;
    const handleJoined = () => { clearTimeout(joinTimeoutRef.current); setLoading(false); setSuccess(true); setCode(''); setTimeout(() => setSuccess(false), 3000); };
    const handleError = ({ message }) => { clearTimeout(joinTimeoutRef.current); setLoading(false); setError(message); };
    socket.on('invite:joined', handleJoined);
    socket.on('error', handleError);
    return () => { socket.off('invite:joined', handleJoined); socket.off('error', handleError); };
  }, [socket]);

  const joinServer = () => {
    if (!socket || !code.trim()) return;
    setLoading(true);
    setError('');
    const inviteCode = code.trim().split('/').pop();
    joinTimeoutRef.current = emitWithLoadingTimeout(socket, 'invite:use', { inviteCode },
      { onTimeout: () => { setLoading(false); setError(TIMEOUT_MSG); } }
    );
  };

  return (
    <div>
      <p className="settings-hint" style={{ marginBottom: 8 }}>Paste an invite link or code to join another server.</p>
      <div className="server-invite-row">
        <input
          className="settings-input"
          placeholder="Invite link or code"
          value={code}
          onChange={e => { setCode(e.target.value); setError(''); }}
          onKeyDown={e => e.key === 'Enter' && joinServer()}
          style={{ flex: 1 }}
        />
        <button className="settings-btn-small primary" onClick={joinServer} disabled={loading || !code.trim()}>
          {loading ? 'Joining...' : 'Join'}
        </button>
      </div>
      {error && <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 6 }}>{error}</p>}
      {success && <p style={{ color: 'var(--green)', fontSize: 13, marginTop: 6 }}>Joined server successfully!</p>}
    </div>
  );
}

// Sidebar with scroll-fade indicators for mobile
function SettingsSidebar({ tabs, tab, setTab }) {
  const wrapRef = useRef(null);
  const sidebarRef = useRef(null);
  const [scrollClass, setScrollClass] = useState('');

  useEffect(() => {
    const el = sidebarRef.current;
    if (!el) return;
    const update = () => {
      const canLeft = el.scrollLeft > 4;
      const canRight = el.scrollLeft < el.scrollWidth - el.clientWidth - 4;
      setScrollClass(
        (canLeft ? 'can-scroll-left' : '') + ' ' + (canRight ? 'can-scroll-right' : '')
      );
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => { el.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, [tabs]);

  return (
    <div ref={wrapRef} className={`settings-sidebar-wrap ${scrollClass}`}>
      <div className="settings-sidebar" ref={sidebarRef}>
        <div className="settings-sidebar-title">
          <SettingsIcon size={16} color="currentColor" style={{marginRight: '8px', display: 'inline-block', verticalAlign: 'middle'}} />
          SETTINGS
        </div>
        {tabs.map(t=>(
          <button key={t.id} className={`settings-tab ${tab===t.id?'active':''}`} onClick={()=>setTab(t.id)}>
            {t.icon && <span className="tab-icon">{t.icon}</span>}
            {t.label}
          </button>
        ))}
        <div className="settings-sidebar-spacer" style={{flex:1}}/>
      </div>
    </div>
  );
}

export default function SettingsModal({ initialTab, currentUser, server, servers, socket, onlineUsers = [], onClose, friends = [], updateAudioProcessing, onLogout, onDeleteAccount, onChangeServer, developerMode, onSetDeveloperMode }) {
  const [tab, setTabRaw] = useState(initialTab || localStorage.getItem('nexus_settings_last_tab') || 'profile');
  const setTab = (t) => { setTabRaw(t); localStorage.setItem('nexus_settings_last_tab', t); };
  const [profileSaved, setProfileSaved] = useState(false);
  const [serverSaved, setServerSaved] = useState(false);
  const [serverCreated, setServerCreated] = useState(false);
  const [channelSaved, setChannelSaved] = useState(false);
  const [channelCreated, setChannelCreated] = useState(false);
  const [categorySaved, setCategorySaved] = useState(false);
  const [roleSaved, setRoleSaved] = useState(false);
  const [roleCreated, setRoleCreated] = useState(false);
  const [webhookCreated, setWebhookCreated] = useState(false);

  // Friends state
  const [friendsList, setFriendsList] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [newFriendUsername, setNewFriendUsername] = useState('');

  // Profile
  const [username, setUsername] = useState(currentUser?.username||'');
  const [avatar, setAvatar] = useState(currentUser?.avatar||'🐺');
  const [customAvatar, setCustomAvatar] = useState(currentUser?.customAvatar||null);
  const [color, setColor] = useState(currentUser?.color||'#3B82F6');
  const [bio, setBio] = useState(currentUser?.bio||'');
  const [status, setStatus] = useState(currentUser?.status||'online');

  // Password change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const passwordTimeoutRef = useRef(null);

  // Delete account
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deleteConfirmUsername, setDeleteConfirmUsername] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Local action error (shown inside modal)
  const [actionError, setActionError] = useState(null);
  const showActionError = (msg) => { setActionError(msg); setTimeout(() => setActionError(null), 5000); };

  // Server
  const [serverName, setServerName] = useState(server?.name||'');
  const [serverCustomIcon, setServerCustomIcon] = useState(server?.customIcon||null);
  const [serverDesc, setServerDesc] = useState(server?.description||'');

  // New server
  const [newServerName, setNewServerName] = useState('');
  const [newServerCustomIcon, setNewServerCustomIcon] = useState(null);

  // Channels
  const [editingChannel, setEditingChannel] = useState(null);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelType, setNewChannelType] = useState('text');
  const [newChannelDescription, setNewChannelDescription] = useState('');
  const [newChannelCategory, setNewChannelCategory] = useState('');
  const [newChannelPrivate, setNewChannelPrivate] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [creationType, setCreationType] = useState('category'); // 'category', 'text', 'voice'
  const [chPermTarget, setChPermTarget] = useState('role:everyone');
  const [dragIdx, setDragIdx] = useState(null);

  // Roles
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleColor, setNewRoleColor] = useState('#3B82F6');
  const [editingRole, setEditingRole] = useState(null);

  // Members
  const [memberSearch, setMemberSearch] = useState('');

  // Server Management
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showTransferConfirm, setShowTransferConfirm] = useState(false);
  const [transferTargetId, setTransferTargetId] = useState('');

  // Collapsible sections
  const [audioAdvancedOpen, setAudioAdvancedOpen] = useState(false);
  const [yourServersOpen, setYourServersOpen] = useState(true);
  const [dangerZoneOpen, setDangerZoneOpen] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState({});
  const [reAuthPassword, setReAuthPassword] = useState('');
  const [reAuthTarget, setReAuthTarget] = useState(null); // 'delete' or 'transfer'
  const [reAuthError, setReAuthError] = useState('');
  const [customColorInput, setCustomColorInput] = useState('');
  const [customRoleColorInput, setCustomRoleColorInput] = useState('');

  // Webhooks
  const [newWebhookName, setNewWebhookName] = useState('');
  const [selectedWebhookCh, setSelectedWebhookCh] = useState('');
  const [createdWebhook, setCreatedWebhook] = useState(null);
  const [showWebhookDocs, setShowWebhookDocs] = useState(false);

  // Soundboard
  const [soundboardSounds, setSoundboardSounds] = useState([]);
  const [soundboardLoading, setSoundboardLoading] = useState(false);
  const [soundboardEditing, setSoundboardEditing] = useState(null); // null or sound object
  const [soundboardForm, setSoundboardForm] = useState({ name: '', emoji: '🔊', file: null });
  const [soundboardAudioBuffer, setSoundboardAudioBuffer] = useState(null);
  const [soundboardTrimStart, setSoundboardTrimStart] = useState(0);
  const [soundboardTrimEnd, setSoundboardTrimEnd] = useState(0);
  const [soundboardDuration, setSoundboardDuration] = useState(0);
  const [soundboardPreviewing, setSoundboardPreviewing] = useState(false);
  const [soundboardVolume, setSoundboardVolume] = useState(100);
  const [soundboardIsGlobal, setSoundboardIsGlobal] = useState(false);
  const [soundboardSaving, setSoundboardSaving] = useState(false);
  const [soundboardManagePage, setSoundboardManagePage] = useState('all');
  const soundboardCanvasRef = useRef(null);
  const soundboardAudioCtxRef = useRef(null);
  const soundboardPreviewSourceRef = useRef(null);
  const soundboardFileRef = useRef(null);

  // Moderation
  const [modSection, setModSection] = useState('bans');
  const [modBans, setModBans] = useState([]);
  const [modTimeouts, setModTimeouts] = useState([]);
  const [modReports, setModReports] = useState([]);
  const [modLoading, setModLoading] = useState(false);
  const [modSearch, setModSearch] = useState('');

  // Platform Admin
  const [adminSection, setAdminSection] = useState('servers');
  const [adminServers, setAdminServers] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminOrphanedStats, setAdminOrphanedStats] = useState(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminSearch, setAdminSearch] = useState('');

  // Voice Channel Sounds (intro/exit)
  const [voiceSounds, setVoiceSounds] = useState(null); // { intro_sound, exit_sound, ... }
  const [voiceSoundsLoaded, setVoiceSoundsLoaded] = useState(false);
  const [voiceSoundEditing, setVoiceSoundEditing] = useState(null); // 'intro' or 'exit'
  const [voiceSoundAudioBuffer, setVoiceSoundAudioBuffer] = useState(null);
  const [voiceSoundTrimStart, setVoiceSoundTrimStart] = useState(0);
  const [voiceSoundTrimEnd, setVoiceSoundTrimEnd] = useState(0);
  const [voiceSoundDuration, setVoiceSoundDuration] = useState(0);
  const [voiceSoundPreviewing, setVoiceSoundPreviewing] = useState(false);
  const [voiceSoundSaving, setVoiceSoundSaving] = useState(false);
  const [voiceSoundVolume, setVoiceSoundVolume] = useState(100);
  const voiceSoundCanvasRef = useRef(null);
  const voiceSoundPreviewSourceRef = useRef(null);

  // Custom Emojis
  const [emojiList, setEmojiList] = useState([]);
  const [emojiLoading, setEmojiLoading] = useState(false);
  const [emojiEditing, setEmojiEditing] = useState(null);
  const [emojiForm, setEmojiForm] = useState({ name: '', file: null, preview: null });
  const [emojiSaving, setEmojiSaving] = useState(false);
  const [emojiSharing, setEmojiSharing] = useState(server?.emojiSharing || false);
  const emojiFileRef = useRef(null);

  // ICE / STUN/TURN config (owner-only)
  const [iceConfigOpen, setIceConfigOpen] = useState(false);
  const [iceConfigLoaded, setIceConfigLoaded] = useState(false);
  const [useCustomIce, setUseCustomIce] = useState(false);
  const [iceStunUrls, setIceStunUrls] = useState('');
  const [iceTurnUrl, setIceTurnUrl] = useState('');
  const [iceTurnSecret, setIceTurnSecret] = useState('');
  const [iceSaving, setIceSaving] = useState(false);
  const [iceSaved, setIceSaved] = useState(false);

  // About / Updates
  const [updateStatus, setUpdateStatus] = useState('');
  const [updateInfo, setUpdateInfo] = useState(null);
  const [updateChecking, setUpdateChecking] = useState(false);

  // Audio
  const [audioInputDevices, setAudioInputDevices] = useState([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState([]);
  const [selectedInputDevice, setSelectedInputDevice] = useState('default');
  const [selectedOutputDevice, setSelectedOutputDevice] = useState('default');
  const [inputVolume, setInputVolume] = useState(100);
  const [outputVolume, setOutputVolume] = useState(100);

  // Audio processing settings
  const [noiseSuppressionEnabled, setNoiseSuppressionEnabled] = useState(() => localStorage.getItem('nexus_noise_suppression') === 'true');
  const [echoCancellationEnabled, setEchoCancellationEnabled] = useState(() => localStorage.getItem('nexus_echo_cancellation') === 'true');
  const [noiseGateEnabled, setNoiseGateEnabled] = useState(() => localStorage.getItem('nexus_noise_gate_enabled') !== 'false');
  const [noiseGateThreshold, setNoiseGateThreshold] = useState(() => parseFloat(localStorage.getItem('nexus_noise_gate_threshold')) || -50);
  const [autoGainEnabled, setAutoGainEnabled] = useState(() => localStorage.getItem('nexus_auto_gain_enabled') === 'true');
  const [autoGainTarget, setAutoGainTarget] = useState(() => parseFloat(localStorage.getItem('nexus_auto_gain_target')) || -20);

  // Mic test meter
  const [micTesting, setMicTesting] = useState(false);
  const [micLevel, setMicLevel] = useState(-100); // dBFS
  const micTestStreamRef = useRef(null);
  const micTestCtxRef = useRef(null);
  const micTestAnimRef = useRef(null);

  useEffect(() => {
    if (!socket) return;
    const h = ({webhook})=>setCreatedWebhook(webhook);
    socket.on('webhook:created', h);
    const handlePasswordChanged = ({ success, error }) => {
      clearTimeout(passwordTimeoutRef.current);
      setPasswordLoading(false);
      if (success) {
        setPasswordSuccess(true);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
        setPasswordError('');
        setTimeout(() => setPasswordSuccess(false), 3000);
      } else {
        setPasswordError(error || 'Failed to change password');
      }
    };
    socket.on('user:password-changed', handlePasswordChanged);
    return () => { socket.off('webhook:created', h); socket.off('user:password-changed', handlePasswordChanged); };
  }, [socket]);

  // Check ownership early (needed by ICE config effect below)
  const isOwner = server?.ownerId === currentUser?.id;

  // Load ICE config when owner opens Voice/WebRTC section
  useEffect(() => {
    if (!iceConfigOpen || iceConfigLoaded || !isOwner || !socket || !server) return;
    socket.emit('server:get-ice-config', { serverId: server.id }, (result) => {
      setIceConfigLoaded(true);
      if (result?.iceConfig) {
        setUseCustomIce(true);
        setIceStunUrls((result.iceConfig.stunUrls || []).join('\n'));
        setIceTurnUrl(result.iceConfig.turnUrl || '');
        // Secret is masked — show placeholder indicator if set
        if (result.iceConfig.hasSecret) {
          setIceTurnSecret('********');
        }
      }
    });
  }, [iceConfigOpen, iceConfigLoaded, isOwner, socket, server]);

  // Load friends list when Friends tab opens
  useEffect(() => {
    if (!socket || tab !== 'friends') return;
    socket.emit('friend:list');

    const handleFriendList = ({ friends, pending }) => {
      setFriendsList(friends || []);
      setPendingRequests(pending || []);
    };

    socket.on('friend:list', handleFriendList);
    return () => socket.off('friend:list', handleFriendList);
  }, [socket, tab]);

  // Sync current audio settings to server
  const syncSettingsToServer = () => {
    if (!socket) return;
    const settings = {
      audio_input: localStorage.getItem('nexus_audio_input') || 'default',
      audio_input_volume: localStorage.getItem('nexus_audio_input_volume') || '100',
      audio_output: localStorage.getItem('nexus_audio_output') || 'default',
      audio_output_volume: localStorage.getItem('nexus_audio_output_volume') || '100',
      noise_gate_enabled: localStorage.getItem('nexus_noise_gate_enabled') || 'true',
      noise_gate_threshold: localStorage.getItem('nexus_noise_gate_threshold') || '-50',
      auto_gain_enabled: localStorage.getItem('nexus_auto_gain_enabled') || 'false',
      auto_gain_target: localStorage.getItem('nexus_auto_gain_target') || '-20',
    };
    socket.emit('user:settings-update', { settings });
  };

  // ── Soundboard helpers ──
  const getSoundboardAudioCtx = () => {
    if (!soundboardAudioCtxRef.current || soundboardAudioCtxRef.current.state === 'closed') {
      soundboardAudioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    return soundboardAudioCtxRef.current;
  };

  const drawWaveform = (canvas, audioBuffer, trimStart, trimEnd) => {
    if (!canvas || !audioBuffer) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.offsetWidth * 2;
    const h = canvas.height = canvas.offsetHeight * 2;
    ctx.clearRect(0, 0, w, h);

    const data = audioBuffer.getChannelData(0);
    const dur = audioBuffer.duration;
    const step = Math.max(1, Math.floor(data.length / w));

    // Draw full waveform (dimmed)
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    for (let i = 0; i < w; i++) {
      const idx = Math.floor(i * data.length / w);
      let max = 0;
      for (let j = 0; j < step; j++) {
        const val = Math.abs(data[idx + j] || 0);
        if (val > max) max = val;
      }
      const barH = max * h * 0.8;
      ctx.fillRect(i, (h - barH) / 2, 1, barH || 1);
    }

    // Draw trim region (highlighted)
    const startX = (trimStart / dur) * w;
    const endX = (trimEnd / dur) * w;
    ctx.fillStyle = 'rgba(59, 130, 246, 0.3)';
    ctx.fillRect(startX, 0, endX - startX, h);

    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    for (let i = Math.floor(startX); i < Math.ceil(endX); i++) {
      const idx = Math.floor(i * data.length / w);
      let max = 0;
      for (let j = 0; j < step; j++) {
        const val = Math.abs(data[idx + j] || 0);
        if (val > max) max = val;
      }
      const barH = max * h * 0.8;
      ctx.fillRect(i, (h - barH) / 2, 1, barH || 1);
    }

    // Trim markers
    ctx.fillStyle = '#3B82F6';
    ctx.fillRect(startX - 1, 0, 3, h);
    ctx.fillRect(endX - 1, 0, 3, h);
  };

  const renderTrimmedAudio = async (audioBuffer, trimStart, trimEnd) => {
    const sr = audioBuffer.sampleRate;
    const startSample = Math.floor(trimStart * sr);
    const endSample = Math.floor(trimEnd * sr);
    const length = endSample - startSample;
    const offline = new OfflineAudioContext(audioBuffer.numberOfChannels, length, sr);
    const source = offline.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offline.destination);
    source.start(0, trimStart, trimEnd - trimStart);
    return await offline.startRendering();
  };

  const audioBufferToWavBase64 = (audioBuffer) => {
    const numCh = audioBuffer.numberOfChannels;
    const sr = audioBuffer.sampleRate;
    const length = audioBuffer.length;
    const buffer = new ArrayBuffer(44 + length * numCh * 2);
    const view = new DataView(buffer);

    const writeString = (offset, str) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * numCh * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numCh, true);
    view.setUint32(24, sr, true);
    view.setUint32(28, sr * numCh * 2, true);
    view.setUint16(32, numCh * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length * numCh * 2, true);

    const channels = [];
    for (let c = 0; c < numCh; c++) channels.push(audioBuffer.getChannelData(c));

    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let c = 0; c < numCh; c++) {
        const sample = Math.max(-1, Math.min(1, channels[c][i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }

    const blob = new Blob([buffer], { type: 'audio/wav' });
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  };

  // ── Moderation helpers ──────────────────────────────────────────────────
  const loadModData = () => {
    if (!socket || !server) return;
    setModLoading(true);
    let pending = 3;
    const done = () => { pending--; if (pending <= 0) setModLoading(false); };
    emitWithTimeout(socket, 'moderation:get-bans', { serverId: server.id }, (r) => {
      if (r?.bans) setModBans(r.bans);
      done();
    });
    emitWithTimeout(socket, 'moderation:get-timeouts', { serverId: server.id }, (r) => {
      if (r?.timeouts) setModTimeouts(r.timeouts);
      done();
    });
    emitWithTimeout(socket, 'moderation:get-reports', { serverId: server.id }, (r) => {
      if (r?.reports) setModReports(r.reports);
      done();
    });
  };

  const handleUnban = (userId) => {
    if (!socket || !server) return;
    emitWithTimeout(socket, 'server:unban-user', { serverId: server.id, userId }, (r) => {
      if (r?.error) { showActionError(r.error); return; }
      setModBans(prev => prev.filter(b => b.user_id !== userId));
    });
  };

  const handleRemoveTimeout = (userId) => {
    if (!socket || !server) return;
    emitWithTimeout(socket, 'server:remove-timeout', { serverId: server.id, userId }, (r) => {
      if (r?.error) { showActionError(r.error); return; }
      setModTimeouts(prev => prev.filter(t => t.user_id !== userId));
    });
  };

  const handleUpdateReport = (reportId, newStatus) => {
    if (!socket) return;
    emitWithTimeout(socket, 'moderation:update-report', { reportId, status: newStatus }, (r) => {
      if (r?.error) { showActionError(r.error); return; }
      setModReports(prev => prev.map(rp => rp.id === reportId ? { ...rp, status: newStatus, resolved_at: new Date().toISOString() } : rp));
    });
  };

  // ── Platform Admin helpers ─────────────────────────────────────────────
  const loadAdminData = () => {
    if (!socket) return;
    setAdminLoading(true);
    let pending = 3;
    const done = () => { pending--; if (pending <= 0) setAdminLoading(false); };
    emitWithTimeout(socket, 'admin:get-servers', {}, (r) => {
      if (r?.servers) setAdminServers(r.servers);
      done();
    });
    emitWithTimeout(socket, 'admin:get-users', {}, (r) => {
      if (r?.users) setAdminUsers(r.users);
      done();
    });
    emitWithTimeout(socket, 'admin:get-orphaned-stats', {}, (r) => {
      if (r?.stats) setAdminOrphanedStats(r.stats);
      done();
    });
  };

  const handleAdminDeleteServer = (serverId, serverName) => {
    if (!socket) return;
    if (!window.confirm(`Delete server "${serverName}"? This cannot be undone.`)) return;
    emitWithTimeout(socket, 'admin:delete-server', { serverId }, (r) => {
      if (r?.error) { showActionError(r.error); return; }
      setAdminServers(prev => prev.filter(s => s.id !== serverId));
      loadAdminData();
    });
  };

  const handleAdminDeleteUser = (userId, username) => {
    if (!socket) return;
    if (!window.confirm(`Delete user "${username}"? Their servers will be transferred or deleted. This cannot be undone.`)) return;
    emitWithTimeout(socket, 'admin:delete-user', { userId }, (r) => {
      if (r?.error) { showActionError(r.error); return; }
      setAdminUsers(prev => prev.filter(u => u.id !== userId));
      loadAdminData();
    });
  };

  const handleCleanupEmptyDMs = () => {
    if (!socket) return;
    emitWithTimeout(socket, 'admin:cleanup-empty-dms', {}, (r) => {
      if (r?.error) { showActionError(r.error); return; }
      loadAdminData();
    });
  };

  const handleAssignOwnerlessServers = () => {
    if (!socket) return;
    emitWithTimeout(socket, 'admin:assign-ownerless-servers', {}, (r) => {
      if (r?.error) { showActionError(r.error); return; }
      loadAdminData();
    });
  };

  const loadSoundboardSounds = () => {
    if (!socket || !server) return;
    setSoundboardLoading(true);
    emitWithTimeout(socket, 'soundboard:get-sounds', { serverId: server.id }, (response) => {
      setSoundboardLoading(false);
      if (response?.error) { showActionError(response.error); return; }
      if (response?.sounds) {
        setSoundboardSounds(response.sounds);
      }
    });
  };

  const handleSoundboardFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const ctx = getSoundboardAudioCtx();
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      setSoundboardAudioBuffer(audioBuffer);
      setSoundboardDuration(audioBuffer.duration);
      setSoundboardTrimStart(0);
      setSoundboardTrimEnd(Math.min(audioBuffer.duration, 8));
    } catch (err) {
      console.error('Failed to decode audio:', err);
    }
  };

  const previewSoundboardTrim = () => {
    if (!soundboardAudioBuffer) return;
    // Stop any existing preview
    if (soundboardPreviewSourceRef.current) {
      try { soundboardPreviewSourceRef.current.stop(); } catch {}
    }
    const ctx = getSoundboardAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const source = ctx.createBufferSource();
    source.buffer = soundboardAudioBuffer;
    source.connect(ctx.destination);
    source.start(0, soundboardTrimStart, soundboardTrimEnd - soundboardTrimStart);
    source.onended = () => setSoundboardPreviewing(false);
    soundboardPreviewSourceRef.current = source;
    setSoundboardPreviewing(true);
  };

  const stopSoundboardPreview = () => {
    if (soundboardPreviewSourceRef.current) {
      try { soundboardPreviewSourceRef.current.stop(); } catch {}
      soundboardPreviewSourceRef.current = null;
    }
    setSoundboardPreviewing(false);
  };

  const saveSoundboardSound = async () => {
    if (!soundboardForm.name.trim() || !socket || !server) return;

    // Metadata-only update (no new audio loaded)
    if (soundboardEditing && !soundboardAudioBuffer) {
      setSoundboardSaving(true);
      emitWithTimeout(socket, 'soundboard:update', {
        serverId: server.id,
        soundId: soundboardEditing.id,
        name: soundboardForm.name.slice(0, 32),
        emoji: soundboardForm.emoji || '🔊',
        volume: soundboardVolume / 100,
        isGlobal: soundboardIsGlobal
      }, (response) => {
        setSoundboardSaving(false);
        if (response?.error) { showActionError(response.error); return; }
        resetSoundboardForm();
        loadSoundboardSounds();
      });
      return;
    }

    if (!soundboardAudioBuffer) return;
    const trimDuration = soundboardTrimEnd - soundboardTrimStart;
    if (trimDuration > 8 || trimDuration < 0.1) return;

    setSoundboardSaving(true);
    try {
      const trimmedBuffer = await renderTrimmedAudio(soundboardAudioBuffer, soundboardTrimStart, soundboardTrimEnd);
      const trimmedBase64 = await audioBufferToWavBase64(trimmedBuffer);

      if (soundboardEditing) {
        emitWithTimeout(socket, 'soundboard:update', {
          serverId: server.id,
          soundId: soundboardEditing.id,
          name: soundboardForm.name.slice(0, 32),
          emoji: soundboardForm.emoji || '🔊',
          trimmedAudio: trimmedBase64,
          trimStart: soundboardTrimStart,
          trimEnd: soundboardTrimEnd,
          duration: trimDuration,
          volume: soundboardVolume / 100,
          isGlobal: soundboardIsGlobal
        }, (response) => {
          setSoundboardSaving(false);
          if (response?.error) { showActionError(response.error); return; }
          resetSoundboardForm();
          loadSoundboardSounds();
        });
      } else {
        // New sound — also store original audio
        const originalBase64 = await audioBufferToWavBase64(soundboardAudioBuffer);
        emitWithTimeout(socket, 'soundboard:upload', {
          serverId: server.id,
          name: soundboardForm.name.slice(0, 32),
          emoji: soundboardForm.emoji || '🔊',
          originalAudio: originalBase64,
          trimmedAudio: trimmedBase64,
          trimStart: soundboardTrimStart,
          trimEnd: soundboardTrimEnd,
          duration: trimDuration,
          volume: soundboardVolume / 100,
          isGlobal: soundboardIsGlobal
        }, (response) => {
          setSoundboardSaving(false);
          if (response?.error) { showActionError(response.error); return; }
          resetSoundboardForm();
          loadSoundboardSounds();
        });
      }
    } catch (err) {
      console.error('Failed to save sound:', err);
      setSoundboardSaving(false);
    }
  };

  const deleteSoundboardSound = (soundId) => {
    if (!socket || !server) return;
    emitWithTimeout(socket, 'soundboard:delete', { serverId: server.id, soundId }, (response) => {
      if (response?.error) { showActionError(response.error); return; }
      loadSoundboardSounds();
    });
  };

  const editSoundboardSound = async (sound) => {
    setSoundboardEditing(sound);
    setSoundboardForm({ name: sound.name, emoji: sound.emoji || '🔊', file: null });
    setSoundboardVolume(Math.round((sound.volume || 1.0) * 100));
    setSoundboardIsGlobal(sound.is_global || false);
    // Decode the original audio to get the AudioBuffer
    if (sound.original_audio) {
      try {
        const ctx = getSoundboardAudioCtx();
        let arrayBuffer;
        if (sound.original_audio.startsWith('data:')) {
          const b64 = sound.original_audio.split(',')[1];
          const bin = atob(b64);
          const u8 = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
          arrayBuffer = u8.buffer;
        } else {
          const response = await fetch(sound.original_audio);
          arrayBuffer = await response.arrayBuffer();
        }
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        setSoundboardAudioBuffer(audioBuffer);
        setSoundboardDuration(audioBuffer.duration);
        setSoundboardTrimStart(sound.trim_start || 0);
        setSoundboardTrimEnd(sound.trim_end || Math.min(audioBuffer.duration, 8));
      } catch (err) {
        console.error('Failed to decode original audio:', err);
      }
    }
  };

  const resetSoundboardForm = () => {
    setSoundboardEditing(null);
    setSoundboardForm({ name: '', emoji: '🔊', file: null });
    setSoundboardAudioBuffer(null);
    setSoundboardTrimStart(0);
    setSoundboardTrimEnd(0);
    setSoundboardDuration(0);
    setSoundboardVolume(100);
    setSoundboardIsGlobal(false);
    if (soundboardFileRef.current) soundboardFileRef.current.value = '';
  };

  // Load moderation data when tab opens
  useEffect(() => {
    if (tab === 'moderation' && server) {
      loadModData();
    }
  }, [tab, server?.id]);

  // Load platform admin data when tab opens
  useEffect(() => {
    if (tab === 'platform-admin' && currentUser?.isPlatformAdmin) {
      loadAdminData();
    }
  }, [tab]);

  // Load soundboard when tab opens
  useEffect(() => {
    if (tab === 'soundboard' && server) {
      loadSoundboardSounds();
    }
    return () => {
      stopSoundboardPreview();
    };
  }, [tab, server?.id]);

  // Redraw waveform when trim changes
  useEffect(() => {
    if (soundboardAudioBuffer && soundboardCanvasRef.current) {
      drawWaveform(soundboardCanvasRef.current, soundboardAudioBuffer, soundboardTrimStart, soundboardTrimEnd);
    }
  }, [soundboardAudioBuffer, soundboardTrimStart, soundboardTrimEnd]);

  // ── Custom Emoji helpers ──
  const loadEmojis = () => {
    if (!socket || !server) return;
    setEmojiLoading(true);
    emitWithTimeout(socket, 'emoji:get', { serverId: server.id }, (response) => {
      setEmojiLoading(false);
      if (response.error) return;
      setEmojiList(response.emojis || []);
    });
  };

  const resizeEmojiImage = (dataUrl) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, 64, 64);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = dataUrl;
    });
  };

  const handleEmojiFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = await fileToDataURL(file);
    // Skip canvas resize for GIFs — canvas flattens animation frames to a single PNG
    const preview = file.type === 'image/gif' ? url : await resizeEmojiImage(url);
    setEmojiForm(f => ({ ...f, file, preview }));
  };

  const saveEmoji = async () => {
    if (!socket || !server) return;
    const name = emojiForm.name.trim().replace(/[^a-zA-Z0-9_]/g, '_');
    if (!name || name.length < 2) return;
    setEmojiSaving(true);

    if (emojiEditing) {
      // Rename only
      emitWithTimeout(socket, 'emoji:update', {
        serverId: server.id, emojiId: emojiEditing.id, name
      }, (response) => {
        setEmojiSaving(false);
        if (response.error) { showActionError(response.error); return; }
        resetEmojiForm();
        loadEmojis();
      });
    } else {
      if (!emojiForm.preview) { setEmojiSaving(false); return; }
      const animated = emojiForm.file?.type === 'image/gif';
      emitWithTimeout(socket, 'emoji:upload', {
        serverId: server.id,
        name,
        imageData: emojiForm.preview,
        contentType: animated ? 'image/gif' : 'image/png',
        animated
      }, (response) => {
        setEmojiSaving(false);
        if (response.error) { showActionError(response.error); return; }
        resetEmojiForm();
        loadEmojis();
      });
    }
  };

  const deleteEmoji = (emojiId) => {
    if (!socket || !server) return;
    emitWithTimeout(socket, 'emoji:delete', { serverId: server.id, emojiId }, (response) => {
      if (response.error) { showActionError(response.error); return; }
      loadEmojis();
    });
  };

  const resetEmojiForm = () => {
    setEmojiEditing(null);
    setEmojiForm({ name: '', file: null, preview: null });
    if (emojiFileRef.current) emojiFileRef.current.value = '';
  };

  // Load emojis when tab opens
  useEffect(() => {
    if (tab === 'emojis' && server) {
      loadEmojis();
    }
  }, [tab, server?.id]);

  // ── Voice Channel Sounds helpers ──
  const loadVoiceSounds = () => {
    if (!socket) return;
    emitWithTimeout(socket, 'user:get-sounds', null, (response) => {
      if (response?.error) { showActionError(response.error); }
      if (response?.sounds) {
        setVoiceSounds(response.sounds);
      }
      setVoiceSoundsLoaded(true);
    });
  };

  useEffect(() => {
    if (tab === 'profile' && !voiceSoundsLoaded) {
      loadVoiceSounds();
    }
  }, [tab, voiceSoundsLoaded]);

  const handleVoiceSoundFileSelect = async (e, type) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const ctx = getSoundboardAudioCtx();
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      setVoiceSoundAudioBuffer(audioBuffer);
      setVoiceSoundDuration(audioBuffer.duration);
      setVoiceSoundTrimStart(0);
      setVoiceSoundTrimEnd(Math.min(audioBuffer.duration, 5));
      setVoiceSoundEditing(type);
    } catch (err) {
      console.error('Failed to decode audio:', err);
    }
  };

  const editExistingVoiceSound = async (type) => {
    const originalKey = type === 'intro' ? 'intro_sound_original' : 'exit_sound_original';
    const original = voiceSounds?.[originalKey];
    if (!original) return;
    try {
      const ctx = getSoundboardAudioCtx();
      const base64 = original.split(',')[1];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const arrayBuffer = bytes.buffer;
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      setVoiceSoundAudioBuffer(audioBuffer);
      setVoiceSoundDuration(audioBuffer.duration);
      const trimStartKey = type === 'intro' ? 'intro_sound_trim_start' : 'exit_sound_trim_start';
      const trimEndKey = type === 'intro' ? 'intro_sound_trim_end' : 'exit_sound_trim_end';
      const volumeKey = type === 'intro' ? 'intro_sound_volume' : 'exit_sound_volume';
      setVoiceSoundTrimStart(voiceSounds?.[trimStartKey] || 0);
      setVoiceSoundTrimEnd(voiceSounds?.[trimEndKey] || Math.min(audioBuffer.duration, 5));
      setVoiceSoundVolume(voiceSounds?.[volumeKey] ?? 100);
      setVoiceSoundEditing(type);
    } catch (err) {
      console.error('Failed to decode original audio:', err);
    }
  };

  const previewVoiceSound = async () => {
    if (!voiceSoundAudioBuffer) return;
    if (voiceSoundPreviewSourceRef.current) {
      try { voiceSoundPreviewSourceRef.current.stop(); } catch {}
    }
    const ctx = getSoundboardAudioCtx();
    if (ctx.state === 'suspended') await ctx.resume();
    const gain = ctx.createGain();
    gain.gain.value = voiceSoundVolume / 100;
    gain.connect(ctx.destination);
    const source = ctx.createBufferSource();
    source.buffer = voiceSoundAudioBuffer;
    source.connect(gain);
    source.start(0, voiceSoundTrimStart, voiceSoundTrimEnd - voiceSoundTrimStart);
    source.onended = () => setVoiceSoundPreviewing(false);
    voiceSoundPreviewSourceRef.current = source;
    setVoiceSoundPreviewing(true);
  };

  const stopVoiceSoundPreview = () => {
    if (voiceSoundPreviewSourceRef.current) {
      try { voiceSoundPreviewSourceRef.current.stop(); } catch {}
      voiceSoundPreviewSourceRef.current = null;
    }
    setVoiceSoundPreviewing(false);
  };

  const saveVoiceSound = async () => {
    if (!voiceSoundAudioBuffer || !voiceSoundEditing || !socket) return;
    const trimDuration = voiceSoundTrimEnd - voiceSoundTrimStart;
    if (trimDuration > 5 || trimDuration < 0.1) return;

    setVoiceSoundSaving(true);
    try {
      const trimmedBuffer = await renderTrimmedAudio(voiceSoundAudioBuffer, voiceSoundTrimStart, voiceSoundTrimEnd);
      const trimmedBase64 = await audioBufferToWavBase64(trimmedBuffer);
      const originalBase64 = await audioBufferToWavBase64(voiceSoundAudioBuffer);

      const updates = {};
      if (voiceSoundEditing === 'intro') {
        updates.introSound = trimmedBase64;
        updates.introSoundOriginal = originalBase64;
        updates.introSoundTrimStart = voiceSoundTrimStart;
        updates.introSoundTrimEnd = voiceSoundTrimEnd;
        updates.introSoundDuration = trimDuration;
        updates.introSoundVolume = voiceSoundVolume;
      } else {
        updates.exitSound = trimmedBase64;
        updates.exitSoundOriginal = originalBase64;
        updates.exitSoundTrimStart = voiceSoundTrimStart;
        updates.exitSoundTrimEnd = voiceSoundTrimEnd;
        updates.exitSoundDuration = trimDuration;
        updates.exitSoundVolume = voiceSoundVolume;
      }

      emitWithTimeout(socket, 'user:update-sounds', updates, (response) => {
        setVoiceSoundSaving(false);
        if (response?.error) { showActionError(response.error); return; }
        cancelVoiceSoundEdit();
        setVoiceSoundsLoaded(false); // Force reload
        loadVoiceSounds();
      });
    } catch (err) {
      console.error('Failed to save voice sound:', err);
      setVoiceSoundSaving(false);
    }
  };

  const removeVoiceSound = (type) => {
    if (!socket) return;
    const updates = {};
    if (type === 'intro') {
      updates.introSound = null;
      updates.introSoundOriginal = null;
      updates.introSoundTrimStart = 0;
      updates.introSoundTrimEnd = 0;
      updates.introSoundDuration = 0;
    } else {
      updates.exitSound = null;
      updates.exitSoundOriginal = null;
      updates.exitSoundTrimStart = 0;
      updates.exitSoundTrimEnd = 0;
      updates.exitSoundDuration = 0;
    }
    emitWithTimeout(socket, 'user:update-sounds', updates, (response) => {
      if (response?.error) { showActionError(response.error); return; }
      setVoiceSoundsLoaded(false);
      loadVoiceSounds();
    });
  };

  const cancelVoiceSoundEdit = () => {
    stopVoiceSoundPreview();
    setVoiceSoundEditing(null);
    setVoiceSoundAudioBuffer(null);
    setVoiceSoundTrimStart(0);
    setVoiceSoundTrimEnd(0);
    setVoiceSoundDuration(0);
  };

  // Redraw voice sound waveform when trim changes
  useEffect(() => {
    if (voiceSoundAudioBuffer && voiceSoundCanvasRef.current) {
      drawWaveform(voiceSoundCanvasRef.current, voiceSoundAudioBuffer, voiceSoundTrimStart, voiceSoundTrimEnd);
    }
  }, [voiceSoundAudioBuffer, voiceSoundTrimStart, voiceSoundTrimEnd]);

  // Enumerate audio devices
  useEffect(() => {
    const enumerateDevices = async () => {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const inputs = devices.filter(d => d.kind === 'audioinput');
        const outputs = devices.filter(d => d.kind === 'audiooutput');
        setAudioInputDevices(inputs);
        setAudioOutputDevices(outputs);

        // Load saved device preferences
        const savedInput = localStorage.getItem('nexus_audio_input');
        const savedOutput = localStorage.getItem('nexus_audio_output');
        if (savedInput) setSelectedInputDevice(savedInput);
        if (savedOutput) setSelectedOutputDevice(savedOutput);
      } catch (err) {
        console.error('Error enumerating devices:', err);
      }
    };

    enumerateDevices();
    // Re-enumerate when devices change
    navigator.mediaDevices?.addEventListener?.('devicechange', enumerateDevices);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', enumerateDevices);
  }, []);

  // Start/stop mic test
  const startMicTest = async () => {
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      const audioConstraints = selectedInputDevice && selectedInputDevice !== 'default'
        ? { deviceId: { exact: selectedInputDevice } }
        : true;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: false });
      micTestStreamRef.current = stream;

      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      micTestCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);
      const updateMeter = () => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        const rms = Math.sqrt(sum / data.length);
        const db = rms > 0 ? 20 * Math.log10(rms / 255) : -100;
        setMicLevel(db);
        micTestAnimRef.current = requestAnimationFrame(updateMeter);
      };
      micTestAnimRef.current = requestAnimationFrame(updateMeter);
      setMicTesting(true);
    } catch (err) {
      console.error('Mic test failed:', err);
    }
  };

  const stopMicTest = () => {
    if (micTestAnimRef.current) cancelAnimationFrame(micTestAnimRef.current);
    micTestStreamRef.current?.getTracks().forEach(t => t.stop());
    micTestStreamRef.current = null;
    if (micTestCtxRef.current && micTestCtxRef.current.state !== 'closed') {
      try { micTestCtxRef.current.close(); } catch (_) {}
    }
    micTestCtxRef.current = null;
    setMicTesting(false);
    setMicLevel(-100);
  };

  // Clean up mic test on unmount or tab change
  useEffect(() => {
    return () => stopMicTest();
  }, [tab]);

  useEffect(()=>{ setServerName(server?.name||''); setServerDesc(server?.description||''); setServerCustomIcon(server?.customIcon||null); },[server]);

  const saveProfile = () => {
    if (!socket) return;
    socket.emit('user:update', { username, avatar, color, bio, status, customAvatar });
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2000);
  };

  const saveServer = () => {
    if (!socket||!server) return;
    const initials = getServerInitials(serverName);
    socket.emit('server:update', { serverId:server.id, name:serverName, icon:initials, description:serverDesc, customIcon:serverCustomIcon });
    setServerSaved(true);
    setTimeout(() => setServerSaved(false), 2000);
  };

  const createServer = () => {
    if (!socket||!newServerName.trim()) return;
    const initials = getServerInitials(newServerName.trim());
    socket.emit('server:create', { name:newServerName.trim(), icon:initials, customIcon:newServerCustomIcon });
    setNewServerName(''); setNewServerCustomIcon(null);
    setServerCreated(true);
    setTimeout(() => setServerCreated(false), 2000);
  };

  const createChannel = (name, type, description, categoryId, isPrivate) => {
    if (!socket||!server||!name.trim()) return;
    socket.emit('channel:create', {
      serverId: server.id,
      name: name.trim(),
      type: type || 'text',
      description: description || '',
      categoryId: categoryId || Object.keys(server.categories)[0],
      isPrivate: isPrivate || false
    });
    setNewChannelName('');
    setNewChannelDescription('');
    setNewChannelCategory('');
    setNewChannelPrivate(false);
    setChannelCreated(true);
    setTimeout(() => setChannelCreated(false), 2000);
  };

  const saveChannel = () => {
    if (!socket||!server||!editingChannel) return;
    socket.emit('channel:update', { serverId:server.id, channelId:editingChannel.id,
      name:editingChannel.name, description:editingChannel.description||'',
      topic:editingChannel.topic||'', isPrivate:editingChannel.isPrivate||false,
      permissionOverrides:editingChannel.permissionOverrides||{}
    });
    setEditingChannel(null);
    setChannelSaved(true);
    setTimeout(() => setChannelSaved(false), 2000);
  };

  const setChPerm = (key, val) => {
    if (!editingChannel) return;
    const overrides = { ...(editingChannel.permissionOverrides||{}) };
    const tKey = chPermTarget;
    overrides[tKey] = { ...(overrides[tKey]||{}), [key]: val };
    setEditingChannel(p => ({...p, permissionOverrides: overrides}));
  };

  const getChPermValue = (key) => {
    const overrides = editingChannel?.permissionOverrides||{};
    return overrides[chPermTarget]?.[key] ?? null;
  };

  const deleteChannel = (id) => {
    if (!socket||!server||!window.confirm('Delete channel?')) return;
    socket.emit('channel:delete', {serverId:server.id, channelId:id});
  };

  const createCategory = () => {
    if (!socket||!server||!newCategoryName.trim()) return;
    socket.emit('category:create', {serverId:server.id, name:newCategoryName.trim()});
    setNewCategoryName('');
    setCategorySaved(true);
    setTimeout(() => setCategorySaved(false), 2000);
  };

  // Drag-reorder channels within a category
  const handleChDragDrop = (catId, fromIdx, toIdx) => {
    if (!server||!socket||fromIdx===toIdx) return;
    const cat = server.categories?.[catId];
    if (!cat) return;
    const order = [...cat.channels];
    const [moved] = order.splice(fromIdx,1);
    order.splice(toIdx,0,moved);
    socket.emit('channel:reorder', {serverId:server.id, categoryId:catId, channelOrder:order});
  };

  // Move category up or down
  const handleCategoryMove = (catId, direction) => {
    if (!server||!socket) return;
    const currentOrder = server.categoryOrder || [];
    const currentIdx = currentOrder.indexOf(catId);
    if (currentIdx === -1) return;

    const newIdx = direction === 'up' ? currentIdx - 1 : currentIdx + 1;
    if (newIdx < 0 || newIdx >= currentOrder.length) return;

    const newOrder = [...currentOrder];
    [newOrder[currentIdx], newOrder[newIdx]] = [newOrder[newIdx], newOrder[currentIdx]];

    socket.emit('category:reorder', {serverId: server.id, categoryOrder: newOrder});
  };

  const createRole = () => {
    if (!socket||!server||!newRoleName.trim()) return;
    socket.emit('role:create', {serverId:server.id, name:newRoleName.trim(), color:newRoleColor});
    setNewRoleName('');
    setRoleCreated(true);
    setTimeout(() => setRoleCreated(false), 2000);
  };

  const saveRole = () => {
    if (!socket||!server||!editingRole) return;
    socket.emit('role:update', {serverId:server.id, roleId:editingRole.id, name:editingRole.name, color:editingRole.color, permissions:editingRole.permissions});
    setEditingRole(null);
    setRoleSaved(true);
    setTimeout(() => setRoleSaved(false), 2000);
  };

  const deleteRole = (roleId) => {
    if (!socket||!server) return;
    if (!window.confirm('Are you sure you want to delete this role? Members with this role will lose its permissions.')) return;
    socket.emit('role:delete', {serverId:server.id, roleId});
  };

  const assignRole = (targetUserId, roleId, action) => {
    if (!socket||!server) return;
    socket.emit('member:role', {serverId:server.id, targetUserId, roleId, action});
  };

  const deleteWebhook = (chId, whId) => {
    if (!socket||!server) return;
    socket.emit('webhook:delete', {serverId:server.id, channelId:chId, webhookId:whId});
  };

  const createWebhook = () => {
    if (!socket||!server||!newWebhookName.trim()||!selectedWebhookCh) return;
    socket.emit('webhook:create', {serverId:server.id, channelId:selectedWebhookCh, name:newWebhookName.trim()});
    setNewWebhookName('');
    setWebhookCreated(true);
    setTimeout(() => setWebhookCreated(false), 2000);
  };

  const allChannels = server ? [...(server.channels?.text||[]),...(server.channels?.voice||[])] : [];
  const categoryOrder = server?.categoryOrder || [];
  const categories = server?.categories || {};
  const members = server?.members || {};
  const roles = server?.roles || {};

  // Get online users for member list
  const allChannelMemberIds = Object.keys(members);

  // Compute current user's permissions for the server
  const getUserPermissions = () => {
    if (!currentUser || !server) return {};

    // Owner has all permissions
    if (server.ownerId === currentUser.id) {
      return Object.keys(PERM_LABELS).reduce((acc, key) => ({ ...acc, [key]: true }), {});
    }

    const member = members[currentUser.id];
    if (!member) return {};

    const userRoles = member.roles || [];
    const combinedPerms = {};

    // Combine permissions from all roles
    userRoles.forEach(roleId => {
      const role = roles[roleId];
      if (role && role.permissions) {
        Object.entries(role.permissions).forEach(([perm, value]) => {
          if (value) combinedPerms[perm] = true;
        });
      }
    });

    // Admin permission grants all other permissions
    if (combinedPerms.admin) {
      return Object.keys(PERM_LABELS).reduce((acc, key) => ({ ...acc, [key]: true }), {});
    }

    return combinedPerms;
  };

  const userPerms = getUserPermissions();

  // Get current user's highest role position for hierarchy checks
  const userHighestPosition = (() => {
    if (!currentUser || !server) return -1;
    if (isOwner) return Infinity;
    const member = members[currentUser.id];
    if (!member) return -1;
    return Math.max(0, ...(member.roles || []).map(rid => roles[rid]?.position || 0));
  })();

  // Check if a role can be managed by the current user (below their highest)
  const canManageRole = (role) => {
    if (isOwner) return true;
    if (!role) return false;
    return (role.position || 0) < userHighestPosition;
  };

  const tabs = [
    {id:'profile', label:'Profile', icon: <UserIcon size={16} />},
    {id:'appearance', label:'Appearance', icon: <SettingsIcon size={16} />},
    {id:'audio', label:'Audio', icon: <VolumeIcon size={16} />},
    {id:'notifications', label:'Notifications', icon: <BellIcon size={16} />},
    {id:'friends', label:'Friends', icon: <FriendsIcon size={16} />},
    {id:'servers', label:'My Servers', icon: <HexagonIcon size={16} />},
    ...(server ? [
      {id:'server-settings', label:'Server Settings', icon: <SettingsIcon size={16} />},
      ...(userPerms.manageChannels || userPerms.admin ? [{id:'channels', label:'Channels', icon: <span style={{fontSize: 14}}>#</span>}] : []),
      ...(userPerms.manageRoles || userPerms.admin ? [{id:'roles', label:'Roles', icon: <span style={{fontSize: 14}}>@</span>}] : []),
      ...(userPerms.manageRoles || userPerms.admin ? [{id:'members', label:'Members', icon: <UserIcon size={16} />}] : []),
      ...(userPerms.manageWebhooks || userPerms.admin ? [{id:'webhooks', label:'Webhooks', icon: <LinkIcon size={16} />}] : []),
      ...(userPerms.manageServer || userPerms.admin ? [{id:'soundboard', label:'Soundboard', icon: <SoundboardIcon size={16} />}] : []),
      ...(userPerms.manageEmojis || userPerms.admin ? [{id:'emojis', label:'Emojis', icon: <EmojiIcon size={16} />}] : []),
      ...(userPerms.admin || isOwner ? [{id:'moderation', label:'Moderation', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 2.18l7 3.12v4.7c0 4.67-3.13 9.06-7 10.2-3.87-1.14-7-5.53-7-10.2V6.3l7-3.12z"/></svg>}] : []),
    ] : []),
    ...(currentUser?.isPlatformAdmin ? [{id:'platform-admin', label:'Platform Admin', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-1 15l-4-4 1.41-1.41L11 13.17l6.59-6.59L19 8l-8 8z"/></svg>}] : []),
    {id:'about', label:'About', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>}
  ];

  // Ensure user can only view tabs they have permission for
  useEffect(() => {
    const allowedTabIds = tabs.map(t => t.id);
    if (!allowedTabIds.includes(tab)) {
      setTab('profile');
    }
  }, [tab, tabs]);

  return (
    <div className="settings-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="settings-modal">
        <SettingsSidebar tabs={tabs} tab={tab} setTab={setTab} />

        <div className="settings-content">
          <button className="settings-close-btn" onClick={onClose} title="Close Settings">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/></svg>
          </button>
          {actionError && (
            <div style={{
              background: '#ED4245', color: '#fff', padding: '8px 16px', borderRadius: 4,
              fontSize: 13, marginBottom: 12, animation: 'popIn 0.2s ease'
            }}>{actionError}</div>
          )}
          {/* ── PROFILE ── */}
          {tab==='profile' && (
            <div className="settings-section">
              <h2>My Profile</h2>
              <div className="settings-preview-card">
                <div className="preview-avatar" style={{background: customAvatar?'transparent':color}}>
                  {customAvatar ? <img src={customAvatar} alt="" className="avatar-upload-img"/> : avatar}
                </div>
                <div className="preview-info">
                  <div className="preview-name" style={{color}}>{username||'Your Name'}</div>
                  <div className="preview-bio">{bio||'No bio'}</div>
                  <div className={`preview-status status-${status}`}>{status}</div>
                </div>
              </div>

              <AvatarUpload current={customAvatar} label="Custom Avatar" onUpload={setCustomAvatar}/>

              <label className="settings-label">Display Name</label>
              <input className="settings-input" value={username} onChange={e=>setUsername(e.target.value)} maxLength={32}/>

              <label className="settings-label">Bio</label>
              <textarea className="settings-input settings-textarea" value={bio} onChange={e=>setBio(e.target.value)} maxLength={128} placeholder="Tell others about yourself..."/>

              <label className="settings-label">Status</label>
              <div className="settings-row">
                {['online','idle','dnd','invisible'].map(s=>(
                  <button key={s} className={`status-btn status-${s} ${status===s?'active':''}`} onClick={()=>setStatus(s)}>
                    {s==='online'?'●':s==='idle'?'○':s==='dnd'?'●':'○'} {s}
                  </button>
                ))}
              </div>

              <label className="settings-label">Emoji Avatar (if no custom image)</label>
              <div className="avatar-grid">{AVATARS.map(a=>(
                <button key={a} className={`avatar-opt ${avatar===a&&!customAvatar?'selected':''}`} onClick={()=>setAvatar(a)}>{a}</button>
              ))}</div>

              <label className="settings-label">Name Color</label>
              <div className="color-grid">
                {COLORS.map(c=>(
                  <button key={c} className={`color-opt ${color===c?'selected':''}`} style={{background:c}} onClick={()=>{setColor(c);setCustomColorInput('');}}/>
                ))}
                <div className={`color-picker-swatch ${!COLORS.includes(color) && color ? 'selected' : ''}`}
                  style={{background: (!COLORS.includes(color) && color) || '#666'}}
                  title="Custom color">
                  <input type="color" value={color || '#3B82F6'}
                    onChange={e => { setColor(e.target.value); setCustomColorInput(e.target.value); }}/>
                </div>
              </div>
              <div className="color-picker-custom">
                <input className="color-picker-hex-input" placeholder="Hex, RGB, or HSL..."
                  value={customColorInput}
                  onChange={e => {
                    setCustomColorInput(e.target.value);
                    const parsed = parseColorInput(e.target.value);
                    if (parsed) setColor(parsed);
                  }}
                />
                {customColorInput && parseColorInput(customColorInput) && (
                  <span style={{fontSize:12,color:'var(--green)'}}>Valid</span>
                )}
                {customColorInput && !parseColorInput(customColorInput) && (
                  <span style={{fontSize:12,color:'var(--text-muted)'}}>e.g. #FF5722, rgb(255,87,34), hsl(14,100%,57%)</span>
                )}
              </div>

              <button
                className={`settings-btn ${profileSaved ? '' : 'primary'}`}
                onClick={saveProfile}
                style={profileSaved ? {
                  background: 'var(--green)',
                  color: '#fff',
                  transition: 'all 0.2s ease'
                } : {}}
              >
                {profileSaved ? '✓ Saved' : 'Save Profile'}
              </button>

              {/* Voice Channel Sounds */}
              {currentUser && !currentUser.isGuest && (
                <div style={{ marginTop: 40, paddingTop: 24, borderTop: '1px solid var(--bg-modifier-hover)' }}>
                  <h3>Voice Channel Sounds</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
                    Custom sounds that play when you join or leave a voice channel (max 5 seconds).
                  </p>

                  {voiceSoundEditing ? (
                    <div className="soundboard-editor">
                      <h4 style={{ margin: '0 0 12px', textTransform: 'capitalize' }}>{voiceSoundEditing} Sound Editor</h4>

                      <canvas ref={voiceSoundCanvasRef} className="soundboard-waveform" />

                      <div className="soundboard-trim-controls">
                        <label className="settings-label" style={{ fontSize: 12, marginBottom: 4 }}>
                          Trim: {voiceSoundTrimStart.toFixed(2)}s - {voiceSoundTrimEnd.toFixed(2)}s
                          ({(voiceSoundTrimEnd - voiceSoundTrimStart).toFixed(2)}s)
                        </label>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Start</span>
                          <input type="range" min="0" max={voiceSoundDuration} step="0.01"
                            value={voiceSoundTrimStart}
                            onChange={e => {
                              const v = parseFloat(e.target.value);
                              if (v < voiceSoundTrimEnd - 0.1) setVoiceSoundTrimStart(v);
                            }}
                            style={{ flex: 1 }}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>End</span>
                          <input type="range" min="0" max={voiceSoundDuration} step="0.01"
                            value={voiceSoundTrimEnd}
                            onChange={e => {
                              const v = parseFloat(e.target.value);
                              if (v > voiceSoundTrimStart + 0.1 && v - voiceSoundTrimStart <= 5) setVoiceSoundTrimEnd(v);
                            }}
                            style={{ flex: 1 }}
                          />
                        </div>
                      </div>

                      <div style={{ marginTop: 8 }}>
                        <label className="settings-label" style={{ fontSize: 12, marginBottom: 4 }}>
                          Volume: {voiceSoundVolume}%
                        </label>
                        <input type="range" min={0} max={200} step={1} value={voiceSoundVolume}
                          onChange={e => setVoiceSoundVolume(parseInt(e.target.value))}
                          style={{ width: '100%' }}
                        />
                      </div>

                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button className="settings-btn" onClick={voiceSoundPreviewing ? stopVoiceSoundPreview : previewVoiceSound}>
                          {voiceSoundPreviewing ? '⏹ Stop' : '▶ Preview'}
                        </button>
                        <button className="settings-btn" onClick={() => {
                          const fileInput = document.createElement('input');
                          fileInput.type = 'file';
                          fileInput.accept = 'audio/*';
                          fileInput.onchange = (e) => handleVoiceSoundFileSelect(e, voiceSoundEditing);
                          fileInput.click();
                        }}>
                          Replace File
                        </button>
                      </div>

                      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                        <button className="settings-btn primary" onClick={saveVoiceSound} disabled={voiceSoundSaving}>
                          {voiceSoundSaving ? 'Saving...' : 'Save Sound'}
                        </button>
                        <button className="settings-btn" onClick={cancelVoiceSoundEdit}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {/* Intro Sound */}
                      <div className="voice-sound-card">
                        <div className="voice-sound-card-header">
                          <span style={{ fontWeight: 600 }}>Intro Sound</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                            {voiceSounds?.intro_sound ? `${(voiceSounds.intro_sound_duration || 0).toFixed(1)}s` : 'Not set'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {voiceSounds?.intro_sound ? (
                            <>
                              <button className="settings-btn" onClick={async () => {
                                const ctx = getSoundboardAudioCtx();
                                if (ctx.state === 'suspended') await ctx.resume();
                                const base64 = voiceSounds.intro_sound.split(',')[1];
                                const binary = atob(base64);
                                const bytes = new Uint8Array(binary.length);
                                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                                const buf = await ctx.decodeAudioData(bytes.buffer);
                                const gain = ctx.createGain();
                                gain.gain.value = (voiceSounds.intro_sound_volume ?? 100) / 100;
                                gain.connect(ctx.destination);
                                const src = ctx.createBufferSource();
                                src.buffer = buf; src.connect(gain); src.start(0);
                              }}>▶ Play</button>
                              <button className="settings-btn" onClick={() => editExistingVoiceSound('intro')}>Edit</button>
                              <button className="settings-btn danger" onClick={() => removeVoiceSound('intro')}>Remove</button>
                            </>
                          ) : (
                            <button className="settings-btn primary" onClick={() => {
                              const fileInput = document.createElement('input');
                              fileInput.type = 'file';
                              fileInput.accept = 'audio/*';
                              fileInput.onchange = (e) => handleVoiceSoundFileSelect(e, 'intro');
                              fileInput.click();
                            }}>Upload</button>
                          )}
                        </div>
                      </div>

                      {/* Exit Sound */}
                      <div className="voice-sound-card">
                        <div className="voice-sound-card-header">
                          <span style={{ fontWeight: 600 }}>Exit Sound</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                            {voiceSounds?.exit_sound ? `${(voiceSounds.exit_sound_duration || 0).toFixed(1)}s` : 'Not set'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {voiceSounds?.exit_sound ? (
                            <>
                              <button className="settings-btn" onClick={async () => {
                                const ctx = getSoundboardAudioCtx();
                                if (ctx.state === 'suspended') await ctx.resume();
                                const base64 = voiceSounds.exit_sound.split(',')[1];
                                const binary = atob(base64);
                                const bytes = new Uint8Array(binary.length);
                                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                                const buf = await ctx.decodeAudioData(bytes.buffer);
                                const gain = ctx.createGain();
                                gain.gain.value = (voiceSounds.exit_sound_volume ?? 100) / 100;
                                gain.connect(ctx.destination);
                                const src = ctx.createBufferSource();
                                src.buffer = buf; src.connect(gain); src.start(0);
                              }}>▶ Play</button>
                              <button className="settings-btn" onClick={() => editExistingVoiceSound('exit')}>Edit</button>
                              <button className="settings-btn danger" onClick={() => removeVoiceSound('exit')}>Remove</button>
                            </>
                          ) : (
                            <>
                              <button className="settings-btn primary" onClick={() => {
                                setVoiceSoundEditing('exit');
                                const fileInput = document.createElement('input');
                                fileInput.type = 'file';
                                fileInput.accept = 'audio/*';
                                fileInput.onchange = (e) => handleVoiceSoundFileSelect(e, 'exit');
                                fileInput.click();
                              }}>Upload</button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Password Change */}
              {currentUser && !currentUser.isGuest && (
                <div style={{ marginTop: 40, paddingTop: 24, borderTop: '1px solid var(--bg-modifier-hover)' }}>
                  <h3>Change Password</h3>
                  <label className="settings-label">Current Password</label>
                  <input
                    type="password"
                    className="settings-input"
                    value={currentPassword}
                    onChange={e => { setCurrentPassword(e.target.value); setPasswordError(''); }}
                    placeholder="Enter current password"
                    disabled={passwordLoading}
                  />
                  <label className="settings-label">New Password</label>
                  <input
                    type="password"
                    className="settings-input"
                    value={newPassword}
                    onChange={e => { setNewPassword(e.target.value); setPasswordError(''); }}
                    placeholder="Enter new password (min 4 characters)"
                    disabled={passwordLoading}
                  />
                  <label className="settings-label">Confirm New Password</label>
                  <input
                    type="password"
                    className="settings-input"
                    value={confirmNewPassword}
                    onChange={e => { setConfirmNewPassword(e.target.value); setPasswordError(''); }}
                    placeholder="Confirm new password"
                    disabled={passwordLoading}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && currentPassword && newPassword && confirmNewPassword) {
                        if (newPassword !== confirmNewPassword) { setPasswordError('Passwords do not match'); return; }
                        if (newPassword.length < 4) { setPasswordError('New password must be at least 4 characters'); return; }
                        setPasswordLoading(true);
                        passwordTimeoutRef.current = emitWithLoadingTimeout(socket, 'user:change-password', { currentPassword, newPassword },
                          { onTimeout: () => { setPasswordLoading(false); setPasswordError(TIMEOUT_MSG); } });
                      }
                    }}
                  />
                  {passwordError && <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 6 }}>{passwordError}</p>}
                  {passwordSuccess && <p style={{ color: 'var(--green)', fontSize: 13, marginTop: 6 }}>Password changed successfully!</p>}
                  <button
                    className={`settings-btn ${passwordSuccess ? '' : 'primary'}`}
                    disabled={!currentPassword || !newPassword || !confirmNewPassword || passwordLoading}
                    onClick={() => {
                      if (newPassword !== confirmNewPassword) { setPasswordError('Passwords do not match'); return; }
                      if (newPassword.length < 4) { setPasswordError('New password must be at least 4 characters'); return; }
                      setPasswordLoading(true);
                      passwordTimeoutRef.current = emitWithLoadingTimeout(socket, 'user:change-password', { currentPassword, newPassword },
                        { onTimeout: () => { setPasswordLoading(false); setPasswordError(TIMEOUT_MSG); } });
                    }}
                    style={passwordSuccess ? {
                      background: 'var(--green)',
                      color: '#fff',
                      transition: 'all 0.2s ease'
                    } : {}}
                  >
                    {passwordLoading ? 'Changing...' : passwordSuccess ? '✓ Changed' : 'Change Password'}
                  </button>
                </div>
              )}
            {/* Developer Mode */}
            <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="audio-toggle">
                <div>
                  <div className="audio-toggle-label">Developer Mode</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    Shows developer options like Copy ID in context menus
                  </div>
                </div>
                <label className="toggle-switch">
                  <input type="checkbox" checked={developerMode || false} onChange={e => onSetDeveloperMode?.(e.target.checked)} />
                  <span className="toggle-slider" />
                </label>
              </div>
            </div>

            {/* Change Server / Logout */}
            <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {isStandaloneApp() && (
                <>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--header-secondary)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 4 }}>
                    Server Connection
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
                    Connected to: <span style={{ color: 'var(--text-normal)', fontWeight: 500 }}>{getServerUrl() || 'Default'}</span>
                  </div>
                  <button
                    className="settings-btn"
                    style={{ background: 'rgba(59,130,246,0.15)', color: '#3B82F6', border: '2px solid rgba(59,130,246,0.2)', fontWeight: 600 }}
                    onClick={() => { if (window.confirm('This will disconnect you and return to the server setup screen. Continue?')) onChangeServer?.(); }}
                  >
                    Change Server
                  </button>
                </>
              )}
              <button
                className="settings-btn"
                style={{ background: 'rgba(237,66,69,0.15)', color: 'var(--red)', border: '2px solid rgba(237,66,69,0.2)', fontWeight: 600 }}
                onClick={() => { if (window.confirm('Are you sure you want to log out?')) onLogout?.(); }}
              >
                Log Out
              </button>

              {/* Delete Account */}
              <div style={{ marginTop: 16, borderTop: '1px solid var(--border-color)', paddingTop: 12 }}>
                {!showDeleteAccount ? (
                  <span
                    style={{ color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}
                    onClick={() => setShowDeleteAccount(true)}
                  >
                    Delete my account
                  </span>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <p style={{ color: 'var(--red)', fontSize: 13, margin: 0 }}>
                      This will permanently delete your account. Your messages will remain but show as "Deleted User". DMs will be preserved for other participants. This cannot be undone.
                    </p>
                    <label style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                      Type <strong style={{ color: 'var(--text-normal)' }}>{currentUser?.username}</strong> to confirm:
                    </label>
                    <input
                      type="text"
                      value={deleteConfirmUsername}
                      onChange={e => setDeleteConfirmUsername(e.target.value)}
                      placeholder="Enter your username"
                      style={{
                        background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                        borderRadius: 6, padding: '6px 10px', color: 'var(--text-normal)', fontSize: 14, outline: 'none'
                      }}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="settings-btn"
                        disabled={deleteConfirmUsername !== currentUser?.username || deleteLoading}
                        style={{
                          background: deleteConfirmUsername === currentUser?.username ? 'var(--red)' : 'rgba(237,66,69,0.15)',
                          color: '#fff', border: 'none', fontWeight: 600,
                          opacity: deleteConfirmUsername === currentUser?.username && !deleteLoading ? 1 : 0.5,
                          cursor: deleteConfirmUsername === currentUser?.username && !deleteLoading ? 'pointer' : 'not-allowed'
                        }}
                        onClick={async () => {
                          if (deleteConfirmUsername !== currentUser?.username) return;
                          setDeleteLoading(true);
                          await onDeleteAccount?.();
                          setDeleteLoading(false);
                        }}
                      >
                        {deleteLoading ? 'Deleting...' : 'Delete Account'}
                      </button>
                      <button
                        className="settings-btn"
                        style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)', border: '1px solid var(--border-color)' }}
                        onClick={() => { setShowDeleteAccount(false); setDeleteConfirmUsername(''); }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            </div>
          )}

          {/* ── APPEARANCE ── */}
          {tab==='appearance' && (
            <div className="settings-section">
              <h2>Appearance</h2>
              <p className="settings-hint">Theme customization coming soon.</p>
            </div>
          )}

          {/* ── AUDIO ── */}
          {tab==='audio' && (
            <div className="settings-section">
              <h2>Audio Settings</h2>

              <h3>Input Device</h3>
              <select
                className="settings-select"
                value={selectedInputDevice}
                onChange={e => {
                  setSelectedInputDevice(e.target.value);
                  localStorage.setItem('nexus_audio_input', e.target.value);
                  syncSettingsToServer();
                  // Restart mic test with new device if testing
                  if (micTesting) { stopMicTest(); setTimeout(startMicTest, 100); }
                }}
              >
                <option value="default">Default</option>
                {audioInputDevices.map(device => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Microphone ${device.deviceId.slice(0, 5)}`}
                  </option>
                ))}
              </select>

              <label className="settings-label">Input Volume: {inputVolume}%</label>
              <input
                type="range"
                min="0"
                max="100"
                value={inputVolume}
                onChange={e => {
                  setInputVolume(parseInt(e.target.value));
                  localStorage.setItem('nexus_audio_input_volume', e.target.value);
                  syncSettingsToServer();
                }}
                style={{width: '100%'}}
              />

              {/* Mic Test Meter */}
              <h3>Microphone Test</h3>
              <div className="audio-meter-container">
                <div className="audio-meter">
                  <div
                    className="audio-meter-fill"
                    style={{
                      width: `${Math.max(0, Math.min(100, ((micLevel + 80) / 80) * 100))}%`,
                      background: micLevel > -10 ? 'var(--red)' : micLevel > -25 ? 'var(--yellow)' : 'var(--green)'
                    }}
                  />
                  {noiseGateEnabled && (
                    <div
                      className="audio-meter-threshold"
                      style={{ left: `${Math.max(0, Math.min(100, ((noiseGateThreshold + 80) / 80) * 100))}%` }}
                      title={`Gate threshold: ${noiseGateThreshold} dB`}
                    />
                  )}
                </div>
                <span className="audio-meter-value">{micTesting ? `${Math.round(micLevel)} dB` : '—'}</span>
              </div>
              <button
                className={`settings-btn ${micTesting ? 'cancel' : ''}`}
                onClick={micTesting ? stopMicTest : startMicTest}
                style={{marginTop: 8}}
              >
                {micTesting ? 'Stop Test' : 'Test Microphone'}
              </button>

              {/* Collapsible Audio Processing Options */}
              <div className="collapsible-section" style={{marginTop: 24}}>
                <button className="collapsible-header" onClick={() => setAudioAdvancedOpen(p => !p)}>
                  <span className={`collapsible-arrow ${audioAdvancedOpen ? 'open' : ''}`}>▶</span>
                  <span>Audio Processing Options (Advanced)</span>
                </button>
                {audioAdvancedOpen && (
                  <div className="collapsible-body">
                    <h3>Noise Suppression</h3>
                    <p className="settings-hint">Browser-level noise reduction and echo cancellation. Changes take effect next time you join a voice channel.</p>
                    <div className="audio-toggle">
                      <span className="audio-toggle-label">Noise Suppression</span>
                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          checked={noiseSuppressionEnabled}
                          onChange={e => {
                            setNoiseSuppressionEnabled(e.target.checked);
                            localStorage.setItem('nexus_noise_suppression', String(e.target.checked));
                            syncSettingsToServer();
                          }}
                        />
                        <span className="toggle-slider" />
                      </label>
                    </div>
                    <div className="audio-toggle">
                      <span className="audio-toggle-label">Echo Cancellation</span>
                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          checked={echoCancellationEnabled}
                          onChange={e => {
                            setEchoCancellationEnabled(e.target.checked);
                            localStorage.setItem('nexus_echo_cancellation', String(e.target.checked));
                            syncSettingsToServer();
                          }}
                        />
                        <span className="toggle-slider" />
                      </label>
                    </div>

                    <h3 style={{marginTop: 24}}>Noise Gate</h3>
                    <p className="settings-hint">Cuts audio below a threshold to remove background noise.</p>
                    <div className="audio-toggle">
                      <span className="audio-toggle-label">Enable Noise Gate</span>
                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          checked={noiseGateEnabled}
                          onChange={e => {
                            setNoiseGateEnabled(e.target.checked);
                            localStorage.setItem('nexus_noise_gate_enabled', String(e.target.checked));
                            syncSettingsToServer();
                          }}
                        />
                        <span className="toggle-slider" />
                      </label>
                    </div>
                    {noiseGateEnabled && (
                      <>
                        <label className="settings-label">Gate Threshold: {noiseGateThreshold} dB</label>
                        <input type="range" min="-80" max="-5" step="1" value={noiseGateThreshold}
                          onChange={e => { const val = parseInt(e.target.value); setNoiseGateThreshold(val); localStorage.setItem('nexus_noise_gate_threshold', String(val)); syncSettingsToServer(); }}
                          style={{width: '100%'}} />
                        <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--text-muted)'}}>
                          <span>-80 (sensitive)</span><span>-5 (aggressive)</span>
                        </div>
                      </>
                    )}

                    <h3 style={{marginTop: 24}}>Auto Gain</h3>
                    <p className="settings-hint">Automatically adjusts mic volume to maintain a consistent level.</p>
                    <div className="audio-toggle">
                      <span className="audio-toggle-label">Enable Auto Gain</span>
                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          checked={autoGainEnabled}
                          onChange={e => {
                            setAutoGainEnabled(e.target.checked);
                            localStorage.setItem('nexus_auto_gain_enabled', String(e.target.checked));
                            syncSettingsToServer();
                          }}
                        />
                        <span className="toggle-slider" />
                      </label>
                    </div>
                    {autoGainEnabled && (
                      <>
                        <label className="settings-label">Target Level: {autoGainTarget} dB</label>
                        <input type="range" min="-40" max="-10" step="1" value={autoGainTarget}
                          onChange={e => { const val = parseInt(e.target.value); setAutoGainTarget(val); localStorage.setItem('nexus_auto_gain_target', String(val)); syncSettingsToServer(); }}
                          style={{width: '100%'}} />
                        <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--text-muted)'}}>
                          <span>-40 (quieter)</span><span>-10 (louder)</span>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div style={{marginTop:32, paddingTop:24, borderTop:'1px solid var(--bg-modifier-hover)'}}>
                <h3>Output Device</h3>
                <select
                  className="settings-select"
                  value={selectedOutputDevice}
                  onChange={e => {
                    setSelectedOutputDevice(e.target.value);
                    localStorage.setItem('nexus_audio_output', e.target.value);
                    syncSettingsToServer();
                  }}
                >
                  <option value="default">Default</option>
                  {audioOutputDevices.map(device => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Speaker ${device.deviceId.slice(0, 5)}`}
                    </option>
                  ))}
                </select>

                <label className="settings-label">Output Volume: {outputVolume}%</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={outputVolume}
                  onChange={e => {
                    setOutputVolume(parseInt(e.target.value));
                    localStorage.setItem('nexus_audio_output_volume', e.target.value);
                    syncSettingsToServer();
                  }}
                  style={{width: '100%'}}
                />

                <h3 style={{marginTop: 16}}>Test Output</h3>
                <button
                  className="settings-btn"
                  onClick={async () => {
                    try {
                      const ctx = new (window.AudioContext || window.webkitAudioContext)();
                      if (selectedOutputDevice && selectedOutputDevice !== 'default' && ctx.setSinkId) {
                        await ctx.setSinkId(selectedOutputDevice);
                      }
                      const osc = ctx.createOscillator();
                      const gain = ctx.createGain();
                      osc.connect(gain);
                      gain.connect(ctx.destination);
                      const vol = (outputVolume / 100) * 0.3;
                      gain.gain.setValueAtTime(vol, ctx.currentTime);
                      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
                      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
                      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.2);
                      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.4);
                      osc.start(ctx.currentTime);
                      osc.stop(ctx.currentTime + 0.8);
                      osc.onended = () => ctx.close();
                    } catch (err) {
                      console.error('Test sound failed:', err);
                    }
                  }}
                >
                  Play Test Sound
                </button>
              </div>

              <p className="settings-hint" style={{marginTop: 20}}>
                Device changes take effect the next time you join a voice channel.
                Noise gate and auto gain settings apply immediately.
              </p>
            </div>
          )}

          {/* ── NOTIFICATIONS ── */}
          {tab==='notifications' && (
            <div className="settings-section">
              <h2>Notifications</h2>

              <h3>Message Sounds</h3>
              <div className="audio-toggle">
                <span className="audio-toggle-label">Play sound for new messages</span>
                <label className="toggle-switch">
                  <input type="checkbox" checked={localStorage.getItem('nexus_message_sounds_enabled') !== 'false'} onChange={e => {
                    localStorage.setItem('nexus_message_sounds_enabled', String(e.target.checked));
                    window.dispatchEvent(new StorageEvent('storage', { key: 'nexus_message_sounds_enabled', newValue: String(e.target.checked) }));
                  }} />
                  <span className="toggle-slider" />
                </label>
              </div>
              <p style={{fontSize: 12, color: 'var(--text-muted)', marginTop: 4}}>
                A subtle chime will play when you receive a new message in an unmuted channel (not the currently active channel).
              </p>

              <h3 style={{marginTop: 24}}>Desktop Notifications</h3>
              <div className="audio-toggle">
                <span className="audio-toggle-label">Enable desktop notifications</span>
                <label className="toggle-switch">
                  <input type="checkbox" checked={localStorage.getItem('nexus_notifications_enabled') !== 'false'} onChange={e => {
                    localStorage.setItem('nexus_notifications_enabled', String(e.target.checked));
                    if (e.target.checked && window.Notification && Notification.permission === 'default') {
                      Notification.requestPermission();
                    }
                    window.dispatchEvent(new StorageEvent('storage', { key: 'nexus_notifications_enabled', newValue: String(e.target.checked) }));
                  }} />
                  <span className="toggle-slider" />
                </label>
              </div>
              <p style={{fontSize: 12, color: 'var(--text-muted)', marginTop: 4}}>
                Desktop notifications appear when you receive messages while the app is in the background.
                {window.Notification && Notification.permission === 'denied' && (
                  <span style={{color: 'var(--red)', display: 'block', marginTop: 4}}>
                    Notifications are blocked by your browser. Please allow notifications in your browser settings.
                  </span>
                )}
              </p>

              <h3 style={{marginTop: 24}}>Pause Notifications</h3>
              {(() => {
                const pausedUntil = parseInt(localStorage.getItem('nexus_notifications_paused_until') || '0');
                const isPaused = pausedUntil > Date.now();
                return <>
                  <div style={{display: 'flex', gap: 8, flexWrap: 'wrap'}}>
                    {isPaused ? (
                      <button className="settings-btn" onClick={() => {
                        localStorage.removeItem('nexus_notifications_paused_until');
                        window.dispatchEvent(new StorageEvent('storage', { key: 'nexus_notifications_paused_until', newValue: '0' }));
                        setTab('notifications'); // force re-render
                      }}>Enable</button>
                    ) : (
                      <button className="settings-btn primary" disabled>Enabled</button>
                    )}
                    {[
                      { label: '15 min', duration: 15 * 60 * 1000 },
                      { label: '1 hour', duration: 60 * 60 * 1000 },
                      { label: '8 hours', duration: 8 * 60 * 60 * 1000 },
                      { label: 'Indefinitely', duration: 'forever' },
                    ].map(opt => (
                      <button key={opt.label} className={`settings-btn${isPaused && (
                        opt.duration === 'forever' ? pausedUntil > Date.now() + 364 * 24 * 60 * 60 * 1000 : false
                      ) ? ' primary' : ''}`} onClick={() => {
                        const until = opt.duration === 'forever' ? Date.now() + 365 * 24 * 60 * 60 * 1000 : Date.now() + opt.duration;
                        localStorage.setItem('nexus_notifications_paused_until', String(until));
                        window.dispatchEvent(new StorageEvent('storage', { key: 'nexus_notifications_paused_until', newValue: String(until) }));
                        setTab('notifications'); // force re-render
                      }}>{opt.label}</button>
                    ))}
                  </div>
                  {isPaused && (() => {
                    const remaining = pausedUntil - Date.now();
                    const hours = Math.floor(remaining / 3600000);
                    const mins = Math.ceil((remaining % 3600000) / 60000);
                    return <p style={{fontSize: 12, color: 'var(--yellow, #faa61a)', marginTop: 8}}>
                      Notifications paused for {hours > 0 ? `${hours}h ` : ''}{mins}m
                    </p>;
                  })()}
                </>;
              })()}

              <h3 style={{marginTop: 24}}>@Mentions</h3>
              <p style={{fontSize: 13, color: 'var(--text-muted)'}}>
                When someone @mentions you or uses @everyone, you'll receive a notification sound
                even when viewing the channel. The <strong>Mention @everyone</strong> permission
                controls who can use @everyone in a server (configurable in Server Settings &gt; Roles).
              </p>

              <h3 style={{marginTop: 24}}>Do Not Disturb</h3>
              <p style={{fontSize: 13, color: 'var(--text-muted)'}}>
                Setting your status to <strong style={{color: '#f04747'}}>Do Not Disturb</strong> will silence all message sounds and desktop notifications, including @mentions.
                You can change your status in the Profile tab.
              </p>
            </div>
          )}

          {/* ── FRIENDS ── */}
          {tab==='friends' && (
            <div className="settings-section">
              <h2>Friends</h2>

              {/* Add Friend */}
              <h3>Add Friend</h3>
              <p className="settings-hint">Enter a username to send a friend request</p>
              <div className="settings-row">
                <input
                  className="settings-input inline-input"
                  placeholder="Username"
                  value={newFriendUsername}
                  onChange={e => setNewFriendUsername(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && socket && newFriendUsername.trim()) {
                      socket.emit('friend:request', { targetUsername: newFriendUsername.trim() });
                      setNewFriendUsername('');
                    }
                  }}
                  style={{ flex: 1 }}
                />
                <button
                  className="settings-btn primary"
                  style={{ marginTop: 0 }}
                  onClick={() => {
                    if (socket && newFriendUsername.trim()) {
                      socket.emit('friend:request', { targetUsername: newFriendUsername.trim() });
                      setNewFriendUsername('');
                    }
                  }}
                  disabled={!newFriendUsername.trim()}
                >
                  Send Request
                </button>
              </div>

              {/* Pending Incoming Requests */}
              {pendingRequests.length > 0 && (
                <>
                  <h3 style={{ marginTop: 32 }}>Pending Requests ({pendingRequests.length})</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {pendingRequests.map(request => (
                      <div
                        key={request.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: 12,
                          background: 'var(--bg-secondary)',
                          borderRadius: 8
                        }}
                      >
                        <div className="member-avatar-sm" style={{ background: request.requester?.customAvatar ? 'transparent' : request.requester?.color }}>
                          {request.requester?.customAvatar
                            ? <img src={request.requester.customAvatar} alt="" className="member-custom-avatar" />
                            : request.requester?.avatar}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, color: request.requester?.color }}>
                            {request.requester?.username || 'Unknown User'}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            Incoming friend request
                          </div>
                        </div>
                        <button
                          className="settings-btn primary"
                          style={{ marginTop: 0, padding: '6px 12px', fontSize: 12 }}
                          onClick={() => {
                            if (socket) {
                              socket.emit('friend:accept', { requestId: request.id });
                            }
                          }}
                        >
                          Accept
                        </button>
                        <button
                          className="settings-btn cancel"
                          style={{ marginTop: 0, padding: '6px 12px', fontSize: 12 }}
                          onClick={() => {
                            if (socket) {
                              socket.emit('friend:reject', { requestId: request.id });
                            }
                          }}
                        >
                          Reject
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Friends List */}
              <h3 style={{ marginTop: 32 }}>All Friends ({friendsList.length})</h3>
              {friendsList.length === 0 ? (
                <p className="settings-hint">No friends yet. Add some friends to get started!</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {friendsList.map(friend => {
                    const onlineUser = onlineUsers.find(u => u.id === friend.id);
                    const friendData = onlineUser || friend;
                    return (
                      <div
                        key={friend.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: 12,
                          background: 'var(--bg-secondary)',
                          borderRadius: 8
                        }}
                      >
                        <div className="member-avatar-sm" style={{ background: friendData.customAvatar ? 'transparent' : friendData.color }}>
                          {friendData.customAvatar
                            ? <img src={friendData.customAvatar} alt="" className="member-custom-avatar" />
                            : friendData.avatar}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, color: friendData.color }}>
                            {friendData.username}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            {onlineUser ? (
                              <span style={{ color: 'var(--green)' }}>● Online</span>
                            ) : (
                              'Offline'
                            )}
                          </div>
                        </div>
                        <button
                          className="settings-btn"
                          style={{ marginTop: 0, padding: '6px 12px', fontSize: 12 }}
                          onClick={() => {
                            if (socket) {
                              socket.emit('dm:create', { targetUserId: friend.id });
                              onClose();
                            }
                          }}
                        >
                          Message
                        </button>
                        <button
                          className="settings-btn cancel"
                          style={{ marginTop: 0, padding: '6px 12px', fontSize: 12 }}
                          onClick={() => {
                            if (socket && window.confirm(`Remove ${friendData.username} from your friends?`)) {
                              socket.emit('friend:remove', { friendId: friend.id });
                            }
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── MY SERVERS ── */}
          {tab==='servers' && (
            <div className="settings-section">
              <h2>Create a Server</h2>
              <AvatarUpload current={newServerCustomIcon} label="Server Icon (Optional)" onUpload={setNewServerCustomIcon}/>
              <label className="settings-label">Server Name</label>
              <input
                className="settings-input"
                value={newServerName}
                onChange={e=>setNewServerName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newServerName.trim()) {
                    createServer();
                  }
                }}
                placeholder="My Awesome Server"
                maxLength={32}
              />
              {!newServerCustomIcon && newServerName.trim() && (
                <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                  Preview: <span style={{ fontSize: 18, fontWeight: 600, marginLeft: 8 }}>{getServerInitials(newServerName)}</span>
                </div>
              )}
              <button
                className={`settings-btn ${serverCreated ? '' : 'primary'}`}
                onClick={createServer}
                disabled={!newServerName.trim()}
                style={serverCreated ? {
                  background: 'var(--green)',
                  color: '#fff',
                  transition: 'all 0.2s ease'
                } : {}}
              >
                {serverCreated ? '✓ Created' : 'Create Server'}
              </button>

              <div className="collapsible-section" style={{marginTop: 32}}>
                <button className="collapsible-header" onClick={() => setYourServersOpen(p => !p)}>
                  <span className={`collapsible-arrow ${yourServersOpen ? 'open' : ''}`}>▶</span>
                  <h2 style={{margin:0, fontSize:18}}>Your Servers</h2>
                </button>
                {yourServersOpen && (
                  <div className="collapsible-body">
                    {servers.map(srv=>(
                      <ServerListItemWithInvite key={srv.id} srv={srv} socket={socket} />
                    ))}
                  </div>
                )}
              </div>

              <h2 style={{marginTop:32}}>Join a Server</h2>
              <JoinServerSection socket={socket} />
            </div>
          )}

          {/* ── SERVER SETTINGS ── */}
          {tab==='server-settings' && server && (
            <div className="settings-section">
              <h2>Server Settings</h2>
              <AvatarUpload current={serverCustomIcon} label="Server Icon (Optional)" onUpload={setServerCustomIcon}/>
              <label className="settings-label">Server Name</label>
              <input
                className="settings-input"
                value={serverName}
                onChange={e=>setServerName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && serverName.trim()) {
                    saveServer();
                  }
                }}
                maxLength={32}
              />
              <label className="settings-label">Description</label>
              <textarea className="settings-input settings-textarea" value={serverDesc} onChange={e=>setServerDesc(e.target.value)} maxLength={256}/>
              {!serverCustomIcon && serverName.trim() && (
                <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                  Preview: <span style={{ fontSize: 18, fontWeight: 600, marginLeft: 8 }}>{getServerInitials(serverName)}</span>
                </div>
              )}
              <button
                className={`settings-btn ${serverSaved ? '' : 'primary'}`}
                onClick={saveServer}
                style={serverSaved ? {
                  background: 'var(--green)',
                  color: '#fff',
                  transition: 'all 0.2s ease'
                } : {}}
              >
                {serverSaved ? '✓ Saved' : 'Save Server'}
              </button>

              {/* Emoji Sharing Toggle */}
              {(isOwner || userPerms.admin) && (
                <div className="audio-toggle" style={{ marginTop: 24 }}>
                  <div>
                    <div className="audio-toggle-label">Allow Emoji Sharing</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      Let members use this server's custom emojis in other servers
                    </div>
                  </div>
                  <label className="toggle-switch">
                    <input type="checkbox" checked={emojiSharing} onChange={e => {
                      setEmojiSharing(e.target.checked);
                      if (socket && server) {
                        socket.emit('server:update', { serverId: server.id, emojiSharing: e.target.checked });
                      }
                    }} />
                    <span className="toggle-slider" />
                  </label>
                </div>
              )}

              {/* Voice / WebRTC — Owner Only */}
              {isOwner && (
                <div className="collapsible-section" style={{ marginTop: 24 }}>
                  <button className="collapsible-header" onClick={() => setIceConfigOpen(p => !p)}>
                    <span className={`collapsible-arrow ${iceConfigOpen ? 'open' : ''}`}>&#9654;</span>
                    <span>Voice / WebRTC</span>
                  </button>
                  {iceConfigOpen && (
                    <div className="collapsible-body" style={{ paddingTop: 12 }}>
                      <p className="settings-hint" style={{ marginBottom: 12 }}>
                        Configure custom STUN/TURN relay servers for this server. When disabled, the instance defaults are used.
                        Custom relay servers can help users behind restrictive firewalls connect to voice.
                      </p>
                      <div className="audio-toggle" style={{ marginBottom: 16 }}>
                        <div>
                          <div className="audio-toggle-label">Use custom relay servers</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                            Override instance STUN/TURN defaults for this server
                          </div>
                        </div>
                        <label className="toggle-switch">
                          <input type="checkbox" checked={useCustomIce} onChange={e => {
                            setUseCustomIce(e.target.checked);
                            if (!e.target.checked && socket && server) {
                              // Clear custom config
                              socket.emit('server:update', { serverId: server.id, iceConfig: null });
                              setIceStunUrls('');
                              setIceTurnUrl('');
                              setIceTurnSecret('');
                              setIceSaved(true);
                              setTimeout(() => setIceSaved(false), 2000);
                            }
                          }} />
                          <span className="toggle-slider" />
                        </label>
                      </div>

                      {useCustomIce && (
                        <>
                          <label className="settings-label">STUN Server URLs (one per line)</label>
                          <textarea
                            className="settings-input settings-textarea"
                            value={iceStunUrls}
                            onChange={e => setIceStunUrls(e.target.value)}
                            placeholder={'stun:stun.l.google.com:19302\nstun:stun1.l.google.com:19302'}
                            rows={3}
                            style={{ fontFamily: 'monospace', fontSize: 13 }}
                          />
                          <p className="settings-hint" style={{ marginBottom: 12 }}>
                            Each URL must start with <code>stun:</code> or <code>stuns:</code>
                          </p>

                          <label className="settings-label">TURN Server URL</label>
                          <input
                            className="settings-input"
                            value={iceTurnUrl}
                            onChange={e => setIceTurnUrl(e.target.value)}
                            placeholder="turn:turn.example.com:3478"
                            style={{ fontFamily: 'monospace', fontSize: 13 }}
                          />
                          <p className="settings-hint" style={{ marginBottom: 12 }}>
                            Must start with <code>turn:</code> or <code>turns:</code>
                          </p>

                          <label className="settings-label">TURN Shared Secret</label>
                          <input
                            className="settings-input"
                            type="password"
                            value={iceTurnSecret}
                            onChange={e => setIceTurnSecret(e.target.value)}
                            placeholder="Shared secret for ephemeral credentials"
                          />
                          <p className="settings-hint" style={{ marginBottom: 16 }}>
                            Used to generate short-lived credentials. The secret itself is never sent to clients.
                            Changing this will require users to reconnect to voice.
                          </p>

                          <button
                            className={`settings-btn ${iceSaved ? '' : 'primary'}`}
                            disabled={iceSaving}
                            style={iceSaved ? { background: 'var(--green)', color: '#fff', transition: 'all 0.2s ease' } : {}}
                            onClick={() => {
                              if (!socket || !server) return;

                              // Validate
                              const stunLines = iceStunUrls.split('\n').map(s => s.trim()).filter(Boolean);
                              const stunPattern = /^(stun|stuns):/;
                              const turnPattern = /^(turn|turns):/;

                              for (const url of stunLines) {
                                if (!stunPattern.test(url)) {
                                  alert(`Invalid STUN URL: "${url}" — must start with stun: or stuns:`);
                                  return;
                                }
                              }
                              if (iceTurnUrl && !turnPattern.test(iceTurnUrl)) {
                                alert('Invalid TURN URL — must start with turn: or turns:');
                                return;
                              }
                              if (iceTurnUrl && !iceTurnSecret) {
                                alert('TURN shared secret is required when a TURN URL is set');
                                return;
                              }

                              setIceSaving(true);
                              const iceConfig = {};
                              if (stunLines.length > 0) iceConfig.stunUrls = stunLines;
                              if (iceTurnUrl) iceConfig.turnUrl = iceTurnUrl;
                              // Only send secret if user actually changed it (not the placeholder)
                              if (iceTurnSecret && iceTurnSecret !== '********') {
                                iceConfig.turnSecret = iceTurnSecret;
                              }

                              // Listen for acknowledgment
                              const onAck = () => {
                                setIceSaving(false);
                                setIceSaved(true);
                                setTimeout(() => setIceSaved(false), 2000);
                              };
                              socket.once('server:ice-config:updated', onAck);
                              // Timeout fallback in case ack never arrives
                              setTimeout(() => {
                                socket.off('server:ice-config:updated', onAck);
                                setIceSaving(false);
                              }, 5000);

                              socket.emit('server:update', { serverId: server.id, iceConfig });
                            }}
                          >
                            {iceSaving ? 'Saving...' : iceSaved ? 'Saved' : 'Save ICE Config'}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Leave Server - Non-Owners (always visible outside danger zone) */}
              {currentUser && server.ownerId !== currentUser.id && (
                <div style={{ marginTop: 32, padding: 16, background: 'rgba(237, 66, 69, 0.05)', borderRadius: 6 }}>
                  <h4 style={{ fontSize: 14, marginBottom: 8, color: 'var(--header-primary)' }}>Leave Server</h4>
                  <p className="settings-hint" style={{ marginBottom: 12 }}>Leave this server. You can rejoin with an invite link.</p>
                  {!showLeaveConfirm ? (
                    <button className="settings-btn" style={{ background: 'var(--red)', color: '#fff' }} onClick={() => setShowLeaveConfirm(true)}>
                      Leave Server
                    </button>
                  ) : (
                    <div>
                      <p style={{ color: 'var(--red)', marginBottom: 12, fontWeight: 600 }}>
                        Are you sure you want to leave "{server.name}"?
                      </p>
                      <div className="settings-row">
                        <button className="settings-btn" style={{ background: 'var(--red)', color: '#fff' }}
                          onClick={() => { if (socket) { socket.emit('server:leave', { serverId: server.id }); onClose(); } }}>
                          Yes, Leave Server
                        </button>
                        <button className="settings-btn cancel" onClick={() => setShowLeaveConfirm(false)}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Danger Zone - Owner Only, Collapsible */}
              {currentUser && server.ownerId === currentUser.id && (
                <div className="collapsible-section danger-zone" style={{ marginTop: 32 }}>
                  <button className="collapsible-header danger" onClick={() => setDangerZoneOpen(p => !p)}>
                    <span className={`collapsible-arrow ${dangerZoneOpen ? 'open' : ''}`}>▶</span>
                    <span>Danger Zone</span>
                  </button>
                  {dangerZoneOpen && (
                    <div className="collapsible-body" style={{ borderTop: '2px solid rgba(237, 66, 69, 0.2)', paddingTop: 16 }}>
                      {/* Re-authentication gate */}
                      {reAuthTarget ? (
                        <div style={{ padding: 16, background: 'rgba(237, 66, 69, 0.05)', borderRadius: 6, marginBottom: 16 }}>
                          <h4 style={{ fontSize: 14, marginBottom: 8 }}>Re-authenticate to continue</h4>
                          <p className="settings-hint" style={{ marginBottom: 8 }}>Enter your password to {reAuthTarget === 'delete' ? 'delete this server' : 'transfer ownership'}.</p>
                          {reAuthError && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 8 }}>{reAuthError}</p>}
                          <input
                            className="settings-input"
                            type="password"
                            placeholder="Password"
                            value={reAuthPassword}
                            onChange={e => setReAuthPassword(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') document.getElementById('reauth-confirm-btn')?.click(); }}
                          />
                          <div className="settings-row" style={{ marginTop: 12 }}>
                            <button id="reauth-confirm-btn" className="settings-btn primary" disabled={!reAuthPassword}
                              onClick={async () => {
                                try {
                                  const res = await fetch(`${getServerUrl()}/api/auth/login`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ username: currentUser.username, password: reAuthPassword })
                                  });
                                  if (!res.ok) { setReAuthError('Incorrect password.'); return; }
                                  setReAuthError('');
                                  const action = reAuthTarget;
                                  setReAuthTarget(null);
                                  setReAuthPassword('');
                                  if (action === 'transfer') setShowTransferConfirm(true);
                                  else if (action === 'delete') setShowDeleteConfirm(true);
                                } catch (err) {
                                  setReAuthError('Authentication failed. Try again.');
                                }
                              }}>
                              Verify
                            </button>
                            <button className="settings-btn cancel" onClick={() => { setReAuthTarget(null); setReAuthPassword(''); setReAuthError(''); }}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {/* Transfer Ownership */}
                          <div style={{ marginBottom: 20, padding: 16, background: 'rgba(237, 66, 69, 0.05)', borderRadius: 6 }}>
                            <h4 style={{ fontSize: 14, marginBottom: 8, color: 'var(--header-primary)' }}>Transfer Ownership</h4>
                            <p className="settings-hint" style={{ marginBottom: 12 }}>Transfer server ownership to another member. You will become a regular admin.</p>
                            {!showTransferConfirm ? (
                              <button className="settings-btn" style={{ background: 'var(--yellow)', color: '#000' }} onClick={() => setReAuthTarget('transfer')}>
                                Transfer Ownership
                              </button>
                            ) : (
                              <div>
                                <label className="settings-label">Select New Owner</label>
                                <select className="settings-input" value={transferTargetId} onChange={e => setTransferTargetId(e.target.value)}>
                                  <option value="">Choose a member...</option>
                                  {Object.entries(server.members || {})
                                    .filter(([uid]) => uid !== currentUser.id && !uid.startsWith('guest:'))
                                    .map(([uid]) => {
                                      const member = onlineUsers.find(u => u.id === uid);
                                      return <option key={uid} value={uid}>{member?.username || uid}</option>;
                                    })}
                                </select>
                                <div className="settings-row" style={{ marginTop: 12 }}>
                                  <button className="settings-btn primary" disabled={!transferTargetId}
                                    onClick={() => {
                                      if (socket && transferTargetId) {
                                        socket.emit('server:transfer-ownership', { serverId: server.id, newOwnerId: transferTargetId });
                                        setShowTransferConfirm(false); setTransferTargetId('');
                                      }
                                    }}>Confirm Transfer</button>
                                  <button className="settings-btn cancel" onClick={() => { setShowTransferConfirm(false); setTransferTargetId(''); }}>Cancel</button>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Delete Server */}
                          <div style={{ marginBottom: 20, padding: 16, background: 'rgba(237, 66, 69, 0.1)', borderRadius: 6 }}>
                            <h4 style={{ fontSize: 14, marginBottom: 8, color: 'var(--red)' }}>Delete Server</h4>
                            <p className="settings-hint" style={{ marginBottom: 12 }}>
                              Permanently delete this server. This action CANNOT be undone.
                            </p>
                            {!showDeleteConfirm ? (
                              <button className="settings-btn" style={{ background: 'var(--red)', color: '#fff' }} onClick={() => setReAuthTarget('delete')}>
                                Delete Server
                              </button>
                            ) : (
                              <div>
                                <p style={{ color: 'var(--red)', marginBottom: 12, fontWeight: 600 }}>
                                  Type the server name to confirm: <strong>{server.name}</strong>
                                </p>
                                <input className="settings-input" placeholder={`Type "${server.name}" to confirm`}
                                  onChange={(e) => {
                                    if (e.target.value === server.name) {
                                      socket?.emit('server:delete', { serverId: server.id });
                                      onClose();
                                      e.target.value = '';
                                    }
                                  }} />
                                <button className="settings-btn cancel" style={{ marginTop: 12 }} onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── CHANNELS ── */}
          {tab==='channels' && server && (
            <div className="settings-section">
              <h2>Channels & Categories</h2>
              {editingChannel ? (
                <div className="edit-channel-form">
                  <h3>Edit {editingChannel.type==='voice' ? <SpeakerIcon /> : <HashIcon />} {editingChannel.name}</h3>
                  <label className="settings-label">Name</label>
                  <input className="settings-input" value={editingChannel.name} onChange={e=>setEditingChannel(p=>({...p,name:e.target.value}))}/>
                  <label className="settings-label">Description</label>
                  <input className="settings-input" value={editingChannel.description||''} onChange={e=>setEditingChannel(p=>({...p,description:e.target.value}))}/>
                  {editingChannel.type==='text' && <>
                    <label className="settings-label">Topic</label>
                    <input className="settings-input" value={editingChannel.topic||''} onChange={e=>setEditingChannel(p=>({...p,topic:e.target.value}))} placeholder="Channel topic..."/>
                  </>}
                  <label className="settings-label">Visibility</label>
                  <div className="settings-row">
                    <button className={`type-btn ${!editingChannel.isPrivate?'active':''}`} onClick={()=>setEditingChannel(p=>({...p,isPrivate:false}))}>Public</button>
                    <button className={`type-btn ${editingChannel.isPrivate?'active':''}`} onClick={()=>setEditingChannel(p=>({...p,isPrivate:true}))}>🔒 Private</button>
                  </div>

                  <h3>Permission Overrides</h3>
                  <p className="settings-hint">Override server-level permissions for this channel. null = inherit from role.</p>
                  <label className="settings-label">Override target</label>
                  <select className="settings-select" value={chPermTarget} onChange={e=>setChPermTarget(e.target.value)}>
                    <option value="role:everyone">@everyone</option>
                    {Object.values(roles).filter(r=>r.id!=='everyone').map(r=>(
                      <option key={r.id} value={`role:${r.id}`}>{r.name}</option>
                    ))}
                  </select>
                  <div className="ch-perms-table">
                    {Object.entries(CH_PERM_LABELS).map(([key,label])=>{
                      const val = getChPermValue(key);
                      return (
                        <div key={key} className="ch-perm-row">
                          <span className="ch-perm-label">{label}</span>
                          <div className="ch-perm-btns">
                            <button className={`perm-tri ${val===true?'allow':''}`} onClick={()=>setChPerm(key,true)} title="Allow">✓</button>
                            <button className={`perm-tri ${val===null?'inherit':''}`} onClick={()=>setChPerm(key,null)} title="Inherit">/</button>
                            <button className={`perm-tri ${val===false?'deny':''}`} onClick={()=>setChPerm(key,false)} title="Deny">✕</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="settings-row">
                    <button
                      className={`settings-btn ${channelSaved ? '' : 'primary'}`}
                      onClick={saveChannel}
                      style={channelSaved ? {
                        background: 'var(--green)',
                        color: '#fff',
                        transition: 'all 0.2s ease'
                      } : {}}
                    >
                      {channelSaved ? '✓ Saved' : 'Save Channel'}
                    </button>
                    <button className="settings-btn cancel" onClick={()=>setEditingChannel(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  {categoryOrder.map((catId, catIdx) => {
                    const cat = categories[catId];
                    if (!cat) return null;
                    const catChannels = (cat.channels||[]).map(id=>allChannels.find(c=>c.id===id)).filter(Boolean);
                    const canMoveUp = catIdx > 0;
                    const canMoveDown = catIdx < categoryOrder.length - 1;
                    return (
                      <div key={catId} className="category-section">
                        <div className="category-header-edit collapsible"
                          onClick={() => setCollapsedCategories(prev => ({ ...prev, [catId]: !prev[catId] }))}
                        >
                          <span className={`category-collapse-arrow ${!collapsedCategories[catId] ? 'open' : ''}`}>▶</span>
                          <span className="category-name-edit">{cat.name}</span>
                          <div className="category-move-buttons" onClick={e => e.stopPropagation()}>
                            <button
                              className="icon-btn"
                              onClick={() => handleCategoryMove(catId, 'up')}
                              disabled={!canMoveUp}
                              title="Move category up"
                              style={{opacity: canMoveUp ? 1 : 0.3, cursor: canMoveUp ? 'pointer' : 'not-allowed'}}
                            >
                              ▲
                            </button>
                            <button
                              className="icon-btn"
                              onClick={() => handleCategoryMove(catId, 'down')}
                              disabled={!canMoveDown}
                              title="Move category down"
                              style={{opacity: canMoveDown ? 1 : 0.3, cursor: canMoveDown ? 'pointer' : 'not-allowed'}}
                            >
                              ▼
                            </button>
                          </div>
                        </div>
                        {!collapsedCategories[catId] && (<>
                          {catChannels.map((ch,idx)=>(
                          <DraggableItem key={ch.id} item={ch} index={idx}
                            onDragStart={i=>setDragIdx(i)}
                            onDragOver={()=>{}}
                            onDrop={toIdx=>{ handleChDragDrop(catId, dragIdx, toIdx); setDragIdx(null); }}>
                            <span className="ch-type-badge">{ch.type==='voice' ? <SpeakerIcon /> : <HashIcon />}</span>
                            <span className="ch-name">{ch.name}</span>
                            {ch.isPrivate && <span className="ch-private-badge">🔒</span>}
                            <div className="ch-actions">
                              <button className="icon-btn" onClick={()=>{ setEditingChannel({...ch}); setChPermTarget('role:everyone'); }} title="Edit">Edit</button>
                              <button className="icon-btn danger" onClick={()=>deleteChannel(ch.id)} title="Delete">Del</button>
                            </div>
                          </DraggableItem>
                        ))}
                        <div className="add-to-category">
                          <input
                            className="settings-input inline-input"
                            placeholder="New channel name..."
                            value={newChannelName}
                            onChange={e=>setNewChannelName(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && newChannelName.trim()) {
                                createChannel(newChannelName, newChannelType, '', catId, false);
                              }
                            }}
                          />
                          <div className="settings-row" style={{marginTop:4}}>
                            {['text','voice'].map(t=>(
                              <button key={t} className={`type-btn small ${newChannelType===t?'active':''}`} onClick={()=>setNewChannelType(t)}>
                                {t==='text'?'#':'Voice'} {t}
                              </button>
                            ))}
                            <button
                              className={`settings-btn ${channelCreated ? '' : 'primary'}`}
                              style={channelCreated ? {
                                marginTop: 0,
                                padding: '4px 12px',
                                fontSize: 12,
                                background: 'var(--green)',
                                color: '#fff',
                                transition: 'all 0.2s ease'
                              } : {marginTop:0,padding:'4px 12px',fontSize:12}}
                              onClick={()=>createChannel(newChannelName, newChannelType, '', catId, false)}
                              disabled={!newChannelName.trim()}
                            >
                              {channelCreated ? '✓' : 'Add'}
                            </button>
                          </div>
                        </div>
                        </>)}
                      </div>
                    );
                  })}

                  <div className="create-category-form">
                    <h3>Create New...</h3>
                    <label className="settings-label">Type</label>
                    <select className="settings-select" value={creationType} onChange={e=>setCreationType(e.target.value)}>
                      <option value="category">Category</option>
                      <option value="text">Text Channel</option>
                      <option value="voice">Voice Channel</option>
                    </select>

                    {creationType === 'category' && (
                      <>
                        <label className="settings-label">Category Name</label>
                        <div className="settings-row">
                          <input className="settings-input inline-input" placeholder="GENERAL" value={newCategoryName} onChange={e=>setNewCategoryName(e.target.value.toUpperCase())} style={{flex:1}} maxLength={32}/>
                          <button
                            className={`settings-btn ${categorySaved ? '' : 'primary'}`}
                            style={categorySaved ? {
                              marginTop: 0,
                              background: 'var(--green)',
                              color: '#fff',
                              transition: 'all 0.2s ease'
                            } : { marginTop: 0 }}
                            onClick={createCategory}
                            disabled={!newCategoryName.trim()}
                          >
                            {categorySaved ? '✓ Created' : 'Create Category'}
                          </button>
                        </div>
                      </>
                    )}

                    {(creationType === 'text' || creationType === 'voice') && (
                      <>
                        <label className="settings-label">Channel Name</label>
                        <input className="settings-input" placeholder={creationType === 'text' ? 'general-chat' : 'Lounge'} value={newChannelName} onChange={e=>setNewChannelName(e.target.value)} maxLength={32}/>

                        <label className="settings-label">Description</label>
                        <input className="settings-input" placeholder="Channel description" value={newChannelDescription} onChange={e=>setNewChannelDescription(e.target.value)} maxLength={128}/>

                        <label className="settings-label">Parent Category</label>
                        <select className="settings-select" value={newChannelCategory} onChange={e=>setNewChannelCategory(e.target.value)}>
                          <option value="">No Category</option>
                          {categoryOrder.map(catId => {
                            const cat = categories[catId];
                            if (!cat) return null;
                            return <option key={catId} value={catId}>{cat.name}</option>;
                          })}
                        </select>

                        <label className="settings-label">Visibility</label>
                        <div className="settings-row">
                          <button className={`type-btn ${!newChannelPrivate?'active':''}`} onClick={()=>setNewChannelPrivate(false)}>Public</button>
                          <button className={`type-btn ${newChannelPrivate?'active':''}`} onClick={()=>setNewChannelPrivate(true)}>🔒 Private</button>
                        </div>

                        <button
                          className={`settings-btn ${channelCreated ? '' : 'primary'}`}
                          onClick={()=>{
                            if (!newChannelName.trim()) return;
                            createChannel(newChannelName, creationType, newChannelDescription, newChannelCategory || Object.keys(categories)[0], newChannelPrivate);
                          }}
                          disabled={!newChannelName.trim()}
                          style={channelCreated ? {
                            background: 'var(--green)',
                            color: '#fff',
                            transition: 'all 0.2s ease'
                          } : {}}
                        >
                          {channelCreated ? '✓ Created' : `Create ${creationType === 'text' ? 'Text Channel' : 'Voice Channel'}`}
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── ROLES ── */}
          {tab==='roles' && server && (
            <div className="settings-section">
              <h2>Roles & Permissions</h2>
              {editingRole ? (
                <div className="edit-role-form">
                  <h3>Edit: {editingRole.name}</h3>
                  {editingRole.id !== 'everyone' && (
                    <>
                      <label className="settings-label">Role Name</label>
                      <input className="settings-input" value={editingRole.name} onChange={e=>setEditingRole(p=>({...p,name:e.target.value}))}/>
                    </>
                  )}
                  <label className="settings-label">Color</label>
                  <div className="color-grid">
                    {COLORS.map(c=>(
                      <button key={c} className={`color-opt ${editingRole.color===c?'selected':''}`} style={{background:c}} onClick={()=>setEditingRole(p=>({...p,color:c}))}/>
                    ))}
                    <div className={`color-picker-swatch ${!COLORS.includes(editingRole.color) && editingRole.color ? 'selected' : ''}`}
                      style={{background: (!COLORS.includes(editingRole.color) && editingRole.color) || '#666'}}
                      title="Custom color">
                      <input type="color" value={editingRole.color || '#3B82F6'}
                        onChange={e => setEditingRole(p=>({...p,color:e.target.value}))}/>
                    </div>
                  </div>
                  <div className="color-picker-custom">
                    <input className="color-picker-hex-input" placeholder="Hex, RGB, or HSL..."
                      value={customRoleColorInput}
                      onChange={e => {
                        setCustomRoleColorInput(e.target.value);
                        const parsed = parseColorInput(e.target.value);
                        if (parsed) setEditingRole(p=>({...p,color:parsed}));
                      }}
                    />
                  </div>
                  <label className="settings-label">Permissions</label>
                  <div className="perms-grid">
                    {Object.entries(PERM_LABELS).map(([key,label])=>{
                      const isAdmin = !!editingRole.permissions['admin'];
                      const isAdminPerm = key === 'admin';
                      const isDisabled = (isAdmin && !isAdminPerm) || (isAdminPerm && !isOwner);
                      return (
                        <label key={key} className={`perm-toggle ${isDisabled ? 'disabled' : ''}`} title={isAdminPerm && !isOwner ? 'Only the server owner can grant admin' : ''}>
                          <input
                            type="checkbox"
                            checked={isAdmin || !!editingRole.permissions[key]}
                            disabled={isDisabled}
                            onChange={e=>setEditingRole(p=>({...p,permissions:{...p.permissions,[key]:e.target.checked}}))}
                          />
                          <span>{label}</span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="settings-row">
                    <button
                      className={`settings-btn ${roleSaved ? '' : 'primary'}`}
                      onClick={saveRole}
                      style={roleSaved ? {
                        background: 'var(--green)',
                        color: '#fff',
                        transition: 'all 0.2s ease'
                      } : {}}
                    >
                      {roleSaved ? '✓ Saved' : 'Save Role'}
                    </button>
                    <button className="settings-btn cancel" onClick={()=>setEditingRole(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="roles-list">
                    {Object.values(roles).map(role=>{
                      const manageable = canManageRole(role);
                      return (
                        <div key={role.id} className="role-item">
                          <span className="role-dot" style={{background:role.color||'#99aab5'}}/>
                          <span className="role-name" style={{color:role.color||'inherit'}}>{role.name}</span>
                          {manageable && (
                            <button className="icon-btn" onClick={()=>setEditingRole({...role})} title="Edit">Edit</button>
                          )}
                          {manageable && role.id !== 'everyone' && role.id !== 'admin' && (
                            <button className="icon-btn danger" onClick={()=>deleteRole(role.id)} title="Delete role">Delete</button>
                          )}
                          {!manageable && role.id !== 'everyone' && (
                            <span style={{fontSize:11,color:'var(--text-muted)',marginLeft:'auto'}}>Above your rank</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <h3>Create Role</h3>
                  <label className="settings-label">Name</label>
                  <input className="settings-input" value={newRoleName} onChange={e=>setNewRoleName(e.target.value)} placeholder="New Role" maxLength={32}/>
                  <label className="settings-label">Color</label>
                  <div className="color-grid">
                    {COLORS.map(c=>(
                      <button key={c} className={`color-opt ${newRoleColor===c?'selected':''}`} style={{background:c}} onClick={()=>setNewRoleColor(c)}/>
                    ))}
                    <div className={`color-picker-swatch ${!COLORS.includes(newRoleColor) && newRoleColor ? 'selected' : ''}`}
                      style={{background: (!COLORS.includes(newRoleColor) && newRoleColor) || '#666'}}
                      title="Custom color">
                      <input type="color" value={newRoleColor || '#3B82F6'}
                        onChange={e => setNewRoleColor(e.target.value)}/>
                    </div>
                  </div>
                  <button
                    className={`settings-btn ${roleCreated ? '' : 'primary'}`}
                    onClick={createRole}
                    disabled={!newRoleName.trim()}
                    style={roleCreated ? {
                      background: 'var(--green)',
                      color: '#fff',
                      transition: 'all 0.2s ease'
                    } : {}}
                  >
                    {roleCreated ? '✓ Created' : 'Create Role'}
                  </button>
                </>
              )}
            </div>
          )}

          {/* ── MEMBERS ── */}
          {tab==='members' && server && (
            <div className="settings-section">
              <h2>Members</h2>
              <p className="settings-hint">Assign roles to members. Changes take effect immediately.</p>
              <div className="search-input-container" style={{marginBottom:12}}>
                <input className="settings-input" placeholder="Search by username..." value={memberSearch}
                  onChange={e=>setMemberSearch(e.target.value)}/>
                {memberSearch && (
                  <button
                    className="search-clear-btn"
                    onClick={() => setMemberSearch('')}
                    title="Clear search"
                  >
                    ×
                  </button>
                )}
              </div>
              <div className="members-manage-list">
                {allChannelMemberIds
                  .map(uid => {
                    const member = members[uid];
                    // Find real user info from online users, or show partial ID
                    const onlineUser = onlineUsers.find(u => u.id === uid);
                    return { uid, member, onlineUser };
                  })
                  .filter(({uid, onlineUser}) => {
                    if (!memberSearch) return true;
                    const name = onlineUser?.username || uid;
                    return name.toLowerCase().includes(memberSearch.toLowerCase());
                  })
                  .map(({uid, member, onlineUser}) => (
                    <div key={uid} className="member-manage-item">
                      <div className="member-avatar-sm" style={{background: onlineUser?.customAvatar ? 'transparent' : (onlineUser?.color || '#3B82F6')}}>
                        {onlineUser?.customAvatar
                          ? <img src={onlineUser.customAvatar} alt="" className="avatar-upload-img"/>
                          : (onlineUser?.avatar || 'U')}
                      </div>
                      <div className="member-manage-info">
                        <span className="member-manage-username" style={{color: onlineUser?.color}}>
                          {onlineUser?.username || uid.slice(0,8)+'…'}
                          {uid === currentUser?.id && <span style={{color:'var(--text-muted)',fontWeight:400}}> (you)</span>}
                          {!onlineUser && <span style={{color:'var(--text-muted)',fontSize:11}}> (offline)</span>}
                        </span>
                        <div className="member-manage-roles">
                          {(member?.roles||[]).map(roleId=>{
                            const role = roles[roleId];
                            if (!role) return null;
                            const removable = canManageRole(role) && roleId !== 'everyone';
                            return (
                              <span key={roleId} className="role-pill" style={{background:role.color||'#4f545c'}}>
                                {role.name}
                                {removable && (
                                  <button className="role-pill-remove" onClick={()=>assignRole(uid,roleId,'remove')}>×</button>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                      <select className="settings-select member-role-select"
                        onChange={e=>{ if(e.target.value) { assignRole(uid,e.target.value,'add'); e.target.value=''; }}}
                        defaultValue="">
                        <option value="">+ Add role</option>
                        {Object.values(roles).filter(r=>r.id!=='everyone'&&!(member?.roles||[]).includes(r.id)&&canManageRole(r)).map(r=>(
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                    </div>
                  ))
                }
              </div>
            </div>
          )}

          {/* ── WEBHOOKS ── */}
          {tab==='webhooks' && server && (
            <div className="settings-section">
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}}>
                <h2 style={{margin: 0}}>Webhooks</h2>
                <button
                  className="settings-btn"
                  onClick={() => setShowWebhookDocs(true)}
                  style={{padding: '8px 16px', fontSize: '14px'}}
                >
                  📚 View Documentation
                </button>
              </div>
              <p className="settings-hint">POST JSON to a webhook URL to send a message to a channel. Keep the token secret — anyone with the URL can post.</p>
              <div className="webhook-example-box">
                <strong>Example curl:</strong>
                <code className="webhook-curl-example">{`curl -X POST -H "Content-Type: application/json" \\
  -d '{"content":"Hello from webhook!","username":"MyBot"}' \\
  http://YOUR_SERVER:3000/api/webhooks/WEBHOOK_ID/TOKEN`}</code>
              </div>

              {createdWebhook && (
                <div className="webhook-url-box">
                  <strong>Webhook Created!</strong>
                  <p>Copy this URL — it won't be shown again:</p>
                  <div className="webhook-url">
                    <code>{window.location.origin}{createdWebhook.url}</code>
                    <button className="copy-btn" onClick={()=>navigator.clipboard.writeText(window.location.origin+createdWebhook.url)}>Copy</button>
                  </div>
                  <button className="settings-btn" onClick={()=>setCreatedWebhook(null)}>Dismiss</button>
                </div>
              )}

              {(server.channels?.text||[]).map(ch=>(
                (ch.webhooks||[]).length>0 && (
                  <div key={ch.id} className="webhook-channel-group">
                    <h3>#{ch.name}</h3>
                    {ch.webhooks.map(wh=>(
                      <div key={wh.id} className="webhook-item">
                        <span className="webhook-icon">🤖</span>
                        <span className="webhook-name">{wh.name}</span>
                        <button className="icon-btn danger" onClick={()=>deleteWebhook(ch.id,wh.id)}>Del</button>
                      </div>
                    ))}
                  </div>
                )
              ))}

              <h3>Create Webhook</h3>
              <label className="settings-label">Name</label>
              <input
                className="settings-input"
                value={newWebhookName}
                onChange={e=>setNewWebhookName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newWebhookName.trim() && selectedWebhookCh) {
                    createWebhook();
                  }
                }}
                placeholder="My Bot"
                maxLength={32}
              />
              <label className="settings-label">Channel</label>
              <select className="settings-select" value={selectedWebhookCh} onChange={e=>setSelectedWebhookCh(e.target.value)}>
                <option value="">Select channel...</option>
                {(server.channels?.text||[]).map(ch=>(
                  <option key={ch.id} value={ch.id}>#{ch.name}</option>
                ))}
              </select>
              <button
                className={`settings-btn ${webhookCreated ? '' : 'primary'}`}
                onClick={createWebhook}
                disabled={!newWebhookName.trim()||!selectedWebhookCh}
                style={webhookCreated ? {
                  background: 'var(--green)',
                  color: '#fff',
                  transition: 'all 0.2s ease'
                } : {}}
              >
                {webhookCreated ? '✓ Created' : 'Create Webhook'}
              </button>
            </div>
          )}

          {/* ── SOUNDBOARD ── */}
          {tab==='soundboard' && server && (() => {
            const CLASSIC_NAMES = new Set(['Airhorn','Crickets','Sad Violin','Womp Womp','Rimshot','Sad Trombone','DUN DUN DUN','Vine Boom']);
            const MEME_NAMES = new Set(['Bruh','Oh No','Sheesh','Bonk','Noice','Sus','Wilhelm','Toot']);
            const classicSounds = soundboardSounds.filter(s => CLASSIC_NAMES.has(s.name));
            const memeSounds = soundboardSounds.filter(s => MEME_NAMES.has(s.name));
            const customSounds = soundboardSounds.filter(s => !CLASSIC_NAMES.has(s.name) && !MEME_NAMES.has(s.name));
            const pages = [
              { id: 'all', label: 'All', sounds: soundboardSounds },
              ...(customSounds.length > 0 ? [{ id: 'custom', label: 'Custom', sounds: customSounds }] : []),
              ...(memeSounds.length > 0 ? [{ id: 'meme', label: 'Meme', sounds: memeSounds }] : []),
              ...(classicSounds.length > 0 ? [{ id: 'classic', label: 'Classic', sounds: classicSounds }] : []),
            ];
            const activePage = pages.find(p => p.id === soundboardManagePage) || pages[0];
            return (
            <div className="settings-section">
              <h2>Soundboard</h2>
              <p className="settings-hint">Upload audio clips to play in voice channels. Max 8 seconds per clip.</p>

              {soundboardLoading ? (
                <div style={{textAlign:'center',padding:20,color:'var(--text-muted)'}}>Loading sounds...</div>
              ) : (
                <>
                  {/* Page navigation */}
                  {pages.length > 1 && !soundboardEditing && !soundboardAudioBuffer && (
                    <div className="soundboard-pages-nav" style={{marginBottom: 12, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6}}>
                      {pages.map(p => (
                        <button key={p.id} className={`soundboard-page-tab ${soundboardManagePage === p.id ? 'active' : ''}`}
                          onClick={() => setSoundboardManagePage(p.id)}>
                          {p.label} ({p.sounds.length})
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Sound list */}
                  {soundboardSounds.length > 0 && !soundboardEditing && !soundboardAudioBuffer && (
                    <div className="soundboard-list">
                      {activePage.sounds.map(sound => {
                        const uploaderName = sound.created_by && server?.members?.[sound.created_by]?.username;
                        const canDelete = userPerms.admin || isOwner || sound.created_by === currentUser?.id;
                        return (
                        <div key={sound.id} className="soundboard-item">
                          <span className="soundboard-item-emoji">{sound.emoji || '🔊'}</span>
                          <span className="soundboard-item-name">
                            {sound.name}
                            {sound.is_global && <span className="global-badge" title="Global sound">G</span>}
                          </span>
                          <span className="soundboard-item-duration">
                            {Math.round((sound.volume || 1) * 100)}% · {(sound.duration || 0).toFixed(1)}s
                            {uploaderName && <span style={{marginLeft:4,color:'var(--text-muted)',fontSize:11}}> · {uploaderName}</span>}
                          </span>
                          <div className="soundboard-item-actions">
                            <button className="settings-btn" style={{padding:'4px 10px',fontSize:12}} onClick={() => {
                              // Quick preview the trimmed audio
                              if (sound.trimmed_audio) {
                                const ctx = getSoundboardAudioCtx();
                                if (ctx.state === 'suspended') ctx.resume();
                                const toAB = (uri) => { const b = atob(uri.split(',')[1]); const u = new Uint8Array(b.length); for (let i=0;i<b.length;i++) u[i]=b.charCodeAt(i); return u.buffer; };
                                const bufPromise = sound.trimmed_audio.startsWith('data:') ? Promise.resolve(toAB(sound.trimmed_audio)) : fetch(sound.trimmed_audio).then(r => r.arrayBuffer());
                                bufPromise.then(buf => ctx.decodeAudioData(buf)).then(ab => {
                                  const src = ctx.createBufferSource();
                                  src.buffer = ab;
                                  const gain = ctx.createGain();
                                  gain.gain.value = sound.volume || 1.0;
                                  gain.connect(ctx.destination);
                                  src.connect(gain);
                                  src.start(0);
                                });
                              }
                            }}>Play</button>
                            {canDelete && <button className="settings-btn" style={{padding:'4px 10px',fontSize:12}} onClick={() => editSoundboardSound(sound)}>Edit</button>}
                            {canDelete && <button className="settings-btn danger-sm" onClick={() => deleteSoundboardSound(sound.id)}>Del</button>}
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Upload / Edit form */}
                  {(soundboardAudioBuffer || soundboardEditing) ? (
                    <div className="soundboard-editor">
                      <h3>{soundboardEditing ? 'Edit Sound' : 'New Sound'}</h3>
                      <div className="soundboard-form-row">
                        <div style={{flex:1}}>
                          <label className="settings-label">Name</label>
                          <input
                            className="settings-input"
                            value={soundboardForm.name}
                            onChange={e => setSoundboardForm({...soundboardForm, name: e.target.value})}
                            maxLength={32}
                            placeholder="Sound name"
                          />
                        </div>
                        <div style={{width:80}}>
                          <label className="settings-label">Emoji</label>
                          <input
                            className="settings-input"
                            value={soundboardForm.emoji}
                            onChange={e => setSoundboardForm({...soundboardForm, emoji: e.target.value})}
                            maxLength={10}
                            style={{textAlign:'center'}}
                          />
                        </div>
                      </div>

                      <div className="soundboard-form-row" style={{alignItems:'center'}}>
                        <div style={{flex:1}}>
                          <label className="settings-label">Volume: {soundboardVolume}%</label>
                          <input type="range" min={0} max={200} step={1} value={soundboardVolume}
                            onChange={e => setSoundboardVolume(parseInt(e.target.value))}
                            style={{width:'100%'}}
                          />
                        </div>
                        <label className="settings-label" style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',marginLeft:16}}>
                          <input type="checkbox" checked={soundboardIsGlobal}
                            onChange={e => setSoundboardIsGlobal(e.target.checked)}
                          />
                          Global
                        </label>
                      </div>

                      {soundboardEditing && !soundboardAudioBuffer && (
                        <div style={{padding:'12px 0'}}>
                          <button className="settings-btn" onClick={() => soundboardFileRef.current?.click()}>
                            Replace Audio File
                          </button>
                          <input ref={soundboardFileRef} type="file" accept="audio/*" style={{display:'none'}} onChange={handleSoundboardFileSelect}/>
                          <div className="soundboard-actions" style={{marginTop:12}}>
                            <button
                              className="settings-btn primary"
                              onClick={saveSoundboardSound}
                              disabled={!soundboardForm.name.trim() || soundboardSaving}
                            >
                              {soundboardSaving ? 'Saving...' : 'Update Sound'}
                            </button>
                            <button className="settings-btn" onClick={resetSoundboardForm}>Cancel</button>
                          </div>
                        </div>
                      )}

                      {soundboardAudioBuffer && (
                        <>
                          <label className="settings-label">Waveform & Trim</label>
                          <div className="soundboard-waveform-container">
                            <canvas ref={soundboardCanvasRef} className="soundboard-waveform"/>
                          </div>

                          <div className="soundboard-trim-controls">
                            <div className="soundboard-trim-row">
                              <label>Start: {soundboardTrimStart.toFixed(2)}s</label>
                              <input
                                type="range"
                                min={0}
                                max={soundboardDuration}
                                step={0.01}
                                value={soundboardTrimStart}
                                onChange={e => {
                                  const v = parseFloat(e.target.value);
                                  setSoundboardTrimStart(v);
                                  if (soundboardTrimEnd - v > 8) setSoundboardTrimEnd(v + 8);
                                  if (v >= soundboardTrimEnd) setSoundboardTrimEnd(Math.min(v + 0.1, soundboardDuration));
                                }}
                              />
                            </div>
                            <div className="soundboard-trim-row">
                              <label>End: {soundboardTrimEnd.toFixed(2)}s</label>
                              <input
                                type="range"
                                min={0}
                                max={soundboardDuration}
                                step={0.01}
                                value={soundboardTrimEnd}
                                onChange={e => {
                                  const v = parseFloat(e.target.value);
                                  setSoundboardTrimEnd(v);
                                  if (v - soundboardTrimStart > 8) setSoundboardTrimStart(v - 8);
                                  if (v <= soundboardTrimStart) setSoundboardTrimStart(Math.max(v - 0.1, 0));
                                }}
                              />
                            </div>
                            <div className="soundboard-trim-info">
                              Duration: {(soundboardTrimEnd - soundboardTrimStart).toFixed(2)}s / 8.00s max
                              {(soundboardTrimEnd - soundboardTrimStart) > 8 && <span style={{color:'var(--red)', marginLeft:8}}>Too long!</span>}
                            </div>
                          </div>

                          <div className="soundboard-actions">
                            <button
                              className={`settings-btn ${soundboardPreviewing ? 'danger-sm' : ''}`}
                              onClick={soundboardPreviewing ? stopSoundboardPreview : previewSoundboardTrim}
                              style={{padding:'6px 16px'}}
                            >
                              {soundboardPreviewing ? 'Stop' : 'Preview'}
                            </button>
                            <button
                              className="settings-btn primary"
                              onClick={saveSoundboardSound}
                              disabled={!soundboardForm.name.trim() || soundboardSaving || (soundboardTrimEnd - soundboardTrimStart) > 8 || (soundboardTrimEnd - soundboardTrimStart) < 0.1}
                            >
                              {soundboardSaving ? 'Saving...' : (soundboardEditing ? 'Update Sound' : 'Save Sound')}
                            </button>
                            <button className="settings-btn" onClick={resetSoundboardForm}>Cancel</button>
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <div style={{marginTop: 16}}>
                      <button className="settings-btn primary" onClick={() => soundboardFileRef.current?.click()}>
                        + Add Sound
                      </button>
                      <input ref={soundboardFileRef} type="file" accept="audio/*" style={{display:'none'}} onChange={handleSoundboardFileSelect}/>
                    </div>
                  )}
                </>
              )}
            </div>
          );})()}

          {/* ── EMOJIS ── */}
          {tab==='emojis' && server && (
            <div className="settings-section">
              <h2>Custom Emojis</h2>
              <p className="settings-hint">Upload custom emojis for this server. Images are resized to 64×64. Max 50 emojis.</p>

              {emojiLoading ? (
                <div style={{textAlign:'center',padding:20,color:'var(--text-muted)'}}>Loading emojis...</div>
              ) : (
                <>
                  {/* Emoji list */}
                  {emojiList.length > 0 && !emojiEditing && !emojiForm.preview && (
                    <div className="soundboard-list">
                      {emojiList.map(emoji => (
                        <div key={emoji.id} className="soundboard-item">
                          {emoji.imageData ? (
                            <img src={emoji.imageData} alt={emoji.name} style={{width:32,height:32,objectFit:'contain',borderRadius:4,flexShrink:0}} />
                          ) : (
                            <span style={{width:32,height:32,display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg-tertiary)',borderRadius:4,fontSize:18,flexShrink:0}}>😀</span>
                          )}
                          <span className="soundboard-item-name" style={{flex:1}}>:{emoji.name}:</span>
                          <div className="soundboard-item-actions">
                            <button className="settings-btn" style={{padding:'4px 10px',fontSize:12}} onClick={() => {
                              setEmojiEditing(emoji);
                              setEmojiForm({ name: emoji.name, file: null, preview: null });
                            }}>Edit</button>
                            <button className="settings-btn danger-sm" onClick={() => deleteEmoji(emoji.id)}>Del</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Upload / Edit form */}
                  {(emojiForm.preview || emojiEditing) ? (
                    <div className="soundboard-editor" style={{marginTop:16}}>
                      <h3>{emojiEditing ? 'Edit Emoji' : 'New Emoji'}</h3>
                      {emojiForm.preview && (
                        <div style={{marginBottom:12,textAlign:'center'}}>
                          <img src={emojiForm.preview} alt="preview" style={{width:64,height:64,objectFit:'contain',borderRadius:6,background:'var(--bg-tertiary)',padding:4}} />
                        </div>
                      )}
                      {emojiEditing && !emojiForm.preview && (
                        <div style={{marginBottom:12,textAlign:'center'}}>
                          <span style={{fontSize:13,color:'var(--text-muted)'}}>Renaming emoji (image unchanged)</span>
                        </div>
                      )}
                      <div style={{marginBottom:12}}>
                        <label className="settings-label">Name</label>
                        <input
                          className="settings-input"
                          value={emojiForm.name}
                          onChange={e => setEmojiForm(f => ({...f, name: e.target.value}))}
                          maxLength={32}
                          placeholder="emoji_name (letters, numbers, underscores)"
                        />
                        <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>
                          Preview: :{emojiForm.name.trim().replace(/[^a-zA-Z0-9_]/g,'_') || 'name'}:
                        </div>
                      </div>
                      <div className="soundboard-actions">
                        <button
                          className="settings-btn primary"
                          onClick={saveEmoji}
                          disabled={!emojiForm.name.trim() || emojiForm.name.trim().length < 2 || emojiSaving || (!emojiEditing && !emojiForm.preview)}
                        >
                          {emojiSaving ? 'Saving...' : (emojiEditing ? 'Update Emoji' : 'Upload Emoji')}
                        </button>
                        <button className="settings-btn" onClick={resetEmojiForm}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{marginTop: 16}}>
                      <button className="settings-btn primary" onClick={() => emojiFileRef.current?.click()}>
                        + Add Emoji
                      </button>
                      <input ref={emojiFileRef} type="file" accept="image/png,image/gif,image/webp,image/jpeg" style={{display:'none'}} onChange={handleEmojiFileSelect}/>
                    </div>
                  )}

                  <div style={{marginTop:16,fontSize:12,color:'var(--text-muted)'}}>
                    {emojiList.length} / 50 emojis used
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── MODERATION ── */}
          {tab==='moderation' && server && (
            <div className="settings-section">
              <h2>Moderation</h2>
              <p className="settings-hint">View and manage bans, timeouts, and user reports for this server.</p>

              <div className="mod-section-tabs">
                <button className={`mod-section-tab ${modSection==='bans'?'active':''}`} onClick={()=>{setModSection('bans');setModSearch('');}}>
                  Bans ({modBans.length})
                </button>
                <button className={`mod-section-tab ${modSection==='timeouts'?'active':''}`} onClick={()=>{setModSection('timeouts');setModSearch('');}}>
                  Timeouts ({modTimeouts.length})
                </button>
                <button className={`mod-section-tab ${modSection==='reports'?'active':''}`} onClick={()=>{setModSection('reports');setModSearch('');}}>
                  Reports ({modReports.length})
                </button>
              </div>

              {modLoading && <p style={{color:'var(--text-muted)',textAlign:'center',padding:20}}>Loading...</p>}

              {/* ── Bans ── */}
              {!modLoading && modSection==='bans' && (
                <div>
                  <div className="search-input-container" style={{marginBottom:12}}>
                    <input className="settings-input" placeholder="Search banned users..." value={modSearch}
                      onChange={e=>setModSearch(e.target.value)}/>
                    {modSearch && <button className="search-clear-btn" onClick={()=>setModSearch('')}>×</button>}
                  </div>
                  {modBans.length === 0 && <p style={{color:'var(--text-muted)',textAlign:'center',padding:20}}>No banned users.</p>}
                  <div className="members-manage-list">
                    {modBans
                      .filter(b => !modSearch || (b.username||'').toLowerCase().includes(modSearch.toLowerCase()))
                      .map(ban => (
                        <div key={ban.id} className="member-manage-item">
                          <div className="member-avatar-sm" style={{background: ban.custom_avatar ? 'transparent' : (ban.color || '#3B82F6')}}>
                            {ban.custom_avatar
                              ? <img src={ban.custom_avatar} alt="" className="avatar-upload-img"/>
                              : (ban.avatar || 'U')}
                          </div>
                          <div className="member-manage-info">
                            <span className="member-manage-username">{ban.username || 'Unknown'}</span>
                            <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>
                              Banned {new Date(ban.created_at).toLocaleDateString()}
                              {ban.reason && <span> &mdash; {ban.reason}</span>}
                            </div>
                          </div>
                          <button className="settings-btn danger-sm" onClick={()=>handleUnban(ban.user_id)}>Unban</button>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* ── Timeouts ── */}
              {!modLoading && modSection==='timeouts' && (
                <div>
                  {modTimeouts.length === 0 && <p style={{color:'var(--text-muted)',textAlign:'center',padding:20}}>No active timeouts.</p>}
                  <div className="members-manage-list">
                    {modTimeouts.map(to => {
                      const remaining = Math.max(0, Math.ceil((new Date(to.expires_at) - Date.now()) / 60000));
                      return (
                        <div key={to.id} className="member-manage-item">
                          <div className="member-avatar-sm" style={{background: to.custom_avatar ? 'transparent' : (to.color || '#3B82F6')}}>
                            {to.custom_avatar
                              ? <img src={to.custom_avatar} alt="" className="avatar-upload-img"/>
                              : (to.avatar || 'U')}
                          </div>
                          <div className="member-manage-info">
                            <span className="member-manage-username">{to.username || 'Unknown'}</span>
                            <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>
                              {to.duration_minutes}min timeout &mdash; {remaining > 0 ? `${remaining}m remaining` : 'Expired'}
                            </div>
                          </div>
                          <button className="settings-btn danger-sm" onClick={()=>handleRemoveTimeout(to.user_id)}>Remove</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Reports ── */}
              {!modLoading && modSection==='reports' && (
                <div>
                  {modReports.length === 0 && <p style={{color:'var(--text-muted)',textAlign:'center',padding:20}}>No reports for this server's members.</p>}
                  <div className="members-manage-list" style={{maxHeight:500}}>
                    {modReports.map(report => (
                      <div key={report.id} className="member-manage-item" style={{flexDirection:'column',alignItems:'flex-start',gap:6}}>
                        <div style={{display:'flex',alignItems:'center',gap:8,width:'100%'}}>
                          <div className="member-avatar-sm" style={{background: report.reported_custom_avatar ? 'transparent' : (report.reported_color || '#3B82F6'), width:28, height:28, fontSize:14}}>
                            {report.reported_custom_avatar
                              ? <img src={report.reported_custom_avatar} alt="" className="avatar-upload-img"/>
                              : (report.reported_avatar || 'U')}
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <span className="member-manage-username">{report.reported_username || 'Unknown'}</span>
                            <span style={{fontSize:11,color:'var(--text-muted)',marginLeft:6}}>
                              reported by {report.reporter_username || 'Unknown'}
                            </span>
                          </div>
                          <span className={`mod-report-status mod-status-${report.status}`}>{report.status}</span>
                        </div>
                        <div style={{fontSize:12,color:'var(--text-muted)'}}>
                          <strong style={{color:'var(--text-normal)',textTransform:'capitalize'}}>{report.report_type}</strong>
                          {report.description && <span> &mdash; {report.description}</span>}
                        </div>
                        <div style={{fontSize:11,color:'var(--text-muted)'}}>
                          {new Date(report.created_at).toLocaleString()}
                          {report.resolved_at && <span> &middot; Resolved {new Date(report.resolved_at).toLocaleString()}</span>}
                        </div>
                        {report.status === 'pending' && (
                          <div style={{display:'flex',gap:6,marginTop:4}}>
                            <button className="settings-btn-small" onClick={()=>handleUpdateReport(report.id,'reviewed')}>Reviewed</button>
                            <button className="settings-btn-small primary" onClick={()=>handleUpdateReport(report.id,'actioned')}>Actioned</button>
                            <button className="settings-btn-small" onClick={()=>handleUpdateReport(report.id,'dismissed')} style={{color:'var(--text-muted)'}}>Dismiss</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── PLATFORM ADMIN ── */}
          {tab==='platform-admin' && currentUser?.isPlatformAdmin && (
            <div className="settings-section">
              <h2>Platform Admin</h2>
              <p className="settings-hint">Cross-server oversight — manage all servers, users, and orphaned data.</p>

              <div className="mod-section-tabs">
                <button className={`mod-section-tab ${adminSection==='servers'?'active':''}`} onClick={()=>{setAdminSection('servers');setAdminSearch('');}}>
                  Servers ({adminServers.length})
                </button>
                <button className={`mod-section-tab ${adminSection==='users'?'active':''}`} onClick={()=>{setAdminSection('users');setAdminSearch('');}}>
                  Users ({adminUsers.length})
                </button>
                <button className={`mod-section-tab ${adminSection==='cleanup'?'active':''}`} onClick={()=>{setAdminSection('cleanup');setAdminSearch('');}}>
                  Cleanup
                </button>
              </div>

              {adminLoading && <p style={{color:'var(--text-muted)',textAlign:'center',padding:20}}>Loading...</p>}

              {/* ── Servers ── */}
              {!adminLoading && adminSection==='servers' && (
                <div>
                  <div className="search-input-container" style={{marginBottom:12}}>
                    <input className="settings-input" placeholder="Search servers..." value={adminSearch}
                      onChange={e=>setAdminSearch(e.target.value)}/>
                    {adminSearch && <button className="search-clear-btn" onClick={()=>setAdminSearch('')}>×</button>}
                  </div>
                  {adminServers.length === 0 && <p style={{color:'var(--text-muted)',textAlign:'center',padding:20}}>No servers found.</p>}
                  <div className="members-manage-list">
                    {adminServers
                      .filter(s => !adminSearch || s.name.toLowerCase().includes(adminSearch.toLowerCase()))
                      .map(srv => (
                        <div key={srv.id} className="member-manage-item">
                          <div className="member-avatar-sm" style={{background: srv.customIcon ? 'transparent' : '#5865F2', borderRadius: 8}}>
                            {srv.customIcon
                              ? <img src={srv.customIcon} alt="" className="avatar-upload-img" style={{borderRadius:8}}/>
                              : (srv.icon || srv.name?.[0] || 'S')}
                          </div>
                          <div className="member-manage-info">
                            <span className="member-manage-username">{srv.name}</span>
                            <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>
                              {srv.memberCount} members · {srv.channelCount} channels · Owner: {srv.ownerUsername}
                              {srv.createdAt && <span> · Created {new Date(srv.createdAt).toLocaleDateString()}</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>

                  {/* Danger Zone — collapsible to prevent accidental deletes */}
                  <details style={{marginTop:16}}>
                    <summary style={{cursor:'pointer',color:'var(--red)',fontSize:13,fontWeight:600,userSelect:'none',padding:'8px 0'}}>
                      Danger Zone
                    </summary>
                    <div style={{border:'1px solid var(--red)',borderRadius:8,padding:12,marginTop:8,background:'rgba(237,66,69,0.05)'}}>
                      <p style={{fontSize:12,color:'var(--text-muted)',marginBottom:10}}>Permanently delete a server. This cannot be undone.</p>
                      <div className="members-manage-list">
                        {adminServers
                          .filter(s => !adminSearch || s.name.toLowerCase().includes(adminSearch.toLowerCase()))
                          .map(srv => (
                            <div key={srv.id} className="member-manage-item">
                              <div className="member-manage-info" style={{flex:1}}>
                                <span className="member-manage-username">{srv.name}</span>
                                <span style={{fontSize:11,color:'var(--text-muted)',marginLeft:8}}>{srv.memberCount} members</span>
                              </div>
                              <button className="settings-btn danger-sm" onClick={()=>handleAdminDeleteServer(srv.id, srv.name)}>Delete</button>
                            </div>
                          ))}
                      </div>
                    </div>
                  </details>
                </div>
              )}

              {/* ── Users ── */}
              {!adminLoading && adminSection==='users' && (
                <div>
                  <div className="search-input-container" style={{marginBottom:12}}>
                    <input className="settings-input" placeholder="Search users..." value={adminSearch}
                      onChange={e=>setAdminSearch(e.target.value)}/>
                    {adminSearch && <button className="search-clear-btn" onClick={()=>setAdminSearch('')}>×</button>}
                  </div>
                  {adminUsers.length === 0 && <p style={{color:'var(--text-muted)',textAlign:'center',padding:20}}>No users found.</p>}
                  <div className="members-manage-list">
                    {adminUsers
                      .filter(u => !adminSearch || u.username.toLowerCase().includes(adminSearch.toLowerCase()))
                      .map(usr => (
                        <div key={usr.id} className="member-manage-item">
                          <div className="member-avatar-sm" style={{background: usr.customAvatar ? 'transparent' : (usr.color || '#3B82F6'), position:'relative'}}>
                            {usr.customAvatar
                              ? <img src={usr.customAvatar} alt="" className="avatar-upload-img"/>
                              : (usr.avatar || 'U')}
                            {usr.online && <div style={{position:'absolute',bottom:-1,right:-1,width:8,height:8,borderRadius:'50%',background:'#3ba55c',border:'2px solid var(--bg-secondary)'}}/>}
                          </div>
                          <div className="member-manage-info">
                            <span className="member-manage-username">{usr.username}</span>
                            <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>
                              {usr.serverCount} servers · Joined {new Date(usr.createdAt).toLocaleDateString()}
                              {usr.online && <span style={{color:'#3ba55c'}}> · Online</span>}
                            </div>
                          </div>
                          {usr.id !== currentUser.id && (
                            <button className="settings-btn danger-sm" onClick={()=>handleAdminDeleteUser(usr.id, usr.username)}>Delete</button>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* ── Cleanup ── */}
              {!adminLoading && adminSection==='cleanup' && (
                <div style={{display:'flex',flexDirection:'column',gap:12}}>
                  <div style={{background:'var(--bg-tertiary)',borderRadius:8,padding:16,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div>
                      <div style={{fontWeight:600,marginBottom:4}}>Null-Author Messages</div>
                      <div style={{fontSize:12,color:'var(--text-muted)'}}>Messages from deleted accounts with no author reference</div>
                    </div>
                    <div style={{fontSize:24,fontWeight:700,color:'var(--text-muted)'}}>{adminOrphanedStats?.null_author_messages ?? '—'}</div>
                  </div>
                  <div style={{background:'var(--bg-tertiary)',borderRadius:8,padding:16,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div>
                      <div style={{fontWeight:600,marginBottom:4}}>Empty DM Channels</div>
                      <div style={{fontSize:12,color:'var(--text-muted)'}}>DM channels with no participants</div>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:12}}>
                      <div style={{fontSize:24,fontWeight:700,color:'var(--text-muted)'}}>{adminOrphanedStats?.empty_dm_channels ?? '—'}</div>
                      {adminOrphanedStats && parseInt(adminOrphanedStats.empty_dm_channels) > 0 && (
                        <button className="settings-btn danger-sm" onClick={handleCleanupEmptyDMs}>Clean up</button>
                      )}
                    </div>
                  </div>
                  <div style={{background:'var(--bg-tertiary)',borderRadius:8,padding:16,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div>
                      <div style={{fontWeight:600,marginBottom:4}}>Ownerless Servers</div>
                      <div style={{fontSize:12,color:'var(--text-muted)'}}>Servers whose owner account no longer exists</div>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:12}}>
                      <div style={{fontSize:24,fontWeight:700,color:'var(--text-muted)'}}>{adminOrphanedStats?.ownerless_servers ?? '—'}</div>
                      {adminOrphanedStats && parseInt(adminOrphanedStats.ownerless_servers) > 0 && (
                        <button className="settings-btn primary-sm" onClick={handleAssignOwnerlessServers}>Assign owners</button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab==='about' && (
            <div className="settings-section">
              <div style={{textAlign:'center', marginBottom: 24}}>
                <HexagonIcon size={64} color="#ed4245" />
                <h2 style={{margin: '0 0 4px', fontSize: 22, color: 'var(--text-primary)'}}>Nexus</h2>
                <p style={{margin: 0, fontSize: 13, color: 'var(--text-muted)'}}>Your Server, Your Rules</p>
                <p style={{margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)'}}>Version {process.env.REACT_APP_VERSION || '1.0.0'}</p>
              </div>

              <p style={{fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 20}}>
                Nexus is a self-hosted chat and voice communication platform featuring text channels,
                voice channels with WebRTC, direct messaging, screen sharing, custom emojis, soundboards, and more.
              </p>

              <div style={{display:'flex', flexDirection:'column', gap: 8, marginBottom: 20}}>
                <a
                  href="https://github.com/benerman/nexus"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => { e.preventDefault(); openExternalUrl('https://github.com/benerman/nexus'); }}
                  style={{
                    display:'flex', alignItems:'center', gap: 8, padding: '10px 14px',
                    background:'var(--bg-tertiary)', borderRadius: 8, color:'var(--text-primary)',
                    textDecoration:'none', fontSize: 14, cursor: 'pointer'
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
                  GitHub Repository
                  <span style={{marginLeft:'auto', fontSize: 12, color:'var(--text-muted)'}}>github.com/benerman/nexus</span>
                </a>
              </div>

              {(isTauriApp() || isCapacitorApp()) && (
                <div style={{marginBottom: 20}}>
                  <h3 style={{fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8}}>Updates</h3>
                  <button
                    className="settings-btn primary"
                    disabled={updateChecking}
                    onClick={async () => {
                      setUpdateChecking(true);
                      setUpdateStatus('');
                      setUpdateInfo(null);
                      const checker = isCapacitorApp() ? checkForCapacitorUpdate : checkForUpdates;
                      await checker({
                        onStatus: (msg) => setUpdateStatus(msg),
                        onUpdateAvailable: (info) => {
                          setUpdateInfo(info);
                          setUpdateStatus(`Version ${info.version} is available!`);
                        },
                        onError: (msg) => setUpdateStatus(msg || 'Could not check for updates'),
                      });
                      setUpdateChecking(false);
                    }}
                  >
                    {updateChecking ? 'Checking...' : 'Check for Updates'}
                  </button>
                  {updateStatus && (
                    <p style={{fontSize: 13, color: 'var(--text-secondary)', marginTop: 8}}>{updateStatus}</p>
                  )}
                  {updateInfo && (
                    <button
                      className="settings-btn primary"
                      style={{marginTop: 8}}
                      onClick={() => updateInfo.install?.()}
                    >
                      {isCapacitorApp() ? 'Download' : 'Download & Install'} v{updateInfo.version}
                    </button>
                  )}
                </div>
              )}

              <div style={{fontSize: 12, color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)', paddingTop: 12}}>
                <p style={{margin: '0 0 4px'}}>Made with care by the Nexus team.</p>
                <p style={{margin: 0}}>Licensed under <a href="https://github.com/benerman/nexus/blob/main/LICENSE" target="_blank" rel="noopener noreferrer" onClick={e => { e.preventDefault(); openExternalUrl('https://github.com/benerman/nexus/blob/main/LICENSE'); }} style={{color: 'var(--text-muted)'}}>AGPL-3.0</a>.</p>
              </div>
            </div>
          )}

          {(() => {
            const saveMap = {
              'profile': { fn: saveProfile, saved: profileSaved, label: 'Save Profile' },
              'server-settings': { fn: saveServer, saved: serverSaved, label: 'Save Server' },
              'channels': editingChannel ? { fn: saveChannel, saved: channelSaved, label: 'Save Channel' } : null,
              'roles': editingRole ? { fn: saveRole, saved: roleSaved, label: 'Save Role' } : null,
            };
            const s = saveMap[tab];
            if (!s) return null;
            return (
              <button
                className={`settings-floating-save ${s.saved ? 'saved' : ''}`}
                onClick={s.fn}
              >
                {s.saved ? '✓ Saved' : s.label}
              </button>
            );
          })()}
        </div>
        {showWebhookDocs && <WebhookDocs onClose={() => setShowWebhookDocs(false)} />}
      </div>
    </div>
  );
}
