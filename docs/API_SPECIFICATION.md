# API Specification Document

## AI Powered Enterprise Citizen Service & Grievance Management Platform

| | |
|---|---|
| **Document Status** | DRAFT — Pending Client Approval |
| **Version** | 1.0 |
| **Date** | 2026-07-20 |
| **Based On** | `docs/SRS.md` v0.2, `docs/ARCHITECTURE.md` v1.0, `docs/INFRASTRUCTURE_DEVOPS.md` v1.0 (all Approved & Frozen), `docs/DATABASE_DESIGN.md` v1.1 (Approved in Principle & Frozen) |
| **Pilot Deployment** | Tambaram City Municipal Corporation, Tamil Nadu, India |
| **Prepared As** | Principal Enterprise API Architect review — API Design layer only |

> **Scope**: This is a conceptual/logical **API design** document, following OpenAPI 3.1 design principles — resources, contracts, methods, error semantics, security model. **No Node.js code, no Express routes, no controllers, no services, no database queries, no implementation.** Request/response shapes below are logical JSON contracts used to communicate design intent, not generated schema files. Physical `openapi.yaml`, code scaffolding, and route wiring are separate, later deliverables.
>
> **Frozen-document constraint**: `docs/SRS.md`, `docs/ARCHITECTURE.md`, `docs/INFRASTRUCTURE_DEVOPS.md`, and `docs/DATABASE_DESIGN.md` (v1.1) are approved and unmodified by this document. Every endpoint below is designed to be satisfiable by the microservices already defined in `ARCHITECTURE.md` §3.1 and the entities already defined in `DATABASE_DESIGN.md` — this document adds an API contract layer on top, it does not require any new service, table, or architectural decision.

---

## 1. API Design Principles

### 1.1 REST Standards

- Resource-oriented URLs; the HTTP method carries the verb, the path never does.
- **Stateless** — no server-side session state at the API layer (`ARCHITECTURE.md` §13.1); every request is fully authenticated/authorized from its JWT alone.
- **Base path**: `/api/v1` — every endpoint below is relative to this, terminated at the API Gateway (`ARCHITECTURE.md` §3.1) before internal routing to the owning service.
- **HATEOAS is deliberately not adopted** (Recommended Default) — a documented, statically-known, versioned contract (this document) is preferred over discoverable hypermedia for a government-integration audience (state ULB integrators, SRS §3.9); simpler for external consumers to implement against.
- **Tenant scoping is never a URL path segment** (no `/tenants/{tenantId}/complaints`). It is derived from the authenticated JWT's `tenantId` claim and enforced at the same Data Access Layer boundary already defined in `DATABASE_DESIGN.md` §3 — this removes an entire class of tenant-enumeration/IDOR risk (OWASP A01) at the API surface itself. The sole exception is Super Admin cross-tenant endpoints, which accept an explicit `tenantId` query parameter because that role's scope structurally spans tenants (`DATABASE_DESIGN.md` §5 `user`).

### 1.2 Resource Naming

- Nouns, never verbs: `/complaints`, `/departments`, `/notification-templates` — never `/getComplaints`, `/createDepartment`.
- `kebab-case` for multi-word path segments; `camelCase` for JSON field names and query parameter names — one convention per layer, never mixed.
- Path parameters use the resource's **external identifier** (Section 1.4 of this document maps to `DATABASE_DESIGN.md` §4's external/public identifier), named `{resource}Id` — e.g. `/complaints/{complaintId}`.

### 1.3 Plural vs. Singular Resources

- Collections are always **plural**: `/complaints`, `/users`, `/roles`, `/wards`.
- A true 1:1 singleton relative to its parent is addressed as a **singular sub-resource with no id in the path**: `/citizens/me`, `/complaints/{complaintId}/sla`.
- An action that produces a new row in a 1:N **history** table (`DATABASE_DESIGN.md` §6, §8 — assignment, approval action, escalation) is still modeled as a **plural** sub-collection: `POST /complaints/{complaintId}/assignments` appends to `complaint_assignment`; `GET` on the same path returns the full assignment history; "the current officer" is simply the latest row by `assignedAt`. There is deliberately no bespoke singular `/assignment` endpoint that would hide the history the database already keeps.

### 1.4 HTTP Methods

| Method | Usage | Idempotent? |
|---|---|---|
| `GET` | Read a resource or collection; never mutates state | Yes |
| `POST` | Create a resource, or execute a state-transition that produces a new history row (Section 1.3) | No, unless an `Idempotency-Key` is supplied (Section 1.5) |
| `PUT` | Full replacement of a singleton resource (e.g. `/citizens/me/address`) | Yes |
| `PATCH` | Partial update (JSON Merge Patch, RFC 7396) — e.g. `/citizens/me`, `/complaints/{complaintId}` | Yes |
| `DELETE` | Soft-delete only (`DATABASE_DESIGN.md` §21) — no API path ever performs a physical row delete; hard delete is exclusively the automated retention-expiry job's responsibility, never an API-triggered action | Yes |

### 1.5 Idempotency

- Every `POST` that creates a citizen-visible resource with real-world consequence (complaint registration, feedback submission, file-upload initiation) **accepts an optional `Idempotency-Key` header** — a client-generated UUID. The server persists a short-lived key→response mapping in Redis (the same store already used for OTP/rate-limiting state, `ARCHITECTURE.md` §16) and replays the original response for a repeated key instead of creating a duplicate. This protects against duplicate complaint registration on citizen network retry — a realistic condition on mobile data in the field (SRS §4.1 concurrent citizen load).
- `PUT`/`PATCH`/`DELETE` are idempotent by HTTP semantics and need no additional key.
- **Idempotency-Key TTL**: 24 hours.

### 1.6 Versioning Strategy

Summarized here, detailed in Section 15: URI versioning (`/api/v1`), additive-only changes within a major version, a new major version only for a breaking change, minimum 6-month deprecation window advertised via `Deprecation`/`Sunset` response headers.

### 1.7 Error Handling

Every error — regardless of which endpoint or owning service produced it — uses the **single envelope defined in Section 12**. Errors are categorized (validation / business / authentication / authorization / server) and every error carries a stable, machine-readable `code` distinct from the transient HTTP status, so client logic never has to parse human-readable `message` text to branch on.

### 1.8 Pagination

| Style | Used For | Mechanism |
|---|---|---|
| **Keyset/cursor (Recommended Default)** | High-volume, time-ordered collections: `/complaints`, `/audit-logs`, `/activity-logs`, `/notifications/history` | `?limit=25&cursor=<opaque>` — the cursor encodes the last-seen `(createdAt, id)` pair; avoids the `OFFSET` performance cliff on the month-partitioned tables (`DATABASE_DESIGN.md` §19) |
| **Offset** | Small, bounded admin/config collections: `/departments`, `/roles`, `/wards`, `/notification-templates` | `?page=1&size=20` — cheap total counts because these are Master/Config tables (`DATABASE_DESIGN.md` §5/§7), not high-write transaction tables |

Every paginated response carries a `meta.pagination` block (Section 12): `{ "nextCursor", "hasMore" }` for keyset endpoints, or `{ "page", "size", "totalCount", "totalPages" }` for offset endpoints — never both styles on one endpoint.

### 1.9 Sorting

- `?sort=field1,-field2` — comma-separated, a leading `-` means descending, ascending by default.
- Each endpoint publishes an explicit sortable-field allow-list; an unrecognized sort field returns `400 VALIDATION_ERROR`, never a silent ignore.

### 1.10 Filtering

- Equality filters: plain query params — `?statusId=3&departmentId=12`.
- Range/comparison filters: bracket notation — `?filter[createdAt][gte]=2026-07-01&filter[createdAt][lte]=2026-07-31`, `?filter[priority][in]=high,critical`.
- Every filterable field is explicitly documented per endpoint — never an open-ended arbitrary-column filter. This is itself an OWASP A03/A04 control: an undocumented filter field cannot be used to probe schema shape or bypass tenant scoping.

### 1.11 Searching

- `?q=<free text>` — backed by MySQL `FULLTEXT` in Phase-1, transparently upgraded to OpenSearch/Elasticsearch in later phases (`DATABASE_DESIGN.md` §31) with **no client-facing contract change** across that backend swap.
- `q` always narrows, never widens, the result set already constrained by tenant scope and other filters on the same endpoint.

### 1.12 Field Selection

- `?fields=id,trackingId,status,createdAt` — sparse fieldset to reduce payload size for list/mobile clients; `id` is always returned regardless of the requested field list.
- Dot-notation selects fields within an expanded relation: `?fields=id,status,assignedOfficer.name`.

### 1.13 Localization

- `Accept-Language: ta` or `en` (BCP-47) drives the language of human-readable labels (status label, category name, rendered template text), resolved against `reference_value_translation` (`DATABASE_DESIGN.md` §29). A `?lang=ta` query fallback exists for clients that cannot set headers (e.g. an IVR/webhook caller).
- Machine-readable fields (`code`, `id`, enum values) are **never** translated — only `label`/`name`/`description`-shaped fields are.
- Default language is the tenant's configured default (`tenant` row) when neither header nor query param is present.

### 1.14 Correlation ID

- `X-Correlation-Id` request header — generated at the API Gateway if absent (`ARCHITECTURE.md` §15), echoed back in the response, and propagated through every internal service call and queue-job payload for one citizen-initiated action. Example: one complaint-registration HTTP request, its async AI-classification job, and its resulting notification dispatch all share one Correlation ID — enabling the cross-service tracing already designed in `ARCHITECTURE.md` §15.

### 1.15 Request ID

- `X-Request-Id` response header — a unique id for **this single HTTP request/response pair**, always server-generated, never client-supplied. Distinct from Correlation ID (which can span many requests/jobs across services): Request ID answers "which exact log line was this HTTP call," Correlation ID answers "which chain of work did this HTTP call kick off." Both appear in every structured log line and every error response (Section 12).

---
## 2. Authentication APIs

