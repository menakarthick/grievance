# API Specification Document — Section 12

## AI Powered Enterprise Citizen Service & Grievance Management Platform

> **Continuation note**: This file continues the API Specification from the end of the approved Section 11 (File Management APIs, `docs/11-File-Management-APIs.md`). Sections 1–11 are not reproduced, summarized, or modified here. This file contains **only** Section 12 (Standard Response Formats) and formalizes, with full field-level detail, the envelope already fixed at a summary level in `docs/API_SPECIFICATION.md` §12. No SQL, no Express routes, no controllers, no services, no implementation code.

---

## 12. Standard Response Formats

Every response from every endpoint across Sections 2–11 is an instance of one of the 15 formats below. A client that understands these 15 shapes never needs endpoint-specific parsing logic anywhere in the platform. All formats share three non-negotiable properties, restated once here rather than in every subsection: (1) every response body is JSON (`Content-Type: application/json`) except signed-URL redirects (`302 Found`) and file downloads themselves; (2) every response carries `X-Request-Id` and, where applicable, `X-Correlation-Id` response headers (`API_SPECIFICATION.md` §1.14–§1.15); (3) every response is versioned implicitly by its `/api/v1` base path (`API_SPECIFICATION.md` §15).

---

### 12.1 Standard Success Response

**JSON Structure**

```json
{
  "success": true,
  "data": { "...endpoint-specific payload..." },
  "meta": {
    "requestId": "req_9f2c4a1b",
    "correlationId": "corr_1a4b7e20",
    "timestamp": "2026-07-20T09:15:32.481Z"
  }
}
```

**Field Definitions**

| Field | Type | Required | Description |
|---|---|---|---|
| `success` | boolean | Required | Always `true` for this envelope |
| `data` | object \| array | Required | The endpoint-specific payload documented per operation in Sections 2–11 |
| `meta.requestId` | string | Required | Unique identifier for this HTTP request/response pair (`API_SPECIFICATION.md` §1.15) |
| `meta.correlationId` | string | Optional | Present when the request participates in a multi-service chain (`API_SPECIFICATION.md` §1.14) |
| `meta.timestamp` | string (ISO-8601) | Required | Server-side response generation time, UTC |
| `meta.pagination` | object | Optional | Present only on paginated list endpoints — see Section 12.3 |

**Validation**: `data`'s inner shape is validated against the specific operation's documented schema (Sections 2–11); this envelope itself performs no additional validation.

**Error Codes**: Not applicable — this is the success envelope.

**Best Practices**: Clients should treat any field not explicitly documented for a given endpoint as optional/forward-compatible (`API_SPECIFICATION.md` §15.3) — never fail parsing on an unrecognized field. Always read `data` through the specific operation's documented shape, never assume a common superset across endpoints.

**Security Considerations**: `meta` never carries session tokens, internal service hostnames, or stack traces. `requestId`/`correlationId` are opaque identifiers with no embedded PII.

---

### 12.2 Standard Error Response

