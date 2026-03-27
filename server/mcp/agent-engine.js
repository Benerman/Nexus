/**
 * Agent Engine — Routes messages to configured AI agents and handles responses.
 *
 * This engine processes incoming messages and determines whether any configured
 * agent should respond. It supports:
 * - @mention triggers (agent responds when mentioned)
 * - Keyword triggers (agent responds when keywords match)
 * - Auto triggers (agent responds to all messages in configured channels)
 * - AI moderation (extends AutoMod with AI-based content review)
 * - Channel summarization (/summarize command)
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { state, channelToServer } = require('../state');
const { executeConnectionTool } = require('./client');


/**
 * Process a new message and check if any agents should respond
 * Called after a message is broadcast to the channel
 */
async function processMessage(io, msg, serverId) {
  if (!serverId || !msg || msg.isBot || msg.isWebhook) return;

  const srv = state.servers[serverId];
  if (!srv) return;

  // Load agent configs for this server
  let agents;
  try {
    const result = await db.query(
      `SELECT ac.*, a.username as bot_username, a.avatar as bot_avatar, a.color as bot_color
       FROM agent_configs ac
       LEFT JOIN accounts a ON ac.bot_account_id = a.id
       WHERE ac.server_id = $1 AND ac.enabled = true`,
      [serverId]
    );
    agents = result.rows;
  } catch (err) {
    console.error('[Agent] Failed to load agent configs:', err.message);
    return;
  }

  if (!agents || agents.length === 0) return;

  for (const agent of agents) {
    const shouldRespond = checkTrigger(agent, msg);
    if (!shouldRespond) continue;

    // Process asynchronously to not block message delivery
    handleAgentResponse(io, agent, msg, serverId).catch(err => {
      console.error(`[Agent] Error processing response for "${agent.name}":`, err.message);
    });
  }
}

/**
 * Check if an agent should respond to a message based on its trigger configuration
 */
function checkTrigger(agent, msg) {
  const triggerMode = agent.trigger_mode;

  // Check channel filter
  const triggerChannels = typeof agent.trigger_channels === 'string'
    ? JSON.parse(agent.trigger_channels) : (agent.trigger_channels || []);
  if (triggerChannels.length > 0 && !triggerChannels.includes(msg.channelId)) {
    return false;
  }

  switch (triggerMode) {
    case 'mention': {
      // Check if the agent's bot account is mentioned
      if (!agent.bot_account_id) return false;
      const mentionedUsers = msg.mentions?.users || [];
      return mentionedUsers.some(u => u.id === agent.bot_account_id);
    }

    case 'keyword': {
      const keywords = typeof agent.trigger_keywords === 'string'
        ? JSON.parse(agent.trigger_keywords) : (agent.trigger_keywords || []);
      if (keywords.length === 0) return false;
      const content = (msg.content || '').toLowerCase();
      return keywords.some(kw => content.includes(kw.toLowerCase()));
    }

    case 'auto':
      return true;

    case 'slash':
      // Slash-only agents are triggered via /ask or /agent commands, not here
      return false;

    default:
      return false;
  }
}

/**
 * Generate and send an agent response
 */
