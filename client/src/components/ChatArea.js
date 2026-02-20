import React, { useState, useEffect, useRef, useCallback } from 'react';
import './ChatArea.css';
import { AttachmentIcon, SettingsIcon, LinkIcon, UserIcon, PhoneIcon } from './icons';
import MessageContextMenu from './MessageContextMenu';
import InviteEmbed, { containsInviteLink, splitMessageContent } from './InviteEmbed';
import URLEmbed, { extractURLs } from './URLEmbed';
import GifPicker from './GifPicker';
import MentionText from './MentionText';
import CommandMessage from './CommandMessage';
import MessageLinkEmbed from './MessageLinkEmbed';
import PollCreator from './PollCreator';
import useLongPress from '../hooks/useLongPress';

const SLASH_COMMANDS = [
  { name: 'poll', description: 'Create a poll', usage: '/poll', icon: '📊' },
  { name: 'roll', description: 'Roll a dice', usage: '/roll <dN>', icon: '🎲' },
  { name: 'coinflip', description: 'Flip a coin', usage: '/coinflip', icon: '🪙' },
  { name: '8ball', description: 'Ask the Magic 8-Ball', usage: '/8ball <question>', icon: '🎱' },
  { name: 'choose', description: 'Choose between options', usage: '/choose opt1 | opt2', icon: '🤔' },
  { name: 'rps', description: 'Rock Paper Scissors', usage: '/rps <choice>', icon: '✊' },
  { name: 'serverinfo', description: 'Show server info', usage: '/serverinfo', icon: '📋' },
  { name: 'remindme', description: 'Set a reminder', usage: '/remindme <time> <msg>', icon: '⏰' },
  { name: 'quack', description: 'Random duck picture', usage: '/quack', icon: '🦆' },
  { name: 'criticize', description: 'Start/stop daily roast', usage: '/criticize <target>', icon: '🔥' },
];

const QUICK_REACTIONS = ['\uD83D\uDC4D','\u2764\uFE0F','\uD83D\uDE02','\uD83D\uDE2E','\uD83D\uDE22','\uD83D\uDD25','\uD83C\uDF89','\uD83D\uDCAF'];

const EMOJI_CATEGORIES = {
  'Smileys': ['\uD83D\uDE00','\uD83D\uDE03','\uD83D\uDE04','\uD83D\uDE01','\uD83D\uDE06','\uD83D\uDE05','\uD83D\uDE02','\uD83E\uDD23','\uD83D\uDE0A','\uD83D\uDE07','\uD83D\uDE42','\uD83D\uDE43','\uD83D\uDE09','\uD83D\uDE0C','\uD83D\uDE0D','\uD83E\uDD70','\uD83D\uDE18','\uD83D\uDE17','\uD83D\uDE1A','\uD83D\uDE1C','\uD83E\uDD2A','\uD83D\uDE1D','\uD83E\uDD11','\uD83E\uDD17','\uD83E\uDD14','\uD83E\uDD28','\uD83D\uDE10','\uD83D\uDE11','\uD83D\uDE36','\uD83D\uDE0F','\uD83D\uDE12','\uD83D\uDE44','\uD83D\uDE2C','\uD83E\uDD25','\uD83D\uDE0E','\uD83E\uDD13','\uD83E\uDD78','\uD83E\uDD20','\uD83E\uDD21','\uD83D\uDE34','\uD83D\uDE2D','\uD83D\uDE24','\uD83D\uDE21','\uD83E\uDD2C','\uD83D\uDE31','\uD83D\uDE28','\uD83D\uDE30','\uD83E\uDD2F','\uD83D\uDE33','\uD83E\uDD7A','\uD83D\uDE22','\uD83D\uDE25','\uD83D\uDE2E','\uD83D\uDE2F'],
  'Hearts': ['\u2764\uFE0F','\uD83E\uDDE1','\uD83D\uDC9B','\uD83D\uDC9A','\uD83D\uDC99','\uD83D\uDC9C','\uD83E\uDD0E','\uD83D\uDDA4','\uD83E\uDD0D','\uD83D\uDC95','\uD83D\uDC9E','\uD83D\uDC93','\uD83D\uDC97','\uD83D\uDC96','\uD83D\uDC98','\uD83D\uDC9D','\uD83D\uDC94','\u2763\uFE0F'],
  'Hands': ['\uD83D\uDC4D','\uD83D\uDC4E','\uD83D\uDC4A','\u270A','\uD83E\uDD1B','\uD83E\uDD1C','\uD83D\uDC4F','\uD83D\uDE4C','\uD83D\uDC4B','\uD83E\uDD1A','\u270B','\uD83D\uDD90\uFE0F','\uD83E\uDD1E','\u270C\uFE0F','\uD83E\uDD1F','\uD83E\uDD18','\uD83D\uDC4C','\uD83E\uDD0C','\uD83E\uDD0F','\u261D\uFE0F','\uD83D\uDC46','\uD83D\uDC47','\uD83D\uDC48','\uD83D\uDC49','\uD83D\uDCAA','\uD83D\uDE4F'],
  'People': ['\uD83D\uDE4B','\uD83D\uDE45','\uD83D\uDE46','\uD83D\uDE47','\uD83E\uDD26','\uD83E\uDD37','\uD83D\uDC81','\uD83D\uDE4E','\uD83D\uDE4D','\uD83D\uDC83','\uD83D\uDD7A','\uD83D\uDEB6','\uD83C\uDFC3','\uD83E\uDDCD'],
  'Animals': ['\uD83D\uDC36','\uD83D\uDC31','\uD83D\uDC2D','\uD83D\uDC39','\uD83D\uDC30','\uD83E\uDD8A','\uD83D\uDC3B','\uD83D\uDC3C','\uD83D\uDC28','\uD83D\uDC2F','\uD83E\uDD81','\uD83D\uDC2E','\uD83D\uDC37','\uD83D\uDC38','\uD83D\uDC35','\uD83D\uDC14','\uD83D\uDC27','\uD83D\uDC26','\uD83E\uDD85','\uD83E\uDD89','\uD83D\uDC3A','\uD83D\uDC17','\uD83D\uDC34','\uD83E\uDD84','\uD83D\uDC1D','\uD83D\uDC1B','\uD83E\uDD8B','\uD83D\uDC0C','\uD83D\uDC1A','\uD83D\uDC19','\uD83E\uDD91','\uD83E\uDD88','\uD83D\uDC2C','\uD83D\uDC33','\uD83D\uDC0A','\uD83E\uDD96','\uD83E\uDD95'],
  'Food': ['\uD83C\uDF4E','\uD83C\uDF4A','\uD83C\uDF4B','\uD83C\uDF53','\uD83C\uDF49','\uD83C\uDF47','\uD83C\uDF51','\uD83E\uDD5D','\uD83C\uDF36\uFE0F','\uD83C\uDF3D','\uD83E\uDD55','\uD83C\uDF54','\uD83C\uDF55','\uD83C\uDF2E','\uD83C\uDF2F','\uD83E\uDD57','\uD83C\uDF5C','\uD83C\uDF63','\uD83C\uDF69','\uD83C\uDF70','\uD83C\uDF82','\uD83C\uDF66','\uD83C\uDF69','\u2615','\uD83C\uDF7A','\uD83C\uDF77','\uD83E\uDD42'],
  'Objects': ['\uD83D\uDD25','\u2B50','\uD83C\uDF1F','\u2728','\uD83C\uDF89','\uD83C\uDF8A','\uD83C\uDFC6','\uD83C\uDFB5','\uD83C\uDFB6','\uD83C\uDFA4','\uD83C\uDFAE','\uD83D\uDCAF','\uD83D\uDCA5','\uD83D\uDCA2','\uD83D\uDCA8','\uD83D\uDCAB','\uD83D\uDCA4','\uD83D\uDC40','\uD83D\uDCAA','\uD83D\uDC80','\uD83D\uDC7B','\uD83D\uDC7D','\uD83E\uDD16','\uD83D\uDCA9','\uD83D\uDC4B','\u2705','\u274C','\u2753','\u2757','\uD83D\uDCAC','\uD83D\uDC68\u200D\uD83D\uDCBB','\uD83D\uDE80','\u2708\uFE0F','\uD83C\uDF0D','\uD83C\uDF08']
};