Backed by the **Auth Service** (`ARCHITECTURE.md` §3.1 #2) and the login flows in `ARCHITECTURE.md` §7. No AI Agent is involved in any Authentication API — these are deterministic identity/security operations by design (SRS §8.1).

### 2.1 Citizen OTP Request (Citizen Login — Step 1 / OTP Login)

| | |
|---|---|
| **Purpose** | Send a one-time password to a citizen's registered mobile number to begin registration or login (SRS §3.1, §2.5 — Mobile OTP is the only citizen authentication method) |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/auth/citizen/otp/request` |
| **Authentication Required** | No |
| **Request Parameters** | None |
| **Request Body** | `{ "mobileNumber": "string (E.164 or 10-digit Indian mobile)" }` |
| **Response Body** | `{ "requestId": "uuid", "otpExpirySeconds": 300, "resendAllowedAfterSeconds": 30 }` |
| **Validation Rules** | `mobileNumber`: required; matches `^[6-9]\d{9}$` (Indian mobile) or E.164; rate-limited to 3 requests / mobile number / 10 minutes (SRS §8.1 lockout-adjacent control) |
| **Possible Errors** | `400 VALIDATION_ERROR` (malformed number), `429 RATE_LIMITED`, `503 PROVIDER_UNAVAILABLE` (DLT SMS gateway down, SRS §5), `500 INTERNAL_ERROR` |
| **Related Database Entities** | `user` (lookup/pre-create), OTP itself lives only in Redis (`ARCHITECTURE.md` §16), never a MySQL table |
| **Related Functional Module** | SRS §3.2 Citizen Module — Register/Login |
| **Related AI Agent** | None |

### 2.2 Citizen OTP Verify (Citizen Login — Step 2)

| | |
|---|---|
| **Purpose** | Verify the OTP and issue session tokens; creates the `user`/`citizen_profile` row on first-ever verification (registration), or logs in an existing citizen |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/auth/citizen/otp/verify` |
| **Authentication Required** | No |
| **Request Parameters** | None |
| **Request Body** | `{ "requestId": "uuid", "mobileNumber": "string", "otp": "string (6 digits)", "name": "string (required only on first registration)" }` |
| **Response Body** | `{ "accessToken": "jwt", "refreshToken": "opaque", "expiresIn": 900, "user": { "id", "userType": "citizen", "tenantId", "isNewRegistration": "boolean" } }` |
| **Validation Rules** | `otp`: required, exactly 6 digits, must match the hashed OTP on record for `requestId`, single-use, 5-minute TTL; max 5 verify attempts per `requestId` before lockout of that request (SRS §8.1) |
| **Possible Errors** | `400 VALIDATION_ERROR`, `401 OTP_INVALID_OR_EXPIRED`, `429 TOO_MANY_ATTEMPTS`, `500 INTERNAL_ERROR` |
| **Related Database Entities** | `user`, `citizen_profile`, `auth_event_log` |
| **Related Functional Module** | SRS §3.2 Citizen Module; `ARCHITECTURE.md` §7.1 |
| **Related AI Agent** | None |

### 2.3 Officer Login (Password — Step 1)

| | |
|---|---|
| **Purpose** | Authenticate an Officer or Department Admin's username/password and trigger the mandatory OTP second factor (SRS §8.1) |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/auth/officer/login` |
| **Authentication Required** | No |
| **Request Parameters** | None |
| **Request Body** | `{ "username": "string", "password": "string" }` |
| **Response Body** | `{ "otpChallengeId": "uuid", "otpDeliveredTo": "masked-mobile", "otpExpirySeconds": 300 }` |
| **Validation Rules** | `username`/`password`: required, non-empty; password checked against Argon2id hash; account must not be locked (`account_lockout_state`); on failure, `activity_log`/`auth_event_log` records the attempt and the lockout counter increments per SRS §8.1 (5 attempts → 15-minute lock) |
| **Possible Errors** | `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS`, `423 ACCOUNT_LOCKED`, `500 INTERNAL_ERROR` |
| **Related Database Entities** | `user`, `staff_profile`, `account_lockout_state`, `auth_event_log` |
| **Related Functional Module** | SRS §3.3 Officer Module; `ARCHITECTURE.md` §7.2 |
| **Related AI Agent** | None |

### 2.4 Officer OTP Verify (Login — Step 2)

| | |
|---|---|
| **Purpose** | Complete Officer/Department Admin login by verifying the OTP sent in Section 2.3, issuing session tokens |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/auth/officer/otp/verify` |
| **Authentication Required** | No |
| **Request Parameters** | None |
| **Request Body** | `{ "otpChallengeId": "uuid", "otp": "string (6 digits)" }` |
| **Response Body** | `{ "accessToken": "jwt", "refreshToken": "opaque", "expiresIn": 900, "user": { "id", "userType": "officer", "roles": ["string"], "scope": { "scopeType", "scopeId" } } }` |
| **Validation Rules** | Same OTP rules as Section 2.2; `otpChallengeId` must map to a still-valid, unconsumed Officer login challenge |
| **Possible Errors** | `401 OTP_INVALID_OR_EXPIRED`, `429 TOO_MANY_ATTEMPTS`, `500 INTERNAL_ERROR` |
| **Related Database Entities** | `user`, `staff_profile`, `role`, `user_role_assignment`, `auth_event_log` |
| **Related Functional Module** | SRS §3.3 Officer Module |
| **Related AI Agent** | None |

### 2.5 Admin Login (Password — Step 1: Corporation Admin / Super Admin)

| | |
|---|---|
| **Purpose** | Authenticate Corporation Admin / Super Admin credentials and trigger mandatory TOTP MFA (SRS §8.1 — MFA enforcement locked "on" for these two roles) |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/auth/admin/login` |
| **Authentication Required** | No |
| **Request Parameters** | None |
| **Request Body** | `{ "username": "string", "password": "string" }` |
| **Response Body** | `{ "mfaChallengeId": "uuid", "mfaMethod": "totp" }` |
| **Validation Rules** | Identical credential/lockout rules as Section 2.3; additionally rejects login if no verified `mfa_device` exists for this user (forces MFA enrollment flow instead — out of this document's endpoint list as a one-time setup flow, not a recurring login API) |
| **Possible Errors** | `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS`, `423 ACCOUNT_LOCKED`, `409 MFA_NOT_ENROLLED`, `500 INTERNAL_ERROR` |
| **Related Database Entities** | `user`, `staff_profile`, `mfa_device`, `account_lockout_state`, `auth_event_log` |
| **Related Functional Module** | SRS §3.4 Admin Module; `ARCHITECTURE.md` §7.2 |
| **Related AI Agent** | None |

### 2.6 MFA Verify (TOTP — Admin Login Step 2)

| | |
|---|---|
| **Purpose** | Verify the TOTP code from the Admin's authenticator app, completing Corporation Admin / Super Admin login |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/auth/mfa/verify` |
| **Authentication Required** | No |
| **Request Parameters** | None |
| **Request Body** | `{ "mfaChallengeId": "uuid", "totpCode": "string (6 digits)" }` |
| **Response Body** | `{ "accessToken": "jwt", "refreshToken": "opaque", "expiresIn": 900, "user": { "id", "userType": "admin", "roles": ["string"], "scope": { "scopeType", "scopeId" } } }` |
| **Validation Rules** | `totpCode`: required, exactly 6 digits, validated against the TOTP secret referenced by `mfa_device.secret_reference` within a ±30-second clock-skew window; max 5 attempts before the challenge is invalidated |
| **Possible Errors** | `401 MFA_INVALID_OR_EXPIRED`, `429 TOO_MANY_ATTEMPTS`, `500 INTERNAL_ERROR` |
| **Related Database Entities** | `user`, `staff_profile`, `mfa_device`, `auth_event_log` |
| **Related Functional Module** | SRS §8.1 Authentication & Session Security Policy |
| **Related AI Agent** | None |

### 2.7 Refresh Token

| | |
|---|---|
| **Purpose** | Exchange a valid, unexpired refresh token for a new access token, rotating the refresh token itself (SRS §8.1 — single-use, rotated on each use) |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/auth/token/refresh` |
| **Authentication Required** | No (bearer access token not required; the refresh token itself is the credential) |
| **Request Parameters** | None |
| **Request Body** | `{ "refreshToken": "opaque" }` |
| **Response Body** | `{ "accessToken": "jwt", "refreshToken": "opaque (new)", "expiresIn": 900 }` |
| **Validation Rules** | Token must exist in the Redis-backed refresh-token store (`ARCHITECTURE.md` §16), not previously consumed, not expired (7-day TTL); reuse of an already-rotated token **revokes the entire token family** (replay-attack detection) |
| **Possible Errors** | `401 REFRESH_TOKEN_INVALID`, `401 REFRESH_TOKEN_REUSED_FAMILY_REVOKED`, `500 INTERNAL_ERROR` |
| **Related Database Entities** | None (refresh tokens are Redis-only by design, `DATABASE_DESIGN.md` §13 note) |
| **Related Functional Module** | SRS §3.1 Authentication Module; `ARCHITECTURE.md` §7.3 |
| **Related AI Agent** | None |

### 2.8 Logout

| | |
|---|---|
| **Purpose** | Invalidate the caller's current access token (via denylist) and revoke the associated refresh token |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/auth/logout` |
| **Authentication Required** | Yes (any authenticated role) |
| **Request Parameters** | None |
| **Request Body** | `{ "refreshToken": "opaque", "allDevices": "boolean (default false)" }` |
| **Response Body** | `{ "success": true }` |
| **Validation Rules** | Caller's access token must be valid at request time; `allDevices=true` revokes every refresh token issued to this user (used on password change/security incident) |
| **Possible Errors** | `401 UNAUTHORIZED`, `500 INTERNAL_ERROR` |
| **Related Database Entities** | `auth_event_log` |
| **Related Functional Module** | SRS §3.1 Authentication Module |
| **Related AI Agent** | None |

### 2.9 Forgot Password

| | |
|---|---|
| **Purpose** | Initiate a password-reset flow for Officer/Admin-tier accounts by emailing/SMS-ing a reset token (citizen accounts have no password — Mobile OTP only, SRS §2.5) |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/auth/password/forgot` |
| **Authentication Required** | No |
| **Request Parameters** | None |
| **Request Body** | `{ "username": "string" }` |
| **Response Body** | `{ "success": true }` — **always** returns success regardless of whether the username exists (OWASP A07 — prevents username enumeration) |
| **Validation Rules** | `username`: required; rate-limited per username/IP (SRS §8.1); reset token delivered only to the on-file email/mobile, never returned in the API response |
| **Possible Errors** | `400 VALIDATION_ERROR`, `429 RATE_LIMITED`, `500 INTERNAL_ERROR` |
| **Related Database Entities** | `user`, `staff_profile`, `auth_event_log` |
| **Related Functional Module** | SRS §3.1 Authentication Module |
| **Related AI Agent** | None |

### 2.10 Reset Password

| | |
|---|---|
| **Purpose** | Complete the password-reset flow using the token issued by Section 2.9 |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/auth/password/reset` |
| **Authentication Required** | No (the reset token is the credential) |
| **Request Parameters** | None |
| **Request Body** | `{ "resetToken": "string", "newPassword": "string" }` |
| **Response Body** | `{ "success": true }` |
| **Validation Rules** | `resetToken`: required, single-use, time-bound (e.g. 15 minutes); `newPassword`: min 12 characters, upper/lower/digit/special, must not match any of the last 5 password hashes (`password_history`, SRS §8.1) |
| **Possible Errors** | `400 VALIDATION_ERROR` (including `PASSWORD_POLICY_VIOLATION`, `PASSWORD_REUSE_DENIED`), `401 RESET_TOKEN_INVALID_OR_EXPIRED`, `500 INTERNAL_ERROR` |
| **Related Database Entities** | `user`, `staff_profile`, `password_history`, `auth_event_log` |
| **Related Functional Module** | SRS §8.1 Authentication & Session Security Policy |
| **Related AI Agent** | None |

### 2.11 Token Validation

| | |
|---|---|
| **Purpose** | Allow a client or a downstream/internal service to verify that a bearer access token is still valid (not expired, not denylisted) and retrieve its claims — used by the API Gateway's own JWT-verification middleware (`ARCHITECTURE.md` §4.1) and exposed as a documented endpoint for future external integrators (SRS §3.9) |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/auth/token/validate` |
| **Authentication Required** | Yes (the token being validated is passed as the bearer token itself) |
| **Request Parameters** | None |
| **Request Body** | None |
| **Response Body** | `{ "valid": true, "userId", "userType", "tenantId", "roles": ["string"], "expiresAt": "ISO-8601" }` |
| **Validation Rules** | Signature verification, expiry check, denylist check (Redis) — identical checks the Gateway itself already performs per request |
| **Possible Errors** | `401 TOKEN_INVALID`, `401 TOKEN_EXPIRED`, `401 TOKEN_REVOKED` |
| **Related Database Entities** | None (Redis denylist only) |
| **Related Functional Module** | SRS §3.1 Authentication Module |
| **Related AI Agent** | None |

---
## 3. Citizen APIs

Backed by the **Complaint Service** and **Tenant & Admin Config Service** (`ARCHITECTURE.md` §3.1 #3, #4). All endpoints in this section are scoped to `req.user.id` via the access token — no citizen can address another citizen's profile by id.

### 3.1 Get Citizen Profile

| | |
|---|---|
| **Purpose** | Retrieve the authenticated citizen's own profile |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/citizens/me` |
| **Authentication Required** | Yes (Citizen) |
| **Request Parameters** | `?fields=` (Section 1.12, optional sparse fieldset) |
| **Request Body** | None |
| **Response Body** | `{ "id", "name", "mobileNumber", "email", "preferredLanguage", "wardId", "address": { "line1", "line2", "wardId", "pincode" }, "createdAt" }` |
| **Validation Rules** | None (read-only) |
| **Possible Errors** | `401 UNAUTHORIZED`, `404 PROFILE_NOT_FOUND` |
| **Related Database Entities** | `user`, `citizen_profile` |
| **Related Functional Module** | SRS §3.2 Citizen Module |
| **Related AI Agent** | None |

### 3.2 Update Citizen Profile

| | |
|---|---|
| **Purpose** | Partially update the citizen's own name/email/contact-adjacent fields |
| **HTTP Method** | `PATCH` |
| **URL** | `/api/v1/citizens/me` |
| **Authentication Required** | Yes (Citizen) |
| **Request Parameters** | None |
| **Request Body** | `{ "name"?: "string", "email"?: "string" }` (JSON Merge Patch — only supplied fields change) |
| **Response Body** | Updated profile object, same shape as Section 3.1 |
| **Validation Rules** | `name`: 2–100 chars if present; `email`: valid RFC 5322 format if present; `mobileNumber` is **not** patchable here (mobile-number change requires re-verification via Section 2.1/2.2, not a plain field edit — it is the citizen's authentication factor) |
| **Possible Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `500 INTERNAL_ERROR` |
| **Related Database Entities** | `user`, `citizen_profile`, `audit_log` |
| **Related Functional Module** | SRS §3.2 Citizen Module |
| **Related AI Agent** | None |

### 3.3 Update Address

| | |
|---|---|
| **Purpose** | Replace the citizen's registered address in full |
| **HTTP Method** | `PUT` |
| **URL** | `/api/v1/citizens/me/address` |
| **Authentication Required** | Yes (Citizen) |
| **Request Parameters** | None |
| **Request Body** | `{ "line1": "string", "line2"?: "string", "wardId": "id", "pincode": "string" }` |
| **Response Body** | `{ "line1", "line2", "wardId", "pincode", "updatedAt" }` |
| **Validation Rules** | `line1`: required; `wardId`: required, must reference an active `ward` row within the citizen's tenant; `pincode`: required, 6-digit Indian PIN format |
| **Possible Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `422 WARD_NOT_FOUND`, `500 INTERNAL_ERROR` |
| **Related Database Entities** | `citizen_profile`, `ward` |
| **Related Functional Module** | SRS §3.2 Citizen Module; `DATABASE_DESIGN.md` §5 |
| **Related AI Agent** | None |

### 3.4 Update Language Preference

| | |
|---|---|
| **Purpose** | Set the citizen's preferred content/notification language (Tamil/English, SRS §4.4) |
| **HTTP Method** | `PUT` |
| **URL** | `/api/v1/citizens/me/language-preference` |
| **Authentication Required** | Yes (Citizen) |
| **Request Parameters** | None |
| **Request Body** | `{ "languageCode": "ta" \| "en" }` |
| **Response Body** | `{ "languageCode", "updatedAt" }` |
| **Validation Rules** | `languageCode`: required, must be one of the tenant's active `LANGUAGE` `reference_value` codes (`DATABASE_DESIGN.md` §29) — Tamil/English at Phase-1, extensible without a schema change |
| **Possible Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `422 LANGUAGE_NOT_SUPPORTED` |
| **Related Database Entities** | `citizen_profile`, `reference_value` |
| **Related Functional Module** | SRS §4.4 Localization |
| **Related AI Agent** | None |

### 3.5 Update Notification Preference

| | |
|---|---|
| **Purpose** | Set which channels (SMS/Email/WhatsApp/Push) the citizen wants notified on |
| **HTTP Method** | `PUT` |
| **URL** | `/api/v1/citizens/me/notification-preference` |
| **Authentication Required** | Yes (Citizen) |
| **Request Parameters** | None |
| **Request Body** | `{ "channels": [ { "channel": "sms" \| "email" \| "whatsapp" \| "push", "isEnabled": "boolean" } ] }` |
| **Validation Rules** | `channel`: required, one of the four supported values (SRS §5); at least one channel must remain enabled for SLA-breach/status-change notifications critical to complaint resolution |
| **Response Body** | `{ "channels": [ { "channel", "isEnabled" } ], "updatedAt" }` |
| **Possible Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `422 ALL_CHANNELS_DISABLED` |
| **Related Database Entities** | `notification_preference` |
| **Related Functional Module** | SRS §3.2 Citizen Module — Notifications |
| **Related AI Agent** | None |

### 3.6 Citizen Complaint History

| | |
|---|---|
| **Purpose** | List the authenticated citizen's own past and active complaints |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/citizens/me/complaints` |
| **Authentication Required** | Yes (Citizen) |
| **Request Parameters** | `?statusId=`, `?departmentId=`, `?sort=-createdAt` (default), `?cursor=`, `?limit=` (Sections 1.8–1.10) |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "id", "trackingId", "statusLabel", "categoryName", "createdAt" } ], "meta": { "pagination": { "nextCursor", "hasMore" } } }` |
| **Validation Rules** | `limit`: max 100, default 20 |
| **Possible Errors** | `401 UNAUTHORIZED`, `400 VALIDATION_ERROR` (bad cursor) |
| **Related Database Entities** | `complaint`, `complaint_status_definition`, `complaint_category` |
| **Related Functional Module** | SRS §3.2 Citizen Module — Complaint History |
| **Related AI Agent** | None |

### 3.7 Citizen Dashboard

| | |
|---|---|
| **Purpose** | A single aggregated view for the Citizen Portal home screen — open-complaint count, recently updated complaints, unread notification count |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/citizens/me/dashboard` |
| **Authentication Required** | Yes (Citizen) |
| **Request Parameters** | None |
| **Request Body** | None |
| **Response Body** | `{ "openComplaintCount", "resolvedComplaintCount", "recentComplaints": [ { "id", "trackingId", "statusLabel", "updatedAt" } ], "unreadNotificationCount" }` |
| **Validation Rules** | None (read-only, composite response) |
| **Possible Errors** | `401 UNAUTHORIZED`, `500 INTERNAL_ERROR` |
| **Related Database Entities** | `complaint`, `notification_dispatch` |
| **Related Functional Module** | SRS §3.2 Citizen Module |
| **Related AI Agent** | None |

---

## 4. Complaint APIs

Backed by the **Complaint Service** and **Officer Workflow Service** (`ARCHITECTURE.md` §3.1 #4, #5). This is the highest-traffic API group (SRS §4.1 — 500–5000 registrations/day, 2000+ concurrent citizens) and every endpoint here maps directly onto `complaint` and its related tables (`DATABASE_DESIGN.md` §6, §8).

### 4.1 Register Complaint (Text)

| | |
|---|---|
| **Purpose** | File a new text-based grievance; triggers the Complaint Agent classification pipeline and Assignment Engine asynchronously |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/complaints` |
| **Authentication Required** | Yes (Citizen) |
| **Request Parameters** | Header: `Idempotency-Key` (recommended, Section 1.5) |
| **Request Body** | `{ "description": "string", "categoryId"?: "id (optional, AI-assisted if omitted)", "location": { "latitude"?, "longitude"?, "wardId"?, "addressText"? }, "languageCode": "ta" \| "en" }` |
| **Response Body** | `{ "id", "trackingId": "TMBM-ENG-202607-000123", "statusLabel": "Registered", "createdAt" }` (`202 Accepted` semantics — classification/assignment happen asynchronously; the tracking ID is returned immediately per SRS §3.8) |
| **Validation Rules** | `description`: required, 10–5000 chars, sanitized against XSS (OWASP A03); `categoryId`: if present, must belong to the tenant's active `complaint_category` list; `location`: at least one of `wardId` or `addressText` required; `languageCode`: required, must be tenant-active |
| **Possible Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `422 CATEGORY_NOT_FOUND`, `429 RATE_LIMITED`, `500 INTERNAL_ERROR` |
| **Related Database Entities** | `complaint`, `complaint_status_history`, `citizen_profile`, `sla_tracking` (created once assignment completes) |
| **Related Functional Module** | SRS §3.2 Citizen Module — File Complaint; §3.8 Tracking ID |
| **Related AI Agent** | Complaint Agent (category/priority/department/severity/language detection, invoked asynchronously post-registration) |

### 4.2 Register Voice Complaint

| | |
|---|---|
| **Purpose** | File a grievance via a recorded voice note (Tamil or English), per the Voice Complaint Flow (SRS §3.6) |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/complaints/voice` |
| **Authentication Required** | Yes (Citizen) |
| **Request Parameters** | Header: `Idempotency-Key` (recommended) |
| **Request Body** | `multipart/form-data`: `audioFile` (WAV/MP3/OGG, ≤10 MB, ≤5 min — SRS §8.2), `location`, `languageHint`? |
| **Response Body** | `{ "id", "trackingId", "statusLabel": "Registered", "voiceProcessingStatus": "queued", "createdAt" }` — transcript/classification complete asynchronously; client polls Section 4.5 or listens for a notification |
| **Validation Rules** | `audioFile`: required; extension allow-list + magic-byte MIME verification (SRS §8.2); max size/duration enforced before storage; antivirus/malware scan mandatory pre-persistence |
| **Possible Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `413 FILE_TOO_LARGE`, `415 UNSUPPORTED_MEDIA_TYPE`, `422 MALWARE_DETECTED`, `500 INTERNAL_ERROR` |
| **Related Database Entities** | `complaint`, `voice_complaint`, `voice_transcript`, `file_asset`, `file_asset_metadata` |
| **Related Functional Module** | SRS §3.6 Voice Complaint Flow |
| **Related AI Agent** | Voice Agent (speech-to-text, Tamil detection, summary) → hands off to Complaint Agent |

### 4.3 Upload Complaint Attachment (Image)

| | |
|---|---|
| **Purpose** | Attach an image (or officer evidence document, in the Officer flow) to an existing complaint |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/complaints/{complaintId}/attachments` |
| **Authentication Required** | Yes (Citizen — own complaint only; Officer — assigned complaint only) |
| **Request Parameters** | Path: `complaintId` |
| **Request Body** | `multipart/form-data`: `file` (JPEG/PNG/WEBP, ≤5 MB, max 5 files/complaint — SRS §8.2), `assetCategory` (e.g. `before_photo`, `after_photo`, `supporting_document`, sourced from `FILE_ASSET_CATEGORY` reference domain, `DATABASE_DESIGN.md` §30) |
| **Response Body** | `{ "fileAssetId", "assetCategory", "virusScanStatus": "pending", "uploadedAt" }` |
| **Validation Rules** | Extension allow-list + magic-byte MIME check; EXIF stripped on ingest; per-complaint attachment count ≤5 (configurable ceiling, SRS §8.2) |
| **Possible Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` (not owner/assignee), `404 COMPLAINT_NOT_FOUND`, `413 FILE_TOO_LARGE`, `415 UNSUPPORTED_MEDIA_TYPE`, `422 MAX_ATTACHMENTS_EXCEEDED`, `422 MALWARE_DETECTED` |
| **Related Database Entities** | `file_asset`, `file_asset_metadata`, `complaint` |
| **Related Functional Module** | SRS §3.2 Citizen Module — Image Upload; §3.3 Officer Module — Upload Documents |
| **Related AI Agent** | None (AI-generated metadata, if any, populated separately by Complaint Agent) |

### 4.4 Update Complaint

| | |
|---|---|
| **Purpose** | Officer/Admin correction of AI-assigned or citizen-entered fields (e.g. re-categorization, priority override) — never used for status transitions, which have their own dedicated endpoints (Sections 4.9–4.13) |
| **HTTP Method** | `PATCH` |
| **URL** | `/api/v1/complaints/{complaintId}` |
| **Authentication Required** | Yes (Officer — assigned complaint; Department Admin/Corporation Admin — within scope) |
| **Request Parameters** | Path: `complaintId` |
| **Request Body** | `{ "categoryId"?: "id", "priority"?: "string", "severity"?: "string" }` (JSON Merge Patch) |
| **Response Body** | Updated complaint summary (Section 4.5 shape) |
| **Validation Rules** | `categoryId`: must belong to tenant; a category/priority change may recompute `sla_tracking` due date against the applicable `sla_rule_config` version (`DATABASE_DESIGN.md` §22) |
| **Possible Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 COMPLAINT_NOT_FOUND`, `409 COMPLAINT_ALREADY_CLOSED` |
| **Related Database Entities** | `complaint`, `complaint_status_history`, `sla_tracking`, `audit_log` |
| **Related Functional Module** | SRS §3.3 Officer Module |
| **Related AI Agent** | None |

### 4.5 Complaint Details

| | |
|---|---|
| **Purpose** | Retrieve the full detail of a single complaint |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/complaints/{complaintId}` |
| **Authentication Required** | Yes (Citizen — own; Officer — assigned/queue-visible; Admin — within scope) |
| **Request Parameters** | Path: `complaintId`; `?fields=` |
| **Request Body** | None |
| **Response Body** | `{ "id", "trackingId", "description", "categoryName", "statusLabel", "priority", "severity", "location", "currentOfficer": { "id", "name" }, "slaDueAt", "createdAt", "resolvedAt", "closedAt", "attachments": [ { "fileAssetId", "assetCategory" } ] }` |
| **Validation Rules** | None (read-only); requester must be the owning citizen, the assigned officer, or within an Admin's scope — else `403` |
| **Possible Errors** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 COMPLAINT_NOT_FOUND` |
| **Related Database Entities** | `complaint`, `complaint_assignment`, `file_asset`, `sla_tracking` |
| **Related Functional Module** | SRS §3.2/§3.3 — Complaint Details |
| **Related AI Agent** | None |

### 4.6 Complaint Timeline

| | |
|---|---|
| **Purpose** | Retrieve the full append-only status/action history of a complaint |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/complaints/{complaintId}/timeline` |
| **Authentication Required** | Yes (same access rule as Section 4.5) |
| **Request Parameters** | Path: `complaintId`; `?cursor=`, `?limit=` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "fromStatusLabel", "toStatusLabel", "changedBy": { "id", "name" }, "note", "createdAt" } ], "meta": { "pagination" } }` |
| **Validation Rules** | None (read-only, append-only source) |
| **Possible Errors** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 COMPLAINT_NOT_FOUND` |
| **Related Database Entities** | `complaint_status_history` |
| **Related Functional Module** | SRS §3.2 Citizen Module — Timeline |
| **Related AI Agent** | None |

