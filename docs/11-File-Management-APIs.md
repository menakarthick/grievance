# API Specification Document — Section 11

## AI Powered Enterprise Citizen Service & Grievance Management Platform

> **Continuation note**: This file continues the API Specification from the end of the approved Section 10 (Audit APIs, `docs/10-Audit-APIs.md`). Sections 1–10 are not reproduced, summarized, or modified here. This file contains **only** Section 11 (File Management APIs) and is otherwise governed by the same design principles, error envelope, HTTP status code table, and security model already defined in `docs/API_SPECIFICATION.md` Sections 1, 12, 13, 14. No SQL, no Express routes, no controllers, no services, no database queries, no implementation code.

---

## 11. File Management APIs

Backed by the **Media / File Service** (`ARCHITECTURE.md` §3.1 #6), enforcing the upload validation pipeline mandated by SRS §8.2 (extension allow-list → MIME/magic-byte check → re-encode/EXIF-strip → antivirus scan → randomized storage path → signed short-lived URL access) on every endpoint that touches file content. This section extends, and is fully consistent with, `file_asset` and `file_asset_metadata` (`DATABASE_DESIGN.md` §12, §30) — no existing column or table is redefined.

### 11.0 Design Note — What Already Exists vs. What Is Proposed

- **Already covers most of this section, unchanged**: `file_asset` (upload, download, delete, lifecycle state including `archived`, checksum, virus scan status) and `file_asset_metadata` (tags, EXIF/GPS, device info, AI-generated metadata, OCR status, thumbnail/preview self-references, retention category — `DATABASE_DESIGN.md` §30). Sections 11.1–11.4, 11.8–11.10, 11.12–11.14 need **no new table** — every field they reference is already conceptual-key-attribute-listed in the frozen v1.1 doc.
- **File Versioning (11.5)**: modeled as a conceptual `previousVersionFileAssetId` self-referential attribute on `file_asset_metadata`, following the exact same self-referential pattern that table already uses for `thumbnail_asset_id`/`preview_asset_id` (`DATABASE_DESIGN.md` §30) — not a new pattern, a new instance of one.
- **File Sharing (11.6) and File Access (11.7)**: both reuse the **proposed** `resource_share` table already introduced in `09-Reports-APIs.md` §9.1.1/§9.13 (polymorphic `sharedEntityType`/`sharedEntityId`, reusing the polymorphic-reference pattern from `file_asset`/`audit_log`/`embedding_vector`) — the same table, not a second sharing mechanism. `resource_share.shareToken` (nullable) distinguishes a link-based share (11.6) from a `resource_share.grantedToUserId` (nullable) named-user grant (11.7); exactly one of the two is populated per row. **Proposed, pending Database Architecture v1.2**, per the same transparency standard set in `09-Reports-APIs.md` §9.1.1.

---

### 11.1 File Upload APIs

#### 11.1.1 Upload File

| | |
|---|---|
| **Endpoint Name** | Upload File |
| **Purpose** | Generic file-upload entry point for any feature area (complaint image, voice recording, officer evidence document, AI-generated report) |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/files` |
| **Authentication** | Yes |
| **Authorization** | Any authenticated role permitted to attach files to the target entity |
| **Request Headers** | `Authorization: Bearer <jwt>`; `Content-Type: multipart/form-data`; `Idempotency-Key` (recommended); `X-Correlation-Id` |
| **Request Parameters** | None |
| **Request Body** | `multipart/form-data`: `file` (image/PDF/office document/audio/video), `assetCategory`, `linkedEntityType`, `linkedEntityId` |
| **Response Body** | `202 Accepted`: `{ "fileAssetId", "assetCategory", "mimeType", "sizeBytes", "virusScanStatus": "pending", "lifecycleState": "quarantine", "createdAt" }` |
| **Validation Rules** | Extension allow-list + magic-byte MIME verification against the declared `assetCategory`'s allowed formats (SRS §8.2); per-category size/count ceilings enforced; `linkedEntityType`/`linkedEntityId` must resolve to an entity the caller is authorized to attach files to |
| **Business Rules** | File is not query/downloadable (Section 11.2) until `virusScanStatus` becomes `clean`; supported content types: images, PDFs, Office documents, audio, video, voice recordings, complaint attachments, officer documents, and AI-generated uploads (each mapped to a `FILE_ASSET_CATEGORY` reference value, `DATABASE_DESIGN.md` §30) |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `413 FILE_TOO_LARGE`, `415 UNSUPPORTED_MEDIA_TYPE`, `422 MAX_FILES_EXCEEDED` |
| **HTTP Status Codes** | `202`, `400`, `401`, `403`, `413`, `415`, `422`, `429`, `500` |
| **Rate Limiting** | Per-tenant/per-user upload throttle |
| **Idempotency** | `Idempotency-Key` honored (24-hour TTL) |
| **Related Database Entities** | `file_asset`, `file_asset_metadata` |
| **Related Functional Module** | SRS §8.2 File Upload Security Policy |
| **Related AI Agent** | None |
| **Audit Requirements** | `audit_log` entry recording the upload, uploader, and target entity |
| **Security Considerations** | Storage outside the web-served root, randomized non-guessable filenames, antivirus scan mandatory pre-persistence (SRS §8.2) |

#### 11.1.2 Initiate Chunked/Multipart Upload

| | |
|---|---|
| **Endpoint Name** | Initiate Chunked/Multipart Upload |
| **Purpose** | Begin a chunked upload session for large files (video, long voice recordings) that exceed a single-request size ceiling |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/files/multipart` |
| **Authentication** | Yes |
| **Authorization** | Same as Section 11.1.1 |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | None |
| **Request Body** | `{ "fileName": "string", "mimeType": "string", "totalSizeBytes": "integer", "assetCategory": "string", "linkedEntityType": "string", "linkedEntityId": "id" }` |
| **Response Body** | `{ "multipartUploadId", "chunkSizeBytes", "expiresAt" }` |
| **Validation Rules** | `totalSizeBytes`: required, must not exceed the system-wide hard ceiling for the declared `assetCategory` (SRS §8.2); `mimeType`: must be allow-listed for video/audio categories |
| **Business Rules** | The session is abandoned (and any received chunks discarded) if not completed (Section 11.1.3) within `expiresAt` |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `413 FILE_TOO_LARGE`, `415 UNSUPPORTED_MEDIA_TYPE` |
| **HTTP Status Codes** | `201`, `400`, `401`, `403`, `413`, `415` |
| **Rate Limiting** | Per-tenant/per-user upload throttle |
| **Idempotency** | `Idempotency-Key` accepted (optional) |
| **Related Database Entities** | `file_asset` (created in `quarantine` state upon completion, Section 11.1.3) |
| **Related Functional Module** | SRS §8.2 File Upload Security Policy |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited until completion (Section 11.1.3) |
| **Security Considerations** | `multipartUploadId` is a non-guessable token; chunk upload endpoints (implementation detail, not enumerated here) require the same bearer token throughout the session |

#### 11.1.3 Complete Chunked/Multipart Upload

| | |
|---|---|
| **Endpoint Name** | Complete Chunked/Multipart Upload |
| **Purpose** | Finalize a chunked upload session, triggering the standard validation pipeline on the fully reassembled file |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/files/multipart/{multipartUploadId}/complete` |
| **Authentication** | Yes |
| **Authorization** | The session's initiator |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `multipartUploadId` |
| **Request Body** | `{ "chunkChecksums": ["string"] }` (ordered list, for reassembly integrity verification) |
| **Response Body** | `202 Accepted`: `{ "fileAssetId", "virusScanStatus": "pending", "lifecycleState": "quarantine" }` |
| **Validation Rules** | All declared chunks must have been received; reassembled file's checksum must match the sum of `chunkChecksums` |
| **Business Rules** | Once reassembled, the file enters the identical extension/MIME/antivirus pipeline as Section 11.1.1 — chunking is a transport-layer optimization only, never a validation bypass |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 UPLOAD_SESSION_NOT_FOUND`, `409 UPLOAD_SESSION_EXPIRED`, `422 CHUNK_INTEGRITY_MISMATCH` |
| **HTTP Status Codes** | `202`, `400`, `401`, `403`, `404`, `409`, `422` |
| **Rate Limiting** | Standard per-user write-endpoint throttle |
| **Idempotency** | Naturally idempotent — completing an already-completed session returns the existing `fileAssetId` |
| **Related Database Entities** | `file_asset`, `file_asset_metadata` |
| **Related Functional Module** | SRS §8.2 File Upload Security Policy |
| **Related AI Agent** | None |
| **Audit Requirements** | `audit_log` entry recording the completed upload |
| **Security Considerations** | Same antivirus/quarantine posture as Section 11.1.1 |

---

### 11.2 File Download APIs

#### 11.2.1 Download File

| | |
|---|---|
| **Endpoint Name** | Download File |
| **Purpose** | Retrieve the original file content via a short-lived, signed, authenticated URL — never a direct, guessable static path |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/files/{fileId}/download` |
| **Authentication** | Yes |
| **Authorization** | Owner, an entity permitted by scope, or a user holding an active `resource_share` grant (Sections 11.6–11.7) |
| **Request Headers** | `Authorization: Bearer <jwt>`; `Accept` (`application/json` for a JSON `downloadUrl` response instead of a redirect) |
| **Request Parameters** | Path: `fileId` |
| **Request Body** | None |
| **Response Body** | `302 Found` redirect to a time-boxed signed URL, or `{ "downloadUrl", "expiresAt" }` |
| **Validation Rules** | `virusScanStatus` must be `clean`; `lifecycleState` must not be `quarantine` |
| **Business Rules** | None beyond the validation above |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 FILE_NOT_FOUND`, `409 FILE_NOT_YET_SCANNED`, `410 FILE_QUARANTINED` |
| **HTTP Status Codes** | `302`, `200`, `401`, `403`, `404`, `409`, `410` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `file_asset` |
| **Related Functional Module** | `ARCHITECTURE.md` §19 File Storage Architecture |
| **Related AI Agent** | None |
| **Audit Requirements** | `audit_log` entry recording the download (actor, `fileId`, `ipAddress`) — feeds `10-Audit-APIs.md` §10.9 |
| **Security Considerations** | Signed URL, short expiry, no directory listing possible; encryption at rest and in transit (`ARCHITECTURE.md` §11.4) |

---

### 11.3 File Preview APIs

#### 11.3.1 Preview File

| | |
|---|---|
| **Endpoint Name** | Preview File |
| **Purpose** | Retrieve a lightweight preview/thumbnail rendering of a file without pulling the full original |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/files/{fileId}/preview` |
| **Authentication** | Yes |
| **Authorization** | Same as Section 11.2.1 |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `fileId`; `?size=small\|medium\|large` |
| **Request Body** | None |
| **Response Body** | `302 Found` redirect to a signed preview-asset URL, or `{ "previewUrl", "expiresAt" }` |
| **Validation Rules** | Falls back to `404 PREVIEW_NOT_AVAILABLE` if no thumbnail/preview has been generated yet for this file type |
| **Business Rules** | None |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 FILE_NOT_FOUND`, `404 PREVIEW_NOT_AVAILABLE` |
| **HTTP Status Codes** | `302`, `200`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `file_asset`, `file_asset_metadata` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §30 Enterprise File Metadata Architecture |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited (lower sensitivity than full download) |
| **Security Considerations** | Same signed-URL posture as download |

---

### 11.4 File Metadata APIs

#### 11.4.1 Get File Metadata

| | |
|---|---|
| **Endpoint Name** | Get File Metadata |
| **Purpose** | Retrieve rich metadata for a file — tags, EXIF/GPS, OCR status, AI-generated metadata, retention category |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/files/{fileId}/metadata` |
| **Authentication** | Yes |
| **Authorization** | Same as Section 11.2.1 |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `fileId` |
| **Request Body** | None |
| **Response Body** | `{ "fileAssetId", "assetCategory", "tags": ["string"], "gpsLatitude"?, "gpsLongitude"?, "ocrStatus", "isAiGenerated", "retentionCategory", "checksum", "virusScanStatus" }` |
| **Validation Rules** | None (read-only) |
| **Business Rules** | None |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 FILE_NOT_FOUND` |
| **HTTP Status Codes** | `200`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `file_asset`, `file_asset_metadata` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §30 Enterprise File Metadata Architecture |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | None beyond standard RBAC |

#### 11.4.2 Update File Metadata

| | |
|---|---|
| **Endpoint Name** | Update File Metadata |
| **Purpose** | Update the mutable metadata fields of a file — tags, and (where applicable) `assetCategory` correction |
| **HTTP Method** | `PATCH` |
| **URL** | `/api/v1/files/{fileId}/metadata` |
| **Authentication** | Yes |
| **Authorization** | Owner, or Officer/Admin within scope |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `fileId` |
| **Request Body** | `{ "tags"?: ["string"], "assetCategory"?: "string" }` |
| **Response Body** | Updated metadata object (Section 11.4.1 shape) |
| **Validation Rules** | `assetCategory`, if present: must be a valid `FILE_ASSET_CATEGORY` reference value; immutable fields (checksum, EXIF/GPS, OCR result) are never accepted by this endpoint |
| **Business Rules** | Tags/category are the only editable fields — everything else on `file_asset_metadata` is derived by the ingest pipeline and never client-writable |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 FILE_NOT_FOUND` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user write-endpoint throttle |
| **Idempotency** | `PATCH` idempotent by HTTP semantics |
| **Related Database Entities** | `file_asset_metadata` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §30 Enterprise File Metadata Architecture |
| **Related AI Agent** | None |
| **Audit Requirements** | `audit_log` entry recording the metadata change |
| **Security Considerations** | Rejects any attempt to set a derived/system field, preventing tampering with scan results or checksums via this endpoint |

---
### 11.5 File Version APIs

Modeled as a conceptual `previousVersionFileAssetId` self-reference on `file_asset_metadata` (Section 11.0) — each "version" is its own `file_asset` row, chained backward, mirroring the exact self-referential pattern that table already uses for `thumbnail_asset_id`/`preview_asset_id`.

#### 11.5.1 List File Versions

| | |
|---|---|
| **Endpoint Name** | List File Versions |
| **Purpose** | Retrieve every prior version of a file (e.g. successive re-uploads of an officer's evidence document) |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/files/{fileId}/versions` |
| **Authentication** | Yes |
| **Authorization** | Same as Section 11.2.1 |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `fileId` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "fileAssetId", "versionNumber", "uploadedBy", "createdAt", "isCurrent": "boolean" } ] }` |
| **Validation Rules** | `fileId`: must exist |
| **Business Rules** | Versions are ordered by the `previousVersionFileAssetId` chain, most recent first |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 FILE_NOT_FOUND` |
| **HTTP Status Codes** | `200`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `file_asset`, `file_asset_metadata` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §30 Enterprise File Metadata Architecture |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | None beyond standard RBAC |

