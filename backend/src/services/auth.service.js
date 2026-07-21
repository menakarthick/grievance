'use strict';

const crypto = require('crypto');
const { authenticator } = require('otplib');
const { ApiError } = require('../utils/apiError');
const { hashPassword, verifyPassword, isPasswordPolicyCompliant } = require('../utils/password');
const env = require('../config/env');
const logger = require('../config/logger');
const userRepository = require('../repositories/user.repository');
const tokenRepository = require('../repositories/token.repository');
const otpService = require('./otp.service');
const tokenService = require('./token.service');
const rbacService = require('./rbac.service');
const { recordAuthEvent } = require('../audit');

const STAFF_USER_TYPES = ['officer', 'department_admin'];
const ADMIN_USER_TYPES = ['corporation_admin', 'super_admin'];

function maskMobileNumber(mobileNumber) {
  if (!mobileNumber || mobileNumber.length < 4) return '******';
  return `${'*'.repeat(mobileNumber.length - 4)}${mobileNumber.slice(-4)}`;
}

// Phase-1 pilot simplification: the citizen OTP endpoints carry no tenant
// identifier (docs/authentication.yaml deliberately keeps mobileNumber as
// the only input) and there is no approved subdomain/header-based tenant
// resolution mechanism yet (Section 3's multi-tenant model doesn't define
// one for anonymous, pre-authentication requests). The pilot itself is
// single-tenant (Tambaram), so this resolves the platform's one active
// tenant. A real multi-tenant rollout needs an explicit tenant-resolution
// design — out of scope for this Authentication module.
async function resolveSingleActiveTenant() {
  const tenants = await userRepository.getSingleActiveTenant();
  if (tenants.length !== 1) {
    throw ApiError.internal(
      'Citizen authentication requires exactly one active tenant in the current Phase-1 pilot configuration.',
    );
  }
  return tenants[0];
}

async function buildStaffTokenPayload(user) {
  const [roleNames, staffProfile] = await Promise.all([
    rbacService.getRoleNamesForUser(user.id),
    userRepository.getStaffProfile(user.id),
  ]);
  const scope = staffProfile ? { scopeType: staffProfile.scopeType, scopeId: staffProfile.scopeId } : null;
  return { roleNames, scope };
}

// --- 1. Citizen OTP Request ---
async function requestCitizenOtp({ mobileNumber, ip }) {
  const { otp: _otp, ...publicResult } = await otpService.requestCitizenOtp(mobileNumber);
  await recordAuthEvent({ eventType: 'CITIZEN_OTP_REQUESTED', ipAddress: ip, success: true });
  return publicResult;
}

// --- 2. Citizen OTP Verify ---
async function verifyCitizenOtp({ requestId, mobileNumber, otp, name, ip }) {
  const result = await otpService.verifyCitizenOtp(mobileNumber, requestId, otp);
  if (!result.ok) {
    await recordAuthEvent({ eventType: 'CITIZEN_OTP_VERIFY_FAILED', ipAddress: ip, success: false });
    throw ApiError.unauthorized('OTP_INVALID_OR_EXPIRED', 'The OTP is invalid or has expired.');
  }

  const tenant = await resolveSingleActiveTenant();
  let user = await userRepository.findByMobileNumber(tenant.id, mobileNumber);
  let isNewRegistration = false;

  if (!user) {
    if (!name || !name.trim()) {
      throw ApiError.validation('Request failed validation', [
        { field: 'name', issue: 'REQUIRED', message: 'name is required for first-time registration.' },
      ]);
    }
    user = await userRepository.createCitizen({ tenantId: tenant.id, mobileNumber, name: name.trim() });
    isNewRegistration = true;
  }

  const { accessToken, refreshToken, expiresIn } = await tokenService.issueTokenPair({
    userId: user.id,
    userType: 'citizen',
    tenantId: user.tenantId,
    roles: ['citizen'],
    scope: null,
  });

  await recordAuthEvent({ userId: user.id, eventType: 'CITIZEN_LOGIN', ipAddress: ip, success: true });

  return {
    accessToken,
    refreshToken,
    expiresIn,
    user: { id: String(user.id), userType: 'citizen', tenantId: String(user.tenantId), isNewRegistration },
  };
}

