'use strict';

const IORedis = require('ioredis');
const { baseRedisOptions } = require('../config/redis');

// BullMQ requires its own connection, distinct from the general-purpose
// cache client in src/config/redis.js, with maxRetriesPerRequest disabled
// (BullMQ manages its own retry/blocking semantics for queue commands).
//
// BullMQ's Queue/Worker constructors connect eagerly (unlike a plain
// ioredis client, `lazyConnect` doesn't prevent this) — with no live Redis
// in this development environment, base config.js#baseRedisOptions()'s
// retryStrategy (`Math.min(attempt * 500, 5000)`) never returns null, so it
// would retry forever and hang any process that merely requires this
// module (including `npm run build`'s require-everything sanity check).
// Bounded here the same way a genuinely-down Redis was already made to
// fail fast for the main cache client (commandTimeout, config/redis.js) —
// give up reconnecting after 5 attempts instead of retrying indefinitely.
const bullConnection = new IORedis({
  ...baseRedisOptions(),
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (attempt) => (attempt > 5 ? null : Math.min(attempt * 200, 2000)),
});

bullConnection.on('error', () => {}); // avoid an unhandled 'error' event crashing the process when Redis is down

module.exports = { bullConnection };