#### 11.5.2 Get File Version

| | |
|---|---|
| **Endpoint Name** | Get File Version |
| **Purpose** | Retrieve a specific prior version's detail |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/files/{fileId}/versions/{versionFileAssetId}` |
| **Authentication** | Yes |
| **Authorization** | Same as Section 11.2.1 |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `fileId`, `versionFileAssetId` |
| **Request Body** | None |
| **Response Body** | `{ "fileAssetId", "versionNumber", "mimeType", "sizeBytes", "checksum", "uploadedBy", "createdAt" }` |
| **Validation Rules** | `versionFileAssetId`: must be part of this file's version chain |
| **Business Rules** | None |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 FILE_VERSION_NOT_FOUND` |
| **HTTP Status Codes** | `200`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `file_asset`, `file_asset_metadata` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §30 Enterprise File Metadata Architecture |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | None beyond standard RBAC |

#### 11.5.3 Restore File Version

| | |
|---|---|
| **Endpoint Name** | Restore File Version |
| **Purpose** | Make a prior version the current one — appends a new "current" marker rather than deleting the intervening versions, preserving full history (Principle 5, `DATABASE_DESIGN.md` §1) |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/files/{fileId}/versions/{versionFileAssetId}/restore` |
| **Authentication** | Yes |
| **Authorization** | Owner, or Officer/Admin within scope |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `fileId`, `versionFileAssetId` |
| **Request Body** | None |
| **Response Body** | `{ "fileAssetId", "newCurrentVersionFileAssetId": "versionFileAssetId", "restoredAt" }` |
| **Validation Rules** | `versionFileAssetId`: must be part of this file's version chain and not already current |
| **Business Rules** | Restoring does not delete the version that was current before the restore — it becomes just another entry in the chain, so restoring is itself always reversible |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 FILE_VERSION_NOT_FOUND`, `409 VERSION_ALREADY_CURRENT` |
| **HTTP Status Codes** | `200`, `401`, `403`, `404`, `409` |
| **Rate Limiting** | Standard per-user write-endpoint throttle |
| **Idempotency** | Naturally idempotent for an already-current version (returns `409`, a stable outcome on retry) |
| **Related Database Entities** | `file_asset`, `file_asset_metadata`, `audit_log` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §30 Enterprise File Metadata Architecture |
| **Related AI Agent** | None |
| **Audit Requirements** | `audit_log` entry recording the restore action and acting user |
| **Security Considerations** | None beyond standard RBAC |

---

### 11.6 File Sharing APIs

Link-based sharing — a `resource_share` row (Section 11.0) with `shareToken` populated, `grantedToUserId` null. Distinct from File Access (11.7), which grants a specific named user direct access without a link/token.

#### 11.6.1 Create Shareable Link

| | |
|---|---|
| **Endpoint Name** | Create Shareable Link |
| **Purpose** | Generate a time-boxed, signed shareable link for a file, usable by anyone holding the link within its expiry |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/files/{fileId}/share-links` |
| **Authentication** | Yes |
| **Authorization** | Owner, or Officer/Admin within scope |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `fileId` |
| **Request Body** | `{ "expiresAt": "ISO-8601", "requiresAuthentication"?: "boolean (default true)" }` |
| **Response Body** | `{ "shareLinkId", "shareUrl", "expiresAt", "requiresAuthentication" }` |
| **Validation Rules** | `expiresAt`: required, must be in the future, max 30 days out (bounds the exposure window) |
| **Business Rules** | `requiresAuthentication = false` is permitted only for `assetCategory` values the tenant has explicitly allow-listed for anonymous sharing (e.g. a public notice PDF) — never for complaint attachments or any citizen-PII-bearing file |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 FILE_NOT_FOUND`, `422 ANONYMOUS_SHARING_NOT_ALLOWED_FOR_CATEGORY` |
| **HTTP Status Codes** | `201`, `400`, `401`, `403`, `404`, `422` |
| **Rate Limiting** | Standard per-user write-endpoint throttle |
| **Idempotency** | `Idempotency-Key` accepted (optional) |
| **Related Database Entities** | `resource_share` (proposed), `file_asset` |
| **Related Functional Module** | `ARCHITECTURE.md` §19 File Storage Architecture |
| **Related AI Agent** | None |
| **Audit Requirements** | Mandatory `audit_log` entry recording the share creation, expiry, and anonymous-access flag |
| **Security Considerations** | Anonymous (`requiresAuthentication = false`) links are a deliberate, category-gated exception to the platform's default authenticated-access posture — restricted and logged accordingly |

#### 11.6.2 List Shareable Links

| | |
|---|---|
| **Endpoint Name** | List Shareable Links |
| **Purpose** | Retrieve every active/expired shareable link for a file |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/files/{fileId}/share-links` |
| **Authentication** | Yes |
| **Authorization** | Owner, or Officer/Admin within scope |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `fileId` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "shareLinkId", "expiresAt", "requiresAuthentication", "accessCount", "createdAt" } ] }` |
| **Validation Rules** | None (read-only) |
| **Business Rules** | None |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 FILE_NOT_FOUND` |
| **HTTP Status Codes** | `200`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `resource_share` (proposed) |
| **Related Functional Module** | `ARCHITECTURE.md` §19 File Storage Architecture |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited (read-only) |
| **Security Considerations** | `shareUrl`/token itself never re-returned in this listing, only metadata — preventing a list call from becoming a token-harvesting vector |

