const db = require('../db');
const { state } = require('../state');

module.exports = function(io, socket) {

  socket.on('bookmarks:list', async () => {
    const user = state.users[socket.id];
    if (!user) return;

    try {
      const dbBookmarks = await db.getBookmarks(user.id);
      const bookmarks = dbBookmarks.map(row => ({
        id: row.id,
        messageId: row.message_id,
        channelId: row.channel_id,
        serverId: row.server_id,
        savedAt: new Date(row.saved_at).getTime(),
        content: row.content,
        messageCreatedAt: new Date(row.message_created_at).getTime(),
        attachments: typeof row.attachments === 'string' ? JSON.parse(row.attachments || '[]') : (row.attachments || []),
        author: {
          username: row.author_username || 'Deleted User',
          avatar: row.author_avatar || '👻',
          customAvatar: row.author_custom_avatar,
          color: row.author_color || '#80848E'
        }
      }));
      console.debug(`[Bookmarks] ${user.username} fetched ${bookmarks.length} bookmarks`);
      socket.emit('bookmarks:list', { bookmarks });
    } catch (err) {
      console.error('[Bookmark] Error fetching bookmarks:', err.message);
    }
  });

  socket.on('bookmarks:get-ids', async () => {
    const user = state.users[socket.id];
    if (!user) return;

    try {
      console.debug(`[Bookmarks] ${user.username} fetched bookmark IDs`);
      const ids = await db.getUserBookmarkIds(user.id);
      socket.emit('bookmarks:ids', { ids });
    } catch (err) {
      console.error('[Bookmark] Error fetching bookmark IDs:', err.message);
    }
  });

};
