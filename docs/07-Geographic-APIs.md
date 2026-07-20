# API Specification Document — Section 7

## AI Powered Enterprise Citizen Service & Grievance Management Platform

> **Continuation note**: This file continues the API Specification from the end of the approved Section 6 (Administration APIs, `docs/06-Administration-APIs.md`). Sections 1–6 are not reproduced or modified here. This file contains **only** Section 7 (Geographic APIs) and is otherwise governed by the same design principles, error envelope, HTTP status code table, and security model already defined in `docs/API_SPECIFICATION.md` Sections 1, 12, 13, 14. No SQL, no Express routes, no controllers, no services, no database queries, no implementation code.

---

## 7. Geographic APIs

This section defines every API related to the geographic hierarchy, GIS, mapping, and location services. It draws exclusively on entities already defined in the frozen `DATABASE_DESIGN.md` v1.1 — no new table or architectural decision is introduced here; this is an API contract layer over existing design.

### 7.0 Backing Model (read before the subsections below)

To avoid inventing a bespoke table per geographic concept — the exact anti-pattern `DATABASE_DESIGN.md` Principle 2 warns against — every subsection below is a documented, purpose-named REST view over one of three existing generic entities:

| Subsections | Backing entity | Phase | Governance |
|---|---|---|---|
| 7.2 District, 7.5 Zone, 7.7 Ward | The tenant's existing self-referential `district` / `zone` / `ward` Master Tables (`DATABASE_DESIGN.md` §5) — unchanged, already approved in v1.0 | **Phase-1, required** | Department Admin (own scope) / Corporation Admin / Super Admin |
| 7.1 State, 7.3 Corporation, 7.4 Region, 7.6 Division | The generic, configurable Organization Hierarchy Model (`org_unit` + `org_unit_type_definition`, `DATABASE_DESIGN.md` §28) — each subsection is a fixed-`orgUnitType` convenience view over the **same shared entity**, so a future hierarchy level (Subdivision, Section, Office, Engineering Circle, Beat, Field Team, Inspection Team) never requires a new endpoint, only a new `org_unit_type_definition` row and, optionally, its own convenience path | **Optional, future-ready** — gated by the `use_generic_org_hierarchy` feature flag (Section 6.10) | Super Admin |
| 7.8 Street, 7.9 Locality | Tenant-scoped `reference_value` rows under new domains (`STREET`, `LOCALITY`), following the generic, config-driven Reference Data pattern (`DATABASE_DESIGN.md` §29) — a new domain is a data insert, never a schema change | **Optional, future-ready** | Corporation Admin / Super Admin |
| 7.10–7.16 GIS, Map, Reverse Geocoding, Nearby Complaint, Heatmap, Geo Analytics, Boundary | `geo_boundary`, `geo_point_snapshot`, `reverse_geocode_cache`, `geo_analytics_snapshot` (`DATABASE_DESIGN.md` §26 GIS & Geospatial Data Architecture) | **Optional in Phase-1, fully future-ready** — every endpoint returns `501 NOT_ENABLED` when the tenant's GIS feature flag is off (Section 6.10) | Officer / Department Admin / Corporation Admin / Super Admin, per endpoint |

**Important disambiguation** (restated from `DATABASE_DESIGN.md` §29, since this section places State/District/Corporation/Region/Zone/Division/Ward side by side): the **State** reference catalog (7.1) is India's civil/revenue geography, used to enrich citizen address capture — it is a *different concept* from the tenant's own **District/Zone/Ward** operational routing geography (7.2, 7.5, 7.7), which exists purely to route a complaint to the correct department/officer. Both can legitimately share the English words "district"/"state," but they are separate domains with separate backing entities, exactly as `DATABASE_DESIGN.md` §29 already establishes.

---

### 7.1 State APIs

Read-mostly civil-geography reference catalog (`reference_value`, domain `STATE`, global/shared across tenants per `DATABASE_DESIGN.md` §29). Governed under Master Data Governance (`DATABASE_DESIGN.md` §33) — Super-Admin-only write access, since a bad edit here fans out across every tenant nationally.

#### 7.1.1 List States

| | |
|---|---|
| **Purpose** | Retrieve the shared civil-geography State catalog, for citizen address forms and tenant onboarding |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/geo/states` |
| **Authentication** | Yes — any authenticated role |
| **Request Parameters** | `?countryCode=IN` (default), `?isActive=true` (default), `?page=`, `?size=` |
| **Request Body** | None |
| **Response** | `{ "data": [ { "id", "code", "name", "countryCode" } ], "meta": { "pagination" } }` |
| **Validation Rules** | `size`: max 200; returns an empty list until reference data is populated for this domain — not feature-flag gated, since an empty catalog is harmless |
| **Error Responses** | `401 UNAUTHORIZED` |
| **Related Database Entities** | `reference_domain`, `reference_value` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §29 Reference Data Architecture |
| **Related AI Agent** | None |

#### 7.1.2 Get State

| | |
|---|---|
| **Purpose** | Retrieve a single State's detail |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/geo/states/{stateId}` |
| **Authentication** | Yes — any authenticated role |
| **Request Parameters** | Path: `stateId` |
| **Request Body** | None |
| **Response** | `{ "id", "code", "name", "countryCode", "createdAt" }` |
| **Validation Rules** | None (read-only) |
| **Error Responses** | `401 UNAUTHORIZED`, `404 STATE_NOT_FOUND` |
| **Related Database Entities** | `reference_value` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §29 Reference Data Architecture |
| **Related AI Agent** | None |

#### 7.1.3 Create State

| | |
|---|---|
| **Purpose** | Add a State to the shared civil-geography catalog |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/geo/states` |
| **Authentication** | Yes — Super Admin only (Master Data Governance, `DATABASE_DESIGN.md` §33) |
| **Request Parameters** | None |
| **Request Body** | `{ "code": "string", "name": "string", "countryCode": "string (ISO 3166-1 alpha-2, default IN)" }` |
| **Response** | `{ "id", "code", "name", "countryCode", "isActive": true, "createdAt" }` |
| **Validation Rules** | `code`: required, globally unique (this domain is not tenant-scoped); `name`: required, 2–100 chars |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `409 STATE_CODE_ALREADY_EXISTS` |
| **Related Database Entities** | `reference_value` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §33 Database Governance — Master Data Governance |
| **Related AI Agent** | None |

#### 7.1.4 Update State

| | |
|---|---|
| **Purpose** | Rename or deactivate a State entry |
| **HTTP Method** | `PATCH` |
| **URL** | `/api/v1/geo/states/{stateId}` |
| **Authentication** | Yes — Super Admin only |
| **Request Parameters** | Path: `stateId` |
| **Request Body** | `{ "name"?: "string", "isActive"?: "boolean" }` — `code` is immutable once any citizen record references it (`DATABASE_DESIGN.md` §33) |
| **Response** | Updated State object (Section 7.1.2 shape) |
| **Validation Rules** | `name`: 2–100 chars if present |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 STATE_NOT_FOUND` |
| **Related Database Entities** | `reference_value`, `config_change_history` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §33 Database Governance |
| **Related AI Agent** | None |

