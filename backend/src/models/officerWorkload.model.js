'use strict';

const { ID_TYPE, idColumn, baseOptions } = require('../database/helpers');

module.exports = (sequelize, DataTypes) => {
  const OfficerWorkload = sequelize.define(
    'OfficerWorkload',
    {
      ...idColumn(ID_TYPE.INTEGER),
      officerId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        unique: true,
      },
      activeComplaintCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: { isInt: true, min: 0 },
      },
    },
    {
      ...baseOptions({
        comment:
          'Current active-assignment count per officer — a materialized counter read/written by the Assignment Engine, not a historical table (Section 8).',
        paranoid: false,
      }),
      tableName: 'officer_workload',
      // Optimistic locking: concurrently incremented/decremented by the
      // Assignment Engine on every (re)assignment — the exact "materialized
      // counter under concurrent writes" case this control exists for.
      version: true,
      indexes: [{ fields: ['officer_id'], unique: true, name: 'uq_officer_workload_officer' }],
    },
  );

  OfficerWorkload.associate = (models) => {
    OfficerWorkload.belongsTo(models.StaffProfile, { foreignKey: 'officerId', as: 'officer' });
  };

  return OfficerWorkload;
};