**JSON Structure**

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
    "requestId": "req_9f2c4a1b",
    "correlationId": "corr_1a4b7e20",
    "timestamp": "2026-07-20T09:15:32.481Z"
  }
}
```

**Field Definitions**

| Field | Type | Required | Description |
|---|---|---|---|
| `success` | boolean | Required | Always `false` for this envelope |
| `error.category` | string enum | Required | One of `validation`, `business`, `authentication`, `authorization`, `server` (`API_SPECIFICATION.md` §12.3–§12.7) |
| `error.code` | string | Required | Stable, machine-readable reason code, e.g. `COMPLAINT_ALREADY_CLOSED`, `OTP_INVALID_OR_EXPIRED` — never changes meaning within a major API version (`API_SPECIFICATION.md` §15.3) |
| `error.message` | string | Required | Human-readable, safe-to-display explanation — localized per `Accept-Language` where the error originates from user input |
| `error.details` | array | Optional | Present for `validation` errors (Section 12.4); omitted or category-specific for other categories |
| `meta.*` | — | Required | Same shape as Section 12.1 |

**Validation**: `error.code` must always be present alongside the HTTP status; clients must branch on `error.code`, never on `error.message` text (which may be localized and is not a stable contract).

**Error Codes**: The full HTTP status ↔ category mapping is fixed in `API_SPECIFICATION.md` §13; every specific `error.code` value used throughout Sections 2–11 is documented against its originating endpoint.

**Best Practices**: Never construct client-side logic that parses `error.message`; always match on `error.code`. Log `meta.requestId` alongside any user-facing error report to enable server-side correlation during support triage.

**Security Considerations**: `error.message` never includes a stack trace, internal file path, SQL fragment, or raw exception string (`API_SPECIFICATION.md` §12.7) — these are captured server-side only, PII-sanitized (`ARCHITECTURE.md` §15).

---

### 12.3 Pagination Response

Two mutually exclusive shapes, never mixed on one endpoint (`API_SPECIFICATION.md` §1.8).

**JSON Structure — Keyset/Cursor** (high-volume, time-ordered collections)

```json
{
  "success": true,
  "data": [ { "...item..." } ],
  "meta": {
    "requestId": "req_9f2c4a1b",
    "pagination": {
      "nextCursor": "eyJjcmVhdGVkQXQiOiIyMDI2LTA3LTIwIn0",
      "hasMore": true
    }
  }
}
```

**JSON Structure — Offset** (small, bounded admin/config collections)

```json
{
  "success": true,
  "data": [ { "...item..." } ],
  "meta": {
    "requestId": "req_9f2c4a1b",
    "pagination": {
      "page": 1,
      "size": 20,
      "totalCount": 143,
      "totalPages": 8
    }
  }
}
```

**Field Definitions**

| Field | Type | Required | Description |
|---|---|---|---|
| `pagination.nextCursor` | string (opaque) | Required (keyset) | Encodes the last-seen sort key; pass back as `?cursor=` for the next page; absent/`null` on the final page |
| `pagination.hasMore` | boolean | Required (keyset) | `true` if a subsequent page exists |
| `pagination.page` | integer | Required (offset) | 1-indexed current page |
| `pagination.size` | integer | Required (offset) | Items per page (as requested, capped per endpoint) |
| `pagination.totalCount` | integer | Required (offset) | Total matching items across all pages |
| `pagination.totalPages` | integer | Required (offset) | `ceil(totalCount / size)` |

**Validation**: `cursor` values are opaque and must never be constructed client-side — an unrecognized/tampered cursor returns `400 VALIDATION_ERROR` (`error.code = INVALID_CURSOR`). `page`/`size` are validated per-endpoint bounds (`API_SPECIFICATION.md` §1.8).

**Error Codes**: `INVALID_CURSOR`, `PAGE_OUT_OF_RANGE`.

**Best Practices**: Never attempt to compute `totalCount` for a keyset-paginated endpoint (deliberately omitted — computing it would reintroduce the `OFFSET` performance cliff keyset pagination exists to avoid). Always treat `cursor` as opaque and forward it verbatim.

**Security Considerations**: Cursors never encode raw internal database identifiers in a reversible, tamperable way without a server-side integrity check — a modified cursor is detected and rejected, not silently misinterpreted into another tenant's data window.

---

### 12.4 Validation Error Response

**JSON Structure**

```json
{
  "success": false,
  "error": {
    "category": "validation",
    "code": "VALIDATION_ERROR",
    "message": "Request failed validation",
    "details": [
      { "field": "description", "issue": "REQUIRED", "message": "description is required" },
      { "field": "priority", "issue": "INVALID_ENUM_VALUE", "message": "priority must be one of low, medium, high, critical" }
    ]
  },
  "meta": { "requestId": "req_9f2c4a1b" }
}
```

**Field Definitions**

| Field | Type | Required | Description |
|---|---|---|---|
| `error.details[].field` | string | Required | The offending field's name, using the same dot-notation as the request body (e.g. `location.wardId`) |
| `error.details[].issue` | string enum | Required | `REQUIRED`, `INVALID_TYPE`, `INVALID_ENUM_VALUE`, `PATTERN_MISMATCH`, `OUT_OF_RANGE`, `TOO_LONG`, `TOO_SHORT`, `DUPLICATE_VALUE` |
| `error.details[].message` | string | Optional | Human-readable, field-specific explanation |

**Validation**: `details` is always an array, even for a single field failure — client form-binding logic can rely on a consistent array shape.

**Error Codes**: `error.code` at the top level is always `VALIDATION_ERROR` (`400`); the per-field `issue` values above are the finer-grained taxonomy.

**Best Practices**: A form UI should map `error.details[].field` directly to its own field-level error display, using `issue` (not `message`) to select a localized, UI-owned error string where the platform's own `message` isn't in the desired tone/language.

**Security Considerations**: Field names are always the public API contract's own field names, never internal database column names — no schema-shape leakage (OWASP A04).

---

### 12.5 Bulk Operation Response

Covers every bulk endpoint (`API_SPECIFICATION.md` §1's bulk-operations requirement; `08-Notification-APIs.md` §8.11.2, §8.14; `09-Reports-APIs.md`'s export jobs).

**JSON Structure**

```json
{
  "success": true,
  "data": {
    "totalCount": 50,
    "succeededCount": 47,
    "failedCount": 3,
    "results": [
      { "itemId": "ntf_001", "status": "succeeded" },
      { "itemId": "ntf_002", "status": "failed", "error": { "code": "TEMPLATE_NOT_FOUND" } }
    ]
  },
  "meta": { "requestId": "req_9f2c4a1b" }
}
```

**Field Definitions**

| Field | Type | Required | Description |
|---|---|---|---|
| `data.totalCount` | integer | Required | Total items submitted for the bulk operation |
| `data.succeededCount` | integer | Required | Items that completed successfully |
| `data.failedCount` | integer | Required | Items that failed |
| `data.results[].itemId` | string | Required | The identifier of the specific item (per-recipient, per-record) |
| `data.results[].status` | string enum | Required | `succeeded` \| `failed` \| `skipped` |
| `data.results[].error` | object | Optional | Present only when `status = failed`; shape is Section 12.2's `error` object, scoped to that one item |

**Validation**: `succeededCount + failedCount` (+ any `skipped`) always equals `totalCount`; a bulk operation is never partially reported — every submitted item appears exactly once in `results`.

**Error Codes**: The bulk operation's own HTTP status is `200`/`202` even when `failedCount > 0` — a partial failure within a bulk batch is not itself an HTTP-level error; only a request-level failure (e.g. the whole batch was malformed) returns Section 12.2's error envelope instead of this shape.

**Best Practices**: Always inspect `data.failedCount` even on a `200`/`202` response — a bulk operation's "success" at the HTTP level does not guarantee every item succeeded. For large batches, prefer the async job pattern (Section 12.13) over a large synchronous `results` array.

**Security Considerations**: Per-item error detail follows the same information-disclosure discipline as Section 12.2 — no internal detail beyond `code`/`message` per failed item.

---

### 12.6 File Upload Response

**JSON Structure**

```json
{
  "success": true,
  "data": {
    "fileAssetId": "fa_7c21",
    "assetCategory": "before_photo",
    "mimeType": "image/jpeg",
    "sizeBytes": 482911,
    "virusScanStatus": "pending",
    "lifecycleState": "quarantine",
    "createdAt": "2026-07-20T09:15:32.481Z"
  },
  "meta": { "requestId": "req_9f2c4a1b" }
}
```

**Field Definitions**

| Field | Type | Required | Description |
|---|---|---|---|
| `data.fileAssetId` | string | Required | External identifier for the uploaded file |
| `data.assetCategory` | string | Required | The `FILE_ASSET_CATEGORY` reference value (`DATABASE_DESIGN.md` §30) |
| `data.mimeType` | string | Required | Server-verified MIME type (magic-byte inspection, not the client-declared `Content-Type`) |
| `data.sizeBytes` | integer | Required | Verified file size |
| `data.virusScanStatus` | string enum | Required | `pending` at upload time; becomes `clean`/`infected`/`scan_failed` asynchronously (`11-File-Management-APIs.md` §11.8) |
| `data.lifecycleState` | string enum | Required | `quarantine` at upload time |
| `data.createdAt` | string (ISO-8601) | Required | Upload timestamp |

**Validation**: HTTP status is always `202 Accepted`, never `201` — the file is not yet usable (Section 11.1.1's business rule) until the scan completes.

**Error Codes**: `FILE_TOO_LARGE` (`413`), `UNSUPPORTED_MEDIA_TYPE` (`415`), `MAX_FILES_EXCEEDED` (`422`), `MALWARE_DETECTED` (`422`, when detected synchronously by a fast pre-check).

**Best Practices**: Clients must poll Section 11.8.1 (or listen for the corresponding notification) before offering the file for download/preview — never assume immediate availability from the upload response alone.

**Security Considerations**: The response never includes a direct storage path or unsigned URL — only the opaque `fileAssetId`, resolved to a signed URL exclusively via Section 11.2/11.3.

---

### 12.7 Authentication Response

**JSON Structure — Token Issuance**

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "rtk_9c2a4f11",
    "expiresIn": 900,
    "user": { "id": "usr_456", "userType": "officer", "tenantId": "tmbm", "roles": ["officer"] }
  },
  "meta": { "requestId": "req_9f2c4a1b" }
}
```

