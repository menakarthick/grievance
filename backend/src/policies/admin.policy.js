'use strict';

// Declarative authorization rules for the Administration module — role
// lists and scope rules documented in docs/06-Administration-APIs.md
// §6.1-6.11, kept as data separate from route wiring, mirroring
// src/policies/geo.policy.js's convention.

const DEPT_ADMIN_UP = ['department_admin', 'corporation_admin', 'super_admin'];
const CORP_ADMIN_UP = ['corporation_admin', 'super_admin'];
const SUPER_ADMIN_ONLY = ['super_admin'];
const OFFICER_UP = ['officer', 'department_admin', 'corporation_admin', 'super_admin'];

// Which userType a caller may provision/edit (docs/06-Administration-APIs.md
// §6.3.2's OWASP A01 privilege-escalation guard: "a Department Admin cannot
// create a Corporation Admin").
const GRANTABLE_USER_TYPES = {
  department_admin: ['officer'],
  corporation_admin: ['officer', 'department_admin', 'corporation_admin'],
  super_admin: ['officer', 'department_admin', 'corporation_admin', 'super_admin'],
};

// Which system role NAMES a caller may assign via roleIds (same guard,
// applied to Section 6.4's role catalog rather than userType directly).
const GRANTABLE_SYSTEM_ROLES = {
  department_admin: ['officer'],
  corporation_admin: ['officer', 'department_admin', 'corporation_admin'],
  super_admin: ['officer', 'department_admin', 'corporation_admin', 'super_admin'],
};

module.exports = {
  DEPT_ADMIN_UP,
  CORP_ADMIN_UP,
  SUPER_ADMIN_ONLY,
  OFFICER_UP,
  GRANTABLE_USER_TYPES,
  GRANTABLE_SYSTEM_ROLES,

  // Department (§6.1)
  department: { read: OFFICER_UP, write: CORP_ADMIN_UP },
  // Category (§6.2) — write is Department Admin (own dept) / Corporation Admin
  category: { read: OFFICER_UP, write: DEPT_ADMIN_UP },
  // User (§6.3)
  user: { read: DEPT_ADMIN_UP, write: DEPT_ADMIN_UP },
  // Role (§6.4)
  role: { read: CORP_ADMIN_UP, write: CORP_ADMIN_UP },
  // Permission (§6.5) — read-only catalog
  permission: { read: CORP_ADMIN_UP },
  // Approval Workflow (§6.6) — read scoped down to Dept Admin, write Corp Admin+
  approvalWorkflow: { read: DEPT_ADMIN_UP, write: CORP_ADMIN_UP },
  // SLA (§6.7) — Dept Admin can both read and write within own department
  slaRule: { read: DEPT_ADMIN_UP, write: DEPT_ADMIN_UP },
  // Escalation (§6.8) — Corp Admin+ only, both directions
  escalationRule: { read: CORP_ADMIN_UP, write: CORP_ADMIN_UP },
  // Tenant Config (§6.9)
  tenantConfig: { read: CORP_ADMIN_UP, write: CORP_ADMIN_UP },
  // Feature Flags (§6.10)
  featureFlag: { read: CORP_ADMIN_UP, write: CORP_ADMIN_UP },
  // Providers (§6.11) — read Corp Admin+, write Super Admin only
  provider: { read: CORP_ADMIN_UP, write: SUPER_ADMIN_ONLY },
};
