'use strict';

// Response-shaping ("DTO") layer for the Administration module — the only
// place that decides what a service-layer model instance looks like once
// it crosses the HTTP boundary, per docs/administration.yaml's documented
// response shapes (Section 6.1-6.11).

// docs/administration.yaml's complaint_category.defaultPriority is a
// string enum (low|medium|high|critical); the approved v1.0 schema's
// complaint_category.default_priority column is a plain INTEGER
// (DATABASE_DESIGN.md §5 gives no enumerated value set for it). This maps
// between the two — 1 = most urgent — so the API contract's string enum
// is honored without altering the already-approved integer column.
const PRIORITY_TO_INT = { critical: 1, high: 2, medium: 3, low: 4 };
const INT_TO_PRIORITY = { 1: 'critical', 2: 'high', 3: 'medium', 4: 'low' };

function priorityToInt(priority) {
  return PRIORITY_TO_INT[priority];
}

function intToPriority(value) {
  return INT_TO_PRIORITY[value] || 'medium';
}

function shapeDepartment(d) {
  return {
    id: String(d.id),
    code: d.code,
    name: d.name,
    isActive: d.isActive,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

function shapeCategory(c) {
  return {
    id: String(c.id),
    departmentId: String(c.departmentId),
    name: c.name,
    defaultPriority: intToPriority(c.defaultPriority),
    isActive: c.isActive,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

// `name` is part of docs/administration.yaml's documented User shape, but
// neither `user` nor `staff_profile` (DATABASE_DESIGN.md §5) has a display
// -name column — only citizen_profile does. Falling back to `username`
// keeps the contract's field populated with something meaningful rather
// than null; see CURRENT_STATE.md "Known Limitations".
function shapeUser(user, { staffProfile, roleNames } = {}) {
  return {
    id: String(user.id),
    username: user.username,
    name: user.username,
    email: user.email,
    userType: user.userType,
    departmentId: staffProfile?.departmentId ? String(staffProfile.departmentId) : null,
    hierarchyLevelId: staffProfile?.hierarchyLevelId ? String(staffProfile.hierarchyLevelId) : null,
    employeeId: staffProfile?.employeeId ?? null,
    roles: roleNames || [],
    isActive: user.status === 'active',
    createdAt: user.createdAt,
  };
}

function shapeUserListItem(user, staffProfile) {
  return {
    id: String(user.id),
    username: user.username,
    name: user.username,
    userType: user.userType,
    departmentId: staffProfile?.departmentId ? String(staffProfile.departmentId) : null,
    isActive: user.status === 'active',
  };
}

function shapeRole(role, { permissions, permissionCount } = {}) {
  const shaped = {
    id: String(role.id),
    name: role.name,
    isSystemRole: role.isSystemRole,
    createdAt: role.createdAt,
  };
  if (permissions) {
    shaped.permissions = permissions.map((p) => ({ id: String(p.id), resource: p.resource, action: p.action }));
  }
  if (permissionCount !== undefined) {
    shaped.permissionCount = permissionCount;
  }
  return shaped;
}

function shapePermission(p) {
  return { id: String(p.id), resource: p.resource, action: p.action, description: p.description };
}

function shapeApprovalWorkflow(w) {
  return {
    id: String(w.id),
    categoryId: String(w.categoryId),
    requiredLevelId: String(w.requiredLevelId),
    version: w.version,
    effectiveFrom: w.effectiveFrom,
    effectiveTo: w.effectiveTo,
  };
}

function shapeSlaRule(r) {
  return {
    id: String(r.id),
    departmentId: String(r.departmentId),
    categoryId: String(r.categoryId),
    priority: intToPriority(r.priority),
    resolutionHours: r.resolutionHours,
    version: r.version,
    effectiveFrom: r.effectiveFrom,
    effectiveTo: r.effectiveTo,
  };
}

function shapeEscalationRule(r) {
  return {
    id: String(r.id),
    departmentId: String(r.departmentId),
    fromLevelId: String(r.fromLevelId),
    toLevelId: String(r.toLevelId),
    triggerCondition: r.triggerCondition,
    escalateAfterHours: r.escalateAfterHours,
    version: r.version,
    effectiveFrom: r.effectiveFrom,
  };
}

// docs/administration.yaml §6.9's tenant-config fields (defaultLanguage,
// sessionTimeouts, passwordPolicy, reopenWindowDays) have no backing
// column on `tenant` (DATABASE_DESIGN.md §5 lists only code/name/
// tenant_type/state/status) — there is no per-tenant override storage
// approved yet. GET returns the real columns plus the platform-wide
// defaults every tenant currently shares (sourced from src/config/env.js);
// see src/services/admin.service.js for why PATCH cannot persist them.
function shapeTenantConfig(tenant, env) {
  return {
    tenantCode: tenant.code,
    tenantName: tenant.name,
    defaultLanguage: 'en',
    sessionTimeouts: {
      citizen: 1800,
      officer: 1800,
      admin: env.jwt.accessTokenTtlSeconds,
    },
    passwordPolicy: {
      minLength: 12,
      rotationDays: null,
    },
    reopenWindowDays: null,
    _note:
      'defaultLanguage/sessionTimeouts/passwordPolicy/reopenWindowDays are current platform-wide defaults, not yet ' +
      'tenant-overridable — DATABASE_DESIGN.md §5 tenant has no columns for them (v1.0 approved schema).',
  };
}

function shapeFeatureFlag(f) {
  return { flagKey: f.flagKey, isEnabled: f.isEnabled, flagType: f.flagType, updatedAt: f.updatedAt };
}

function shapeProvider(p) {
  return { providerType: p.providerType, providerName: p.providerName, isActive: p.isActive, updatedAt: p.updatedAt };
}

module.exports = {
  priorityToInt,
  intToPriority,
  shapeDepartment,
  shapeCategory,
  shapeUser,
  shapeUserListItem,
  shapeRole,
  shapePermission,
  shapeApprovalWorkflow,
  shapeSlaRule,
  shapeEscalationRule,
  shapeTenantConfig,
  shapeFeatureFlag,
  shapeProvider,
};
