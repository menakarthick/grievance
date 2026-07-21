# Current State

Snapshot of what actually exists in this repository, as of 2026-07-21. This file
tracks *implementation* status — it is not a project plan (see `NEXT_TASKS.md`
for that) and it is not a substitute for reading the approved specs in `docs/`.

> **How to keep this honest**: update this file in the same commit as any change
> that adds, removes, or degrades a module's status. A status here that
> contradicts the actual code is worse than no status at all.

## Implemented modules

| Module | Status | Backing spec | Notes |
|---|---|---|---|
| Backend foundation (Express, Sequelize, Redis, BullMQ, Winston, Helmet, CORS, JWT scaffold, Docker, PM2) | ✅ Done | `docs/ARCHITECTURE.md`, `docs/INFRASTRUCTURE_DEVOPS.md` | No business logic; the app boots, connects to MySQL/Redis, serves Swagger. |
| Database layer (52 tables) | ✅ Done | `docs/DATABASE_DESIGN.md` §1-25 (v1.0, Approved in Principle) | Sections 26-34 (v1.1) deliberately excluded — see "Pending client approvals" below. |
| Authentication & Authorization | ✅ Done | `docs/authentication.yaml`, `docs/14-API-Security.md` | All 11 operations: citizen OTP, officer password+OTP, admin password+TOTP-MFA, refresh rotation, logout, forgot/reset password, token validate. RBAC middleware (`authenticate`, `optionalAuthenticate`, `requireRole`, `requirePermission`, `requireTenant`) built here and reused by every module since. |
| Geographic | ✅ Done (partial by design) | `docs/geographic.yaml`, `docs/07-Geographic-APIs.md` | District/Zone/Ward: real, full CRUD. State/Corporation/Region/Division/Street/Locality/GIS/Map/Geocoding/Heatmap/Analytics/Boundaries: routes exist, RBAC-gated, Swagger-documented, but respond per the spec's own degradation contract (empty list / 404 / `501 NOT_ENABLED`) because their backing v1.1 entities aren't approved yet. `/api/v1/complaints/nearby` is declared in `geographic.yaml` but mounted under the Complaint module — not wired up (Complaint module doesn't exist yet). |
| Administration | ✅ Done | `docs/administration.yaml`, `docs/06-Administration-APIs.md` | All 43 operations: Department, Complaint Category, User (Officer/Admin provisioning with privilege-escalation guards), Role, Permission (read-only), Approval Workflow / SLA Rule / Escalation Rule (versioned config, per `DATABASE_DESIGN.md` §22), Tenant Configuration (partial — see limitations), Feature Flags, Providers. |

## Pending modules

Everything below is still the Phase-1 scaffold placeholder (`module.exports = {}` /
an empty `Router()`) — no business logic, no routes wired up:

- **Complaint** (`docs/complaint.yaml` / `docs/API_SPECIFICATION.md` §4) — the
  core citizen-facing grievance-filing and lifecycle module. Nothing else in the
  platform is usable end-to-end without this.
- **AI** (`docs/API_SPECIFICATION.md` §5) — Complaint/Officer/Analytics/Voice
  Agents, Claude integration, PII masking pipeline.
- **Notification** (`docs/08-Notification-APIs.md`) — SMS/WhatsApp/Email/Push
  dispatch. Auth and Administration currently stand in with a "dev-mode log
  stub" wherever a real notification would fire (OTP delivery, password-reset
  token delivery, new-staff invite email) — see "Known limitations" below.
- **Reports** (`docs/09-Reports-APIs.md`)
- **Audit** (`docs/10-Audit-APIs.md`) — note: audit *writes* already happen
  (`src/audit/index.js`, called from Auth and Administration on every
  state-changing action into `audit_log`/`auth_event_log`); only the *read/query*
  API surface for browsing that data is unbuilt.
- **File Management** (`docs/11-File-Management-APIs.md`)

## Features intentionally deferred

- **Geographic v1.1 entities** (State/Corporation/Region/Division/Street/
  Locality/GIS/Map/Geocoding/Heatmap/Analytics/Boundaries) — see "Pending
  client approvals" below. This is the single largest deferred scope item.
- **Tenant Configuration PATCH** (`docs/06-Administration-APIs.md` §6.9.2) —
  `defaultLanguage`/`sessionTimeouts`/`passwordPolicy`/`reopenWindowDays` are
  documented as settable, but `tenant` (`DATABASE_DESIGN.md` §5) has no columns
  to persist them to. GET returns real tenant fields plus current platform-wide
  defaults; PATCH responds `501 NOT_ENABLED` rather than silently discarding the
  caller's change. Needs either a schema addition or a dedicated
  tenant-settings table — not yet proposed for approval.
