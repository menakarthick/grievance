'use strict';

const crypto = require('crypto');
const { ApiError } = require('../utils/apiError');
const { hashPassword } = require('../utils/password');
const { buildOffsetPaginationMeta } = require('../utils/pagination');
const env = require('../config/env');
const logger = require('../config/logger');
const { recordAuditLog } = require('../audit');
const tokenService = require('./token.service');
const {
  departmentRepository,
  categoryRepository,
  findActiveDepartment,
  findActiveCategory,
  findActiveHierarchyLevel,
  userRepository,
  roleRepository,
  permissionRepository,
  approvalWorkflowRepository,
  slaRuleRepository,
  escalationRuleRepository,
  findTenantById,
  featureFlagRepository,
  providerRepository,
} = require('../repositories/admin.repository');
const { StaffProfile, OfficerHierarchyLevel } = require('../models');
const dto = require('../dtos/admin.dto');
const policy = require('../policies/admin.policy');

// --- shared helpers ----------------------------------------------------------

function tenantIdOf(user) {
  return Number(user.tenantId);
}

// A Department Admin's own department (SRS §3.4: "Department Admin (own
// department only)"). Looked up from staff_profile rather than the JWT's
// generic scope claim, which carries ward/department/tenant scope for
// RBAC's own scopeType/scopeId pair, not a ready-made departmentId.
async function resolveCallerDepartmentId(user) {
  if (user.userType !== 'department_admin') return null;
  const profile = await StaffProfile.findOne({ where: { userId: user.id } });
  return profile?.departmentId ?? null;
}

function assertDepartmentScope(user, callerDepartmentId, targetDepartmentId) {
  if (user.userType === 'department_admin' && Number(callerDepartmentId) !== Number(targetDepartmentId)) {
    throw ApiError.forbidden();
  }
}

async function audit(user, action, entityType, entityId, changeSummary) {
  await recordAuditLog({
    tenantId: tenantIdOf(user),
    actorUserId: user.id,
    action,
    entityType,
    entityId,
    changeSummary,
  });
}

// =============================================================================
// 6.1 Department Management
// =============================================================================
const departmentService = {
  async list(user, { isActive, q, order, page, size, offset }) {
    const { rows, count } = await departmentRepository.list({
      tenantId: tenantIdOf(user),
      isActive,
      q,
      order,
      limit: size,
      offset,
    });
    return {
      data: rows.map(dto.shapeDepartment),
      pagination: buildOffsetPaginationMeta({ page, size, totalCount: count }),
    };
  },

  async get(user, id) {
    const row = await departmentRepository.findById(tenantIdOf(user), id);
    if (!row) throw ApiError.notFound('DEPARTMENT_NOT_FOUND', 'Department not found.');
    return dto.shapeDepartment(row);
  },

  async create(user, payload) {
    const tenantId = tenantIdOf(user);
    const existing = await departmentRepository.findByCode(tenantId, payload.code);
    if (existing) {
      throw new ApiError({
        statusCode: 409,
        category: 'business',
        code: 'DEPARTMENT_CODE_ALREADY_EXISTS',
        message: 'This department code is already in use.',
      });
    }

    const row = await departmentRepository.create({
      tenantId,
      code: payload.code,
      name: payload.name,
      isActive: true,
      createdBy: user.id,
    });
    await audit(user, 'DEPARTMENT_CREATED', 'department', row.id, { code: row.code, name: row.name });
    return dto.shapeDepartment(row);
  },

  async update(user, id, payload) {
    const row = await departmentRepository.findById(tenantIdOf(user), id);
    if (!row) throw ApiError.notFound('DEPARTMENT_NOT_FOUND', 'Department not found.');

    const data = { updatedBy: user.id };
    if (payload.name !== undefined) data.name = payload.name;
    if (payload.isActive !== undefined) data.isActive = payload.isActive;
    await departmentRepository.update(row, data);
    await audit(user, 'DEPARTMENT_UPDATED', 'department', row.id, data);
    return dto.shapeDepartment(row);
  },

  async remove(user, id) {
    const row = await departmentRepository.findById(tenantIdOf(user), id);
    if (!row) throw ApiError.notFound('DEPARTMENT_NOT_FOUND', 'Department not found.');
    // Deactivation only (docs/06-Administration-APIs.md §6.1.5): historical
    // complaints keep referencing this row regardless of isActive.
    await departmentRepository.update(row, { isActive: false, updatedBy: user.id });
    await audit(user, 'DEPARTMENT_DEACTIVATED', 'department', row.id, null);
  },
};

