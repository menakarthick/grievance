'use strict';

const { Router } = require('express');
const controller = require('../../controllers/admin.controller');
const validators = require('../../validators/admin.validators');
const { validate } = require('../../middleware/validate');
const { authenticate, requireRole, requireTenant } = require('../../middleware/auth');
const policy = require('../../policies/admin.policy');

// Administration module routes (docs/administration.yaml). Every
// Administration resource sits directly under /api/v1 in the approved
// contract (no common /admin prefix — see routes/v1/index.js), so this
// router is mounted at the v1 root. Role gates mirror
// docs/06-Administration-APIs.md's per-endpoint "Authentication" column
// exactly, via src/policies/admin.policy.js; fine-grained "own department
// only" scoping is enforced in src/services/admin.service.js since it
// depends on the caller's staff_profile, not just their role.
const router = Router();

router.use(authenticate, requireTenant());

const read = (roles) => requireRole(...roles);
const write = (roles) => requireRole(...roles);

// --- 6.1 Department ---
router.get(
  '/departments',
  read(policy.department.read),
  validators.adminListDepartments,
  validate,
  controller.listDepartments,
);
router.post(
  '/departments',
  write(policy.department.write),
  validators.adminCreateDepartment,
  validate,
  controller.createDepartment,
);
router.get(
  '/departments/:id',
  read(policy.department.read),
  validators.adminGetDepartment,
  validate,
  controller.getDepartment,
);
router.patch(
  '/departments/:id',
  write(policy.department.write),
  validators.adminUpdateDepartment,
  validate,
  controller.updateDepartment,
);
router.delete(
  '/departments/:id',
  write(policy.department.write),
  validators.adminDeleteDepartment,
  validate,
  controller.deleteDepartment,
);

// --- 6.2 Complaint Category ---
router.get(
  '/complaint-categories',
  read(policy.category.read),
  validators.adminListComplaintCategories,
  validate,
  controller.listComplaintCategories,
);
router.post(
  '/complaint-categories',
  write(policy.category.write),
  validators.adminCreateComplaintCategory,
  validate,
  controller.createComplaintCategory,
);
router.get(
  '/complaint-categories/:id',
  read(policy.category.read),
  validators.adminGetComplaintCategory,
  validate,
  controller.getComplaintCategory,
);
router.patch(
  '/complaint-categories/:id',
  write(policy.category.write),
  validators.adminUpdateComplaintCategory,
  validate,
  controller.updateComplaintCategory,
);
router.delete(
  '/complaint-categories/:id',
  write(policy.category.write),
  validators.adminDeleteComplaintCategory,
  validate,
  controller.deleteComplaintCategory,
);

// --- 6.3 User ---
router.get('/users', read(policy.user.read), validators.adminListUsers, validate, controller.listUsers);
router.post('/users', write(policy.user.write), validators.adminCreateUser, validate, controller.createUser);
router.get('/users/:id', read(policy.user.read), validators.adminGetUser, validate, controller.getUser);
router.patch('/users/:id', write(policy.user.write), validators.adminUpdateUser, validate, controller.updateUser);
router.delete('/users/:id', write(policy.user.write), validators.adminDeleteUser, validate, controller.deleteUser);

// --- 6.4 Role ---
router.get('/roles', read(policy.role.read), validators.adminListRoles, validate, controller.listRoles);
router.post('/roles', write(policy.role.write), validators.adminCreateRole, validate, controller.createRole);
router.get('/roles/:id', read(policy.role.read), validators.adminGetRole, validate, controller.getRole);
router.patch('/roles/:id', write(policy.role.write), validators.adminUpdateRole, validate, controller.updateRole);
router.delete('/roles/:id', write(policy.role.write), validators.adminDeleteRole, validate, controller.deleteRole);

// --- 6.5 Permission (read-only) ---
router.get(
  '/permissions',
  read(policy.permission.read),
  validators.adminListPermissions,
  validate,
  controller.listPermissions,
);
router.get(
  '/permissions/:id',
  read(policy.permission.read),
  validators.adminGetPermission,
  validate,
  controller.getPermission,
);

