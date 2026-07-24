# Next Tasks

Companion to `CURRENT_STATE.md` — that file says what exists; this one says
what's next and in what order, based purely on dependency (what blocks what),
not on any externally-communicated timeline.

## Immediate next candidate: Reports or Audit read API, then wire up existing dev-mode stubs

Complaint, Notification, and File Management are all done — see
`CURRENT_STATE.md`. Remaining threads:

1. **Reports** (`docs/09-Reports-APIs.md`) and **Audit read API**
   (`docs/10-Audit-APIs.md`) are the two remaining fully-unbuilt modules.
   Either would retire a 501 elsewhere: Notification's History Export
   (`GET /notifications/history/export`) and File Management's own
   `resource_share`-adjacent async patterns were both documented as
   depending on Reports' export/signed-URL infrastructure once it exists.
   Reports is also the natural home for `resource_share` itself, if/when
   that table is approved (see "Needs a spec decision" below) — it was
   first introduced in `09-Reports-APIs.md` §9.1.1.
2. **Replace the three `logger.debug` dev-mode stubs** (citizen/officer OTP
   delivery, password-reset token delivery, new-staff invite email — grep
   `dev-mode stub` across `src/services/`) with real calls into
   `src/services/notification.service.js`'s dispatch functions. Not done as
   part of the Notification module itself (out of scope for "implement ONLY
   the Notification module"); Auth/Administration's service files are
   untouched.
3. **Give Complaint citizen-facing notifications a real channel**: Complaint
   already publishes the domain events (`ComplaintCreated` etc. into
   `notification_event`) and Notification already consumes them
   (`src/services/notification.service.js#consumeDomainEvents`, run via
   `src/jobs/eventConsumer.job.js`) — but no templates are seeded for
   production tenants beyond `TAMBARAM`'s `src/seeders/20260101010014-seed-notification-templates-complaint-events.js`.
   Confirm this is sufficient, or extend it, before relying on it for a real
   citizen-facing rollout.
4. **Wire a real virus scanner behind File Management's hook**
   (`src/services/file.service.js#runVirusScanHook`) once one is
   provisioned (ClamAV or equivalent, `ARCHITECTURE.md` §19.2) — currently
   a placeholder that always reports `clean`, immediately, so every other
   documented lifecycle transition (quarantine → hot, downloadable once
   clean) is genuinely exercisable in this codebase.

## Needs a spec decision before it can be closed out

- **Complaint tracking-ID / department-code format conflict**
  (`docs/complaint.yaml`'s `trackingId` pattern vs `docs/administration.yaml`'s
  department `code` validator — see `CURRENT_STATE.md`'s "Known limitations").
  A department code containing a digit currently produces a tracking ID that
  the Complaint module's own tracking endpoint would reject as malformed. Needs
  one spec changed to match the other, not a code-only fix.
- **Notification Template approval workflow has no backing schema**
  (`notification_template_config` has no `approvalStatus` column — see
  `CURRENT_STATE.md`). Every template is immediately usable; `submit-for-approval`/
  `approval-decision` respond `501`. Needs a schema addition (new columns, or
  a decision to drop the workflow requirement) before this can be closed out
  for real.
- **`notification.yaml` vs `administration.yaml` provider-type enum conflict**:
  `push` is a valid notification provider type in one document, not the
  other (see `CURRENT_STATE.md`). Needs one spec changed to match the other.
- **`file_asset_metadata` (DATABASE_DESIGN.md §30) and `resource_share`
  (v1.2-proposed) don't exist** — File Metadata's rich fields, File
  Versioning's chain, and all of File Sharing/Access Control's writes are
  degraded pending these tables (see `CURRENT_STATE.md`'s File Management
  entry for exactly what degrades and how). Larger scope than most other
  gaps here — worth scoping as its own approval request rather than folding
  into a general "add missing columns" pass.
- **`file_asset` has no `deleted_at` column** despite
  `11-File-Management-APIs.md` §11.13.1 documenting soft-delete via
  `deleted_at` — `deleted_by` (which does exist) is used as the deletion
  marker instead (see `CURRENT_STATE.md`). Low urgency: functionally
  equivalent for every current use case, but worth reconciling with the doc
  text the next time `file_asset` gets any other schema attention.

## Blocked on client approval (`DATABASE_DESIGN.md` §36)

Cannot proceed without an explicit, separate approval decision — do not start
building the underlying tables speculatively:

- **Geographic**: State/Corporation/Region/Division/Street/Locality/GIS/Map/
  Geocoding/Heatmap/Analytics/Boundaries — needs §28 (`org_unit`), §29
  (`reference_value`), and/or §26 (GIS entities) approved and physically
  migrated first. Once approved, the pattern to follow is already established
  in `src/services/geo.service.js` (districtService/zoneService/wardService) —
  the new services replace the `notEnabled()`/`emptyReferenceList()` stubs in
  `src/controllers/geo.controller.js` one for one; the routes and RBAC policy
  in `src/routes/v1/geo.routes.js` / `src/policies/geo.policy.js` don't need to
  change.

## Needs a product/design decision, not just an approval

- **Tenant Configuration persistence** (`docs/06-Administration-APIs.md`
  §6.9.2): decide whether `defaultLanguage`/`sessionTimeouts`/`passwordPolicy`/
  `reopenWindowDays` become columns on `tenant`, or a new
  `tenant_settings`/`tenant_config` table. Either is a schema change requiring
  the same approval path as any other `DATABASE_DESIGN.md` addition.
- **Multi-tenant resolution for anonymous/tenant-less requests**: Citizen OTP
  request/verify, Geographic reads from a tenant-less Super Admin, and
  Administration's tenant resolution all currently assume "the platform's one
  active tenant" (Phase-1 pilot simplification). Before a second tenant is
  onboarded, this needs a real mechanism — likely a subdomain, a client-
  supplied tenant code header, or a `?tenantId=` override for the Super-Admin
  case specifically (the pattern `docs/14-API-Security.md` §14.9 already
  documents for "specific cross-tenant endpoints"). Search
  `resolveSingleActiveTenant`/`resolveTenantId` across `src/services/` for
  every place this needs to change together.
- **Real secrets manager integration**: `provider_config.secret_reference` and
  `mfa_device.secret_reference` are placeholders (literal values, not resolved
  references) until one exists. Affects Auth (MFA enrollment/verify) and
  Administration (Set Active Provider) simultaneously.

## Housekeeping (low priority, no rush)

- `npm audit`'s one moderate finding (transitive `uuid` via `sequelize`) is
  accepted as out-of-scope per the backend-foundation phase's decision —
  revisit only if upgrading Sequelize's major version becomes necessary for
  another reason anyway.
