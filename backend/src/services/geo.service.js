'use strict';

const { ApiError } = require('../utils/apiError');
const { buildOffsetPaginationMeta } = require('../utils/pagination');
const {
  districtRepository,
  zoneRepository,
  wardRepository,
  findActiveMapsProvider,
} = require('../repositories/geo.repository');
const { District, Zone, Ward, CitizenProfile, Tenant } = require('../models');

// Phase-1 pilot simplification, same precedent as
// src/services/auth.service.js#resolveSingleActiveTenant: a Super Admin's
// JWT carries no tenantId (Section 3/5's documented cross-tenant
// exception), and the approved Geographic API contract has no `?tenantId=`
// override parameter for these endpoints, so a Super Admin operates against
// the platform's single active tenant in this Phase-1 pilot. A genuine
// multi-tenant Super Admin flow needs an explicit, separately-approved
// contract addition — out of scope for this module.
async function resolveTenantId(user) {
  if (user.tenantId) return Number(user.tenantId);
  const tenants = await Tenant.findAll({ where: { status: 'active' }, limit: 2 });
  if (tenants.length !== 1) {
    throw ApiError.internal(
      'Geographic administration requires exactly one active tenant in the current Phase-1 pilot configuration.',
    );
  }
  return tenants[0].id;
}

