'use strict';

// HTTP-layer handlers for the Administration module: parse the request,
// call src/services/admin.service.js, shape the response via
// src/utils/apiResponse.js. One handler per docs/administration.yaml
// operationId.
const { asyncHandler } = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const { parseOffsetPagination } = require('../utils/pagination');
const { parseSort, parseSearch } = require('../utils/queryOptions');
const admin = require('../services/admin.service');
const { priorityToInt } = require('../dtos/admin.dto');

function parseBooleanQuery(value, fallback) {
  if (value === undefined) return fallback;
  return value === 'true' || value === true;
}

const NAME_ORDER = [['name', 'ASC']];
const CREATED_ORDER = [['createdAt', 'DESC']];

// --- 6.1 Department -----------------------------------------------------------
const listDepartments = asyncHandler(async (req, res) => {
  const { page, size, offset } = parseOffsetPagination(req, { maxSize: 100 });
  const order = parseSort(req, ['name', 'code', 'createdAt'], NAME_ORDER);
  const isActive = parseBooleanQuery(req.query.isActive, true);
  const result = await admin.departmentService.list(req.user, {
    isActive,
    q: parseSearch(req),
    order,
    page,
    size,
    offset,
  });
  sendSuccess(res, { data: result.data, pagination: result.pagination });
});
const createDepartment = asyncHandler(async (req, res) => {
  const result = await admin.departmentService.create(req.user, req.body);
  sendSuccess(res, { statusCode: 201, data: result });
});
const getDepartment = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await admin.departmentService.get(req.user, req.params.id) });
});
const updateDepartment = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await admin.departmentService.update(req.user, req.params.id, req.body) });
});
const deleteDepartment = asyncHandler(async (req, res) => {
  await admin.departmentService.remove(req.user, req.params.id);
  res.status(204).end();
});

// --- 6.2 Category --------------------------------------------------------------
const listComplaintCategories = asyncHandler(async (req, res) => {
  const { page, size, offset } = parseOffsetPagination(req, { maxSize: 100 });
  const order = parseSort(req, ['name', 'createdAt'], NAME_ORDER);
  const isActive = parseBooleanQuery(req.query.isActive, true);
  const result = await admin.categoryService.list(req.user, {
    departmentId: req.query.departmentId,
    isActive,
    q: parseSearch(req),
    order,
    page,
    size,
    offset,
  });
  sendSuccess(res, { data: result.data, pagination: result.pagination });
});
const createComplaintCategory = asyncHandler(async (req, res) => {
  const result = await admin.categoryService.create(req.user, req.body);
  sendSuccess(res, { statusCode: 201, data: result });
});
const getComplaintCategory = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await admin.categoryService.get(req.user, req.params.id) });
});
const updateComplaintCategory = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await admin.categoryService.update(req.user, req.params.id, req.body) });
});
const deleteComplaintCategory = asyncHandler(async (req, res) => {
  await admin.categoryService.remove(req.user, req.params.id);
  res.status(204).end();
});

// --- 6.3 User --------------------------------------------------------------------
const listUsers = asyncHandler(async (req, res) => {
  const { page, size, offset } = parseOffsetPagination(req, { maxSize: 100 });
  const isActive = parseBooleanQuery(req.query.isActive, true);
  const result = await admin.userService.list(req.user, {
    userType: req.query.userType,
    departmentId: req.query.departmentId,
    isActive,
    page,
    size,
    offset,
  });
  sendSuccess(res, { data: result.data, pagination: result.pagination });
});
const createUser = asyncHandler(async (req, res) => {
  const result = await admin.userService.create(req.user, req.body);
  sendSuccess(res, { statusCode: 201, data: result });
});
const getUser = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await admin.userService.get(req.user, req.params.id) });
});
const updateUser = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await admin.userService.update(req.user, req.params.id, req.body) });
});
const deleteUser = asyncHandler(async (req, res) => {
  await admin.userService.remove(req.user, req.params.id);
  res.status(204).end();
});

// --- 6.4 Role -----------------------------------------------------------------
const listRoles = asyncHandler(async (req, res) => {
  const { page, size, offset } = parseOffsetPagination(req, { maxSize: 100 });
  const isSystemRole = req.query.isSystemRole === undefined ? undefined : req.query.isSystemRole === 'true';
  const result = await admin.roleService.list(req.user, { isSystemRole, page, size, offset });
  sendSuccess(res, { data: result.data, pagination: result.pagination });
});
const createRole = asyncHandler(async (req, res) => {
  const result = await admin.roleService.create(req.user, req.body);
  sendSuccess(res, { statusCode: 201, data: result });
});
const getRole = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await admin.roleService.get(req.user, req.params.id) });
});
const updateRole = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await admin.roleService.update(req.user, req.params.id, req.body) });
});
const deleteRole = asyncHandler(async (req, res) => {
  await admin.roleService.remove(req.user, req.params.id);
  res.status(204).end();
});

// --- 6.5 Permission (read-only) -------------------------------------------------
const listPermissions = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: (await admin.permissionService.list(req.query.resource)).data });
});
const getPermission = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await admin.permissionService.get(req.params.id) });
});