// Shared password-step logic for Officer/Department Admin and Corporation
// Admin/Super Admin login (docs/authentication.yaml §2.3, §2.5).
async function verifyPasswordStep({ username, password, allowedUserTypes, ip }) {
  const user = await userRepository.findByUsername(username);

  // Anti-enumeration (docs/authentication.yaml §2.9's principle applied
  // here too): an unknown username and a known-username-wrong-password both
  // resolve to the same INVALID_CREDENTIALS outcome.
  if (!user || !allowedUserTypes.includes(user.userType)) {
    await recordAuthEvent({ eventType: 'LOGIN_FAILED', ipAddress: ip, success: false });
    throw ApiError.unauthorized('INVALID_CREDENTIALS', 'Invalid username or password.');
  }

  const lockoutState = await userRepository.getLockoutState(user.id);
  if (lockoutState?.lockedUntil && new Date(lockoutState.lockedUntil) > new Date()) {
    await recordAuthEvent({ userId: user.id, eventType: 'LOGIN_BLOCKED_LOCKED', ipAddress: ip, success: false });
    throw new ApiError({
      statusCode: 423,
      category: 'authentication',
      code: 'ACCOUNT_LOCKED',
      message: 'This account is temporarily locked due to repeated failed login attempts.',
    });
  }

  const passwordValid = await verifyPassword(user.passwordHash, password);
  if (!passwordValid) {
    const failedAttemptCount = (lockoutState?.failedAttemptCount || 0) + 1;
    const locked = failedAttemptCount >= env.security.loginMaxFailedAttempts;
    await userRepository.recordFailedLogin(user.id, {
      failedAttemptCount: locked ? 0 : failedAttemptCount,
      lockedUntil: locked ? new Date(Date.now() + env.security.loginLockoutSeconds * 1000) : null,
    });
    await recordAuthEvent({ userId: user.id, eventType: 'LOGIN_FAILED', ipAddress: ip, success: false });
    if (locked) {
      throw new ApiError({
        statusCode: 423,
        category: 'authentication',
        code: 'ACCOUNT_LOCKED',
        message: 'This account is temporarily locked due to repeated failed login attempts.',
      });
    }
    throw ApiError.unauthorized('INVALID_CREDENTIALS', 'Invalid username or password.');
  }

  await userRepository.resetLockout(user.id);
  await recordAuthEvent({ userId: user.id, eventType: 'PASSWORD_VERIFIED', ipAddress: ip, success: true });
  return user;
}

// --- 3. Officer Login (password step) ---
async function officerLogin({ username, password, ip }) {
  const user = await verifyPasswordStep({ username, password, allowedUserTypes: STAFF_USER_TYPES, ip });
  const { otp: _otp, ...challenge } = await otpService.issueOfficerOtpChallenge(user.id, user.mobileNumber);
  return { ...challenge, otpDeliveredTo: maskMobileNumber(user.mobileNumber) };
}

// --- 4. Officer OTP Verify (login step 2) ---
async function verifyOfficerOtp({ otpChallengeId, otp, ip }) {
  const result = await otpService.verifyOfficerOtp(otpChallengeId, otp);
  if (!result.ok) {
    await recordAuthEvent({ eventType: 'OFFICER_OTP_VERIFY_FAILED', ipAddress: ip, success: false });
    throw ApiError.unauthorized('OTP_INVALID_OR_EXPIRED', 'The OTP is invalid or has expired.');
  }

  const user = await userRepository.findById(result.userId);
  const { roleNames, scope } = await buildStaffTokenPayload(user);
  const { accessToken, refreshToken, expiresIn } = await tokenService.issueTokenPair({
    userId: user.id,
    userType: user.userType,
    tenantId: user.tenantId,
    roles: roleNames,
    scope,
  });

  await recordAuthEvent({ userId: user.id, eventType: 'OFFICER_LOGIN', ipAddress: ip, success: true });

  return {
    accessToken,
    refreshToken,
    expiresIn,
    user: { id: String(user.id), userType: user.userType, roles: roleNames, scope },
  };
}

// --- 5. Admin Login (password step, MFA required) ---
async function adminLogin({ username, password, ip }) {
  const user = await verifyPasswordStep({ username, password, allowedUserTypes: ADMIN_USER_TYPES, ip });

  const mfaDevice = await userRepository.getMfaDevice(user.id);
  if (!mfaDevice || !mfaDevice.verifiedAt) {
    throw new ApiError({
      statusCode: 409,
      category: 'business',
      code: 'MFA_NOT_ENROLLED',
      message: 'This account has not completed MFA enrollment.',
    });
  }

  const mfaChallengeId = crypto.randomUUID();
  await tokenRepository.saveMfaChallenge(mfaChallengeId, { userId: user.id }, env.mfa.challengeTtlSeconds);
  return { mfaChallengeId, mfaMethod: 'totp' };
}

// --- 6. MFA Verify (TOTP — admin login step 2) ---
async function verifyMfa({ mfaChallengeId, totpCode, ip }) {
  const challenge = await tokenRepository.getMfaChallenge(mfaChallengeId);
  if (!challenge) {
    await recordAuthEvent({ eventType: 'MFA_VERIFY_FAILED', ipAddress: ip, success: false });
    throw ApiError.unauthorized('MFA_INVALID_OR_EXPIRED', 'The MFA challenge is invalid or has expired.');
  }

  const mfaDevice = await userRepository.getMfaDevice(challenge.userId);
  const isValid = mfaDevice && authenticator.check(totpCode, mfaDevice.secretReference);
  if (!isValid) {
    await recordAuthEvent({ userId: challenge.userId, eventType: 'MFA_VERIFY_FAILED', ipAddress: ip, success: false });
    throw ApiError.unauthorized('MFA_INVALID_OR_EXPIRED', 'The MFA code is invalid or has expired.');
  }

  await tokenRepository.deleteMfaChallenge(mfaChallengeId);

  const user = await userRepository.findById(challenge.userId);
  const { roleNames, scope } = await buildStaffTokenPayload(user);
  const { accessToken, refreshToken, expiresIn } = await tokenService.issueTokenPair({
    userId: user.id,
    userType: user.userType,
    tenantId: user.tenantId,
    roles: roleNames,
    scope,
  });

  await recordAuthEvent({ userId: user.id, eventType: 'ADMIN_LOGIN', ipAddress: ip, success: true });

  return {
    accessToken,
    refreshToken,
    expiresIn,
    user: { id: String(user.id), userType: user.userType, roles: roleNames, scope },
  };
}

