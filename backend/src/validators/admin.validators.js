'use strict';

// express-validator chains for the Administration module, one named export
// per docs/administration.yaml operationId, run through
// src/middleware/validate.js in the route definition.
const { body, param, query } = require('express-validator');

const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const USER_TYPES = ['officer', 'department_admin', 'corporation_admin'];
const TRIGGER_CONDITIONS = ['sla_breach', 'no_action_after_hours'];
const PROVIDER_TYPES = ['ai', 'voice', 'sms', 'whatsapp', 'email', 'maps'];

const idParam = (name) =>
  param(name)
    .exists()
    .withMessage({ issue: 'REQUIRED', message: `${name} is required.` })
    .bail()
    .isInt({ min: 1 })
    .withMessage({ issue: 'INVALID_FORMAT', message: `${name} must be a positive integer id.` })
    .toInt();

const idQuery = (name) =>
  query(name)
    .optional()
    .isInt({ min: 1 })
    .withMessage({ issue: 'INVALID_FORMAT', message: `${name} must be a positive integer id.` });

const isActiveQuery = () =>
  query('isActive')
    .optional()
    .isBoolean()
    .withMessage({ issue: 'INVALID_FORMAT', message: 'isActive must be a boolean.' });

const pageQuery = () =>
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage({ issue: 'INVALID_FORMAT', message: 'page must be a positive integer.' });

const sizeQuery = (max) =>
  query('size')
    .optional()
    .isInt({ min: 1, max })
    .withMessage({ issue: 'INVALID_RANGE', message: `size must be between 1 and ${max}.` });

const nameBody = (required, min = 2, max = 100) => {
  const chain = body('name');
  return (
    required ? chain.exists().withMessage({ issue: 'REQUIRED', message: 'name is required.' }).bail() : chain.optional()
  )
    .isString()
    .trim()
    .isLength({ min, max })
    .withMessage({ issue: 'INVALID_LENGTH', message: `name must be ${min}-${max} characters.` });
};

const isoDateBody = (field, required) => {
  const chain = body(field);
  return (
    required
      ? chain
          .exists()
          .withMessage({ issue: 'REQUIRED', message: `${field} is required.` })
          .bail()
      : chain.optional()
  )
    .isISO8601()
    .withMessage({ issue: 'INVALID_FORMAT', message: `${field} must be an ISO-8601 date.` });
};

// --- 6.1 Department ---
const adminListDepartments = [isActiveQuery(), pageQuery(), sizeQuery(100)];
const adminCreateDepartment = [
  body('code')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'code is required.' })
    .bail()
    .matches(/^[A-Z0-9]{2,10}$/)
    .withMessage({ issue: 'INVALID_FORMAT', message: 'code must be 2-10 uppercase alphanumeric characters.' }),
  nameBody(true),
];
const adminGetDepartment = [idParam('id')];
const adminUpdateDepartment = [idParam('id'), nameBody(false), body('isActive').optional().isBoolean()];
const adminDeleteDepartment = [idParam('id')];

// --- 6.2 Category ---
const adminListComplaintCategories = [idQuery('departmentId'), isActiveQuery(), pageQuery(), sizeQuery(100)];
const adminCreateComplaintCategory = [
  body('departmentId')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'departmentId is required.' })
    .bail()
    .isInt({ min: 1 })
    .toInt(),
  nameBody(true),
  body('defaultPriority')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'defaultPriority is required.' })
    .bail()
    .isIn(PRIORITIES)
    .withMessage({ issue: 'INVALID_VALUE', message: `defaultPriority must be one of: ${PRIORITIES.join(', ')}.` }),
];
const adminGetComplaintCategory = [idParam('id')];
const adminUpdateComplaintCategory = [
  idParam('id'),
  nameBody(false),
  body('defaultPriority')
    .optional()
    .isIn(PRIORITIES)
    .withMessage({ issue: 'INVALID_VALUE', message: `defaultPriority must be one of: ${PRIORITIES.join(', ')}.` }),
  body('isActive').optional().isBoolean(),
];
const adminDeleteComplaintCategory = [idParam('id')];