// --- 6.6 Approval Workflow ---
router.get(
  '/approval-workflows',
  read(policy.approvalWorkflow.read),
  validators.adminListApprovalWorkflows,
  validate,
  controller.listApprovalWorkflows,
);
router.post(
  '/approval-workflows',
  write(policy.approvalWorkflow.write),
  validators.adminCreateApprovalWorkflow,
  validate,
  controller.createApprovalWorkflow,
);
router.get(
  '/approval-workflows/:id',
  read(policy.approvalWorkflow.read),
  validators.adminGetApprovalWorkflow,
  validate,
  controller.getApprovalWorkflow,
);
router.patch(
  '/approval-workflows/:id',
  write(policy.approvalWorkflow.write),
  validators.adminVersionApprovalWorkflow,
  validate,
  controller.versionApprovalWorkflow,
);
router.delete(
  '/approval-workflows/:id',
  write(policy.approvalWorkflow.write),
  validators.adminDeleteApprovalWorkflow,
  validate,
  controller.deleteApprovalWorkflow,
);

// --- 6.7 SLA Rule ---
router.get('/sla-rules', read(policy.slaRule.read), validators.adminListSlaRules, validate, controller.listSlaRules);
router.post(
  '/sla-rules',
  write(policy.slaRule.write),
  validators.adminCreateSlaRule,
  validate,
  controller.createSlaRule,
);
router.get('/sla-rules/:id', read(policy.slaRule.read), validators.adminGetSlaRule, validate, controller.getSlaRule);
router.patch(
  '/sla-rules/:id',
  write(policy.slaRule.write),
  validators.adminVersionSlaRule,
  validate,
  controller.versionSlaRule,
);
router.delete(
  '/sla-rules/:id',
  write(policy.slaRule.write),
  validators.adminDeleteSlaRule,
  validate,
  controller.deleteSlaRule,
);

// --- 6.8 Escalation Rule ---
router.get(
  '/escalation-rules',
  read(policy.escalationRule.read),
  validators.adminListEscalationRules,
  validate,
  controller.listEscalationRules,
);
router.post(
  '/escalation-rules',
  write(policy.escalationRule.write),
  validators.adminCreateEscalationRule,
  validate,
  controller.createEscalationRule,
);
router.get(
  '/escalation-rules/:id',
  read(policy.escalationRule.read),
  validators.adminGetEscalationRule,
  validate,
  controller.getEscalationRule,
);
router.patch(
  '/escalation-rules/:id',
  write(policy.escalationRule.write),
  validators.adminVersionEscalationRule,
  validate,
  controller.versionEscalationRule,
);
router.delete(
  '/escalation-rules/:id',
  write(policy.escalationRule.write),
  validators.adminDeleteEscalationRule,
  validate,
  controller.deleteEscalationRule,
);

// --- 6.9 Tenant Configuration (singleton) ---
router.get(
  '/tenant-config',
  read(policy.tenantConfig.read),
  validators.adminGetTenantConfig,
  validate,
  controller.getTenantConfig,
);
router.patch(
  '/tenant-config',
  write(policy.tenantConfig.write),
  validators.adminUpdateTenantConfig,
  validate,
  controller.updateTenantConfig,
);

// --- 6.10 Feature Flags ---
router.get(
  '/feature-flags',
  read(policy.featureFlag.read),
  validators.adminListFeatureFlags,
  validate,
  controller.listFeatureFlags,
);
router.patch(
  '/feature-flags/:flagKey',
  write(policy.featureFlag.write),
  validators.adminToggleFeatureFlag,
  validate,
  controller.toggleFeatureFlag,
);

// --- 6.11 Providers ---
router.get('/providers', read(policy.provider.read), validators.adminListProviders, validate, controller.listProviders);
router.put(
  '/providers/:providerType',
  write(policy.provider.write),
  validators.adminSetActiveProvider,
  validate,
  controller.setActiveProvider,
);

module.exports = router;