#### 7.1.5 Deactivate State

| | |
|---|---|
| **Purpose** | Soft-delete (deactivate) a State entry — never renamed or removed once referenced, only deactivated (`DATABASE_DESIGN.md` §21, §33) |
| **HTTP Method** | `DELETE` |
| **URL** | `/api/v1/geo/states/{stateId}` |
| **Authentication** | Yes — Super Admin only |
| **Request Parameters** | Path: `stateId` |
| **Request Body** | None |
| **Response** | `204 No Content` |
| **Validation Rules** | Deactivation excludes the value from new-record pickers; existing citizen records referencing it are unaffected |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 STATE_NOT_FOUND` |
| **Related Database Entities** | `reference_value`, `audit_log` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §33 Database Governance |
| **Related AI Agent** | None |

---

### 7.2 District APIs

The tenant's operational District — the top level of the existing three-tier `district`/`zone`/`ward` complaint-routing geography (`DATABASE_DESIGN.md` §5), unchanged from v1.0. Full CRUD, matching SRS §3.4's existing "Districts / Zones / Wards (CRUD, configurable hierarchy of geography)" requirement.

#### 7.2.1 List Districts

| | |
|---|---|
| **Purpose** | Retrieve the tenant's configured districts |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/geo/districts` |
| **Authentication** | Yes — any authenticated role |
| **Request Parameters** | `?isActive=true` (default), `?page=`, `?size=` |
| **Request Body** | None |
| **Response** | `{ "data": [ { "id", "code", "name", "isActive" } ], "meta": { "pagination" } }` |
| **Validation Rules** | `size`: max 100 |
| **Error Responses** | `401 UNAUTHORIZED` |
| **Related Database Entities** | `district` |
| **Related Functional Module** | SRS §3.4 Admin Module — Districts/Zones/Wards (CRUD) |
| **Related AI Agent** | None |

#### 7.2.2 Create District

| | |
|---|---|
| **Purpose** | Add a district to the tenant's configurable geography |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/geo/districts` |
| **Authentication** | Yes — Corporation Admin / Super Admin |
| **Request Parameters** | None |
| **Request Body** | `{ "code": "string", "name": "string" }` |
| **Response** | `{ "id", "code", "name", "isActive": true, "createdAt" }` |
| **Validation Rules** | `code`: required, unique within tenant; `name`: required, 2–100 chars |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `409 DISTRICT_CODE_ALREADY_EXISTS` |
| **Related Database Entities** | `district` |
| **Related Functional Module** | SRS §3.4 Admin Module — Districts/Zones/Wards (CRUD) |
| **Related AI Agent** | None |

#### 7.2.3 Get District

| | |
|---|---|
| **Purpose** | Retrieve a single district's detail |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/geo/districts/{districtId}` |
| **Authentication** | Yes — any authenticated role |
| **Request Parameters** | Path: `districtId` |
| **Request Body** | None |
| **Response** | `{ "id", "code", "name", "isActive", "createdAt", "updatedAt" }` |
| **Validation Rules** | None (read-only) |
| **Error Responses** | `401 UNAUTHORIZED`, `404 DISTRICT_NOT_FOUND` |
| **Related Database Entities** | `district` |
| **Related Functional Module** | SRS §3.4 Admin Module — Districts/Zones/Wards (CRUD) |
| **Related AI Agent** | None |

#### 7.2.4 Update District

| | |
|---|---|
| **Purpose** | Rename a district or toggle its active state |
| **HTTP Method** | `PATCH` |
| **URL** | `/api/v1/geo/districts/{districtId}` |
| **Authentication** | Yes — Corporation Admin / Super Admin |
| **Request Parameters** | Path: `districtId` |
| **Request Body** | `{ "name"?: "string", "isActive"?: "boolean" }` — `code` is immutable |
| **Response** | Updated district object (Section 7.2.3 shape) |
| **Validation Rules** | `name`: 2–100 chars if present |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 DISTRICT_NOT_FOUND` |
| **Related Database Entities** | `district`, `audit_log` |
| **Related Functional Module** | SRS §3.4 Admin Module — Districts/Zones/Wards (CRUD) |
| **Related AI Agent** | None |

#### 7.2.5 Delete District (Deactivate)

| | |
|---|---|
| **Purpose** | Soft-delete (deactivate) a district |
| **HTTP Method** | `DELETE` |
| **URL** | `/api/v1/geo/districts/{districtId}` |
| **Authentication** | Yes — Corporation Admin / Super Admin |
| **Request Parameters** | Path: `districtId` |
| **Request Body** | None |
| **Response** | `204 No Content` |
| **Validation Rules** | Rejected (`409`) if active zones/wards still reference this district; those must be reassigned or deactivated first |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 DISTRICT_NOT_FOUND`, `409 DISTRICT_HAS_ACTIVE_ZONES` |
| **Related Database Entities** | `district`, `zone`, `audit_log` |
| **Related Functional Module** | SRS §3.4 Admin Module — Districts/Zones/Wards (CRUD) |
| **Related AI Agent** | None |

---

### 7.3 Corporation APIs

The top level of the optional, configurable Organization Hierarchy Model (`org_unit`, `DATABASE_DESIGN.md` §28) — for tenants (e.g. a state-level rollout) that need a level above Region/Zone. A fixed-`orgUnitType='corporation'` view over the generic `org_unit` entity.

#### 7.3.1 List Corporations

| | |
|---|---|
| **Purpose** | Retrieve the tenant's configured Corporation-level org units |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/geo/corporations` |
| **Authentication** | Yes — Officer / Department Admin / Corporation Admin / Super Admin |
| **Request Parameters** | `?isActive=true` (default), `?page=`, `?size=` |
| **Request Body** | None |
| **Response** | `{ "data": [ { "id", "code", "name", "orgUnitType": "corporation", "isActive" } ], "meta": { "pagination" } }` |
| **Validation Rules** | `size`: max 100 |
| **Error Responses** | `401 UNAUTHORIZED`, `501 NOT_ENABLED` (tenant has not activated `use_generic_org_hierarchy`) |
| **Related Database Entities** | `org_unit`, `org_unit_type_definition` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §28 Organization Hierarchy Model |
| **Related AI Agent** | None |

#### 7.3.2 Create Corporation