// --- 6.3 User ---
const adminListUsers = [
  query('userType').optional().isIn(USER_TYPES),
  idQuery('departmentId'),
  isActiveQuery(),
  pageQuery(),
  sizeQuery(100),
];
const adminCreateUser = [
  body('username')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'username is required.' })
    .bail()
    .isString()
    .trim()
    .isLength({ min: 3, max: 64 }),
  body('name').optional().isString(),
  body('email')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'email is required.' })
    .bail()
    .isEmail()
    .withMessage({ issue: 'INVALID_FORMAT', message: 'email must be valid.' }),
  body('userType')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'userType is required.' })
    .bail()
    .isIn(USER_TYPES),
  body('departmentId').optional().isInt({ min: 1 }).toInt(),
  body('hierarchyLevelId').optional().isInt({ min: 1 }).toInt(),
  body('roleIds')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'roleIds is required.' })
    .bail()
    .isArray({ min: 1 })
    .withMessage({ issue: 'REQUIRED', message: 'roleIds must contain at least one id.' }),
  body('roleIds.*').isInt({ min: 1 }).toInt(),
  body('initialPassword').optional().isString().isLength({ min: 12 }),
];
const adminGetUser = [idParam('id')];
const adminUpdateUser = [
  idParam('id'),
  body('name').optional().isString(),
  body('email').optional().isEmail().withMessage({ issue: 'INVALID_FORMAT', message: 'email must be valid.' }),
  body('departmentId').optional().isInt({ min: 1 }).toInt(),
  body('hierarchyLevelId').optional().isInt({ min: 1 }).toInt(),
  body('roleIds').optional().isArray({ min: 1 }),
  body('roleIds.*').isInt({ min: 1 }).toInt(),
  body('isActive').optional().isBoolean(),
];
const adminDeleteUser = [idParam('id')];

// --- 6.4 Role ---
const adminListRoles = [query('isSystemRole').optional().isBoolean(), pageQuery(), sizeQuery(100)];
const adminCreateRole = [
  nameBody(true, 2, 64),
  body('permissionIds')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'permissionIds is required.' })
    .bail()
    .isArray({ min: 1 }),
  body('permissionIds.*').isInt({ min: 1 }).toInt(),
];
const adminGetRole = [idParam('id')];
const adminUpdateRole = [
  idParam('id'),
  nameBody(false, 2, 64),
  body('permissionIds').optional().isArray({ min: 1 }),
  body('permissionIds.*').isInt({ min: 1 }).toInt(),
];
const adminDeleteRole = [idParam('id')];

// --- 6.5 Permission (read-only) ---
const adminListPermissions = [query('resource').optional().isString()];
const adminGetPermission = [idParam('id')];

// --- 6.6 Approval Workflow ---
const adminListApprovalWorkflows = [idQuery('categoryId'), idQuery('departmentId'), pageQuery(), sizeQuery(100)];
const adminCreateApprovalWorkflow = [
  body('categoryId')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'categoryId is required.' })
    .bail()
    .isInt({ min: 1 })
    .toInt(),
  body('requiredLevelId')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'requiredLevelId is required.' })
    .bail()
    .isInt({ min: 1 })
    .toInt(),
  isoDateBody('effectiveFrom', true),
];
const adminGetApprovalWorkflow = [idParam('id')];
const adminVersionApprovalWorkflow = [
  idParam('id'),
  body('requiredLevelId')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'requiredLevelId is required.' })
    .bail()
    .isInt({ min: 1 })
    .toInt(),
  isoDateBody('effectiveFrom', true),
];
const adminDeleteApprovalWorkflow = [idParam('id')];

// --- 6.7 SLA Rule ---
const adminListSlaRules = [
  idQuery('departmentId'),
  idQuery('categoryId'),
  query('priority').optional().isIn(PRIORITIES),
  pageQuery(),
  sizeQuery(100),
];
const adminCreateSlaRule = [
  body('departmentId')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'departmentId is required.' })
    .bail()
    .isInt({ min: 1 })
    .toInt(),
  body('categoryId')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'categoryId is required.' })
    .bail()
    .isInt({ min: 1 })
    .toInt(),
  body('priority')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'priority is required.' })
    .bail()
    .isIn(PRIORITIES),
  body('resolutionHours')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'resolutionHours is required.' })
    .bail()
    .isInt({ min: 1, max: 8760 })
    .toInt(),
  isoDateBody('effectiveFrom', true),
];
const adminGetSlaRule = [idParam('id')];
const adminVersionSlaRule = [
  idParam('id'),
  body('resolutionHours')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'resolutionHours is required.' })
    .bail()
    .isInt({ min: 1, max: 8760 })
    .toInt(),
  isoDateBody('effectiveFrom', true),
];
const adminDeleteSlaRule = [idParam('id')];

