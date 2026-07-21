'use strict';

// Centralized Redis key builders for the Authentication module (ARCHITECTURE.md
// §16's namespace-isolation convention — one shared Redis, keys segmented by
// purpose prefix rather than separate instances). Keeping every key shape in
// one file avoids two services drifting onto slightly different key formats.
const redisKeys = {
  otpCitizen: (mobileNumber) => `otp:citizen:${mobileNumber}`,
  otpOfficer: (otpChallengeId) => `otp:officer:${otpChallengeId}`,
  otpRequestRateLimit: (mobileNumber) => `ratelimit:otp-request:${mobileNumber}`,
  loginRateLimit: (identifier) => `ratelimit:login:${identifier}`,

  mfaChallenge: (mfaChallengeId) => `mfa:challenge:${mfaChallengeId}`,

  refreshToken: (tokenId) => `refresh:${tokenId}`,
  refreshFamilyIndex: (familyId) => `refresh:family:${familyId}`,
  userRefreshFamilies: (userId) => `refresh:user-families:${userId}`,

  accessTokenDenylist: (jti) => `denylist:${jti}`,

  lockoutCount: (userId) => `lockout:count:${userId}`,
  lockoutLocked: (userId) => `lockout:locked:${userId}`,

  passwordResetToken: (resetToken) => `password-reset:${resetToken}`,

  rbacPermissions: (userId) => `rbac:permissions:${userId}`,
};

module.exports = redisKeys;
