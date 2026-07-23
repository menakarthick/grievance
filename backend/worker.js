'use strict';

// Entry point for the BullMQ worker PM2 process group (ecosystem.config.js),
// separate from server.js's HTTP process group per that file's own
// comment: "keeping HTTP and worker concerns as separate PM2 apps makes
// scaling/restart/log policy independent for each."
const logger = require('./src/config/logger');
const { sequelize, connectDatabase } = require('./src/config/database');
const { connectRedis } = require('./src/config/redis');
const { startAllWorkers } = require('./src/jobs');

async function start() {
  await Promise.all([
    connectDatabase().catch((err) => logger.error('MySQL connection failed at worker startup', { error: err.message })),
    connectRedis(),
  ]);
  startAllWorkers();
  logger.info('Notification worker process started');
}

async function shutdown(signal) {
  logger.info(`${signal} received, shutting down worker gracefully`);
  try {
    await sequelize.close();
    process.exit(0);
  } catch (err) {
    logger.error('Error during worker shutdown', { error: err.message });
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection in worker', { reason: reason instanceof Error ? reason.stack : reason });
});

start().catch((err) => {
  logger.error('Fatal error during worker startup', { error: err.message, stack: err.stack });
  process.exit(1);
});
