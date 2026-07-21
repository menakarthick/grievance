'use strict';

const { ID_TYPE, idColumn, baseOptions } = require('../database/helpers');

module.exports = (sequelize, DataTypes) => {
  const WeeklyOfficerPerformance = sequelize.define(
    'WeeklyOfficerPerformance',
    {
      ...idColumn(ID_TYPE.BIGINT),
      officerId: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      weekStartDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      assignedCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      resolvedCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      overdueCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      ...baseOptions({
        comment:
          'Per-officer weekly assigned/resolved/pending/overdue counts, feeding the Officer AI Agent weekly report (SRS §3.3, Section 14).',
        paranoid: false,
      }),
      tableName: 'weekly_officer_performance',
      indexes: [{ fields: ['officer_id', 'week_start_date'], unique: true, name: 'uq_wop_officer_week' }],
    },
  );

  WeeklyOfficerPerformance.associate = (models) => {
    WeeklyOfficerPerformance.belongsTo(models.StaffProfile, { foreignKey: 'officerId', as: 'officer' });
  };

  return WeeklyOfficerPerformance;
};
