'use strict';

const crypto = require('crypto');
const { redisClient } = require('../config/redis');
const env = require('../config/env');
const logger = require('../config/logger');
const redisKeys = require('../utils/redisKeys');
const { generateOtp, generateSalt, hashOtp, verifyOtpHash } = require('../utils/otp');

// Stand-in for the not-yet-built Notification Service (explicitly out of
// scope for this module). A real SMS/WhatsApp dispatch is a drop-in
// replacement for this single function — nothing else in OTPService knows
// or cares how the OTP is delivered. Never logs at a level visible in
// production, and never returns the OTP value to an HTTP response.
function deliverOtp(destination, otp) {
  if (!env.isProduction) {
    logger.debug('OTP dispatched (dev-mode stub — no SMS/notification provider wired up yet)', {
      destination,
      otp,
    });
  }
}

async function storeOtp(redisKey, ttlSeconds, extra = {}) {
  const otp = generateOtp();
  const salt = generateSalt();
  const requestId = crypto.randomUUID();
  const record = { otpHash: hashOtp(otp, salt), salt, requestId, attempts: 0, ...extra };
  await redisClient.set(redisKey, JSON.stringify(record), 'EX', ttlSeconds);
  return { otp, requestId };
}

async function consumeOtp(redisKey, { requestId, otp, maxAttempts }) {
  const raw = await redisClient.get(redisKey);
  if (!raw) return { ok: false, reason: 'EXPIRED' };

  const record = JSON.parse(raw);
  if (requestId !== undefined && record.requestId !== requestId) {
    return { ok: false, reason: 'INVALID' };
  }
  if (record.attempts >= maxAttempts) {
    await redisClient.del(redisKey);
    return { ok: false, reason: 'ATTEMPTS_EXCEEDED' };
  }

  const matches = verifyOtpHash(otp, record.salt, record.otpHash);
  if (!matches) {
    record.attempts += 1;
    const ttl = await redisClient.ttl(redisKey);
    await redisClient.set(redisKey, JSON.stringify(record), 'EX', ttl > 0 ? ttl : env.otp.ttlSeconds);
    return { ok: false, reason: 'INVALID' };
  }

  await redisClient.del(redisKey); // single-use
  return { ok: true };
}

// --- Citizen OTP (keyed by mobile number, docs/authentication.yaml) ---

// Returns `otp` too (never sent to an HTTP response — AuthService strips it
// before shaping the controller's payload). Keeping it here, rather than
// only in the delivery-stub log, lets tests exercise the real HTTP verify
// endpoint without needing a fake SMS provider to intercept.
async function requestCitizenOtp(mobileNumber) {
  const { otp, requestId } = await storeOtp(redisKeys.otpCitizen(mobileNumber), env.otp.ttlSeconds);
  deliverOtp(mobileNumber, otp);
  return {
    otp,
    requestId,
    otpExpirySeconds: env.otp.ttlSeconds,
    resendAllowedAfterSeconds: env.otp.resendCooldownSeconds,
  };
}

function verifyCitizenOtp(mobileNumber, requestId, otp) {
  return consumeOtp(redisKeys.otpCitizen(mobileNumber), { requestId, otp, maxAttempts: env.otp.maxVerifyAttempts });
}

// --- Officer OTP (second factor after password, keyed by a server-issued challenge id) ---

async function issueOfficerOtpChallenge(userId, mobileNumber) {
  const otpChallengeId = crypto.randomUUID();
  // The challenge record carries userId directly so verification doesn't
  // need a second Redis round-trip to resolve who the challenge is for.
  const { otp } = await storeOtp(redisKeys.otpOfficer(otpChallengeId), env.otp.ttlSeconds, { userId });

  deliverOtp(mobileNumber, otp);
  return { otp, otpChallengeId, otpExpirySeconds: env.otp.ttlSeconds };
}

async function verifyOfficerOtp(otpChallengeId, otp) {
  const raw = await redisClient.get(redisKeys.otpOfficer(otpChallengeId));
  if (!raw) return { ok: false, reason: 'EXPIRED' };
  const { userId } = JSON.parse(raw);

  const result = await consumeOtp(redisKeys.otpOfficer(otpChallengeId), {
    otp,
    maxAttempts: env.otp.maxVerifyAttempts,
  });
  if (!result.ok) return result;
  return { ok: true, userId };
}

module.exports = {
  requestCitizenOtp,
  verifyCitizenOtp,
  issueOfficerOtpChallenge,
  verifyOfficerOtp,
};
