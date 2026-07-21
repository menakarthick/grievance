'use strict';

const { Sequelize } = require('sequelize');
const env = require('./env');
const logger = require('./logger');

const sequelize = new Sequelize(env.db.name, env.db.user, env.db.password, {
  host: env.db.host,
  port: env.db.port,
  dialect: env.db.dialect,
  logging: env.db.logging ? (sql) => logger.debug(sql) : false,
  pool: {
    max: env.db.poolMax,
    min: env.db.poolMin,
    acquire: env.db.poolAcquireMs,
    idle: env.db.poolIdleMs,
  },
  define: {
    underscored: true,
    freezeTableName: false,
  },
});

async function connectDatabase() {
  await sequelize.authenticate();
  logger.info('MySQL connection established', { host: env.db.host, database: env.db.name });
}

module.exports = { sequelize, connectDatabase };