async function handleAgentResponse(io, agent, triggerMsg, serverId) {
  const startTime = Date.now();
  const channelId = triggerMsg.channelId;

  // Show typing indicator
  io.to(`text:${channelId}`).emit('typing:start', {
    userId: agent.bot_account_id || 'agent',
    username: agent.bot_username || agent.name,
    channelId
  });

  try {
    // Build context: recent messages from this channel
    const recentMessages = await db.getChannelMessagesWithAuthors(channelId, 20);
    const context = recentMessages.map(m => ({
      role: m.author_id === agent.bot_account_id ? 'assistant' : 'user',
      content: `${m.author_username || m.webhook_username || 'Unknown'}: ${m.content}`
    }));

    let responseText;
    let toolCalls = [];

    // If agent has an MCP connection, use it to generate the response
    if (agent.mcp_connection_id) {
      const result = await executeConnectionTool(agent.mcp_connection_id, 'generate_response', {
        system_prompt: agent.system_prompt || `You are ${agent.name}, a helpful AI assistant in a chat channel.`,
        messages: context,
        trigger_message: triggerMsg.content,
        max_tokens: agent.max_response_length || 2000
      });

      if (result.error) {
        responseText = `I encountered an error processing your request: ${result.error}`;
      } else {
        const textParts = (result.content || []).filter(c => c.type === 'text').map(c => c.text);
        responseText = textParts.join('\n') || 'I processed your request but have no text response.';
        toolCalls = (result.content || []).filter(c => c.type === 'tool_use');
      }
    } else {
      // No MCP connection — generate a simple acknowledgment
      responseText = `Agent "${agent.name}" received your message but has no AI backend configured. ` +
        `Connect an MCP server with a \`generate_response\` tool in server settings to enable AI responses.`;
    }

    // Truncate response
    responseText = responseText.slice(0, agent.max_response_length || 2000);

    // Send response as bot message
    const responseMsg = {
      id: uuidv4(),
      channelId,
      content: responseText,
      author: {
        id: agent.bot_account_id || `agent:${agent.id}`,
        username: agent.bot_username || agent.name,
        avatar: agent.bot_avatar || '🤖',
        color: agent.bot_color || '#10B981',
        isWebhook: true,
        isBot: true
      },
      timestamp: Date.now(),
      reactions: {},
      isBot: true,
      commandData: toolCalls.length > 0 ? {
        type: 'agent_response',
        agentName: agent.name,
        toolsUsed: toolCalls.map(t => t.name)
      } : undefined
    };

    // Store in memory
    if (!state.messages[channelId]) state.messages[channelId] = [];
    state.messages[channelId].push(responseMsg);
    if (state.messages[channelId].length > 500) {
      state.messages[channelId] = state.messages[channelId].slice(-500);
    }

    // Broadcast (SSE event bridge captures this automatically via io.to() patch)
    io.to(`text:${channelId}`).emit('message:new', responseMsg);

    // Stop typing
    io.to(`text:${channelId}`).emit('typing:stop', {
      userId: agent.bot_account_id || 'agent',
      channelId
    });

    // Persist to database
    try {
      await db.saveMessage({
        id: responseMsg.id, channelId, authorId: agent.bot_account_id || null,
        content: responseText, attachments: [],
        isWebhook: true, webhookUsername: agent.bot_username || agent.name,
        webhookAvatar: agent.bot_avatar || '🤖',
        replyTo: null, mentions: {}, embeds: []
      });
    } catch (err) {
      console.error('[Agent] Error saving response message:', err.message);
    }

    // Log activity
    const duration = Date.now() - startTime;
    try {
      await db.query(
        `INSERT INTO agent_activity_log (agent_config_id, server_id, channel_id, action, input_summary, output_summary, tool_calls, duration_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [agent.id, serverId, channelId, 'respond',
         (triggerMsg.content || '').slice(0, 500),
         responseText.slice(0, 500),
         JSON.stringify(toolCalls.map(t => t.name)),
         duration]
      );
    } catch (err) {
      // Non-fatal
    }

    console.log(`[Agent] "${agent.name}" responded in ${duration}ms (${responseText.length} chars)`);

  } catch (err) {
    console.error(`[Agent] Response generation error for "${agent.name}":`, err.message);

    // Log error
    try {
      await db.query(
        `INSERT INTO agent_activity_log (agent_config_id, server_id, channel_id, action, error, duration_ms)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [agent.id, serverId, channelId, 'error', err.message, Date.now() - startTime]
      );
    } catch (logErr) { /* non-fatal */ }
  }
}

/**
 * AI Moderation — Check a message with an AI model before/after broadcast.
 * Returns { safe: bool, reason: string, action: string, confidence: number }
 */
async function moderateMessage(msg, serverId, mcpConnectionId) {
  if (!mcpConnectionId) return { safe: true };

  try {
    const result = await executeConnectionTool(mcpConnectionId, 'moderate_content', {
      content: msg.content || '',
      author: msg.author?.username || 'Unknown',
      context: 'chat_message'
    });

    if (result.error) {
      console.warn('[Agent] Moderation tool error:', result.error);
      return { safe: true }; // Fail open — don't block messages on moderation failure
    }

    const textContent = (result.content || [])
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('');

    try {
      const parsed = JSON.parse(textContent);
      return {
        safe: parsed.safe !== false,
        reason: parsed.reason || '',
        action: parsed.action || 'none',
        confidence: parsed.confidence || 0
      };
    } catch {
      return { safe: true };
    }
  } catch (err) {
    console.error('[Agent] Moderation error:', err.message);
    return { safe: true }; // Fail open
  }
}

/**
 * Summarize a channel's recent messages
 */
async function summarizeChannel(channelId, mcpConnectionId, messageCount = 50) {
  const messages = await db.getChannelMessagesWithAuthors(channelId, messageCount);
  if (messages.length === 0) return 'No messages to summarize.';

  if (!mcpConnectionId) {
    // Simple summary without AI
    const authors = new Set(messages.map(m => m.author_username || m.webhook_username || 'Unknown'));
    const timespan = messages.length > 1
      ? `${new Date(messages[messages.length - 1].created_at).toLocaleString()} — ${new Date(messages[0].created_at).toLocaleString()}`
      : 'single message';

    return `**Channel Summary** (${messages.length} messages, ${authors.size} participants, ${timespan})\n\n` +
      `Participants: ${[...authors].join(', ')}\n\n` +
      `No AI summarization backend configured. Connect an MCP server with a \`summarize_conversation\` tool for AI-powered summaries.`;
  }

  try {
    const conversation = messages.map(m => ({
      author: m.author_username || m.webhook_username || 'Unknown',
      content: m.content,
      timestamp: m.created_at
    }));

    const result = await executeConnectionTool(mcpConnectionId, 'summarize_conversation', {
      messages: conversation,
      format: 'bullet_points'
    });

    if (result.error) return `Summarization error: ${result.error}`;

    const textContent = (result.content || [])
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n');

    return textContent || 'Summarization returned empty result.';
  } catch (err) {
    return `Summarization failed: ${err.message}`;
  }
}

module.exports = {
  processMessage,
  checkTrigger,
  handleAgentResponse,
  moderateMessage,
  summarizeChannel,
};