**JSON Structure — Challenge Issuance** (OTP/MFA intermediate step)

```json
{
  "success": true,
  "data": { "otpChallengeId": "chl_001", "otpExpirySeconds": 300 },
  "meta": { "requestId": "req_9f2c4a1b" }
}
```

**Field Definitions**

| Field | Type | Required | Description |
|---|---|---|---|
| `data.accessToken` | string (JWT) | Required (final step) | Short-lived bearer token, 15-minute default expiry (SRS §8.1) |
| `data.refreshToken` | string (opaque) | Required (final step) | Single-use, rotated on each use (`API_SPECIFICATION.md` §2.7) |
| `data.expiresIn` | integer (seconds) | Required (final step) | Access token remaining lifetime at issuance |
| `data.user.id` / `userType` / `tenantId` / `roles` | — | Required (final step) | Minimal identity claims mirrored from the JWT, for immediate client-side display without a decode step |
| `data.otpChallengeId` / `mfaChallengeId` | string | Required (challenge step) | Opaque reference to the pending challenge, passed to the verify call |

**Validation**: `refreshToken` is never logged, never included in any response other than this one and Section 12.7's refresh-response variant.

**Error Codes**: `INVALID_CREDENTIALS` (`401`), `ACCOUNT_LOCKED` (`423`), `OTP_INVALID_OR_EXPIRED` (`401`), `MFA_INVALID_OR_EXPIRED` (`401`), `TOO_MANY_ATTEMPTS` (`429`).

