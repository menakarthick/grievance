'use strict';

const { Op } = require('sequelize');
const {
  sequelize,
  Department,
  ComplaintCategory,
  User,
  StaffProfile,
  UserRoleAssignment,
  Role,
  Permission,
  RolePermission,
  ApprovalWorkflowConfig,
  SlaRuleConfig,
  EscalationMatrixConfig,
  Tenant,
  FeatureFlagConfig,
  ProviderConfig,
  OfficerHierarchyLevel,
} = require('../models');

// --- Department (§6.1) -------------------------------------------------------
const departmentRepository = {
  list({ tenantId, isActive, q, order, limit, offset }) {
    const where = { tenantId };
    if (isActive !== undefined) where.isActive = isActive;
    if (q) where.name = { [Op.like]: `%${q}%` };
    return Department.findAndCountAll({ where, order, limit, offset });
  },
  findById(tenantId, id) {
    return Department.findOne({ where: { id, tenantId } });
  },
  findByCode(tenantId, code) {
    return Department.findOne({ where: { tenantId, code } });
  },
  create(data) {
    return Department.create(data);
  },
  update(instance, data) {
    return instance.update(data);
  },
};

// --- Category (§6.2) ---------------------------------------------------------
const categoryRepository = {
  list({ tenantId, departmentId, isActive, q, order, limit, offset }) {
    const where = { tenantId };
    if (departmentId !== undefined) where.departmentId = departmentId;
    if (isActive !== undefined) where.isActive = isActive;
    if (q) where.name = { [Op.like]: `%${q}%` };
    return ComplaintCategory.findAndCountAll({ where, order, limit, offset });
  },
  findById(tenantId, id) {
    return ComplaintCategory.findOne({ where: { id, tenantId } });
  },
  findByNameInDepartment(tenantId, departmentId, name) {
    return ComplaintCategory.findOne({ where: { tenantId, departmentId, name } });
  },
  create(data) {
    return ComplaintCategory.create(data);
  },
  update(instance, data) {
    return instance.update(data);
  },
};

// --- Shared lookups (used by Category/SLA/Escalation/ApprovalWorkflow) -----
function findActiveDepartment(tenantId, id) {
  return Department.findOne({ where: { id, tenantId, isActive: true } });
}

function findActiveCategory(tenantId, id) {
  return ComplaintCategory.findOne({ where: { id, tenantId, isActive: true } });
}

function findActiveHierarchyLevel(tenantId, id) {
  return OfficerHierarchyLevel.findOne({ where: { id, tenantId } });
}

// --- User (§6.3) ---------------------------------------------------------------
const userRepository = {
  list({ tenantId, userType, departmentId, isActive, size, offset }) {
    const where = { tenantId, userType: { [Op.ne]: 'citizen' } };
    if (userType) where.userType = userType;
    if (isActive !== undefined) where.status = isActive ? 'active' : { [Op.ne]: 'active' };

    const include = [{ association: 'staffProfile', required: departmentId !== undefined }];
    if (departmentId !== undefined) {
      include[0].where = { departmentId };
    }

    return User.findAndCountAll({ where, include, limit: size, offset, order: [['createdAt', 'DESC']] });
  },
  findById(tenantId, id) {
    return User.findOne({ where: { id, tenantId } });
  },
  findByIdWithProfile(tenantId, id) {
    return User.findOne({ where: { id, tenantId }, include: ['staffProfile'] });
  },
  findByUsername(username) {
    return User.findOne({ where: { username } });
  },
  getStaffProfile(userId) {
    return StaffProfile.findOne({ where: { userId } });
  },
  async createStaffUser(
    { tenantId, username, email, userType, passwordHash, departmentId, hierarchyLevelId, employeeId, createdBy },
    transaction,
  ) {
    const user = await User.create(
      { tenantId, username, email, userType, passwordHash, status: 'active', createdBy },
      { transaction },
    );
    await StaffProfile.create(
      {
        userId: user.id,
        departmentId: departmentId ?? null,
        hierarchyLevelId: hierarchyLevelId ?? null,
        employeeId,
        createdBy,
      },
      { transaction },
    );
    return user;
  },
  async updateStaffUser(user, staffProfile, { userFields, staffFields }, transaction) {
    if (Object.keys(userFields).length > 0) await user.update(userFields, { transaction });
    if (staffProfile && Object.keys(staffFields).length > 0) await staffProfile.update(staffFields, { transaction });
  },
  getRoleAssignments(userId) {
    return UserRoleAssignment.findAll({ where: { userId }, include: ['role'] });
  },
  async replaceRoleAssignments(userId, roleIds, scopeType, transaction) {
    await UserRoleAssignment.destroy({ where: { userId }, transaction });
    if (roleIds.length > 0) {
      await UserRoleAssignment.bulkCreate(
        roleIds.map((roleId) => ({ userId, roleId, scopeType, scopeId: null })),
        { transaction },
      );
    }
  },
  transaction() {
    return sequelize.transaction();
  },
};