#### 11.6.3 Revoke Shareable Link

| | |
|---|---|
| **Endpoint Name** | Revoke Shareable Link |
| **Purpose** | Immediately invalidate a shareable link before its natural expiry |
| **HTTP Method** | `DELETE` |
| **URL** | `/api/v1/files/{fileId}/share-links/{shareLinkId}` |
| **Authentication** | Yes |
| **Authorization** | Owner, or Officer/Admin within scope |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `fileId`, `shareLinkId` |
| **Request Body** | None |
| **Response Body** | `204 No Content` |
| **Validation Rules** | None beyond existence check |
| **Business Rules** | Revocation is immediate — any in-flight request using the revoked token fails from that point forward |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 SHARE_LINK_NOT_FOUND` |
| **HTTP Status Codes** | `204`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user write-endpoint throttle |
| **Idempotency** | Naturally idempotent |
| **Related Database Entities** | `resource_share` (proposed), `audit_log` |
| **Related Functional Module** | `ARCHITECTURE.md` §19 File Storage Architecture |
| **Related AI Agent** | None |
| **Audit Requirements** | `audit_log` entry recording the revocation |
| **Security Considerations** | None beyond standard RBAC |

---

### 11.7 File Access APIs

Named-user direct grants — a `resource_share` row with `grantedToUserId` populated, `shareToken` null. Complements the RBAC/ownership rules that already govern default access (Section 11.2.1).

#### 11.7.1 Get File Access List

| | |
|---|---|
| **Endpoint Name** | Get File Access List |
| **Purpose** | Retrieve the resolved set of users who currently can access a file — owner, scope-based role access, and explicit named grants, in one view |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/files/{fileId}/access` |
| **Authentication** | Yes |
| **Authorization** | Owner, or Officer/Admin within scope |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `fileId` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "userId", "userName", "accessBasis": "owner" \| "scope" \| "explicit_grant", "grantedAt"? } ] }` |
| **Validation Rules** | None (read-only) |
| **Business Rules** | `accessBasis = "scope"` entries are computed, not stored — they reflect the caller's live RBAC scope at query time, not a persisted grant |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 FILE_NOT_FOUND` |
| **HTTP Status Codes** | `200`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `resource_share` (proposed), `file_asset`, `role_permission` |
| **Related Functional Module** | `ARCHITECTURE.md` §11.2 RBAC Model |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited (read-only) |
| **Security Considerations** | None beyond standard RBAC |

