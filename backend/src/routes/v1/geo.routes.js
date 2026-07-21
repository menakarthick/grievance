'use strict';

const { Router } = require('express');
const controller = require('../../controllers/geo.controller');
const validators = require('../../validators/geo.validators');
const { validate } = require('../../middleware/validate');
const { authenticate, requireRole, requireTenant } = require('../../middleware/auth');
const policy = require('../../policies/geo.policy');

// Geographic module routes (docs/geographic.yaml). Mounted at /geo under
// the versioned API prefix by routes/v1/index.js. Every operation requires
// authentication + tenant scope (docs/14-API-Security.md §14.9-14.10);
// role gates below mirror docs/07-Geographic-APIs.md's per-endpoint
// "Authentication" column exactly, via src/policies/geo.policy.js.
const router = Router();

router.use(authenticate, requireTenant());

const read = (roles) => requireRole(...roles);
const write = (roles) => requireRole(...roles);

// --- District (§7.2) ---
router.get('/districts', read(policy.district.read), validators.geoListDistricts, validate, controller.listDistricts);
router.post(
  '/districts',
  write(policy.district.write),
  validators.geoCreateDistrict,
  validate,
  controller.createDistrict,
);
router.get('/districts/:id', read(policy.district.read), validators.geoGetDistrict, validate, controller.getDistrict);
router.patch(
  '/districts/:id',
  write(policy.district.write),
  validators.geoUpdateDistrict,
  validate,
  controller.updateDistrict,
);
router.delete(
  '/districts/:id',
  write(policy.district.write),
  validators.geoDeleteDistrict,
  validate,
  controller.deleteDistrict,
);

// --- Corporation (§7.3) — org_unit-backed, not enabled (see geo.controller.js) ---
router.get('/corporations', read(policy.corporation.read), controller.listCorporations);
router.post('/corporations', write(policy.corporation.write), controller.createCorporation);
router.get('/corporations/:id', read(policy.corporation.read), controller.getCorporation);
router.patch('/corporations/:id', write(policy.corporation.write), controller.updateCorporation);
router.delete('/corporations/:id', write(policy.corporation.write), controller.deleteCorporation);

// --- Region (§7.4) — org_unit-backed, not enabled ---
router.get('/regions', read(policy.region.read), controller.listRegions);
router.post('/regions', write(policy.region.write), controller.createRegion);
router.get('/regions/:id', read(policy.region.read), controller.getRegion);
router.patch('/regions/:id', write(policy.region.write), controller.updateRegion);
router.delete('/regions/:id', write(policy.region.write), controller.deleteRegion);

// --- Zone (§7.5) ---
router.get('/zones', read(policy.zone.read), validators.geoListZones, validate, controller.listZones);
router.post('/zones', write(policy.zone.write), validators.geoCreateZone, validate, controller.createZone);
router.get('/zones/:id', read(policy.zone.read), validators.geoGetZone, validate, controller.getZone);
router.patch('/zones/:id', write(policy.zone.write), validators.geoUpdateZone, validate, controller.updateZone);
router.delete('/zones/:id', write(policy.zone.write), validators.geoDeleteZone, validate, controller.deleteZone);

// --- Division (§7.6) — org_unit-backed, not enabled ---
router.get('/divisions', read(policy.division.read), controller.listDivisions);
router.post('/divisions', write(policy.division.write), controller.createDivision);
router.get('/divisions/:id', read(policy.division.read), controller.getDivision);
router.patch('/divisions/:id', write(policy.division.write), controller.updateDivision);
router.delete('/divisions/:id', write(policy.division.write), controller.deleteDivision);

// --- Ward (§7.7) ---
router.get('/wards', read(policy.ward.read), validators.geoListWards, validate, controller.listWards);
router.post('/wards', write(policy.ward.write), validators.geoCreateWard, validate, controller.createWard);
router.get('/wards/:id', read(policy.ward.read), validators.geoGetWard, validate, controller.getWard);
router.patch('/wards/:id', write(policy.ward.write), validators.geoUpdateWard, validate, controller.updateWard);
router.delete('/wards/:id', write(policy.ward.write), validators.geoDeleteWard, validate, controller.deleteWard);

// --- Street (§7.8) — reference_value-backed; reads honestly empty, writes not enabled ---
router.get('/streets', read(policy.street.read), controller.listStreets);
router.post('/streets', write(policy.street.write), controller.createStreet);
router.get('/streets/:id', read(policy.street.read), controller.getStreet);

// --- Locality (§7.9) — reference_value-backed; reads honestly empty, writes not enabled ---
router.get('/localities', read(policy.locality.read), controller.listLocalities);
router.post('/localities', write(policy.locality.write), controller.createLocality);
router.get('/localities/:id', read(policy.locality.read), controller.getLocality);

// --- GIS (§7.10) — status/hierarchy genuinely served from v1.0 tables ---
router.get('/gis/status', requireRole(...policy.gisStatus), controller.gisStatus);
router.get('/gis/hierarchy', requireRole(...policy.gisHierarchy), controller.gisHierarchy);

// --- Map (§7.11) — geo_point_snapshot-backed, not enabled ---
router.get('/map/config', requireRole(...policy.mapConfig), controller.mapConfig);
router.get('/map/markers', requireRole(...policy.mapMarkers), controller.mapMarkers);

// --- Reverse Geocoding (§7.12) — reverse_geocode_cache-backed, not enabled ---
router.get('/reverse-geocode', requireRole(...policy.reverseGeocode), controller.reverseGeocode);
router.post('/reverse-geocode/batch', requireRole(...policy.batchReverseGeocode), controller.batchReverseGeocode);

// --- Heatmap (§7.14) — geo_analytics_snapshot-backed, not enabled ---
router.get('/heatmap', requireRole(...policy.heatmap), controller.complaintHeatmap);

// --- Geo Analytics (§7.15) — geo_analytics_snapshot-backed, not enabled ---
router.get('/analytics', requireRole(...policy.analytics), controller.analyticsSummary);

// --- Boundaries (§7.16) — geo_boundary-backed, not enabled ---
router.get('/boundaries', requireRole(...policy.boundaryList), controller.listBoundaries);
router.get('/boundaries/:orgUnitId', requireRole(...policy.boundaryRead), controller.getBoundary);
router.put('/boundaries/:orgUnitId', requireRole(...policy.boundaryWrite), controller.replaceBoundary);
router.delete('/boundaries/:orgUnitId', requireRole(...policy.boundaryWrite), controller.deleteBoundary);

// Note: /api/v1/complaints/nearby (operationId geoNearbyComplaints,
// docs/07-Geographic-APIs.md §7.13) is declared in docs/geographic.yaml
// but mounted under the Complaint module's route prefix per
// docs/ROUTE-REGISTRATION-ORDER.md — it belongs in complaint.routes.js,
// out of scope for "Geographic module only".

// State (§7.1) — no path-segment overlap with anything above; registration
// order relative to the other blocks has no functional effect.
router.get('/states', read(policy.state.read), controller.listStates);
router.post('/states', write(policy.state.write), controller.createState);
router.get('/states/:id', read(policy.state.read), controller.getState);
router.patch('/states/:id', write(policy.state.write), controller.updateState);
router.delete('/states/:id', write(policy.state.write), controller.deleteState);

module.exports = router;
