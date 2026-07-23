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
  CitizenProfile,
  District,
  Zone,
  Ward,
  ComplaintStatusDefinition,
  SlaRuleConfig,
  NotificationTemplateConfig,
  ProviderConfig,
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

async function createSlaRule({ tenantId, departmentId, categoryId, priority, resolutionHours = 72 } = {}) {
  return SlaRuleConfig.create({
    tenantId,
    departmentId,
    categoryId,
    priority,
    resolutionHours,
    version: 1,
    effectiveFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
    effectiveTo: null,
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

async function createCitizenWithProfile({ tenantId, name, wardId = null } = {}) {
  const { user } = await createCitizenUser({ tenantId });
  const suffix = uniqueSuffix();
  const profile = await CitizenProfile.create({
    userId: user.id,
    name: name || `Citizen ${suffix}`,
    wardId,
  });
  return { user, profile };
}

async function createWardChain({ tenantId } = {}) {
  const suffix = uniqueSuffix();
  const district = await District.create({ tenantId, code: `D${suffix.slice(0, 6).toUpperCase()}`, name: `District ${suffix}` });
  const zone = await Zone.create({
    tenantId,
    districtId: district.id,
    code: `Z${suffix.slice(0, 6).toUpperCase()}`,
    name: `Zone ${suffix}`,
  });
  const ward = await Ward.create({
    tenantId,
    zoneId: zone.id,
    code: `W${suffix.slice(0, 6).toUpperCase()}`,
    name: `Ward ${suffix}`,
  });
  return { district, zone, ward };
}

async function getComplaintStatus(tenantId, code) {
  return ComplaintStatusDefinition.findOne({ where: { tenantId, code } });
}

// src/seeders/20260101010009-seed-complaint-statuses.js only seeds the
// production-representative TAMBARAM tenant, not this suite's own
// getOrCreateTestTenant() ('TEST_AUTH') — tests need their own copy of the
// same tenant-configurable status catalog to exercise the lifecycle.
const STATUS_DEFS = [
  { code: 'REGISTERED', label: 'Registered', sortOrder: 1 },
  { code: 'ASSIGNED', label: 'Assigned', sortOrder: 2 },
  { code: 'IN_PROGRESS', label: 'In Progress', sortOrder: 3 },
  { code: 'RESOLVED', label: 'Resolved', sortOrder: 4 },
  { code: 'CLOSED', label: 'Closed', sortOrder: 5 },
  { code: 'REOPENED', label: 'Reopened', sortOrder: 6 },
  { code: 'REJECTED', label: 'Rejected', sortOrder: 7 },
];

async function ensureComplaintStatuses(tenantId) {
  for (const s of STATUS_DEFS) {
    await ComplaintStatusDefinition.findOrCreate({
      where: { tenantId, code: s.code },
      defaults: { label: s.label, sortOrder: s.sortOrder },
    });
  }
}

// npm test's pretest only runs migrations, not seeders (package.json) — the
// Notification test suite creates its own template rows directly, the same
// pattern ensureComplaintStatuses already established for
// complaint_status_definition.
async function createNotificationTemplate({ tenantId, eventType, channel, language = 'en', bodyTemplate, version = 1 }) {
  return NotificationTemplateConfig.create({ tenantId, eventType, channel, language, bodyTemplate, version });
}

async function createProviderConfig({ tenantId, providerType, providerName, isActive = true }) {
  const suffix = uniqueSuffix();
  return ProviderConfig.create({
    tenantId,
    providerType,
    providerName: providerName || `provider_${suffix}`,
    secretReference: `secrets/test/${providerType}-${suffix}`,
    isActive,
  });
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
  createCitizenWithProfile,
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
  createWardChain,
  getComplaintStatus,
  ensureComplaintStatuses,
  createSlaRule,
  createNotificationTemplate,
  createProviderConfig,
};