### 4.7 Complaint Tracking (Public Lookup)

| | |
|---|---|
| **Purpose** | Look up a complaint's current status by its human-readable Tracking ID — the citizen-quotable identifier from SRS §3.8, usable via SMS/WhatsApp callback without requiring the citizen to be logged into the exact device/session that filed it |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/complaints/track/{trackingId}` |
| **Authentication Required** | Yes (Citizen — the authenticated citizen must be the complaint's filer; this is **not** an anonymous public endpoint, since complaint content is citizen PII — SRS §2.5 confirms no guest flow in Phase-1) |
| **Request Parameters** | Path: `trackingId` |
| **Request Body** | None |
| **Response Body** | `{ "trackingId", "statusLabel", "categoryName", "currentOfficerName", "lastUpdatedAt" }` — a deliberately narrower shape than Section 4.5, suitable for a lightweight tracking widget |
| **Validation Rules** | `trackingId`: must match the format `{TenantCode}-{DeptCode}-{YYYYMM}-{SequenceNumber}` |
| **Possible Errors** | `400 VALIDATION_ERROR` (malformed tracking ID), `401 UNAUTHORIZED`, `403 FORBIDDEN` (valid ID, not this citizen's complaint), `404 TRACKING_ID_NOT_FOUND` |
| **Related Database Entities** | `complaint` |
| **Related Functional Module** | SRS §3.8 Complaint Tracking ID |
| **Related AI Agent** | None |

### 4.8 Complaint List — Search & Filter

| | |
|---|---|
| **Purpose** | The Officer/Admin queue view — list complaints with full search, filter, and sort (satisfies both **Complaint Search** and **Complaint Filter** from the requested API list; both are query-parameter facets of the same collection endpoint, not separate endpoints, per Section 1.10/1.11's design principle) |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/complaints` |
| **Authentication Required** | Yes (Officer — scoped to assigned/department queue; Admin — scoped per role) |
| **Request Parameters** | `?q=` (free-text search over description, Section 1.11); `?statusId=`, `?departmentId=`, `?categoryId=`, `?priority=`, `?filter[createdAt][gte]=`, `?filter[createdAt][lte]=`, `?filter[slaDueAt][lte]=` (e.g. "breaching soon"); `?sort=-createdAt,priority`; `?cursor=`, `?limit=`; `?fields=` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "id", "trackingId", "statusLabel", "priority", "departmentName", "slaDueAt", "createdAt" } ], "meta": { "pagination": { "nextCursor", "hasMore" } } }` |
| **Validation Rules** | `limit`: max 100; unrecognized `sort`/`filter` field → `400 VALIDATION_ERROR` (Sections 1.9–1.10) |
| **Possible Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` (scope violation) |
| **Related Database Entities** | `complaint`, `complaint_category`, `complaint_status_definition`, `sla_tracking` |
| **Related Functional Module** | SRS §3.3 Officer Module — Pending/Assigned Complaints Queue |
| **Related AI Agent** | None (query itself is deterministic; results may include AI-derived `priority`/`categoryName` set earlier by the Complaint Agent) |

### 4.9 Complaint Assignment

| | |
|---|---|
| **Purpose** | Assign or reassign an officer to a complaint; appends to the assignment history rather than overwriting it (Section 1.3) |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/complaints/{complaintId}/assignments` |
| **Authentication Required** | Yes (Officer Workflow Service system actor for automatic assignment; Department Admin/Corporation Admin for manual override) |
| **Request Parameters** | Path: `complaintId` |
| **Request Body** | `{ "officerId": "id", "reason"?: "string" }` |
| **Response Body** | `{ "id", "complaintId", "officerId", "assignedBy", "assignedAt" }` |
| **Validation Rules** | `officerId`: required, must be an active `staff_profile` within the complaint's department/scope; the previous active assignment (if any) is closed (`unassignedAt` set) atomically with the new one created |
| **Possible Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 COMPLAINT_NOT_FOUND`, `422 OFFICER_OUT_OF_SCOPE`, `409 COMPLAINT_ALREADY_CLOSED` |
| **Related Database Entities** | `complaint_assignment`, `officer_workload`, `complaint_status_history` |
| **Related Functional Module** | SRS §3.3 Officer Module; §3.5 Assignment Agent |
| **Related AI Agent** | Assignment Agent (workload-based auto-assignment when `officerId` is omitted and the system performs the assignment itself) |

### 4.10 Complaint Resolution

| | |
|---|---|
| **Purpose** | Officer marks a complaint resolved, attaching completion evidence |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/complaints/{complaintId}/resolution` |
| **Authentication Required** | Yes (Officer — currently assigned) |
| **Request Parameters** | Path: `complaintId` |
| **Request Body** | `{ "resolutionNote": "string", "resolutionFileAssetIds"?: ["id"] }` |
| **Response Body** | `{ "complaintId", "statusLabel": "Resolved", "resolvedAt" }` |
| **Validation Rules** | `resolutionNote`: required, 10–2000 chars; complaint must currently be in an "in-progress"-family status (not already Resolved/Closed); triggers citizen notification (Notification Agent) |
| **Possible Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` (not assignee), `404 COMPLAINT_NOT_FOUND`, `409 INVALID_STATUS_TRANSITION` |
| **Related Database Entities** | `complaint`, `complaint_status_history`, `sla_tracking`, `file_asset` |
| **Related Functional Module** | SRS §3.3 Officer Module — Update Status |
| **Related AI Agent** | None (resolution itself is a human action; SLA Agent evaluates breach status at this transition) |

### 4.11 Complaint Closure