- **Provider secrets are stored as literal reference strings**, not resolved
  against a real secrets manager (none exists yet) — `provider_config
  .secret_reference` and `mfa_device.secret_reference` hold what will
  eventually be a secrets-manager key, but today the "secret" for MFA is the
  actual TOTP seed (documented in `src/services/auth.service.js`).
- **OTP/password-reset/new-staff-invite delivery** is a `logger.debug`
  dev-mode stub (`src/services/otp.service.js`, `src/services/auth.service.js`,
  `src/services/admin.service.js`) — there is no Notification module yet to
  hand these off to.
- **Multi-tenant citizen/geo/admin tenant resolution** — the approved
  Authentication/Geographic/Administration contracts have no `?tenantId=`-style
  resolution mechanism for a tenant-less Super Admin or an anonymous citizen
  request, so all three modules resolve to "the platform's single active
  tenant" (documented Phase-1 pilot simplification in each service file). Fine
  for the single-tenant Tambaram pilot; needs real design work before a second
  tenant onboards.

## Pending client approvals

Per `docs/DATABASE_DESIGN.md` §36: Sections 1-25 (v1.0) are **Approved in
Principle** and are what the database layer implements. Sections 26-34 (v1.1
Enterprise Extension) are **Pending Client Review**:

| Section | Adds | Blocks |
|---|---|---|
| §26 GIS & Geospatial | `geo_boundary`, `geo_point_snapshot`, `reverse_geocode_cache`, `geo_analytics_snapshot` | Geographic Map/Geocoding/Heatmap/Analytics/Boundaries |
| §27 Generic Workflow Engine | `workflow_definition`, `workflow_instance`, etc. | Future non-Complaint G2C/G2G modules only — does not block anything currently in scope |
| §28 Organization Hierarchy | `org_unit`, `org_unit_type_definition` | Geographic Corporation/Region/Division |
| §29 Reference Data Architecture | `reference_domain`, `reference_value`, `reference_value_translation` | Geographic State/Street/Locality |
| §30-34 | Enterprise file metadata, search, data-dictionary standards, governance, AI readiness | Not yet touched by any implemented module |

No implemented module invents any of these tables, columns, or endpoints ahead
of that approval — see each module's row above for exactly how it degrades
instead.

## Known limitations

- **Administration's User DTO has no real `name` field to return** — neither
  `user` nor `staff_profile` (`DATABASE_DESIGN.md` §5) has a display-name
  column (only `citizen_profile` does). `username` is returned as a stand-in
  for `name` in every User response shape (`src/dtos/admin.dto.js`).
- **`complaint_category.default_priority` is an INTEGER column**, but
  `docs/administration.yaml`/`docs/06-Administration-APIs.md` document it as a
  string enum (`low`/`medium`/`high`/`critical`). `src/dtos/admin.dto.js`
  translates between the two (`critical`=1 … `low`=4) at the API boundary; the
  approved integer column itself is unchanged.
- **`provider_config` seed data originally used `providerType: 'smtp'`**,
  which doesn't match the documented enum (`ai|voice|sms|whatsapp|email|maps`).
  Fixed in `src/seeders/20260101010012-seed-system-configuration.js` (now
  `email`) and corrected in the dev database; flagging here in case any
  external reference to the old value exists.
- **No live Redis or Docker in this development environment** — integration
  tests substitute `ioredis-mock` (fully in-process, no network dependency);
  manual/live verification of Redis-touching endpoints against the running dev
  server isn't possible here (same constraint noted since the backend-
  foundation phase). Redis's client now has a `commandTimeout` (added while
  building Geographic) so a genuinely-down Redis fails fast instead of hanging
  ~100s.
- **`config/database.js` bug found and fixed during the Authentication
  phase**: it didn't apply the `_test` database-name suffix `config/config.js`
  (migrations/seeders) already used, so `NODE_ENV=test` runs were silently
  reading/writing the dev database. Fixed in `src/config/env.js`.

## Test suite

148 Jest tests passing (unit + integration, via `npm test` in `backend/`) as of
this writing — see `backend/tests/`. Integration tests run against a real,
migrated `grievance_platform_test` MySQL database and `ioredis-mock`.

## Documentation status correction (2026-07-21)

A previous status summary reported "Administration module: complete and
verified" before any Administration code existed in this repository
(`admin.controller.js`/`admin.service.js` were still empty placeholders at the
time). That status has been corrected here now that the module is genuinely
implemented and tested. Treat any status claim in chat history as unverified
until cross-checked against this file and the actual code.
