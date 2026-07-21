'use strict';

const crypto = require('crypto');
const { authenticator } = require('otplib');
const {
  Tenant,
  Role,
  Permission,
  RolePermission,
  User,
  StaffProfile,
  MfaDevice,
  UserRoleAssignment,
  Department,
  ComplaintCategory,
  OfficerHierarchyLevel,
} = require('../../../src/models');
const { hashPassword } = require('../../../src/utils/password');
const tokenService = require('../../../src/services/token.service');

function uniqueSuffix() {
  return crypto.randomBytes(4).toString('hex');
}

function randomMobileNumber() {
  return `9${crypto.randomInt(100000000, 999999999)}`;
}

async function getOrCreateTestTenant() {
  const [tenant] = await Tenant.findOrCreate({
    where: { code: 'TEST_AUTH' },
    defaults: { name: 'Integration Test Tenant', tenantType: 'ULB', state: 'Test State', status: 'active' },
  });
  return tenant;
}

async function createStaffUser({
  tenantId,
  userType = 'officer',
  password = 'Officer-Pass-1!',
  departmentId = null,
} = {}) {
  const suffix = uniqueSuffix();
  const passwordHash = await hashPassword(password);
  const user = await User.create({
    tenantId,
    userType,
    mobileNumber: randomMobileNumber(),
    username: `${userType}_${suffix}`,
    passwordHash,
    status: 'active',
  });
  await StaffProfile.create({
    userId: user.id,
    departmentId,
    scopeType: 'department',
    scopeId: null,
    employeeId: `EMP-${suffix}`,
  });
  return { user, password };
}

async function createDepartment({ tenantId, code, name } = {}) {
  const suffix = uniqueSuffix();
  return Department.create({
    tenantId,
    code: code || `DP${suffix.slice(0, 6).toUpperCase()}`,
    name: name || `Dept ${suffix}`,
    isActive: true,
  });
}

async function createCategory({ tenantId, departmentId, name, defaultPriority = 3 } = {}) {
  const suffix = uniqueSuffix();
  return ComplaintCategory.create({
    tenantId,
    departmentId,
    name: name || `Category ${suffix}`,
    defaultPriority,
    isActive: true,
  });
}

async function getOrCreateHierarchyLevel(tenantId, levelOrder, title) {
  const [level] = await OfficerHierarchyLevel.findOrCreate({
    where: { tenantId, levelOrder },
    defaults: { title },
  });
  return level;
}

// Corporation Admin / Super Admin with an already-enrolled TOTP device
// (docs/authentication.yaml: MFA is mandatory for this tier — a fixture
// without one can only exercise the MFA_NOT_ENROLLED path).
async function createMfaEnrolledAdmin({ tenantId, userType = 'corporation_admin', password = 'Admin-Pass-1!' } = {}) {
  const { user } = await createStaffUser({ tenantId, userType, password });
  const totpSecret = authenticator.generateSecret();
  await MfaDevice.create({ userId: user.id, deviceType: 'totp', secretReference: totpSecret, verifiedAt: new Date() });
  return { user, password, totpSecret };
}

async function createAdminWithoutMfa({ tenantId, userType = 'corporation_admin', password = 'Admin-Pass-1!' } = {}) {
  return createStaffUser({ tenantId, userType, password });
}

async function getOrCreateGlobalRole(name) {
  const [role] = await Role.findOrCreate({
    where: { tenantId: null, name },
    defaults: { isSystemRole: true },
  });
  return role;
}

async function getOrCreatePermission(resource, action) {
  const [permission] = await Permission.findOrCreate({ where: { resource, action } });
  return permission;
}

async function grantPermissionToRole(roleId, permissionId) {
  await RolePermission.findOrCreate({ where: { roleId, permissionId } });
}

async function assignRoleToUser(userId, roleId, scopeType = 'tenant', scopeId = null) {
  await UserRoleAssignment.findOrCreate({ where: { userId, roleId, scopeType, scopeId } });
}

async function createCitizenUser({ tenantId } = {}) {
  const user = await User.create({
    tenantId,
    userType: 'citizen',
    mobileNumber: randomMobileNumber(),
    status: 'active',
  });
  return { user };
}

// Issues a real, verifiable access token for a fixture user without going
// through an HTTP login flow — the standard shortcut used across the auth
// integration suite (see tests/integration/rbacMiddleware.test.js) for
// tests whose focus is downstream of authentication.
async function tokenFor(user, roles = [], scope = null) {
  const { accessToken } = await tokenService.issueTokenPair({
    userId: user.id,
    userType: user.userType,
    tenantId: user.tenantId,
    roles,
    scope,
  });
  return accessToken;
}

module.exports = {
  uniqueSuffix,
  randomMobileNumber,
  getOrCreateTestTenant,
  createStaffUser,
  createCitizenUser,
  createMfaEnrolledAdmin,
  createAdminWithoutMfa,
  getOrCreateGlobalRole,
  getOrCreatePermission,
  grantPermissionToRole,
  assignRoleToUser,
  tokenFor,
  createDepartment,
  createCategory,
  getOrCreateHierarchyLevel,
};
