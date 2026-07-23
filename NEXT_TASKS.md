# Next Tasks

Companion to `CURRENT_STATE.md` — that file says what exists; this one says
what's next and in what order, based purely on dependency (what blocks what),
not on any externally-communicated timeline.

## Immediate next candidate: Notification module

Complaint (Auth, Geographic, Administration's prerequisite) is now done — see
`CURRENT_STATE.md`. The next module with the widest payoff is Notification: it
retires three separate `logger.debug` dev-mode stubs at once (citizen/officer
OTP delivery, password-reset token delivery, new-staff invite email — grep
`dev-mode stub` across `src/services/`) and is a prerequisite for the
Complaint module's own citizen-facing status-change notifications, which
don't exist yet (Complaint only writes `audit_log`/timeline entries today, it
never notifies the citizen). Recommended before starting it:

1. Confirm scope the same way this project has for every prior module: read
   `docs/API_SPECIFICATION.md` (Notification section), `docs/08-Notification-APIs.md`,
   and `docs/notification.yaml` in full before writing any code, and
   cross-check every referenced database entity against
   `docs/DATABASE_DESIGN.md` §1-25 (v1.0, approved).
2. `provider_config` already has SMS/WhatsApp/Email rows seeded (see
   Administration's Provider Configuration) — the Notification module is what
   finally consumes them; check `src/services/admin.service.js`'s Provider
   read/activate paths for the existing shape before adding a new one.

## Needs a spec decision before it can be closed out

- **Complaint tracking-ID / department-code format conflict**
  (`docs/complaint.yaml`'s `trackingId` pattern vs `docs/administration.yaml`'s
  department `code` validator — see `CURRENT_STATE.md`'s "Known limitations").
  A department code containing a digit currently produces a tracking ID that
  the Complaint module's own tracking endpoint would reject as malformed. Needs
  one spec changed to match the other, not a code-only fix.

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
- Once the Notification module exists, replace the `logger.debug` dev-mode
  stubs for OTP delivery, password-reset token delivery, and new-staff invite
  email (grep `dev-mode stub` across `src/services/`) with real dispatch calls.
