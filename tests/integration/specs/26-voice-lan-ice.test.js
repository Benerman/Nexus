const { TestUserManager } = require('../helpers/test-user');
const { ApiClient } = require('../helpers/api-client');
const { waitForEvent, emitAndWait } = require('../helpers/socket-client');

const SERVER_URL = process.env.SERVER_URL || process.env.__INTEGRATION_SERVER_URL__ || 'http://localhost:4444';

describe('Voice, LAN Mode & ICE Configuration', () => {
  let users;
  let api;
  let owner, member;
  let serverId, voiceChannelId;

  beforeAll(async () => {
    users = new TestUserManager(SERVER_URL);
    api = new ApiClient(SERVER_URL);

    owner = await users.createConnected('vowner');
    member = await users.createConnected('vmember');

    // Owner creates a server
    const createPromise = waitForEvent(owner.socket, 'server:created', 10000);
    owner.socket.emit('server:create', { name: 'Voice LAN Test Server' });
    const createData = await createPromise;
    serverId = createData.server.id;

    const voiceChannels = createData.server.channels?.voice || [];
    voiceChannelId = (voiceChannels.find(c => c.name === 'Voice') || voiceChannels[0])?.id;

    if (!voiceChannelId) throw new Error('No voice channel found in new server');

    // Invite member to the server
    const invitePromise = waitForEvent(owner.socket, 'invite:created', 5000);
    owner.socket.emit('invite:create', { serverId });
    const inviteData = await invitePromise;

    const joinPromise = waitForEvent(member.socket, 'invite:joined', 10000);
    member.socket.emit('invite:use', { inviteCode: inviteData.invite.id || inviteData.invite.code });
    await joinPromise;
  });

  afterAll(async () => {
    await users.cleanupAll();
  });

  // ─── Voice Channel Join/Leave ─────────────────────────────────────────────

  test('voice:join returns voice:joined with peer list', async () => {
    const joinedPromise = waitForEvent(owner.socket, 'voice:joined', 5000);
    owner.socket.emit('voice:join', { channelId: voiceChannelId });
    const data = await joinedPromise;

    expect(data.channelId).toBe(voiceChannelId);
    expect(Array.isArray(data.peers)).toBe(true);
    expect(data.peers).toHaveLength(0);
  });

  test('second user joining emits peer:joined to first user', async () => {
    const peerPromise = waitForEvent(owner.socket, 'peer:joined', 5000);
    const joinedPromise = waitForEvent(member.socket, 'voice:joined', 5000);

    member.socket.emit('voice:join', { channelId: voiceChannelId });

    const [peerData, joinData] = await Promise.all([peerPromise, joinedPromise]);

    expect(peerData.socketId).toBe(member.socket.id);
    expect(peerData.user).toBeDefined();

    expect(joinData.channelId).toBe(voiceChannelId);
    expect(joinData.peers.length).toBe(1);
    expect(joinData.peers[0].socketId).toBe(owner.socket.id);
  });

  test('voice:leave emits peer:left to remaining users', async () => {
    const leftPromise = waitForEvent(owner.socket, 'peer:left', 5000);
    member.socket.emit('voice:leave');
    const data = await leftPromise;

    expect(data.socketId).toBe(member.socket.id);
  });

  test('voice:join to nonexistent channel emits voice:join-failed', async () => {
    const failPromise = waitForEvent(member.socket, 'voice:join-failed', 3000);
    member.socket.emit('voice:join', { channelId: 'nonexistent-channel-id' });
    const data = await failPromise;

    expect(data.channelId).toBe('nonexistent-channel-id');
  });

  test('owner can leave voice channel', async () => {
    owner.socket.emit('voice:leave');
    await new Promise(r => setTimeout(r, 500));
  });

  // ─── Voice Mute/Deafen ───────────────────────────────────────────────────

  test('voice:mute broadcasts peer:mute:changed to channel', async () => {
    // Both join voice
    const ownerJoinPromise = waitForEvent(owner.socket, 'voice:joined', 5000);
    owner.socket.emit('voice:join', { channelId: voiceChannelId });
    await ownerJoinPromise;

    const memberJoinPromise = waitForEvent(member.socket, 'voice:joined', 5000);
    member.socket.emit('voice:join', { channelId: voiceChannelId });
    await memberJoinPromise;

    const mutePromise = waitForEvent(owner.socket, 'peer:mute:changed', 5000);
    member.socket.emit('voice:mute', { isMuted: true, channelId: voiceChannelId });
    const data = await mutePromise;

    expect(data.socketId).toBe(member.socket.id);
    expect(data.isMuted).toBe(true);
  });

  test('voice:deafen broadcasts peer:deafen:changed to channel', async () => {
    const deafenPromise = waitForEvent(owner.socket, 'peer:deafen:changed', 5000);
    member.socket.emit('voice:deafen', { isDeafened: true, channelId: voiceChannelId });
    const data = await deafenPromise;

    expect(data.socketId).toBe(member.socket.id);
    expect(data.isDeafened).toBe(true);

    owner.socket.emit('voice:leave');
    member.socket.emit('voice:leave');
    await new Promise(r => setTimeout(r, 500));
  });

  // ─── ICE Configuration ───────────────────────────────────────────────────

  test('voice:ice-config returns default STUN servers', async () => {
    const result = await emitAndWait(owner.socket, 'voice:ice-config', { serverId });

    expect(result.iceServers).toBeDefined();
    expect(Array.isArray(result.iceServers)).toBe(true);
    expect(result.iceServers.length).toBeGreaterThan(0);
    expect(result.iceServers[0].urls).toMatch(/^stun:/);
  });

  test('server:get-ice-config returns null when no custom config is set', async () => {
    const result = await emitAndWait(owner.socket, 'server:get-ice-config', { serverId });

    expect(result.iceConfig).toBeNull();
  });

  test('server:get-ice-config is owner-only', async () => {
    const result = await emitAndWait(member.socket, 'server:get-ice-config', { serverId });

    expect(result.error).toBe('Owner only');
  });

  // ─── Per-Server Custom ICE Config ─────────────────────────────────────────

  test('setting custom ICE config replaces default STUN servers', async () => {
    // Capture default ICE servers before changing config
    const before = await emitAndWait(owner.socket, 'voice:ice-config', { serverId });
    const defaultStunUrls = before.iceServers.map(s => s.urls);
    expect(defaultStunUrls.length).toBeGreaterThan(0);
    expect(defaultStunUrls.some(u => u.includes('google'))).toBe(true);
    // No TURN server in defaults (no TURN_SECRET set in test env)
    expect(before.iceServers.every(s => !s.username)).toBe(true);

    // Apply custom config
    const iceUpdatedPromise = waitForEvent(owner.socket, 'server:ice-config:updated', 5000);
    owner.socket.emit('server:update', {
      serverId,
      iceConfig: {
        stunUrls: ['stun:custom-stun.example.com:3478'],
        turnUrl: 'turn:custom-turn.example.com:3478',
        turnSecret: 'test-secret-123',
      },
    });
    const ack = await iceUpdatedPromise;
    expect(ack.success).toBe(true);

    // Verify ICE servers changed from defaults to custom
    const after = await emitAndWait(owner.socket, 'voice:ice-config', { serverId });
    const afterUrls = after.iceServers.map(s => s.urls);

    // Default Google STUN should be gone
    expect(afterUrls.some(u => u.includes('google'))).toBe(false);
    // Custom STUN should be present
    expect(afterUrls).toContain('stun:custom-stun.example.com:3478');
    // TURN should be present with ephemeral credentials
    const turnServer = after.iceServers.find(s => s.urls?.startsWith('turn:'));
    expect(turnServer).toBeDefined();
    expect(turnServer.urls).toBe('turn:custom-turn.example.com:3478');
    expect(turnServer.username).toMatch(/^\d+:/);
    expect(turnServer.credential).toBeDefined();
  });

  test('server:get-ice-config reflects the custom config (secret masked)', async () => {
    const result = await emitAndWait(owner.socket, 'server:get-ice-config', { serverId });

    expect(result.iceConfig).not.toBeNull();
    expect(result.iceConfig.stunUrls).toEqual(['stun:custom-stun.example.com:3478']);
    expect(result.iceConfig.turnUrl).toBe('turn:custom-turn.example.com:3478');
    // Secret is never exposed — only a boolean flag
    expect(result.iceConfig.hasSecret).toBe(true);
    expect(result.iceConfig.turnSecret).toBeUndefined();
  });

  test('updating only STUN URLs preserves existing TURN secret', async () => {
    // Change STUN URLs without resending the secret
    const iceUpdatedPromise = waitForEvent(owner.socket, 'server:ice-config:updated', 5000);
    owner.socket.emit('server:update', {
      serverId,
      iceConfig: {
        stunUrls: ['stun:updated-stun.example.com:3478'],
        turnUrl: 'turn:custom-turn.example.com:3478',
      },
    });
    await iceUpdatedPromise;

    // TURN should still work (secret preserved from previous update)
    const iceResult = await emitAndWait(owner.socket, 'voice:ice-config', { serverId });
    const turnServer = iceResult.iceServers.find(s => s.urls?.startsWith('turn:'));
    expect(turnServer).toBeDefined();
    expect(turnServer.credential).toBeDefined();

    // STUN should reflect the new URL
    expect(iceResult.iceServers.map(s => s.urls)).toContain('stun:updated-stun.example.com:3478');
    expect(iceResult.iceServers.map(s => s.urls)).not.toContain('stun:custom-stun.example.com:3478');

    // get-ice-config should still show hasSecret
    const configResult = await emitAndWait(owner.socket, 'server:get-ice-config', { serverId });
    expect(configResult.iceConfig.hasSecret).toBe(true);
  });

  test('clearing custom ICE config reverts to default STUN servers', async () => {
    // Capture custom state before clearing
    const before = await emitAndWait(owner.socket, 'voice:ice-config', { serverId });
    expect(before.iceServers.map(s => s.urls)).toContain('stun:updated-stun.example.com:3478');

    // Clear custom config
    const iceUpdatedPromise = waitForEvent(owner.socket, 'server:ice-config:updated', 5000);
    owner.socket.emit('server:update', { serverId, iceConfig: null });
    await iceUpdatedPromise;

    // Verify config is cleared
    const configResult = await emitAndWait(owner.socket, 'server:get-ice-config', { serverId });
    expect(configResult.iceConfig).toBeNull();

    // Verify ICE servers reverted to defaults
    const after = await emitAndWait(owner.socket, 'voice:ice-config', { serverId });
    const afterUrls = after.iceServers.map(s => s.urls);
    // Custom URLs should be gone
    expect(afterUrls.some(u => u.includes('updated-stun'))).toBe(false);
    expect(afterUrls.some(u => u.includes('custom-turn'))).toBe(false);
    // Default Google STUN should be back
    expect(afterUrls.some(u => u.includes('google'))).toBe(true);
    // No TURN credentials (no global TURN_SECRET in test env)
    expect(after.iceServers.every(s => !s.username)).toBe(true);
  });

  // ─── ICE Config Validation ────────────────────────────────────────────────

  test('invalid STUN URL format is rejected', async () => {
    const errorPromise = waitForEvent(owner.socket, 'error', 3000).catch(() => null);
    owner.socket.emit('server:update', {
      serverId,
      iceConfig: {
        stunUrls: ['http://not-a-stun-url.com'],
      },
    });
    const error = await errorPromise;

    expect(error).not.toBeNull();
    expect(error.message).toMatch(/Invalid STUN URLs/);
  });

  test('invalid TURN URL format is rejected', async () => {
    const errorPromise = waitForEvent(owner.socket, 'error', 3000).catch(() => null);
    owner.socket.emit('server:update', {
      serverId,
      iceConfig: {
        turnUrl: 'http://not-a-turn-url.com',
        turnSecret: 'secret',
      },
    });
    const error = await errorPromise;

    expect(error).not.toBeNull();
    expect(error.message).toMatch(/Invalid TURN URL/);
  });

  test('non-owner cannot set ICE config', async () => {
    const errorPromise = waitForEvent(member.socket, 'error', 3000).catch(() => null);
    member.socket.emit('server:update', {
      serverId,
      iceConfig: {
        stunUrls: ['stun:evil.example.com:3478'],
      },
    });
    const error = await errorPromise;

    expect(error).not.toBeNull();
    expect(error.message).toMatch(/Only the server owner|No permission/);
  });

  // ─── LAN Mode ────────────────────────────────────────────────────────────

  test('enabling LAN mode clears ICE servers that were previously returned', async () => {
    // Capture ICE servers before enabling LAN mode
    const before = await emitAndWait(owner.socket, 'voice:ice-config', { serverId });
    expect(before.iceServers.length).toBeGreaterThan(0);

    // Enable LAN mode
    const updatePromise = waitForEvent(owner.socket, 'server:updated', 5000);
    owner.socket.emit('server:update', { serverId, lanMode: true });
    const data = await updatePromise;
    expect(data.server.lanMode).toBe(true);

    // ICE servers should now be empty
    const after = await emitAndWait(owner.socket, 'voice:ice-config', { serverId });
    expect(after.iceServers).toHaveLength(0);
  });

  test('LAN mode suppresses GIF search', async () => {
    const { status, body } = await api.get(
      `/api/gifs/search?q=hello&serverId=${serverId}`,
      owner.token
    );

    expect(status).toBe(200);
    expect(body.results).toEqual([]);
  });

  test('LAN mode suppresses GIF trending', async () => {
    const { status, body } = await api.get(
      `/api/gifs/trending?serverId=${serverId}`,
      owner.token
    );

    expect(status).toBe(200);
    expect(body.results).toEqual([]);
  });

  test('LAN mode blocks URL previews', async () => {
    const { status, body } = await api.get(
      `/api/og?url=https://example.com&serverId=${serverId}`,
      owner.token
    );

    expect(status).toBe(403);
    expect(body.error).toMatch(/LAN mode/);
  });

  test('disabling LAN mode restores ICE servers and URL previews', async () => {
    // Confirm LAN mode is still on
    const iceBefore = await emitAndWait(owner.socket, 'voice:ice-config', { serverId });
    expect(iceBefore.iceServers).toHaveLength(0);

    // Disable LAN mode
    const updatePromise = waitForEvent(owner.socket, 'server:updated', 5000);
    owner.socket.emit('server:update', { serverId, lanMode: false });
    const data = await updatePromise;
    expect(data.server.lanMode).toBe(false);

    // ICE servers should be back
    const iceAfter = await emitAndWait(owner.socket, 'voice:ice-config', { serverId });
    expect(iceAfter.iceServers.length).toBeGreaterThan(0);
    expect(iceAfter.iceServers[0].urls).toMatch(/^stun:/);

    // URL previews should no longer be blocked
    const { status } = await api.get(
      `/api/og?url=https://example.com&serverId=${serverId}`,
      owner.token
    );
    expect(status).not.toBe(403);
  });

  // ─── WebRTC Signaling ────────────────────────────────────────────────────

  test('authenticated users can relay WebRTC offer/answer', async () => {
    const offerPromise = waitForEvent(member.socket, 'webrtc:offer', 5000);
    owner.socket.emit('webrtc:offer', {
      targetId: member.socket.id,
      offer: { type: 'offer', sdp: 'test-sdp-offer' },
    });
    const offerData = await offerPromise;

    expect(offerData.from).toBe(owner.socket.id);
    expect(offerData.offer.sdp).toBe('test-sdp-offer');

    const answerPromise = waitForEvent(owner.socket, 'webrtc:answer', 5000);
    member.socket.emit('webrtc:answer', {
      targetId: owner.socket.id,
      answer: { type: 'answer', sdp: 'test-sdp-answer' },
    });
    const answerData = await answerPromise;

    expect(answerData.from).toBe(member.socket.id);
    expect(answerData.answer.sdp).toBe('test-sdp-answer');
  });

  test('authenticated users can relay ICE candidates', async () => {
    const icePromise = waitForEvent(member.socket, 'webrtc:ice', 5000);
    owner.socket.emit('webrtc:ice', {
      targetId: member.socket.id,
      candidate: { candidate: 'test-candidate', sdpMid: '0' },
    });
    const data = await icePromise;

    expect(data.from).toBe(owner.socket.id);
    expect(data.candidate.candidate).toBe('test-candidate');
  });
});