| | |
|---|---|
| **Purpose** | Add a Corporation-level org unit |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/geo/corporations` |
| **Authentication** | Yes — Super Admin only |
| **Request Parameters** | None |
| **Request Body** | `{ "code": "string", "name": "string" }` — `orgUnitType` is fixed to `corporation` server-side, `parentOrgUnitId` is null (Corporation is the root level) |
| **Response** | `{ "id", "code", "name", "orgUnitType": "corporation", "isActive": true, "createdAt" }` |
| **Validation Rules** | `code`: required, unique within tenant; `name`: required, 2–100 chars |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `409 ORG_UNIT_CODE_ALREADY_EXISTS`, `501 NOT_ENABLED` |
| **Related Database Entities** | `org_unit`, `org_unit_type_definition` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §28 Organization Hierarchy Model |
| **Related AI Agent** | None |

#### 7.3.3 Get Corporation

| | |
|---|---|
| **Purpose** | Retrieve a single Corporation-level org unit's detail |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/geo/corporations/{corporationId}` |
| **Authentication** | Yes — Officer / Department Admin / Corporation Admin / Super Admin |
| **Request Parameters** | Path: `corporationId` |
| **Request Body** | None |
| **Response** | `{ "id", "code", "name", "orgUnitType": "corporation", "isActive", "createdAt" }` |
| **Validation Rules** | None (read-only) |
| **Error Responses** | `401 UNAUTHORIZED`, `404 CORPORATION_NOT_FOUND`, `501 NOT_ENABLED` |
| **Related Database Entities** | `org_unit` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §28 Organization Hierarchy Model |
| **Related AI Agent** | None |

#### 7.3.4 Update Corporation

| | |
|---|---|
| **Purpose** | Rename or deactivate a Corporation-level org unit |
| **HTTP Method** | `PATCH` |
| **URL** | `/api/v1/geo/corporations/{corporationId}` |
| **Authentication** | Yes — Super Admin only |
| **Request Parameters** | Path: `corporationId` |
| **Request Body** | `{ "name"?: "string", "isActive"?: "boolean" }` |
| **Response** | Updated org unit object (Section 7.3.3 shape) |
| **Validation Rules** | `name`: 2–100 chars if present |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 CORPORATION_NOT_FOUND`, `501 NOT_ENABLED` |
| **Related Database Entities** | `org_unit`, `audit_log` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §28 Organization Hierarchy Model |
| **Related AI Agent** | None |

#### 7.3.5 Delete Corporation (Deactivate)

| | |
|---|---|
| **Purpose** | Soft-delete (deactivate) a Corporation-level org unit |
| **HTTP Method** | `DELETE` |
| **URL** | `/api/v1/geo/corporations/{corporationId}` |
| **Authentication** | Yes — Super Admin only |
| **Request Parameters** | Path: `corporationId` |
| **Request Body** | None |
| **Response** | `204 No Content` |
| **Validation Rules** | Rejected (`409`) if active Region-level children exist |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 CORPORATION_NOT_FOUND`, `409 ORG_UNIT_HAS_ACTIVE_CHILDREN`, `501 NOT_ENABLED` |
| **Related Database Entities** | `org_unit`, `audit_log` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §28 Organization Hierarchy Model |
| **Related AI Agent** | None |

---

### 7.4 Region APIs

A fixed-`orgUnitType='region'` view over `org_unit`, one level below Corporation (`DATABASE_DESIGN.md` §28). Same backing entity, phase, and governance as Section 7.3.

#### 7.4.1 List Regions

| | |
|---|---|
| **Purpose** | Retrieve the tenant's configured Region-level org units |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/geo/regions` |
| **Authentication** | Yes — Officer / Department Admin / Corporation Admin / Super Admin |
| **Request Parameters** | `?corporationId=`, `?isActive=true` (default), `?page=`, `?size=` |
| **Request Body** | None |
| **Response** | `{ "data": [ { "id", "code", "name", "orgUnitType": "region", "parentOrgUnitId" } ], "meta": { "pagination" } }` |
| **Validation Rules** | `size`: max 100 |
| **Error Responses** | `401 UNAUTHORIZED`, `501 NOT_ENABLED` |
| **Related Database Entities** | `org_unit` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §28 Organization Hierarchy Model |
| **Related AI Agent** | None |

#### 7.4.2 Create Region

| | |
|---|---|
| **Purpose** | Add a Region-level org unit under a Corporation |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/geo/regions` |
| **Authentication** | Yes — Super Admin only |
| **Request Parameters** | None |
| **Request Body** | `{ "code": "string", "name": "string", "corporationId": "id" }` |
| **Response** | `{ "id", "code", "name", "orgUnitType": "region", "parentOrgUnitId": "corporationId", "isActive": true, "createdAt" }` |
| **Validation Rules** | `corporationId`: required, must reference an active Corporation-level org unit; `code`: unique within tenant |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 CORPORATION_NOT_FOUND`, `409 ORG_UNIT_CODE_ALREADY_EXISTS`, `501 NOT_ENABLED` |
| **Related Database Entities** | `org_unit` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §28 Organization Hierarchy Model |
| **Related AI Agent** | None |

#### 7.4.3 Get Region

| | |
|---|---|
| **Purpose** | Retrieve a single Region-level org unit's detail |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/geo/regions/{regionId}` |
| **Authentication** | Yes — Officer / Department Admin / Corporation Admin / Super Admin |
| **Request Parameters** | Path: `regionId` |
| **Request Body** | None |
| **Response** | `{ "id", "code", "name", "orgUnitType": "region", "parentOrgUnitId", "isActive", "createdAt" }` |
| **Validation Rules** | None (read-only) |
| **Error Responses** | `401 UNAUTHORIZED`, `404 REGION_NOT_FOUND`, `501 NOT_ENABLED` |
| **Related Database Entities** | `org_unit` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §28 Organization Hierarchy Model |
| **Related AI Agent** | None |

#### 7.4.4 Update Region

| | |
|---|---|
| **Purpose** | Rename, re-parent, or deactivate a Region-level org unit |
| **HTTP Method** | `PATCH` |
| **URL** | `/api/v1/geo/regions/{regionId}` |
| **Authentication** | Yes — Super Admin only |
| **Request Parameters** | Path: `regionId` |
| **Request Body** | `{ "name"?: "string", "corporationId"?: "id", "isActive"?: "boolean" }` |
| **Response** | Updated org unit object (Section 7.4.3 shape) |
| **Validation Rules** | `corporationId`, if present: must reference an active Corporation-level org unit |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 REGION_NOT_FOUND`, `501 NOT_ENABLED` |
| **Related Database Entities** | `org_unit`, `audit_log` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §28 Organization Hierarchy Model |
| **Related AI Agent** | None |

#### 7.4.5 Delete Region (Deactivate)

| | |
|---|---|
| **Purpose** | Soft-delete (deactivate) a Region-level org unit |
| **HTTP Method** | `DELETE` |
| **URL** | `/api/v1/geo/regions/{regionId}` |
| **Authentication** | Yes — Super Admin only |
| **Request Parameters** | Path: `regionId` |
| **Request Body** | None |
| **Response** | `204 No Content` |
| **Validation Rules** | Rejected (`409`) if active Zone/Division-level children exist |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 REGION_NOT_FOUND`, `409 ORG_UNIT_HAS_ACTIVE_CHILDREN`, `501 NOT_ENABLED` |
| **Related Database Entities** | `org_unit`, `audit_log` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §28 Organization Hierarchy Model |
| **Related AI Agent** | None |