#### 11.7.2 Grant File Access

| | |
|---|---|
| **Endpoint Name** | Grant File Access |
| **Purpose** | Grant a specific named user direct access to a file, without a shareable link |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/files/{fileId}/access` |
| **Authentication** | Yes |
| **Authorization** | Owner, or Officer/Admin within scope |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `fileId` |
| **Request Body** | `{ "grantedToUserId": "id", "expiresAt"?: "ISO-8601" }` |
| **Response Body** | `{ "accessGrantId", "grantedToUserId", "expiresAt"?, "createdAt" }` |
| **Validation Rules** | `grantedToUserId`: required, must be within the granting user's own tenant |
| **Business Rules** | Never grants cross-tenant access, even for Super Admin — a grant always stays within the file's originating tenant |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 FILE_NOT_FOUND`, `404 USER_NOT_FOUND` |
| **HTTP Status Codes** | `201`, `400`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user write-endpoint throttle |
| **Idempotency** | `Idempotency-Key` accepted (optional) |
| **Related Database Entities** | `resource_share` (proposed) |
| **Related Functional Module** | `ARCHITECTURE.md` §11.2 RBAC Model |
| **Related AI Agent** | None |
| **Audit Requirements** | `audit_log` entry recording the grant |
| **Security Considerations** | Tenant-boundary enforcement, no exceptions |

