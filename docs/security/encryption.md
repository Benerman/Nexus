# End-to-End Encryption

Nexus supports E2E encryption for 1:1 direct messages.

## How It Works

- **Key exchange:** X25519 (Elliptic-curve Diffie-Hellman)
- **Encryption:** NaCl/libsodium symmetric encryption
- **Key storage:** Public keys are stored in the `accounts` table (`public_key` field)

## Key Management

- Each user generates a key pair on account creation
- Public keys are exchanged when starting a DM
- Private keys are stored locally on the device

## Encrypted Messages

Encrypted messages have `encrypted: true` in the database. The message content is ciphertext that can only be decrypted by the conversation participants.

## Limitations

- Only 1:1 DMs support E2E encryption (not group DMs or server channels)
- Key backup and recovery is the user's responsibility
- Device verification is not currently implemented

## Related

- [Direct Messages](../user-guide/direct-messages.md) — DM features
- [Authentication](authentication.md) — Token security
