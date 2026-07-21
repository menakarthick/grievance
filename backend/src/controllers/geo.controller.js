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

module.exports = {
  // District
  listDistricts: districtControllers.list,
  createDistrict: districtControllers.create,
  getDistrict: districtControllers.get,
  updateDistrict: districtControllers.update,
  deleteDistrict: districtControllers.remove,
  // Zone
  listZones: zoneControllers.list,
  createZone: zoneControllers.create,
  getZone: zoneControllers.get,
  updateZone: zoneControllers.update,
  deleteZone: zoneControllers.remove,
  // Ward
  listWards: wardControllers.list,
  createWard: wardControllers.create,
  getWard: wardControllers.get,
  updateWard: wardControllers.update,
  deleteWard: wardControllers.remove,
  // GIS (genuinely served)
  gisStatus,
  gisHierarchy,
  // State
  listStates: emptyReferenceList(),
  getState: referenceEntityNotFound('State', 'STATE_NOT_FOUND'),
  createState: notEnabled(),
  updateState: notEnabled(),
  deleteState: notEnabled(),
  // Corporation / Region / Division (org_unit)
  listCorporations: notEnabled(),
  createCorporation: notEnabled(),
  getCorporation: notEnabled(),
  updateCorporation: notEnabled(),
  deleteCorporation: notEnabled(),
  listRegions: notEnabled(),
  createRegion: notEnabled(),
  getRegion: notEnabled(),
  updateRegion: notEnabled(),
  deleteRegion: notEnabled(),
  listDivisions: notEnabled(),
  createDivision: notEnabled(),
  getDivision: notEnabled(),
  updateDivision: notEnabled(),
  deleteDivision: notEnabled(),
  // Street / Locality
  listStreets: emptyReferenceList(),
  createStreet: notEnabled(),
  getStreet: referenceEntityNotFound('Street', 'STREET_NOT_FOUND'),
  listLocalities: emptyReferenceList(),
  createLocality: notEnabled(),
  getLocality: referenceEntityNotFound('Locality', 'LOCALITY_NOT_FOUND'),
  // Map / Geocoding / Heatmap / Analytics / Boundaries
  mapConfig: notEnabled(),
  mapMarkers: notEnabled(),
  reverseGeocode: notEnabled(),
  batchReverseGeocode: notEnabled(),
  complaintHeatmap: notEnabled(),
  analyticsSummary: notEnabled(),
  listBoundaries: notEnabled(),
  getBoundary: notEnabled(),
  replaceBoundary: notEnabled(),
  deleteBoundary: notEnabled(),
};