#### 11.7.3 Revoke File Access

| | |
|---|---|
| **Endpoint Name** | Revoke File Access |
| **Purpose** | Remove a previously granted named-user access grant |
| **HTTP Method** | `DELETE` |
| **URL** | `/api/v1/files/{fileId}/access/{accessGrantId}` |
| **Authentication** | Yes |
| **Authorization** | Owner, or Officer/Admin within scope |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `fileId`, `accessGrantId` |
| **Request Body** | None |
| **Response Body** | `204 No Content` |
| **Validation Rules** | None beyond existence check |
| **Business Rules** | Revocation is immediate |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 ACCESS_GRANT_NOT_FOUND` |
| **HTTP Status Codes** | `204`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user write-endpoint throttle |
| **Idempotency** | Naturally idempotent |
| **Related Database Entities** | `resource_share` (proposed), `audit_log` |
| **Related Functional Module** | `ARCHITECTURE.md` §11.2 RBAC Model |
| **Related AI Agent** | None |
| **Audit Requirements** | `audit_log` entry recording the revocation |
| **Security Considerations** | None beyond standard RBAC |

---

### 11.8 Virus Scan APIs

#### 11.8.1 Get Virus Scan Status

| | |
|---|---|
| **Endpoint Name** | Get Virus Scan Status |
| **Purpose** | Poll the antivirus scan outcome for a recently uploaded file |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/files/{fileId}/virus-scan` |
| **Authentication** | Yes |
| **Authorization** | Owner, or Officer/Admin within scope |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `fileId` |
| **Request Body** | None |
| **Response Body** | `{ "fileAssetId", "virusScanStatus": "pending" \| "clean" \| "infected" \| "scan_failed", "scannedAt"? }` |
| **Validation Rules** | None (read-only) |
| **Business Rules** | An `infected` result moves `lifecycleState` to a permanently quarantined state — the file is never made downloadable or previewable regardless of any later rescan |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 FILE_NOT_FOUND` |
| **HTTP Status Codes** | `200`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `file_asset` |
| **Related Functional Module** | SRS §8.2 File Upload Security Policy |
| **Related AI Agent** | None |
| **Audit Requirements** | An `infected` result is always logged to `audit_log` regardless of caller (security-relevant event) |
| **Security Considerations** | None beyond standard RBAC |

#### 11.8.2 Trigger Rescan

| | |
|---|---|
| **Endpoint Name** | Trigger Rescan |
| **Purpose** | Re-run the antivirus scan against a file — e.g. after a signature-database update, for defense-in-depth on older files |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/files/{fileId}/virus-scan/rescan` |
| **Authentication** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `fileId` |
| **Request Body** | None |
| **Response Body** | `202 Accepted`: `{ "fileAssetId", "virusScanStatus": "pending" }` |
| **Validation Rules** | `fileId`: must exist and not already be permanently quarantined (an `infected` result is terminal, never rescanned back to clean) |
| **Business Rules** | A rescan never changes a file from `infected` back to `clean` — that would defeat the terminal-quarantine guarantee; rescan only applies to `clean`/`scan_failed` files |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 FILE_NOT_FOUND`, `409 FILE_PERMANENTLY_QUARANTINED` |
| **HTTP Status Codes** | `202`, `401`, `403`, `404`, `409` |
| **Rate Limiting** | Throttled (e.g. 20/hour per Admin) |
| **Idempotency** | Naturally idempotent — a repeated rescan request while one is already pending is a no-op |
| **Related Database Entities** | `file_asset` |
| **Related Functional Module** | SRS §8.2 File Upload Security Policy |
| **Related AI Agent** | None |
| **Audit Requirements** | `audit_log` entry recording the rescan trigger and acting Admin |
| **Security Considerations** | Terminal-quarantine guarantee enforced server-side, cannot be bypassed by this endpoint |

---
### 11.9 Image Processing APIs

#### 11.9.1 Get Thumbnail

| | |
|---|---|
| **Endpoint Name** | Get Thumbnail |
| **Purpose** | Retrieve the generated thumbnail asset for an image file, using the self-referential `thumbnail_asset_id` already defined on `file_asset_metadata` (`DATABASE_DESIGN.md` §30) |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/files/{fileId}/thumbnail` |
| **Authentication** | Yes |
| **Authorization** | Same as Section 11.2.1 |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `fileId` |
| **Request Body** | None |
| **Response Body** | `302 Found` redirect to the thumbnail's signed URL, or `404` if none exists |
| **Validation Rules** | `fileId`: must be an image-category asset with a generated thumbnail |
| **Business Rules** | This is a thin, semantically named alias over Section 11.3.1 (`?size=small`), kept as its own endpoint for client discoverability |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 FILE_NOT_FOUND`, `404 THUMBNAIL_NOT_AVAILABLE` |
| **HTTP Status Codes** | `302`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `file_asset_metadata` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §30 Enterprise File Metadata Architecture |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | Same signed-URL posture as Section 11.3.1 |

#### 11.9.2 Request Image Re-Processing

| | |
|---|---|
| **Endpoint Name** | Request Image Re-Processing |
| **Purpose** | Request regeneration of an image's thumbnail/preview (e.g. after a rotate/compress correction) |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/files/{fileId}/reprocess` |
| **Authentication** | Yes |
| **Authorization** | Owner, or Officer/Admin within scope |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `fileId` |
| **Request Body** | `{ "operation": "rotate" \| "compress" \| "regenerate_thumbnail", "rotationDegrees"?: 90 \| 180 \| 270 }` |
| **Response Body** | `202 Accepted`: `{ "fileAssetId", "reprocessingStatus": "queued" }` |
| **Validation Rules** | `operation`: required, one of the three values; `rotationDegrees`: required only for `operation = rotate` |
| **Business Rules** | Re-processing generates a **new version** (Section 11.5), it never mutates the original uploaded bytes in place — preserving the original as evidence |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 FILE_NOT_FOUND`, `415 UNSUPPORTED_FOR_FILE_TYPE` |
| **HTTP Status Codes** | `202`, `400`, `401`, `403`, `404`, `415` |
| **Rate Limiting** | Standard per-user write-endpoint throttle |
| **Idempotency** | `Idempotency-Key` accepted (optional) |
| **Related Database Entities** | `file_asset`, `file_asset_metadata` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §30 Enterprise File Metadata Architecture |
| **Related AI Agent** | None |
| **Audit Requirements** | `audit_log` entry recording the reprocessing request |
| **Security Considerations** | Original file is never overwritten — evidentiary integrity preserved for complaint-attachment use cases |

---

### 11.10 OCR APIs

#### 11.10.1 Get OCR Result

| | |
|---|---|
| **Endpoint Name** | Get OCR Result |
| **Purpose** | Retrieve the extracted text from a scanned document/image, using the `ocr_status`/`ocr_text_ref` fields already defined on `file_asset_metadata` (`DATABASE_DESIGN.md` §30) |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/files/{fileId}/ocr` |
| **Authentication** | Yes |
| **Authorization** | Same as Section 11.2.1 |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `fileId` |
| **Request Body** | None |
| **Response Body** | `{ "fileAssetId", "ocrStatus": "pending" \| "completed" \| "failed" \| "not_applicable", "extractedText"? }` |
| **Validation Rules** | None (read-only) |
| **Business Rules** | `extractedText` present only when `ocrStatus = completed` |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 FILE_NOT_FOUND` |
| **HTTP Status Codes** | `200`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `file_asset_metadata` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §30 Enterprise File Metadata Architecture |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | Extracted text is treated with the same masking-before-AI-egress principle (`ARCHITECTURE.md` §8.2) if subsequently passed to any AI endpoint (e.g. Section 5 Summarization/Translation) |

#### 11.10.2 Trigger OCR

| | |
|---|---|
| **Endpoint Name** | Trigger OCR |
| **Purpose** | Request text extraction for a document/image that has not yet been OCR-processed |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/files/{fileId}/ocr` |
| **Authentication** | Yes |
| **Authorization** | Owner, or Officer/Admin within scope |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `fileId` |
| **Request Body** | `{ "languageHint"?: "ta" \| "en" }` |
| **Response Body** | `202 Accepted`: `{ "fileAssetId", "ocrStatus": "pending" }` |
| **Validation Rules** | `fileId`: must be a PDF/image-category asset; must have passed virus scanning (`clean`) |
| **Business Rules** | Re-triggering OCR on an already-`completed` file overwrites the prior extraction result — the file's own version chain (Section 11.5) is unaffected, only the OCR metadata is refreshed |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 FILE_NOT_FOUND`, `415 UNSUPPORTED_FOR_FILE_TYPE`, `422 FILE_NOT_YET_SCANNED` |
| **HTTP Status Codes** | `202`, `400`, `401`, `403`, `404`, `415`, `422` |
| **Rate Limiting** | Standard per-user write-endpoint throttle |
| **Idempotency** | `Idempotency-Key` accepted (optional) |
| **Related Database Entities** | `file_asset_metadata` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §30 Enterprise File Metadata Architecture |
| **Related AI Agent** | None (OCR is a deterministic extraction pipeline component, not a Claude-invoking agent — distinct from Section 5's AI endpoints, which may subsequently consume OCR output) |
| **Audit Requirements** | `audit_log` entry recording the OCR trigger |
| **Security Considerations** | Only virus-scanned `clean` files are ever processed |

---

### 11.11 File Search APIs

#### 11.11.1 Search Files

| | |
|---|---|
| **Endpoint Name** | Search Files |
| **Purpose** | Free-text/filtered search across the caller's accessible files, by tag, filename, category, or linked entity |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/files/search` |
| **Authentication** | Yes |
| **Authorization** | Any authenticated role — results scoped to files the caller is authorized to see (owner, scope, or explicit grant) |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | `?q=` (free-text, `API_SPECIFICATION.md` §1.11), `?assetCategory=`, `?linkedEntityType=`, `?linkedEntityId=`, `?cursor=`, `?limit=` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "fileAssetId", "assetCategory", "tags", "linkedEntityType", "linkedEntityId", "createdAt" } ], "meta": { "pagination" } }` |
| **Validation Rules** | `limit`: max 100 |
| **Business Rules** | Backed by MySQL `FULLTEXT` in Phase-1, transparently upgraded to OpenSearch/Elasticsearch in later phases (`DATABASE_DESIGN.md` §31), matching the platform's other search surfaces |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED` |
| **HTTP Status Codes** | `200`, `400`, `401` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `file_asset`, `file_asset_metadata` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §31 Enterprise Search Architecture |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | Results never include files outside the caller's own access rights — search never becomes an enumeration/IDOR vector (OWASP A01) |