function formatTime(ts) { return new Date(ts).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }); }
function formatDate(ts) {
  const d=new Date(ts), t=new Date();
  if (d.toDateString()===t.toDateString()) return 'Today';
  const y=new Date(t); y.setDate(y.getDate()-1);
  if (d.toDateString()===y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month:'long', day:'numeric' });
}
function groupMessages(msgs) {
  let lastId=null, lastTs=null;
  return msgs.map(msg => {
    const g = lastId===msg.author.id && (msg.timestamp-lastTs)<5*60*1000;
    lastId=msg.author.id; lastTs=msg.timestamp; return {...msg, isGrouped:g};
  });
}
async function fileToDataURL(file) {
  return new Promise((res,rej) => { const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); });
}

// ─── Lightbox ──────────────────────────────────────────────────────────────
function Lightbox({ src, name, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key==='Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);
  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <div className="lightbox-inner" onClick={e => e.stopPropagation()}>
        <button className="lightbox-close" onClick={onClose}>✕</button>
        <img src={src} alt={name || 'image'} className="lightbox-img" />
        {name && <div className="lightbox-name">{name}</div>}
        <a href={src} download={name} className="lightbox-download" target="_blank" rel="noreferrer">⬇ Download</a>
      </div>
    </div>
  );
}

// ─── Attachment renderer — GIFs animate inline, images open lightbox ──────
function MessageAttachment({ attachment, onLightbox }) {
  const isGif = attachment.type === 'image/gif' ||
                attachment.url?.match(/\.gif($|\?)/i) ||
                attachment.url?.startsWith('data:image/gif');
  const isImage = attachment.type?.startsWith('image/') ||
                  attachment.url?.match(/\.(png|jpg|jpeg|gif|webp)($|\?)/i) ||
                  attachment.url?.startsWith('data:image/');

  if (isImage) {
    return (
      <div className="msg-attachment-img">
        {/* Use <img> for all images — including GIFs. The browser animates GIFs natively in <img> tags.
            We must NOT use window.open(dataURL) because browsers block about:blank data nav. */}
        <img
          src={attachment.url}
          alt={attachment.name || 'image'}
          loading="lazy"
          className={isGif ? 'gif-img' : ''}
          onClick={() => onLightbox(attachment)}
          title={isGif ? 'Click to view full size' : 'Click to expand'}
        />
        {isGif && <span className="gif-badge">GIF</span>}
      </div>
    );
  }
  return <div className="msg-attachment-file"> {attachment.name || 'file'}</div>;
}

// ─── Emoji Picker ─────────────────────────────────────────────────────────
function EmojiPicker({ onSelect, onClose, servers, currentServerId, socket }) {
  const [activePage, setActivePage] = useState('recent');
  const [activeCategory, setActiveCategory] = useState(Object.keys(EMOJI_CATEGORIES)[0]);
  const [recentEmojis, setRecentEmojis] = useState(() => {
    try { return JSON.parse(localStorage.getItem('nexus_recent_emojis') || '[]'); } catch { return []; }
  });
  const [serverEmojiCache, setServerEmojiCache] = useState({});
  const pickerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Load custom emojis for a server when its tab is selected
  useEffect(() => {
    if (activePage.startsWith('server:') && socket) {
      const sId = activePage.replace('server:', '');
      if (!serverEmojiCache[sId]) {
        socket.emit('emoji:get', { serverId: sId }, (response) => {
          if (response && !response.error) {
            setServerEmojiCache(prev => ({ ...prev, [sId]: response.emojis || [] }));
          }
        });
      }
    }
  }, [activePage, socket]);

  const categoryNames = Object.keys(EMOJI_CATEGORIES);
  const categoryIcons = {
    'Smileys': '\uD83D\uDE00', 'Hearts': '\u2764\uFE0F', 'Hands': '\uD83D\uDC4D',
    'People': '\uD83D\uDE4B', 'Animals': '\uD83D\uDC36', 'Food': '\uD83C\uDF4E', 'Objects': '\u2B50'
  };

  // Build server pages — current server + servers with emoji sharing
  const serverPages = (servers || []).filter(s =>
    !s.isPersonal && (s.customEmojis?.length > 0) &&
    (s.id === currentServerId || s.emojiSharing)
  );

  const trackRecent = (emojiObj) => {
    const updated = [emojiObj, ...recentEmojis.filter(e =>
      e.type === 'custom' ? e.id !== emojiObj.id : e.value !== emojiObj.value
    )].slice(0, 10);
    setRecentEmojis(updated);
    localStorage.setItem('nexus_recent_emojis', JSON.stringify(updated));
  };

  const handleSelectUnicode = (emoji, e) => {
    trackRecent({ type: 'unicode', value: emoji });
    onSelect(emoji);
    if (!e?.shiftKey) onClose();
  };

  const handleSelectCustom = (emoji, serverId, e) => {
    trackRecent({ type: 'custom', id: emoji.id, name: emoji.name, serverId });
    onSelect(`:${emoji.name}:${serverId}:${emoji.id}:`);
    if (!e?.shiftKey) onClose();
  };

  return (
    <div className="emoji-picker" ref={pickerRef} onClick={e => e.stopPropagation()}>
      <div className="emoji-picker-quick">
        {QUICK_REACTIONS.map(emoji => (
          <button key={emoji} className="emoji-quick-btn" onClick={(e) => handleSelectUnicode(emoji, e)}>{emoji}</button>
        ))}
      </div>
      <div className="emoji-picker-divider" />
      {/* Page tabs */}
      <div className="emoji-picker-pages">
        <button className={`emoji-page-tab ${activePage === 'recent' ? 'active' : ''}`}
          onClick={() => setActivePage('recent')} title="Recent">🕑</button>
        <button className={`emoji-page-tab ${activePage === 'default' ? 'active' : ''}`}
          onClick={() => setActivePage('default')} title="Default">😀</button>
        {serverPages.map(s => (
          <button key={s.id} className={`emoji-page-tab ${activePage === 'server:' + s.id ? 'active' : ''}`}
            onClick={() => setActivePage('server:' + s.id)}
            title={s.name}>
            {s.customIcon ? (
              <img src={s.customIcon} alt="" style={{width:16,height:16,borderRadius:3}} />
            ) : (
              <span style={{fontSize:10,fontWeight:700}}>{(s.icon || s.name?.[0] || 'S').slice(0,2)}</span>
            )}
          </button>
        ))}
      </div>

      {/* Recent page */}
      {activePage === 'recent' && (
        <>
          <div className="emoji-picker-label">Recently Used</div>
          <div className="emoji-picker-grid">
            {recentEmojis.length === 0 && (
              <div style={{gridColumn:'1/-1',textAlign:'center',color:'var(--text-muted)',fontSize:12,padding:16}}>No recent emojis</div>
            )}
            {recentEmojis.map((e, i) => e.type === 'custom' ? (
              <button key={i} className="emoji-grid-btn custom-emoji-grid-btn" onClick={(ev) => {
                const cached = Object.values(serverEmojiCache).flat().find(ce => ce.id === e.id);
                if (cached) handleSelectCustom(cached, e.serverId, ev);
                else { onSelect(`:${e.name}:${e.serverId}:${e.id}:`); if (!ev.shiftKey) onClose(); }
              }} title={`:${e.name}:`}>
                <img src={serverEmojiCache[e.serverId]?.find(ce => ce.id === e.id)?.imageData || ''} alt={e.name}
                  className="custom-emoji-inline" style={{width:22,height:22}} />
              </button>
            ) : (
              <button key={i} className="emoji-grid-btn" onClick={(ev) => handleSelectUnicode(e.value, ev)}>{e.value}</button>
            ))}
          </div>
        </>
      )}

      {/* Default page */}
      {activePage === 'default' && (
        <>
          <div className="emoji-picker-categories">
            {categoryNames.map(cat => (
              <button key={cat} className={`emoji-cat-btn ${activeCategory === cat ? 'active' : ''}`}
                onClick={() => setActiveCategory(cat)} title={cat}>
                {categoryIcons[cat] || cat[0]}
              </button>
            ))}
          </div>
          <div className="emoji-picker-label">{activeCategory}</div>
          <div className="emoji-picker-grid">
            {EMOJI_CATEGORIES[activeCategory].map((emoji, i) => (
              <button key={i} className="emoji-grid-btn" onClick={(e) => handleSelectUnicode(emoji, e)}>{emoji}</button>
            ))}
          </div>
        </>
      )}

      {/* Server emoji pages */}
      {activePage.startsWith('server:') && (() => {
        const sId = activePage.replace('server:', '');
        const srvInfo = serverPages.find(s => s.id === sId);
        const emojis = serverEmojiCache[sId] || [];
        return (
          <>
            <div className="emoji-picker-label">{srvInfo?.name || 'Server'} Emojis</div>
            <div className="emoji-picker-grid">
              {emojis.length === 0 && (
                <div style={{gridColumn:'1/-1',textAlign:'center',color:'var(--text-muted)',fontSize:12,padding:16}}>Loading...</div>
              )}
              {emojis.map(emoji => (
                <button key={emoji.id} className="emoji-grid-btn custom-emoji-grid-btn"
                  onClick={(e) => handleSelectCustom(emoji, sId, e)} title={`:${emoji.name}:`}>
                  <img src={emoji.imageData} alt={emoji.name} className="custom-emoji-inline" style={{width:22,height:22}} />
                </button>
              ))}
            </div>
          </>
        );
      })()}
    </div>
  );
}

