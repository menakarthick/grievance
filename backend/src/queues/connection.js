'use strict';

const IORedis = require('ioredis');
const { baseRedisOptions } = require('../config/redis');

// BullMQ requires its own connection, distinct from the general-purpose
// cache client in src/config/redis.js, with maxRetriesPerRequest disabled
// (BullMQ manages its own retry/blocking semantics for queue commands).
const bullConnection = new IORedis({
  ...baseRedisOptions(),
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

module.exports = { bullConnection };
