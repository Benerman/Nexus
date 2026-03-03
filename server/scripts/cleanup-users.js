const db = require('../db');
const config = require('../config');

async function main() {
  const adminUsername = config.admin.platformAdminUsername;
  if (!adminUsername) {
    console.error('PLATFORM_ADMIN env var is not set. Aborting to prevent deleting all accounts.');
    process.exit(1);
  }

  console.log(`Platform admin: ${adminUsername}`);

  const accounts = await db.getAllAccounts();
  const adminAccount = accounts.find(a => a.username.toLowerCase() === adminUsername.toLowerCase());

  if (!adminAccount) {
    console.error(`Admin account "${adminUsername}" not found in database. Aborting.`);
    process.exit(1);
  }

  // Delete non-admin accounts
  const toDelete = accounts.filter(a => a.id !== adminAccount.id);
  if (toDelete.length > 0) {
    console.log(`Deleting ${toDelete.length} account(s)...`);
    for (const account of toDelete) {
      await db.deleteAccount(account.id);
      console.log(`  Deleted user: ${account.username}`);
    }
  }

  // Delete servers not owned by admin (cascades channels, messages, roles, etc.)
  const servers = await db.getAllServers();
  const orphanedServers = servers.filter(s => s.owner_id !== adminAccount.id);
  if (orphanedServers.length > 0) {
    console.log(`Deleting ${orphanedServers.length} orphaned server(s)...`);
    for (const server of orphanedServers) {
      await db.deleteServer(server.id);
      console.log(`  Deleted server: ${server.name}`);
    }
  }

  // Delete null-author messages (left behind by ON DELETE SET NULL)
  const nullMsgs = await db.query('DELETE FROM messages WHERE author_id IS NULL');
  if (nullMsgs.rowCount > 0) {
    console.log(`Deleted ${nullMsgs.rowCount} orphaned message(s).`);
  }

  // Clean up empty DM channels (no remaining participants)
  const emptyDMs = await db.query(
    'DELETE FROM dm_channels WHERE id NOT IN (SELECT DISTINCT channel_id FROM dm_participants)'
  );
  if (emptyDMs.rowCount > 0) {
    console.log(`Deleted ${emptyDMs.rowCount} empty DM channel(s).`);
  }

  console.log('Done.', [
    toDelete.length > 0 ? `${toDelete.length} accounts` : null,
    orphanedServers.length > 0 ? `${orphanedServers.length} servers` : null,
  ].filter(Boolean).join(', ') + ` cleaned up. Kept admin "${adminAccount.username}".`);

  process.exit(0);
}

main().catch(err => {
  console.error('Cleanup failed:', err.message);
  process.exit(1);
});
