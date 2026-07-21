'use strict';

process.env.NODE_ENV = 'test';

// No live Redis server in this environment — ioredis-mock is a drop-in,
// in-memory implementation of the same client API, so every module that
// does `require('ioredis')` (config/redis.js, queues/connection.js) gets a
// working, isolated Redis for the lifetime of a single test file.
jest.mock('ioredis', () => require('ioredis-mock'));
