'use strict';

// Sequelize-CLI facing config (migrations/seeders). Deliberately plain data —
// no Sequelize instance here — because sequelize-cli requires this file to
// export a bare {env: {...}} object per-environment. The app itself builds
// its live Sequelize instance from this same data in ./database.js.

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const base = {
  username: process.env.DB_USER || 'grievance_app',
  password: process.env.DB_PASSWORD || null,
  database: process.env.DB_NAME || 'grievance_platform',
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  dialect: process.env.DB_DIALECT || 'mysql',
  migrationStorageTableName: 'sequelize_meta',
  seederStorageTableName: 'sequelize_data',
};

module.exports = {
  development: { ...base, logging: process.env.DB_LOGGING === 'true' },
  test: { ...base, database: `${base.database}_test`, logging: false },
  production: { ...base, logging: false },
};
