'use strict';

// HTTP-layer handlers for the Geographic module: parse the request, call
// src/services/geo.service.js, shape the response via
// src/utils/apiResponse.js. One handler per docs/geographic.yaml
// operationId.
const { asyncHandler } = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const { ApiError } = require('../utils/apiError');
const { parseOffsetPagination } = require('../utils/pagination');
const { parseSort, parseSearch } = require('../utils/queryOptions');
const geoService = require('../services/geo.service');

const SORTABLE_FIELDS = ['name', 'code', 'createdAt'];
const DEFAULT_ORDER = [['name', 'ASC']];

function parseBooleanQuery(value, fallback) {
  if (value === undefined) return fallback;
  return value === 'true' || value === true;
}

// One real CRUD controller set per level (District/Zone/Ward), built once
// and parametrized — the three levels share an identical HTTP-layer shape,
// differing only in which query param names the parent id / which max page
// size applies (docs/07-Geographic-APIs.md §7.2, 7.5, 7.7).
function buildLevelControllers(service, { parentParam, maxSize }) {
  return {
    list: asyncHandler(async (req, res) => {
      const { page, size, offset } = parseOffsetPagination(req, { maxSize });
      const order = parseSort(req, SORTABLE_FIELDS, DEFAULT_ORDER);
      const q = parseSearch(req);
      const isActive = parseBooleanQuery(req.query.isActive, true);
      const parentId = parentParam && req.query[parentParam] !== undefined ? req.query[parentParam] : undefined;

      const result = await service.list(req.user, { parentId, isActive, q, order, page, size, offset });
      sendSuccess(res, { data: result.data, pagination: result.pagination });
    }),

    create: asyncHandler(async (req, res) => {
      const result = await service.create(req.user, req.body);
      sendSuccess(res, { statusCode: 201, data: result });
    }),

    get: asyncHandler(async (req, res) => {
      const result = await service.get(req.user, req.params.id);
      sendSuccess(res, { data: result });
    }),

    update: asyncHandler(async (req, res) => {
      const result = await service.update(req.user, req.params.id, req.body);
      sendSuccess(res, { data: result });
    }),

    remove: asyncHandler(async (req, res) => {
      await service.remove(req.user, req.params.id);
      res.status(204).end();
    }),
  };
}

const districtControllers = buildLevelControllers(geoService.districtService, { maxSize: 100 });
const zoneControllers = buildLevelControllers(geoService.zoneService, { parentParam: 'districtId', maxSize: 100 });
const wardControllers = buildLevelControllers(geoService.wardService, { parentParam: 'zoneId', maxSize: 200 });

const gisStatus = asyncHandler(async (req, res) => {
  const result = await geoService.gisStatus(req.user);
  sendSuccess(res, { data: result });
});

const gisHierarchy = asyncHandler(async (req, res) => {
  const result = await geoService.gisHierarchy(req.user);
  sendSuccess(res, { data: result });
});

// --- Not-yet-enabled surface -----------------------------------------------
// State (§7.1) / Street (§7.8) / Locality (§7.9) are documented as backed
// by `reference_value` (DATABASE_DESIGN.md §29); Corporation/Region/
// Division (§7.3/7.4/7.6) by `org_unit` (§28); Map/Geocoding/Heatmap/
// Analytics/Boundaries (§7.11-7.16) by the GIS entities (§26). All of
// those are v1.1, "Pending Client Review" per §36, and were correctly
// excluded from the physical database layer built in the previous phase —
// so none of these tables exist yet in this deployment. Reads that the spec
// itself documents as "not feature-flag gated" (State/Street/Locality list)
// are served honestly as an empty catalog; everything else responds
// 501 NOT_ENABLED, matching §7.0's documented degradation contract exactly
// rather than fabricating data against a table that was never approved for
// physical implementation.

function notEnabled(
  message = 'This capability requires database entities not yet approved for physical implementation (DATABASE_DESIGN.md §36).',
) {
  return asyncHandler(async (req, res, next) => {
    next(
      new ApiError({
        statusCode: 501,
        category: 'business',
        code: 'NOT_ENABLED',
        message,
      }),
    );
  });
}

function emptyReferenceList() {
  return asyncHandler(async (req, res) => {
    const { page, size } = parseOffsetPagination(req, { maxSize: 200 });
    sendSuccess(res, { data: [], pagination: { page, size, totalCount: 0, totalPages: 0 } });
  });
}

function referenceEntityNotFound(entityLabel, code) {
  return asyncHandler(async (req, res, next) => {
    next(new ApiError({ statusCode: 404, category: 'business', code, message: `${entityLabel} not found.` }));
  });
}

// TODO(pending v1.1 client approval, DATABASE_DESIGN.md §36): once
// org_unit / org_unit_type_definition (§28) are approved for physical
// implementation, replace these four notEnabled() calls with real
// Corporation/Region/Division services analogous to geo.service.js's
// districtService/zoneService/wardService.
const ORG_UNIT_NOT_ENABLED = notEnabled(
  'Corporation/Region/Division require org_unit + org_unit_type_definition (DATABASE_DESIGN.md §28), which is v1.1 and Pending Client Review (§36).',
);

// TODO(pending v1.1 client approval, DATABASE_DESIGN.md §36): once
// reference_domain / reference_value (§29) are approved, Street/Locality
// Create should insert real rows the same way State's would.
const REFERENCE_VALUE_NOT_ENABLED = notEnabled(
  'Creating Street/Locality/State entries requires reference_domain + reference_value (DATABASE_DESIGN.md §29), which is v1.1 and Pending Client Review (§36).',
);

