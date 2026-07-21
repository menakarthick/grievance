'use strict';

const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const logger = require('../config/logger');
const { ApiError } = require('../utils/apiError');
const tokenService = require('../services/token.service');
const rbacService = require('../services/rbac.service');

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

function claimsToUser(claims) {
  return {
    id: claims.userId,
    userType: claims.userType,
    tenantId: claims.tenantId,
    roles: claims.roles || [],
    scope: claims.scope,
  };
}

// Rejects the request unless a valid, non-revoked bearer token is present.
// Denylist check (docs/13-HTTP-Status-Codes.md §13.8 TOKEN_REVOKED) makes
// this async — logout's whole purpose is for this check to start returning
// 401 immediately for a token that hasn't naturally expired yet.
async function authenticate(req, res, next) {
  const token = extractBearerToken(req);
  if (!token) {
    return next(ApiError.unauthorized('UNAUTHENTICATED', 'A bearer access token is required.'));
  }
  try {
    const claims = verifyToken(token);
    const denylisted = await tokenService.isAccessTokenDenylisted(claims.jti);
    if (denylisted) {
      return next(ApiError.unauthorized('TOKEN_REVOKED', 'This access token has been revoked.'));
    }
    req.user = claimsToUser(claims);
    req.tokenClaims = claims;
    return next();
  } catch (err) {
    return next(err);
  }
}

// Populates req.user when a valid, non-revoked token is present; never
// rejects — for endpoints that behave differently for anonymous vs.
// authenticated callers rather than requiring authentication outright.
async function optionalAuthenticate(req, res, next) {
  const token = extractBearerToken(req);
  if (!token) return next();
  try {
    const claims = verifyToken(token);
    const denylisted = await tokenService.isAccessTokenDenylisted(claims.jti);
    if (!denylisted) {
      req.user = claimsToUser(claims);
      req.tokenClaims = claims;
    }
  } catch {
    // Optional auth: an invalid/expired/revoked token is treated as anonymous.
  }
  return next();
}

// Role-membership gate (docs/14-API-Security.md §14.7's Role check). Must
// run after authenticate().
function requireRole(...allowedRoles) {
  return function requireRoleMiddleware(req, res, next) {
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

// Kept as the pre-existing export name for backward compatibility with any
// code already written against it; identical behavior to requireRole().
const authorize = requireRole;

// Permission gate (docs/14-API-Security.md §14.7's Permission check —
// (resource, action) pairs resolved from the RBAC catalog). Super Admin
// bypasses this check entirely (RBACService's documented override).
function requirePermission(resource, action) {
  return async function requirePermissionMiddleware(req, res, next) {
    if (!req.user) {
      return next(ApiError.unauthorized());
    }
    try {
      const allowed = await rbacService.hasPermission(req.user, resource, action);
      if (!allowed) {
        return next(ApiError.forbidden());
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

// Tenant-isolation gate (docs/14-API-Security.md §14.9–14.10): every
// tenant-scoped route requires the caller to carry a tenantId claim, with
// the documented Super Admin exception (whose scope spans tenants, Section
// 3/5). Never derives tenant scoping from client input — only the JWT claim.
function requireTenant() {
  return function requireTenantMiddleware(req, res, next) {
    if (!req.user) {
      return next(ApiError.unauthorized());
    }
    if (req.user.userType === 'super_admin') {
      return next();
    }
    if (!req.user.tenantId) {
      return next(ApiError.forbidden('TENANT_REQUIRED', 'This action requires a tenant-scoped account.'));
    }
    return next();
  };
}

module.exports = {
  authenticate,
  optionalAuthenticate,
  authorize,
  requireRole,
  requirePermission,
  requireTenant,
  verifyToken,
};