const ChatArea = React.memo(function ChatArea({
  channel, messages, typingUsers, currentUser, socket,
  server, servers, onOpenSettings, memberSidebarVisible, onToggleMemberSidebar,
  hasMore, onFetchOlderMessages,
  onStartDMCall, dmCallActive, onlineUsers, friends,
  developerMode
}) {
  console.log('[ChatArea] RENDER - channel:', channel?.name, 'messages:', messages.length);

  const [input, setInput] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [reactionTarget, setReactionTarget] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [lightbox, setLightbox] = useState(null); // {url, name}
  const [contextMenu, setContextMenu] = useState(null); // {message, x, y}
  const [editingMessage, setEditingMessage] = useState(null); // message being edited
  const [gifPickerOpen, setGifPickerOpen] = useState(false);
  const [inputEmojiOpen, setInputEmojiOpen] = useState(false);
  const [editInput, setEditInput] = useState('');
  const [replyingTo, setReplyingTo] = useState(null); // message being replied to
  const [highlightedMessageId, setHighlightedMessageId] = useState(null); // message to highlight
  const [mobileActionsId, setMobileActionsId] = useState(null); // message id with visible actions on mobile
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [addMemberSearch, setAddMemberSearch] = useState('');
  const [mentionQuery, setMentionQuery] = useState(null); // { query: string, startPos: number } or null
  const [mentionIndex, setMentionIndex] = useState(0); // selected index in autocomplete
  const [channelQuery, setChannelQuery] = useState(null); // { query: string, startPos: number } or null
  const [channelIndex, setChannelIndex] = useState(0);
  const [commandQuery, setCommandQuery] = useState(null); // string or null - text after /
  const [commandIndex, setCommandIndex] = useState(0);
  const [pollCreatorOpen, setPollCreatorOpen] = useState(false);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const messageRefs = useRef({}); // refs for all messages
  const typingTimeoutRef = useRef(null);
  const isTypingRef = useRef(false);
  const fileInputRef = useRef(null);
  const inputRef = useRef(null); // ref for message input textarea
  const prevChannelRef = useRef(null);
  const scrollPositionsRef = useRef({});
  const isNearBottomRef = useRef(true);

  // Track if user is near the bottom of chat
  const checkNearBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return true;
    return container.scrollHeight - container.scrollTop - container.clientHeight < 100;
  }, []);

  // Track whether we need to force-scroll after a channel switch
  const pendingScrollRef = useRef(false);

  // Scroll to bottom on channel change (instant) or new messages (smooth if near bottom)
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    if (channel?.id !== prevChannelRef.current) {
      // Save scroll position of previous channel
      if (prevChannelRef.current) {
        scrollPositionsRef.current[prevChannelRef.current] = container.scrollTop;
      }
      // Channel changed - restore saved position or scroll to bottom
      prevChannelRef.current = channel?.id;
      pendingScrollRef.current = true;
      isNearBottomRef.current = true;
      const savedPos = scrollPositionsRef.current[channel?.id];
      requestAnimationFrame(() => {
        if (savedPos !== undefined) {
          container.scrollTop = savedPos;
          isNearBottomRef.current = checkNearBottom();
        } else {
          container.scrollTop = container.scrollHeight;
        }
      });
    } else if (pendingScrollRef.current && messages.length > 0) {
      // Messages arrived after channel switch - force scroll to bottom
      pendingScrollRef.current = false;
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    } else if (isNearBottomRef.current) {
      // Same channel, new message, user was near bottom - smooth scroll
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, channel?.id]);

  // Lazy loading: fetch older messages when scrolling to top
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    isNearBottomRef.current = checkNearBottom();
    // Load older messages when within 50px of the top
    if (container.scrollTop < 50 && hasMore && !loadingOlder && channel?.id && messages.length > 0) {
      setLoadingOlder(true);
      const oldScrollHeight = container.scrollHeight;
      onFetchOlderMessages(channel.id, messages[0].timestamp).then(() => {
        setLoadingOlder(false);
        // Preserve scroll position after prepending older messages
        requestAnimationFrame(() => {
          const newScrollHeight = container.scrollHeight;
          container.scrollTop = newScrollHeight - oldScrollHeight;
        });
      }).catch(() => setLoadingOlder(false));
    }
  }, [hasMore, loadingOlder, channel?.id, messages, onFetchOlderMessages, checkNearBottom]);

  // ✅ Auto-focus message input when user starts typing
  useEffect(() => {
    const handleKeyPress = (e) => {
      // Skip if:
      // - Any modifier keys are pressed (Ctrl, Alt, Meta/Cmd)
      // - User is already typing in an input/textarea
      // - User is typing in a contenteditable element
      // - Modal or settings are open
      // - Special keys (Escape, F1-F12, Arrow keys, etc.)
      const isModifierPressed = e.ctrlKey || e.altKey || e.metaKey;
      const isInInput = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
      const isInContentEditable = document.activeElement?.isContentEditable;
      const isSpecialKey = e.key.length > 1 && !e.key.match(/^[A-Z]$/); // Multi-char keys like 'Enter', 'Escape', 'F1', etc.

      if (isModifierPressed || isInInput || isInContentEditable || isSpecialKey) {
        return;
      }

      // Focus the input if it's a printable character
      if (e.key.length === 1 && inputRef.current) {
        inputRef.current.focus();
        // The keypress will naturally appear in the input since it's now focused
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, []);

  // Auto-resize textarea to fit content
  const resizeTextarea = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'; // Reset height to recalculate
      const newHeight = Math.min(inputRef.current.scrollHeight, 200); // Max 200px height
      inputRef.current.style.height = `${newHeight}px`;
    }
  }, []);

  // ✅ Resize textarea when input changes
  useEffect(() => {
    resizeTextarea();
  }, [input, resizeTextarea]);

  const handleInput = useCallback((e) => {
    const value = e.target.value;
    setInput(value);
    resizeTextarea();

    // Detect /command trigger (only at start of input, and only the command name portion)
    const cmdMatch = value.match(/^\/(\w*)$/);
    if (cmdMatch) {
      setCommandQuery(cmdMatch[1].toLowerCase());
      setCommandIndex(0);
      setMentionQuery(null);
    } else {
      setCommandQuery(null);

      // Detect @mention trigger
      const cursorPos = e.target.selectionStart;
      const textBeforeCursor = value.substring(0, cursorPos);
      const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
      if (mentionMatch) {
        setMentionQuery({ query: mentionMatch[1].toLowerCase(), startPos: mentionMatch.index });
        setMentionIndex(0);
        setChannelQuery(null);
      } else {
        setMentionQuery(null);
        // Detect #channel trigger
        const channelMatch = textBeforeCursor.match(/#([a-z0-9-]*)$/i);
        if (channelMatch) {
          setChannelQuery({ query: channelMatch[1].toLowerCase(), startPos: channelMatch.index });
          setChannelIndex(0);
        } else {
          setChannelQuery(null);
        }
      }
    }

    if (!socket || !channel) return;
    if (!isTypingRef.current) { isTypingRef.current=true; socket.emit('typing:start',{channelId:channel.id}); }
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current=false; socket.emit('typing:stop',{channelId:channel.id});
    }, 1500);
  }, [socket, channel, resizeTextarea]);

  // Compute mention suggestions
  const mentionSuggestions = React.useMemo(() => {
    if (!mentionQuery || !server) return [];
    const q = mentionQuery.query;
    const suggestions = [];

    // Add @everyone option
    if ('everyone'.startsWith(q)) {
      suggestions.push({ type: 'special', id: 'everyone', name: 'everyone', label: '@everyone — Notify all members' });
    }

    // Add role matches
    if (server.roles) {
      const roles = Object.values(server.roles).filter(r => r.id !== 'everyone');
      for (const role of roles) {
        const cleanName = (role.name || '').replace(/^@/, '');
        if (cleanName.toLowerCase().startsWith(q)) {
          suggestions.push({ type: 'role', id: role.id, name: cleanName, color: role.color });
        }
      }
    }

    // Add member matches
    if (server.members) {
      const members = Object.entries(server.members);
      for (const [userId, member] of members) {
        const username = member.username || member.name;
        if (username && username.toLowerCase().startsWith(q) && userId !== currentUser?.id) {
          suggestions.push({
            type: 'user', id: userId, name: username,
            avatar: member.customAvatar || member.avatar,
            color: member.color
          });
        }
      }
    }

    // Also check onlineUsers for usernames not yet in server.members (edge case)
    if (onlineUsers) {
      for (const ou of onlineUsers) {
        if (ou.username?.toLowerCase().startsWith(q) && ou.id !== currentUser?.id
            && !suggestions.some(s => s.type === 'user' && s.id === ou.id)) {
          suggestions.push({
            type: 'user', id: ou.id, name: ou.username,
            avatar: ou.customAvatar || ou.avatar,
            color: ou.color
          });
        }
      }
    }

    return suggestions.slice(0, 10);
  }, [mentionQuery, server, currentUser, onlineUsers]);

  // Insert mention into input
  const insertMention = useCallback((suggestion) => {
    if (!mentionQuery) return;
    const before = input.substring(0, mentionQuery.startPos);
    const after = input.substring(mentionQuery.startPos + 1 + mentionQuery.query.length); // +1 for @
    const mentionText = `@${suggestion.name} `;
    const newInput = before + mentionText + after;
    setInput(newInput);
    setMentionQuery(null);
    setMentionIndex(0);

    // Re-focus and set cursor position
    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const cursorPos = before.length + mentionText.length;
        inputRef.current.setSelectionRange(cursorPos, cursorPos);
      }
    });
  }, [input, mentionQuery]);

  // Compute channel suggestions
  const channelSuggestions = React.useMemo(() => {
    if (!channelQuery || !server) return [];
    const q = channelQuery.query;
    const channels = [...(server.channels?.text || [])];
    return channels
      .filter(ch => ch.name.toLowerCase().includes(q))
      .slice(0, 10)
      .map(ch => ({ id: ch.id, name: ch.name }));
  }, [channelQuery, server]);

  // Insert channel reference into input
  const insertChannel = useCallback((channel_) => {
    if (!channelQuery) return;
    const before = input.substring(0, channelQuery.startPos);
    const after = input.substring(channelQuery.startPos + 1 + channelQuery.query.length); // +1 for #
    const channelText = `#${channel_.name} `;
    const newInput = before + channelText + after;
    setInput(newInput);
    setChannelQuery(null);
    setChannelIndex(0);

    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const cursorPos = before.length + channelText.length;
        inputRef.current.setSelectionRange(cursorPos, cursorPos);
      }
    });
  }, [input, channelQuery]);

  // Compute command suggestions
  const commandSuggestions = React.useMemo(() => {
    if (commandQuery === null) return [];
    return SLASH_COMMANDS.filter(c => c.name.startsWith(commandQuery));
  }, [commandQuery]);

  // Insert selected command into input
  const insertCommand = useCallback((cmd) => {
    // For poll, just set the input - modal opens on send
    const newInput = `/${cmd.name} `;
    setInput(newInput);
    setCommandQuery(null);
    setCommandIndex(0);
    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newInput.length, newInput.length);
      }
    });
  }, []);

  // Handle poll creation from modal
  const handlePollSubmit = useCallback((pollData) => {
    if (!socket || !channel) return;
    socket.emit('message:send', {
      channelId: channel.id,
      content: '/poll',
      commandData: pollData
    });
    setPollCreatorOpen(false);
    setInput('');
  }, [socket, channel]);

  const handleSend = useCallback(() => {
    if ((!input.trim() && !pendingAttachments.length) || !socket || !channel) return;

    const trimmed = input.trim();

    // /poll opens the modal instead of sending
    if (trimmed === '/poll' || trimmed.startsWith('/poll ')) {
      setPollCreatorOpen(true);
      return;
    }

    const payload = {
      channelId: channel.id,
      content: input,
      attachments: pendingAttachments
    };
    if (replyingTo) {
      payload.replyTo = replyingTo.id;
    }
    socket.emit('message:send', payload);
    setInput('');
    setPendingAttachments([]);
    setReplyingTo(null);
    setMentionQuery(null);
    setCommandQuery(null);
    isTypingRef.current=false;
    socket.emit('typing:stop',{channelId:channel.id});
    clearTimeout(typingTimeoutRef.current);

    // Reset textarea height after sending
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  }, [input, pendingAttachments, socket, channel, replyingTo]);

  const handleGifSelect = useCallback((gif) => {
    if (!socket || !channel) return;
    socket.emit('message:send', {
      channelId: channel.id,
      content: '',
      attachments: [{
        name: gif.title || 'GIF',
        url: gif.url,
        type: 'image/gif'
      }]
    });
  }, [socket, channel]);

  const handleKeyDown = (e) => {
    // Handle command autocomplete navigation
    if (commandQuery !== null && commandSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCommandIndex(i => (i + 1) % commandSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCommandIndex(i => (i - 1 + commandSuggestions.length) % commandSuggestions.length);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        insertCommand(commandSuggestions[commandIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setCommandQuery(null);
        return;
      }
    }

    // Handle mention autocomplete navigation
    if (mentionQuery && mentionSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(i => (i + 1) % mentionSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(i => (i - 1 + mentionSuggestions.length) % mentionSuggestions.length);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        insertMention(mentionSuggestions[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }

    // Handle channel autocomplete navigation
    if (channelQuery && channelSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setChannelIndex(i => (i + 1) % channelSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setChannelIndex(i => (i - 1 + channelSuggestions.length) % channelSuggestions.length);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        insertChannel(channelSuggestions[channelIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setChannelQuery(null);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape') {
      if (editingMessage) handleCancelEdit();
      if (replyingTo) handleCancelReply();
    }
  };

  const handleEditKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
    }
    if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const handleReact = (messageId, emoji) => {
    if (!socket || !channel) return;
    socket.emit('message:react',{channelId:channel.id, messageId, emoji});
  };

  const handleDeleteMessage = useCallback((message) => {
    if (!socket || !channel) return;
    if (window.confirm('Are you sure you want to delete this message?')) {
      socket.emit('message:delete', { channelId: channel.id, messageId: message.id });
    }
  }, [socket, channel]);

  const handleEditMessage = useCallback((message) => {
    setEditingMessage(message);
    setEditInput(message.content || '');
    setReplyingTo(null); // Clear reply if editing
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!socket || !channel || !editingMessage || !editInput.trim()) return;
    socket.emit('message:edit', {
      channelId: channel.id,
      messageId: editingMessage.id,
      content: editInput
    });
    setEditingMessage(null);
    setEditInput('');
  }, [socket, channel, editingMessage, editInput]);

  const handleCancelEdit = useCallback(() => {
    setEditingMessage(null);
    setEditInput('');
  }, []);

  const handleReplyToMessage = useCallback((message) => {
    setReplyingTo(message);
    setEditingMessage(null); // Clear edit if replying
  }, []);

  const handleCancelReply = useCallback(() => {
    setReplyingTo(null);
  }, []);

  const handleClickReply = useCallback((replyToId) => {
    const messageEl = messageRefs.current[replyToId];
    if (messageEl) {
      messageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMessageId(replyToId);
      // Remove highlight after 2 seconds
      setTimeout(() => setHighlightedMessageId(null), 2000);
    }
  }, []);

  const handleCopyMessageUrl = useCallback((message) => {
    const url = `${window.location.origin}/channels/${server?.id || 'nexus-main'}/${channel.id}/${message.id}`;
    navigator.clipboard.writeText(url).then(() => {
      alert('Message URL copied to clipboard!');
    }).catch(err => {
      console.error('Failed to copy URL:', err);
      alert('Failed to copy URL');
    });
  }, [server, channel]);

  const handleMessageContextMenu = useCallback((e, message) => {
    e.preventDefault();
    setContextMenu({ message, x: e.clientX, y: e.clientY });
    setReactionTarget(null);
    setMobileActionsId(null);
  }, []);

  // Long-press on mobile opens context menu
  const longPressCallbackRef = useRef(null);
  const messageLongPress = useLongPress(useCallback((e) => {
    if (longPressCallbackRef.current) {
      longPressCallbackRef.current(e);
    }
  }, []), 500);

  // Toggle mobile actions visibility on tap
  const handleMobileTap = useCallback((msgId) => {
    setMobileActionsId(prev => prev === msgId ? null : msgId);
  }, []);

  const addFiles = useCallback(async (files) => {
    const imgs = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (!imgs.length) return;

    // Validate file sizes (5MB limit for GIFs, 10MB for other images)
    const MAX_GIF_SIZE = 5 * 1024 * 1024; // 5MB
    const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
    const validImages = [];

    for (const file of imgs.slice(0, 4)) {
      const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');
      const maxSize = isGif ? MAX_GIF_SIZE : MAX_IMAGE_SIZE;

      if (file.size > maxSize) {
        const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
        const maxMB = (maxSize / (1024 * 1024)).toFixed(0);
        console.warn(`File too large: ${file.name} (${sizeMB}MB, max ${maxMB}MB for ${isGif ? 'GIFs' : 'images'})`);
        alert(`File "${file.name}" is too large (${sizeMB}MB). Maximum size is ${maxMB}MB for ${isGif ? 'GIF files' : 'images'}.`);
        continue;
      }

      console.log(`Adding file: ${file.name} (${file.type}, ${(file.size / 1024).toFixed(1)}KB)${isGif ? ' [GIF]' : ''}`);
      validImages.push(file);
    }

    if (!validImages.length) return;

    const atts = await Promise.all(validImages.map(async f => ({
      name: f.name, type: f.type, url: await fileToDataURL(f)
    })));
    setPendingAttachments(prev => [...prev, ...atts].slice(0,4));
  }, []);

  const handlePaste = useCallback(async (e) => {
    const items = Array.from(e.clipboardData?.items || []).filter(i => i.type.startsWith('image/'));
    if (!items.length) return;
    e.preventDefault();
    await addFiles(items.map(i => i.getAsFile()).filter(Boolean));
  }, [addFiles]);

  const handleDrop = useCallback(async (e) => {
    e.preventDefault(); setDragOver(false);
    await addFiles(e.dataTransfer.files);
  }, [addFiles]);

  if (!channel) return (
    <div className="chat-empty">
      <div className="chat-empty-icon">NEXUS</div>
      <p>Select a channel to start chatting</p>
    </div>
  );

  const grouped = groupMessages(messages);

  return (
    <div className={`chat-area ${dragOver ? 'drag-over' : ''}`}
      onDragOver={e=>{e.preventDefault();setDragOver(true);}}
      onDragLeave={()=>setDragOver(false)}
      onDrop={handleDrop}
      onClick={()=>setReactionTarget(null)}>

      {lightbox && <Lightbox src={lightbox.url} name={lightbox.name} onClose={()=>setLightbox(null)} />}
      {dragOver && <div className="drop-overlay">Drop images to attach </div>}
      {contextMenu && (
        <MessageContextMenu
          message={contextMenu.message}
          currentUser={currentUser}
          isAdmin={server?.members?.[currentUser?.id]?.roles?.includes('admin')}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={() => setContextMenu(null)}
          onDelete={handleDeleteMessage}
          onEdit={handleEditMessage}
          onReply={handleReplyToMessage}
          onCopyUrl={handleCopyMessageUrl}
          developerMode={developerMode}
        />
      )}

      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-icon">
          {channel.isDM ? (
            <span style={{ fontSize: 16 }}>@</span>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M10.5,10H7.5L9,3H7L5.5,10H2.5l-.5,2h3L4,16H1l-.5,2H3.5L2,24H4L5.5,18h3L7,24H9L10.5,18H13.5l.5-2H11L12,10h3l.5-2H12.5L14,3H12Z"/>
            </svg>
          )}
        </div>
        <span className="chat-header-name">{channel.isDM ? (channel.participant?.username || channel.name) : channel.name}</span>
        {!channel.isDM && channel.description && <><div className="chat-header-divider"/><span className="chat-header-desc">{channel.description}</span></>}
        {!channel.isDM && channel.topic && <span className="chat-header-topic" title={channel.topic}>│ {channel.topic}</span>}
        <div className="chat-header-actions">
          {channel.isDM && onStartDMCall && (
            <button
              className={`header-action-btn ${dmCallActive === channel.id ? 'active-call' : ''}`}
              onClick={() => !dmCallActive && onStartDMCall(channel.id)}
              title={dmCallActive === channel.id ? 'In call' : 'Start Voice Call'}
              disabled={!!dmCallActive}
            >
              <PhoneIcon size={18} color={dmCallActive === channel.id ? 'var(--text-positive)' : 'var(--text-muted)'} />
            </button>
          )}
          {channel.isDM && (
            <button className="header-action-btn" onClick={() => setShowAddMember(prev => !prev)} title="Add people">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
              </svg>
            </button>
          )}
          {onOpenSettings && !channel.isDM && (
            <button className="header-action-btn" onClick={()=>onOpenSettings('channels')} title="Channel settings">
              <SettingsIcon size={18} color="var(--text-muted)" />
            </button>
          )}
          {onOpenSettings && !channel.isDM && (
            <button className="header-action-btn" onClick={()=>onOpenSettings('webhooks')} title="Webhooks">
              <LinkIcon size={18} color="var(--text-muted)" />
            </button>
          )}
          {!channel.isDM && (
            <button className="header-action-btn" onClick={onToggleMemberSidebar}
              title={memberSidebarVisible ? 'Hide member list' : 'Show member list'}>
              <UserIcon size={18} color="var(--text-muted)" />
            </button>
          )}
        </div>
      </div>

      {/* Add Member Dropdown for DMs */}
      {showAddMember && channel.isDM && (
        <div className="add-member-dropdown">
          <input
            className="add-member-search"
            placeholder="Search friends to add..."
            value={addMemberSearch}
            onChange={e => setAddMemberSearch(e.target.value)}
            autoFocus
          />
          <div className="add-member-list">
            {(friends || [])
              .filter(f => {
                // Filter out already-in-DM participants
                const existingIds = channel.isGroup
                  ? (channel.participants || []).map(p => p.id)
                  : [channel.participant?.id, currentUser?.id].filter(Boolean);
                return !existingIds.includes(f.id)
                  && f.username.toLowerCase().includes(addMemberSearch.toLowerCase());
              })
              .slice(0, 10)
              .map(f => (
                <button key={f.id} className="add-member-item" onClick={() => {
                  if (socket) {
                    if (channel.isGroup) {
                      socket.emit('group-dm:add-participant', { channelId: channel.id, userId: f.id });
                    } else {
                      // Convert 1-on-1 DM to group DM by creating a new group with both participants + new user
                      socket.emit('group-dm:create', {
                        participantIds: [channel.participant?.id, f.id].filter(Boolean),
                        name: null
                      });
                    }
                  }
                  setShowAddMember(false);
                  setAddMemberSearch('');
                }}>
                  <span className="add-member-avatar" style={{ background: f.color }}>{f.customAvatar ? <img src={f.customAvatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : f.avatar}</span>
                  <span className="add-member-name">{f.username}</span>
                </button>
              ))}
            {(friends || []).filter(f => {
              const existingIds = channel.isGroup ? (channel.participants || []).map(p => p.id) : [channel.participant?.id, currentUser?.id].filter(Boolean);
              return !existingIds.includes(f.id) && f.username.toLowerCase().includes(addMemberSearch.toLowerCase());
            }).length === 0 && (
              <div className="add-member-empty">No friends to add</div>
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="messages-container" ref={messagesContainerRef} onScroll={handleScroll}>
        {loadingOlder && (
          <div className="loading-older-messages">
            <span className="loading-spinner" />Loading older messages...
          </div>
        )}
        {grouped.length===0 && (
          <div className="messages-welcome">
            {channel.isDM ? (
              <>
                <div className="welcome-icon" style={{ background: channel.participant?.color || '#3B82F6' }}>
                  {channel.participant?.customAvatar
                    ? <img src={channel.participant.customAvatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                    : (channel.participant?.avatar || '👤')}
                </div>
                <h3>{channel.participant?.username || channel.name}</h3>
                <p>This is the beginning of your direct message history with <strong>{channel.participant?.username || channel.name}</strong>.</p>
              </>
            ) : (
              <>
                <div className="welcome-icon">#</div>
                <h3>Welcome to #{channel.name}!</h3>
                <p>This is the start of the #{channel.name} channel.</p>
              </>
            )}
          </div>
        )}
        {grouped.map((msg,i) => {
          const showDate = i===0 || formatDate(msg.timestamp)!==formatDate(grouped[i-1].timestamp);
          const isEditing = editingMessage?.id === msg.id;
          const replyToMsg = msg.replyTo ? messages.find(m => m.id === msg.replyTo) : null;
          const isAdmin = server?.members?.[currentUser?.id]?.roles?.includes('admin');

          return (
            <React.Fragment key={msg.id}>
              {showDate && <div className="message-date-divider"><span>{formatDate(msg.timestamp)}</span></div>}
              <div
                ref={el => messageRefs.current[msg.id] = el}
                className={`message ${msg.isGrouped?'grouped':''} ${msg.author.id===currentUser?.id?'own':''} ${msg.isWebhook?'webhook-msg':''} ${isEditing?'editing':''} ${highlightedMessageId===msg.id?'highlighted':''} ${mobileActionsId===msg.id?'mobile-actions-visible':''} ${(msg.mentions?.everyone || msg.mentions?.users?.some(u => u.id === currentUser?.id)) ? 'mention-highlight' : ''}`}
                onContextMenu={(e) => handleMessageContextMenu(e, msg)}
                onTouchStart={(e) => {
                  longPressCallbackRef.current = (ev) => handleMessageContextMenu(ev, msg);
                  messageLongPress.onTouchStart(e);
                }}
                onTouchMove={messageLongPress.onTouchMove}
                onTouchEnd={(e) => {
                  messageLongPress.onTouchEnd(e);
                  // Single tap toggles mobile actions (only on touch devices)
                  if (!e.defaultPrevented && 'ontouchstart' in window) {
                    handleMobileTap(msg.id);
                  }
                }}
              >
                {!msg.isGrouped && (
                  <div className="message-avatar" style={{background: msg.author.customAvatar || (msg.isWebhook && msg.author.avatar?.startsWith?.('http')) ? 'transparent' : msg.author.color}}>
                    {msg.author.customAvatar
                      ? <img src={msg.author.customAvatar} alt="" className="avatar-custom-img"/>
                      : (msg.isWebhook && msg.author.avatar?.startsWith?.('http'))
                        ? <img src={msg.author.avatar} alt="" className="avatar-custom-img"/>
                        : msg.author.avatar}
                  </div>
                )}
                {msg.isGrouped && <div className="message-avatar-spacer"/>}
                <div className="message-content-wrap">
                  {!msg.isGrouped && (
                    <div className="message-header">
                      <span className="message-author" style={{color:msg.author.color}}>{msg.author.username}</span>
                      {msg.isWebhook && <span className="webhook-badge">BOT</span>}
                      <span className="message-time">{formatTime(msg.timestamp)}</span>
                      {msg.editedAt && <span className="edited-badge">(edited)</span>}
                    </div>
                  )}
                  {replyToMsg && (
                    <div className="message-reply-indicator" onClick={() => handleClickReply(msg.replyTo)} style={{cursor: 'pointer'}}>
                      <span className="reply-author" style={{color: replyToMsg.author.color}}>
                        @{replyToMsg.author.username}
                      </span>
                      <span className="reply-content">{replyToMsg.content?.substring(0, 50)}{(replyToMsg.content?.length || 0) > 50 ? '...' : ''}</span>
                    </div>
                  )}
                  {isEditing ? (
                    <div className="message-edit-box">
                      <textarea
                        className="edit-input"
                        value={editInput}
                        onChange={(e) => setEditInput(e.target.value)}
                        onKeyDown={handleEditKeyDown}
                        autoFocus
                        maxLength={2000}
                      />
                      <div className="edit-actions">
                        <button className="edit-save-btn" onClick={handleSaveEdit}>Save</button>
                        <button className="edit-cancel-btn" onClick={handleCancelEdit}>Cancel</button>
                        <span className="edit-hint">Escape to cancel • Enter to save</span>
                      </div>
                    </div>
                  ) : (
                    <>
                      {msg.content && (
                        <>
                          <div className="message-text">
                            <MentionText
                              content={msg.content}
                              mentions={msg.mentions}
                              channelLinks={msg.channelLinks}
                              currentUser={currentUser}
                              server={server}
                              socket={socket}
                            />
                          </div>
                          {containsInviteLink(msg.content) && (
                            splitMessageContent(msg.content)
                              .filter(p => p.type === 'invite' && p.code)
                              .map((p, i) => (
                                <InviteEmbed key={`${msg.id}-invite-${i}`} inviteCode={p.code} socket={socket} />
                              ))
                          )}
                          {extractURLs(msg.content).slice(0, 3).map((embedUrl, i) => (
                            <URLEmbed key={`${msg.id}-url-${i}`} url={embedUrl} />
                          ))}
                          {(() => {
                            // Detect internal message links: nexus://server/channel/message
                            const linkRegex = /nexus:\/\/([^/]+)\/([^/]+)\/([^\s]+)/g;
                            const links = [];
                            let m;
                            while ((m = linkRegex.exec(msg.content)) !== null) {
                              links.push({ serverId: m[1], channelId: m[2], messageId: m[3] });
                            }
                            return links.slice(0, 3).map((link, i) => (
                              <MessageLinkEmbed key={`${msg.id}-mle-${i}`}
                                serverId={link.serverId} channelId={link.channelId}
                                messageId={link.messageId} socket={socket} />
                            ));
                          })()}
                        </>
                      )}
                      {msg.commandData && (
                        <CommandMessage
                          commandData={msg.commandData}
                          message={msg}
                          socket={socket}
                          currentUser={currentUser}
                          server={server}
                        />
                      )}
                      {(msg.embeds||[]).map((embed,ei) => (
                        <div key={ei} className="webhook-embed" style={{borderLeftColor: embed.color ? `#${embed.color.toString(16).padStart(6,'0')}` : '#3B82F6'}}>
                          {embed.author && (
                            <div className="embed-author">
                              {embed.author.icon_url && <img src={embed.author.icon_url} alt="" className="embed-author-icon"/>}
                              {embed.author.url ? <a href={embed.author.url} target="_blank" rel="noopener noreferrer">{embed.author.name}</a> : embed.author.name}
                            </div>
                          )}
                          {embed.title && (
                            <div className="embed-title">
                              {embed.url ? <a href={embed.url} target="_blank" rel="noopener noreferrer">{embed.title}</a> : embed.title}
                            </div>
                          )}
                          {embed.description && <div className="embed-description">{embed.description}</div>}
                          {embed.fields && embed.fields.length > 0 && (
                            <div className="embed-fields">
                              {embed.fields.map((f,fi) => (
                                <div key={fi} className={`embed-field ${f.inline ? 'inline' : ''}`}>
                                  <div className="embed-field-name">{f.name}</div>
                                  <div className="embed-field-value">{f.value}</div>
                                </div>
                              ))}
                            </div>
                          )}
                          {embed.image && <img src={embed.image.url} alt="" className="embed-image"/>}
                          {embed.thumbnail && <img src={embed.thumbnail.url} alt="" className="embed-thumbnail"/>}
                          {embed.footer && (
                            <div className="embed-footer">
                              {embed.footer.icon_url && <img src={embed.footer.icon_url} alt="" className="embed-footer-icon"/>}
                              <span>{embed.footer.text}</span>
                              {embed.timestamp && <span> • {new Date(embed.timestamp).toLocaleDateString()}</span>}
                            </div>
                          )}
                        </div>
                      ))}
                      {(msg.attachments||[]).map((att,ai) => (
                        <MessageAttachment key={ai} attachment={att} onLightbox={setLightbox} />
                      ))}
                    </>
                  )}
                  {Object.keys(msg.reactions||{}).length>0 && (
                    <div className="message-reactions">
                      {Object.entries(msg.reactions).map(([emoji,users]) => (
                        <button key={emoji}
                          className={`reaction ${users.includes(currentUser?.id)?'reacted':''}`}
                          onClick={e=>{e.stopPropagation();handleReact(msg.id,emoji);}}>
                          {emoji} <span>{users.length}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {!isEditing && (
                  <div className="message-actions">
                    <button className="reaction-btn"
                      onClick={e=>{e.stopPropagation();setReactionTarget(reactionTarget===msg.id?null:msg.id);}}>😊</button>
                    <button className="message-options-btn"
                      onClick={e=>handleMessageContextMenu(e, msg)}
                      title="Message options">⋯</button>
                    {reactionTarget===msg.id && (
                      <EmojiPicker
                        onSelect={(emoji) => handleReact(msg.id, emoji)}
                        onClose={() => setReactionTarget(null)}
                        servers={servers}
                        currentServerId={server?.id}
                        socket={socket}
                      />
                    )}
                  </div>
                )}
              </div>
            </React.Fragment>
          );
        })}
        <div ref={messagesEndRef}/>
      </div>

      <div className="typing-bar">
        {typingUsers.length>0 && (
          <div className="typing-indicator">
            <div className="typing-dots"><span/><span/><span/></div>
            <span>{typingUsers.map(u=>u.username).join(', ')} {typingUsers.length===1?'is':'are'} typing...</span>
          </div>
        )}
      </div>

      {pendingAttachments.length>0 && (
        <div className="pending-attachments">
          {pendingAttachments.map((att,i) => (
            <div key={i} className="pending-attachment">
              <img src={att.url} alt={att.name}/>
              {att.type==='image/gif' && <span className="gif-badge small">GIF</span>}
              <button className="remove-attachment" onClick={()=>setPendingAttachments(p=>p.filter((_,j)=>j!==i))}>✕</button>
            </div>
          ))}
        </div>
      )}

      {replyingTo && (
        <div className="reply-indicator-bar">
          <div className="reply-indicator-content">
            <span className="reply-label">Replying to</span>
            <span className="reply-username" style={{color: replyingTo.author.color}}>
              {replyingTo.author.username}
            </span>
            <span className="reply-preview">{replyingTo.content?.substring(0, 60)}{(replyingTo.content?.length || 0) > 60 ? '...' : ''}</span>
          </div>
          <button className="reply-cancel-btn" onClick={handleCancelReply} title="Cancel reply">✕</button>
        </div>
      )}

      {pollCreatorOpen && (
        <PollCreator onClose={() => setPollCreatorOpen(false)} onSubmit={handlePollSubmit} />
      )}

      <div className="chat-input-wrap" style={{ position: 'relative' }}>
        {commandQuery !== null && commandSuggestions.length > 0 && (
          <div className="mention-autocomplete command-autocomplete">
            <div className="mention-autocomplete-header">Commands</div>
            {commandSuggestions.map((cmd, i) => (
              <div
                key={cmd.name}
                className={`mention-autocomplete-item ${i === commandIndex ? 'active' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); insertCommand(cmd); }}
                onMouseEnter={() => setCommandIndex(i)}
              >
                <div className="command-icon-badge">{cmd.icon}</div>
                <div className="command-info">
                  <span className="command-name">/{cmd.name}</span>
                  <span className="command-desc">{cmd.description}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {mentionQuery && mentionSuggestions.length > 0 && (
          <div className="mention-autocomplete">
            <div className="mention-autocomplete-header">
              {mentionSuggestions.some(s => s.type === 'user') ? 'Members' : ''}
              {mentionSuggestions.some(s => s.type === 'role') ? ' Roles' : ''}
              {mentionSuggestions.some(s => s.type === 'special') ? '' : ''}
            </div>
            {mentionSuggestions.map((s, i) => (
              <div
                key={`${s.type}-${s.id}`}
                className={`mention-autocomplete-item ${i === mentionIndex ? 'active' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); insertMention(s); }}
                onMouseEnter={() => setMentionIndex(i)}
              >
                {s.type === 'user' && (
                  <div className="mention-avatar" style={{ background: !s.avatar?.startsWith?.('data:') ? (s.color || '#3B82F6') : 'transparent' }}>
                    {s.avatar?.startsWith?.('data:') ? <img src={s.avatar} alt="" /> : (s.avatar || s.name?.[0]?.toUpperCase())}
                  </div>
                )}
                {s.type === 'role' && (
                  <div className="mention-role-color" style={{ background: s.color || '#99aab5' }} />
                )}
                {s.type === 'special' && (
                  <div className="mention-avatar" style={{ background: '#faa61a' }}>@</div>
                )}
                <span className="mention-name" style={s.type === 'role' ? { color: s.color || '#99aab5' } : undefined}>
                  {s.type === 'special' ? s.label : `@${s.name}`}
                </span>
              </div>
            ))}
          </div>
        )}
        {channelQuery && channelSuggestions.length > 0 && (
          <div className="mention-autocomplete">
            <div className="mention-autocomplete-header">Channels</div>
            {channelSuggestions.map((ch, i) => (
              <div
                key={ch.id}
                className={`mention-autocomplete-item ${i === channelIndex ? 'active' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); insertChannel(ch); }}
                onMouseEnter={() => setChannelIndex(i)}
              >
                <span style={{color:'var(--text-muted)',marginRight:6,fontSize:14}}>#</span>
                <span className="mention-name">{ch.name}</span>
              </div>
            ))}
          </div>
        )}
        <div className="chat-input-box">
          <input ref={fileInputRef} type="file" accept="image/*" multiple style={{display:'none'}}
            onChange={e=>addFiles(e.target.files)}/>
          <textarea ref={inputRef} className="chat-input"
            placeholder={channel.isDM ? `Message @${channel.participant?.username || channel.name}` : 'Start typing...'}
            value={input} onChange={handleInput} onKeyDown={handleKeyDown}
            onPaste={handlePaste} rows={1} maxLength={2000}/>
          <div className="chat-input-actions">
            <button className="attach-btn" onClick={()=>fileInputRef.current?.click()} title="Attach image">
              <AttachmentIcon size={18} color="currentColor" />
            </button>
            <div style={{ position: 'relative' }}>
              <button className={`attach-btn ${gifPickerOpen ? 'active' : ''}`} onClick={() => setGifPickerOpen(!gifPickerOpen)} title="GIF">
                <span style={{ fontSize: 12, fontWeight: 700 }}>GIF</span>
              </button>
              {gifPickerOpen && (
                <GifPicker onSelect={handleGifSelect} onClose={() => setGifPickerOpen(false)} />
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <button className={`attach-btn ${inputEmojiOpen ? 'active' : ''}`} onClick={() => setInputEmojiOpen(!inputEmojiOpen)} title="Emoji">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
                  <line x1="9" y1="9" x2="9.01" y2="9"/>
                  <line x1="15" y1="9" x2="15.01" y2="9"/>
                </svg>
              </button>
              {inputEmojiOpen && (
                <EmojiPicker
                  onSelect={(emoji) => {
                    const ta = inputRef.current;
                    if (ta) {
                      const start = ta.selectionStart;
                      const end = ta.selectionEnd;
                      const newVal = input.substring(0, start) + emoji + input.substring(end);
                      handleInput({ target: { value: newVal } });
                      setTimeout(() => { ta.selectionStart = ta.selectionEnd = start + emoji.length; ta.focus(); }, 0);
                    } else {
                      handleInput({ target: { value: input + emoji } });
                    }
                  }}
                  onClose={() => setInputEmojiOpen(false)}
                  servers={servers}
                  currentServerId={server?.id}
                  socket={socket}
                />
              )}
            </div>
            <button className="send-btn" onClick={handleSend}
              disabled={!input.trim() && !pendingAttachments.length} title="Send">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

export default ChatArea;