**Best Practices**: Store `refreshToken` in the most restrictive storage the client platform offers (httpOnly cookie for web, secure keystore for mobile) — never `localStorage`. Treat `accessToken` as short-lived by design; do not attempt to extend its life client-side.

**Security Considerations**: `password`, `otp`, `totpCode` are never echoed back in any response, success or error. Distinguishing "wrong password" from "unknown username" is deliberately avoided in `error.message` (OWASP A07, `API_SPECIFICATION.md` §2.9).

---
### 12.8 Notification Response

**JSON Structure**

```json
{
  "success": true,
  "data": {
    "notificationDispatchId": "ntf_882a",
    "channel": "sms",
    "status": "queued",
    "providerMessageId": null
  },
  "meta": { "requestId": "req_9f2c4a1b" }
}
```

**Field Definitions**

| Field | Type | Required | Description |
|---|---|---|---|
| `data.notificationDispatchId` | string | Required | External identifier for the dispatch |
| `data.channel` | string enum | Required | One of the Section 8.1.2 channel values |
| `data.status` | string enum | Required | One of the Section 8.1.7 lifecycle values (`queued` at dispatch time) |
| `data.providerMessageId` | string \| null | Optional | Populated once the provider acknowledges receipt; `null` immediately after `queued` |

**Validation**: `status` transitions only follow the lifecycle in `08-Notification-APIs.md` §8.1.7 — a client should never observe an out-of-order transition (e.g. `delivered` before `sent`).

