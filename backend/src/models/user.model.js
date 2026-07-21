'use strict';

const { Op } = require('sequelize');
const { ID_TYPE, idColumn, auditColumns, deletedByColumn, baseOptions } = require('../database/helpers');
const { USER_TYPES } = require('../database/constants');

module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define(
    'User',
    {
      ...idColumn(ID_TYPE.INTEGER),
      tenantId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        comment: 'FK to tenant.id; null for a cross-tenant Super Administrator (Section 3, 5).',
      },
      externalUuid: {
        type: DataTypes.UUID,
        allowNull: false,
        defaultValue: DataTypes.UUIDV4,
        unique: true,
        comment: 'Non-sequential external identifier exposed in API responses/events (Section 4).',
      },
      userType: {
        type: DataTypes.STRING(32),
        allowNull: false,
        validate: { notEmpty: true, isIn: [USER_TYPES] },
      },
      mobileNumber: {
        type: DataTypes.STRING(20),
        allowNull: true,
        validate: { len: [0, 20] },
      },
      email: {
        type: DataTypes.STRING(255),
        allowNull: true,
        validate: { isEmail: true },
      },
      username: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      passwordHash: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'Staff only — citizens authenticate via OTP/mobile, not a password (SRS).',
      },
      status: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'active',
        validate: { notEmpty: true },
      },
      ...auditColumns(ID_TYPE.INTEGER),
      ...deletedByColumn(ID_TYPE.INTEGER),
    },
    {
      ...baseOptions({
        comment: 'Base identity for every human actor — Citizen, Officer, all Admin tiers (Section 5).',
        paranoid: true,
      }),
      tableName: 'user',
      indexes: [
        { fields: ['tenant_id'], name: 'ix_user_tenant' },
        { fields: ['external_uuid'], unique: true, name: 'uq_user_external_uuid' },
        { fields: ['tenant_id', 'mobile_number'], name: 'ix_user_tenant_mobile' },
        { fields: ['tenant_id', 'email'], name: 'ix_user_tenant_email' },
        { fields: ['tenant_id', 'username'], unique: true, name: 'uq_user_tenant_username' },
        { fields: ['user_type'], name: 'ix_user_type' },
      ],
      scopes: {
        active: { where: { status: 'active' } },
        citizens: { where: { userType: 'citizen' } },
        staff: { where: { userType: { [Op.ne]: 'citizen' } } },
      },
    },
  );

  User.associate = (models) => {
    User.belongsTo(models.Tenant, { foreignKey: 'tenantId', as: 'tenant' });
    User.hasOne(models.CitizenProfile, { foreignKey: 'userId', as: 'citizenProfile' });
    User.hasOne(models.StaffProfile, { foreignKey: 'userId', as: 'staffProfile' });
    User.hasMany(models.UserRoleAssignment, { foreignKey: 'userId', as: 'userRoleAssignments' });
    User.hasMany(models.MfaDevice, { foreignKey: 'userId', as: 'mfaDevices' });
    User.hasMany(models.PasswordHistory, { foreignKey: 'userId', as: 'passwordHistory' });
    User.hasOne(models.AccountLockoutState, { foreignKey: 'userId', as: 'accountLockoutState' });
    User.hasMany(models.NotificationPreference, { foreignKey: 'userId', as: 'notificationPreferences' });
    User.hasMany(models.NotificationDispatch, { foreignKey: 'recipientUserId', as: 'notificationDispatches' });
    User.hasMany(models.FileAsset, { foreignKey: 'uploadedBy', as: 'uploadedFileAssets' });
  };

  return User;
};