---

### 11.12 File Archive APIs

Uses the `lifecycleState = 'archived'` value already defined on `file_asset` (`DATABASE_DESIGN.md` §12) — no new table.

#### 11.12.1 Archive File

| | |
|---|---|
| **Endpoint Name** | Archive File |
| **Purpose** | Move a file from the hot operational tier to the archive tier ahead of its normal scheduled archival (`ARCHITECTURE.md` §19.2), e.g. for a closed complaint an Admin wants moved immediately |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/files/{fileId}/archive` |
| **Authentication** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `fileId` |
| **Request Body** | None |
| **Response Body** | `{ "fileAssetId", "lifecycleState": "archived", "archivedAt" }` |
| **Validation Rules** | `fileId`: must currently be `hot`; a file still `quarantine` cannot be archived |
| **Business Rules** | Archived files remain fully queryable/downloadable (Sections 11.2, 11.3) — archival affects storage tier and retrieval latency only, never accessibility, per `DATABASE_DESIGN.md` §20 |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 FILE_NOT_FOUND`, `409 FILE_NOT_HOT` |
| **HTTP Status Codes** | `200`, `401`, `403`, `404`, `409` |
| **Rate Limiting** | Standard per-user write-endpoint throttle |
| **Idempotency** | Naturally idempotent for an already-archived file |
| **Related Database Entities** | `file_asset` |
| **Related Functional Module** | `ARCHITECTURE.md` §19.2 File Lifecycle |
| **Related AI Agent** | None |
| **Audit Requirements** | `audit_log` entry recording the manual archival trigger |
| **Security Considerations** | None beyond standard RBAC |