---

### 7.5 Zone APIs

The tenant's operational Zone — middle tier of the existing `district`/`zone`/`ward` geography (`DATABASE_DESIGN.md` §5), unchanged from v1.0. Phase-1, required.

#### 7.5.1 List Zones

| | |
|---|---|
| **Purpose** | Retrieve the tenant's configured zones |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/geo/zones` |
| **Authentication** | Yes — any authenticated role |
| **Request Parameters** | `?districtId=`, `?isActive=true` (default), `?page=`, `?size=` |
| **Request Body** | None |
| **Response** | `{ "data": [ { "id", "code", "name", "districtId", "isActive" } ], "meta": { "pagination" } }` |
| **Validation Rules** | `size`: max 100 |
| **Error Responses** | `401 UNAUTHORIZED` |
| **Related Database Entities** | `zone`, `district` |
| **Related Functional Module** | SRS §3.4 Admin Module — Districts/Zones/Wards (CRUD) |
| **Related AI Agent** | None |

#### 7.5.2 Create Zone

| | |
|---|---|
| **Purpose** | Add a zone under a district |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/geo/zones` |
| **Authentication** | Yes — Corporation Admin / Super Admin |
| **Request Parameters** | None |
| **Request Body** | `{ "code": "string", "name": "string", "districtId": "id" }` |
| **Response** | `{ "id", "code", "name", "districtId", "isActive": true, "createdAt" }` |
| **Validation Rules** | `districtId`: required, must reference an active district within tenant; `code`: unique within tenant |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 DISTRICT_NOT_FOUND`, `409 ZONE_CODE_ALREADY_EXISTS` |
| **Related Database Entities** | `zone`, `district` |
| **Related Functional Module** | SRS §3.4 Admin Module — Districts/Zones/Wards (CRUD) |
| **Related AI Agent** | None |

#### 7.5.3 Get Zone

| | |
|---|---|
| **Purpose** | Retrieve a single zone's detail |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/geo/zones/{zoneId}` |
| **Authentication** | Yes — any authenticated role |
| **Request Parameters** | Path: `zoneId` |
| **Request Body** | None |
| **Response** | `{ "id", "code", "name", "districtId", "isActive", "createdAt" }` |
| **Validation Rules** | None (read-only) |
| **Error Responses** | `401 UNAUTHORIZED`, `404 ZONE_NOT_FOUND` |
| **Related Database Entities** | `zone` |
| **Related Functional Module** | SRS §3.4 Admin Module — Districts/Zones/Wards (CRUD) |
| **Related AI Agent** | None |

#### 7.5.4 Update Zone

| | |
|---|---|
| **Purpose** | Rename, re-parent, or deactivate a zone |
| **HTTP Method** | `PATCH` |
| **URL** | `/api/v1/geo/zones/{zoneId}` |
| **Authentication** | Yes — Corporation Admin / Super Admin |
| **Request Parameters** | Path: `zoneId` |
| **Request Body** | `{ "name"?: "string", "districtId"?: "id", "isActive"?: "boolean" }` |
| **Response** | Updated zone object (Section 7.5.3 shape) |
| **Validation Rules** | `districtId`, if present: must reference an active district within tenant |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 ZONE_NOT_FOUND` |
| **Related Database Entities** | `zone`, `audit_log` |
| **Related Functional Module** | SRS §3.4 Admin Module — Districts/Zones/Wards (CRUD) |
| **Related AI Agent** | None |

#### 7.5.5 Delete Zone (Deactivate)

| | |
|---|---|
| **Purpose** | Soft-delete (deactivate) a zone |
| **HTTP Method** | `DELETE` |
| **URL** | `/api/v1/geo/zones/{zoneId}` |
| **Authentication** | Yes — Corporation Admin / Super Admin |
| **Request Parameters** | Path: `zoneId` |
| **Request Body** | None |
| **Response** | `204 No Content` |
| **Validation Rules** | Rejected (`409`) if active wards still reference this zone |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 ZONE_NOT_FOUND`, `409 ZONE_HAS_ACTIVE_WARDS` |
| **Related Database Entities** | `zone`, `ward`, `audit_log` |
| **Related Functional Module** | SRS §3.4 Admin Module — Districts/Zones/Wards (CRUD) |
| **Related AI Agent** | None |

---

### 7.6 Division APIs

A fixed-`orgUnitType='division'` view over `org_unit`, sitting below Zone in the optional generic hierarchy (`DATABASE_DESIGN.md` §28: Corporation > Region > Zone > Division > Subdivision > Section > Ward). Same backing entity, phase, and governance as Section 7.3/7.4.

#### 7.6.1 List Divisions

| | |
|---|---|
| **Purpose** | Retrieve the tenant's configured Division-level org units |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/geo/divisions` |
| **Authentication** | Yes — Officer / Department Admin / Corporation Admin / Super Admin |
| **Request Parameters** | `?regionId=`, `?isActive=true` (default), `?page=`, `?size=` |
| **Request Body** | None |
| **Response** | `{ "data": [ { "id", "code", "name", "orgUnitType": "division", "parentOrgUnitId" } ], "meta": { "pagination" } }` |
| **Validation Rules** | `size`: max 100 |
| **Error Responses** | `401 UNAUTHORIZED`, `501 NOT_ENABLED` |
| **Related Database Entities** | `org_unit` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §28 Organization Hierarchy Model |
| **Related AI Agent** | None |

#### 7.6.2 Create Division

| | |
|---|---|
| **Purpose** | Add a Division-level org unit under a Region |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/geo/divisions` |
| **Authentication** | Yes — Super Admin only |
| **Request Parameters** | None |
| **Request Body** | `{ "code": "string", "name": "string", "regionId": "id" }` |
| **Response** | `{ "id", "code", "name", "orgUnitType": "division", "parentOrgUnitId": "regionId", "isActive": true, "createdAt" }` |
| **Validation Rules** | `regionId`: required, must reference an active Region-level org unit; `code`: unique within tenant |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 REGION_NOT_FOUND`, `409 ORG_UNIT_CODE_ALREADY_EXISTS`, `501 NOT_ENABLED` |
| **Related Database Entities** | `org_unit` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §28 Organization Hierarchy Model |
| **Related AI Agent** | None |

