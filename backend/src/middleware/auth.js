'use strict';

const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const logger = require('../config/logger');
const { ApiError } = require('../utils/apiError');

// RS256 bearer JWT per docs/components/securitySchemes.yaml: claims carry
// userId, userType, tenantId, roles, scope. The API Gateway verifies once
// upstream in the target architecture (ARCHITECTURE.md §4.1); this
// middleware performs the equivalent verification for this service.
let publicKey = null;
try {
  publicKey = fs.readFileSync(path.join(__dirname, '..', '..', env.jwt.publicKeyPath), 'utf8');
} catch (err) {
  logger.warn(
    'JWT public key not found — authenticate()/optionalAuthenticate() will reject all tokens until it is generated',
    {
      path: env.jwt.publicKeyPath,
      error: err.message,
    },
  );
}

function verifyToken(token) {
  if (!publicKey) {
    throw ApiError.internal('JWT public key is not configured on this server.');
  }
  try {
    return jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: env.jwt.issuer,
      audience: env.jwt.audience,
    });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('TOKEN_EXPIRED', 'The access token has expired.');
    }
    throw ApiError.unauthorized('TOKEN_INVALID', 'The access token is invalid.');
  }
}

function extractBearerToken(req) {
  const header = req.get('Authorization') || '';
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

// Rejects the request unless a valid bearer token is present.
function authenticate(req, res, next) {
  const token = extractBearerToken(req);
  if (!token) {
    return next(ApiError.unauthorized('UNAUTHENTICATED', 'A bearer access token is required.'));
  }
  try {
    const claims = verifyToken(token);
    req.user = {
      id: claims.userId,
      userType: claims.userType,
      tenantId: claims.tenantId,
      roles: claims.roles || [],
      scope: claims.scope,
    };
    return next();
  } catch (err) {
    return next(err);
  }
}

// Populates req.user when a valid token is present; never rejects.
function optionalAuthenticate(req, res, next) {
  const token = extractBearerToken(req);
  if (!token) return next();
  try {
    const claims = verifyToken(token);
    req.user = {
      id: claims.userId,
      userType: claims.userType,
      tenantId: claims.tenantId,
      roles: claims.roles || [],
      scope: claims.scope,
    };
  } catch {
    // Optional auth: an invalid/expired token is treated as anonymous.
  }
  return next();
}

// Generic RBAC gate — role membership is an infra/security concern, not a
// business rule; per-endpoint role sets are wired in by later phases.
function authorize(...allowedRoles) {
  return function authorizeMiddleware(req, res, next) {
    if (!req.user) {
      return next(ApiError.unauthorized());
    }
    const hasRole = req.user.roles.some((role) => allowedRoles.includes(role));
    if (!hasRole) {
      return next(ApiError.forbidden());
    }
    return next();
  };
}

module.exports = { authenticate, optionalAuthenticate, authorize, verifyToken };
