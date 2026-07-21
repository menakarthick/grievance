'use strict';

const { redisClient } = require('../config/redis');
const { consumeRateLimit } = require('../utils/rateLimiter');
const { ApiError } = require('../utils/apiError');

// Wraps utils/rateLimiter.js as Express middleware. `keyFn` derives the
// throttle key from the request (per-mobile, per-IP, per-username, ...) so
// each route picks its own dimension per docs/13-HTTP-Status-Codes.md §13.7.
function rateLimit({ keyFn, max, windowSeconds }) {
  return async function rateLimitMiddleware(req, res, next) {
    try {
      const identifier = keyFn(req);
      if (!identifier) return next();
      const result = await consumeRateLimit(redisClient, identifier, { max, windowSeconds });
      if (!result.allowed) {
        res.set('Retry-After', String(result.retryAfterSeconds));
        return next(
          new ApiError({
            statusCode: 429,
            category: 'business',
            code: 'RATE_LIMITED',
            message: 'Too many requests. Please try again later.',
            details: { retryAfterSeconds: result.retryAfterSeconds },
          }),
        );
      }
      return next();
    } catch (err) {
      // Redis being unavailable must never block an auth flow outright —
      // degrade to "allowed" and let downstream lockout/OTP-attempt checks
      // remain the backstop, consistent with server.js's non-blocking Redis
      // connection policy.
      req.log?.warn('Rate limiter failed open', { error: err.message });
      return next();
    }
  };
}

const ipKey = (prefix) => (req) => `ratelimit:${prefix}:${req.ip}`;

module.exports = { rateLimit, ipKey };