| | |
|---|---|
| **Purpose** | Formally close a resolved complaint (distinct step from Resolution — allows a citizen-feedback/verification window in between, per the status model in `complaint_status_definition`) |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/complaints/{complaintId}/closure` |
| **Authentication Required** | Yes (Officer or Department Admin) |
| **Request Parameters** | Path: `complaintId` |
| **Request Body** | `{ "closureReasonId": "id (reference_value, CLOSURE_REASON domain)", "remarks"?: "string" }` |
| **Response Body** | `{ "complaintId", "statusLabel": "Closed", "closedAt" }` |
| **Validation Rules** | Complaint must currently be `Resolved`; `closureReasonId` required, must reference an active `CLOSURE_REASON` value (`DATABASE_DESIGN.md` §29); this is the event that starts the 10-year retention countdown (`DATABASE_DESIGN.md` §23) |
| **Possible Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 COMPLAINT_NOT_FOUND`, `409 INVALID_STATUS_TRANSITION` |
| **Related Database Entities** | `complaint`, `complaint_status_history`, `reference_value` |
| **Related Functional Module** | SRS §3.3 Officer Module |
| **Related AI Agent** | None |

### 4.12 Citizen Feedback

| | |
|---|---|
| **Purpose** | Citizen submits a post-resolution rating/comment |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/complaints/{complaintId}/feedback` |
| **Authentication Required** | Yes (Citizen — own complaint, only after Resolution/Closure) |
| **Request Parameters** | Path: `complaintId`; Header: `Idempotency-Key` (recommended) |
| **Request Body** | `{ "rating": "integer 1-5", "comment"?: "string" }` |
| **Response Body** | `{ "complaintId", "rating", "comment", "submittedAt" }` |
| **Validation Rules** | `rating`: required, integer 1–5; one feedback row per complaint (a resubmission is `409`, not silently overwritten, preserving the citizen's original recorded sentiment) |
| **Possible Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` (not filer), `404 COMPLAINT_NOT_FOUND`, `409 FEEDBACK_ALREADY_SUBMITTED`, `409 COMPLAINT_NOT_YET_RESOLVED` |
| **Related Database Entities** | `complaint_feedback` |
| **Related Functional Module** | SRS §3.2 Citizen Module — Feedback |
| **Related AI Agent** | None |

### 4.13 Complaint Reopen

| | |
|---|---|
| **Purpose** | Citizen reopens a closed complaint they consider unresolved, within the tenant-configured reopen window |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/complaints/{complaintId}/reopen` |
| **Authentication Required** | Yes (Citizen — own complaint) |
| **Request Parameters** | Path: `complaintId` |
| **Request Body** | `{ "reason": "string" }` |
| **Response Body** | `{ "complaintId", "statusLabel": "Reopened", "reopenedAt" }` |
| **Validation Rules** | `reason`: required, 10–1000 chars; complaint must be `Closed`; reopen only permitted within the configured reopen window (an Admin-configurable value, e.g. 7 days from `closedAt`) — expired window returns `409`; reopening creates a new `complaint_assignment`/`sla_tracking` cycle rather than mutating the original resolution record, preserving history (Principle 5, `DATABASE_DESIGN.md` §1) |
| **Possible Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 COMPLAINT_NOT_FOUND`, `409 COMPLAINT_NOT_CLOSED`, `409 REOPEN_WINDOW_EXPIRED` |
| **Related Database Entities** | `complaint`, `complaint_status_history`, `complaint_assignment`, `sla_tracking` |
| **Related Functional Module** | SRS §3.2 Citizen Module |
| **Related AI Agent** | None |

---
## 5. AI APIs

Backed by the **AI Orchestration Service** and **Voice Processing Service** (`ARCHITECTURE.md` §3.1 #7, #8; §4.2 internal component diagram). Every request/response here passes through the **PII Masking Engine** before any external Claude call (`ARCHITECTURE.md` §8.2) — masking is not optional and is not exposed as a toggle on these endpoints. In Phase-1 these are invoked primarily **internally** (by the Complaint Service, Officer Portal, Admin Portal) rather than by third-party API consumers, but are designed as versioned REST endpoints from the outset per SRS §3.9, so future external integration does not require a redesign.

### 5.1 Speech to Text

| | |
|---|---|
| **Purpose** | Transcribe a citizen voice complaint recording to text (Tamil or English) |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/ai/speech-to-text` |
| **Authentication Required** | Yes (internal service-to-service token; not directly citizen-facing — invoked by the Complaint Service on behalf of Section 4.2) |
| **Request Parameters** | None |
| **Request Body** | `{ "fileAssetId": "id", "languageHint"?: "ta" \| "en" }` |
| **Response Body** | `{ "transcriptText", "detectedLanguage", "confidenceScore" }` |
| **Validation Rules** | `fileAssetId`: required, must reference a `voice` category `file_asset` that has passed virus scanning |
| **Possible Errors** | `400 VALIDATION_ERROR`, `404 FILE_NOT_FOUND`, `422 FILE_NOT_YET_SCANNED`, `503 VOICE_PROVIDER_UNAVAILABLE`, `500 INTERNAL_ERROR` |
| **Related Database Entities** | `voice_complaint`, `voice_transcript`, `file_asset` |
| **Related Functional Module** | SRS §3.6 Voice Complaint Flow |
| **Related AI Agent** | Voice Agent (Whisper speech-to-text, Tamil detection) |

### 5.2 Complaint Classification

| | |
|---|---|
| **Purpose** | Detect category, severity, and language for a complaint's text (department/priority are separate, dedicated endpoints below, matching the Complaint Agent's discrete detection responsibilities, SRS §3.5) |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/ai/complaint-classification` |
| **Authentication Required** | Yes (internal service token) |
| **Request Parameters** | None |
| **Request Body** | `{ "complaintId": "id", "text": "string (masked upstream if this call originates outside the trust boundary)" }` |
| **Response Body** | `{ "detectedCategoryId", "detectedSeverity", "detectedLanguage", "confidenceScore" }` |
| **Validation Rules** | `text`: required, 10–5000 chars; PII masking (Aadhaar/PAN/Mobile/Email/Bank A/C/IFSC/UPI/Passport/DL) applied before the underlying Claude call regardless of caller (`ARCHITECTURE.md` §8.2 — mandatory, not caller-controlled) |
| **Possible Errors** | `400 VALIDATION_ERROR`, `404 COMPLAINT_NOT_FOUND`, `503 AI_PROVIDER_UNAVAILABLE` (degrades to rule-based default per `ARCHITECTURE.md` §8.3), `500 INTERNAL_ERROR` |
| **Related Database Entities** | `ai_classification_result`, `pii_masking_log`, `ai_agent_invocation_log` |
| **Related Functional Module** | SRS §3.5 AI Agent Layer |
| **Related AI Agent** | Complaint Agent |

### 5.3 Priority Prediction

| | |
|---|---|
| **Purpose** | Predict a complaint's priority level from its classified category/severity/text signal |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/ai/priority-prediction` |
| **Authentication Required** | Yes (internal service token) |
| **Request Parameters** | None |
| **Request Body** | `{ "complaintId": "id" }` (text/category already resolved server-side from the complaint record, not resent by the caller) |
| **Response Body** | `{ "predictedPriority": "low" \| "medium" \| "high" \| "critical", "confidenceScore" }` |
| **Validation Rules** | Complaint must already have completed Section 5.2 classification |
| **Possible Errors** | `404 COMPLAINT_NOT_FOUND`, `409 CLASSIFICATION_NOT_YET_COMPLETE`, `503 AI_PROVIDER_UNAVAILABLE`, `500 INTERNAL_ERROR` |
| **Related Database Entities** | `ai_classification_result`, `complaint` |
| **Related Functional Module** | SRS §3.5 AI Agent Layer |
| **Related AI Agent** | Complaint Agent |

### 5.4 Department Recommendation

| | |
|---|---|
| **Purpose** | Recommend the routing department for a complaint based on its classified category/location |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/ai/department-recommendation` |
| **Authentication Required** | Yes (internal service token) |
| **Request Parameters** | None |
| **Request Body** | `{ "complaintId": "id" }` |
| **Response Body** | `{ "recommendedDepartmentId", "confidenceScore", "alternateDepartmentIds": ["id"] }` |
| **Validation Rules** | Complaint must exist and be pending routing |
| **Possible Errors** | `404 COMPLAINT_NOT_FOUND`, `503 AI_PROVIDER_UNAVAILABLE`, `500 INTERNAL_ERROR` |
| **Related Database Entities** | `ai_classification_result`, `department`, `complaint` |
| **Related Functional Module** | SRS §3.5 AI Agent Layer |
| **Related AI Agent** | Complaint Agent |

### 5.5 Officer AI Assistant Query

| | |
|---|---|
| **Purpose** | Natural-language conversational query interface for officers (SRS §3.3 — "show pending complaints," "show critical complaints," "complaints pending more than 15 days," "generate weekly report," "generate officer performance report") |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/ai/officer-assistant/query` |
| **Authentication Required** | Yes (Officer) |
| **Request Parameters** | None |
| **Request Body** | `{ "queryText": "string", "conversationSessionId"?: "id (for multi-turn context)" }` |
| **Response Body** | `{ "responseText", "responseSummary", "resultData"?: "object (e.g. a complaint list, a report link)" }` |
| **Validation Rules** | `queryText`: required, 3–500 chars; response scoped strictly to the requesting officer's own department/hierarchy scope (RBAC, `ARCHITECTURE.md` §11.2) — the Officer AI Agent can never answer with another officer's or another department's data |
| **Possible Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `429 RATE_LIMITED` (Claude cost governance, `ARCHITECTURE.md` §8.3), `503 AI_PROVIDER_UNAVAILABLE`, `500 INTERNAL_ERROR` |
| **Related Database Entities** | `officer_ai_query_log`, `ai_agent_invocation_log` |
| **Related Functional Module** | SRS §3.3 Officer Module — Officer AI Agent |
| **Related AI Agent** | Officer AI Agent |

### 5.6 Analytics Insights

| | |
|---|---|
| **Purpose** | AI-generated trend summaries and predictions layered over the pre-aggregated reporting tables (District-wise, department-wise, monthly — SRS §3.5) |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/ai/analytics/insights` |
| **Authentication Required** | Yes (Department Admin / Corporation Admin / Super Admin) |
| **Request Parameters** | `?scope=department\|district\|tenant`, `?periodStart=`, `?periodEnd=` |
| **Request Body** | None |
| **Response Body** | `{ "summaryText", "trends": [ { "metricKey", "direction", "changePercent" } ], "predictions": [ { "metricKey", "predictedValue", "confidenceScore" } ] }` |
| **Validation Rules** | `periodStart`/`periodEnd`: required, `periodEnd` ≥ `periodStart`, max 12-month range per call |
| **Possible Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` (scope), `503 AI_PROVIDER_UNAVAILABLE` (falls back to raw, non-AI-summarized figures per `ARCHITECTURE.md` §8.3) |
| **Related Database Entities** | `trend_snapshot`, `daily_complaint_summary`, `monthly_department_report`, `monthly_district_report` |
| **Related Functional Module** | SRS §3.5 AI Agent Layer — Analytics Agent |
| **Related AI Agent** | Analytics Agent |

### 5.7 Summarization

| | |
|---|---|
| **Purpose** | Generate a short AI summary of a complaint or a batch of complaints (e.g. for a weekly officer report body) |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/ai/summarization` |
| **Authentication Required** | Yes (internal service token, or Officer for on-demand use) |
| **Request Parameters** | None |
| **Request Body** | `{ "sourceType": "complaint" \| "complaintBatch" \| "voiceTranscript", "sourceIds": ["id"] }` |
| **Response Body** | `{ "summaryText", "sourceCount" }` |
| **Validation Rules** | `sourceIds`: required, 1–50 entries, all must resolve within the caller's tenant/scope |
| **Possible Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `503 AI_PROVIDER_UNAVAILABLE`, `500 INTERNAL_ERROR` |
| **Related Database Entities** | `ai_agent_invocation_log` |
| **Related Functional Module** | SRS §3.5 AI Agent Layer; §3.6 Voice Complaint Flow (generate summary step) |
| **Related AI Agent** | Voice Agent (voice-transcript summaries) / Analytics Agent (report summaries) |

### 5.8 Translation

| | |
|---|---|
| **Purpose** | Translate complaint text/labels between Tamil and English on demand (beyond the static `reference_value_translation` label set, `DATABASE_DESIGN.md` §29 — this is for free-text content) |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/ai/translation` |
| **Authentication Required** | Yes (internal service token, or Officer/Admin for on-demand use) |
| **Request Parameters** | None |
| **Request Body** | `{ "text": "string", "sourceLanguage"?: "ta" \| "en" (auto-detected if omitted)", "targetLanguage": "ta" \| "en" }` |
| **Response Body** | `{ "translatedText", "detectedSourceLanguage" }` |
| **Validation Rules** | `text`: required, 1–5000 chars; `targetLanguage`: required, must be tenant-active |
| **Possible Errors** | `400 VALIDATION_ERROR`, `503 AI_PROVIDER_UNAVAILABLE`, `500 INTERNAL_ERROR` |
| **Related Database Entities** | `ai_agent_invocation_log` |
| **Related Functional Module** | SRS §4.4 Localization |
| **Related AI Agent** | Complaint Agent (language detection re-used) / general Claude adapter for the translation task itself |

---

## 6. Administration APIs

Backed by the **Tenant & Admin Config Service** (`ARCHITECTURE.md` §3.1 #3). SRS §3.4 groups these under the Admin Module, RBAC-scoped by role: Department Admin (own department only), Corporation Admin (whole tenant), Super Admin (cross-tenant, via an explicit `tenantId` query parameter per Section 1.1).

**Standard CRUD pattern**: every resource below follows the identical five-operation shape — `GET /{resource}` (list), `POST /{resource}` (create), `GET /{resource}/{id}` (detail), `PATCH /{resource}/{id}` (partial update), `DELETE /{resource}/{id}` (soft-delete, Section 1.4). To keep this document readable, each resource gets **one fully-detailed representative endpoint** (List and Create) plus an **overview table** of its remaining operations, which share the same auth/validation/error shape unless otherwise noted.

### 6.1 Departments

| Method | URL | Notes |
|---|---|---|
| `GET` | `/api/v1/departments` | List, `?isActive=`, offset-paginated |
| `POST` | `/api/v1/departments` | Create — detailed below |
| `GET` | `/api/v1/departments/{departmentId}` | Detail |
| `PATCH` | `/api/v1/departments/{departmentId}` | Partial update (e.g. rename, toggle `isActive`) |
| `DELETE` | `/api/v1/departments/{departmentId}` | Soft-delete (deactivate) |

**Create Department**

| | |
|---|---|
| **Purpose** | Add a new department to the tenant's configurable department list (SRS §6.2) |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/departments` |
| **Authentication Required** | Yes (Corporation Admin / Super Admin) |
| **Request Parameters** | None |
| **Request Body** | `{ "code": "string", "name": "string" }` |
| **Response Body** | `{ "id", "code", "name", "isActive": true, "createdAt" }` |
| **Validation Rules** | `code`: required, unique within tenant (`(tenant_id, code)` composite uniqueness, `DATABASE_DESIGN.md` §3), 2–10 uppercase alphanumeric chars; `name`: required, 2–100 chars |
| **Possible Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `409 DEPARTMENT_CODE_ALREADY_EXISTS` |
| **Related Database Entities** | `department` |
| **Related Functional Module** | SRS §3.4 Admin Module |
| **Related AI Agent** | None |

### 6.2 Complaint Categories

| Method | URL | Notes |
|---|---|---|
| `GET` | `/api/v1/complaint-categories` | List, `?departmentId=` |
| `POST` | `/api/v1/complaint-categories` | Create — detailed below |
| `GET` | `/api/v1/complaint-categories/{categoryId}` | Detail |
| `PATCH` | `/api/v1/complaint-categories/{categoryId}` | Partial update |
| `DELETE` | `/api/v1/complaint-categories/{categoryId}` | Soft-delete |

**Create Complaint Category**

| | |
|---|---|
| **Purpose** | Add a complaint category under a department (SRS §3.4, configurable — never a hardcoded enum, `DATABASE_DESIGN.md` Principle 2) |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/complaint-categories` |
| **Authentication Required** | Yes (Department Admin — own department; Corporation Admin — any department) |
| **Request Parameters** | None |
| **Request Body** | `{ "departmentId": "id", "name": "string", "defaultPriority": "low" \| "medium" \| "high" \| "critical" }` |
| **Response Body** | `{ "id", "departmentId", "name", "defaultPriority", "createdAt" }` |
| **Validation Rules** | `departmentId`: required, must be active and within the caller's scope; `name`: required, unique within `(tenant_id, department_id)` |
| **Possible Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 DEPARTMENT_NOT_FOUND`, `409 CATEGORY_NAME_ALREADY_EXISTS` |
| **Related Database Entities** | `complaint_category`, `department` |
| **Related Functional Module** | SRS §3.4 Admin Module |
| **Related AI Agent** | None |

### 6.3 Users

| Method | URL | Notes |
|---|---|---|
| `GET` | `/api/v1/users` | List, `?userType=officer\|admin`, `?departmentId=` |
| `POST` | `/api/v1/users` | Create — detailed below |
| `GET` | `/api/v1/users/{userId}` | Detail |
| `PATCH` | `/api/v1/users/{userId}` | Partial update (e.g. deactivate, change scope) |
| `DELETE` | `/api/v1/users/{userId}` | Soft-delete |

**Create User (Officer / Admin)**

| | |
|---|---|
| **Purpose** | Provision an Officer or Admin-tier account (citizen accounts are never created here — they self-register via Section 2.2) |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/users` |
| **Authentication Required** | Yes (Department Admin — Officers within own department; Corporation Admin — any staff within tenant; Super Admin — any tenant) |
| **Request Parameters** | None |
| **Request Body** | `{ "username": "string", "name": "string", "email": "string", "userType": "officer" \| "department_admin" \| "corporation_admin", "departmentId"?: "id", "hierarchyLevelId"?: "id", "roleIds": ["id"], "initialPassword": "string (or omitted to trigger a set-password invite email)" }` |
| **Response Body** | `{ "id", "username", "userType", "employeeId", "createdAt" }` |
| **Validation Rules** | `username`: required, unique within tenant; `userType`: required, must be within the caller's provisioning authority (a Department Admin cannot create a Corporation Admin); `roleIds`: required, at least one, all must be roles the caller is permitted to grant |
| **Possible Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` (privilege escalation attempt, OWASP A01), `409 USERNAME_ALREADY_EXISTS` |
| **Related Database Entities** | `user`, `staff_profile`, `user_role_assignment` |
| **Related Functional Module** | SRS §3.4 Admin Module — Officers (CRUD) |
| **Related AI Agent** | None |

### 6.4 Roles

| Method | URL | Notes |
|---|---|---|
| `GET` | `/api/v1/roles` | List (system-defined + tenant-defined) |
| `POST` | `/api/v1/roles` | Create — detailed below |
| `GET` | `/api/v1/roles/{roleId}` | Detail, includes assigned permissions |
| `PATCH` | `/api/v1/roles/{roleId}` | Partial update — rejected (`403`) for `isSystemRole = true` rows |
| `DELETE` | `/api/v1/roles/{roleId}` | Soft-delete — rejected for system roles |

**Create Role**

| | |
|---|---|
| **Purpose** | Define a tenant-scoped custom role (system roles — Citizen, Officer, Dept Admin, Corp Admin, Super Admin — are seeded, not created via this endpoint) |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/roles` |
| **Authentication Required** | Yes (Corporation Admin / Super Admin) |
| **Request Parameters** | None |
| **Request Body** | `{ "name": "string", "permissionIds": ["id"] }` |
| **Response Body** | `{ "id", "name", "isSystemRole": false, "createdAt" }` |
| **Validation Rules** | `name`: required, unique within tenant; `permissionIds`: required, all must exist in the global permission catalog |
| **Possible Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `409 ROLE_NAME_ALREADY_EXISTS` |
| **Related Database Entities** | `role`, `role_permission`, `permission` |
| **Related Functional Module** | SRS §3.1 Authentication Module — Permission management |
| **Related AI Agent** | None |

### 6.5 Permissions

| Method | URL | Notes |
|---|---|---|
| `GET` | `/api/v1/permissions` | List the global (resource, action) catalog — detailed below |
| `GET` | `/api/v1/permissions/{permissionId}` | Detail |

Permissions are a **global, system-defined catalog** (`DATABASE_DESIGN.md` §5 `permission`) — not tenant-created, so there is deliberately no `POST`/`PATCH`/`DELETE` here; a tenant composes roles (Section 6.4) from this fixed catalog instead.

**List Permissions**

| | |
|---|---|
| **Purpose** | Retrieve the full (resource, action) permission catalog, for use when composing a Role |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/permissions` |
| **Authentication Required** | Yes (Corporation Admin / Super Admin) |
| **Request Parameters** | `?resource=complaint` (optional filter) |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "id", "resource", "action", "description" } ] }` |
| **Validation Rules** | None (read-only) |
| **Possible Errors** | `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **Related Database Entities** | `permission` |
| **Related Functional Module** | SRS §3.1 Authentication Module |
| **Related AI Agent** | None |

