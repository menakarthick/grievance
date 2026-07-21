'use strict';

const { Role, UserRoleAssignment } = require('../models');

function findByName(tenantId, name) {
  return Role.findOne({ where: { name, tenantId: tenantId ?? null } });
}

function findSystemRoleByName(name) {
  return Role.findOne({ where: { name, tenantId: null, isSystemRole: true } });
}

function getAssignmentsForUser(userId) {
  return UserRoleAssignment.findAll({ where: { userId }, include: [{ association: 'role' }] });
}

function assignRole({ userId, roleId, scopeType, scopeId }) {
  return UserRoleAssignment.create({ userId, roleId, scopeType, scopeId: scopeId ?? null });
}

module.exports = { findByName, findSystemRoleByName, getAssignmentsForUser, assignRole };
