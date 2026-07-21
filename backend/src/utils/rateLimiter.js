'use strict';

// Redis fixed-window counter (ARCHITECTURE.md §16 "Rate Limiting | Token-
// bucket/sliding-window counters per IP/user/tenant"). A fixed window is a
// deliberate simplification of the sliding-window ideal — acceptable here
// because the platform's throttle needs (13-HTTP-Status-Codes.md §13.7: 3
// OTP requests / 10 minutes, generic per-IP login throttling) tolerate a
// window-boundary burst of at most 2x the configured limit, which is not a
// meaningful weakening of the control for this platform's risk profile.
//
// Returns { allowed, remaining, retryAfterSeconds }.
async function consumeRateLimit(redisClient, key, { max, windowSeconds }) {
  const count = await redisClient.incr(key);
  if (count === 1) {
    await redisClient.expire(key, windowSeconds);
  }
  if (count > max) {
    const ttl = await redisClient.ttl(key);
    return { allowed: false, remaining: 0, retryAfterSeconds: ttl > 0 ? ttl : windowSeconds };
  }
  return { allowed: true, remaining: max - count, retryAfterSeconds: 0 };
}

module.exports = { consumeRateLimit };
