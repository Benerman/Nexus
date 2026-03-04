/**
 * E2E Encryption utilities for Nexus DMs
 * Uses libsodium crypto_box (X25519 + XSalsa20-Poly1305) for message encryption
 * and Argon2id + secretbox for private key protection.
 */

let sodium = null;

/**
 * Initialize libsodium WASM module. Must be called before any other function.
 */
export async function initSodium() {
  if (sodium) return sodium;
  const _sodium = await import('libsodium-wrappers-sumo');
  await _sodium.ready;
  sodium = _sodium;
  return sodium;
}

/**
 * Generate an X25519 keypair for crypto_box.
 * @returns {{ publicKey: string, secretKey: string }} Base64-encoded keys
 */
export function generateKeypair() {
  if (!sodium) throw new Error('Sodium not initialized');
  const kp = sodium.crypto_box_keypair();
  return {
    publicKey: sodium.to_base64(kp.publicKey, sodium.base64_variants.ORIGINAL),
    secretKey: sodium.to_base64(kp.privateKey, sodium.base64_variants.ORIGINAL),
  };
}

/**
 * Derive public key from secret key.
 * @param {string} secretKeyB64 - Base64-encoded secret key
 * @returns {string} Base64-encoded public key
 */
export function publicKeyFromSecret(secretKeyB64) {
  if (!sodium) throw new Error('Sodium not initialized');
  const sk = sodium.from_base64(secretKeyB64, sodium.base64_variants.ORIGINAL);
  const pk = sodium.crypto_scalarmult_base(sk);
  return sodium.to_base64(pk, sodium.base64_variants.ORIGINAL);
}

/**
 * Encrypt the private key with a password using Argon2id KDF + secretbox.
 * @param {string} secretKeyB64 - Base64-encoded secret key
 * @param {string} password - User's password
 * @returns {string} Base64-encoded encrypted blob (salt + nonce + ciphertext)
 */
export function encryptPrivateKey(secretKeyB64, password) {
  if (!sodium) throw new Error('Sodium not initialized');
  const sk = sodium.from_base64(secretKeyB64, sodium.base64_variants.ORIGINAL);

  // Derive symmetric key from password using Argon2id
  const salt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);
  const key = sodium.crypto_pwhash(
    sodium.crypto_secretbox_KEYBYTES,
    password,
    salt,
    sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_ALG_ARGON2ID13
  );

  // Encrypt the secret key with secretbox
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const ciphertext = sodium.crypto_secretbox_easy(sk, nonce, key);

  // Combine salt + nonce + ciphertext into single blob
  const blob = new Uint8Array(salt.length + nonce.length + ciphertext.length);
  blob.set(salt, 0);
  blob.set(nonce, salt.length);
  blob.set(ciphertext, salt.length + nonce.length);

  return sodium.to_base64(blob, sodium.base64_variants.ORIGINAL);
}

/**
 * Decrypt the private key from an encrypted blob using the password.
 * @param {string} blobB64 - Base64-encoded encrypted blob
 * @param {string} password - User's password
 * @returns {string|null} Base64-encoded secret key, or null if decryption fails
 */
export function decryptPrivateKey(blobB64, password) {
  if (!sodium) throw new Error('Sodium not initialized');
  try {
    const blob = sodium.from_base64(blobB64, sodium.base64_variants.ORIGINAL);

    const saltLen = sodium.crypto_pwhash_SALTBYTES;
    const nonceLen = sodium.crypto_secretbox_NONCEBYTES;

    const salt = blob.slice(0, saltLen);
    const nonce = blob.slice(saltLen, saltLen + nonceLen);
    const ciphertext = blob.slice(saltLen + nonceLen);

    // Derive the same symmetric key
    const key = sodium.crypto_pwhash(
      sodium.crypto_secretbox_KEYBYTES,
      password,
      salt,
      sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
      sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
      sodium.crypto_pwhash_ALG_ARGON2ID13
    );

    const sk = sodium.crypto_secretbox_open_easy(ciphertext, nonce, key);
    return sodium.to_base64(sk, sodium.base64_variants.ORIGINAL);
  } catch {
    return null;
  }
}

