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
| Complaint | ✅ Done | `docs/complaint.yaml`, `docs/API_SPECIFICATION.md` §4 | All 13 operations: Register, Register Voice (stubbed `501 NOT_ENABLED` — no AI/Voice module yet), Upload Attachment (magic-byte file-type validation, max 5 per complaint), Update, Details, Timeline, Tracking (by trackingId), List (officer/admin queue, cursor-paginated, department-scoped), Assignment (with reassignment history and out-of-scope-officer guard), Resolution, Closure, Citizen Feedback, Reopen. Idempotency-key middleware on Register/Voice/Feedback. `/api/v1/complaints/nearby` (declared in `geographic.yaml`) intentionally not wired here — it depends on the still-unapproved Geographic v1.1 GIS entities. |
| Notification | ✅ Done (with documented degradations — see "Known limitations") | `docs/notification.yaml`, `docs/08-Notification-APIs.md` | All ~60 operations across all 16 subsections: SMS/Email/WhatsApp/Push send+status+test-send (§8.2-8.5), In-App inbox (§8.6), Templates with versioning/preview/test-send (§8.7 — approval workflow degrades, see below), Preferences incl. Emergency Override (§8.8), Queue/Schedule/Cancel/Dead-Letter (§8.9), History incl. export (§8.10 — export degrades), Retry incl. bulk (§8.11), Provider read view (§8.12), Broadcast (§8.13, ward/zone/district/department/tenant scope resolution via the Geographic hierarchy), Bulk (§8.14), Analytics (§8.15, live-aggregated not pre-aggregated), Health (§8.16). One generic dispatch pipeline (`notification_event`→`notification_dispatch`) backs every channel-typed endpoint per §8.1.1. Mock provider adapters only (`src/providers/notification/*`) — no real SMS/Email/WhatsApp/Push gateway integrated. Consumes the Complaint module's already-published domain events (`ComplaintCreated/Assigned/Resolved/Closed/Reopened`, `CitizenFeedbackReceived`) via a BullMQ repeatable job (`src/jobs/eventConsumer.job.js`) calling the idempotent `notification.service.js#consumeDomainEvents`. Delivery itself runs on a separate BullMQ worker/PM2 process (`worker.js`, `src/jobs/notificationDispatch.job.js`), reusing the already-declared `notification-dispatch` queue (`src/queues/index.js`, retry: 3 attempts/exponential backoff). |

## Pending modules

Everything below is still the Phase-1 scaffold placeholder (`module.exports = {}` /
an empty `Router()`) — no business logic, no routes wired up:

