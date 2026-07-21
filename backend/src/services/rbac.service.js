'use strict';

const { redisClient } = require('../config/redis');
const redisKeys = require('../utils/redisKeys');
const roleRepository = require('../repositories/role.repository');
const permissionRepository = require('../repositories/permission.repository');

// Short TTL cache, explicit invalidation on write — ARCHITECTURE.md §11.2/
// §16: "Permission sets ... resolved from the Tenant & Admin Config Service
// and cached in Redis with short TTL and explicit invalidation on write."
const PERMISSION_CACHE_TTL_SECONDS = 60;

async function getRoleNamesForUser(userId) {
  const assignments = await roleRepository.getAssignmentsForUser(userId);
  return [...new Set(assignments.map((a) => a.role?.name).filter(Boolean))];
}

async function getPermissionsForUser(userId) {
  const cacheKey = redisKeys.rbacPermissions(userId);
  const cached = await redisClient.get(cacheKey).catch(() => null);
  if (cached) return JSON.parse(cached);

  const assignments = await roleRepository.getAssignmentsForUser(userId);
  const roleIds = [...new Set(assignments.map((a) => a.roleId))];
  const permissions = await permissionRepository.getPermissionsForRoleIds(roleIds);
  const shaped = permissions.map((p) => ({ resource: p.resource, action: p.action }));

  await redisClient.set(cacheKey, JSON.stringify(shaped), 'EX', PERMISSION_CACHE_TTL_SECONDS).catch(() => {});
  return shaped;
}

// Super Admin override (explicit platform requirement, mirrors Section
// 3/13's documented cross-tenant exception) — every permission check short-
// circuits to true for this tier, never evaluated against the permission
// catalog.
async function hasPermission(user, resource, action) {
  if (!user) return false;
  if (user.userType === 'super_admin') return true;

  const permissions = await getPermissionsForUser(user.id);
  return permissions.some((p) => p.resource === resource && p.action === action);
}

async function invalidateUserPermissionsCache(userId) {
  await redisClient.del(redisKeys.rbacPermissions(userId)).catch(() => {});
}

module.exports = { getRoleNamesForUser, getPermissionsForUser, hasPermission, invalidateUserPermissionsCache };