#### 11.12.2 List Archived Files

| | |
|---|---|
| **Endpoint Name** | List Archived Files |
| **Purpose** | Retrieve files currently in the archive tier |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/files/archived` |
| **Authentication** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | `?assetCategory=`, `?filter[archivedAt][gte]=`, `?filter[archivedAt][lte]=`, `?cursor=`, `?limit=` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "fileAssetId", "assetCategory", "archivedAt", "retentionExpiresAt" } ], "meta": { "pagination" } }` |
| **Validation Rules** | `limit`: max 200 |
| **Business Rules** | None (read-only) |
| **Error Responses** | `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `400`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `file_asset` |
| **Related Functional Module** | `ARCHITECTURE.md` §19.2 File Lifecycle |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | None beyond standard RBAC |

#### 11.12.3 Restore Archived File

| | |
|---|---|
| **Endpoint Name** | Restore Archived File |
| **Purpose** | Move a file back from the archive tier to the hot operational tier, e.g. a citizen reopens a closed complaint (`API_SPECIFICATION.md` §4.13) and its evidence needs faster access again |
| **HTTP Method** | `POST` |
| **URL** | `/api/v1/files/{fileId}/restore` |
| **Authentication** | Yes |
| **Authorization** | Corporation Admin / Super Admin; also triggered automatically by the Reopen workflow (`API_SPECIFICATION.md` §4.13) |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `fileId` |
| **Request Body** | None |
| **Response Body** | `{ "fileAssetId", "lifecycleState": "hot", "restoredAt" }` |
| **Validation Rules** | `fileId`: must currently be `archived` |
| **Business Rules** | Restoring to `hot` never resets the `retentionExpiresAt` clock — retention is anchored to the original finalization event (`DATABASE_DESIGN.md` §23), not to storage-tier transitions |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 FILE_NOT_FOUND`, `409 FILE_NOT_ARCHIVED` |
| **HTTP Status Codes** | `200`, `401`, `403`, `404`, `409` |
| **Rate Limiting** | Standard per-user write-endpoint throttle |
| **Idempotency** | Naturally idempotent for an already-`hot` file |
| **Related Database Entities** | `file_asset` |
| **Related Functional Module** | `ARCHITECTURE.md` §19.2 File Lifecycle; `DATABASE_DESIGN.md` §23 Data Retention Strategy |
| **Related AI Agent** | None |
| **Audit Requirements** | `audit_log` entry recording the restore |
| **Security Considerations** | None beyond standard RBAC |

