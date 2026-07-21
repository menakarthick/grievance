'use strict';

const app = require('./src/app');
const env = require('./src/config/env');
const logger = require('./src/config/logger');
const { sequelize, connectDatabase } = require('./src/config/database');
const { redisClient, connectRedis } = require('./src/config/redis');

let httpServer;

async function start() {
  // Dependency connections are attempted, and their outcome logged, but a
  // failure here does not stop the HTTP server from binding — GET /health
  // (liveness) must stay reliable for the process supervisor even when a
  // downstream dependency is briefly unavailable; GET /health/ready
  // reports actual dependency state for traffic-admission decisions.
  await Promise.all([
    connectDatabase().catch((err) => logger.error('MySQL connection failed at startup', { error: err.message })),
    connectRedis(),
  ]);

  httpServer = app.listen(env.port, () => {
    logger.info(`${env.appName} listening on port ${env.port}`, {
      nodeEnv: env.nodeEnv,
      apiPrefix: env.apiPrefix,
    });
  });
}

async function shutdown(signal) {
  logger.info(`${signal} received, shutting down gracefully`);
  const timeout = setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 10000);

  try {
    if (httpServer) await new Promise((resolve, reject) => httpServer.close((err) => (err ? reject(err) : resolve())));
    await sequelize.close();
    redisClient.disconnect();
    clearTimeout(timeout);
    logger.info('Shutdown complete');
    process.exit(0);
  } catch (err) {
    clearTimeout(timeout);
    logger.error('Error during shutdown', { error: err.message });
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason: reason instanceof Error ? reason.stack : reason });
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

start().catch((err) => {
  logger.error('Fatal error during startup', { error: err.message, stack: err.stack });
  process.exit(1);
});
