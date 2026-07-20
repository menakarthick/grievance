# API Specification Document — Section 13

## AI Powered Enterprise Citizen Service & Grievance Management Platform

> **Continuation note**: This file continues the API Specification from the end of the approved Section 12 (Standard Response Formats, `docs/12-Standard-Response-Formats.md`). Sections 1–12 are not reproduced, summarized, or modified here. This file contains **only** Section 13 (HTTP Status Codes) and formalizes, with complete per-code detail, the reference table already fixed at a summary level in `docs/API_SPECIFICATION.md` §13. No SQL, no Express routes, no controllers, no services, no implementation code, no OpenAPI YAML.

---

## 13. HTTP Status Codes

A complete enterprise REST HTTP status code reference for the platform. Every status code used anywhere in Sections 2–12 is documented here with its full decision criteria — this section is the single source of truth every service consults so status codes are applied consistently platform-wide, regardless of which microservice (`ARCHITECTURE.md` §3.1) produces the response.

### 13.1 Overview

- **Semantics over convenience**: a status code is chosen for what it *means* to an HTTP-aware client (proxies, API gateways, monitoring tooling, browser fetch/XHR), never for developer convenience — e.g. a business-rule failure is `409`/`422`, never a `200` with a `success: false` body (`API_SPECIFICATION.md` §12.2's error envelope always rides on the *correct* non-2xx status).
- **Every non-2xx response uses the Section 12.2 error envelope** — the HTTP status is the transport-layer signal; `error.code` (Section 13.12) is the stable, machine-readable application-layer signal. Clients must branch on `error.code`, and use the HTTP status only for generic retry/cache/redirect behavior.
- **Consistency across services**: the API Gateway (`ARCHITECTURE.md` §3.1 #1) does not rewrite or reinterpret status codes returned by an upstream service — whatever `core-api`/`ai-service`/`voice-service`/`notification-service` (`ARCHITECTURE.md` §3.2) returns is what the client receives, unmodified.
- **Government-project standard**: this reference is written to be directly citable in a STQC/CERT-In technical review (SRS §9) — every code's "When to Use"/"When NOT to Use" pair exists specifically so a reviewer can verify the platform does not misuse status codes to obscure a security- or business-relevant outcome.

---

### 13.2 Success Responses (2xx)

#### 13.2.1 `200 OK`

| | |
|---|---|
| **HTTP Code** | 200 |
| **Name** | OK |
| **Description** | The request succeeded and the response body contains the requested/updated representation |
| **When to Use** | Successful `GET` (single resource or collection), successful `PATCH`/`PUT` that completes synchronously, a login/verify call that completes synchronously (`API_SPECIFICATION.md` §2.2 Citizen OTP Verify) |
| **When NOT to Use** | Never for a resource-creation `POST` (use `201`); never for an operation that only *begins* asynchronous processing (use `202`); never to carry a business-level failure in the body (`success: false` must never ride on `200`) |
| **Example Scenario** | `GET /api/v1/complaints/{complaintId}` returns the complaint detail |
| **Example JSON Response** | `{ "success": true, "data": { "id": "cmp_001", "trackingId": "TMBM-ENG-202607-000123" }, "meta": { "requestId": "req_9f2c" } }` |
| **Related API Modules** | All (the most common success code across Sections 2–12) |
| **Best Practices** | Reserve `200` strictly for synchronous, complete success; pair with `ETag`/`Cache-Control` on cacheable reads (`09-Reports-APIs.md` §9.1.6) |

#### 13.2.2 `201 Created`

| | |
|---|---|
| **HTTP Code** | 201 |
| **Name** | Created |
| **Description** | The request created a new resource, synchronously, and the response body represents it |
| **When to Use** | `POST /departments` (`06-Administration-APIs.md` §6.1.2), `POST /roles`, `POST /notification-templates` — any synchronous, immediate resource creation |
| **When NOT to Use** | Never when creation is deferred to an async pipeline (complaint registration, file upload — use `202`); never for an update to an existing resource (use `200`) |
| **Example Scenario** | `POST /api/v1/departments` creates a new department row |
| **Example JSON Response** | `{ "success": true, "data": { "id": "dep_09", "code": "SWM", "isActive": true, "createdAt": "2026-07-20T09:00:00Z" }, "meta": { "requestId": "req_9f2c" } }` |
| **Related API Modules** | `06-Administration-APIs.md`, `08-Notification-APIs.md` §8.7 (templates), `09-Reports-APIs.md` §9.11/§9.12 (schedules/templates) |
| **Best Practices** | Include a `Location` header pointing at the new resource's canonical URL alongside the `201` body |

#### 13.2.3 `202 Accepted`

| | |
|---|---|
| **HTTP Code** | 202 |
| **Name** | Accepted |
| **Description** | The request has been accepted for asynchronous processing; the outcome is not yet known at response time |
| **When to Use** | Complaint registration (`API_SPECIFICATION.md` §4.1 — AI classification pending), voice complaint (§4.2 — transcription pending), file upload (`11-File-Management-APIs.md` §11.1 — virus scan pending), report/audit export (`09-Reports-APIs.md` §9.10, `10-Audit-APIs.md` §10.12), notification dispatch (`08-Notification-APIs.md` §8.2.1), bulk/broadcast jobs |
| **When NOT to Use** | Never when the client needs a guaranteed-final result in the same response (use `200`/`201` only when the operation truly completes synchronously); never as a way to avoid returning a proper `4xx` for a request that is already known to be invalid at accept time |
| **Example Scenario** | `POST /api/v1/complaints` — the tracking ID is issued immediately, but classification/assignment happen in the background |
| **Example JSON Response** | `{ "success": true, "data": { "id": "cmp_001", "trackingId": "TMBM-ENG-202607-000123", "statusLabel": "Registered" }, "meta": { "requestId": "req_9f2c" } }` |
| **Related API Modules** | `API_SPECIFICATION.md` §4, `08-Notification-APIs.md`, `09-Reports-APIs.md`, `10-Audit-APIs.md`, `11-File-Management-APIs.md` |
| **Best Practices** | Always pair with a documented status-poll endpoint or a notification (`12-Standard-Response-Formats.md` §12.13 Async Processing Response) — never leave a `202` caller with no way to learn the outcome |

#### 13.2.4 `204 No Content`

| | |
|---|---|
| **HTTP Code** | 204 |
| **Name** | No Content |
| **Description** | The request succeeded and there is intentionally no response body |
| **When to Use** | Successful `DELETE` (soft-delete) across every resource in Sections 6, 7, 11 |
| **When NOT to Use** | Never for a `DELETE` that needs to communicate anything beyond success (e.g. a computed side effect) — if the caller needs data back (such as `deletedAt`), use `200` with a body instead, as done for `API_SPECIFICATION.md` §11.4 File Delete |
| **Example Scenario** | `DELETE /api/v1/departments/{departmentId}` deactivates a department |
| **Example JSON Response** | *(no body)* |
| **Related API Modules** | `06-Administration-APIs.md`, `07-Geographic-APIs.md`, `11-File-Management-APIs.md` |
| **Best Practices** | Never include a `Content-Type` header on a `204` response; clients must not attempt to parse a body |

---

### 13.3 Redirection Responses (3xx)

#### 13.3.1 `302 Found`

| | |
|---|---|
| **HTTP Code** | 302 |
| **Name** | Found |
| **Description** | A temporary redirect to a signed, short-lived resource URL |
| **When to Use** | File download (`API_SPECIFICATION.md` §11.2), file preview (§11.3), export download (`09-Reports-APIs.md` §9.10.3) |
| **When NOT to Use** | Never for redirecting between API versions (use a documented deprecation, Section 15, not an HTTP redirect); never for a permanent resource relocation (this platform has none — use `301` only if that scenario ever arises, which it does not today) |
| **Example Scenario** | `GET /api/v1/files/{fileId}/download` redirects to a time-boxed signed storage URL |
| **Example JSON Response** | *(no JSON body; `Location` header carries the signed URL)* — a JSON alternative `{ "downloadUrl", "expiresAt" }` is returned instead when the client sends `Accept: application/json` |
| **Related API Modules** | `11-File-Management-APIs.md` §11.2, §11.3; `09-Reports-APIs.md` §9.10.3 |
| **Best Practices** | The signed URL's own expiry must always be shorter than any caching intermediary's default cache lifetime, to avoid a stale-but-still-cached redirect target |

#### 13.3.2 `304 Not Modified`

| | |
|---|---|
| **HTTP Code** | 304 |
| **Name** | Not Modified |
| **Description** | The cached representation the client already holds (per its supplied `If-None-Match`) is still current |
| **When to Use** | Cacheable report/dashboard reads (`09-Reports-APIs.md` §9.1.6, §9.2.1) when the underlying Reporting Table snapshot has not refreshed since the client's cached `ETag` |
| **When NOT to Use** | Never for a resource whose freshness is security-relevant per-request (auth/session endpoints are never cached); never returned with a response body |
| **Example Scenario** | `GET /api/v1/reports/dashboard/executive` with `If-None-Match: "gen-2026-07-20T09:00"` matching the current snapshot |
| **Example JSON Response** | *(no body)* |
| **Related API Modules** | `09-Reports-APIs.md` |
| **Best Practices** | `ETag` must be derived from the underlying data's own refresh timestamp, never from the response-generation time, or every request would miss the cache |

---
### 13.4 Client Errors (4xx)

#### 13.4.1 `400 Bad Request`

| | |
|---|---|
| **HTTP Code** | 400 |
| **Name** | Bad Request |
| **Description** | The request is malformed, or fails field-level validation, before any business logic is evaluated |
| **When to Use** | Missing required field, wrong data type, out-of-range value, unrecognized `sort`/`filter` query field (`API_SPECIFICATION.md` §1.9–§1.10), malformed pagination cursor |
| **When NOT to Use** | Never for a well-formed request that fails because of business state (use `409`/`422`); never for missing/invalid credentials (use `401`) |
| **Example Scenario** | `POST /api/v1/auth/citizen/otp/request` with a `mobileNumber` that does not match the Indian mobile pattern |
| **Example JSON Response** | `{ "success": false, "error": { "category": "validation", "code": "VALIDATION_ERROR", "details": [ { "field": "mobileNumber", "issue": "PATTERN_MISMATCH" } ] } }` |
| **Related API Modules** | All |
| **Best Practices** | Always populate `error.details` (`12-Standard-Response-Formats.md` §12.4) — a bare `400` with no field-level detail forces the client to guess |

#### 13.4.2 `401 Unauthorized`

| | |
|---|---|
| **HTTP Code** | 401 |
| **Name** | Unauthorized |
| **Description** | The request lacks valid authentication — missing, malformed, expired, or revoked credential |
| **When to Use** | Missing/invalid bearer token, expired access token, invalid OTP/MFA code, revoked refresh token |
| **When NOT to Use** | Never when the credential is valid but insufficient for the action (use `403`); never to intentionally obscure whether a resource exists (use `404` for that; `401` only communicates "you are not who you claim, or claim nothing") |
| **Example Scenario** | `GET /api/v1/citizens/me` with an expired JWT |
| **Example JSON Response** | `{ "success": false, "error": { "category": "authentication", "code": "TOKEN_EXPIRED" } }` |
| **Related API Modules** | All |
| **Best Practices** | Never distinguish "wrong password" from "unknown username" in `error.message` (OWASP A07 anti-enumeration, `API_SPECIFICATION.md` §2.9) |

#### 13.4.3 `403 Forbidden`

| | |
|---|---|
| **HTTP Code** | 403 |
| **Name** | Forbidden |
| **Description** | The credential is valid, but the caller's role/scope does not permit the requested action on this specific resource |
| **When to Use** | A Department Admin requesting another department's data, an Officer requesting an unassigned complaint, a system-role modification attempt (`06-Administration-APIs.md` §6.4.4) |
| **When NOT to Use** | Never for an unauthenticated request (use `401`); never as a disguised `404` for resource-existence hiding unless the platform deliberately wants that specific ambiguity (documented per-endpoint where used, e.g. `API_SPECIFICATION.md` §4.7 Complaint Tracking) |
| **Example Scenario** | A Department Admin for Water Supply calling `PATCH /api/v1/departments/{engineeringDeptId}` |
| **Example JSON Response** | `{ "success": false, "error": { "category": "authorization", "code": "FORBIDDEN" } }` |
| **Related API Modules** | All |
| **Best Practices** | Never reveal in `error.message` *which* specific permission/scope check failed — that would leak authorization-model internals to a probing client (`API_SPECIFICATION.md` §12.6) |

#### 13.4.4 `404 Not Found`

| | |
|---|---|
| **HTTP Code** | 404 |
| **Name** | Not Found |
| **Description** | The resource does not exist, or exists but is excluded from default queries (soft-deleted, `DATABASE_DESIGN.md` §21) |
| **When to Use** | An unknown `complaintId`, a deactivated department addressed directly, a tracking ID with no matching complaint |
| **When NOT to Use** | Never for a resource the caller is not authorized to see when the platform's design deliberately signals `403` instead (be consistent per-endpoint, not ad hoc); never for a malformed identifier (use `400` if the identifier itself fails format validation before a lookup is even attempted) |
| **Example Scenario** | `GET /api/v1/complaints/{complaintId}` for a non-existent id |
| **Example JSON Response** | `{ "success": false, "error": { "category": "business", "code": "COMPLAINT_NOT_FOUND" } }` |
| **Related API Modules** | All |
| **Best Practices** | Keep the `error.code` specific (`COMPLAINT_NOT_FOUND`, not a generic `NOT_FOUND`) so clients can render a precise empty-state message |

#### 13.4.5 `405 Method Not Allowed`

| | |
|---|---|
| **HTTP Code** | 405 |
| **Name** | Method Not Allowed |
| **Description** | The resource exists, but does not support the HTTP method used |
| **When to Use** | `DELETE /api/v1/permissions/{permissionId}` — Permissions are a read-only global catalog (`06-Administration-APIs.md` §6.5); `POST /api/v1/notifications/in-app` — In-App notifications have no direct "send" verb (`08-Notification-APIs.md` §8.6) |
| **When NOT to Use** | Never for a method that is valid on the resource but currently forbidden by role (use `403`, not `405` — `405` is a resource-shape fact, independent of who is asking) |
| **Example Scenario** | `PATCH /api/v1/audit-logs/{auditLogId}` — audit records are immutable, `PATCH` is never a valid method on this resource for anyone |
| **Example JSON Response** | `{ "success": false, "error": { "category": "validation", "code": "METHOD_NOT_ALLOWED" } }` |
| **Related API Modules** | `06-Administration-APIs.md` §6.5, `10-Audit-APIs.md` (immutable resources) |
| **Best Practices** | Include an `Allow` header listing the methods the resource does support |

#### 13.4.6 `406 Not Acceptable`

| | |
|---|---|
| **HTTP Code** | 406 |
| **Name** | Not Acceptable |
| **Description** | The server cannot produce a response matching the client's `Accept` header |
| **When to Use** | A client requests `Accept: application/xml` from an endpoint that only ever produces `application/json` |
| **When NOT to Use** | Never for a missing `Accept` header (default to `application/json` instead of rejecting); never used for the `302`-vs-JSON content negotiation on download/preview endpoints (`API_SPECIFICATION.md` §11.2) — that negotiation always succeeds one way or the other |
| **Example Scenario** | `GET /api/v1/complaints` with `Accept: text/csv` |
| **Example JSON Response** | `{ "success": false, "error": { "category": "validation", "code": "NOT_ACCEPTABLE" } }` |
| **Related API Modules** | All (rarely triggered — `application/json` is the platform's sole representation format outside of the documented file-download/redirect exceptions) |
| **Best Practices** | List supported media types in the error response so a misconfigured client can self-correct |

#### 13.4.7 `409 Conflict`

| | |
|---|---|
| **HTTP Code** | 409 |
| **Name** | Conflict |
| **Description** | The request is well-formed but conflicts with the current state of the resource |
| **When to Use** | `COMPLAINT_ALREADY_CLOSED`, `INVALID_STATUS_TRANSITION`, refresh-token reuse, `CONCURRENT_MODIFICATION` (optimistic concurrency, `08-Notification-APIs.md` §8.7.4), `FEEDBACK_ALREADY_SUBMITTED` |
| **When NOT to Use** | Never for a field-level validation failure (use `400`); never for a semantically-invalid-but-syntactically-fine reference that isn't a *state* conflict (use `422` — see Section 13.6's decision guidance) |
| **Example Scenario** | `POST /api/v1/complaints/{complaintId}/resolution` on an already-`Resolved` complaint |
| **Example JSON Response** | `{ "success": false, "error": { "category": "business", "code": "INVALID_STATUS_TRANSITION" } }` |
| **Related API Modules** | `API_SPECIFICATION.md` §4, `08-Notification-APIs.md`, `09-Reports-APIs.md` |
| **Best Practices** | Include the current conflicting state in `error.details` where practical (e.g. current status) so the client can react intelligently rather than just retrying blindly |

#### 13.4.8 `410 Gone`

| | |
|---|---|
| **HTTP Code** | 410 |
| **Name** | Gone |
| **Description** | The resource existed but is now permanently and intentionally unavailable |
| **When to Use** | A quarantined (malware-flagged) file (`API_SPECIFICATION.md` §11.2), a revoked share link (`11-File-Management-APIs.md` §11.6.3) |
| **When NOT to Use** | Never for a soft-deleted resource that might later be reactivated (use `404` instead — `410` implies permanence); never for a temporarily-unavailable dependency (use `503`) |
| **Example Scenario** | `GET /api/v1/files/{fileId}/download` for a file whose scan returned `infected` |
| **Example JSON Response** | `{ "success": false, "error": { "category": "business", "code": "FILE_QUARANTINED" } }` |
| **Related API Modules** | `11-File-Management-APIs.md` |
| **Best Practices** | Reserve `410` strictly for the permanent-and-intentional case — overuse erodes its signal value for monitoring/alerting |

#### 13.4.9 `412 Precondition Failed`

| | |
|---|---|
| **HTTP Code** | 412 |
| **Name** | Precondition Failed |
| **Description** | A conditional request header (`If-Match`) did not match the resource's current state |
| **When to Use** | An `If-Match` header supplied on Template Update (`08-Notification-APIs.md` §8.7.4) or Preference Update (§8.8.2) that does not match the current `version` |
| **When NOT to Use** | Never as a substitute for the body-level `expectedVersion` check already documented on those endpoints — `412` is the HTTP-header-conditional-request mechanism; `409 CONCURRENT_MODIFICATION` (Section 13.4.7) is this platform's **primary**, body-level optimistic-concurrency signal. Where both an `If-Match` header and an `expectedVersion` body field are supplied and they disagree with each other, the request itself is `400`, not `412`. |
| **Example Scenario** | `PATCH /api/v1/notification-templates/{templateId}` with `If-Match: "3"` when the template is already at version 4 |
| **Example JSON Response** | `{ "success": false, "error": { "category": "business", "code": "CONCURRENT_MODIFICATION" } }` |
| **Related API Modules** | `08-Notification-APIs.md`, `09-Reports-APIs.md` (optimistic-concurrency endpoints) |
| **Best Practices** | Document per-endpoint which of `409`/`412` a given concurrency-guarded endpoint actually returns, so client retry logic can be written precisely — this platform standardizes on `409` (Section 13.4.7) as the primary signal, with `412` reserved for pure HTTP-conditional-request usage if a future endpoint adopts `If-Match` as its sole mechanism |

#### 13.4.10 `413 Payload Too Large`

| | |
|---|---|
| **HTTP Code** | 413 |
| **Name** | Payload Too Large |
| **Description** | The request body (typically a file upload) exceeds the configured size ceiling |
| **When to Use** | A complaint image over 5 MB, a voice recording over 10 MB (SRS §8.2), a chunked-upload session's declared `totalSizeBytes` exceeding the ceiling for its `assetCategory` |
| **When NOT to Use** | Never for a JSON body that is merely long (e.g. a large `variables` object) unless it exceeds a documented, deliberate JSON-body size ceiling — file-size limits and JSON-payload limits are governed by separate, explicitly documented thresholds |
| **Example Scenario** | `POST /api/v1/complaints/{complaintId}/attachments` with a 7 MB JPEG |
| **Example JSON Response** | `{ "success": false, "error": { "category": "validation", "code": "FILE_TOO_LARGE" } }` |
| **Related API Modules** | `API_SPECIFICATION.md` §4.2/§4.3, `11-File-Management-APIs.md` §11.1 |
| **Best Practices** | Reject oversized uploads as early as possible (streaming size check), never after fully buffering the payload — a resource-exhaustion consideration as well as a UX one |

#### 13.4.11 `415 Unsupported Media Type`

| | |
|---|---|
| **HTTP Code** | 415 |
| **Name** | Unsupported Media Type |
| **Description** | The uploaded file's extension/MIME type (verified by magic-byte inspection, not the client-declared `Content-Type`) is not on the allow-list for its `assetCategory` |
| **When to Use** | A `.exe` file renamed to `.jpg` and uploaded as a complaint image; an audio file uploaded in a format outside WAV/MP3/OGG (SRS §8.2) |
| **When NOT to Use** | Never for a JSON request with a wrong `Content-Type` header value alone if the body is still parseable as JSON (use `400` for a genuinely malformed body) |
| **Example Scenario** | `POST /api/v1/files` with `assetCategory = before_photo` and a file whose magic bytes identify it as a Windows executable |
| **Example JSON Response** | `{ "success": false, "error": { "category": "validation", "code": "UNSUPPORTED_MEDIA_TYPE" } }` |
| **Related API Modules** | `API_SPECIFICATION.md` §4.2/§4.3, `11-File-Management-APIs.md` §11.1 |
| **Best Practices** | Always verify via magic-byte inspection server-side — never trust the client-declared `Content-Type`/file extension alone (SRS §8.2, OWASP A03/A08) |

#### 13.4.12 `422 Unprocessable Entity`

| | |
|---|---|
| **HTTP Code** | 422 |
| **Name** | Unprocessable Entity |
| **Description** | The request is syntactically well-formed but semantically invalid against business rules that are not purely a *state* conflict |
| **When to Use** | `CATEGORY_NOT_FOUND` (a referenced id doesn't exist within tenant), `OFFICER_OUT_OF_SCOPE`, `MALWARE_DETECTED`, `CHANNEL_DISABLED_BY_RECIPIENT`, `INVALID_LEVEL_ORDER` |
| **When NOT to Use** | Never for a resource *state* conflict that Section 13.4.7's `409` already covers (e.g. "already closed") — see Section 13.6 for the full decision tree distinguishing `409` from `422` |
| **Example Scenario** | `POST /api/v1/complaint-categories` with a `departmentId` that does not exist within the caller's tenant |
| **Example JSON Response** | `{ "success": false, "error": { "category": "business", "code": "DEPARTMENT_NOT_FOUND" } }` — note: a *missing* reference at creation time is sometimes `404`-shaped in this platform's own endpoint documentation (e.g. Section 6.2.2 uses `404 DEPARTMENT_NOT_FOUND`); `422` is reserved specifically for a reference that *exists* but is *invalid in context* (wrong scope, wrong type, wrong state) — the exact code is authoritative per-endpoint in Sections 2–11, this section documents the general decision criteria |
| **Related API Modules** | All |
| **Best Practices** | Use `422` sparingly and precisely — it is the platform's "I understood you perfectly, and the answer is still no" code, distinct from both `400` (I didn't understand the shape) and `409` (your state, not your content, is the problem) |

#### 13.4.13 `423 Locked`

| | |
|---|---|
| **HTTP Code** | 423 |
| **Name** | Locked |
| **Description** | The target account is locked due to repeated failed authentication attempts |
| **When to Use** | Login attempt against an account currently within its 15-minute lockout window (SRS §8.1) |
| **When NOT to Use** | Never for a merely-disabled (Admin-deactivated) account — that is `403 FORBIDDEN` or a dedicated `ACCOUNT_DEACTIVATED` code, not `423`, since `423` specifically signals a *temporary*, self-expiring lock |
| **Example Scenario** | A 6th consecutive failed password attempt on an Officer account |
| **Example JSON Response** | `{ "success": false, "error": { "category": "authentication", "code": "ACCOUNT_LOCKED" } }` |
| **Related API Modules** | `API_SPECIFICATION.md` §2.3/§2.5 |
| **Best Practices** | Do not reveal the exact remaining lockout duration in the response body if that would aid an attacker's timing strategy; SRS §8.1's fixed 15-minute window is a documented system parameter, not a per-response secret, so disclosure is acceptable here specifically |

#### 13.4.14 `428 Precondition Required`

| | |
|---|---|
| **HTTP Code** | 428 |
| **Name** | Precondition Required |
| **Description** | The endpoint requires a conditional header (e.g. `If-Match`) that the caller omitted |
| **When to Use** | `PATCH /api/v1/report-schedules/{scheduleId}` (`09-Reports-APIs.md` §9.11.4) called without the required `If-Match`/`expectedVersion` on an optimistic-concurrency-guarded resource |
| **When NOT to Use** | Never for endpoints that do not use optimistic concurrency at all (the vast majority of Sections 2–11) — `428` only applies to the specific, documented subset of endpoints requiring `expectedVersion` |
| **Example Scenario** | `PATCH /api/v1/notification-templates/{templateId}` with a body omitting `expectedVersion` |
| **Example JSON Response** | `{ "success": false, "error": { "category": "validation", "code": "PRECONDITION_REQUIRED" } }` |
| **Related API Modules** | `08-Notification-APIs.md` §8.7.4/§8.8.2/§8.13.4/§8.14.3, `09-Reports-APIs.md` §9.11.4/§9.12.4 |
| **Best Practices** | Document this requirement directly in each such endpoint's Request Body/Validation Rules — a caller should never discover the requirement only by hitting `428` |

#### 13.4.15 `429 Too Many Requests`

| | |
|---|---|
| **HTTP Code** | 429 |
| **Name** | Too Many Requests |
| **Description** | The caller has exceeded a rate limit |
| **When to Use** | OTP request throttling (`API_SPECIFICATION.md` §2.1), AI endpoint cost governance (Section 5), export-generation throttling, bulk broadcast throttling (`08-Notification-APIs.md` §8.13.1) |
| **When NOT to Use** | Never for a business-volume ceiling that isn't time-window-based (e.g. `MAX_FILES_EXCEEDED` per complaint is `422`, not `429` — it's a fixed business rule, not a rolling rate limit) |
| **Example Scenario** | A citizen requesting a 4th OTP within 10 minutes |
| **Example JSON Response** | `{ "success": false, "error": { "category": "business", "code": "RATE_LIMITED" } }` — see `12-Standard-Response-Formats.md` §12.12 for the full shape including `Retry-After` |
| **Related API Modules** | All (platform-wide Gateway-level throttle, `ARCHITECTURE.md` §16) |
| **Best Practices** | Always include `Retry-After`; never omit it on a `429` (`12-Standard-Response-Formats.md` §12.12) |

---
### 13.5 Server Errors (5xx)

#### 13.5.1 `500 Internal Server Error`

| | |
|---|---|
| **HTTP Code** | 500 |
| **Name** | Internal Server Error |
| **Description** | An unexpected, unhandled failure occurred server-side |
| **When to Use** | Any exception not otherwise mapped to a more specific status — a genuine bug or unanticipated condition |
| **When NOT to Use** | Never for an anticipated, documented failure mode (use the specific `4xx`/`5xx` code instead — a `500` should represent a gap in the platform's own error handling, not routine business/validation failure) |
| **Example Scenario** | An unhandled null-reference condition in a report-aggregation job |
| **Example JSON Response** | `{ "success": false, "error": { "category": "server", "code": "INTERNAL_ERROR" } }` |
| **Related API Modules** | All (should be rare in a mature implementation — its frequency is itself a monitored metric, `ARCHITECTURE.md` §15) |
| **Best Practices** | Never include a stack trace, internal file path, or raw exception message in the response body (`API_SPECIFICATION.md` §12.7) — capture full detail server-side only, PII-sanitized |

#### 13.5.2 `501 Not Implemented`

| | |
|---|---|
| **HTTP Code** | 501 |
| **Name** | Not Implemented |
| **Description** | The endpoint exists in the API contract but the specific capability is not enabled for this tenant |
| **When to Use** | GIS endpoints (`07-Geographic-APIs.md` §7.3–§7.6, §7.10–§7.16) when the tenant has not activated the optional GIS/generic-org-hierarchy feature flag (`DATABASE_DESIGN.md` §26, §28) |
| **When NOT to Use** | Never for a capability that simply doesn't exist anywhere in the platform (a nonexistent path is `404` at the routing layer, not `501`); never as a permanent state for a Phase-1-required capability |
| **Example Scenario** | `GET /api/v1/geo/heatmap` for a tenant that has not enabled the GIS feature flag |
| **Example JSON Response** | `{ "success": false, "error": { "category": "business", "code": "NOT_ENABLED" } }` |
| **Related API Modules** | `07-Geographic-APIs.md` |
| **Best Practices** | Pair with `06-Administration-APIs.md` §6.10's Feature Flag APIs so a client can proactively check enablement rather than discovering it via a failed call |

#### 13.5.3 `502 Bad Gateway`

| | |
|---|---|
| **HTTP Code** | 502 |
| **Name** | Bad Gateway |
| **Description** | An upstream dependency (Claude API, Whisper, an SMS/WhatsApp/Email/Maps provider) returned an invalid or unexpected response |
| **When to Use** | A provider's API returns a malformed response the platform cannot parse |
| **When NOT to Use** | Never when the upstream is simply unreachable/timing out (use `503`/`504` — `502` specifically means "the upstream responded, but its response was itself invalid") |
| **Example Scenario** | The WhatsApp Business Platform API returns an unexpected response shape mid-dispatch |
| **Example JSON Response** | `{ "success": false, "error": { "category": "server", "code": "PROVIDER_UNAVAILABLE" } }` |
| **Related API Modules** | `API_SPECIFICATION.md` §5, `08-Notification-APIs.md`, `07-Geographic-APIs.md` §7.12 |
| **Best Practices** | Log the raw upstream response server-side (for provider-relationship troubleshooting) without ever surfacing it to the client |

#### 13.5.4 `503 Service Unavailable`

| | |
|---|---|
| **HTTP Code** | 503 |
| **Name** | Service Unavailable |
| **Description** | A required upstream dependency is currently unreachable or has exhausted its own capacity |
| **When to Use** | Claude API unavailable (falls back to a deterministic default where one exists, per `ARCHITECTURE.md` §8.3, otherwise `503`), Whisper unreachable, SMS/WhatsApp/Email/Maps provider down, the notification queue itself backed up beyond a health threshold (`08-Notification-APIs.md` §8.16) |
| **When NOT to Use** | Never for the platform's own internal overload — that is either `429` (client-caused, rate-limited) or `500` (an internal fault); `503` is reserved for a *named, external* dependency being the cause |
| **Example Scenario** | `POST /api/v1/ai/complaint-classification` when the Claude API is unreachable and no rule-based fallback exists for the specific sub-task |
| **Example JSON Response** | `{ "success": false, "error": { "category": "server", "code": "AI_PROVIDER_UNAVAILABLE" } }` |
| **Related API Modules** | `API_SPECIFICATION.md` §5, `07-Geographic-APIs.md` §7.12, `08-Notification-APIs.md` |
| **Best Practices** | Always prefer degrading to a documented deterministic fallback (`ARCHITECTURE.md` §8.3) over returning `503`, wherever a fallback is designed for that specific capability; reserve `503` for the cases with no fallback path |

#### 13.5.5 `504 Gateway Timeout`

| | |
|---|---|
| **HTTP Code** | 504 |
| **Name** | Gateway Timeout |
| **Description** | An upstream dependency did not respond within the platform's configured timeout window |
| **When to Use** | A Claude API call, Whisper transcription, or provider API call that exceeds its configured timeout without a response |
| **When NOT to Use** | Never for a request the platform itself is still legitimately processing within its own expected latency budget (that is not a timeout, it's a slow-but-in-flight request) |
| **Example Scenario** | A Whisper transcription job that exceeds its configured processing-time ceiling |
| **Example JSON Response** | `{ "success": false, "error": { "category": "server", "code": "AI_PROVIDER_UNAVAILABLE" } }` |
| **Related API Modules** | `API_SPECIFICATION.md` §5 |
| **Best Practices** | Timeout thresholds are tuned per upstream dependency (`ARCHITECTURE.md` §15's per-service latency metrics) and should trigger a monitored alert on any sustained increase in `504` frequency, since it is a leading indicator of upstream provider degradation |

---
### 13.6 Business Validation Errors

Business validation errors are never a distinct HTTP status family of their own — they are always carried by one of `400`, `409`, or `422` (Sections 13.4.1, 13.4.7, 13.4.12), and this subsection exists solely to make the **decision tree** between those three explicit and consistent platform-wide, since this is the single most common source of inconsistency in a large API surface.

| Question | If Yes → | If No, ask next |
|---|---|---|
| Is the request shape itself invalid (missing field, wrong type, out-of-range, unrecognized query param)? | `400 VALIDATION_ERROR` | ↓ |
| Is the request shape valid, but the resource's **current state** makes this specific action invalid right now (e.g. already closed, already submitted, version mismatch)? | `409 Conflict` | ↓ |
| Is the request shape valid, every referenced id resolvable, but the **combination is semantically wrong** regardless of state (wrong scope, wrong category, disabled channel, invalid level ordering)? | `422 Unprocessable Entity` | Re-examine — every business error fits one of the three above |

**Example — `409` vs. `422` distinguished**: `POST /api/v1/complaints/{complaintId}/resolution` on an already-`Resolved` complaint is `409` (a *state* problem — the same request would have succeeded an hour ago). `POST /api/v1/complaints/{complaintId}/assignments` with an `officerId` belonging to a different department is `422` (a *content* problem — the request would never succeed regardless of the complaint's current state, since that officer is structurally out of scope).

**Related API Modules**: All. **Best Practices**: When documenting a *new* endpoint (any future Section 17+), apply this decision tree before choosing a code — do not default to `400` for every business failure, which is the most common anti-pattern this reference exists to prevent.

---

### 13.7 Rate Limiting Errors

All rate-limit outcomes use `429 Too Many Requests` (Section 13.4.15) with the `Retry-After`-bearing shape fixed in `12-Standard-Response-Formats.md` §12.12. This subsection catalogs the platform's distinct throttle tiers so the *reason* for a given `429` is always traceable.

| Throttle | Scope | Typical Window | Related Section |
|---|---|---|---|
| OTP Request | per mobile number | 3 / 10 minutes | `API_SPECIFICATION.md` §2.1 |
| Login attempts | per account | 5 attempts → 15-minute lock (`423`, not `429` — see Section 13.4.13) | SRS §8.1 |
| AI endpoint calls | per tenant | Cost-governed, tuned per agent (`ARCHITECTURE.md` §8.3) | `API_SPECIFICATION.md` §5 |
| Report/audit export generation | per tenant | Throttled to bound Scheduler load | `09-Reports-APIs.md` §9.10.1, `10-Audit-APIs.md` §10.12.1 |
| Bulk retry / bulk notification | per tenant | Tightly throttled (mass-dispatch risk) | `08-Notification-APIs.md` §8.11.2, §8.14.1 |
| Broadcast creation | per tenant | Strict, small per-hour ceiling | `08-Notification-APIs.md` §8.13.1 |
| Test-send endpoints | per Admin | 10–20 / hour | `08-Notification-APIs.md` §8.2.3, §8.3.3, §8.4.3, §8.5.3 |

**Related API Modules**: All (Gateway-enforced, `ARCHITECTURE.md` §16 Redis token-bucket). **Best Practices**: A `429` must always be recoverable by the documented `Retry-After` wait alone — never a throttle that additionally requires a support-desk unlock (that scenario is `423`, a security-lockout, not a rate limit).

---

### 13.8 Security Errors

Security-relevant outcomes span `401`, `403`, and `423` (Sections 13.4.2, 13.4.3, 13.4.13); this subsection is the consolidated security-review-facing view of that same territory.

| Security Scenario | Status | `error.code` |
|---|---|---|
| No/expired/malformed bearer token | `401` | `TOKEN_INVALID` / `TOKEN_EXPIRED` |
| Denylisted (revoked) token presented | `401` | `TOKEN_REVOKED` |
| Valid token, insufficient role/scope | `403` | `FORBIDDEN` |
| Privilege-escalation attempt (e.g. Department Admin creating a Corporation Admin) | `403` | `FORBIDDEN` (logged with elevated audit priority, `06-Administration-APIs.md` §6.3.2) |
| Repeated failed login attempts | `423` | `ACCOUNT_LOCKED` |
| MFA challenge failed/expired | `401` | `MFA_INVALID_OR_EXPIRED` |
| Refresh token reused after rotation (theft indicator) | `401` | `REFRESH_TOKEN_REUSED_FAMILY_REVOKED` |

**Related API Modules**: `API_SPECIFICATION.md` §2, `06-Administration-APIs.md`, `10-Audit-APIs.md` §10.10. **Best Practices**: Every row above is logged to `auth_event_log`/`activity_log` regardless of outcome (`10-Audit-APIs.md` §10.3–§10.4, §10.10) — security errors are never "silent" at the persistence layer even when the response body is deliberately terse.

---

### 13.9 AI Processing Errors

AI endpoints (`API_SPECIFICATION.md` §5) use the same general-purpose codes as every other domain, with one AI-specific behavioral nuance: **degrade before you fail**.

| Scenario | Status | `error.code` | Notes |
|---|---|---|---|
| Claude API unreachable, deterministic fallback exists | `200` (not an error) | — | `meta.aiProviderDegraded: true` (`12-Standard-Response-Formats.md` §12.11), per `ARCHITECTURE.md` §8.3 |
| Claude API unreachable, no fallback for this specific sub-task | `503` | `AI_PROVIDER_UNAVAILABLE` | Section 13.5.4 |
| Complaint not yet classified when priority prediction requested | `409` | `CLASSIFICATION_NOT_YET_COMPLETE` | A sequencing/state conflict, per Section 13.6's decision tree |
| Malformed classification input | `400` | `VALIDATION_ERROR` | |
| AI cost-governance throttle exceeded | `429` | `RATE_LIMITED` | Section 13.7 |

**Related API Modules**: `API_SPECIFICATION.md` §5, `07-Geographic-APIs.md` §7.12 (Complaint Agent Location Detection). **Best Practices**: An AI endpoint's first obligation on upstream failure is to check whether a documented deterministic fallback exists (`ARCHITECTURE.md` §8.3) before returning any error status at all — a government citizen-service platform must never let an LLM outage block complaint registration.

---

### 13.10 File Processing Errors

| Scenario | Status | `error.code` | Related Section |
|---|---|---|---|
| Oversized upload | `413` | `FILE_TOO_LARGE` | Section 13.4.10 |
| Disallowed/spoofed file type | `415` | `UNSUPPORTED_MEDIA_TYPE` | Section 13.4.11 |
| Malware detected | `422` | `MALWARE_DETECTED` | Section 13.4.12 |
| Download/preview attempted before scan completes | `409` | `FILE_NOT_YET_SCANNED` | Section 13.4.7 |
| Download attempted on a quarantined file | `410` | `FILE_QUARANTINED` | Section 13.4.8 |
| Per-complaint attachment ceiling exceeded | `422` | `MAX_ATTACHMENTS_EXCEEDED` | Section 13.4.12 |
| Deletion blocked (sole evidence on an open complaint) | `409` | `FILE_PROTECTED` | Section 13.4.7 |

**Related API Modules**: `API_SPECIFICATION.md` §4.2/§4.3, `11-File-Management-APIs.md`. **Best Practices**: The antivirus/MIME-verification pipeline (SRS §8.2) runs identically regardless of which endpoint initiates the upload (`API_SPECIFICATION.md` §4.2, §4.3, `11-File-Management-APIs.md` §11.1) — these error codes are correspondingly identical across all upload entry points, never endpoint-specific variants of the same underlying failure.

---

### 13.11 Notification Errors

| Scenario | Status | `error.code` | Related Section |
|---|---|---|---|
| Template not found/not approved | `404` / `409` | `TEMPLATE_NOT_FOUND` / `TEMPLATE_NOT_APPROVED` | Sections 13.4.4, 13.4.7 |
| Recipient has disabled the channel (no override) | `422` | `CHANNEL_DISABLED_BY_RECIPIENT` | Section 13.4.12 |
| Provider unreachable | `503` | `PROVIDER_UNAVAILABLE` | Section 13.5.4 |
| Notification not currently retryable (wrong status) | `409` | `NOTIFICATION_NOT_RETRYABLE` | Section 13.4.7 |
| Bulk/broadcast recipient set exceeds ceiling | `422` | `RECIPIENT_LIST_EXCEEDS_LIMIT` | Section 13.4.12 |
| Broadcast/bulk creation throttled | `429` | `RATE_LIMITED` | Section 13.7 |

**Related API Modules**: `08-Notification-APIs.md`. **Best Practices**: An Emergency Override (`08-Notification-APIs.md` §8.8.4) never itself produces `CHANNEL_DISABLED_BY_RECIPIENT` — that is precisely the error condition it exists to bypass, with its own mandatory audit trail in place of the block.

---

### 13.12 Standard Error Mapping

The master, platform-wide table — every category from `API_SPECIFICATION.md` §12.2 mapped to its status codes and the sections where each is elaborated.

| `error.category` | Status Codes | Elaborated In |
|---|---|---|
| `validation` | `400`, `405`, `406`, `413`, `415`, `428` | Sections 13.4.1, 13.4.5, 13.4.6, 13.4.10, 13.4.11, 13.4.14 |
| `business` | `404`, `409`, `410`, `422`, `429`, `501` | Sections 13.4.4, 13.4.7, 13.4.8, 13.4.12, 13.4.15, 13.5.2 |
| `authentication` | `401`, `423` | Sections 13.4.2, 13.4.13 |
| `authorization` | `403` | Section 13.4.3 |
| `server` | `500`, `502`, `503`, `504` | Sections 13.5.1, 13.5.3, 13.5.4, 13.5.5 |

**Related API Modules**: All. **Best Practices**: This table is the canonical cross-reference for any future section (17+) or any external integrator (SRS §3.9) needing to build generic, category-driven error handling without enumerating every individual `error.code` value.

---

*(End of Section 13.)*



