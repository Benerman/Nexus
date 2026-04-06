# Accounts & Profiles

## Registration

Create an account at the Nexus login screen by clicking **Register**.

**Requirements:**
- **Username:** 3–32 characters, alphanumeric plus underscore and hyphen (`a-z`, `0-9`, `_`, `-`)
- **Password:** 8–128 characters, printable ASCII

Passwords are hashed with bcrypt (12 rounds) and never stored in plaintext.

## Login

Enter your username and password. Nexus issues a JWT access token (7-day expiry) and a refresh token (30-day expiry). Tokens are stored in your browser and automatically refreshed.

## Profile Customization

Open **Settings** (gear icon) to customize your profile:

### Avatar

Choose from built-in emoji avatars or upload a custom image:

Built-in options: 🐺 🦊 🐱 🐸 🦁 🐙 🦄 🐧 🦅 🐉 🦋 🐻

Custom avatars are uploaded as images via **Settings → Profile → Upload Avatar**.

### Display Color

Pick a color for your username display. Available preset colors:

`#3B82F6` `#57F287` `#FEE75C` `#EB459E` `#ED4245` `#60A5FA` `#3ba55c` `#faa61a`

### Bio

Add a short bio (up to 128 characters) visible on your profile card.

## Status

Set your online status:

| Status | Description |
|--------|-------------|
| **Online** | Active and available (default) |
| **Idle** | Away from keyboard |
| **Do Not Disturb** | Suppresses notifications |
| **Invisible** | Appear offline to others |

## Password Change

Change your password from **Settings → Profile → Change Password**. You must enter your current password to confirm.

## Account Deletion

Delete your account from **Settings → Profile → Delete Account** or visit the `/delete-account` page. This permanently removes your account and all associated data.

## Guest Mode

If the server has `ENABLE_GUEST_MODE=true`, users can browse without registering. Guest accounts have limited capabilities.

## Related

- [Friends & Social](friends-and-social.md) — Friend requests, blocking
- [Themes](../customization/themes.md) — Customize the UI appearance
- [Authentication](../security/authentication.md) — Token lifecycle details
