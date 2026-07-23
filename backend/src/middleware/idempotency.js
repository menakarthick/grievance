'use strict';

const { redisClient } = require('../config/redis');
const logger = require('../config/logger');

// API_SPECIFICATION.md §1.5: every POST that creates a citizen-visible
// resource with real-world consequence accepts an optional Idempotency-Key
// header (client-generated UUID); the server persists a short-lived
// key->response mapping in Redis and replays the original response for a
// repeated key instead of creating a duplicate — the documented mechanism
// behind this module's "duplicate complaint detection" business rule.
// TTL: 24 hours (API_SPECIFICATION.md §1.5).
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

function redisKey(userId, idempotencyKey) {
  return `idempotency:${userId}:${idempotencyKey}`;
}

// Wraps a route so a repeated Idempotency-Key (scoped per-user, so one
// citizen's key can never collide with another's) short-circuits straight
// to the cached response instead of re-running the handler. Absence of the
// header is a no-op — the header is optional per the spec.
function idempotent() {
  return async function idempotencyMiddleware(req, res, next) {
    const key = req.get('Idempotency-Key');
    if (!key || !req.user) return next();

    const cacheKey = redisKey(req.user.id, key);
    try {
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        const { statusCode, body } = JSON.parse(cached);
        return res.status(statusCode).json(body);
      }
    } catch (err) {
      logger.warn('Idempotency cache read failed — proceeding without replay', { error: err.message });
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode < 500) {
        redisClient
          .set(cacheKey, JSON.stringify({ statusCode: res.statusCode, body }), 'EX', IDEMPOTENCY_TTL_SECONDS)
          .catch((err) => logger.warn('Idempotency cache write failed', { error: err.message }));
      }
      return originalJson(body);
    };
    return next();
  };
}

module.exports = { idempotent };