- **AI** (`docs/API_SPECIFICATION.md` §5) — Complaint/Officer/Analytics/Voice
  Agents, Claude integration, PII masking pipeline.
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
- **OTP/password-reset/new-staff-invite delivery is still a `logger.debug`
  dev-mode stub** (`src/services/otp.service.js`, `src/services/auth.service.js`,
  `src/services/admin.service.js`) — the Notification module now exists, but
  Auth/Administration were not modified to call it (out of scope for "implement
  ONLY the Notification module"); wiring them to call
  `notification.service.js`'s dispatch functions instead of logging is a
  follow-up task, not done here.
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
- **`docs/complaint.yaml`'s `trackingId` path pattern (`^[A-Z]{2,10}-[A-Z]{2,10}-\d{6}-\d{6}$`)
  disagrees with `docs/administration.yaml`'s department `code` validator
  (`^[A-Z0-9]{2,10}$`, alphanumeric)**: `src/utils/trackingId.js` builds the
  tracking ID's department segment directly from `department.code`, so any
  tenant that provisions a department code containing a digit (e.g. `DEPT01`,
  a valid administration.yaml code today) will mint a tracking ID that the
  Complaint module's own `GET /complaints/track/:trackingId` validator then
  rejects as malformed (`400`). Not fixed unilaterally in either direction —
  needs a spec decision (loosen the tracking-ID pattern, or restrict
  department codes to letters-only) rather than a silent code change.
  `tests/integration/complaintLifecycle.test.js` works around it by using a
  letters-only department code fixture, faithfully exercising the documented
  pattern rather than the conflict.
- **Notification Template approval workflow (draft/pending_approval/approved/rejected) is not persisted** —
  `notification_template_config` (`DATABASE_DESIGN.md` §7) has no
  `approvalStatus`/`submittedBy`/`decidedBy`/`decidedAt` columns. Every
  created template is treated as immediately usable (`src/dtos/notification.dto.js`'s
  `shapeTemplateSummary` always reports `approved`); `POST
  .../submit-for-approval` and `.../approval-decision` are routed,
  RBAC-gated, and Swagger-documented but respond `501 NOT_ENABLED` — the
  same degradation pattern as Geographic's v1.1 entities. Needs a schema
  decision, not a code-only fix.
- **`htmlBodyTemplate` is not supported** — no column exists on
  `notification_template_config` for an HTML body variant; `POST`/`PATCH
  .../notification-templates` reject it with `400 VALIDATION_ERROR` rather
  than silently discarding it. `subjectTemplate` (email-only) **is**
  supported, packed into the same `bodyTemplate` TEXT column behind a
  documented `SUBJECT::` marker (`src/dtos/notification.dto.js`'s
  `encodeBodyTemplate`/`decodeBodyTemplate`) — the same "reuse an existing
  column with a documented convention" precedent as Complaint's
  `closureReasonId`.
- **Notification Preference quiet hours and category opt-outs are not
  persisted** — `notification_preference` (`DATABASE_DESIGN.md` §11) has
  only `user_id`/`channel`/`is_enabled`; `GET/PATCH
  /notification-preferences/me` always report `quietHours: null` and
  `categoryOptOuts: []`. Optimistic concurrency (`expectedVersion`/`409
  CONCURRENT_MODIFICATION`) is likewise accepted-but-not-enforced — there is
  no `version` column, so every `PATCH` succeeds unconditionally (the
  `ALL_CHANNELS_DISABLED` business rule is still enforced, evaluated over
  the full known channel set so a channel with no row yet — implicitly
  enabled by the model default — correctly counts as "still reachable").
- **`notification_dispatch` has no `priority`/`scheduledAt`/`lastFailureReason`
  columns** (`DATABASE_DESIGN.md` §11) — `priority` and `scheduledAt` are
  genuinely Redis/BullMQ-resident by the spec's own design (§8.1.5: "Queue
  state itself is Redis-resident"), so this isn't a gap so much as the
  documented architecture — a read after creation just can't recover them
  from MySQL. `lastFailureReason` (Dead Letter Queue listing) has nowhere to
  persist to and is always `null`.
- **Retry History is synthesized, not a true audit trail** —
  `notification_dispatch.retry_count` (Section 11) is a single integer, not
  a per-attempt table, so `GET /notifications/{id}/retries` returns at most
  one entry reflecting current state, not one row per historical attempt.
- **Provider Performance Analytics can't attribute history per-provider** —
  `notification_dispatch` has no `providerConfigId` column; `providerMessageId`
  is an opaque string, not a provider identity. Reports the single,
  currently-configured provider for the channel against the period's whole
  aggregate.
- **Notification Analytics is live-aggregated, not pre-aggregated** — no
  notification-specific reporting table exists (only Complaint's
  daily/weekly/monthly report tables do); computed on the fly over
  `notification_dispatch` per request, a documented deviation from §8.1.8's
  "computed by a scheduled job" preference, acceptable at pilot scale.
- **Notification History Export responds `501 NOT_ENABLED`** — it's
  documented to reuse the Reports module's async-export/signed-URL
  infrastructure (`API_SPECIFICATION.md` §9.8), which doesn't exist yet
  (Reports and File Management are both still Phase-1 placeholders above).
- **`notification.yaml`'s provider `providerType` enum includes `push`,
  but `administration.yaml`'s already-approved `provider_config.providerType`
  enum (`06-Administration-APIs.md` §6.11) is `ai|voice|sms|whatsapp|email|maps`
  — no `push`.** No `provider_config` row is seeded for `push`; `GET
  /notification-providers/push` 404s by design rather than inventing an
  enum value outside the approved list. Needs a spec decision.
- **`src/seeders/20260101010011-seed-notification-templates.js`'s event
  names don't match what Complaint actually publishes** — it seeds
  `ComplaintRegistered`/`StatusChanged`/`SLABreaching` (illustrative names
  copied from `ARCHITECTURE.md` §10.1's example diagram), but
  `src/services/complaint.service.js#EVENT_TYPES` publishes
  `ComplaintCreated`/`ComplaintAssigned`/`ComplaintResolved`/`ComplaintClosed`/
  `ComplaintReopened`/`CitizenFeedbackReceived`. Not modified (data, not
  schema, but an existing seeder already run in dev shouldn't be silently
  changed); `src/seeders/20260101010014-seed-notification-templates-complaint-events.js`
  adds templates for the real event names alongside it.
- **`notification_event.payload_summary` is physically MySQL `longtext`,
  not a native `JSON` column**, despite the model/migration declaring
  `DataTypes.JSON` (verified via `DESCRIBE notification_event` — a
  pre-existing quirk from the database-layer phase, not introduced here).
  mysql2/Sequelize doesn't auto-parse it back into an object on a fresh
  `SELECT`; Complaint (the only prior writer) never read it back
  structurally, so this never surfaced before the Notification module's
  domain-event consumer needed to. Fixed with a read-side getter on the
  model (`src/models/notificationEvent.model.js`) — an application-layer
  fix, not a migration altering the already-approved table.
- **No live Redis or Docker in this development environment** — integration
  tests substitute `ioredis-mock` (fully in-process, no network dependency);
  manual/live verification of Redis-touching endpoints against the running dev
  server isn't possible here (same constraint noted since the backend-
  foundation phase). Redis's client now has a `commandTimeout` (added while
  building Geographic) so a genuinely-down Redis fails fast instead of hanging
  ~100s. BullMQ's separate connection (`src/queues/connection.js`) needed the
  same treatment while building Notification: its `Queue`/`Worker`
  constructors connect eagerly (unlike a plain ioredis client, `lazyConnect`
  doesn't prevent this) and the base `retryStrategy` never gave up, so
  merely `require`-ing `src/queues` with no live Redis would retry forever
  and hang `npm run build`'s require-everything check — bounded to 5
  attempts. Separately, BullMQ's own Lua-script commands (`.add()`,
  `getWaitingCount()`) can hang rather than reject promptly against
  `ioredis-mock` specifically (missing `cmsgpack` support) — every BullMQ
  call site in `src/services/notification.service.js` is wrapped in a
  500ms `withTimeout` so a slow/hung queue call can never block the
  durable MySQL-side business logic, in tests or in a genuinely degraded
  production Redis.