### 6.6 Workflow (Approval Workflow Configuration)

| Method | URL | Notes |
|---|---|---|
| `GET` | `/api/v1/approval-workflows` | List |
| `POST` | `/api/v1/approval-workflows` | Create — detailed below |
| `GET` | `/api/v1/approval-workflows/{workflowConfigId}` | Detail |
| `PATCH` | `/api/v1/approval-workflows/{workflowConfigId}` | Creates a **new version** rather than overwriting (`DATABASE_DESIGN.md` §22) |
| `DELETE` | `/api/v1/approval-workflows/{workflowConfigId}` | Soft-delete |

**Create Approval Workflow Rule**

| | |
|---|---|
| **Purpose** | Define which categories/departments require multi-level approval, and at which hierarchy level (SRS §3.4) |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/approval-workflows` |
| **Authentication Required** | Yes (Corporation Admin / Super Admin) |
| **Request Parameters** | None |
| **Request Body** | `{ "categoryId": "id", "requiredLevelId": "id", "effectiveFrom": "ISO-8601" }` |
| **Response Body** | `{ "id", "categoryId", "requiredLevelId", "version": 1, "effectiveFrom" }` |
| **Validation Rules** | `categoryId`/`requiredLevelId`: required, must exist within tenant; `effectiveFrom`: required, must not be in the past |
| **Possible Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 CATEGORY_NOT_FOUND` |
| **Related Database Entities** | `approval_workflow_config` |
| **Related Functional Module** | SRS §3.4 Admin Module — Approval Workflow |
| **Related AI Agent** | None |

> **Note on future consumption**: this configuration governs the existing `approval_request`/`approval_action` tables unchanged (`DATABASE_DESIGN.md` §8). A future Generic Workflow Engine (`DATABASE_DESIGN.md` §27) would expose an analogous `/api/v1/workflow-definitions` resource for new modules (Trade License, Building Plan Approval, etc.) without altering this endpoint.

### 6.7 SLA (SLA Rule Configuration)

| Method | URL | Notes |
|---|---|---|
| `GET` | `/api/v1/sla-rules` | List, `?departmentId=`, `?categoryId=` |
| `POST` | `/api/v1/sla-rules` | Create — detailed below |
| `GET` | `/api/v1/sla-rules/{slaRuleId}` | Detail |
| `PATCH` | `/api/v1/sla-rules/{slaRuleId}` | Creates a new version (`DATABASE_DESIGN.md` §22) |
| `DELETE` | `/api/v1/sla-rules/{slaRuleId}` | Soft-delete |

**Create SLA Rule**

| | |
|---|---|
| **Purpose** | Define the resolution-time target for a department/category/priority combination |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/sla-rules` |
| **Authentication Required** | Yes (Department Admin — own department; Corporation Admin — any) |
| **Request Parameters** | None |
| **Request Body** | `{ "departmentId": "id", "categoryId": "id", "priority": "string", "resolutionHours": "integer", "effectiveFrom": "ISO-8601" }` |
| **Response Body** | `{ "id", "departmentId", "categoryId", "priority", "resolutionHours", "version": 1, "effectiveFrom" }` |
| **Validation Rules** | `resolutionHours`: required, positive integer, ≤8760 (1 year ceiling); a complaint already in flight keeps its **originally-pinned** SLA version (`DATABASE_DESIGN.md` §22) — this endpoint never retroactively changes an active complaint's due date |
| **Possible Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 DEPARTMENT_OR_CATEGORY_NOT_FOUND` |
| **Related Database Entities** | `sla_rule_config` |
| **Related Functional Module** | SRS §3.4 Admin Module — SLA Settings |
| **Related AI Agent** | None |

### 6.8 Escalation (Escalation Matrix Configuration)

| Method | URL | Notes |
|---|---|---|
| `GET` | `/api/v1/escalation-rules` | List |
| `POST` | `/api/v1/escalation-rules` | Create — detailed below |
| `GET` | `/api/v1/escalation-rules/{escalationRuleId}` | Detail |
| `PATCH` | `/api/v1/escalation-rules/{escalationRuleId}` | Creates a new version |
| `DELETE` | `/api/v1/escalation-rules/{escalationRuleId}` | Soft-delete |

**Create Escalation Rule**

| | |
|---|---|
| **Purpose** | Define an escalation trigger — from/to hierarchy level, and the condition/timer that fires it (SRS §3.4) |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/escalation-rules` |
| **Authentication Required** | Yes (Corporation Admin / Super Admin) |
| **Request Parameters** | None |
| **Request Body** | `{ "departmentId": "id", "fromLevelId": "id", "toLevelId": "id", "triggerCondition": "sla_breach" \| "no_action_after_hours", "escalateAfterHours": "integer" }` |
| **Response Body** | `{ "id", "departmentId", "fromLevelId", "toLevelId", "triggerCondition", "escalateAfterHours", "version": 1 }` |
| **Validation Rules** | `fromLevelId`/`toLevelId`: required, `toLevelId` must be a higher hierarchy level than `fromLevelId`; `escalateAfterHours`: positive integer |
| **Possible Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `422 INVALID_LEVEL_ORDER` |
| **Related Database Entities** | `escalation_matrix_config` |
| **Related Functional Module** | SRS §3.4 Admin Module — Escalation Matrix |
| **Related AI Agent** | None (SLA Agent evaluates and fires this rule; rule *definition* itself is deterministic config) |

### 6.9 Notification Templates

Full endpoint detail is provided in **Section 8.2/8.3** (Notification APIs), since Templates are one integrated concern with dispatch/history in that section — cross-referenced here to avoid duplicating the same contract twice.

### 6.10 Configuration (General Tenant Configuration)

| Method | URL | Notes |
|---|---|---|
| `GET` | `/api/v1/tenant-config` | Retrieve the calling tenant's aggregate configuration snapshot — detailed below |
| `PATCH` | `/api/v1/tenant-config` | Partial update of tenant-level settings (session timeouts, password policy thresholds, reopen window, etc. — SRS §8.1) |

**Get Tenant Configuration**

| | |
|---|---|
| **Purpose** | Retrieve the current tenant's aggregate configuration — the single read Admin Portal "Settings" screens use to hydrate their forms |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/tenant-config` |
| **Authentication Required** | Yes (Corporation Admin / Super Admin) |
| **Request Parameters** | None |
| **Request Body** | None |
| **Response Body** | `{ "tenantCode", "tenantName", "defaultLanguage", "sessionTimeouts": { "citizen", "officer", "admin" }, "passwordPolicy": { "minLength", "rotationDays" }, "reopenWindowDays" }` |
| **Validation Rules** | None (read-only) |
| **Possible Errors** | `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **Related Database Entities** | `tenant` |
| **Related Functional Module** | SRS §7 Multi-Tenancy & Configurability Requirements |
| **Related AI Agent** | None |

### 6.11 Feature Flags

| Method | URL | Notes |
|---|---|---|
| `GET` | `/api/v1/feature-flags` | List — detailed below |
| `PATCH` | `/api/v1/feature-flags/{flagKey}` | Toggle a flag |

**List Feature Flags**

| | |
|---|---|
| **Purpose** | Retrieve the tenant's feature-flag state (e.g. `use_generic_org_hierarchy` from `DATABASE_DESIGN.md` §28) |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/feature-flags` |
| **Authentication Required** | Yes (Corporation Admin / Super Admin) |
| **Request Parameters** | None |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "flagKey", "isEnabled", "flagType" } ] }` |
| **Validation Rules** | None (read-only) |
| **Possible Errors** | `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **Related Database Entities** | `feature_flag_config` |
| **Related Functional Module** | `INFRASTRUCTURE_DEVOPS.md` §16 |
| **Related AI Agent** | None |

### 6.12 Providers (Provider Configuration)

| Method | URL | Notes |
|---|---|---|
| `GET` | `/api/v1/providers` | List, `?providerType=ai\|voice\|sms\|whatsapp\|email\|maps` |
| `PUT` | `/api/v1/providers/{providerType}` | Set the active provider for a capability — detailed below |

**Set Active Provider**