---

### 11.13 File Delete APIs

#### 11.13.1 Delete File

| | |
|---|---|
| **Endpoint Name** | Delete File |
| **Purpose** | Soft-delete a file — never a physical storage delete via API (`DATABASE_DESIGN.md` §21); physical removal is exclusively the retention-expiry Cleanup Job's responsibility |
| **HTTP Method** | `DELETE` |
| **URL** | `/api/v1/files/{fileId}` |
| **Authentication** | Yes |
| **Authorization** | Uploader, or an Admin within scope |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `fileId` |
| **Request Body** | None |
| **Response Body** | `{ "fileAssetId", "deletedAt" }` |
| **Validation Rules** | A file that is the sole evidence attached to an unresolved/unclosed complaint may be protected from deletion (`409`), per tenant policy |
| **Business Rules** | Soft-delete only — `deleted_at` set, row retained for its full statutory retention period (`DATABASE_DESIGN.md` §23) |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 FILE_NOT_FOUND`, `409 FILE_PROTECTED` |
| **HTTP Status Codes** | `200`, `401`, `403`, `404`, `409` |
| **Rate Limiting** | Standard per-user write-endpoint throttle |
| **Idempotency** | Naturally idempotent (`DELETE` semantics) |
| **Related Database Entities** | `file_asset` |
| **Related Functional Module** | `DATABASE_DESIGN.md` §21 Soft Delete Strategy |
| **Related AI Agent** | None |
| **Audit Requirements** | `audit_log` entry recording the deletion and acting user |
| **Security Considerations** | None beyond standard RBAC |

---

### 11.14 Storage Usage APIs

#### 11.14.1 Get Storage Usage Summary

| | |
|---|---|
| **Endpoint Name** | Get Storage Usage Summary |
| **Purpose** | Retrieve the tenant's total storage consumption against its configured quota |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/files/storage-usage` |
| **Authentication** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | None |
| **Request Body** | None |
| **Response Body** | `{ "totalBytesUsed", "quotaBytes"?, "quotaUtilizationPercent"?, "hotTierBytes", "archiveTierBytes" }` |
| **Validation Rules** | None (read-only) |
| **Business Rules** | `quotaBytes` present only if the tenant has a configured storage ceiling (SRS §8.2 "hard system-wide ceiling to prevent storage-exhaustion abuse") |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `file_asset` |
| **Related Functional Module** | SRS §8.2 File Upload Security Policy |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | Aggregate-only response |

#### 11.14.2 Get Storage Usage by Category

| | |
|---|---|
| **Endpoint Name** | Get Storage Usage by Category |
| **Purpose** | Break down storage consumption by asset category (images, voice, documents, AI-generated files) |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/files/storage-usage/by-category` |
| **Authentication** | Yes |
| **Authorization** | Corporation Admin / Super Admin |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | None |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "assetCategory", "bytesUsed", "fileCount" } ] }` |
| **Validation Rules** | None (read-only) |
| **Business Rules** | None |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN` |
| **HTTP Status Codes** | `200`, `401`, `403` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `file_asset` |
| **Related Functional Module** | SRS §8.2 File Upload Security Policy |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited |
| **Security Considerations** | Aggregate-only response |

---

### 11.15 File Audit APIs

File-scoped view; cross-referenced by the tenant-wide search surface in `10-Audit-APIs.md` §10.9.

#### 11.15.1 Get File Audit Trail

| | |
|---|---|
| **Endpoint Name** | Get File Audit Trail |
| **Purpose** | Retrieve the complete access/action history for one specific file — upload, downloads, previews, shares, metadata changes, archival, deletion |
| **HTTP Method** | `GET` |
| **URL** | `/api/v1/files/{fileId}/audit-trail` |
| **Authentication** | Yes |
| **Authorization** | Owner, or Officer/Admin within scope |
| **Request Headers** | `Authorization: Bearer <jwt>` |
| **Request Parameters** | Path: `fileId`; `?cursor=`, `?limit=` |
| **Request Body** | None |
| **Response Body** | `{ "data": [ { "action", "actorUserId", "actorName", "ipAddress", "createdAt" } ], "meta": { "pagination" } }` |
| **Validation Rules** | `limit`: max 200 |
| **Business Rules** | Aggregates every `audit_log` row where `entityType = 'file_asset'` and `entityId = fileId` into one chronological view |
| **Error Responses** | `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 FILE_NOT_FOUND` |
| **HTTP Status Codes** | `200`, `401`, `403`, `404` |
| **Rate Limiting** | Standard per-user read-endpoint throttle |
| **Idempotency** | Not applicable |
| **Related Database Entities** | `audit_log`, `file_asset` |
| **Related Functional Module** | `ARCHITECTURE.md` §11.5 Audit Logging |
| **Related AI Agent** | None |
| **Audit Requirements** | Not separately audited (read-only over the audit trail itself) |
| **Security Considerations** | None beyond standard RBAC |

---

*(End of Section 11.)*