function shapeDistrict(d) {
  return {
    id: String(d.id),
    code: d.code,
    name: d.name,
    isActive: d.isActive,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}
function shapeZone(z) {
  return {
    id: String(z.id),
    code: z.code,
    name: z.name,
    districtId: String(z.districtId),
    isActive: z.isActive,
    createdAt: z.createdAt,
  };
}
function shapeWard(w) {
  return {
    id: String(w.id),
    code: w.code,
    name: w.name,
    zoneId: String(w.zoneId),
    isActive: w.isActive,
    createdAt: w.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Generic list/create/get/update/delete built once, parametrized per level.
// District -> Zone -> Ward is a fixed 3-tier tree across three distinct
// tables (not a self-referential structure), so a zone's parent can only
// ever be a district row and a ward's parent can only ever be a zone row —
// a cycle (X is its own ancestor) is structurally impossible by the schema
// itself, not merely prevented by a runtime check. What *is* validated at
// runtime, matching docs/07-Geographic-APIs.md exactly: the referenced
// parent exists, belongs to the same tenant, and is active.
// ---------------------------------------------------------------------------

function buildLevelService({
  repository,
  parentRepository,
  parentField,
  parentNotFoundCode,
  notFoundCode,
  codeConflictCode,
  hasActiveChildrenCode,
  childRepository,
  shape,
  entityLabel,
}) {
  async function assertParentValid(tenantId, parentId) {
    if (!parentRepository) return;
    const parent = await parentRepository.findById(tenantId, parentId);
    if (!parent || !parent.isActive) {
      throw new ApiError({
        statusCode: 404,
        category: 'business',
        code: parentNotFoundCode,
        message: `${entityLabel}'s parent was not found or is not active.`,
      });
    }
  }

  async function assertCodeAvailable(tenantId, code, excludeId) {
    const existing = await repository.findByCode(tenantId, code);
    if (existing && existing.id !== excludeId) {
      throw new ApiError({
        statusCode: 409,
        category: 'business',
        code: codeConflictCode,
        message: `${entityLabel} code already exists within this tenant.`,
      });
    }
  }

  return {
    async list(user, { parentId, isActive, q, order, page, size, offset }) {
      const tenantId = await resolveTenantId(user);
      const options = { tenantId, isActive, q, order, limit: size, offset };
      if (parentField && parentId !== undefined) options.parentId = parentId;
      const { rows, count } = await repository.list(options);
      return { data: rows.map(shape), pagination: buildOffsetPaginationMeta({ page, size, totalCount: count }) };
    },

    async get(user, id) {
      const tenantId = await resolveTenantId(user);
      const row = await repository.findById(tenantId, id);
      if (!row)
        throw new ApiError({
          statusCode: 404,
          category: 'business',
          code: notFoundCode,
          message: `${entityLabel} not found.`,
        });
      return shape(row);
    },

    async create(user, payload) {
      const tenantId = await resolveTenantId(user);
      if (parentField) await assertParentValid(tenantId, payload[parentField]);
      await assertCodeAvailable(tenantId, payload.code);

      const data = { tenantId, code: payload.code, name: payload.name, isActive: true, createdBy: user.id };
      if (parentField) data[parentField] = payload[parentField];
      const row = await repository.create(data);
      return shape(row);
    },

    async update(user, id, payload) {
      const tenantId = await resolveTenantId(user);
      const row = await repository.findById(tenantId, id);
      if (!row)
        throw new ApiError({
          statusCode: 404,
          category: 'business',
          code: notFoundCode,
          message: `${entityLabel} not found.`,
        });

      if (parentField && payload[parentField] !== undefined) {
        await assertParentValid(tenantId, payload[parentField]);
      }
      if (payload.code !== undefined && payload.code !== row.code) {
        await assertCodeAvailable(tenantId, payload.code, id);
      }

      const data = { updatedBy: user.id };
      if (payload.name !== undefined) data.name = payload.name;
      if (payload.isActive !== undefined) data.isActive = payload.isActive;
      if (parentField && payload[parentField] !== undefined) data[parentField] = payload[parentField];
      if (payload.code !== undefined) data.code = payload.code;

      await repository.update(row, data);
      return shape(row);
    },

    async remove(user, id) {
      const tenantId = await resolveTenantId(user);
      const row = await repository.findById(tenantId, id);
      if (!row)
        throw new ApiError({
          statusCode: 404,
          category: 'business',
          code: notFoundCode,
          message: `${entityLabel} not found.`,
        });

      if (childRepository) {
        const activeChildren = await childRepository.countWhereParent(id);
        if (activeChildren > 0) {
          throw new ApiError({
            statusCode: 409,
            category: 'business',
            code: hasActiveChildrenCode,
            message: `${entityLabel} still has active child records.`,
          });
        }
      }

      // "Delete" here means deactivate (docs/07-Geographic-APIs.md
      // §7.2.5/7.5.5/7.7.5, DATABASE_DESIGN.md §21) — isActive:false only,
      // deliberately not a paranoid destroy(). The Update endpoint accepts
      // `isActive` as a settable field specifically so deactivation is
      // reversible; setting deletedAt here would make the row invisible to
      // every future default-scoped query, including the PATCH that would
      // otherwise reactivate it.
      await repository.update(row, { isActive: false, updatedBy: user.id });
    },
  };
}

const districtService = buildLevelService({
  repository: districtRepository,
  notFoundCode: 'DISTRICT_NOT_FOUND',
  codeConflictCode: 'DISTRICT_CODE_ALREADY_EXISTS',
  hasActiveChildrenCode: 'DISTRICT_HAS_ACTIVE_ZONES',
  childRepository: zoneRepository,
  shape: shapeDistrict,
  entityLabel: 'District',
});

const zoneService = buildLevelService({
  repository: zoneRepository,
  parentRepository: districtRepository,
  parentField: 'districtId',
  parentNotFoundCode: 'DISTRICT_NOT_FOUND',
  notFoundCode: 'ZONE_NOT_FOUND',
  codeConflictCode: 'ZONE_CODE_ALREADY_EXISTS',
  hasActiveChildrenCode: 'ZONE_HAS_ACTIVE_WARDS',
  childRepository: wardRepository,
  shape: shapeZone,
  entityLabel: 'Zone',
});

const wardService = buildLevelService({
  repository: wardRepository,
  parentRepository: zoneRepository,
  parentField: 'zoneId',
  parentNotFoundCode: 'ZONE_NOT_FOUND',
  notFoundCode: 'WARD_NOT_FOUND',
  codeConflictCode: 'WARD_CODE_ALREADY_EXISTS',
  shape: shapeWard,
  entityLabel: 'Ward',
});

// Ward delete additionally guards against active citizen addresses
// (docs/07-Geographic-APIs.md §7.7.5's WARD_IN_ACTIVE_USE — the complaint
// side of that check is not implemented here: v1.0's `complaint` table has
// no ward foreign key, only free-text/lat-long location, so there is
// nothing to query for that half of the rule; only citizen_profile.wardId
// is a real, checkable reference).
const baseWardRemove = wardService.remove;
wardService.remove = async function removeWardWithUsageGuard(user, id) {
  // `id` has not yet been tenant-verified at this point — that happens
  // inside baseWardRemove below. Checking usage first is still safe: a
  // ward id that doesn't belong to the caller's tenant will simply have no
  // matching citizen_profile rows (or, if it coincidentally does, the
  // subsequent baseWardRemove call still enforces the tenant-scoped 404).
  const inUse = await CitizenProfile.count({ where: { wardId: id } });
  if (inUse > 0) {
    throw new ApiError({
      statusCode: 409,
      category: 'business',
      code: 'WARD_IN_ACTIVE_USE',
      message: 'This ward is referenced by existing citizen addresses.',
    });
  }
  return baseWardRemove(user, id);
};

// --- GIS Capability Status (§7.10.1) — genuinely served from provider_config ---
async function gisStatus(user) {
  const tenantId = await resolveTenantId(user);
  const mapsProvider = await findActiveMapsProvider(tenantId);
  return {
    gisEnabled: false,
    boundaryEntityTypesPopulated: [],
    mapsProviderConfigured: Boolean(mapsProvider),
  };
}

// --- GIS Administrative Hierarchy Tree (§7.10.2) — genuinely walks district/zone/ward ---
async function gisHierarchy(user) {
  const tenantId = await resolveTenantId(user);
  const [districts, zones, wards] = await Promise.all([
    District.findAll({ where: { tenantId, isActive: true }, order: [['name', 'ASC']] }),
    Zone.findAll({ where: { tenantId, isActive: true }, order: [['name', 'ASC']] }),
    Ward.findAll({ where: { tenantId, isActive: true }, order: [['name', 'ASC']] }),
  ]);

  const wardNodesByZone = new Map();
  for (const ward of wards) {
    const node = { id: String(ward.id), name: ward.name, orgUnitType: 'ward', hasBoundary: false, children: [] };
    const list = wardNodesByZone.get(ward.zoneId) || [];
    list.push(node);
    wardNodesByZone.set(ward.zoneId, list);
  }

  const zoneNodesByDistrict = new Map();
  for (const zone of zones) {
    const node = {
      id: String(zone.id),
      name: zone.name,
      orgUnitType: 'zone',
      hasBoundary: false,
      children: wardNodesByZone.get(zone.id) || [],
    };
    const list = zoneNodesByDistrict.get(zone.districtId) || [];
    list.push(node);
    zoneNodesByDistrict.set(zone.districtId, list);
  }

  const districtNodes = districts.map((district) => ({
    id: String(district.id),
    name: district.name,
    orgUnitType: 'district',
    hasBoundary: false,
    children: zoneNodesByDistrict.get(district.id) || [],
  }));

  return {
    id: `tenant-${tenantId}`,
    name: 'Tenant Geography',
    orgUnitType: 'tenant',
    hasBoundary: false,
    children: districtNodes,
  };
}

module.exports = {
  resolveTenantId,
  districtService,
  zoneService,
  wardService,
  gisStatus,
  gisHierarchy,
};