| | |
|---|---|
| **Purpose** | Select which pluggable provider (AI/Voice/WhatsApp/SMS/SMTP/Maps) is active for the tenant (SRS §3.4, §5) |
| **HTTP Method** | `PUT` |
| **URL** | `/api/v1/providers/{providerType}` |
| **Authentication Required** | Yes (Super Admin — provider selection is a platform-level, higher-trust action; not delegated to Corporation Admin by default) |
| **Request Parameters** | Path: `providerType` |
| **Request Body** | `{ "providerName": "string", "secretReference": "string (secrets-manager reference, never a raw credential — INFRASTRUCTURE_DEVOPS.md §7)" }` |
| **Response Body** | `{ "providerType", "providerName", "isActive": true, "updatedAt" }` |
| **Validation Rules** | `providerName`: required, must be one of the system-supported adapters for `providerType`; `secretReference`: required, rejected outright if it looks like a raw secret rather than a reference (pattern check, OWASP A02) |
| **Possible Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `422 UNSUPPORTED_PROVIDER` |
| **Related Database Entities** | `provider_config` |
| **Related Functional Module** | SRS §3.4 Admin Module — AI/Voice/Notification Provider configuration |
| **Related AI Agent** | None |

---
## 7. Geographic APIs

Backed by the **Tenant & Admin Config Service** for Zones/Wards, and the **optional GIS layer** defined in `DATABASE_DESIGN.md` §26/§28. Consistent with that document's phasing, the GIS-specific endpoints here (7.3–7.5) are **optional in Phase-1** — Zones/Wards (7.1–7.2) are the only geographic endpoints required for pilot launch.

### 7.1 Zones

| | |
|---|---|
| **Purpose** | List the tenant's configured zones (part of the district/zone/ward geographic hierarchy, SRS §7) |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/geo/zones` |
| **Authentication Required** | Yes (any authenticated role — used to populate address/routing dropdowns) |
| **Request Parameters** | `?districtId=`, `?isActive=true` (default) |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "id", "code", "name", "districtId" } ] }` |
| **Validation Rules** | None (read-only) |
| **Possible Errors** | `401 UNAUTHORIZED` |
| **Related Database Entities** | `zone`, `district` |
| **Related Functional Module** | SRS §3.4 Admin Module — Districts/Zones/Wards |
| **Related AI Agent** | None |

### 7.2 Wards

| | |
|---|---|
| **Purpose** | List the tenant's configured wards, optionally under a given zone |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/geo/wards` |
| **Authentication Required** | Yes (any authenticated role) |
| **Request Parameters** | `?zoneId=`, `?isActive=true` (default) |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "id", "code", "name", "zoneId" } ] }` |
| **Validation Rules** | None (read-only) |
| **Possible Errors** | `401 UNAUTHORIZED` |
| **Related Database Entities** | `ward`, `zone` |
| **Related Functional Module** | SRS §3.4 Admin Module — Districts/Zones/Wards |
| **Related AI Agent** | None |

### 7.3 GIS Boundary

| | |
|---|---|
| **Purpose** | Retrieve the GeoJSON polygon boundary for a Ward/Zone/Division or any configurable org-hierarchy node, for map rendering (optional, Phase-2 per `DATABASE_DESIGN.md` §26) |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/geo/boundaries/{orgUnitId}` |
| **Authentication Required** | Yes (any authenticated role) |
| **Request Parameters** | Path: `orgUnitId` (a `ward`/`zone`/`org_unit` identifier) |
| **Request Body** | None |
| **Response Body** | `{ "boundaryEntityType", "boundaryEntityId", "boundaryGeoJson": { "type": "Polygon", "coordinates": [] }, "centroidLatitude", "centroidLongitude" }` |
| **Validation Rules** | `orgUnitId`: must resolve to an existing administrative unit with a stored boundary; if none exists yet (boundary data not yet onboarded), returns `404`, not an empty polygon |
| **Possible Errors** | `401 UNAUTHORIZED`, `404 BOUNDARY_NOT_FOUND`, `501 NOT_ENABLED` (tenant has not activated the GIS feature flag) |
| **Related Database Entities** | `geo_boundary`, `org_unit` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §26 GIS & Geospatial Data Architecture |
| **Related AI Agent** | None |

### 7.4 Location (Reverse Geocode)

| | |
|---|---|
| **Purpose** | Resolve a latitude/longitude pair to a human-readable address and ward, via the configured Maps provider (Google Maps/OSM), caching the result (optional, Phase-2) |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/geo/reverse-geocode` |
| **Authentication Required** | Yes (Citizen — during complaint registration's location-capture step; internal service token for the Complaint Agent's own Location Detection step, SRS §3.1 pipeline) |
| **Request Parameters** | None |
| **Request Body** | `{ "latitude": "number", "longitude": "number" }` |
| **Response Body** | `{ "resolvedAddress", "resolvedWardId", "providerName", "cached": "boolean" }` |
| **Validation Rules** | `latitude`: required, -90..90; `longitude`: required, -180..180 |
| **Possible Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `503 MAPS_PROVIDER_UNAVAILABLE`, `501 NOT_ENABLED` |
| **Related Database Entities** | `reverse_geocode_cache`, `provider_config` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §26; SRS §3.1 pipeline (Location Detection) |
| **Related AI Agent** | Complaint Agent (when invoked as part of the registration pipeline's location-detection step) |

### 7.5 Nearby Complaints

| | |
|---|---|
| **Purpose** | Find complaints registered near a given coordinate — supports an Officer/Admin "what else has been reported around here" view and future duplicate-complaint detection (optional, Phase-2/3 per `DATABASE_DESIGN.md` §26.4) |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/complaints/nearby` |
| **Authentication Required** | Yes (Officer — scoped to own department/ward; Admin — scoped per role) |
| **Request Parameters** | `?latitude=`, `?longitude=`, `?radiusMeters=` (default 500, max 5000), `?limit=` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "id", "trackingId", "distanceMeters", "categoryName", "statusLabel" } ] }` |
| **Validation Rules** | `latitude`/`longitude`: required, valid range; `radiusMeters`: max 5000 (prevents an unbounded, expensive scan) |
| **Possible Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` (out of scope), `501 NOT_ENABLED` |
| **Related Database Entities** | `geo_point_snapshot`, `complaint` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §26.4 Nearby Complaint Search |
| **Related AI Agent** | None |

---

## 8. Notification APIs

Backed by the **Notification Service** (`ARCHITECTURE.md` §3.1 #10; §10 Notification Architecture). SMS, Email, WhatsApp, and Push are **channel values of one generic dispatch contract**, not four separate endpoints — this mirrors the provider-abstraction design already fixed in `ARCHITECTURE.md` §10.2, so a channel can be added (or its provider swapped) without a new endpoint.

### 8.1 Dispatch Notification

| | |
|---|---|
| **Purpose** | Send a notification through a specific channel (SMS / Email / WhatsApp / Push) — invoked internally by other services on domain events (complaint registered, status changed, SLA breaching), and exposed to Admins for manual/test sends |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/notifications/dispatch` |
| **Authentication Required** | Yes (internal service token for event-driven dispatch; Corporation Admin/Super Admin for manual test-send) |
| **Request Parameters** | None |
| **Request Body** | `{ "recipientUserId": "id", "channel": "sms" \| "email" \| "whatsapp" \| "push", "templateKey": "string", "languageCode": "ta" \| "en", "variables": { "key": "value" } }` |
| **Response Body** | `{ "notificationDispatchId", "channel", "status": "queued", "providerMessageId"?: "string" }` |
| **Validation Rules** | `channel`: required, must be one the recipient has enabled (`notification_preference`) unless it is a mandatory/critical-alert override; `templateKey`: required, must exist and be active for the tenant/channel/language (`notification_template_config`) |
| **Possible Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `404 TEMPLATE_NOT_FOUND`, `422 CHANNEL_DISABLED_BY_RECIPIENT`, `503 PROVIDER_UNAVAILABLE` (retried with backoff per `ARCHITECTURE.md` §10.3), `500 INTERNAL_ERROR` |
| **Related Database Entities** | `notification_event`, `notification_dispatch`, `notification_template_config`, `notification_preference` |
| **Related Functional Module** | SRS §5 External Interface Requirements; §3.5 AI Agent Layer (Notification Agent) |
| **Related AI Agent** | Notification Agent (rule-driven dispatch orchestration — deterministic, not LLM-backed, per `ARCHITECTURE.md` §3.1 design note) |

### 8.2 List Notification Templates

| | |
|---|---|
| **Purpose** | List the tenant's configured, per-channel, per-language message templates |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/notification-templates` |
| **Authentication Required** | Yes (Department Admin / Corporation Admin) |
| **Request Parameters** | `?eventType=`, `?channel=`, `?languageCode=` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "id", "eventType", "channel", "languageCode", "version", "isActive" } ] }` |
| **Validation Rules** | None (read-only) |
| **Possible Errors** | `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **Related Database Entities** | `notification_template_config` |
| **Related Functional Module** | SRS §3.4 Admin Module — Notification Templates |
| **Related AI Agent** | None |

### 8.3 Create Notification Template

| | |
|---|---|
| **Purpose** | Define a new versioned message template for an event/channel/language combination |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/notification-templates` |
| **Authentication Required** | Yes (Corporation Admin / Super Admin) |
| **Request Parameters** | None |
| **Request Body** | `{ "eventType": "string", "channel": "sms" \| "email" \| "whatsapp" \| "push", "languageCode": "ta" \| "en", "bodyTemplate": "string (with {{variable}} placeholders)" }` |
| **Response Body** | `{ "id", "eventType", "channel", "languageCode", "version": 1, "createdAt" }` |
| **Validation Rules** | `bodyTemplate`: required; placeholder variables validated against the event type's known variable set (e.g. `trackingId`, `statusLabel`); channel length ceilings enforced (e.g. SMS template ≤160 chars per segment, a UX warning not a hard block) |
| **Possible Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **Related Database Entities** | `notification_template_config` |
| **Related Functional Module** | SRS §3.4 Admin Module — Notification Templates |
| **Related AI Agent** | None |

### 8.4 Notification History

| | |
|---|---|
| **Purpose** | View delivery history/status for notifications sent to a user or related to a complaint |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/notifications/history` |
| **Authentication Required** | Yes (Citizen — own notifications only; Admin — tenant-wide with filters) |
| **Request Parameters** | `?recipientUserId=` (Admin only), `?complaintId=`, `?channel=`, `?status=`, `?cursor=`, `?limit=` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "id", "channel", "templateKey", "status", "providerMessageId", "sentAt", "deliveredAt" } ], "meta": { "pagination" } }` |
| **Validation Rules** | Citizen callers are always scoped to their own `userId` server-side, regardless of any `recipientUserId` supplied |
| **Possible Errors** | `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **Related Database Entities** | `notification_dispatch`, `notification_event` |
| **Related Functional Module** | SRS §3.2 Citizen Module — Notifications |
| **Related AI Agent** | None |

---

## 9. Reports APIs

