'use strict';

const crypto = require('crypto');
const env = require('../config/env');

// Short-lived, signed, non-guessable download/preview tokens (SRS §8.2:
// "signed short-lived URL access... never a direct, guessable static
// path"). HMAC-SHA256 over `${fileAssetId}.${expiresAtEpochMs}`, base64url
// encoded — no session/DB state to persist or clean up, matching the same
// "operational, verify-on-read" pattern already used for JWTs.
function sign(fileAssetId, ttlSeconds = env.file.downloadUrlTtlSeconds) {
  const expiresAt = Date.now() + ttlSeconds * 1000;
  const payload = `${fileAssetId}.${expiresAt}`;
  const signature = crypto.createHmac('sha256', env.file.downloadSecret).update(payload).digest('base64url');
  const token = Buffer.from(`${payload}.${signature}`).toString('base64url');
  return { token, expiresAt: new Date(expiresAt) };
}

// Returns { fileAssetId } on success, or null if the token is malformed,
// tampered with, or expired.
function verify(token) {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const [fileAssetId, expiresAtStr, signature] = decoded.split('.');
    if (!fileAssetId || !expiresAtStr || !signature) return null;
    const expected = crypto
      .createHmac('sha256', env.file.downloadSecret)
      .update(`${fileAssetId}.${expiresAtStr}`)
      .digest('base64url');
    const signatureBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expected);
    if (signatureBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(signatureBuf, expectedBuf)) return null;
    if (Number(expiresAtStr) < Date.now()) return null;
    return { fileAssetId };
  } catch {
    return null;
  }
}

module.exports = { sign, verify };