- **`config/database.js` bug found and fixed during the Authentication
  phase**: it didn't apply the `_test` database-name suffix `config/config.js`
  (migrations/seeders) already used, so `NODE_ENV=test` runs were silently
  reading/writing the dev database. Fixed in `src/config/env.js`.

## Test suite

243 Jest tests passing (unit + integration, via `npm test` in `backend/`) as of
this writing (2026-07-23) — see `backend/tests/`. Integration tests run against
a real, migrated `grievance_platform_test` MySQL database and `ioredis-mock`.
Note: both `tests/integration/complaintLifecycle.test.js` and
`tests/integration/notificationLifecycle.test.js` create their own tenant
(`status: 'active'`) rather than reusing the shared `TEST_AUTH` fixture
tenant, and deactivate it in `afterAll` — without that, a second active
tenant coexisting with `TEST_AUTH` trips
`auth.service.js#resolveSingleActiveTenant`'s "exactly one active tenant"
Phase-1 assumption for whichever of `citizenAuth.test.js` /
`tokenRefreshLogout.test.js` Jest happens to schedule afterward (file
scheduling is size-based, not alphabetical, when there's no timing cache).
Separately, `tests/integration/adminRolePermission.test.js` assumed the
global `officer` system role already existed — true only if
`adminUser.test.js`/`rbacMiddleware.test.js` (the files that actually create
it via `getOrCreateGlobalRole`) happened to run first. Adding the larger
Notification test file shifted Jest's size-based scheduling order enough to
break that unstated cross-file dependency; fixed by having
`adminRolePermission.test.js` ensure the role itself (idempotent
`findOrCreate`), rather than relying on execution order.

## Documentation status correction (2026-07-21)

A previous status summary reported "Administration module: complete and
verified" before any Administration code existed in this repository
(`admin.controller.js`/`admin.service.js` were still empty placeholders at the
time). That status has been corrected here now that the module is genuinely
implemented and tested. Treat any status claim in chat history as unverified
until cross-checked against this file and the actual code.