// --- Role (§6.4) -----------------------------------------------------------------
const roleRepository = {
  list({ tenantId, isSystemRole, limit, offset }) {
    const where = { [Op.or]: [{ tenantId }, { tenantId: null, isSystemRole: true }] };
    if (isSystemRole !== undefined) where.isSystemRole = isSystemRole;
    return Role.findAndCountAll({ where, limit, offset, order: [['name', 'ASC']] });
  },
  findById(tenantId, id) {
    return Role.findOne({ where: { id, [Op.or]: [{ tenantId }, { tenantId: null }] } });
  },
  findByName(tenantId, name) {
    return Role.findOne({ where: { tenantId, name } });
  },
  create(data) {
    return Role.create(data);
  },
  update(instance, data) {
    return instance.update(data);
  },
  countPermissions(roleId) {
    return RolePermission.count({ where: { roleId } });
  },
  getPermissions(roleId) {
    return RolePermission.findAll({ where: { roleId }, include: ['permission'] }).then((rows) =>
      rows.map((r) => r.permission),
    );
  },
  async replacePermissions(roleId, permissionIds) {
    await RolePermission.destroy({ where: { roleId } });
    if (permissionIds.length > 0) {
      await RolePermission.bulkCreate(permissionIds.map((permissionId) => ({ roleId, permissionId })));
    }
  },
  countActiveAssignments(roleId) {
    return UserRoleAssignment.count({ where: { roleId } });
  },
};

// --- Permission (§6.5, read-only) ----------------------------------------------
const permissionRepository = {
  list({ resource }) {
    const where = {};
    if (resource) where.resource = resource;
    return Permission.findAll({
      where,
      order: [
        ['resource', 'ASC'],
        ['action', 'ASC'],
      ],
    });
  },
  findById(id) {
    return Permission.findOne({ where: { id } });
  },
  findAllByIds(ids) {
    return Permission.findAll({ where: { id: ids } });
  },
};

// --- Versioned config repositories (§6.6-6.8): SLA / Escalation / Approval --
function buildVersionedConfigRepository(Model, { extraFilters = [] } = {}) {
  return {
    list({ tenantId, filters, order, limit, offset }) {
      const where = { tenantId };
      for (const field of extraFilters) {
        if (filters[field] !== undefined) where[field] = filters[field];
      }
      return Model.findAndCountAll({ where, order, limit, offset });
    },
    findById(tenantId, id) {
      return Model.findOne({ where: { id, tenantId } });
    },
    create(data) {
      return Model.create(data);
    },
    async closeAndCreateNextVersion(current, nextData, transaction) {
      await current.update({ effectiveTo: nextData.effectiveFrom }, { transaction });
      return Model.create({ ...nextData, version: current.version + 1 }, { transaction });
    },
    destroy(instance) {
      return instance.destroy();
    },
    transaction() {
      return sequelize.transaction();
    },
  };
}

const approvalWorkflowRepository = buildVersionedConfigRepository(ApprovalWorkflowConfig, {
  extraFilters: ['categoryId'],
});
const slaRuleRepository = buildVersionedConfigRepository(SlaRuleConfig, {
  extraFilters: ['departmentId', 'categoryId', 'priority'],
});
const escalationRuleRepository = buildVersionedConfigRepository(EscalationMatrixConfig, {
  extraFilters: ['departmentId'],
});

// --- Tenant Config (§6.9, singleton) --------------------------------------------
function findTenantById(tenantId) {
  return Tenant.findByPk(tenantId);
}

// --- Feature Flags (§6.10) ------------------------------------------------------
const featureFlagRepository = {
  list(tenantId) {
    return FeatureFlagConfig.findAll({ where: { tenantId }, order: [['flagKey', 'ASC']] });
  },
  findByKey(tenantId, flagKey) {
    return FeatureFlagConfig.findOne({ where: { tenantId, flagKey } });
  },
};

// --- Providers (§6.11) -----------------------------------------------------------
const providerRepository = {
  list(tenantId, providerType) {
    const where = { tenantId };
    if (providerType) where.providerType = providerType;
    return ProviderConfig.findAll({ where, order: [['providerType', 'ASC']] });
  },
  findByType(tenantId, providerType) {
    return ProviderConfig.findOne({ where: { tenantId, providerType } });
  },
  create(data) {
    return ProviderConfig.create(data);
  },
  update(instance, data) {
    return instance.update(data);
  },
};

module.exports = {
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
};