**Error Codes**: `TEMPLATE_NOT_FOUND` (`404`), `TEMPLATE_NOT_APPROVED` (`409`), `CHANNEL_DISABLED_BY_RECIPIENT` (`422`), `PROVIDER_UNAVAILABLE` (`503`).

**Best Practices**: Poll Section 8's per-channel status endpoint (or subscribe to the corresponding in-app notification) rather than assuming delivery from the `202`/`200` response alone — dispatch acceptance and actual delivery are distinct events.

**Security Considerations**: Never includes the rendered message body/recipient contact detail in the dispatch response itself — only status metadata, consistent with `08-Notification-APIs.md`'s per-endpoint Security Considerations.

---

### 12.9 Report Response

**JSON Structure — Tabular**

```json
{
  "success": true,
  "data": [ { "departmentId": "dep_01", "registeredCount": 120, "resolvedCount": 98 } ],
  "meta": {
    "requestId": "req_9f2c4a1b",
    "generatedAt": "2026-07-20T09:00:00.000Z",
    "pagination": { "page": 1, "size": 20, "totalCount": 12, "totalPages": 1 }
  }
}
```

**JSON Structure — Chart**

```json
{
  "success": true,
  "data": { "chartType": "line", "series": [ { "seriesKey": "registeredCount", "points": [ { "date": "2026-07-01", "value": 42 } ] } ] },
  "meta": { "requestId": "req_9f2c4a1b", "generatedAt": "2026-07-20T09:00:00.000Z" }
}
```

**Field Definitions**

| Field | Type | Required | Description |
|---|---|---|---|
| `data.chartType` | string enum | Required (chart shape) | `line` \| `bar` \| `pie` \| `heatmap` (`09-Reports-APIs.md` §9.1.3) |
| `data.series[].seriesKey` | string | Required (chart shape) | Identifies which metric a data series represents |
| `data.series[].points[].date` / `.value` | string / number | Required (chart shape) | One time-series data point |
| `meta.generatedAt` | string (ISO-8601) | Required | When the underlying pre-aggregated Reporting Table snapshot was computed — distinct from `meta.timestamp` (the response-generation time), since report data may be cached (`09-Reports-APIs.md` §9.1.6) |

**Validation**: `meta.generatedAt` must always be present on report responses so a client can display data staleness (e.g. "as of 9:00 AM").

**Error Codes**: `VALIDATION_ERROR` (missing/invalid period), `FORBIDDEN` (scope violation).

**Best Practices**: Render `chartType` as a hint only — a client is free to render a `bar`-typed payload as a table if its UI calls for it; the field communicates the report designer's intent, not a hard rendering requirement.

**Security Considerations**: Report responses are always aggregate — no report response in Section 9 ever includes a single citizen's raw complaint text or contact detail; drill-down/drill-through responses (Section 9.1.4) return the same tenant/scope-filtered `Complaint`-shaped rows as `API_SPECIFICATION.md` §4.8, not an unfiltered dump.

---

### 12.10 Audit Response

**JSON Structure**

```json
{
  "success": true,
  "data": {
    "id": "aud_5521",
    "actorUserId": "usr_456",
    "action": "complaint.status_change",
    "entityType": "complaint",
    "entityId": "cmp_001",
    "changeSummary": { "before": { "statusId": "st_02" }, "after": { "statusId": "st_03" } },
    "correlationId": "corr_1a4b7e20",
    "createdAt": "2026-07-20T09:00:00.000Z"
  },
  "meta": { "requestId": "req_9f2c4a1b" }
}
```

**Field Definitions**

