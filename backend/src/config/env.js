'use strict';

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

function str(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function num(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function bool(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return value.toLowerCase() === 'true';
}

function list(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const env = {
  nodeEnv: str('NODE_ENV', 'development'),
  appName: str('APP_NAME', 'grievance-platform-backend'),
  port: num('PORT', 3000),
  apiPrefix: str('API_PREFIX', '/api/v1'),
  trustProxy: bool('TRUST_PROXY', false),

  corsAllowedOrigins: list('CORS_ALLOWED_ORIGINS', ['http://localhost:5173']),

  logLevel: str('LOG_LEVEL', 'info'),
  logDir: str('LOG_DIR', 'logs'),

  db: {
    host: str('DB_HOST', '127.0.0.1'),
    port: num('DB_PORT', 3306),
    name: str('DB_NAME', 'grievance_platform'),
    user: str('DB_USER', 'grievance_app'),
    password: str('DB_PASSWORD', ''),
    dialect: str('DB_DIALECT', 'mysql'),
    poolMax: num('DB_POOL_MAX', 10),
    poolMin: num('DB_POOL_MIN', 0),
    poolAcquireMs: num('DB_POOL_ACQUIRE_MS', 30000),
    poolIdleMs: num('DB_POOL_IDLE_MS', 10000),
    logging: bool('DB_LOGGING', false),
  },

  redis: {
    host: str('REDIS_HOST', '127.0.0.1'),
    port: num('REDIS_PORT', 6379),
    password: str('REDIS_PASSWORD', undefined),
    db: num('REDIS_DB', 0),
    tls: bool('REDIS_TLS', false),
  },

  jwt: {
    privateKeyPath: str('JWT_PRIVATE_KEY_PATH', 'src/config/keys/jwt-private.pem'),
    publicKeyPath: str('JWT_PUBLIC_KEY_PATH', 'src/config/keys/jwt-public.pem'),
    issuer: str('JWT_ISSUER', 'grievance-platform'),
    audience: str('JWT_AUDIENCE', 'grievance-platform-clients'),
    accessTokenTtlSeconds: num('JWT_ACCESS_TOKEN_TTL_SECONDS', 900),
  },

  upload: {
    tmpDir: str('UPLOAD_TMP_DIR', 'uploads/tmp'),
    maxFileSizeBytes: num('UPLOAD_MAX_FILE_SIZE_BYTES', 10 * 1024 * 1024),
  },

  swagger: {
    enabled: bool('SWAGGER_ENABLED', true),
    route: str('SWAGGER_ROUTE', '/api-docs'),
  },
};

env.isProduction = env.nodeEnv === 'production';
env.isTest = env.nodeEnv === 'test';

module.exports = env;
