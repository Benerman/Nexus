import React from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import emojiImageCache from '../utils/emojiCache';

/**
 * Renders message content with highlighted @mentions, #channel links, and custom emojis.
 * Splits content at mention/channel/emoji boundaries and wraps them in styled spans.
 */
function MentionText({ content, mentions, channelLinks, currentUser, server, onNavigateToChannel, socket }) {
  if (!content) return null;

  const hasMentions = mentions && (
    mentions.everyone ||
    (mentions.users && mentions.users.length > 0) ||
    (mentions.roles && mentions.roles.length > 0)
  );
  const hasChannelLinks = channelLinks && channelLinks.length > 0;
  const hasCustomEmojis = /:([a-zA-Z0-9_]+):([^:]+):([^:]+):/.test(content);

  if (!hasMentions && !hasChannelLinks && !hasCustomEmojis) {
    return (
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}
        components={{ a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> }}>
        {content}
      </ReactMarkdown>
    );
  }

  // Build regex patterns from all special tokens
  const patterns = [];
  if (mentions?.everyone) patterns.push('@everyone');
  if (mentions?.users) {
    for (const u of mentions.users) patterns.push('@' + u.username);
  }
  if (mentions?.roles) {
    for (const r of mentions.roles) {
      patterns.push('@' + r.name.replace(/^@/, ''));
    }
  }
  if (channelLinks) {
    for (const ch of channelLinks) patterns.push('#' + ch.name);
  }

  // Sort patterns by length (longest first)
  patterns.sort((a, b) => b.length - a.length);
  const escaped = patterns.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  // Add custom emoji pattern
  const emojiPattern = ':([a-zA-Z0-9_]+):([^:]+):([^:]+):';
  if (escaped.length > 0) {
    escaped.push(emojiPattern);
  }

  const combinedRegex = escaped.length > 0
    ? new RegExp(`(${escaped.join('|')})`, 'gi')
    : new RegExp(`(${emojiPattern})`, 'gi');

  const parts = content.split(combinedRegex);

  const isMentioned = mentions?.everyone ||
    (mentions?.users && mentions.users.some(u => u.id === currentUser?.id));

  const getRoleMentionColor = (text) => {
    if (!server?.roles || !mentions?.roles) return null;
    const cleanText = text.replace(/^@/, '').toLowerCase();
    const mentionedRole = mentions.roles.find(r =>
      r.name.replace(/^@/, '').toLowerCase() === cleanText
    );
    if (mentionedRole) {
      const role = Object.values(server.roles).find(r => r.id === mentionedRole.id);
      return role?.color || null;
    }
    return null;
  };

  const segments = [];
  let markdownBuffer = '';
  const flushMarkdown = () => {
    if (markdownBuffer) {
      segments.push({ type: 'markdown', content: markdownBuffer });
      markdownBuffer = '';
    }
  };

  for (const part of parts) {
    if (!part) continue;
    combinedRegex.lastIndex = 0;

    // Check for custom emoji
    const emojiMatch = part.match(/^:([a-zA-Z0-9_]+):([^:]+):([^:]+):$/);
    if (emojiMatch) {
      flushMarkdown();
      segments.push({ type: 'emoji', name: emojiMatch[1], serverId: emojiMatch[2], emojiId: emojiMatch[3] });
      continue;
    }

    if (combinedRegex.test(part)) {
      flushMarkdown();
      if (part.startsWith('#') && channelLinks?.some(ch => '#' + ch.name.toLowerCase() === part.toLowerCase())) {
        const ch = channelLinks.find(c => '#' + c.name.toLowerCase() === part.toLowerCase());
        segments.push({ type: 'channel', content: part, channel: ch });
      } else {
        segments.push({ type: 'mention', content: part });
      }
    } else {
      markdownBuffer += part;
    }
  }
  flushMarkdown();

  return (
    <span className={isMentioned ? 'mention-highlight-message' : ''}>
      {segments.map((seg, i) => {
        if (seg.type === 'mention') {
          const roleColor = getRoleMentionColor(seg.content);
          const isEveryoneMention = seg.content.toLowerCase() === '@everyone';
          const isUserMention = !isEveryoneMention && !roleColor;
          return (
            <span key={i}
              className={`mention-tag ${isEveryoneMention ? 'mention-everyone' : ''} ${isUserMention ? 'mention-user' : ''} ${roleColor ? 'mention-role' : ''}`}
              style={roleColor ? { '--mention-color': roleColor } : undefined}>
              {seg.content}
            </span>
          );
        }
        if (seg.type === 'channel') {
          return (
            <span key={i} className="channel-link"
              onClick={() => onNavigateToChannel?.(seg.channel)}
              title={`Go to #${seg.channel?.name}`}>
              {seg.content}
            </span>
          );
        }
        if (seg.type === 'emoji') {
          return <CustomEmojiInline key={i} emojiId={seg.emojiId} name={seg.name} serverId={seg.serverId} socket={socket} />;
        }
        return (
          <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}
            components={{ a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> }}>
            {seg.content}
          </ReactMarkdown>
        );
      })}
    </span>
  );
}

// Inline component for custom emoji rendering with lazy loading
function CustomEmojiInline({ emojiId, name, serverId, socket }) {
  const [src, setSrc] = React.useState(() => emojiImageCache.get(emojiId) || null);

  React.useEffect(() => {
    if (src || !socket || !emojiId) return;
    socket.emit('emoji:get-image', { emojiId }, (response) => {
      if (response && response.imageData) {
        emojiImageCache.set(emojiId, response.imageData);
        setSrc(response.imageData);
      }
    });
  }, [emojiId, socket, src]);

  if (!src) {
    return <span className="custom-emoji-placeholder img-placeholder" title={`:${name}:`} style={{ display: 'inline-block', width: 20, height: 20, verticalAlign: 'middle', borderRadius: 4 }} />;
  }
  return <img src={src} alt={`:${name}:`} title={`:${name}:`} className="custom-emoji-inline" />;
}

export default React.memo(MentionText);
