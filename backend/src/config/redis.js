'use strict';

const Redis = require('ioredis');
const env = require('./env');
const logger = require('./logger');

function baseRedisOptions() {
  return {
    host: env.redis.host,
    port: env.redis.port,
    password: env.redis.password,
    db: env.redis.db,
    tls: env.redis.tls ? {} : undefined,
    lazyConnect: true,
    retryStrategy: (attempt) => Math.min(attempt * 500, 5000),
  };
}

const redisClient = new Redis(baseRedisOptions());

redisClient.on('error', (err) => {
  logger.error('Redis client error', { error: err.message });
});
redisClient.on('reconnecting', () => logger.warn('Redis client reconnecting'));
redisClient.on('ready', () => logger.info('Redis client ready', { host: env.redis.host }));

// Connects the shared cache client. Does not throw on failure — Redis is a
// dependency the app degrades without (readiness reports it separately),
// not one that should prevent the HTTP server from binding at all.
async function connectRedis() {
  try {
    await redisClient.connect();
  } catch (err) {
    logger.error('Redis initial connection failed', { error: err.message });
  }
}

module.exports = { redisClient, connectRedis, baseRedisOptions };
