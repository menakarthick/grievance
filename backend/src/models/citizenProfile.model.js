'use strict';

const { ID_TYPE, idColumn, auditColumns, deletedByColumn, baseOptions } = require('../database/helpers');

module.exports = (sequelize, DataTypes) => {
  const CitizenProfile = sequelize.define(
    'CitizenProfile',
    {
      ...idColumn(ID_TYPE.INTEGER),
      userId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        unique: true,
        comment: '1:1 with user where user_type = citizen (Section 5).',
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        validate: { notEmpty: true },
      },
      address: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      preferredLanguage: {
        type: DataTypes.STRING(16),
        allowNull: true,
      },
      wardId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
      ...auditColumns(ID_TYPE.INTEGER),
      ...deletedByColumn(ID_TYPE.INTEGER),
    },
    {
      ...baseOptions({
        comment: 'Citizen-specific attributes (Section 5).',
        paranoid: true,
      }),
      tableName: 'citizen_profile',
      indexes: [
        { fields: ['user_id'], unique: true, name: 'uq_citizen_profile_user' },
        { fields: ['ward_id'], name: 'ix_citizen_profile_ward' },
      ],
    },
  );

  CitizenProfile.associate = (models) => {
    CitizenProfile.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    CitizenProfile.belongsTo(models.Ward, { foreignKey: 'wardId', as: 'ward' });
    CitizenProfile.hasMany(models.Complaint, { foreignKey: 'citizenId', as: 'complaints' });
  };

  return CitizenProfile;
};
