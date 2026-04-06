# Platform Administration

The Platform Admin is a special role for managing the entire Nexus instance.

## Designating a Platform Admin

Set the `PLATFORM_ADMIN` environment variable to the username of the platform administrator:

```bash
PLATFORM_ADMIN=admin_username
```

This user gains access to the **Platform Admin** tab in Settings, which is hidden for all other users.

## Capabilities

The Platform Admin can:
- View and manage all users across the platform
- View and manage all servers
- Access platform-wide metrics
- Perform administrative actions that go beyond any single server

## Accessing the Admin Panel

1. Log in as the designated platform admin user
2. Open **Settings** (gear icon)
3. Navigate to the **Platform Admin** tab

## Related

- [User Management](user-management.md) — Managing platform users
- [Server Management](server-management.md) — Managing all servers
- [Metrics](metrics.md) — Monitoring
