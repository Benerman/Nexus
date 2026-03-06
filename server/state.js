const DEFAULT_SERVER_ID = 'nexus-main';

const state = {
  accounts: {},    // username.toLowerCase() -> account object
  tokens: {},      // token -> accountId
  users: {},       // socketId -> user (online)
  servers: {},
  messages: {},
  voiceChannels: {},
  criticizeJobs: new Map(),  // "userId:target" -> { intervalId, channelId, target, userId }
};

// O(1) user-to-socket index
const userIdToSocketId = new Map();

// O(1) channel-to-server index (channelId → serverId)
const channelToServer = new Map();

function addUser(socketId, user) {
  state.users[socketId] = user;
  userIdToSocketId.set(user.id, socketId);
}

function removeUser(socketId) {
  const user = state.users[socketId];
  if (user) {
    // Only remove from index if this socket is still the mapped one
    // (handles case where user reconnected on a new socket before old one disconnected)
    if (userIdToSocketId.get(user.id) === socketId) {
      userIdToSocketId.delete(user.id);
    }
  }
  delete state.users[socketId];
}

function getSocketIdForUser(userId) {
  return userIdToSocketId.get(userId) || null;
}

function isUserOnline(userId) {
  return userIdToSocketId.has(userId);
}

// Index all channels in a server
function indexServerChannels(serverId, srv) {
  for (const ch of [...(srv.channels?.text || []), ...(srv.channels?.voice || [])]) {
    channelToServer.set(ch.id, serverId);
  }
}

// Remove all channel index entries for a server
function unindexServerChannels(serverId) {
  for (const [chId, srvId] of channelToServer) {
    if (srvId === serverId) channelToServer.delete(chId);
  }
}

module.exports = {
  DEFAULT_SERVER_ID,
  state,
  userIdToSocketId,
  channelToServer,
  addUser,
  removeUser,
  getSocketIdForUser,
  isUserOnline,
  indexServerChannels,
  unindexServerChannels,
};