| Field | Type | Required | Description |
|---|---|---|---|
| `data.id` | string | Required | External identifier for the audit record |
| `data.actorUserId` | string \| null | Required | `null` for system/scheduler-originated actions |
| `data.action` | string | Required | Dot-notation action key (`<entity>.<verb>`) |
| `data.entityType` / `entityId` | string | Required | Polymorphic reference to the audited entity (`DATABASE_DESIGN.md` §10) |
| `data.changeSummary.before` / `.after` | object | Optional | Field-level diff, present for business-data-change events; absent for pure activity events (logins, reads) |
| `data.correlationId` | string | Optional | Ties this audit record back to the originating request chain (`API_SPECIFICATION.md` §1.14) |

**Validation**: `changeSummary` never includes a raw citizen PII value — masked or omitted per `ARCHITECTURE.md` §8.2, consistent with every audit endpoint's Security Considerations in `10-Audit-APIs.md`.

**Error Codes**: `AUDIT_LOG_NOT_FOUND` (`404`), `FORBIDDEN` (scope).

**Best Practices**: Treat every field on this response as immutable evidence — a client should never cache-and-mutate an audit record locally; always re-fetch for the current state.

**Security Considerations**: This is the platform's compliance evidence format — integrity matters more than convenience; no field is ever silently dropped or reordered across a version bump without a documented deprecation (`API_SPECIFICATION.md` §15.4).

---

### 12.11 AI Response

**JSON Structure**

```json
{
  "success": true,
  "data": {
    "detectedCategoryId": "cat_04",
    "detectedSeverity": "high",
    "detectedLanguage": "ta",
    "confidenceScore": 0.87
  },
  "meta": { "requestId": "req_9f2c4a1b", "aiProviderDegraded": false }
}
```

**Field Definitions**

| Field | Type | Required | Description |
|---|---|---|---|
| `data.confidenceScore` | number (0.0–1.0) | Required for any classification/prediction endpoint | Model confidence in the returned result |
| `meta.aiProviderDegraded` | boolean | Optional | `true` when the response was produced by the deterministic fallback path rather than the live Claude call (`ARCHITECTURE.md` §8.3) — present only on AI endpoints, so a client can visually flag lower-confidence, degraded-mode results |

**Validation**: `confidenceScore` is always present when a result is genuinely AI-derived; it is omitted (not zero) when `meta.aiProviderDegraded = true` and the fallback path has no meaningful confidence figure to report.

**Error Codes**: `AI_PROVIDER_UNAVAILABLE` (`503`, only when no deterministic fallback exists for that specific endpoint).

**Best Practices**: A client should surface `meta.aiProviderDegraded = true` distinctly in the UI (e.g. "auto-suggested, please verify") rather than presenting a degraded-mode result with the same confidence as a live model result.

**Security Considerations**: No AI response ever includes the raw prompt sent to the provider, unmasked PII, or the provider's raw completion text beyond the structured fields documented per Section 5 endpoint — consistent with the mandatory PII-masking-before-egress principle (`ARCHITECTURE.md` §8.2).

---
### 12.12 Rate Limit Response

**JSON Structure**

```json
{
  "success": false,
  "error": {
    "category": "business",
    "code": "RATE_LIMITED",
    "message": "Too many OTP requests. Please try again later.",
    "details": [ { "field": "mobileNumber", "issue": "RATE_LIMIT_EXCEEDED" } ]
  },
  "meta": { "requestId": "req_9f2c4a1b" }
}
```

**HTTP Headers**

| Header | Type | Required | Description |
|---|---|---|---|
| `Retry-After` | integer (seconds) | Required | How long the client must wait before retrying |
| `X-RateLimit-Limit` | integer | Recommended | The ceiling for the current window |
| `X-RateLimit-Remaining` | integer | Recommended | Requests remaining in the current window |
| `X-RateLimit-Reset` | integer (Unix epoch seconds) | Recommended | When the current window resets |

**Field Definitions**: Uses the standard error envelope (Section 12.2) with `error.code = RATE_LIMITED` and HTTP status `429`, plus the rate-limit-specific headers above.