// --- 6.8 Escalation Rule ---
const adminListEscalationRules = [idQuery('departmentId'), pageQuery(), sizeQuery(100)];
const adminCreateEscalationRule = [
  body('departmentId')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'departmentId is required.' })
    .bail()
    .isInt({ min: 1 })
    .toInt(),
  body('fromLevelId')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'fromLevelId is required.' })
    .bail()
    .isInt({ min: 1 })
    .toInt(),
  body('toLevelId')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'toLevelId is required.' })
    .bail()
    .isInt({ min: 1 })
    .toInt(),
  body('triggerCondition')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'triggerCondition is required.' })
    .bail()
    .isIn(TRIGGER_CONDITIONS),
  body('escalateAfterHours')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'escalateAfterHours is required.' })
    .bail()
    .isInt({ min: 1 })
    .toInt(),
];
const adminGetEscalationRule = [idParam('id')];
const adminVersionEscalationRule = [
  idParam('id'),
  body('toLevelId').optional().isInt({ min: 1 }).toInt(),
  body('escalateAfterHours').optional().isInt({ min: 1 }).toInt(),
];
const adminDeleteEscalationRule = [idParam('id')];

// --- 6.9 Tenant Configuration ---
const adminGetTenantConfig = [];
const adminUpdateTenantConfig = [];

// --- 6.10 Feature Flags ---
const adminListFeatureFlags = [];
const adminToggleFeatureFlag = [
  param('flagKey').exists().withMessage({ issue: 'REQUIRED', message: 'flagKey is required.' }),
  body('isEnabled')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'isEnabled is required.' })
    .bail()
    .isBoolean()
    .withMessage({ issue: 'INVALID_FORMAT', message: 'isEnabled must be a boolean.' }),
];

// --- 6.11 Providers ---
const adminListProviders = [query('providerType').optional().isIn(PROVIDER_TYPES)];
const adminSetActiveProvider = [
  param('providerType')
    .exists()
    .isIn(PROVIDER_TYPES)
    .withMessage({ issue: 'INVALID_VALUE', message: `providerType must be one of: ${PROVIDER_TYPES.join(', ')}.` }),
  body('providerName')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'providerName is required.' })
    .bail()
    .isString(),
  body('secretReference')
    .exists()
    .withMessage({ issue: 'REQUIRED', message: 'secretReference is required.' })
    .bail()
    .isString()
    .isLength({ min: 1 }),
];

module.exports = {
  adminListDepartments,
  adminCreateDepartment,
  adminGetDepartment,
  adminUpdateDepartment,
  adminDeleteDepartment,
  adminListComplaintCategories,
  adminCreateComplaintCategory,
  adminGetComplaintCategory,
  adminUpdateComplaintCategory,
  adminDeleteComplaintCategory,
  adminListUsers,
  adminCreateUser,
  adminGetUser,
  adminUpdateUser,
  adminDeleteUser,
  adminListRoles,
  adminCreateRole,
  adminGetRole,
  adminUpdateRole,
  adminDeleteRole,
  adminListPermissions,
  adminGetPermission,
  adminListApprovalWorkflows,
  adminCreateApprovalWorkflow,
  adminGetApprovalWorkflow,
  adminVersionApprovalWorkflow,
  adminDeleteApprovalWorkflow,
  adminListSlaRules,
  adminCreateSlaRule,
  adminGetSlaRule,
  adminVersionSlaRule,
  adminDeleteSlaRule,
  adminListEscalationRules,
  adminCreateEscalationRule,
  adminGetEscalationRule,
  adminVersionEscalationRule,
  adminDeleteEscalationRule,
  adminGetTenantConfig,
  adminUpdateTenantConfig,
  adminListFeatureFlags,
  adminToggleFeatureFlag,
  adminListProviders,
  adminSetActiveProvider,
};
