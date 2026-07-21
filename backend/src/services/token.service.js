'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const logger = require('../config/logger');
const { ApiError } = require('../utils/apiError');
const tokenRepository = require('../repositories/token.repository');

// RS256 signing key — the counterpart to the public key middleware/auth.js
// verifies with (docs/components/securitySchemes.yaml). Loaded once at
// startup; a missing key degrades token issuance loudly rather than
// crashing the whole process, matching auth.js's existing pattern.
let privateKey = null;
try {
  privateKey = fs.readFileSync(path.join(__dirname, '..', '..', env.jwt.privateKeyPath), 'utf8');
} catch (err) {
  logger.warn('JWT private key not found — token issuance will fail until it is generated', {
    path: env.jwt.privateKeyPath,
    error: err.message,
  });
}

function signAccessToken({ userId, userType, tenantId, roles, scope }) {
  if (!privateKey) {
    throw ApiError.internal('JWT private key is not configured on this server.');
  }
  const jti = crypto.randomUUID();
  const token = jwt.sign(
    {
      userId: String(userId),
      userType,
      tenantId: tenantId === null || tenantId === undefined ? null : String(tenantId),
      roles,
      scope: scope || null,
    },
    privateKey,
    {
      algorithm: 'RS256',
      expiresIn: env.jwt.accessTokenTtlSeconds,
      issuer: env.jwt.issuer,
      audience: env.jwt.audience,
      jwtid: jti,
      subject: String(userId),
    },
  );
  return { token, jti, expiresIn: env.jwt.accessTokenTtlSeconds };
}

// Issues a brand-new access/refresh pair, starting a new refresh-token
// family (docs/14-API-Security.md §14.4 reuse-detection unit).
async function issueTokenPair({ userId, userType, tenantId, roles, scope }) {
  const { token: accessToken, expiresIn } = signAccessToken({ userId, userType, tenantId, roles, scope });

  const familyId = crypto.randomUUID();
  const tokenId = crypto.randomUUID();
  const record = {
    userId: String(userId),
    userType,
    tenantId,
    roles,
    scope: scope || null,
    familyId,
    status: 'active',
  };

  await tokenRepository.saveRefreshToken(tokenId, record, env.jwt.refreshTokenTtlSeconds);
  await tokenRepository.addFamilyMember(familyId, tokenId, env.jwt.refreshTokenTtlSeconds);
  await tokenRepository.linkUserFamily(userId, familyId, env.jwt.refreshTokenTtlSeconds);

  return { accessToken, refreshToken: tokenId, expiresIn };
}

// Single-use rotation with reuse-family revocation (docs/14-API-Security.md
// §14.4): presenting an already-rotated token revokes every token that ever
// descended from the same login.
async function rotateRefreshToken(oldTokenId) {
  const record = await tokenRepository.getRefreshToken(oldTokenId);
  if (!record) {
    throw ApiError.unauthorized('REFRESH_TOKEN_INVALID', 'The refresh token is invalid or has expired.');
  }

  if (record.status === 'rotated') {
    await tokenRepository.deleteFamily(record.familyId);
    throw ApiError.unauthorized(
      'REFRESH_TOKEN_REUSED_FAMILY_REVOKED',
      'This refresh token was already used. All sessions from this login have been revoked.',
    );
  }

  const { token: accessToken, expiresIn } = signAccessToken(record);

  const newTokenId = crypto.randomUUID();
  await tokenRepository.saveRefreshToken(newTokenId, { ...record, status: 'active' }, env.jwt.refreshTokenTtlSeconds);
  await tokenRepository.addFamilyMember(record.familyId, newTokenId, env.jwt.refreshTokenTtlSeconds);
  // Keep the consumed token around (marked rotated) for the remainder of
  // its own TTL purely so a later replay of it is detectable as reuse.
  await tokenRepository.saveRefreshToken(
    oldTokenId,
    { ...record, status: 'rotated', rotatedTo: newTokenId },
    env.jwt.refreshTokenTtlSeconds,
  );

  return { accessToken, refreshToken: newTokenId, expiresIn };
}

async function revokeRefreshToken(tokenId) {
  await tokenRepository.deleteRefreshToken(tokenId);
}

async function revokeAllUserSessions(userId) {
  const families = await tokenRepository.getUserFamilies(userId);
  await Promise.all(families.map((familyId) => tokenRepository.deleteFamily(familyId)));
  await tokenRepository.deleteUserFamiliesIndex(userId);
}

async function denylistAccessTokenFromClaims({ jti, exp }) {
  if (!jti) return;
  const remainingSeconds = exp ? exp - Math.floor(Date.now() / 1000) : env.jwt.accessTokenTtlSeconds;
  await tokenRepository.denylistAccessToken(jti, Math.max(remainingSeconds, 1));
}

async function isAccessTokenDenylisted(jti) {
  if (!jti) return false;
  return tokenRepository.isAccessTokenDenylisted(jti);
}

module.exports = {
  signAccessToken,
  issueTokenPair,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserSessions,
  denylistAccessTokenFromClaims,
  isAccessTokenDenylisted,
};