// =============================================================================
// 6.2 Category Management
// =============================================================================
const categoryService = {
  async list(user, { departmentId, isActive, q, order, page, size, offset }) {
    const { rows, count } = await categoryRepository.list({
      tenantId: tenantIdOf(user),
      departmentId,
      isActive,
      q,
      order,
      limit: size,
      offset,
    });
    return {
      data: rows.map(dto.shapeCategory),
      pagination: buildOffsetPaginationMeta({ page, size, totalCount: count }),
    };
  },

  async get(user, id) {
    const row = await categoryRepository.findById(tenantIdOf(user), id);
    if (!row) throw ApiError.notFound('CATEGORY_NOT_FOUND', 'Complaint category not found.');
    return dto.shapeCategory(row);
  },

  async create(user, payload) {
    const tenantId = tenantIdOf(user);
    const callerDepartmentId = await resolveCallerDepartmentId(user);
    assertDepartmentScope(user, callerDepartmentId, payload.departmentId);

    const department = await findActiveDepartment(tenantId, payload.departmentId);
    if (!department) throw ApiError.notFound('DEPARTMENT_NOT_FOUND', 'Department not found or inactive.');

    const dupe = await categoryRepository.findByNameInDepartment(tenantId, payload.departmentId, payload.name);
    if (dupe) {
      throw new ApiError({
        statusCode: 409,
        category: 'business',
        code: 'CATEGORY_NAME_ALREADY_EXISTS',
        message: 'A category with this name already exists in this department.',
      });
    }

    const row = await categoryRepository.create({
      tenantId,
      departmentId: payload.departmentId,
      name: payload.name,
      defaultPriority: dto.priorityToInt(payload.defaultPriority),
      isActive: true,
      createdBy: user.id,
    });
    await audit(user, 'CATEGORY_CREATED', 'complaint_category', row.id, { name: row.name });
    return dto.shapeCategory(row);
  },

  async update(user, id, payload) {
    const tenantId = tenantIdOf(user);
    const row = await categoryRepository.findById(tenantId, id);
    if (!row) throw ApiError.notFound('CATEGORY_NOT_FOUND', 'Complaint category not found.');

    const callerDepartmentId = await resolveCallerDepartmentId(user);
    assertDepartmentScope(user, callerDepartmentId, row.departmentId);

    if (payload.name !== undefined && payload.name !== row.name) {
      const dupe = await categoryRepository.findByNameInDepartment(tenantId, row.departmentId, payload.name);
      if (dupe) {
        throw new ApiError({
          statusCode: 409,
          category: 'business',
          code: 'CATEGORY_NAME_ALREADY_EXISTS',
          message: 'A category with this name already exists in this department.',
        });
      }
    }

    const data = { updatedBy: user.id };
    if (payload.name !== undefined) data.name = payload.name;
    if (payload.defaultPriority !== undefined) data.defaultPriority = dto.priorityToInt(payload.defaultPriority);
    if (payload.isActive !== undefined) data.isActive = payload.isActive;
    await categoryRepository.update(row, data);
    await audit(user, 'CATEGORY_UPDATED', 'complaint_category', row.id, data);
    return dto.shapeCategory(row);
  },

  async remove(user, id) {
    const row = await categoryRepository.findById(tenantIdOf(user), id);
    if (!row) throw ApiError.notFound('CATEGORY_NOT_FOUND', 'Complaint category not found.');
    const callerDepartmentId = await resolveCallerDepartmentId(user);
    assertDepartmentScope(user, callerDepartmentId, row.departmentId);

    await categoryRepository.update(row, { isActive: false, updatedBy: user.id });
    await audit(user, 'CATEGORY_DEACTIVATED', 'complaint_category', row.id, null);
  },
};

