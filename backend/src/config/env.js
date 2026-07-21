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

const nodeEnv = str('NODE_ENV', 'development');
const isTest = nodeEnv === 'test';

const env = {
  nodeEnv,
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
    // Mirrors config/config.js's `test: { database: `${base.database}_test` }`
    // convention exactly — the live Sequelize instance (this file, used by
    // src/models/index.js) must resolve to the same test database the
    // sequelize-cli migrations/seeders target, or NODE_ENV=test test runs
    // would silently read/write the development database instead.
    name: isTest ? `${str('DB_NAME', 'grievance_platform')}_test` : str('DB_NAME', 'grievance_platform'),
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
    // 7-day expiry, single-use, rotated on every use (docs/14-API-Security.md §14.4).
    refreshTokenTtlSeconds: num('JWT_REFRESH_TOKEN_TTL_SECONDS', 7 * 24 * 60 * 60),
  },

  otp: {
    // Single-use, 5-minute TTL (docs/authentication.yaml otpExpirySeconds).
    ttlSeconds: num('OTP_TTL_SECONDS', 300),
    resendCooldownSeconds: num('OTP_RESEND_COOLDOWN_SECONDS', 30),
    // "OTP Request | per mobile number | 3 / 10 minutes" (13-HTTP-Status-Codes.md §13.7).
    requestMaxPerWindow: num('OTP_REQUEST_MAX_PER_WINDOW', 3),
    requestWindowSeconds: num('OTP_REQUEST_WINDOW_SECONDS', 600),
    maxVerifyAttempts: num('OTP_MAX_VERIFY_ATTEMPTS', 5),
  },

  mfa: {
    challengeTtlSeconds: num('MFA_CHALLENGE_TTL_SECONDS', 300),
  },

  security: {
    // "5 attempts -> 15-minute lock" (SRS §8.1, 13-HTTP-Status-Codes.md §13.8).
    loginMaxFailedAttempts: num('LOGIN_MAX_FAILED_ATTEMPTS', 5),
    loginLockoutSeconds: num('LOGIN_LOCKOUT_SECONDS', 15 * 60),
    passwordResetTtlSeconds: num('PASSWORD_RESET_TTL_SECONDS', 30 * 60),
    passwordHistoryLimit: num('PASSWORD_HISTORY_LIMIT', 5),
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
env.isTest = isTest;

module.exports = env;