**Validation**: `Retry-After` must always be present on a `429` — a client should never have to guess a backoff interval.

**Error Codes**: `RATE_LIMITED` is the sole `error.code` for this shape; the specific throttle that triggered it (OTP request, AI cost governance, export generation, bulk broadcast) is documented per-endpoint (Sections 2–11), not encoded in this generic response.

**Best Practices**: Clients must implement exponential backoff honoring `Retry-After`, never a fixed-interval retry loop that could re-trigger the same limit immediately.

**Security Considerations**: Rate-limit responses never reveal the exact threshold configuration beyond the `X-RateLimit-*` headers already scoped to the caller's own quota — no information about other tenants'/users' limits is ever disclosed.

---

### 12.13 Async Processing Response

Covers every long-running operation — report/audit exports (`09-Reports-APIs.md` §9.10, `10-Audit-APIs.md` §10.12), file uploads (Section 12.6), bulk notification jobs (`08-Notification-APIs.md` §8.14), broadcasts (`08-Notification-APIs.md` §8.13).

**JSON Structure — Initial Acceptance**

```json
{
  "success": true,
  "data": { "jobId": "exp_4471", "status": "queued" },
  "meta": { "requestId": "req_9f2c4a1b" }
}
```

**JSON Structure — Status Poll**

```json
{
  "success": true,
  "data": { "jobId": "exp_4471", "status": "completed", "resultRef": "fa_9021" },
  "meta": { "requestId": "req_9f2c4a1b" }
}
```

**Field Definitions**

| Field | Type | Required | Description |
|---|---|---|---|
| `data.jobId` | string | Required | Opaque job identifier (named `exportJobId`/`bulkJobId`/`broadcastId`/`multipartUploadId` per the specific endpoint family) |
| `data.status` | string enum | Required | `queued` \| `processing` \| `completed` \| `failed` \| `cancelled` |
| `data.resultRef` | string | Optional | Present only when `status = completed` — a `fileAssetId` for exports, or endpoint-specific result reference |
| `data.failureReason` | string | Optional | Present only when `status = failed` |

**Validation**: HTTP status for the initial acceptance response is always `202 Accepted`, never `200`/`201` — the operation is explicitly not yet complete.

**Error Codes**: `JOB_NOT_FOUND` (`404`) on the status-poll endpoint if `jobId` is invalid/expired; the job's own `status = failed` carries its `failureReason`, which is not itself an HTTP-level error.

**Best Practices**: Clients should poll the corresponding status endpoint with backoff (e.g. 2s, 4s, 8s, capped) rather than tight-polling; where the platform supports it, prefer a notification (`08-Notification-APIs.md` §8.6 In-App) over polling for long-running jobs (report exports, broadcasts).

**Security Considerations**: `resultRef` always resolves through the same signed-URL access-control path as any other file/resource reference (Section 11.2) — never a direct, unauthenticated path.

---

### 12.14 Webhook/Event Response

Reserved for **future external system integration** (SRS §3.9 — "no integration... in scope for Phase-1... the API layer shall be designed as versioned, documented REST APIs from the outset, so that future integration can be added without breaking existing consumers"). No outbound webhook is dispatched by the platform in Phase-1; this format is documented now so a future integration does not require a breaking contract change.

**JSON Structure — Outbound Event Payload (future)**

```json
{
  "eventId": "evt_7a21",
  "eventType": "complaint.status_changed",
  "occurredAt": "2026-07-20T09:00:00.000Z",
  "tenantId": "tmbm",
  "data": { "complaintId": "cmp_001", "toStatusLabel": "Resolved" },
  "correlationId": "corr_1a4b7e20"
}
```

**Field Definitions**

