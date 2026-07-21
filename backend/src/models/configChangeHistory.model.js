'use strict';

const { ID_TYPE, idColumn, baseOptions } = require('../database/helpers');

module.exports = (sequelize, DataTypes) => {
  const ConfigChangeHistory = sequelize.define(
    'ConfigChangeHistory',
    {
      ...idColumn(ID_TYPE.BIGINT),
      configTableName: {
        type: DataTypes.STRING(128),
        allowNull: false,
        comment: 'Name of the *_config table this row is history for (Section 10).',
      },
      configRowId: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
      },
      previousVersion: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      newVersion: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      changedBy: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
        comment:
          'Nullable: SET NULL on user hard-delete so the compliance record survives (Section 23 10-year retention).',
      },
    },
    {
      ...baseOptions({
        comment:
          'Specialization of audit_log scoped to Configuration Table changes — powers a "show history of this rule" view directly (Section 10).',
        paranoid: false,
        updatedAt: false,
      }),
      tableName: 'config_change_history',
      indexes: [
        { fields: ['config_table_name', 'config_row_id', 'created_at'], name: 'ix_cch_table_row_created' },
        { fields: ['changed_by'], name: 'ix_cch_changed_by' },
      ],
    },
  );

  ConfigChangeHistory.associate = (models) => {
    ConfigChangeHistory.belongsTo(models.User, { foreignKey: 'changedBy', as: 'changedByUser' });
  };

  return ConfigChangeHistory;
};