// --- 7. Refresh Token ---
async function refreshToken({ refreshToken: presentedToken, ip }) {
  const result = await tokenService.rotateRefreshToken(presentedToken);
  await recordAuthEvent({ eventType: 'TOKEN_REFRESHED', ipAddress: ip, success: true });
  return result;
}

// --- 8. Logout ---
async function logout({ userId, jti, exp, refreshToken: presentedToken, allDevices, ip }) {
  await tokenService.denylistAccessTokenFromClaims({ jti, exp });
  if (allDevices) {
    await tokenService.revokeAllUserSessions(userId);
  } else if (presentedToken) {
    await tokenService.revokeRefreshToken(presentedToken);
  }
  await recordAuthEvent({
    userId,
    eventType: allDevices ? 'LOGOUT_ALL_DEVICES' : 'LOGOUT',
    ipAddress: ip,
    success: true,
  });
  return { success: true };
}

// --- 9. Forgot Password (always succeeds — anti-enumeration) ---
async function forgotPassword({ username, ip }) {
  const user = await userRepository.findByUsername(username);
  if (user && [...STAFF_USER_TYPES, ...ADMIN_USER_TYPES].includes(user.userType)) {
    const resetToken = crypto.randomBytes(32).toString('hex');
    await tokenRepository.savePasswordResetToken(resetToken, { userId: user.id }, env.security.passwordResetTtlSeconds);
    if (!env.isProduction) {
      logger.debug('Password reset requested (dev-mode stub — no email provider wired up yet)', {
        username,
        resetToken,
      });
    }
    await recordAuthEvent({ userId: user.id, eventType: 'PASSWORD_RESET_REQUESTED', ipAddress: ip, success: true });
  }
  return { success: true };
}

// --- 10. Reset Password ---
async function resetPassword({ resetToken, newPassword, ip }) {
  const record = await tokenRepository.getPasswordResetToken(resetToken);
  if (!record) {
    throw ApiError.unauthorized(
      'RESET_TOKEN_INVALID_OR_EXPIRED',
      'The password reset token is invalid or has expired.',
    );
  }

  if (!isPasswordPolicyCompliant(newPassword)) {
    throw new ApiError({
      statusCode: 400,
      category: 'validation',
      code: 'PASSWORD_POLICY_VIOLATION',
      message: 'Password must be at least 12 characters and include upper/lower/digit/special characters.',
    });
  }

  // "Must not match any of the last 5 password hashes" (SRS §8.1) — the
  // account's current password counts as the most recent entry in that
  // history, so it is checked alongside password_history explicitly rather
  // than relying on a history row existing for it (one won't yet if this is
  // the first change since account creation).
  const user = await userRepository.findById(record.userId);
  const recentHashes = await userRepository.getRecentPasswordHashes(record.userId, env.security.passwordHistoryLimit);
  const hashesToCheck = [user?.passwordHash, ...recentHashes.map((entry) => entry.passwordHash)].filter(Boolean);
  for (const hash of hashesToCheck) {
    if (await verifyPassword(hash, newPassword)) {
      throw new ApiError({
        statusCode: 400,
        category: 'validation',
        code: 'PASSWORD_REUSE_DENIED',
        message: `The new password must not match any of the last ${env.security.passwordHistoryLimit} passwords.`,
      });
    }
  }

  const newHash = await hashPassword(newPassword);
  await userRepository.updatePasswordHash(record.userId, newHash);
  await tokenRepository.deletePasswordResetToken(resetToken);
  await tokenService.revokeAllUserSessions(record.userId);
  await recordAuthEvent({ userId: record.userId, eventType: 'PASSWORD_RESET_COMPLETED', ipAddress: ip, success: true });

  return { success: true };
}

// --- 11. Token Validate / Get Current User ---
async function getCurrentUser(claims) {
  return {
    valid: true,
    userId: claims.userId,
    userType: claims.userType,
    tenantId: claims.tenantId,
    roles: claims.roles || [],
    expiresAt: new Date(claims.exp * 1000).toISOString(),
  };
}

module.exports = {
  requestCitizenOtp,
  verifyCitizenOtp,
  officerLogin,
  verifyOfficerOtp,
  adminLogin,
  verifyMfa,
  refreshToken,
  logout,
  forgotPassword,
  resetPassword,
  getCurrentUser,
  // exported for unit testing / reuse
  maskMobileNumber,
  resolveSingleActiveTenant,
};
