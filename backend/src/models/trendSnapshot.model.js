'use strict';

const { ID_TYPE, idColumn, tenantIdColumn, baseOptions } = require('../database/helpers');

module.exports = (sequelize, DataTypes) => {
  const TrendSnapshot = sequelize.define(
    'TrendSnapshot',
    {
      ...idColumn(ID_TYPE.BIGINT),
      ...tenantIdColumn(),
      snapshotDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      metricKey: {
        type: DataTypes.STRING(128),
        allowNull: false,
        validate: { notEmpty: true },
      },
      metricValue: {
        type: DataTypes.DECIMAL(18, 4),
        allowNull: false,
      },
    },
    {
      ...baseOptions({
        comment:
          'Periodic time-series snapshot of key metrics, purpose-built for the Analytics Agent trend/prediction responsibilities (SRS §3.5, Section 14) — a time-series input, not a transactional entity.',
        paranoid: false,
      }),
      tableName: 'trend_snapshot',
      indexes: [
        {
          fields: ['tenant_id', 'snapshot_date', 'metric_key'],
          unique: true,
          name: 'uq_trend_snapshot_tenant_date_key',
        },
      ],
    },
  );

  TrendSnapshot.associate = (models) => {
    TrendSnapshot.belongsTo(models.Tenant, { foreignKey: 'tenantId', as: 'tenant' });
  };

  return TrendSnapshot;
};