// TODO(pending v1.1 client approval, DATABASE_DESIGN.md §36): once
// geo_boundary / geo_point_snapshot / reverse_geocode_cache /
// geo_analytics_snapshot (§26) are approved, replace these with real
// Map/Geocoding/Heatmap/Analytics/Boundaries services.
const GIS_ENTITY_NOT_ENABLED = notEnabled(
  'Map/Geocoding/Heatmap/Analytics/Boundaries require the GIS entities in DATABASE_DESIGN.md §26, which is v1.1 and Pending Client Review (§36).',
);

module.exports = {
  // District (§7.2) — real, v1.0-table-backed.
  listDistricts: districtControllers.list,
  createDistrict: districtControllers.create,
  getDistrict: districtControllers.get,
  updateDistrict: districtControllers.update,
  deleteDistrict: districtControllers.remove,
  // Zone (§7.5) — real, v1.0-table-backed.
  listZones: zoneControllers.list,
  createZone: zoneControllers.create,
  getZone: zoneControllers.get,
  updateZone: zoneControllers.update,
  deleteZone: zoneControllers.remove,
  // Ward (§7.7) — real, v1.0-table-backed.
  listWards: wardControllers.list,
  createWard: wardControllers.create,
  getWard: wardControllers.get,
  updateWard: wardControllers.update,
  deleteWard: wardControllers.remove,
  // GIS Status/Hierarchy (§7.10.1-2) — genuinely served from v1.0 tables.
  gisStatus,
  gisHierarchy,

  // State (§7.1) — reference_value-backed (§29, v1.1, pending). List/Get
  // are genuinely served (spec: "not feature-flag gated" -> honest empty
  // catalog / 404). TODO(pending v1.1 approval): Create/Update/Delete need
  // reference_domain + reference_value to exist before they can persist.
  listStates: emptyReferenceList(),
  getState: referenceEntityNotFound('State', 'STATE_NOT_FOUND'),
  createState: REFERENCE_VALUE_NOT_ENABLED,
  updateState: REFERENCE_VALUE_NOT_ENABLED,
  deleteState: REFERENCE_VALUE_NOT_ENABLED,

  // Corporation (§7.3) — org_unit-backed (§28, v1.1, pending). Spec itself
  // gates every operation (including List) behind 501 when the
  // use_generic_org_hierarchy feature flag is off, which it is.
  listCorporations: ORG_UNIT_NOT_ENABLED,
  createCorporation: ORG_UNIT_NOT_ENABLED,
  getCorporation: ORG_UNIT_NOT_ENABLED,
  updateCorporation: ORG_UNIT_NOT_ENABLED,
  deleteCorporation: ORG_UNIT_NOT_ENABLED,
  // Region (§7.4) — org_unit-backed (§28, v1.1, pending).
  listRegions: ORG_UNIT_NOT_ENABLED,
  createRegion: ORG_UNIT_NOT_ENABLED,
  getRegion: ORG_UNIT_NOT_ENABLED,
  updateRegion: ORG_UNIT_NOT_ENABLED,
  deleteRegion: ORG_UNIT_NOT_ENABLED,
  // Division (§7.6) — org_unit-backed (§28, v1.1, pending).
  listDivisions: ORG_UNIT_NOT_ENABLED,
  createDivision: ORG_UNIT_NOT_ENABLED,
  getDivision: ORG_UNIT_NOT_ENABLED,
  updateDivision: ORG_UNIT_NOT_ENABLED,
  deleteDivision: ORG_UNIT_NOT_ENABLED,

  // Street (§7.8) — reference_value-backed (§29, v1.1, pending). List/Get
  // genuinely served, same rationale as State.
  listStreets: emptyReferenceList(),
  createStreet: REFERENCE_VALUE_NOT_ENABLED,
  getStreet: referenceEntityNotFound('Street', 'STREET_NOT_FOUND'),
  // Locality (§7.9) — reference_value-backed (§29, v1.1, pending).
  listLocalities: emptyReferenceList(),
  createLocality: REFERENCE_VALUE_NOT_ENABLED,
  getLocality: referenceEntityNotFound('Locality', 'LOCALITY_NOT_FOUND'),

  // Map (§7.11) / Reverse Geocoding (§7.12) / Heatmap (§7.14) /
  // Geo Analytics (§7.15) / Boundaries (§7.16) — geo_boundary /
  // geo_point_snapshot / reverse_geocode_cache / geo_analytics_snapshot
  // -backed (§26, v1.1, pending). Spec gates every operation behind 501
  // when the tenant's GIS feature flag is off, which it is.
  mapConfig: GIS_ENTITY_NOT_ENABLED,
  mapMarkers: GIS_ENTITY_NOT_ENABLED,
  reverseGeocode: GIS_ENTITY_NOT_ENABLED,
  batchReverseGeocode: GIS_ENTITY_NOT_ENABLED,
  complaintHeatmap: GIS_ENTITY_NOT_ENABLED,
  analyticsSummary: GIS_ENTITY_NOT_ENABLED,
  listBoundaries: GIS_ENTITY_NOT_ENABLED,
  getBoundary: GIS_ENTITY_NOT_ENABLED,
  replaceBoundary: GIS_ENTITY_NOT_ENABLED,
  deleteBoundary: GIS_ENTITY_NOT_ENABLED,
};