| Field | Type | Required | Description |
|---|---|---|---|
| `eventId` | string | Required | Unique identifier for this event delivery, for the receiver's own idempotent processing |
| `eventType` | string | Required | Dot-notation domain event key, mirroring the internal `notification_event.event_type` vocabulary already fixed in `DATABASE_DESIGN.md` §11 |
| `occurredAt` | string (ISO-8601) | Required | When the underlying domain event occurred (not delivery time) |
| `tenantId` | string | Required | Always present — a future external integrator must be able to disambiguate multi-tenant event streams |
| `data` | object | Required | Event-specific payload, deliberately minimal (identifiers and changed fields only, never a full entity dump) |
| `correlationId` | string | Optional | Ties the outbound event back to the originating internal request chain |

**Validation**: An outbound webhook receiver is expected to verify a signature header (e.g. `X-Webhook-Signature`, HMAC over the raw body) — the exact signing scheme is a later implementation decision, not fixed by this design document, consistent with the stated Phase-1 scope boundary.

**Error Codes**: Not applicable to the outbound payload itself; delivery retry/failure handling would follow the same retry/backoff/dead-letter pattern already fixed for Notifications (`08-Notification-APIs.md` §8.1.5, §8.9) if/when this capability is built.

**Best Practices**: A future receiver should treat `eventId` as the deduplication key and `data` as intentionally minimal — expected to call back into the versioned REST APIs (Sections 2–11) for any additional detail, rather than relying on an ever-growing webhook payload.

**Security Considerations**: `data` never includes unmasked citizen PII (the same masking-before-egress principle, `ARCHITECTURE.md` §8.2, applies to any future external event emission); outbound delivery would be restricted to allow-listed, Admin-configured destination URLs only (consistent with the SSRF mitigation already fixed in `API_SPECIFICATION.md` §14.6 A10).

---

### 12.15 API Versioning Response

**HTTP Headers — Deprecation Signaling**

| Header | Type | Required | Description |
|---|---|---|---|
| `Deprecation` | boolean (`true`) | Required on a deprecated operation | Signals the operation is deprecated per `API_SPECIFICATION.md` §15.4 |
| `Sunset` | string (HTTP-date) | Required on a deprecated operation | The date after which the operation is no longer available — always at least 6 months out from when `Deprecation` first appears |
| `Link` | string | Recommended | RFC 8288 link to the replacement operation's documentation, `rel="successor-version"` |

**JSON Structure — Version Info Endpoint** (illustrative; not a specific endpoint enumerated in Sections 2–11, but the shape any `/api/v1/version` or `OPTIONS` introspection would use)

```json
{
  "success": true,
  "data": {
    "currentVersion": "v1",
    "supportedVersions": ["v1"],
    "deprecatedOperations": [
      { "method": "GET", "path": "/complaints/{complaintId}/legacy-timeline", "sunset": "2027-01-20" }
    ]
  },
  "meta": { "requestId": "req_9f2c4a1b" }
}
```

**Field Definitions**

| Field | Type | Required | Description |
|---|---|---|---|
| `data.currentVersion` | string | Required | The latest, actively-developed major version |
| `data.supportedVersions` | array of string | Required | Every major version still live (`v1` today; `v1`+`v2` once a v2 exists, per `API_SPECIFICATION.md` §15.2) |
| `data.deprecatedOperations` | array | Optional | Enumerates any operation currently in its deprecation window |

**Validation**: `Sunset` is never less than 6 months from the date `Deprecation` first appears on a given operation (`API_SPECIFICATION.md` §15.4) — enforced as a documentation/process rule, not a runtime check.

**Error Codes**: Not applicable — these are informational headers/response, not an error condition. A client calling a truly *removed* (past-sunset) operation instead receives `404 Not Found` with `error.code = OPERATION_REMOVED`.

**Best Practices**: Clients/integrators should treat the presence of a `Deprecation` header as an actionable signal to migrate before `Sunset`, and should periodically check `data.deprecatedOperations` (or their own changelog subscription) rather than discovering removal only when a call starts failing.

**Security Considerations**: Version-introspection responses never reveal internal build numbers, server software versions, or infrastructure detail beyond the documented API-contract version — avoiding a version-fingerprinting reconnaissance vector (OWASP A05 adjacent).

---

*(End of Section 12. No other sections were generated in this file, per instruction.)*