#### 7.6.3 Get Division

| | |
|---|---|
| **Purpose** | Retrieve a single Division-level org unit's detail |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/geo/divisions/{divisionId}` |
| **Authentication** | Yes — Officer / Department Admin / Corporation Admin / Super Admin |
| **Request Parameters** | Path: `divisionId` |
| **Request Body** | None |
| **Response** | `{ "id", "code", "name", "orgUnitType": "division", "parentOrgUnitId", "isActive", "createdAt" }` |
| **Validation Rules** | None (read-only) |
| **Error Responses** | `401 UNAUTHORIZED`, `404 DIVISION_NOT_FOUND`, `501 NOT_ENABLED` |
| **Related Database Entities** | `org_unit` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §28 Organization Hierarchy Model |
| **Related AI Agent** | None |

#### 7.6.4 Update Division

| | |
|---|---|
| **Purpose** | Rename, re-parent, or deactivate a Division-level org unit |
| **HTTP Method** | `PATCH` |
| **URL** | `/api/v1/geo/divisions/{divisionId}` |
| **Authentication** | Yes — Super Admin only |
| **Request Parameters** | Path: `divisionId` |
| **Request Body** | `{ "name"?: "string", "regionId"?: "id", "isActive"?: "boolean" }` |
| **Response** | Updated org unit object (Section 7.6.3 shape) |
| **Validation Rules** | `regionId`, if present: must reference an active Region-level org unit |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 DIVISION_NOT_FOUND`, `501 NOT_ENABLED` |
| **Related Database Entities** | `org_unit`, `audit_log` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §28 Organization Hierarchy Model |
| **Related AI Agent** | None |

#### 7.6.5 Delete Division (Deactivate)

| | |
|---|---|
| **Purpose** | Soft-delete (deactivate) a Division-level org unit |
| **HTTP Method** | `DELETE` |
| **URL** | `/api/v1/geo/divisions/{divisionId}` |
| **Authentication** | Yes — Super Admin only |
| **Request Parameters** | Path: `divisionId` |
| **Request Body** | None |
| **Response** | `204 No Content` |
| **Validation Rules** | Rejected (`409`) if active children (e.g. Ward-level org units) exist |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 DIVISION_NOT_FOUND`, `409 ORG_UNIT_HAS_ACTIVE_CHILDREN`, `501 NOT_ENABLED` |
| **Related Database Entities** | `org_unit`, `audit_log` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §28 Organization Hierarchy Model |
| **Related AI Agent** | None |

---

### 7.7 Ward APIs

The tenant's operational Ward — finest tier of the existing `district`/`zone`/`ward` geography (`DATABASE_DESIGN.md` §5), unchanged from v1.0. Phase-1, required — this is the level `citizen_profile.wardId` and `complaint.location` reference directly.

#### 7.7.1 List Wards

| | |
|---|---|
| **Purpose** | Retrieve the tenant's configured wards |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/geo/wards` |
| **Authentication** | Yes — any authenticated role |
| **Request Parameters** | `?zoneId=`, `?isActive=true` (default), `?page=`, `?size=` |
| **Request Body** | None |
| **Response** | `{ "data": [ { "id", "code", "name", "zoneId", "isActive" } ], "meta": { "pagination" } }` |
| **Validation Rules** | `size`: max 200 (wards are the most numerous geography level) |
| **Error Responses** | `401 UNAUTHORIZED` |
| **Related Database Entities** | `ward`, `zone` |
| **Related Functional Module** | SRS §3.4 Admin Module — Districts/Zones/Wards (CRUD) |
| **Related AI Agent** | None |

#### 7.7.2 Create Ward

| | |
|---|---|
| **Purpose** | Add a ward under a zone |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/geo/wards` |
| **Authentication** | Yes — Corporation Admin / Super Admin |
| **Request Parameters** | None |
| **Request Body** | `{ "code": "string", "name": "string", "zoneId": "id" }` |
| **Response** | `{ "id", "code", "name", "zoneId", "isActive": true, "createdAt" }` |
| **Validation Rules** | `zoneId`: required, must reference an active zone within tenant; `code`: unique within tenant |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 ZONE_NOT_FOUND`, `409 WARD_CODE_ALREADY_EXISTS` |
| **Related Database Entities** | `ward`, `zone` |
| **Related Functional Module** | SRS §3.4 Admin Module — Districts/Zones/Wards (CRUD) |
| **Related AI Agent** | None |

#### 7.7.3 Get Ward

| | |
|---|---|
| **Purpose** | Retrieve a single ward's detail |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/geo/wards/{wardId}` |
| **Authentication** | Yes — any authenticated role |
| **Request Parameters** | Path: `wardId` |
| **Request Body** | None |
| **Response** | `{ "id", "code", "name", "zoneId", "isActive", "createdAt" }` |
| **Validation Rules** | None (read-only) |
| **Error Responses** | `401 UNAUTHORIZED`, `404 WARD_NOT_FOUND` |
| **Related Database Entities** | `ward` |
| **Related Functional Module** | SRS §3.4 Admin Module — Districts/Zones/Wards (CRUD) |
| **Related AI Agent** | None |

#### 7.7.4 Update Ward

| | |
|---|---|
| **Purpose** | Rename, re-parent, or deactivate a ward |
| **HTTP Method** | `PATCH` |
| **URL** | `/api/v1/geo/wards/{wardId}` |
| **Authentication** | Yes — Corporation Admin / Super Admin |
| **Request Parameters** | Path: `wardId` |
| **Request Body** | `{ "name"?: "string", "zoneId"?: "id", "isActive"?: "boolean" }` |
| **Response** | Updated ward object (Section 7.7.3 shape) |
| **Validation Rules** | `zoneId`, if present: must reference an active zone within tenant |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 WARD_NOT_FOUND` |
| **Related Database Entities** | `ward`, `audit_log` |
| **Related Functional Module** | SRS §3.4 Admin Module — Districts/Zones/Wards (CRUD) |
| **Related AI Agent** | None |

#### 7.7.5 Delete Ward (Deactivate)

| | |
|---|---|
| **Purpose** | Soft-delete (deactivate) a ward |
| **HTTP Method** | `DELETE` |
| **URL** | `/api/v1/geo/wards/{wardId}` |
| **Authentication** | Yes — Corporation Admin / Super Admin |
| **Request Parameters** | Path: `wardId` |
| **Request Body** | None |
| **Response** | `204 No Content` |
| **Validation Rules** | Rejected (`409`) if active citizen addresses or open complaints reference this ward; deactivation excludes it from new-registration pickers without breaking existing references (`DATABASE_DESIGN.md` §21) |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 WARD_NOT_FOUND`, `409 WARD_IN_ACTIVE_USE` |
| **Related Database Entities** | `ward`, `citizen_profile`, `complaint`, `audit_log` |
| **Related Functional Module** | SRS §3.4 Admin Module — Districts/Zones/Wards (CRUD) |
| **Related AI Agent** | None |