Backed by the **Analytics & Reporting Service** (`ARCHITECTURE.md` §3.1 #11), reading from the pre-aggregated Reporting Tables (`DATABASE_DESIGN.md` §14) rather than live-aggregating transaction tables — consistent with that document's denormalization rationale (§17).

### 9.1 Dashboard

| | |
|---|---|
| **Purpose** | Role-aware aggregate dashboard (Officer sees own queue stats; Department Admin sees department stats; Corporation Admin sees tenant-wide stats) |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/reports/dashboard` |
| **Authentication Required** | Yes (Officer / Department Admin / Corporation Admin / Super Admin) |
| **Request Parameters** | `?periodStart=`, `?periodEnd=` (defaults to current month) |
| **Request Body** | None |
| **Response Body** | `{ "registeredCount", "resolvedCount", "pendingCount", "breachedCount", "byCategory": [ { "categoryName", "count" } ] }` |
| **Validation Rules** | `periodEnd` ≥ `periodStart` if both supplied |
| **Possible Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` (scope) |
| **Related Database Entities** | `daily_complaint_summary` |
| **Related Functional Module** | SRS §3.3 Officer Module — Analytics; §3.4 Admin Module — Reports |
| **Related AI Agent** | None (raw aggregate; AI-narrated version is Section 5.6) |

### 9.2 Analytics Report

| | |
|---|---|
| **Purpose** | Trend/prediction report — the non-AI-narrated, structured counterpart to Section 5.6 (this endpoint always returns, even if the AI Orchestration Service is degraded, per `ARCHITECTURE.md` §8.3) |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/reports/analytics` |
| **Authentication Required** | Yes (Department Admin / Corporation Admin / Super Admin) |
| **Request Parameters** | `?scope=department\|district\|tenant`, `?metricKey=`, `?periodStart=`, `?periodEnd=` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "snapshotDate", "metricKey", "metricValue" } ] }` |
| **Validation Rules** | `periodStart`/`periodEnd`: required |
| **Possible Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **Related Database Entities** | `trend_snapshot` |
| **Related Functional Module** | SRS §3.5 AI Agent Layer — Analytics Agent |
| **Related AI Agent** | None (structured data source for Section 5.6) |

### 9.3 Daily Report

| | |
|---|---|
| **Purpose** | Per-tenant/department/ward/category daily complaint counts by status and SLA breach |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/reports/daily` |
| **Authentication Required** | Yes (Department Admin / Corporation Admin / Super Admin) |
| **Request Parameters** | `?date=` (required, ISO date), `?departmentId=`, `?wardId=` |
| **Request Body** | None |
| **Response Body** | `{ "summaryDate", "data": [ { "departmentId", "categoryId", "registeredCount", "resolvedCount", "breachedCount" } ] }` |
| **Validation Rules** | `date`: required, valid ISO date, not in the future |
| **Possible Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **Related Database Entities** | `daily_complaint_summary` |
| **Related Functional Module** | SRS §3.4 Admin Module — Reports |
| **Related AI Agent** | None |

### 9.4 Monthly Report

| | |
|---|---|
| **Purpose** | Monthly department/district aggregates for trend analysis |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/reports/monthly` |
| **Authentication Required** | Yes (Department Admin / Corporation Admin / Super Admin) |
| **Request Parameters** | `?month=` (required, `YYYY-MM`), `?departmentId=`, `?districtId=` |
| **Request Body** | None |
| **Response Body** | `{ "month", "data": [ { "departmentId"?, "districtScope"?, "metrics": { "registeredCount", "resolvedCount", "avgResolutionHours" } } ] }` |
| **Validation Rules** | `month`: required, valid `YYYY-MM`, not in the future |
| **Possible Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **Related Database Entities** | `monthly_department_report`, `monthly_district_report` |
| **Related Functional Module** | SRS §3.5 AI Agent Layer — Analytics Agent (monthly reports) |
| **Related AI Agent** | None |

### 9.5 Officer Performance Report

| | |
|---|---|
| **Purpose** | Per-officer weekly assigned/resolved/pending/overdue counts (SRS §3.3 — feeds the Officer AI Agent's weekly/performance report responses) |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/reports/officer-performance` |
| **Authentication Required** | Yes (Officer — own record only; Department Admin — officers within department; Corporation Admin — any) |
| **Request Parameters** | `?officerId=`, `?weekStartDate=` |
| **Request Body** | None |
| **Response Body** | `{ "officerId", "weekStartDate", "assignedCount", "resolvedCount", "overdueCount" }` |
| **Validation Rules** | An Officer caller may only request their own `officerId`; else `403` |
| **Possible Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **Related Database Entities** | `weekly_officer_performance` |
| **Related Functional Module** | SRS §3.3 Officer Module — Officer AI Agent (performance report) |
| **Related AI Agent** | None (structured source; narrated version reachable via Section 5.5's `"generate officer performance report"` query) |

### 9.6 Department Performance Report

| | |
|---|---|
| **Purpose** | Department-level performance rollup (registered/resolved/SLA-breach rate) over a period |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/reports/department-performance` |
| **Authentication Required** | Yes (Department Admin — own department; Corporation Admin — any) |
| **Request Parameters** | `?departmentId=`, `?periodStart=`, `?periodEnd=` |
| **Request Body** | None |
| **Response Body** | `{ "departmentId", "registeredCount", "resolvedCount", "breachRatePercent", "avgResolutionHours" }` |
| **Validation Rules** | `periodEnd` ≥ `periodStart` |
| **Possible Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **Related Database Entities** | `monthly_department_report`, `daily_complaint_summary` |
| **Related Functional Module** | SRS §3.4 Admin Module — Reports |
| **Related AI Agent** | None |

### 9.7 SLA Report

| | |
|---|---|
| **Purpose** | Report of SLA compliance/breach across complaints for a period/department |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/reports/sla` |
| **Authentication Required** | Yes (Department Admin / Corporation Admin / Super Admin) |
| **Request Parameters** | `?departmentId=`, `?periodStart=`, `?periodEnd=`, `?breachedOnly=boolean` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "complaintId", "trackingId", "dueAt", "breachedAt"?, "resolutionHours" } ], "meta": { "pagination" } }` |
| **Validation Rules** | `periodEnd` ≥ `periodStart` |
| **Possible Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **Related Database Entities** | `sla_tracking` |
| **Related Functional Module** | SRS §3.5 AI Agent Layer — SLA Agent |
| **Related AI Agent** | None |

### 9.8 Export

| | |
|---|---|
| **Purpose** | Export any of the above reports (or a raw complaint list) as CSV/PDF for offline/compliance use |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/reports/export` |
| **Authentication Required** | Yes (Department Admin / Corporation Admin / Super Admin) |
| **Request Parameters** | `?reportType=daily\|monthly\|sla\|officer-performance\|department-performance` (required), `?format=csv\|pdf` (required), plus that report's own filters (Sections 9.3–9.7) |
| **Request Body** | None |
| **Response Body** | `202 Accepted`: `{ "exportJobId", "status": "queued" }` — large exports are generated asynchronously (Scheduler, `ARCHITECTURE.md` §17) and delivered via a signed, short-lived download URL once ready (retrieved via Section 11.2's Download endpoint using the resulting `fileAssetId`) |
| **Validation Rules** | `reportType`/`format`: required, `format` must be one of the two supported values |
| **Possible Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `429 RATE_LIMITED` (export-generation throttling) |
| **Related Database Entities** | `file_asset` (the generated export artifact) |
| **Related Functional Module** | SRS §3.4 Admin Module — Reports |
| **Related AI Agent** | None |

---
## 10. Audit APIs

Backed by the **Audit & Activity Logging Service** (`ARCHITECTURE.md` §3.1 #12). All four endpoints are **read-only** — nothing in this section ever accepts a write; audit/activity/history rows are written internally by other services' state-changing actions, never directly via a client-facing API (`DATABASE_DESIGN.md` §21 immutability exception).

### 10.1 Audit Log

| | |
|---|---|
| **Purpose** | Search the immutable, generic audit trail of every state-changing action platform-wide (SRS §3.4 — view/search, immutable) |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/audit-logs` |
| **Authentication Required** | Yes (Department Admin — scoped to own department's entities; Corporation Admin — tenant-wide; Super Admin — cross-tenant) |
| **Request Parameters** | `?entityType=`, `?entityId=`, `?actorUserId=`, `?filter[createdAt][gte]=`, `?filter[createdAt][lte]=`, `?cursor=`, `?limit=` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "id", "actorUserId", "action", "entityType", "entityId", "changeSummary", "createdAt" } ], "meta": { "pagination" } }` |
| **Validation Rules** | `limit`: max 200; unrecognized query field → `400` |
| **Possible Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` (scope) |
| **Related Database Entities** | `audit_log` |
| **Related Functional Module** | SRS §3.4 Admin Module — Audit Logs |
| **Related AI Agent** | None |

### 10.2 Activity Log

| | |
|---|---|
| **Purpose** | Search broader activity/security monitoring events (distinct from the business-data-change audit trail — login attempts, session activity, `ARCHITECTURE.md` §11 "Activity Monitoring") |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/activity-logs` |
| **Authentication Required** | Yes (Corporation Admin / Super Admin) |
| **Request Parameters** | `?actorUserId=`, `?activityType=`, `?ipAddress=`, `?filter[createdAt][gte]=`, `?filter[createdAt][lte]=`, `?cursor=`, `?limit=` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "id", "actorUserId", "activityType", "ipAddress", "createdAt" } ], "meta": { "pagination" } }` |
| **Validation Rules** | `limit`: max 200 |
| **Possible Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **Related Database Entities** | `activity_log` |
| **Related Functional Module** | `ARCHITECTURE.md` §11.5 Audit Logging |
| **Related AI Agent** | None |

### 10.3 Login History

| | |
|---|---|
| **Purpose** | View login/logout/MFA/failed-attempt/password-reset event history for a user (self-service for any user; full search for Admins) |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/audit/login-history` |
| **Authentication Required** | Yes (any user — own history only; Corporation Admin/Super Admin — any user via `?userId=`) |
| **Request Parameters** | `?userId=` (Admin only), `?eventType=login\|logout\|mfa_challenge\|failed_attempt\|password_reset`, `?cursor=`, `?limit=` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "id", "eventType", "ipAddress", "success", "createdAt" } ], "meta": { "pagination" } }` |
| **Validation Rules** | Non-Admin callers are always scoped to their own `userId` regardless of any `userId` supplied |
| **Possible Errors** | `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **Related Database Entities** | `auth_event_log` |
| **Related Functional Module** | SRS §8.1 Authentication & Session Security Policy |
| **Related AI Agent** | None |

### 10.4 Configuration History

| | |
|---|---|
| **Purpose** | View the version history of a specific configuration row (e.g. "show every past version of this SLA rule") — a specialization of the Audit Log scoped to `*_config` tables, avoiding a full-table scan of the generic audit log for this common Admin Portal need (`DATABASE_DESIGN.md` §10) |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/config-history` |
| **Authentication Required** | Yes (Department Admin — within scope; Corporation Admin / Super Admin — any) |
| **Request Parameters** | `?configTableName=` (required, e.g. `sla_rule_config`), `?configRowId=` (required), `?cursor=`, `?limit=` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "configTableName", "configRowId", "previousVersion", "newVersion", "changedBy": { "id", "name" }, "createdAt" } ], "meta": { "pagination" } }` |
| **Validation Rules** | `configTableName`/`configRowId`: required |
| **Possible Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 CONFIG_ROW_NOT_FOUND` |
| **Related Database Entities** | `config_change_history` |
| **Related Functional Module** | SRS §3.4 Admin Module; `DATABASE_DESIGN.md` §22 Versioning Strategy |
| **Related AI Agent** | None |

---

## 11. File APIs

Backed by the **Media / File Service** (`ARCHITECTURE.md` §3.1 #6), enforcing the upload validation pipeline mandated by SRS §8.2 (extension allow-list → MIME/magic-byte check → re-encode/EXIF-strip → antivirus scan → randomized storage path → signed short-lived URL access) regardless of which endpoint above (Section 4.2, 4.3) initiates the upload.

### 11.1 Upload

| | |
|---|---|
| **Purpose** | The generic file-upload entry point used by any feature area (complaint image, officer evidence document, report export artifact) — Sections 4.2/4.3 are thin, context-specific wrappers around this same pipeline |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/files` |
| **Authentication Required** | Yes (any authenticated role permitted to attach files to the target entity) |
| **Request Parameters** | Header: `Idempotency-Key` (recommended) |
| **Request Body** | `multipart/form-data`: `file`, `assetCategory`, `linkedEntityType`, `linkedEntityId` |
| **Response Body** | `{ "fileAssetId", "assetCategory", "mimeType", "sizeBytes", "virusScanStatus": "pending", "lifecycleState": "quarantine", "createdAt" }` — `202 Accepted` semantics; the file is not query/downloadable (Section 11.2) until `virusScanStatus` becomes `clean` |
| **Validation Rules** | Extension allow-list + magic-byte MIME verification against the declared `assetCategory`'s allowed formats (SRS §8.2 table); size/count ceilings enforced per asset type; `linkedEntityType`/`linkedEntityId` must resolve to an entity the caller is authorized to attach files to |
| **Possible Errors** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `413 FILE_TOO_LARGE`, `415 UNSUPPORTED_MEDIA_TYPE`, `422 MAX_FILES_EXCEEDED`, `500 INTERNAL_ERROR` |
| **Related Database Entities** | `file_asset`, `file_asset_metadata` |
| **Related Functional Module** | SRS §8.2 File Upload Security Policy |
| **Related AI Agent** | None |

### 11.2 Download

| | |
|---|---|
| **Purpose** | Retrieve the original file content via a short-lived, signed, authenticated URL — never a direct, guessable static path (SRS §8.2) |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/files/{fileId}/download` |
| **Authentication Required** | Yes (the requester must own or be authorized against the file's `linkedEntityType`/`linkedEntityId`) |
| **Request Parameters** | Path: `fileId` |
| **Request Body** | None |
| **Response Body** | `302 Found` redirect to a time-boxed signed URL, or `{ "downloadUrl", "expiresAt" }` if the client prefers a JSON response (`Accept: application/json`) |
| **Validation Rules** | `virusScanStatus` must be `clean`; `lifecycleState` must not be `quarantine` |
| **Possible Errors** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 FILE_NOT_FOUND`, `409 FILE_NOT_YET_SCANNED`, `410 FILE_QUARANTINED` |
| **Related Database Entities** | `file_asset` |
| **Related Functional Module** | `ARCHITECTURE.md` §19 File Storage Architecture |
| **Related AI Agent** | None |

### 11.3 Preview

| | |
|---|---|
| **Purpose** | Retrieve a lightweight preview/thumbnail rendering of a file (image thumbnail, first-page PDF preview) without pulling the full original — uses the thumbnail/preview companion asset defined in `DATABASE_DESIGN.md` §30 |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/files/{fileId}/preview` |
| **Authentication Required** | Yes (same authorization rule as Section 11.2) |
| **Request Parameters** | Path: `fileId`; `?size=small\|medium\|large` |
| **Request Body** | None |
| **Response Body** | `302 Found` redirect to a signed preview-asset URL, or `{ "previewUrl", "expiresAt" }` |
| **Validation Rules** | Falls back to `404 PREVIEW_NOT_AVAILABLE` if no thumbnail/preview has been generated yet for this file type (e.g. audio files have no visual preview) |
| **Possible Errors** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 FILE_NOT_FOUND`, `404 PREVIEW_NOT_AVAILABLE` |
| **Related Database Entities** | `file_asset`, `file_asset_metadata` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §30 Enterprise File Metadata Architecture |
| **Related AI Agent** | None |

### 11.4 Delete