/**
 * Encrypt a message for a recipient using crypto_box.
 * @param {string} plaintext - Message content
 * @param {string} recipientPKB64 - Recipient's base64 public key
 * @param {string} senderSKB64 - Sender's base64 secret key
 * @returns {string} "base64(nonce).base64(ciphertext)" format
 */
export function encryptMessage(plaintext, recipientPKB64, senderSKB64) {
  if (!sodium) throw new Error('Sodium not initialized');
  const recipientPK = sodium.from_base64(recipientPKB64, sodium.base64_variants.ORIGINAL);
  const senderSK = sodium.from_base64(senderSKB64, sodium.base64_variants.ORIGINAL);
  const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
  const message = sodium.from_string(plaintext);
  const ciphertext = sodium.crypto_box_easy(message, nonce, recipientPK, senderSK);

  const nonceB64 = sodium.to_base64(nonce, sodium.base64_variants.ORIGINAL);
  const ciphertextB64 = sodium.to_base64(ciphertext, sodium.base64_variants.ORIGINAL);
  return `${nonceB64}.${ciphertextB64}`;
}

/**
 * Decrypt a message from a sender using crypto_box.
 * @param {string} encryptedStr - "base64(nonce).base64(ciphertext)" format
 * @param {string} senderPKB64 - Sender's base64 public key
 * @param {string} recipientSKB64 - Recipient's base64 secret key
 * @returns {string|null} Decrypted plaintext, or null if decryption fails
 */
export function decryptMessage(encryptedStr, senderPKB64, recipientSKB64) {
  if (!sodium) throw new Error('Sodium not initialized');
  try {
    const [nonceB64, ciphertextB64] = encryptedStr.split('.');
    if (!nonceB64 || !ciphertextB64) return null;

    const nonce = sodium.from_base64(nonceB64, sodium.base64_variants.ORIGINAL);
    const ciphertext = sodium.from_base64(ciphertextB64, sodium.base64_variants.ORIGINAL);
    const senderPK = sodium.from_base64(senderPKB64, sodium.base64_variants.ORIGINAL);
    const recipientSK = sodium.from_base64(recipientSKB64, sodium.base64_variants.ORIGINAL);

    const decrypted = sodium.crypto_box_open_easy(ciphertext, nonce, senderPK, recipientSK);
    return sodium.to_string(decrypted);
  } catch {
    return null;
  }
}

/**
 * Get a human-readable fingerprint of a public key for verification.
 * @param {string} publicKeyB64 - Base64-encoded public key
 * @returns {string} Hex fingerprint grouped in pairs (e.g., "AB CD EF 12 ...")
 */
export function getFingerprint(publicKeyB64) {
  if (!sodium) throw new Error('Sodium not initialized');
  const pk = sodium.from_base64(publicKeyB64, sodium.base64_variants.ORIGINAL);
  const hash = sodium.crypto_generichash(16, pk);
  return sodium.to_hex(hash).toUpperCase().match(/.{2}/g).join(' ');
}

/**
 * Export the private key for backup/recovery (re-encrypts with a user-chosen passphrase).
 * @param {string} secretKeyB64 - Base64-encoded secret key
 * @param {string} passphrase - Export passphrase
 * @returns {string} Base64-encoded encrypted export blob
 */
export function exportPrivateKey(secretKeyB64, passphrase) {
  return encryptPrivateKey(secretKeyB64, passphrase);
}

/**
 * Import a previously exported private key.
 * @param {string} exportBlobB64 - Base64-encoded export blob
 * @param {string} passphrase - The passphrase used during export
 * @returns {string|null} Base64-encoded secret key, or null if wrong passphrase
 */
export function importPrivateKey(exportBlobB64, passphrase) {
  return decryptPrivateKey(exportBlobB64, passphrase);
}