---

### 7.8 Street APIs

Tenant-scoped address granularity below Ward, modeled as `reference_value` rows under a new `STREET` domain (`DATABASE_DESIGN.md` §29 generic pattern) — optional, future-ready, populated incrementally rather than required for Phase-1 address capture.

#### 7.8.1 List Streets

| | |
|---|---|
| **Purpose** | Retrieve known streets, optionally scoped to a ward/locality, for address-form autocomplete |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/geo/streets` |
| **Authentication** | Yes — any authenticated role |
| **Request Parameters** | `?wardId=`, `?localityId=`, `?q=` (free-text prefix match, `API_SPECIFICATION.md` §1.11), `?page=`, `?size=` |
| **Request Body** | None |
| **Response** | `{ "data": [ { "id", "name", "wardId", "localityId" } ], "meta": { "pagination" } }` |
| **Validation Rules** | `size`: max 100; returns an empty list until reference data is populated for this domain — not feature-flag gated |
| **Error Responses** | `401 UNAUTHORIZED` |
| **Related Database Entities** | `reference_domain`, `reference_value` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §29 Reference Data Architecture |
| **Related AI Agent** | None |

#### 7.8.2 Create Street

| | |
|---|---|
| **Purpose** | Register a new street entry (e.g. discovered during citizen address entry or ward onboarding) |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/geo/streets` |
| **Authentication** | Yes — Corporation Admin / Super Admin |
| **Request Parameters** | None |
| **Request Body** | `{ "name": "string", "wardId": "id", "localityId"?: "id" }` |
| **Response** | `{ "id", "name", "wardId", "localityId", "createdAt" }` |
| **Validation Rules** | `name`: required, 2–150 chars; `wardId`: required, must reference an active ward within tenant |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 WARD_NOT_FOUND` |
| **Related Database Entities** | `reference_value`, `ward` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §29 Reference Data Architecture |
| **Related AI Agent** | None |

#### 7.8.3 Get Street

| | |
|---|---|
| **Purpose** | Retrieve a single street's detail |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/geo/streets/{streetId}` |
| **Authentication** | Yes — any authenticated role |
| **Request Parameters** | Path: `streetId` |
| **Request Body** | None |
| **Response** | `{ "id", "name", "wardId", "localityId", "createdAt" }` |
| **Validation Rules** | None (read-only) |
| **Error Responses** | `401 UNAUTHORIZED`, `404 STREET_NOT_FOUND` |
| **Related Database Entities** | `reference_value` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §29 Reference Data Architecture |
| **Related AI Agent** | None |

---

### 7.9 Locality APIs

Tenant-scoped address granularity between Ward and Street, modeled as `reference_value` rows under a new `LOCALITY` domain — same rationale and phase as Section 7.8.

#### 7.9.1 List Localities

| | |
|---|---|
| **Purpose** | Retrieve known localities, optionally scoped to a ward, for address-form dropdowns |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/geo/localities` |
| **Authentication** | Yes — any authenticated role |
| **Request Parameters** | `?wardId=`, `?page=`, `?size=` |
| **Request Body** | None |
| **Response** | `{ "data": [ { "id", "name", "wardId" } ], "meta": { "pagination" } }` |
| **Validation Rules** | `size`: max 100; returns an empty list until reference data is populated for this domain |
| **Error Responses** | `401 UNAUTHORIZED` |
| **Related Database Entities** | `reference_domain`, `reference_value` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §29 Reference Data Architecture |
| **Related AI Agent** | None |

#### 7.9.2 Create Locality

| | |
|---|---|
| **Purpose** | Register a new locality under a ward |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/geo/localities` |
| **Authentication** | Yes — Corporation Admin / Super Admin |
| **Request Parameters** | None |
| **Request Body** | `{ "name": "string", "wardId": "id" }` |
| **Response** | `{ "id", "name", "wardId", "createdAt" }` |
| **Validation Rules** | `name`: required, 2–150 chars; `wardId`: required, must reference an active ward within tenant |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 WARD_NOT_FOUND` |
| **Related Database Entities** | `reference_value`, `ward` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §29 Reference Data Architecture |
| **Related AI Agent** | None |

#### 7.9.3 Get Locality

| | |
|---|---|
| **Purpose** | Retrieve a single locality's detail |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/geo/localities/{localityId}` |
| **Authentication** | Yes — any authenticated role |
| **Request Parameters** | Path: `localityId` |
| **Request Body** | None |
| **Response** | `{ "id", "name", "wardId", "createdAt" }` |
| **Validation Rules** | None (read-only) |
| **Error Responses** | `401 UNAUTHORIZED`, `404 LOCALITY_NOT_FOUND` |
| **Related Database Entities** | `reference_value` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §29 Reference Data Architecture |
| **Related AI Agent** | None |

---

### 7.10 GIS APIs

Tenant-level GIS capability metadata — whether GIS is enabled, and which administrative levels currently have boundary data (`DATABASE_DESIGN.md` §26). Optional in Phase-1.

#### 7.10.1 GIS Capability Status

| | |
|---|---|
| **Purpose** | Report whether GIS is enabled for the tenant and which boundary-bearing levels are populated, so a portal can decide whether to render map-based UI at all |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/geo/gis/status` |
| **Authentication** | Yes — Officer / Department Admin / Corporation Admin / Super Admin |
| **Request Parameters** | None |
| **Request Body** | None |
| **Response** | `{ "gisEnabled": "boolean", "boundaryEntityTypesPopulated": ["ward", "zone"], "mapsProviderConfigured": "boolean" }` |
| **Validation Rules** | None (read-only) |
| **Error Responses** | `401 UNAUTHORIZED` |
| **Related Database Entities** | `feature_flag_config`, `geo_boundary`, `provider_config` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §26 GIS & Geospatial Data Architecture |
| **Related AI Agent** | None |

#### 7.10.2 GIS Administrative Hierarchy Tree

| | |
|---|---|
| **Purpose** | Retrieve the full administrative hierarchy (whichever of District/Zone/Ward or Corporation/Region/Zone/Division is active for the tenant) as a nested tree, annotated with which nodes have a stored boundary — the data source for an Admin Portal GIS onboarding checklist |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/geo/gis/hierarchy` |
| **Authentication** | Yes — Department Admin / Corporation Admin / Super Admin |
| **Request Parameters** | `?rootOrgUnitId=` (optional, defaults to tenant root) |
| **Request Body** | None |
| **Response** | `{ "data": { "id", "name", "orgUnitType", "hasBoundary": "boolean", "children": [ "...recursive..." ] } }` |
| **Validation Rules** | None (read-only) |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `501 NOT_ENABLED` |
| **Related Database Entities** | `org_unit`, `org_unit_type_definition`, `ward`, `zone`, `district`, `geo_boundary` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §26 GIS & Geospatial Data Architecture; §28 Organization Hierarchy Model |
| **Related AI Agent** | None |

