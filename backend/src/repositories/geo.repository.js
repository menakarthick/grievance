'use strict';

const { Op } = require('sequelize');
const { District, Zone, Ward, ProviderConfig } = require('../models');

// District/Zone/Ward (docs/DATABASE_DESIGN.md §5) share an identical shape
// — tenant_id, code, name, is_active, plus (for Zone/Ward) exactly one
// parent FK — so one factory builds all three repositories instead of
// tripling near-identical query code.
function buildEntityRepository(Model, { parentField } = {}) {
  function baseWhere({ tenantId, parentId, isActive, q }) {
    const where = { tenantId };
    if (parentField && parentId !== undefined) where[parentField] = parentId;
    if (isActive !== undefined) where.isActive = isActive;
    if (q) where.name = { [Op.like]: `%${q}%` };
    return where;
  }

  return {
    async list({ tenantId, parentId, isActive, q, order, limit, offset }) {
      return Model.findAndCountAll({
        where: baseWhere({ tenantId, parentId, isActive, q }),
        order,
        limit,
        offset,
      });
    },

    findById(tenantId, id) {
      return Model.findOne({ where: { id, tenantId } });
    },

    findByCode(tenantId, code) {
      return Model.findOne({ where: { tenantId, code } });
    },

    create(data) {
      return Model.create(data);
    },

    update(instance, data) {
      return instance.update(data);
    },

    // Does this parent still have active children? (docs/07-Geographic-
    // APIs.md §7.2.5/§7.5.5: deletion rejected with 409 while active
    // zones/wards still reference this row). Only meaningful on a
    // repository built with a `parentField` (i.e. called on the *child*
    // repository, keyed by the parent's id).
    countWhereParent(parentId) {
      if (!parentField) return Promise.resolve(0);
      return Model.count({ where: { [parentField]: parentId, isActive: true } });
    },
  };
}

const districtRepository = buildEntityRepository(District);
const zoneRepository = buildEntityRepository(Zone, { parentField: 'districtId' });
const wardRepository = buildEntityRepository(Ward, { parentField: 'zoneId' });

// GIS Capability Status (§7.10.1) genuinely reads provider_config, which is
// a real v1.0 table — no GIS-specific table needed for this one check.
function findActiveMapsProvider(tenantId) {
  return ProviderConfig.findOne({ where: { tenantId, providerType: 'maps', isActive: true } });
}

module.exports = {
  districtRepository,
  zoneRepository,
  wardRepository,
  findActiveMapsProvider,
};