// --- 6.6 Approval Workflow -------------------------------------------------------
const listApprovalWorkflows = asyncHandler(async (req, res) => {
  const { page, size, offset } = parseOffsetPagination(req, { maxSize: 100 });
  const result = await admin.approvalWorkflowService.list(req.user, {
    filters: { categoryId: req.query.categoryId },
    order: CREATED_ORDER,
    page,
    size,
    offset,
  });
  sendSuccess(res, { data: result.data, pagination: result.pagination });
});
const createApprovalWorkflow = asyncHandler(async (req, res) => {
  const result = await admin.approvalWorkflowService.create(req.user, req.body);
  sendSuccess(res, { statusCode: 201, data: result });
});
const getApprovalWorkflow = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await admin.approvalWorkflowService.get(req.user, req.params.id) });
});
const versionApprovalWorkflow = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await admin.approvalWorkflowService.update(req.user, req.params.id, req.body) });
});
const deleteApprovalWorkflow = asyncHandler(async (req, res) => {
  await admin.approvalWorkflowService.remove(req.user, req.params.id);
  res.status(204).end();
});

// --- 6.7 SLA Rule ------------------------------------------------------------------
const listSlaRules = asyncHandler(async (req, res) => {
  const { page, size, offset } = parseOffsetPagination(req, { maxSize: 100 });
  const result = await admin.slaRuleService.list(req.user, {
    filters: {
      departmentId: req.query.departmentId,
      categoryId: req.query.categoryId,
      priority: req.query.priority ? priorityToInt(req.query.priority) : undefined,
    },
    order: CREATED_ORDER,
    page,
    size,
    offset,
  });
  sendSuccess(res, { data: result.data, pagination: result.pagination });
});
const createSlaRule = asyncHandler(async (req, res) => {
  const result = await admin.slaRuleService.create(req.user, req.body);
  sendSuccess(res, { statusCode: 201, data: result });
});
const getSlaRule = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await admin.slaRuleService.get(req.user, req.params.id) });
});
const versionSlaRule = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await admin.slaRuleService.update(req.user, req.params.id, req.body) });
});
const deleteSlaRule = asyncHandler(async (req, res) => {
  await admin.slaRuleService.remove(req.user, req.params.id);
  res.status(204).end();
});

// --- 6.8 Escalation Rule -----------------------------------------------------------
const listEscalationRules = asyncHandler(async (req, res) => {
  const { page, size, offset } = parseOffsetPagination(req, { maxSize: 100 });
  const result = await admin.escalationRuleService.list(req.user, {
    filters: { departmentId: req.query.departmentId },
    order: CREATED_ORDER,
    page,
    size,
    offset,
  });
  sendSuccess(res, { data: result.data, pagination: result.pagination });
});
const createEscalationRule = asyncHandler(async (req, res) => {
  const result = await admin.escalationRuleService.create(req.user, req.body);
  sendSuccess(res, { statusCode: 201, data: result });
});
const getEscalationRule = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await admin.escalationRuleService.get(req.user, req.params.id) });
});
const versionEscalationRule = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await admin.escalationRuleService.update(req.user, req.params.id, req.body) });
});
const deleteEscalationRule = asyncHandler(async (req, res) => {
  await admin.escalationRuleService.remove(req.user, req.params.id);
  res.status(204).end();
});

// --- 6.9 Tenant Configuration --------------------------------------------------------
const getTenantConfig = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await admin.tenantConfigService.get(req.user) });
});
const updateTenantConfig = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await admin.tenantConfigService.update(req.user, req.body) });
});

// --- 6.10 Feature Flags ---------------------------------------------------------------
const listFeatureFlags = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: (await admin.featureFlagService.list(req.user)).data });
});
const toggleFeatureFlag = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await admin.featureFlagService.toggle(req.user, req.params.flagKey, req.body.isEnabled) });
});

// --- 6.11 Providers -----------------------------------------------------------------
const listProviders = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: (await admin.providerService.list(req.user, req.query.providerType)).data });
});
const setActiveProvider = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await admin.providerService.setActive(req.user, req.params.providerType, req.body) });
});

module.exports = {
  listDepartments,
  createDepartment,
  getDepartment,
  updateDepartment,
  deleteDepartment,
  listComplaintCategories,
  createComplaintCategory,
  getComplaintCategory,
  updateComplaintCategory,
  deleteComplaintCategory,
  listUsers,
  createUser,
  getUser,
  updateUser,
  deleteUser,
  listRoles,
  createRole,
  getRole,
  updateRole,
  deleteRole,
  listPermissions,
  getPermission,
  listApprovalWorkflows,
  createApprovalWorkflow,
  getApprovalWorkflow,
  versionApprovalWorkflow,
  deleteApprovalWorkflow,
  listSlaRules,
  createSlaRule,
  getSlaRule,
  versionSlaRule,
  deleteSlaRule,
  listEscalationRules,
  createEscalationRule,
  getEscalationRule,
  versionEscalationRule,
  deleteEscalationRule,
  getTenantConfig,
  updateTenantConfig,
  listFeatureFlags,
  toggleFeatureFlag,
  listProviders,
  setActiveProvider,
};