---

### 7.11 Map APIs

Rendering-oriented endpoints for a map-based Officer/Admin view. Optional in Phase-1.

#### 7.11.1 Map Configuration

| | |
|---|---|
| **Purpose** | Retrieve the default map rendering configuration (provider, initial center, initial zoom) for the tenant's Officer/Admin Portal |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/geo/map/config` |
| **Authentication** | Yes — Officer / Department Admin / Corporation Admin / Super Admin |
| **Request Parameters** | None |
| **Request Body** | None |
| **Response** | `{ "mapProvider": "google_maps" \| "openstreetmap", "defaultCenter": { "latitude", "longitude" }, "defaultZoom": "integer" }` |
| **Validation Rules** | None (read-only) |
| **Error Responses** | `401 UNAUTHORIZED`, `501 NOT_ENABLED` |
| **Related Database Entities** | `provider_config`, `tenant` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §26.2 Provider Integration |
| **Related AI Agent** | None |

#### 7.11.2 Map Markers

| | |
|---|---|
| **Purpose** | Retrieve complaint pins within a map viewport (bounding box), for map-based complaint visualization |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/geo/map/markers` |
| **Authentication** | Yes — Officer (scoped to own department/ward) / Admin (scoped per role) |
| **Request Parameters** | `?swLatitude=`, `?swLongitude=`, `?neLatitude=`, `?neLongitude=` (bounding box corners, all required), `?statusId=`, `?departmentId=` |
| **Request Body** | None |
| **Response** | `{ "data": [ { "complaintId", "trackingId", "latitude", "longitude", "statusLabel", "priority" } ] }` |
| **Validation Rules** | All four bounding-box coordinates required and within valid lat/long ranges; bounding-box area capped to prevent an unbounded, expensive scan |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `501 NOT_ENABLED` |
| **Related Database Entities** | `geo_point_snapshot`, `complaint` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §26 GIS & Geospatial Data Architecture |
| **Related AI Agent** | None |

---

### 7.12 Reverse Geocoding APIs

Resolves coordinates to addresses via the configured Maps provider, with caching (`DATABASE_DESIGN.md` §26). Optional in Phase-1.

#### 7.12.1 Reverse Geocode

| | |
|---|---|
| **Purpose** | Resolve a single latitude/longitude pair to a human-readable address and ward |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/geo/reverse-geocode` |
| **Authentication** | Yes — Citizen (during complaint registration's location-capture step) / internal service token (Complaint Agent's Location Detection step, SRS §3.1 pipeline) |
| **Request Parameters** | None |
| **Request Body** | `{ "latitude": "number", "longitude": "number" }` |
| **Response** | `{ "resolvedAddress", "resolvedWardId", "providerName", "cached": "boolean" }` |
| **Validation Rules** | `latitude`: required, -90..90; `longitude`: required, -180..180 |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `503 MAPS_PROVIDER_UNAVAILABLE`, `501 NOT_ENABLED` |
| **Related Database Entities** | `reverse_geocode_cache`, `provider_config` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §26 GIS & Geospatial Data Architecture; SRS §3.1 pipeline (Location Detection) |
| **Related AI Agent** | Complaint Agent (when invoked as part of the registration pipeline's location-detection step) |

#### 7.12.2 Batch Reverse Geocode

| | |
|---|---|
| **Purpose** | Resolve multiple latitude/longitude pairs in one call — used by the Analytics/Heatmap jobs when back-filling ward assignment for historical complaints that only ever captured raw coordinates |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/geo/reverse-geocode/batch` |
| **Authentication** | Yes — internal service token (Scheduler/Analytics jobs) / Corporation Admin / Super Admin |
| **Request Parameters** | None |
| **Request Body** | `{ "points": [ { "latitude": "number", "longitude": "number" } ] }` (max 100 points per call) |
| **Response** | `{ "data": [ { "latitude", "longitude", "resolvedAddress", "resolvedWardId", "cached": "boolean" } ] }` |
| **Validation Rules** | `points`: required, 1–100 entries, each within valid lat/long ranges |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `503 MAPS_PROVIDER_UNAVAILABLE`, `501 NOT_ENABLED` |
| **Related Database Entities** | `reverse_geocode_cache`, `provider_config` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §26 GIS & Geospatial Data Architecture |
| **Related AI Agent** | None |

---

### 7.13 Nearby Complaint APIs

Spatial proximity search over registered complaints (`DATABASE_DESIGN.md` §26.4). Optional, Phase-2/3.

#### 7.13.1 Nearby Complaints

| | |
|---|---|
| **Purpose** | Find complaints registered near a given coordinate — supports an Officer/Admin "what else has been reported around here" view and future duplicate-complaint detection |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/complaints/nearby` |
| **Authentication** | Yes — Officer (scoped to own department/ward) / Admin (scoped per role) |
| **Request Parameters** | `?latitude=` (required), `?longitude=` (required), `?radiusMeters=` (default 500, max 5000), `?limit=` |
| **Request Body** | None |
| **Response** | `{ "data": [ { "id", "trackingId", "distanceMeters", "categoryName", "statusLabel" } ] }` |
| **Validation Rules** | `latitude`/`longitude`: required, valid range; `radiusMeters`: max 5000 (prevents an unbounded, expensive scan) |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` (out of scope), `501 NOT_ENABLED` |
| **Related Database Entities** | `geo_point_snapshot`, `complaint` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §26.4 Nearby Complaint Search |
| **Related AI Agent** | None |

---

### 7.14 Heatmap APIs

Spatial density visualization data, pre-aggregated (`DATABASE_DESIGN.md` §26.4) — never computed live over `complaint`, protecting the hottest table in the system per the same denormalization rationale as the Reporting Tables (`DATABASE_DESIGN.md` §17). Optional, Phase-2/3.

#### 7.14.1 Complaint Heatmap

| | |
|---|---|
| **Purpose** | Retrieve complaint density data suitable for rendering a heatmap layer over the tenant's geography |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/geo/heatmap` |
| **Authentication** | Yes — Department Admin / Corporation Admin / Super Admin |
| **Request Parameters** | `?periodStart=` (required), `?periodEnd=` (required), `?departmentId=`, `?categoryId=` |
| **Request Body** | None |
| **Response** | `{ "data": [ { "wardId" \| "zoneId", "latitude", "longitude", "complaintCount" } ] }` |
| **Validation Rules** | `periodStart`/`periodEnd`: required, `periodEnd` ≥ `periodStart`, max 12-month range per call |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `501 NOT_ENABLED` |
| **Related Database Entities** | `geo_analytics_snapshot` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §26 GIS & Geospatial Data Architecture — Heatmap generation |
| **Related AI Agent** | None |

---

### 7.15 Geo Analytics APIs

Statistical complaint breakdown per administrative unit (`DATABASE_DESIGN.md` §26) — distinct from the Heatmap endpoint above (spatial density points) by returning category/trend breakdowns per org unit rather than raw point density. Optional, Phase-2/3.

#### 7.15.1 Geo Analytics Summary

| | |
|---|---|
| **Purpose** | Retrieve complaint density and category breakdown per ward/zone/division for a period, for geography-driven dashboards |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/geo/analytics` |
| **Authentication** | Yes — Department Admin / Corporation Admin / Super Admin |
| **Request Parameters** | `?orgUnitLevel=ward\|zone\|division`, `?periodStart=` (required), `?periodEnd=` (required) |
| **Request Body** | None |
| **Response** | `{ "data": [ { "orgUnitId", "orgUnitName", "complaintCount", "categoryBreakdown": [ { "categoryName", "count" } ] } ] }` |
| **Validation Rules** | `periodStart`/`periodEnd`: required, `periodEnd` ≥ `periodStart` |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `501 NOT_ENABLED` |
| **Related Database Entities** | `geo_analytics_snapshot` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §26 GIS & Geospatial Data Architecture — Geo Analytics |
| **Related AI Agent** | None (structured source; a future AI-narrated geo-insight surface would reuse the Analytics Agent per the pattern already established for Section 5's Analytics Insights endpoint) |

---

### 7.16 Boundary APIs

Manages the GeoJSON polygon boundary for any administrative unit (`geo_boundary`, `DATABASE_DESIGN.md` §26) — a Ward, Zone, District, or any generic `org_unit` node. Optional, Phase-2.

#### 7.16.1 List Boundaries

| | |
|---|---|
| **Purpose** | Retrieve every administrative unit that currently has a stored boundary, for a GIS-onboarding progress view |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/geo/boundaries` |
| **Authentication** | Yes — Department Admin / Corporation Admin / Super Admin |
| **Request Parameters** | `?boundaryEntityType=ward\|zone\|district\|org_unit`, `?page=`, `?size=` |
| **Request Body** | None |
| **Response** | `{ "data": [ { "boundaryEntityType", "boundaryEntityId", "centroidLatitude", "centroidLongitude", "version" } ], "meta": { "pagination" } }` |
| **Validation Rules** | `size`: max 200 |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `501 NOT_ENABLED` |
| **Related Database Entities** | `geo_boundary` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §26 GIS & Geospatial Data Architecture |
| **Related AI Agent** | None |

#### 7.16.2 Get Boundary

| | |
|---|---|
| **Purpose** | Retrieve the GeoJSON polygon boundary for a Ward/Zone/Division or any configurable org-hierarchy node, for map rendering |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/geo/boundaries/{orgUnitId}` |
| **Authentication** | Yes — any authenticated role |
| **Request Parameters** | Path: `orgUnitId` (a `ward`/`zone`/`district`/`org_unit` identifier) |
| **Request Body** | None |
| **Response** | `{ "boundaryEntityType", "boundaryEntityId", "boundaryGeoJson": { "type": "Polygon", "coordinates": [] }, "centroidLatitude", "centroidLongitude", "version" }` |
| **Validation Rules** | `orgUnitId`: must resolve to an existing administrative unit with a stored boundary; if none exists yet, returns `404`, not an empty polygon |
| **Error Responses** | `401 UNAUTHORIZED`, `404 BOUNDARY_NOT_FOUND`, `501 NOT_ENABLED` |
| **Related Database Entities** | `geo_boundary`, `org_unit` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §26 GIS & Geospatial Data Architecture |
| **Related AI Agent** | None |

#### 7.16.3 Create/Replace Boundary

| | |
|---|---|
| **Purpose** | Upload or fully replace the GeoJSON boundary for an administrative unit — a full-replace `PUT`, since a boundary is a singleton attribute of its owning entity (`DATABASE_DESIGN.md` §26), not an independently addressable collection member |
| **HTTP Method** | `PUT` |
| **URL** | `/api/v1/geo/boundaries/{orgUnitId}` |
| **Authentication** | Yes — Corporation Admin / Super Admin |
| **Request Parameters** | Path: `orgUnitId` |
| **Request Body** | `{ "boundaryGeoJson": { "type": "Polygon", "coordinates": [] }, "source": "string (e.g. survey_department, manual_digitization)" }` |
| **Response** | `{ "boundaryEntityType", "boundaryEntityId", "centroidLatitude", "centroidLongitude", "version": "int (incremented on replace)", "updatedAt" }` — centroid is computed server-side from the supplied polygon |
| **Validation Rules** | `boundaryGeoJson`: required, must be a valid GeoJSON `Polygon`/`MultiPolygon`; `orgUnitId`: must resolve to an existing administrative unit within tenant |
| **Error Responses** | `400 VALIDATION_ERROR` (including malformed GeoJSON), `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 ORG_UNIT_NOT_FOUND`, `501 NOT_ENABLED` |
| **Related Database Entities** | `geo_boundary`, `config_change_history` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §26 GIS & Geospatial Data Architecture |
| **Related AI Agent** | None |

#### 7.16.4 Delete Boundary

| | |
|---|---|
| **Purpose** | Remove the stored boundary for an administrative unit (soft-delete — the unit itself is unaffected, only its GIS boundary data is cleared) |
| **HTTP Method** | `DELETE` |
| **URL** | `/api/v1/geo/boundaries/{orgUnitId}` |
| **Authentication** | Yes — Corporation Admin / Super Admin |
| **Request Parameters** | Path: `orgUnitId` |
| **Request Body** | None |
| **Response** | `204 No Content` |
| **Validation Rules** | None beyond existence check |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 BOUNDARY_NOT_FOUND`, `501 NOT_ENABLED` |
| **Related Database Entities** | `geo_boundary`, `audit_log` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §26 GIS & Geospatial Data Architecture |
| **Related AI Agent** | None |

---

*(End of Section 7. Continuation into Section 8 — Notification APIs — is a separate file per the same splitting request.)*
