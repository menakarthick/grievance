'use strict';

const { redisClient } = require('../config/redis');
const redisKeys = require('../utils/redisKeys');

// Server-side persistence for everything token-shaped that the Authentication
// module needs to revoke/rotate/deny — refresh tokens, the access-token
// denylist, and short-lived MFA challenges. All state lives in Redis
// (ARCHITECTURE.md §16: "Refresh Tokens | Server-side record ... High —
// AOF persistence required"); this repository is the sole place that talks
// to those keys so TokenService/AuthService never format a Redis key by hand.

async function saveRefreshToken(tokenId, record, ttlSeconds) {
  await redisClient.set(redisKeys.refreshToken(tokenId), JSON.stringify(record), 'EX', ttlSeconds);
}

async function getRefreshToken(tokenId) {
  const raw = await redisClient.get(redisKeys.refreshToken(tokenId));
  return raw ? JSON.parse(raw) : null;
}

async function deleteRefreshToken(tokenId) {
  await redisClient.del(redisKeys.refreshToken(tokenId));
}

async function addFamilyMember(familyId, tokenId, ttlSeconds) {
  const key = redisKeys.refreshFamilyIndex(familyId);
  await redisClient.sadd(key, tokenId);
  await redisClient.expire(key, ttlSeconds);
}

async function getFamilyMembers(familyId) {
  return redisClient.smembers(redisKeys.refreshFamilyIndex(familyId));
}

async function deleteFamily(familyId) {
  const members = await getFamilyMembers(familyId);
  if (members.length > 0) {
    await redisClient.del(...members.map((tokenId) => redisKeys.refreshToken(tokenId)));
  }
  await redisClient.del(redisKeys.refreshFamilyIndex(familyId));
}

async function linkUserFamily(userId, familyId, ttlSeconds) {
  const key = redisKeys.userRefreshFamilies(userId);
  await redisClient.sadd(key, familyId);
  await redisClient.expire(key, ttlSeconds);
}

async function getUserFamilies(userId) {
  return redisClient.smembers(redisKeys.userRefreshFamilies(userId));
}

async function deleteUserFamiliesIndex(userId) {
  await redisClient.del(redisKeys.userRefreshFamilies(userId));
}

async function denylistAccessToken(jti, ttlSeconds) {
  if (ttlSeconds <= 0) return;
  await redisClient.set(redisKeys.accessTokenDenylist(jti), '1', 'EX', ttlSeconds);
}

async function isAccessTokenDenylisted(jti) {
  const value = await redisClient.get(redisKeys.accessTokenDenylist(jti));
  return value !== null;
}

async function saveMfaChallenge(mfaChallengeId, record, ttlSeconds) {
  await redisClient.set(redisKeys.mfaChallenge(mfaChallengeId), JSON.stringify(record), 'EX', ttlSeconds);
}

async function getMfaChallenge(mfaChallengeId) {
  const raw = await redisClient.get(redisKeys.mfaChallenge(mfaChallengeId));
  return raw ? JSON.parse(raw) : null;
}

async function deleteMfaChallenge(mfaChallengeId) {
  await redisClient.del(redisKeys.mfaChallenge(mfaChallengeId));
}

async function savePasswordResetToken(token, record, ttlSeconds) {
  await redisClient.set(redisKeys.passwordResetToken(token), JSON.stringify(record), 'EX', ttlSeconds);
}

async function getPasswordResetToken(token) {
  const raw = await redisClient.get(redisKeys.passwordResetToken(token));
  return raw ? JSON.parse(raw) : null;
}

async function deletePasswordResetToken(token) {
  await redisClient.del(redisKeys.passwordResetToken(token));
}

module.exports = {
  saveRefreshToken,
  getRefreshToken,
  deleteRefreshToken,
  addFamilyMember,
  getFamilyMembers,
  deleteFamily,
  linkUserFamily,
  getUserFamilies,
  deleteUserFamiliesIndex,
  denylistAccessToken,
  isAccessTokenDenylisted,
  saveMfaChallenge,
  getMfaChallenge,
  deleteMfaChallenge,
  savePasswordResetToken,
  getPasswordResetToken,
  deletePasswordResetToken,
};