| | |
|---|---|
| **Purpose** | Soft-delete a file (deactivate/hide it) — never a physical storage delete via API (`DATABASE_DESIGN.md` §21); physical removal is exclusively the retention-expiry Cleanup Job's responsibility |
| **HTTP Method** | `DELETE` |
| **URL** | `/api/v1/files/{fileId}` |
| **Authentication Required** | Yes (uploader, or an Admin within scope) |
| **Request Parameters** | Path: `fileId` |
| **Request Body** | None |
| **Response Body** | `{ "fileAssetId", "deletedAt" }` |
| **Validation Rules** | A file that is the sole evidence attached to an unresolved/unclosed complaint may be protected from deletion (`409`) depending on tenant policy |
| **Possible Errors** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 FILE_NOT_FOUND`, `409 FILE_PROTECTED` |
| **Related Database Entities** | `file_asset` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §21 Soft Delete Strategy |
| **Related AI Agent** | None |

### 11.5 Metadata

| | |
|---|---|
| **Purpose** | Retrieve rich metadata for a file — tags, EXIF/GPS, OCR status, AI-generated metadata, retention category (`DATABASE_DESIGN.md` §30), without fetching the file content itself |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/files/{fileId}/metadata` |
| **Authentication Required** | Yes (same authorization rule as Section 11.2) |
| **Request Parameters** | Path: `fileId` |
| **Request Body** | None |
| **Response Body** | `{ "fileAssetId", "assetCategory", "tags": ["string"], "gpsLatitude"?, "gpsLongitude"?, "ocrStatus", "isAiGenerated", "retentionCategory", "checksum", "virusScanStatus" }` |
| **Validation Rules** | None (read-only) |
| **Possible Errors** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 FILE_NOT_FOUND` |
| **Related Database Entities** | `file_asset`, `file_asset_metadata` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §30 Enterprise File Metadata Architecture |
| **Related AI Agent** | None |

---
## 12. Standard API Response Format

Every response — success or error, from every endpoint in Sections 2–11 — uses one of the envelopes below. A client never needs endpoint-specific parsing logic to find the data, the error code, or the pagination block.

### 12.1 Success Response

```json
{
  "success": true,
  "data": { "...endpoint-specific payload..." },
  "meta": {
    "requestId": "req_9f2c...",
    "correlationId": "corr_1a4b...",
    "pagination": { "nextCursor": "opaque", "hasMore": true }
  }
}
```

- `data` is the payload documented per endpoint above (an object for a single resource, `{ "data": [...] }` shape already folded in for collections).
- `meta.pagination` is present only on paginated list endpoints (Section 1.8) and omitted entirely otherwise — its shape depends on whether the endpoint uses keyset or offset pagination.

### 12.2 Error Envelope (shared shape for all error categories)

```json
{
  "success": false,
  "error": {
    "category": "validation",
    "code": "VALIDATION_ERROR",
    "message": "mobileNumber must be a valid 10-digit Indian mobile number",
    "details": [
      { "field": "mobileNumber", "issue": "PATTERN_MISMATCH" }
    ]
  },
  "meta": {
    "requestId": "req_9f2c...",
    "correlationId": "corr_1a4b..."
  }
}
```

`error.category` is always one of the five below; `error.code` is the specific, stable machine-readable reason within that category (the `code` values used throughout Sections 2–11, e.g. `OTP_INVALID_OR_EXPIRED`, `COMPLAINT_NOT_FOUND`).

### 12.3 Validation Error

| Field | Value |
|---|---|
| `category` | `validation` |
| HTTP status | `400 Bad Request` |
| When | Request shape/field-level rule failure (Section 1.7) — malformed body, missing required field, out-of-range value |
| `details` | Always an array of `{ field, issue }`, so a form UI can highlight the exact offending field |

### 12.4 Business Error

| Field | Value |
|---|---|
| `category` | `business` |
| HTTP status | `409 Conflict` or `422 Unprocessable Entity` (Section 13 clarifies the split) |
| When | The request is well-formed but violates a business rule/state invariant — e.g. `COMPLAINT_ALREADY_CLOSED`, `REOPEN_WINDOW_EXPIRED`, `FEEDBACK_ALREADY_SUBMITTED` |
| `details` | Optional; may include the conflicting state (e.g. current status) |

### 12.5 Authentication Error

| Field | Value |
|---|---|
| `category` | `authentication` |
| HTTP status | `401 Unauthorized` |
| When | Missing, malformed, expired, or revoked credential (bearer token, OTP, MFA code, refresh token) |
| `details` | Never includes which specific check failed beyond the `code` (e.g. distinguishing "wrong password" from "unknown username" is avoided at the credential-check stage per OWASP A07 anti-enumeration guidance — Section 2.9 is the canonical example) |

### 12.6 Authorization Error

| Field | Value |
|---|---|
| `category` | `authorization` |
| HTTP status | `403 Forbidden` |
| When | Credential is valid, but the caller's role/scope does not permit the requested action on this specific resource (RBAC + tenant/scope check, `ARCHITECTURE.md` §11.2) |
| `details` | Omits the specific permission/scope boundary that was checked, to avoid leaking authorization-model internals to a probing client |

### 12.7 Server Error

| Field | Value |
|---|---|
| `category` | `server` |
| HTTP status | `500 Internal Server Error`, `502/503/504` for upstream/provider failures |
| When | An unexpected failure, or a documented upstream dependency (Claude API, Whisper, SMS/WhatsApp/Email/Maps provider) is unavailable |
| `details` | Never includes a stack trace or internal exception message in the response body (those go to the server-side error log only, PII-sanitized, `ARCHITECTURE.md` §15) — the client only ever sees `code` and a safe, generic `message` |

---

## 13. HTTP Status Codes

Standard REST status codes are used throughout; this table is the platform-wide reference so every service applies them consistently.

| Code | Meaning | Used When |
|---|---|---|
| `200 OK` | Success | Successful `GET`, `PATCH`, `PUT`, or a `POST` that doesn't create a new resource (e.g. a login) |
| `201 Created` | Resource created | Successful `POST` that creates a resource synchronously (e.g. Create Department, Create Role) |
| `202 Accepted` | Accepted for async processing | Complaint registration (AI classification pending), voice complaint (transcription pending), file upload (virus scan pending), report export (job queued) |
| `204 No Content` | Success, empty body | Successful `DELETE` |
| `400 Bad Request` | Validation Error (Section 12.3) | Malformed body, missing/invalid field, unrecognized `sort`/`filter` field |
| `401 Unauthorized` | Authentication Error (Section 12.5) | Missing/invalid/expired token, OTP, MFA code |
| `403 Forbidden` | Authorization Error (Section 12.6) | Valid credential, insufficient role/scope/permission |
| `404 Not Found` | Resource does not exist (or is soft-deleted and excluded from default queries, `DATABASE_DESIGN.md` §21) | `GET`/`PATCH`/`DELETE` on an unknown/inaccessible id |
| `409 Conflict` | Business Error — state conflict (Section 12.4) | `COMPLAINT_ALREADY_CLOSED`, `INVALID_STATUS_TRANSITION`, refresh-token reuse |
| `410 Gone` | Resource existed but is now permanently unavailable | A quarantined/removed file (Section 11.2) |
| `413 Payload Too Large` | Upload exceeds size ceiling | File upload endpoints (Sections 4.2, 4.3, 11.1) |
| `415 Unsupported Media Type` | MIME/extension not allow-listed | File upload endpoints |
| `422 Unprocessable Entity` | Business Error — semantically invalid though syntactically well-formed (Section 12.4) | `CATEGORY_NOT_FOUND`, `OFFICER_OUT_OF_SCOPE`, `MALWARE_DETECTED` |
| `423 Locked` | Account lockout | Section 2.3/2.5 login after 5 failed attempts (SRS §8.1) |
| `429 Too Many Requests` | Rate limit exceeded | OTP request throttling, AI endpoint cost governance, export throttling |
| `500 Internal Server Error` | Unexpected server-side failure (Section 12.7) | Any unhandled exception |
| `501 Not Implemented` | Feature not enabled for this tenant | GIS endpoints (Section 7.3–7.5) when the tenant has not activated the optional GIS feature flag (`DATABASE_DESIGN.md` §26) |
| `502/503/504` | Upstream/provider failure (Section 12.7) | Claude API, Whisper, SMS/WhatsApp/Email/Maps provider unavailable or timing out |

---

## 14. API Security

Consolidates the security controls that apply **across every endpoint** in Sections 2–11; endpoint-specific rules already stated above are not repeated here.

### 14.1 JWT

- Short-lived access token (15-minute default expiry, tenant-configurable within a system-enforced ceiling — SRS §8.1), signature-verified on every request at the API Gateway (`ARCHITECTURE.md` §4.1) before any request reaches a service.
- Claims carry `userId`, `userType`, `tenantId`, `roles`, `scope` — the same claim set `ARCHITECTURE.md` §11.2's RBAC model already defines; no endpoint invents its own claim shape.

### 14.2 Refresh Token

- 7-day expiry, single-use, rotated on every use, server-side record in Redis for revocation (Section 2.7). Reuse of an already-rotated token revokes the entire token family — the standard refresh-token-theft detection pattern.

### 14.3 Rate Limiting

- Enforced at the API Gateway via a Redis token-bucket/sliding-window counter, per IP + per user + per tenant (`ARCHITECTURE.md` §16). Endpoint-specific thresholds are called out where materially different from the platform default (OTP request: 3/10 min; AI endpoints: cost-governed per `ARCHITECTURE.md` §8.3; export generation: throttled to prevent resource exhaustion).

### 14.4 Correlation ID

- Restated from Section 1.14: every request/response pair carries `X-Correlation-Id`; every internal call and queue job made in service of that request propagates the same id, enabling end-to-end tracing across the microservices in `ARCHITECTURE.md` §3.1.

### 14.5 Audit

- Every state-changing endpoint (any `POST`/`PATCH`/`PUT`/`DELETE` outside of pure read paths) emits an audit event consumed by the Audit & Activity Logging Service, written immutably (`DATABASE_DESIGN.md` §10, `ARCHITECTURE.md` §11.5) — this is not opt-in per endpoint; it is a platform-wide middleware concern (`ARCHITECTURE.md` §4.1's `SVC -.audit event.-> AUDITQ` component).

### 14.6 OWASP

| Risk | How the API layer mitigates it |
|---|---|
| A01 Broken Access Control | RBAC + tenant/scope guard on every request (Section 1.1, `ARCHITECTURE.md` §11.2); no tenant id ever accepted from the client except the documented Super Admin exception |
| A02 Cryptographic Failures | TLS 1.2+/HSTS on every endpoint; `provider_config`/`mfa_device` secrets are always references, never raw values in any request/response body (Sections 2.6, 6.12) |
| A03 Injection | Every request body/query param is schema-validated before reaching a service; parameterized data access beneath the API is a database-layer concern (`DATABASE_DESIGN.md` §1) |
| A04 Insecure Design | Documented filter/sort/field allow-lists (Sections 1.9–1.12) prevent open-ended query surfaces; idempotency keys (Section 1.5) prevent duplicate-submission abuse |
| A05 Security Misconfiguration | Standard error envelope (Section 12) never leaks stack traces/internal details; CORS/security headers enforced at the Gateway (`ARCHITECTURE.md` §11.1) |
| A06 Vulnerable/Outdated Components | Out of this document's scope — covered by `INFRASTRUCTURE_DEVOPS.md` CI dependency scanning |
| A07 Identification & Auth Failures | MFA for Admin tiers (Section 2.5–2.6), account lockout (Section 2.3), anti-enumeration on Forgot Password (Section 2.9) |
| A08 Software/Data Integrity Failures | Out of this document's scope — covered by `INFRASTRUCTURE_DEVOPS.md` build/release provenance |
| A09 Security Logging & Monitoring Failures | Request ID + Correlation ID on every request (Sections 1.14–1.15); immutable audit trail (Section 14.5) |
| A10 SSRF | Every outbound integration (Claude, Maps, WhatsApp/SMS/Email/FCM) is a named, allow-listed `provider_config` entry (Section 6.12) — no endpoint accepts an arbitrary client-supplied outbound URL |

---

## 15. API Versioning Strategy

### 15.1 v1

- Current and only major version at launch. Base path `/api/v1` (Section 1.1). All endpoints in Sections 2–11 are v1.

### 15.2 Future v2

- A new major version (`/api/v2`) is created only for a **breaking** change — removing a field, renaming a field, changing a field's type/semantics, removing an endpoint, or changing an error `code`'s meaning.
- `/api/v1` and `/api/v2` run **concurrently**; v1 is never pulled while any known consumer (Citizen/Officer/Admin Portal, or a future external state-ULB integrator, SRS §3.9) still depends on it.
- A v2 endpoint is only introduced for the specific resource that needs the breaking change — v2 does not mean "redo the whole API," matching this document's own instruction not to redesign what already works.

### 15.3 Backward Compatibility

Within a major version, only **additive, non-breaking** changes are permitted:
- Adding a new optional request field.
- Adding a new field to a response body (clients must tolerate unknown fields — documented as a consumer contract requirement).
- Adding a new endpoint.
- Adding a new enum-like value to a field backed by a `reference_value`/`*_definition` config table (`DATABASE_DESIGN.md` §29, Principle 2) — since these are already data, not schema, a new value is inherently non-breaking as long as clients treat unrecognized values gracefully (documented requirement, mirrors the localization/label pattern in Section 1.13).

Never permitted within a version: removing/renaming a field, changing a field's type, changing an endpoint's URL, changing an error `code`'s meaning, tightening a previously-optional field to required.

### 15.4 Deprecation Policy

- A deprecated endpoint/field is marked with a `Deprecation: true` and `Sunset: <date>` response header (per the IETF `Sunset` header convention) for a **minimum 6-month** window before removal in the next major version.
- Deprecation is announced in this document's own version history (mirroring `DATABASE_DESIGN.md`'s Section "Version History" pattern) and, where practical, surfaced in the OpenAPI spec itself via `deprecated: true` on the affected operation (Section 16).
- No endpoint is ever removed outright without first passing through a deprecated-but-functional period — a citizen-facing government platform cannot assume every consumer can redeploy on short notice.

---

## 16. API Documentation Standards

### 16.1 OpenAPI 3.1

- The physical contract artifact (a separate, later deliverable per this document's stated scope) is authored as a single `openapi.yaml` per major version, conforming to the **OpenAPI 3.1.x** specification (JSON Schema 2020-12 compatible — chosen over 3.0 specifically so request/response schemas can use modern JSON Schema features like `oneOf`/nullable-via-type-arrays without the 3.0-era workarounds).
- Every endpoint documented in Sections 2–11 above maps 1:1 to an OpenAPI `path` + `operation` object; every field in every Request Body/Response Body table maps to a named, reusable `components.schemas` entry — no inline, un-reusable schemas for shapes that repeat (e.g. the pagination `meta` block, the error envelope, Section 12).
- Reusable components: `ErrorEnvelope`, `SuccessEnvelope`, `PaginationCursorMeta`, `PaginationOffsetMeta`, and one schema per resource (`Complaint`, `ComplaintSummary`, `User`, `Department`, ...) — a detail-view shape and a list-view shape are deliberately separate schemas (e.g. `Complaint` vs. `ComplaintListItem`) rather than one schema with optional fields, so the contract is unambiguous per endpoint.

### 16.2 Swagger

- Swagger UI (or an equivalent OpenAPI renderer) is served from a documentation-only path (e.g. `/api/v1/docs`), **gated behind authentication for non-public environments** (staging/UAT) and available read-only in production for the developer/integrator audience described in SRS §3.9 — it must never expose a "Try it out" execute capability against production data without the caller's own valid credentials (Swagger UI's built-in bearer-token entry satisfies this; no shared/test credentials are ever embedded in the spec).

### 16.3 Request Examples

- Every operation in the OpenAPI spec includes at least one populated `example` (or `examples` map for endpoints with meaningfully different request shapes, e.g. Section 6.3's Create User for `officer` vs. `department_admin`) — never a bare schema with no illustrative value filled in, so an integrator can copy-paste-adapt rather than reverse-engineer the shape from field types alone.

### 16.4 Response Examples

- Every documented success status code (Section 13) carries a matching example response body, including the `meta.pagination` block where applicable (Section 12.1) — a list endpoint's example must show a realistic multi-item `data` array, not a single-item placeholder, so pagination behavior is self-evident from the docs alone.

### 16.5 Error Examples

- Every `error.code` listed against an endpoint in Sections 2–11 has a corresponding example in the OpenAPI spec's `responses` for that operation, using the shared `ErrorEnvelope` schema (Section 12.2) — an integrator building error handling should never need to trigger a real failure condition against a live environment just to see the shape of, say, `COMPLAINT_ALREADY_CLOSED`.

---

## 17. Explicitly Out of Scope for This Document

- Physical `openapi.yaml`/`openapi.json` generation.
- Any Node.js, Express, controller, service-layer, or database-query code.
- Load/performance testing of the eventual implementation.
- API Gateway product selection/configuration syntax (covered by `ARCHITECTURE.md` §3.1, `INFRASTRUCTURE_DEVOPS.md`).
- Client SDK generation.

---

## 18. Approval

This API Specification Document (v1.0) is an additive design layer over the already-approved and frozen `SRS.md`, `ARCHITECTURE.md`, `INFRASTRUCTURE_DEVOPS.md`, and `DATABASE_DESIGN.md` (v1.1) — it introduces no new service, table, or architectural decision, and must be reviewed and approved before physical OpenAPI/implementation work begins.

