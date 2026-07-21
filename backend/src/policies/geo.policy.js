'use strict';

// Declarative authorization rules for the Geographic module — the role
// lists documented per operation in docs/07-Geographic-APIs.md §7.1-7.16.
// Kept as data, separate from the route-wiring in geo.routes.js, so the
// "who can do what" answer for this module lives in exactly one place and
// route files stay a thin, readable list of `method(path, ...middleware)`
// calls. Consumed via requireRole()/requireTenant() (src/middleware/auth.js).

const ANY_AUTHENTICATED = ['citizen', 'officer', 'department_admin', 'corporation_admin', 'super_admin'];

const OPERATIONAL_STAFF = ['officer', 'department_admin', 'corporation_admin', 'super_admin'];
const ADMIN_STAFF = ['department_admin', 'corporation_admin', 'super_admin'];
const WRITE_DISTRICT_ZONE_WARD = ['corporation_admin', 'super_admin'];
const SUPER_ADMIN_ONLY = ['super_admin'];

module.exports = {
  ANY_AUTHENTICATED,
  OPERATIONAL_STAFF,
  ADMIN_STAFF,
  WRITE_DISTRICT_ZONE_WARD,
  SUPER_ADMIN_ONLY,

  // District / Zone / Ward (docs/07-Geographic-APIs.md §7.2, 7.5, 7.7) —
  // real, v1.0-table-backed CRUD.
  district: { read: ANY_AUTHENTICATED, write: WRITE_DISTRICT_ZONE_WARD },
  zone: { read: ANY_AUTHENTICATED, write: WRITE_DISTRICT_ZONE_WARD },
  ward: { read: ANY_AUTHENTICATED, write: WRITE_DISTRICT_ZONE_WARD },

  // State (§7.1) / Street (§7.8) / Locality (§7.9) — reference_value-backed
  // (DATABASE_DESIGN.md §29, v1.1, Pending Client Review per §36). Reads
  // are genuinely served (empty catalog); writes are not enabled.
  state: { read: ANY_AUTHENTICATED, write: SUPER_ADMIN_ONLY },
  street: { read: ANY_AUTHENTICATED, write: WRITE_DISTRICT_ZONE_WARD },
  locality: { read: ANY_AUTHENTICATED, write: WRITE_DISTRICT_ZONE_WARD },

  // Corporation (§7.3) / Region (§7.4) / Division (§7.6) — org_unit-backed
  // (DATABASE_DESIGN.md §28, v1.1, Pending Client Review per §36). Not
  // enabled for any operation.
  corporation: { read: OPERATIONAL_STAFF, write: SUPER_ADMIN_ONLY },
  region: { read: OPERATIONAL_STAFF, write: SUPER_ADMIN_ONLY },
  division: { read: OPERATIONAL_STAFF, write: SUPER_ADMIN_ONLY },

  // GIS / Map / Geocoding / Heatmap / Analytics / Boundaries (§7.10-7.16) —
  // geo_boundary / geo_point_snapshot / reverse_geocode_cache /
  // geo_analytics_snapshot-backed (DATABASE_DESIGN.md §26, v1.1, Pending
  // Client Review). gisStatus/gisHierarchy are genuinely served from
  // existing v1.0 tables (provider_config, district/zone/ward); the rest
  // are not enabled.
  gisStatus: OPERATIONAL_STAFF,
  gisHierarchy: ADMIN_STAFF,
  mapConfig: OPERATIONAL_STAFF,
  mapMarkers: OPERATIONAL_STAFF,
  reverseGeocode: ANY_AUTHENTICATED,
  batchReverseGeocode: ADMIN_STAFF,
  heatmap: ADMIN_STAFF,
  analytics: ADMIN_STAFF,
  boundaryRead: ANY_AUTHENTICATED,
  boundaryList: ADMIN_STAFF,
  boundaryWrite: WRITE_DISTRICT_ZONE_WARD,
};