// =============================================================================
// 6.3 User Management
// =============================================================================
function assertGrantableUserType(callerUserType, targetUserType) {
  const allowed = policy.GRANTABLE_USER_TYPES[callerUserType] || [];
  if (!allowed.includes(targetUserType)) {
    throw ApiError.forbidden('FORBIDDEN', 'You are not permitted to provision this account type.');
  }
}

async function assertGrantableRoles(user, roleIds) {
  const allowedNames = policy.GRANTABLE_SYSTEM_ROLES[user.userType] || [];
  const roles = await Promise.all(roleIds.map((id) => roleRepository.findById(tenantIdOf(user), id)));
  roles.forEach((role, index) => {
    if (!role) {
      throw ApiError.validation('Request failed validation', [
        { field: 'roleIds', issue: 'ROLE_NOT_FOUND', message: `roleIds[${index}] does not exist.` },
      ]);
    }
    if (!allowedNames.includes(role.name)) {
      throw ApiError.forbidden('FORBIDDEN', 'You are not permitted to grant one or more of the requested roles.');
    }
  });
  return roles;
}

const userService = {
  async list(user, { userType, departmentId, isActive, page, size, offset }) {
    const tenantId = tenantIdOf(user);
    let effectiveDepartmentId = departmentId;
    if (user.userType === 'department_admin') {
      effectiveDepartmentId = await resolveCallerDepartmentId(user);
    }
    const { rows, count } = await userRepository.list({
      tenantId,
      userType,
      departmentId: effectiveDepartmentId,
      isActive,
      size,
      offset,
    });
    const data = await Promise.all(
      rows.map(async (row) =>
        dto.shapeUserListItem(row, row.staffProfile || (await userRepository.getStaffProfile(row.id))),
      ),
    );
    return { data, pagination: buildOffsetPaginationMeta({ page, size, totalCount: count }) };
  },

  async get(user, id) {
    const tenantId = tenantIdOf(user);
    const row = await userRepository.findByIdWithProfile(tenantId, id);
    if (!row || row.userType === 'citizen') throw ApiError.notFound('USER_NOT_FOUND', 'User not found.');

    const callerDepartmentId = await resolveCallerDepartmentId(user);
    if (user.userType === 'department_admin' && Number(callerDepartmentId) !== Number(row.staffProfile?.departmentId)) {
      throw ApiError.forbidden();
    }

    const assignments = await userRepository.getRoleAssignments(row.id);
    return dto.shapeUser(row, {
      staffProfile: row.staffProfile,
      roleNames: assignments.map((a) => a.role?.name).filter(Boolean),
    });
  },

  async create(user, payload) {
    assertGrantableUserType(user.userType, payload.userType);
    const tenantId = tenantIdOf(user);

    let departmentId = payload.departmentId ?? null;
    if (user.userType === 'department_admin') {
      departmentId = await resolveCallerDepartmentId(user);
    } else if (departmentId) {
      const department = await findActiveDepartment(tenantId, departmentId);
      if (!department) throw ApiError.notFound('DEPARTMENT_NOT_FOUND', 'Department not found or inactive.');
    }

    if (payload.hierarchyLevelId) {
      const level = await findActiveHierarchyLevel(tenantId, payload.hierarchyLevelId);
      if (!level) throw ApiError.notFound('HIERARCHY_LEVEL_NOT_FOUND', 'Officer hierarchy level not found.');
    }

    const existing = await userRepository.findByUsername(payload.username);
    if (existing) {
      throw new ApiError({
        statusCode: 409,
        category: 'business',
        code: 'USERNAME_ALREADY_EXISTS',
        message: 'This username is already in use.',
      });
    }

    const roles = await assertGrantableRoles(user, payload.roleIds);

    const initialPassword = payload.initialPassword || crypto.randomBytes(12).toString('base64url');
    if (!payload.initialPassword && !env.isProduction) {
      logger.debug(
        'Generated initial password for new staff account (dev-mode stub — no invite-email provider wired up yet)',
        { username: payload.username, initialPassword },
      );
    }
    const passwordHash = await hashPassword(initialPassword);
    const employeeId = `EMP-${crypto.randomBytes(4).toString('hex')}`;

    const t = await userRepository.transaction();
    try {
      const created = await userRepository.createStaffUser(
        {
          tenantId,
          username: payload.username,
          email: payload.email,
          userType: payload.userType,
          passwordHash,
          departmentId,
          hierarchyLevelId: payload.hierarchyLevelId,
          employeeId,
          createdBy: user.id,
        },
        t,
      );
      await userRepository.replaceRoleAssignments(
        created.id,
        roles.map((r) => r.id),
        'department',
        t,
      );
      await t.commit();
      await audit(user, 'USER_CREATED', 'user', created.id, { username: created.username, userType: created.userType });
      return {
        id: String(created.id),
        username: created.username,
        userType: created.userType,
        employeeId,
        createdAt: created.createdAt,
      };
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async update(user, id, payload) {
    const tenantId = tenantIdOf(user);
    const target = await userRepository.findByIdWithProfile(tenantId, id);
    if (!target || target.userType === 'citizen') throw ApiError.notFound('USER_NOT_FOUND', 'User not found.');

    const callerDepartmentId = await resolveCallerDepartmentId(user);
    if (
      user.userType === 'department_admin' &&
      Number(callerDepartmentId) !== Number(target.staffProfile?.departmentId)
    ) {
      throw ApiError.forbidden();
    }

    let roles;
    if (payload.roleIds !== undefined) {
      roles = await assertGrantableRoles(user, payload.roleIds);
    }

    if (
      payload.departmentId !== undefined &&
      user.userType === 'department_admin' &&
      Number(payload.departmentId) !== Number(callerDepartmentId)
    ) {
      throw ApiError.forbidden();
    }
    if (payload.hierarchyLevelId !== undefined) {
      const level = await findActiveHierarchyLevel(tenantId, payload.hierarchyLevelId);
      if (!level) throw ApiError.notFound('HIERARCHY_LEVEL_NOT_FOUND', 'Officer hierarchy level not found.');
    }

    const userFields = { updatedBy: user.id };
    if (payload.email !== undefined) userFields.email = payload.email;
    if (payload.isActive !== undefined) userFields.status = payload.isActive ? 'active' : 'inactive';

    const staffFields = { updatedBy: user.id };
    if (payload.departmentId !== undefined) staffFields.departmentId = payload.departmentId;
    if (payload.hierarchyLevelId !== undefined) staffFields.hierarchyLevelId = payload.hierarchyLevelId;

    const t = await userRepository.transaction();
    try {
      await userRepository.updateStaffUser(target, target.staffProfile, { userFields, staffFields }, t);
      if (roles) {
        await userRepository.replaceRoleAssignments(
          target.id,
          roles.map((r) => r.id),
          'department',
          t,
        );
      }
      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }

    if (payload.isActive === false) {
      await tokenService.revokeAllUserSessions(target.id);
    }

    await audit(user, 'USER_UPDATED', 'user', target.id, { ...userFields, ...staffFields });
    return userService.get(user, id);
  },

  async remove(user, id) {
    const tenantId = tenantIdOf(user);
    const target = await userRepository.findByIdWithProfile(tenantId, id);
    if (!target || target.userType === 'citizen') throw ApiError.notFound('USER_NOT_FOUND', 'User not found.');

    const callerDepartmentId = await resolveCallerDepartmentId(user);
    if (
      user.userType === 'department_admin' &&
      Number(callerDepartmentId) !== Number(target.staffProfile?.departmentId)
    ) {
      throw ApiError.forbidden();
    }

    await target.update({ status: 'inactive', updatedBy: user.id });
    await tokenService.revokeAllUserSessions(target.id);
    await audit(user, 'USER_DEACTIVATED', 'user', target.id, null);
  },
};

// =============================================================================
// 6.4 Role Management
// =============================================================================
const roleService = {
  async list(user, { isSystemRole, page, size, offset }) {
    const { rows, count } = await roleRepository.list({
      tenantId: tenantIdOf(user),
      isSystemRole,
      limit: size,
      offset,
    });
    const data = await Promise.all(
      rows.map(async (row) => dto.shapeRole(row, { permissionCount: await roleRepository.countPermissions(row.id) })),
    );
    return { data, pagination: buildOffsetPaginationMeta({ page, size, totalCount: count }) };
  },

  async get(user, id) {
    const row = await roleRepository.findById(tenantIdOf(user), id);
    if (!row) throw ApiError.notFound('ROLE_NOT_FOUND', 'Role not found.');
    const permissions = await roleRepository.getPermissions(row.id);
    return dto.shapeRole(row, { permissions });
  },

  async create(user, payload) {
    const tenantId = tenantIdOf(user);
    const existing = await roleRepository.findByName(tenantId, payload.name);
    if (existing) {
      throw new ApiError({
        statusCode: 409,
        category: 'business',
        code: 'ROLE_NAME_ALREADY_EXISTS',
        message: 'A role with this name already exists.',
      });
    }

    const permissions = await permissionRepository.findAllByIds(payload.permissionIds);
    if (permissions.length !== payload.permissionIds.length) {
      throw ApiError.validation('Request failed validation', [
        { field: 'permissionIds', issue: 'PERMISSION_NOT_FOUND', message: 'One or more permissionIds do not exist.' },
      ]);
    }

    const row = await roleRepository.create({ tenantId, name: payload.name, isSystemRole: false, createdBy: user.id });
    await roleRepository.replacePermissions(row.id, payload.permissionIds);
    await audit(user, 'ROLE_CREATED', 'role', row.id, { name: row.name });
    return roleService.get(user, row.id);
  },

  async update(user, id, payload) {
    const tenantId = tenantIdOf(user);
    const row = await roleRepository.findById(tenantId, id);
    if (!row) throw ApiError.notFound('ROLE_NOT_FOUND', 'Role not found.');
    if (row.isSystemRole) throw ApiError.forbidden('FORBIDDEN', 'System roles cannot be edited.');

    if (payload.name !== undefined && payload.name !== row.name) {
      const dupe = await roleRepository.findByName(tenantId, payload.name);
      if (dupe) {
        throw new ApiError({
          statusCode: 409,
          category: 'business',
          code: 'ROLE_NAME_ALREADY_EXISTS',
          message: 'A role with this name already exists.',
        });
      }
    }
    if (payload.permissionIds !== undefined) {
      const permissions = await permissionRepository.findAllByIds(payload.permissionIds);
      if (permissions.length !== payload.permissionIds.length) {
        throw ApiError.validation('Request failed validation', [
          { field: 'permissionIds', issue: 'PERMISSION_NOT_FOUND', message: 'One or more permissionIds do not exist.' },
        ]);
      }
      await roleRepository.replacePermissions(row.id, payload.permissionIds);
    }

    const data = { updatedBy: user.id };
    if (payload.name !== undefined) data.name = payload.name;
    await roleRepository.update(row, data);
    await audit(user, 'ROLE_UPDATED', 'role', row.id, data);
    return roleService.get(user, id);
  },

  async remove(user, id) {
    const row = await roleRepository.findById(tenantIdOf(user), id);
    if (!row) throw ApiError.notFound('ROLE_NOT_FOUND', 'Role not found.');
    if (row.isSystemRole) throw ApiError.forbidden('FORBIDDEN', 'System roles cannot be deactivated.');
    await row.destroy();
    await audit(user, 'ROLE_DEACTIVATED', 'role', row.id, null);
  },
};

// =============================================================================
// 6.5 Permission Management (read-only catalog)
// =============================================================================
const permissionService = {
  async list(resource) {
    const rows = await permissionRepository.list({ resource });
    return { data: rows.map(dto.shapePermission) };
  },
  async get(id) {
    const row = await permissionRepository.findById(id);
    if (!row) throw ApiError.notFound('PERMISSION_NOT_FOUND', 'Permission not found.');
    return dto.shapePermission(row);
  },
};

// =============================================================================
// 6.6-6.8 Versioned configuration (Approval Workflow / SLA / Escalation)
// =============================================================================
function buildVersionedConfigService({
  repository,
  shape,
  notFoundCode,
  buildCreateData,
  buildVersionData,
  entityLabel,
}) {
  const eventPrefix = entityLabel.toUpperCase();

  return {
    async list(user, { filters, order, page, size, offset }) {
      const { rows, count } = await repository.list({
        tenantId: tenantIdOf(user),
        filters,
        order,
        limit: size,
        offset,
      });
      return { data: rows.map(shape), pagination: buildOffsetPaginationMeta({ page, size, totalCount: count }) };
    },

    async get(user, id) {
      const row = await repository.findById(tenantIdOf(user), id);
      if (!row) throw ApiError.notFound(notFoundCode, `${entityLabel} not found.`);
      return shape(row);
    },

    async create(user, payload) {
      const data = await buildCreateData(user, payload);
      const row = await repository.create({ ...data, tenantId: tenantIdOf(user), version: 1, createdBy: user.id });
      await audit(user, `${eventPrefix}_CREATED`, entityLabel, row.id, null);
      return shape(row);
    },

    async update(user, id, payload) {
      const current = await repository.findById(tenantIdOf(user), id);
      if (!current) throw ApiError.notFound(notFoundCode, `${entityLabel} not found.`);

      const nextData = await buildVersionData(user, current, payload);
      const t = await repository.transaction();
      let next;
      try {
        next = await repository.closeAndCreateNextVersion(
          current,
          { ...nextData, tenantId: tenantIdOf(user), createdBy: user.id },
          t,
        );
        await t.commit();
      } catch (err) {
        await t.rollback();
        throw err;
      }
      await audit(user, `${eventPrefix}_VERSIONED`, entityLabel, next.id, {
        previousId: current.id,
        version: next.version,
      });
      return shape(next);
    },

    async remove(user, id) {
      const row = await repository.findById(tenantIdOf(user), id);
      if (!row) throw ApiError.notFound(notFoundCode, `${entityLabel} not found.`);
      await repository.destroy(row);
      await audit(user, `${eventPrefix}_DEACTIVATED`, entityLabel, row.id, null);
    },
  };
}

const approvalWorkflowService = buildVersionedConfigService({
  repository: approvalWorkflowRepository,
  shape: dto.shapeApprovalWorkflow,
  notFoundCode: 'WORKFLOW_CONFIG_NOT_FOUND',
  entityLabel: 'approval_workflow_config',
  async buildCreateData(user, payload) {
    const category = await findActiveCategory(tenantIdOf(user), payload.categoryId);
    if (!category) throw ApiError.notFound('CATEGORY_NOT_FOUND', 'Complaint category not found.');
    const level = await findActiveHierarchyLevel(tenantIdOf(user), payload.requiredLevelId);
    if (!level) throw ApiError.notFound('HIERARCHY_LEVEL_NOT_FOUND', 'Officer hierarchy level not found.');
    return {
      categoryId: payload.categoryId,
      requiredLevelId: payload.requiredLevelId,
      effectiveFrom: payload.effectiveFrom,
    };
  },
  async buildVersionData(user, current, payload) {
    const level = await findActiveHierarchyLevel(tenantIdOf(user), payload.requiredLevelId);
    if (!level) throw ApiError.notFound('HIERARCHY_LEVEL_NOT_FOUND', 'Officer hierarchy level not found.');
    return {
      categoryId: current.categoryId,
      requiredLevelId: payload.requiredLevelId,
      effectiveFrom: payload.effectiveFrom,
    };
  },
});

const slaRuleService = buildVersionedConfigService({
  repository: slaRuleRepository,
  shape: dto.shapeSlaRule,
  notFoundCode: 'SLA_RULE_NOT_FOUND',
  entityLabel: 'sla_rule_config',
  async buildCreateData(user, payload) {
    const department = await findActiveDepartment(tenantIdOf(user), payload.departmentId);
    const category = await findActiveCategory(tenantIdOf(user), payload.categoryId);
    if (!department || !category) {
      throw ApiError.notFound('DEPARTMENT_OR_CATEGORY_NOT_FOUND', 'Department or category not found.');
    }
    return {
      departmentId: payload.departmentId,
      categoryId: payload.categoryId,
      priority: dto.priorityToInt(payload.priority),
      resolutionHours: payload.resolutionHours,
      effectiveFrom: payload.effectiveFrom,
    };
  },
  async buildVersionData(user, current, payload) {
    return {
      departmentId: current.departmentId,
      categoryId: current.categoryId,
      priority: current.priority,
      resolutionHours: payload.resolutionHours,
      effectiveFrom: payload.effectiveFrom,
    };
  },
});

const escalationRuleService = buildVersionedConfigService({
  repository: escalationRuleRepository,
  shape: dto.shapeEscalationRule,
  notFoundCode: 'ESCALATION_RULE_NOT_FOUND',
  entityLabel: 'escalation_matrix_config',
  async buildCreateData(user, payload) {
    const department = await findActiveDepartment(tenantIdOf(user), payload.departmentId);
    if (!department) throw ApiError.notFound('DEPARTMENT_NOT_FOUND', 'Department not found or inactive.');
    const [fromLevel, toLevel] = await Promise.all([
      findActiveHierarchyLevel(tenantIdOf(user), payload.fromLevelId),
      findActiveHierarchyLevel(tenantIdOf(user), payload.toLevelId),
    ]);
    if (!fromLevel || !toLevel)
      throw ApiError.notFound('HIERARCHY_LEVEL_NOT_FOUND', 'Officer hierarchy level not found.');
    if (toLevel.levelOrder <= fromLevel.levelOrder) {
      throw new ApiError({
        statusCode: 422,
        category: 'business',
        code: 'INVALID_LEVEL_ORDER',
        message: 'toLevelId must be a higher hierarchy level than fromLevelId.',
      });
    }
    return {
      departmentId: payload.departmentId,
      fromLevelId: payload.fromLevelId,
      toLevelId: payload.toLevelId,
      triggerCondition: payload.triggerCondition,
      escalateAfterHours: payload.escalateAfterHours,
      effectiveFrom: new Date(),
    };
  },
  async buildVersionData(user, current, payload) {
    const toLevelId = payload.toLevelId ?? current.toLevelId;
    if (payload.toLevelId !== undefined) {
      const [fromLevel, toLevel] = await Promise.all([
        OfficerHierarchyLevel.findByPk(current.fromLevelId),
        findActiveHierarchyLevel(tenantIdOf(user), payload.toLevelId),
      ]);
      if (!toLevel) throw ApiError.notFound('HIERARCHY_LEVEL_NOT_FOUND', 'Officer hierarchy level not found.');
      if (toLevel.levelOrder <= fromLevel.levelOrder) {
        throw new ApiError({
          statusCode: 422,
          category: 'business',
          code: 'INVALID_LEVEL_ORDER',
          message: 'toLevelId must be a higher hierarchy level than fromLevelId.',
        });
      }
    }
    return {
      departmentId: current.departmentId,
      fromLevelId: current.fromLevelId,
      toLevelId,
      triggerCondition: current.triggerCondition,
      escalateAfterHours: payload.escalateAfterHours ?? current.escalateAfterHours,
      effectiveFrom: new Date(),
    };
  },
});

// =============================================================================
// 6.9 Tenant Configuration (singleton; PATCH not persistable — see admin.dto.js)
// =============================================================================
const tenantConfigService = {
  async get(user) {
    const tenant = await findTenantById(tenantIdOf(user));
    if (!tenant) throw ApiError.internal('Tenant record missing for the caller.');
    return dto.shapeTenantConfig(tenant, env);
  },

  // docs/06-Administration-APIs.md §6.9.2 documents defaultLanguage /
  // sessionTimeouts / passwordPolicy / reopenWindowDays as settable, but
  // DATABASE_DESIGN.md §5's `tenant` entity has no columns to persist any
  // of them to (only code/name/tenant_type/state/status exist). Persisting
  // these would require a schema addition never approved for v1.0 — so
  // this responds 501 NOT_ENABLED rather than silently discarding the
  // caller's change or inventing storage.
  // TODO(pending v1.1 schema or a dedicated tenant-settings table):
  // revisit once that storage is approved.
  async update() {
    throw new ApiError({
      statusCode: 501,
      category: 'business',
      code: 'NOT_ENABLED',
      message:
        'Tenant-level configuration overrides are not yet persistable — DATABASE_DESIGN.md §5 has no columns for them.',
    });
  },
};

// =============================================================================
// 6.10 Feature Flags
// =============================================================================
const featureFlagService = {
  async list(user) {
    const rows = await featureFlagRepository.list(tenantIdOf(user));
    return { data: rows.map(dto.shapeFeatureFlag) };
  },
  async toggle(user, flagKey, isEnabled) {
    const row = await featureFlagRepository.findByKey(tenantIdOf(user), flagKey);
    if (!row) throw ApiError.notFound('FLAG_NOT_FOUND', 'This feature flag is not recognized for this tenant.');
    await row.update({ isEnabled, updatedBy: user.id });
    await audit(user, 'FEATURE_FLAG_TOGGLED', 'feature_flag_config', row.id, { flagKey, isEnabled });
    return dto.shapeFeatureFlag(row);
  },
};

// =============================================================================
// 6.11 Provider Configuration
// =============================================================================
const SUPPORTED_PROVIDERS = {
  ai: ['claude'],
  voice: ['whisper'],
  sms: ['dlt_sms_gateway'],
  whatsapp: ['whatsapp_business_platform'],
  email: ['smtp_relay'],
  maps: ['google_maps', 'openstreetmap'],
};
// Secrets must be a reference, never a raw credential (INFRASTRUCTURE_DEVOPS.md
// §7) — a pattern check against common raw-credential shapes (long base64/hex
// blobs, "sk-"-style API key prefixes) rather than a naive length check.
const RAW_SECRET_PATTERN = /^(sk-|AKIA|[A-Za-z0-9+/]{40,}={0,2}$|[0-9a-f]{32,}$)/i;

const providerService = {
  async list(user, providerType) {
    const rows = await providerRepository.list(tenantIdOf(user), providerType);
    return { data: rows.map(dto.shapeProvider) };
  },

  async setActive(user, providerType, payload) {
    const supported = SUPPORTED_PROVIDERS[providerType];
    if (!supported) {
      throw new ApiError({
        statusCode: 422,
        category: 'business',
        code: 'UNSUPPORTED_PROVIDER',
        message: `providerType "${providerType}" is not recognized.`,
      });
    }
    if (!supported.includes(payload.providerName)) {
      throw new ApiError({
        statusCode: 422,
        category: 'business',
        code: 'UNSUPPORTED_PROVIDER',
        message: `providerName must be one of: ${supported.join(', ')}.`,
      });
    }
    if (RAW_SECRET_PATTERN.test(payload.secretReference)) {
      throw ApiError.validation('Request failed validation', [
        {
          field: 'secretReference',
          issue: 'LOOKS_LIKE_RAW_SECRET',
          message: 'secretReference must be a secrets-manager reference, not a raw credential.',
        },
      ]);
    }

    const tenantId = tenantIdOf(user);
    let row = await providerRepository.findByType(tenantId, providerType);
    if (row) {
      await providerRepository.update(row, {
        providerName: payload.providerName,
        secretReference: payload.secretReference,
        isActive: true,
        updatedBy: user.id,
      });
    } else {
      row = await providerRepository.create({
        tenantId,
        providerType,
        providerName: payload.providerName,
        secretReference: payload.secretReference,
        isActive: true,
        createdBy: user.id,
      });
    }
    await audit(user, 'PROVIDER_CONFIG_SET', 'provider_config', row.id, {
      providerType,
      providerName: payload.providerName,
    });
    return dto.shapeProvider(row);
  },
};

module.exports = {
  tenantIdOf,
  resolveCallerDepartmentId,
  departmentService,
  categoryService,
  userService,
  roleService,
  permissionService,
  approvalWorkflowService,
  slaRuleService,
  escalationRuleService,
  tenantConfigService,
  featureFlagService,
  providerService,
  SUPPORTED_PROVIDERS,
};
